import type { ResolvedRelizyConfig } from '../core'
import type { PackageInfo, PackageManager } from '../types'
import type { PackageWithDeps } from './dependencies'
import { existsSync, readFileSync } from 'node:fs'
import path, { join } from 'node:path'
import { input } from '@inquirer/prompts'
import { execPromise, logger } from '@maz-ui/node'
import { getPackageCommits, isInCI, isPrerelease } from '../core'
import { resolveTags } from './tags'

// Store OTP for the session to avoid re-prompting for each package
let sessionOtp: string | undefined

export function detectPackageManager(cwd: string = process.cwd()): PackageManager {
  try {
    const packageJsonPath = join(cwd, 'package.json')
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
        const pmField = packageJson.packageManager
        if (typeof pmField === 'string') {
          const pmName = pmField.split('@')[0]
          // eslint-disable-next-line max-depth
          if (['npm', 'pnpm', 'yarn', 'bun'].includes(pmName as string)) {
            logger.debug(`Detected package manager from package.json: ${pmName}`)
            return pmName as PackageManager
          }
        }
      }
      catch (e) {
        logger.warn(`Failed to parse package.json: ${(e as Error).message}`)
      }
    }

    const lockFiles: Record<PackageManager, string> = {
      pnpm: 'pnpm-lock.yaml',
      yarn: 'yarn.lock',
      npm: 'package-lock.json',
      bun: 'bun.lockb',
    }

    for (const [manager, file] of Object.entries(lockFiles)) {
      if (existsSync(join(cwd, file))) {
        logger.debug(`Detected package manager from lockfile: ${manager}`)
        return manager as PackageManager
      }
    }

    const ua = process.env.npm_config_user_agent
    if (ua) {
      const match = /(pnpm|yarn|npm|bun)/.exec(ua)
      if (match) {
        logger.debug(`Detected package manager from user agent: ${match[1]}`)
        return match[1] as PackageManager
      }
    }

    logger.debug('No package manager detected, defaulting to npm')
    return 'npm'
  }
  catch (error) {
    logger.warn(`Error detecting package manager: ${error}, defaulting to npm`)
    return 'npm'
  }
}

export function determinePublishTag(version: string | undefined, configTag?: string): string {
  let tag: string = 'latest'

  if (configTag) {
    tag = configTag
  }

  if (isPrerelease(version) && !configTag) {
    logger.warn('You are about to publish a "prerelease" version with the "latest" tag. To avoid mistake, the tag is set to "next"')
    tag = 'next'
  }

  if (isPrerelease(version) && configTag === 'latest') {
    logger.warn('Please note, you are about to publish a "prerelease" version with the "latest" tag.')
  }

  return tag
}

export function getPackagesToPublishInSelectiveMode(
  sortedPackages: PackageWithDeps[],
  rootVersion: string | undefined,
): PackageInfo[] {
  const packagesToPublish: PackageInfo[] = []

  for (const pkg of sortedPackages) {
    const pkgJsonPath = join(pkg.path, 'package.json')
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))

    if (pkgJson.version === rootVersion) {
      packagesToPublish.push(pkg)
    }
  }

  return packagesToPublish
}

export async function getPackagesToPublishInIndependentMode(
  sortedPackages: PackageWithDeps[],
  config: ResolvedRelizyConfig,
): Promise<PackageInfo[]> {
  const packagesToPublish: PackageInfo[] = []

  for (const pkg of sortedPackages) {
    const { from, to } = await resolveTags<'independent', 'publish'>({
      config,
      versionMode: 'independent',
      step: 'publish',
      pkg,
      newVersion: pkg.version,
      currentVersion: undefined,
      logLevel: config.logLevel,
    })

    const commits = await getPackageCommits({
      pkg,
      from,
      to,
      config,
      changelog: false,
    })

    if (commits.length > 0) {
      packagesToPublish.push(pkg)
      logger.debug(`${pkg.name}: ${commits.length} commit(s) since ${from} → ${to}`)
    }
  }

  return packagesToPublish
}

function isYarnBerry() {
  return existsSync(path.join(process.cwd(), '.yarnrc.yml'))
}

