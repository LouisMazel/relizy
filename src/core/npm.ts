import type { PackageBase, PackageManager, RegistryTarget } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execPromise, logger } from '@maz-ui/node'
import { formatJson } from '@maz-ui/utils/helpers/formatJson'
import { isInCI } from './ci-env'
import { isRelizyCancelError } from './errors'
import { buildLegacyRegistryTarget, isYarnBerry, normalizeRegistryKey, resolveRegistryTargetsForPackage, withRegistryNpmrc } from './npm-registry'
import { isVersionAlreadyPublishedError, isVersionPublished } from './npm-versions'
import { askText, assertInteractivePrompt } from './prompts'
import { getIndependentTag } from './tags'
import { isPrerelease } from './version'

// Store OTP per registry for the session to avoid re-prompting for each package
const sessionOtpByRegistry = new Map<string, string>()

/**
 * The dist-tag of a version: the configured one, else `next` for a
 * prerelease and `latest` otherwise
 */
export function getPublishTag(version: string, configTag?: string): string {
  return configTag || (isPrerelease(version)
    ? 'next'
    : 'latest')
}

export function determinePublishTag(version: string, configTag?: string): string {
  const tag = getPublishTag(version, configTag)

  if (isPrerelease(version) && !configTag) {
    logger.warn('You are about to publish a "prerelease" version with the "latest" tag. To avoid mistake, the tag is set to "next"')
  }

  if (isPrerelease(version) && configTag === 'latest') {
    logger.warn('Please note, you are about to publish a "prerelease" version with the "latest" tag.')
  }

  return tag
}

function getCommandArgs<T extends 'auth' | 'publish'>({
  packageManager,
  tag,
  registryTarget,
  otp,
  type,
  dryRun,
  cwd,
  extraArgs = [],
}: {
  packageManager: PackageManager
  tag: T extends 'publish' ? string : undefined
  registryTarget: RegistryTarget
  otp?: string
  type: T
  dryRun?: boolean
  /**
   * Root of the project, where `.yarnrc.yml` tells Yarn Berry
   */
  cwd: string
  /**
   * Arguments of `publish.args`, added to the publish command
   */
  extraArgs?: string[]
}) {
  const args = type === 'publish'
    ? ['publish', '--tag', tag]
    : ['whoami']

  const registry = registryTarget.registry
  if (registry) {
    args.push('--registry', registry)
  }

  // The auth token and scope registry are injected via `.npmrc`
  // (see withRegistryNpmrc), never as CLI flags: the pnpm 10+ parser rejects
  // rc-option flags such as `--//host:_authToken=` and `--@scope:registry=`.

  // Priority: dynamic OTP > session OTP for this registry > target OTP
  const finalOtp = otp ?? sessionOtpByRegistry.get(normalizeRegistryKey(registry)) ?? registryTarget.otp
  if (finalOtp) {
    args.push('--otp', finalOtp)
  }

  if (type === 'auth') {
    return args
  }

  const access = registryTarget.access
  if (access) {
    args.push('--access', access)
  }

  // Adjust for package managers
  if (packageManager === 'pnpm') {
    args.push('--no-git-checks')
  }
  else if (packageManager === 'yarn') {
    args.push('--non-interactive')
    // Yarn Berry only
    if (isYarnBerry(cwd))
      args.push('--no-git-checks')
  }
  else if (packageManager === 'npm') {
    args.push('--yes')
  }

  args.push(...extraArgs)

  if (dryRun) {
    args.push('--dry-run')
  }

  return args
}

function isOtpError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null)
    return false

  // Check in error.message
  const errorMessage = 'message' in error && typeof error.message === 'string'
    ? error.message.toLowerCase()
    : ''

  // Also check in the full error string (includes stderr output)
  const fullErrorString = String(error).toLowerCase()

  // Combine both sources
  const searchText = `${errorMessage} ${fullErrorString}`

  const otpPatterns = [
    'otp',
    'one-time password',
    'eotp',
    'two-factor authentication',
    '2fa',
    'two factor',
  ]

  return otpPatterns.some(pattern => searchText.includes(pattern))
}

function promptOtpWithTimeout(timeout: number = 90000): Promise<string> {
  const message = 'This operation requires a one-time password (OTP). Please enter your OTP:'

  try {
    assertInteractivePrompt({ message, whenNotInteractive: 'pass the one-time password with --otp' })
  }
  catch (error) {
    return Promise.reject(error)
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('OTP input timeout'))
    }, timeout)

    askText({ message })
      .then((otp) => {
        clearTimeout(timer)
        resolve(otp)
      })
      .catch((error) => {
        clearTimeout(timer)
        // Not a cancelled run: packages may already be published, the publish fails
        reject(isRelizyCancelError(error)
          ? new Error('OTP input cancelled', { cause: error })
          : error)
      })
  })
}

/**
 * The registry refused a restricted publish: a scoped package is `restricted`
 * by default on npmjs.com, and private packages need a paid plan (E402)
 */
