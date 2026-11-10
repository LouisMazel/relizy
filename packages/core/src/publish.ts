import type { ExecLogLevel } from './npm-versions'
import type { CoreLogger, PackageManager, ReadPackage, RegistryTarget } from './types'
import process from 'node:process'
import { execPromise } from '@maz-ui/node'
import { isYarnBerry } from './package-manager'
import { withRegistryNpmrc } from './registry'
import { isPrerelease } from './version'

/**
 * The dist-tag of a version: the given one, else `next` for a prerelease and
 * `latest` otherwise
 *
 * @param version - Version to publish.
 * @param configTag - Dist-tag set by the user, wins when not empty.
 * @returns The dist-tag.
 * @example
 * ```ts
 * getPublishTag('1.0.0') // 'latest'
 * getPublishTag('1.0.0-beta.1') // 'next'
 * getPublishTag('1.0.0', 'stable') // 'stable'
 * ```
 */
export function getPublishTag(version: string, configTag?: string): string {
  return configTag || (isPrerelease(version)
    ? 'next'
    : 'latest')
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
  cwd: string
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

  // Priority: given OTP > target OTP
  const finalOtp = otp ?? registryTarget.otp
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

/**
 * The command that checks the user is logged in to a registry (`whoami`) with
 * the package manager
 *
 * @param options - Package manager and registry.
 * @param options.packageManager - Package manager that runs the command.
 * @param options.cwd - Root of the project, where `.yarnrc.yml` tells Yarn Berry.
 * @param options.otp - One-time password, else the one of the registry target.
 * @param options.registryTarget - Registry to check, passed as `--registry` when it has a URL.
 * @returns The command line. The token is not in it, `withRegistryNpmrc` injects it.
 * @example
 * ```ts
 * getAuthCommand({ packageManager: 'npm', cwd: '/repo', registryTarget: { registry: 'https://registry.npmjs.org/' } })
 * // 'npm whoami --registry https://registry.npmjs.org/'
 * ```
 */
export function getAuthCommand({
  packageManager,
  cwd,
  otp,
  registryTarget,
}: {
  packageManager: PackageManager
  /** Root of the project, where `.yarnrc.yml` tells Yarn Berry */
  cwd: string
  /** One-time password, else the one of the registry target */
  otp?: string
  registryTarget: RegistryTarget
}): string {
  const args = getCommandArgs<'auth'>({
    packageManager,
    tag: undefined,
    registryTarget,
    otp,
    type: 'auth',
    cwd,
  })

  return `${packageManager} ${args.join(' ')}`
}

/**
 * The command that publishes a package to a registry with the package manager
 *
 * @param options - Package manager, dist-tag and registry.
 * @param options.packageManager - Package manager that runs the command. Adds `--no-git-checks` for pnpm, `--non-interactive` for yarn (and `--no-git-checks` for Yarn Berry, which runs `yarn npm publish`), `--yes` for npm.
 * @param options.tag - Dist-tag to publish to.
 * @param options.registryTarget - Registry to publish to: `--registry` and `--access` come from it.
 * @param options.otp - One-time password, else the one of the registry target.
 * @param options.dryRun - Appends `--dry-run`.
 * @param options.cwd - Root of the project, where `.yarnrc.yml` tells Yarn Berry.
 * @param options.extraArgs - Arguments added to the publish command.
 * @returns The command line. The token is not in it, `withRegistryNpmrc` injects it.
 * @example
 * ```ts
 * getPublishCommand({
 *   packageManager: 'npm',
 *   tag: 'latest',
 *   registryTarget: { registry: 'https://registry.npmjs.org/', access: 'public' },
 *   dryRun: false,
 *   cwd: '/repo',
 * })
 * // 'npm publish --tag latest --registry https://registry.npmjs.org/ --access public --yes'
 * ```
 */
export function getPublishCommand({
  packageManager,
  tag,
  registryTarget,
  otp,
  dryRun,
  cwd,
  extraArgs,
}: {
  packageManager: PackageManager
  /** Dist-tag to publish to */
  tag: string
  registryTarget: RegistryTarget
  /** One-time password, else the one of the registry target */
  otp?: string
  dryRun: boolean
  /** Root of the project, where `.yarnrc.yml` tells Yarn Berry */
  cwd: string
  /** Arguments added to the publish command */
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

function getErrorText(error: unknown): string {
  // Also in the full error string (includes stderr output)
  const errorMessage = typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
    ? error.message.toLowerCase()
    : ''

  return `${errorMessage} ${String(error).toLowerCase()}`
}

/**
 * True when a failed publish asks for a one-time password (npm 2FA)
 *
 * @param error - The error thrown by the publish command (any value).
 * @returns `true` when the message or the string form of the error contains an OTP or 2FA phrase (case-insensitive), `false` otherwise.
 */
export function isOtpError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null)
    return false

  const searchText = getErrorText(error)

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

/**
 * True when the registry refused a restricted publish: a scoped package is
 * `restricted` by default on npmjs.com, and private packages need a paid plan
 * (E402)
 *
 * @param error - The error thrown by the publish command (any value).
 * @returns `true` when the message or the string form of the error contains `E402` or a payment phrase (case-insensitive), `false` otherwise.
 */
export function isPaymentRequiredError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null)
    return false

  const searchText = getErrorText(error)

  return ['e402', '402 payment required', 'sign up for private packages'].some(pattern => searchText.includes(pattern))
}