function getCommandArgs({
  packageManager,
  tag,
  config,
  otp,
}: {
  packageManager: PackageManager
  tag: string
  config: ResolvedRelizyConfig
  otp?: string
}) {
  const args = ['publish', '--tag', tag]

  // Adjust for package managers
  if (packageManager === 'pnpm') {
    args.push('--no-git-checks')
  }
  else if (packageManager === 'yarn') {
    args.push('--non-interactive')
    // Yarn Berry only
    if (isYarnBerry())
      args.push('--no-git-checks')
  }
  else if (packageManager === 'npm') {
    args.push('--yes')
  }

  const registry = config.publish.registry
  if (registry) {
    args.push('--registry', registry)
  }

  const access = config.publish.access
  if (access) {
    args.push('--access', access)
  }

  // Priority: dynamic OTP > session OTP > config OTP
  const finalOtp = otp ?? sessionOtp ?? config.publish.otp
  if (finalOtp) {
    args.push('--otp', finalOtp)
  }

  return args
}

function isOtpError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null)
    return false

  const errorMessage = 'message' in error && typeof error.message === 'string'
    ? error.message.toLowerCase()
    : ''

  return errorMessage.includes('otp') || errorMessage.includes('one-time password') || errorMessage.includes('eotp')
}

function promptOtpWithTimeout(timeout: number = 90000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('OTP input timeout'))
    }, timeout)

    input({
      message: 'This operation requires a one-time password (OTP). Please enter your OTP:',
    })
      .then((otp) => {
        clearTimeout(timer)
        resolve(otp)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

async function handleOtpError(): Promise<string> {
  if (isInCI()) {
    logger.error('OTP required but running in CI environment. Please provide OTP via config or `--otp` flag')
    throw new Error('OTP required in CI environment')
  }

  logger.warn('Publish failed: OTP required')

  try {
    const otp = await promptOtpWithTimeout()
    logger.debug('OTP received, retrying publish...')
    return otp
  }
  catch (promptError) {
    logger.error('Failed to get OTP:', promptError)
    throw promptError
  }
}

async function executePublishCommand({
  command,
  packageNameAndVersion,
  pkg,
  config,
  dryRun,
}: {
  command: string
  packageNameAndVersion: string
  pkg: PackageInfo
  config: ResolvedRelizyConfig
  dryRun: boolean
}): Promise<void> {
  logger.debug(`Executing publish command (${command}) in ${pkg.path}`)

  if (dryRun) {
    logger.info(`[dry-run] ${packageNameAndVersion}: Run ${command}`)
    return
  }

  const { stdout } = await execPromise(command, {
    noStderr: true,
    noStdout: true,
    logLevel: config.logLevel,
    cwd: pkg.path,
  })

  if (stdout) {
    logger.debug(stdout)
  }

  logger.info(`Published ${packageNameAndVersion}`)
}

export async function publishPackage({
  pkg,
  config,
  packageManager,
  dryRun,
}: {
  pkg: PackageInfo
  config: ResolvedRelizyConfig
  packageManager: PackageManager
  dryRun: boolean
}): Promise<void> {
  const tag = determinePublishTag(pkg.version, config.publish.tag)
  const packageNameAndVersion = `${pkg.name}@${pkg.version}`
  const baseCommand = packageManager === 'yarn' && isYarnBerry() ? 'yarn npm' : packageManager

  logger.debug(`Building publish command for ${pkg.name}`)

  let dynamicOtp: string | undefined
  const maxAttempts = 2

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const args = getCommandArgs({
        packageManager,
        tag,
        config,
        otp: dynamicOtp,
      })

      const command = `${baseCommand} ${args.join(' ')}`

      logger.debug(`Publishing ${packageNameAndVersion} with tag '${tag}' with command: ${command}`)

      process.chdir(pkg.path)

      await executePublishCommand({
        command,
        packageNameAndVersion,
        pkg,
        config,
        dryRun,
      })

      // Success - store OTP for next packages if it was prompted
      if (dynamicOtp && !sessionOtp) {
        sessionOtp = dynamicOtp
        logger.debug('OTP stored for session')
      }

      return
    }
    catch (error) {
      // Check if it's an OTP error and we haven't exhausted retries
      if (isOtpError(error) && attempt < maxAttempts - 1) {
        dynamicOtp = await handleOtpError()
      }
      else {
        logger.error(`Failed to publish ${packageNameAndVersion}:`, error)
        throw error
      }
    }
    finally {
      process.chdir(config.cwd)
    }
  }
}