function isPaymentRequiredError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null)
    return false

  const errorMessage = 'message' in error && typeof error.message === 'string'
    ? error.message.toLowerCase()
    : ''
  const searchText = `${errorMessage} ${String(error).toLowerCase()}`

  return ['e402', '402 payment required', 'sign up for private packages'].some(pattern => searchText.includes(pattern))
}

/**
 * The error a failed publish throws: an actionable one when the registry
 * refused a restricted scoped package, else the original one (logged)
 */
function getPublishFailure({
  error,
  pkg,
  registryTarget,
  packageNameAndVersion,
  registryLabel,
}: {
  error: unknown
  pkg: PackageBase
  registryTarget: RegistryTarget
  packageNameAndVersion: string
  registryLabel: string
}): unknown {
  if (isPaymentRequiredError(error) && pkg.name.startsWith('@') && registryTarget.access !== 'public') {
    return new Error(
      `Failed to publish ${packageNameAndVersion}${registryLabel}: the registry requires a paid plan to publish a private package (402 Payment Required). `
      + 'A scoped package is published as restricted unless told otherwise. '
      + 'To publish it publicly, set `publish.access: \'public\'` in your relizy config or `"publishConfig": { "access": "public" }` in its package.json.',
      { cause: error },
    )
  }

  logger.error(`Failed to publish ${packageNameAndVersion}:`, error)
  return error
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
    logger.fail('Failed to get OTP')
    throw promptError
  }
}

async function executePublishCommand({
  command,
  packageNameAndVersion,
  pkg,
  config,
  tag,
  dryRun,
  packageManager,
  registryLabel,
}: {
  command: string
  packageNameAndVersion: string
  pkg: PackageBase
  config: ResolvedRelizyConfig
  tag: string
  dryRun: boolean
  packageManager: PackageManager
  registryLabel: string
}): Promise<void> {
  logger.info(`${dryRun ? '[dry-run] ' : ''}Publishing ${packageNameAndVersion} with tag "${tag}"${registryLabel}`)

  const dryRunPublish = dryRun && packageManager !== 'npm' && packageManager !== 'pnpm'

  if (dryRunPublish) {
    logger.info(`${dryRun ? '[dry-run] ' : ''}Skipping actual publish for ${packageNameAndVersion}`)
    return
  }

  // execPromise already logs stdout/stderr in debug with secrets masked.
  await execPromise(command, {
    noStderr: true,
    noStdout: true,
    noSuccess: true,
    noError: true,
    logLevel: config.logLevel,
    cwd: pkg.path,
  })
}

export function getAuthCommand({
  packageManager,
  config,
  otp,
  registryTarget,
}: {
  packageManager: PackageManager
  config: ResolvedRelizyConfig
  otp?: string
  registryTarget?: RegistryTarget
}): string {
  const args = getCommandArgs<'auth'>({
    packageManager,
    tag: undefined,
    registryTarget: registryTarget ?? buildLegacyRegistryTarget(config),
    otp,
    type: 'auth',
    cwd: config.cwd,
  })

  return `${packageManager} ${args.join(' ')}`
}

function getPublishCommand({
  packageManager,
  tag,
  registryTarget,
  otp,
  dryRun,
  cwd,
  extraArgs,
}: {
  packageManager: PackageManager
  tag: string
  registryTarget: RegistryTarget
  otp?: string
  dryRun: boolean
  cwd: string
  extraArgs?: string[]
}): string {
  const args = getCommandArgs<'publish'>({
    packageManager,
    tag,
    registryTarget,
    otp,
    dryRun,
    type: 'publish',
    cwd,
    extraArgs,
  })

  const baseCommand = packageManager === 'yarn' && isYarnBerry(cwd)
    ? 'yarn npm'
    : packageManager

  return `${baseCommand} ${args.join(' ')}`
}

/**
 * Publish a package to a single resolved registry target, retrying once with
 * a prompted OTP if the registry requires one.
 */