/**
 * Publish a package to a registry with the package manager, once: the token
 * and the scope registry of the registry target are written to the `.npmrc` of
 * the project for the duration of the publish (restored afterwards), and the
 * working directory is the one of the package. With `dryRun`, yarn and bun do
 * not publish. A failed publish throws the error of the command.
 *
 * The process working directory is changed to the package for the publish and
 * set back to `cwd` afterwards, even on failure.
 *
 * @param options - Package, registry and publish settings.
 * @param options.pkg - Name and directory of the package.
 * @param options.cwd - Root of the project, where its `.npmrc` is.
 * @param options.packageManager - Package manager that runs the publish.
 * @param options.registryTarget - Registry to publish to, with its optional token.
 * @param options.tag - Dist-tag to publish to.
 * @param options.otp - One-time password, else the one of the registry target.
 * @param options.extraArgs - Arguments added to the publish command.
 * @param options.dryRun - Passes `--dry-run` to npm and pnpm, skips the command for yarn and bun.
 * @param options.packageNameAndVersion - `name@version`, to name the package in the logs.
 * @param options.registryLabel - Appended to the log line, to name the registry when there are several (empty by default).
 * @param options.logLevel - Log level of the commands run.
 * @param options.logger - Receives the progress messages.
 * @returns Resolves when the publish command succeeds (or is skipped by a dry run).
 * @throws The error of the publish command, see `isOtpError`, `isPaymentRequiredError` and `isVersionAlreadyPublishedError` to classify it.
 * @example
 * ```ts
 * await publishToRegistry({
 *   pkg: { name: 'my-lib', path: '/repo/packages/my-lib' },
 *   cwd: '/repo',
 *   packageManager: 'pnpm',
 *   registryTarget: { registry: 'https://registry.npmjs.org/', token: process.env.NPM_TOKEN },
 *   tag: 'latest',
 *   dryRun: false,
 *   packageNameAndVersion: 'my-lib@1.2.0',
 * })
 * ```
 */
export async function publishToRegistry({
  pkg,
  cwd,
  packageManager,
  registryTarget,
  tag,
  otp,
  extraArgs,
  dryRun,
  packageNameAndVersion,
  registryLabel = '',
  logLevel,
  logger,
}: {
  /** The package: its name and its directory */
  pkg: Pick<ReadPackage, 'name' | 'path'>
  /** Root of the project, where its `.npmrc` is */
  cwd: string
  packageManager: PackageManager
  registryTarget: RegistryTarget
  /** Dist-tag to publish to */
  tag: string
  /** One-time password, else the one of the registry target */
  otp?: string
  /** Arguments added to the publish command */
  extraArgs?: string[]
  dryRun: boolean
  /** `name@version`, to name the package in the logs */
  packageNameAndVersion: string
  /** Names the registry in the logs, when there are several */
  registryLabel?: string
  /** Log level of the commands run */
  logLevel?: ExecLogLevel
  logger?: CoreLogger
}): Promise<void> {
  try {
    const command = getPublishCommand({
      packageManager,
      tag,
      registryTarget,
      otp,
      dryRun,
      cwd,
      extraArgs,
    })

    process.chdir(pkg.path)

    // Inject this target's auth token and scope registry into `.npmrc` for
    // the duration of the publish (restored afterwards), so scoped packages
    // reach this exact registry and authentication works on every package
    // manager and version - no CLI rc-option flags involved.
    await withRegistryNpmrc({
      cwd,
      registryTarget,
      packageName: pkg.name,
      packageManager,
      logger,
      fn: async () => {
        logger?.info?.(`${dryRun ? '[dry-run] ' : ''}Publishing ${packageNameAndVersion} with tag "${tag}"${registryLabel}`)

        const dryRunPublish = dryRun && packageManager !== 'npm' && packageManager !== 'pnpm'

        if (dryRunPublish) {
          logger?.info?.(`${dryRun ? '[dry-run] ' : ''}Skipping actual publish for ${packageNameAndVersion}`)
          return
        }

        // execPromise already logs stdout/stderr in debug with secrets masked.
        await execPromise(command, {
          noStderr: true,
          noStdout: true,
          noSuccess: true,
          noError: true,
          logLevel,
          cwd: pkg.path,
        })
      },
    })
  }
  finally {
    process.chdir(cwd)
  }
}