async function publishToRegistryTarget({
  pkg,
  config,
  packageManager,
  dryRun,
  registryTarget,
  packageNameAndVersion,
  registryLabel,
}: {
  pkg: PackageBase
  config: ResolvedRelizyConfig
  packageManager: PackageManager
  dryRun: boolean
  registryTarget: RegistryTarget
  packageNameAndVersion: string
  registryLabel: string
}): Promise<void> {
  // A registry-specific `tag` wins; otherwise fall back to the global
  // `publish.tag` (also set by `--tag`, and by canary mode to `canary`) so the
  // resolved tag is consistent across every target, not just the default one.
  const tag = determinePublishTag(pkg.newVersion || pkg.version, registryTarget.tag ?? config.publish.tag)

  // Primary idempotency check: when skipping existing versions is requested,
  // ask the registry up front whether this version is already published and
  // skip the publish entirely if so. Only runs when the option is enabled (no
  // needless round-trip otherwise) and never in dry-run. An inconclusive answer
  // (`null`) falls through to the publish attempt, where the error-matching net
  // still catches an already-published version (and races).
  if (config.publish.skipExistingVersions && !dryRun) {
    const version = pkg.newVersion || pkg.version
    const alreadyPublished = await isVersionPublished({
      pkg,
      version,
      config,
      packageManager,
      registryTarget,
    })
    if (alreadyPublished) {
      logger.warn(`Skipping ${packageNameAndVersion}${registryLabel}: version already exists on the registry (publish.skipExistingVersions enabled)`)
      return
    }
  }

  let dynamicOtp: string | undefined
  const maxAttempts = 2

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const command = getPublishCommand({
        packageManager,
        tag,
        registryTarget,
        otp: dynamicOtp,
        dryRun,
        cwd: config.cwd,
        extraArgs: config.publish.args,
      })

      process.chdir(pkg.path)

      // Inject this target's auth token and scope registry into `.npmrc` for
      // the duration of the publish (restored afterwards), so scoped packages
      // reach this exact registry and authentication works on every package
      // manager and version - no CLI rc-option flags involved.
      await withRegistryNpmrc({
        config,
        registryTarget,
        packageName: pkg.name,
        packageManager,
        fn: () => executePublishCommand({
          command,
          packageNameAndVersion,
          packageManager,
          pkg,
          config,
          dryRun,
          tag,
          registryLabel,
        }),
      })

      // Success - store OTP for this registry for next packages if it was prompted
      const registryKey = normalizeRegistryKey(registryTarget.registry)
      if (dynamicOtp && !sessionOtpByRegistry.has(registryKey)) {
        sessionOtpByRegistry.set(registryKey, dynamicOtp)
        logger.debug('OTP stored for session')
      }

      return
    }
    catch (error) {
      // Check if it's an OTP error and we haven't exhausted retries
      if (isOtpError(error) && attempt < maxAttempts - 1) {
        dynamicOtp = await handleOtpError()
      }
      // The version is already on the registry (immutable asset). This makes a
      // retry safe - the artifact exists, so there is nothing left to publish.
      else if (isVersionAlreadyPublishedError(error)) {
        if (config.publish.skipExistingVersions) {
          logger.warn(`Skipping ${packageNameAndVersion}${registryLabel}: version already exists on the registry (publish.skipExistingVersions enabled)`)
          return
        }

        throw new Error(
          `Version ${packageNameAndVersion} already exists on the registry${registryLabel} and cannot be overwritten. `
          + 'This usually happens when re-running a release on the same commit (e.g. a canary rerun), '
          + 'or after a release that published this version but failed to push its release commit (merge its tag into your branch to recover). '
          + 'Enable publish.skipExistingVersions (or pass --skip-existing-versions) to skip already-published versions instead of failing.',
          { cause: error },
        )
      }
      else {
        throw getPublishFailure({
          error,
          pkg,
          registryTarget,
          packageNameAndVersion,
          registryLabel,
        })
      }
    }
    finally {
      process.chdir(config.cwd)
    }
  }
}

export async function publishPackage({
  pkg,
  config,
  packageManager,
  dryRun,
}: {
  pkg: PackageBase
  config: ResolvedRelizyConfig
  packageManager: PackageManager
  dryRun: boolean
}): Promise<void> {
  const packageNameAndVersion = getIndependentTag({ name: pkg.name, version: pkg.newVersion || pkg.version })
  const registryTargets = resolveRegistryTargetsForPackage(pkg, config)

  logger.debug(`Building publish command for ${pkg.name}`)

  // In dry-run mode, npm/pnpm publish reads the version directly from package.json on disk.
  // Since bump --dry-run does not write to disk, the on-disk version is still the previously
  // published one, and `publish --dry-run` fails with "You cannot publish over the previously
  // published versions". To validate against the real new version, write it temporarily and
  // restore the original after the publish attempt (always, even on failure).
  const needsTempVersionWrite = dryRun
    && (packageManager === 'npm' || packageManager === 'pnpm')
    && !!pkg.newVersion
    && pkg.newVersion !== pkg.version

  const packageJsonPath = join(pkg.path, 'package.json')
  // Restored byte for byte, with the uncommitted changes of the file
  let originalContent: string | undefined
  if (needsTempVersionWrite) {
    originalContent = readFileSync(packageJsonPath, 'utf8')
    logger.debug(`[dry-run] Temporarily writing ${pkg.newVersion} to ${pkg.name} for publish --dry-run validation`)
    writeFileSync(packageJsonPath, `${formatJson({
      ...JSON.parse(originalContent),
      version: pkg.newVersion,
    })}\n`, 'utf8')
  }

  try {
    // Only label the registry in logs when there is more than one target -
    // keeps single-registry output identical to before this feature existed.
    const showRegistryLabel = registryTargets.length > 1

    for (const registryTarget of registryTargets) {
      const registryLabel = showRegistryLabel
        ? ` [${registryTarget.name ?? registryTarget.registry ?? 'default'}]`
        : ''

      await publishToRegistryTarget({
        pkg,
        config,
        packageManager,
        dryRun,
        registryTarget,
        packageNameAndVersion,
        registryLabel,
      })
    }
  }
  finally {
    if (originalContent !== undefined) {
      logger.debug(`[dry-run] Restoring ${pkg.name} version to ${pkg.version}`)
      writeFileSync(packageJsonPath, originalContent, 'utf8')
    }
  }
}
