import type { ExecLogLevel } from './npm-versions'
import type { WebAuthHandler } from './staged'
import type { CoreLogger, PackageManager, ReadPackage, RegistryTarget } from './types'
import { exec } from 'node:child_process'
import process from 'node:process'
import { execPromise } from '@maz-ui/node'
import { isYarnBerry } from './package-manager'
import { withRegistryNpmrc } from './registry'
import { StagingUnavailableError } from './stage-publish'
import { withWebAuth } from './staged'
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

/**
 * Quote a path for the shell running the command: double quotes on Windows,
 * single quotes elsewhere (no expansion of `$` nor backticks)
 */
export function quoteShellPath(path: string): string {
  return process.platform === 'win32'
    ? `"${path.replaceAll('"', '\\"')}"`
    : `'${path.replaceAll('\'', '\'\\\'\'')}'`
}

/**
 * The arguments of a staged publish (`stage publish`) or of a tarball upload
 * with npm. Staging never passes `--otp`: `npm stage publish` bypasses the
 * one-time password, the approval asks for the 2FA.
 */
function getStageOrUploadArgs({
  packageManager,
  tag,
  registryTarget,
  otp,
  dryRun,
  extraArgs,
  staged,
  tarball,
}: {
  packageManager: PackageManager
  tag: string
  registryTarget: RegistryTarget
  otp?: string
  dryRun?: boolean
  extraArgs: string[]
  staged: boolean
  tarball?: string
}): string[] {
  const args = staged
    ? ['stage', 'publish']
    : ['publish']

  if (tarball) {
    args.push(quoteShellPath(tarball))
  }

  args.push('--tag', tag)

  if (registryTarget.registry) {
    args.push('--registry', registryTarget.registry)
  }

  const finalOtp = otp ?? registryTarget.otp
  if (!staged && finalOtp) {
    args.push('--otp', finalOtp)
  }

  if (registryTarget.access) {
    args.push('--access', registryTarget.access)
  }

  if (!staged && !tarball) {
    throw new Error(`Unreachable: ${packageManager} publish without stage nor tarball`)
  }

  if (packageManager === 'pnpm' && !tarball) {
    args.push('--no-git-checks')
  }
  else if (!staged) {
    // A direct upload of a tarball with npm
    args.push('--yes')
  }

  args.push('--json', ...extraArgs)

  if (dryRun) {
    args.push('--dry-run')
  }

  return args
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
  staged = false,
  tarball,
}: {
  packageManager: PackageManager
  tag: T extends 'publish' ? string : undefined
  registryTarget: RegistryTarget
  otp?: string
  type: T
  dryRun?: boolean
  cwd: string
  extraArgs?: string[]
  /** `<pm> stage publish` instead of `<pm> publish` (npm, pnpm) */
  staged?: boolean
  /** Path of a tarball to upload with npm, quoted */
  tarball?: string
}) {
  if (type === 'publish' && (staged || tarball)) {
    return getStageOrUploadArgs({
      packageManager,
      tag: tag as string,
      registryTarget,
      otp,
      dryRun,
      extraArgs,
      staged,
      tarball,
    })
  }

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
 * @param options.staged - Stage the version instead of publishing it (`false` by default): `npm stage publish` or `pnpm stage publish`, with `--json` and never `--otp`. Other package managers throw `StagingUnavailableError`, they stage through `packAndUpload`.
 * @param options.tarball - Upload this tarball with npm instead (`npm [stage] publish '<tarball>' ... --json`), the command of `packAndUpload`.
 * @returns The command line. The token is not in it, `withRegistryNpmrc` injects it. Without `staged` nor `tarball`, the command is the one of earlier versions.
 * @example
 * ```ts
 * getPublishCommand({ packageManager: 'npm', tag: 'latest', registryTarget: { registry: 'https://registry.npmjs.org/' }, dryRun: false, cwd: '/repo', staged: true })
 * // 'npm stage publish --tag latest --registry https://registry.npmjs.org/ --json'
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
  staged = false,
  tarball,
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
  /** Stage the version (`npm stage publish`, `pnpm stage publish`) instead of publishing it, `false` by default */
  staged?: boolean
  /** Upload this tarball with npm (`npm [stage] publish <tarball>`) instead of publishing the directory */
  tarball?: string
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
    staged,
    tarball,
  })

  if (tarball) {
    return `npm ${args.join(' ')}`
  }

  if (staged && packageManager !== 'npm' && packageManager !== 'pnpm') {
    throw new StagingUnavailableError(`${packageManager} cannot stage a version by itself: pack the package and upload it with npm (packAndUpload)`)
  }

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

/** The options of `publishToRegistry` and `publishToRegistryWithResult` */
export interface PublishToRegistryOptions {
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
  /**
   * Shows the web 2FA page of npm (security key, passkey) when the registry
   * asks a one-time password: the publish goes on once validated. Without it,
   * the error of the command is thrown (see `isOtpError`)
   */
  onWebAuth?: WebAuthHandler
}

/**
 * Runs a shell command as `execPromise` does, keeping its stdout on a failure:
 * the `--json` error of npm holds its web 2FA links there
 */
function execKeepingOutput(command: string, cwd: string): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, {
          stdout: String(stdout),
          stderr: String(stderr),
        }))
        return
      }
      resolve({
        stdout: String(stdout),
      })
    })
  })
}

/**
 * Runs an npm publish command, and when npm asks a one-time password: runs it
 * again with `--json` (npm then gives its web 2FA links, nothing is published),
 * shows the page with `onWebAuth`, and publishes with the token npm gives once
 * validated. Without `onWebAuth`, the first error is thrown
 */
export function runNpmPublishWithWebAuth<T extends { stdout: string }>({ run, build, cwd, onWebAuth }: {
  /** Runs the command */
  run: (command: string) => Promise<T>
  /** The command, with `otp` or `--json` */
  build: (extra: { otp?: string, json?: boolean }) => string
  cwd: string
  onWebAuth?: WebAuthHandler
}): Promise<T | { stdout: string }> {
  if (!onWebAuth) {
    return run(build({}))
  }

  return withWebAuth<T | { stdout: string }>(async (token) => {
    if (token) {
      return run(build({ otp: token }))
    }
    try {
      return await run(build({}))
    }
    catch (error) {
      if (!isOtpError(error)) {
        throw error
      }
      // EOTP: nothing was published, the JSON error holds the links (or it publishes, when the 2FA is no longer asked)
      return execKeepingOutput(build({ json: true }), cwd)
    }
  }, { onWebAuth, purpose: 'publish' })
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
 * @param options.onWebAuth - Shows the web 2FA page of npm when the registry asks a one-time password (npm only: the other package managers throw the error, see `isOtpError`).
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
export async function publishToRegistry(options: PublishToRegistryOptions): Promise<void> {
  await publishToRegistryWithResult(options)
}

/**
 * `publishToRegistry`, returning the output of the command, and able to stage
 * the version with npm or pnpm (`staged`): the stage id is in the output, see
 * `parseStageOutput`. Yarn and bun stage through `packAndUpload`.
 *
 * @param options - The options of `publishToRegistry`, plus `staged`.
 * @param options.pkg - Name and directory of the package.
 * @param options.cwd - Root of the project, where its `.npmrc` is.
 * @param options.packageManager - Package manager that runs the publish.
 * @param options.registryTarget - Registry to publish to, with its optional token.
 * @param options.tag - Dist-tag to publish to.
 * @param options.otp - One-time password, else the one of the registry target (never passed when staging).
 * @param options.extraArgs - Arguments added to the publish command.
 * @param options.dryRun - Passes `--dry-run` to npm and pnpm, skips the command for yarn and bun.
 * @param options.packageNameAndVersion - `name@version`, to name the package in the logs.
 * @param options.registryLabel - Appended to the log line, to name the registry when there are several (empty by default).
 * @param options.logLevel - Log level of the commands run.
 * @param options.logger - Receives the progress messages.
 * @param options.onWebAuth - Shows the web 2FA page of npm when the registry asks a one-time password (npm only: the other package managers throw the error, see `isOtpError`).
 * @param options.staged - Stage the version (`npm stage publish`, `pnpm stage publish`), `false` by default.
 * @returns `{ stdout }`, the output of the command (empty when a dry run skips it).
 * @throws The error of the command (see `isStageRequiredError`, `isVersionAlreadyStagedError`, `isOtpError`...), or `StagingUnavailableError` when `staged` is asked of yarn or bun.
 * @example
 * ```ts
 * const { stdout } = await publishToRegistryWithResult({ ...options, staged: true })
 * parseStageOutput(stdout).stageId
 * ```
 */
export async function publishToRegistryWithResult({
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
  staged = false,
  onWebAuth,
}: PublishToRegistryOptions & {
  /** Stage the version instead of publishing it */
  staged?: boolean
}): Promise<{ stdout: string }> {
  try {
    const build = ({ otp: token, json }: { otp?: string, json?: boolean }) => getPublishCommand({
      packageManager,
      tag,
      registryTarget,
      otp: token ?? otp,
      dryRun,
      cwd,
      extraArgs: json
        ? [
            ...extraArgs ?? [],
            '--json',
          ]
        : extraArgs,
      staged,
    })
    const command = build({})

    process.chdir(pkg.path)

    // Inject this target's auth token and scope registry into `.npmrc` for
    // the duration of the publish (restored afterwards), so scoped packages
    // reach this exact registry and authentication works on every package
    // manager and version - no CLI rc-option flags involved.
    return await withRegistryNpmrc({
      cwd,
      registryTarget,
      packageName: pkg.name,
      packageManager,
      logger,
      fn: () => {
        logger?.info?.(`${dryRun ? '[dry-run] ' : ''}${staged
          ? 'Staging'
          : 'Publishing'} ${packageNameAndVersion} with tag "${tag}"${registryLabel}`)

        const dryRunPublish = dryRun && packageManager !== 'npm' && packageManager !== 'pnpm'

        if (dryRunPublish) {
          logger?.info?.(`${dryRun ? '[dry-run] ' : ''}Skipping actual publish for ${packageNameAndVersion}`)
          return Promise.resolve({ stdout: '' })
        }

        // execPromise already logs stdout/stderr in debug with secrets masked.
        const run = async (line: string) => ({
          stdout: (await execPromise(line, {
            noStderr: true,
            noStdout: true,
            noSuccess: true,
            noError: true,
            logLevel,
            cwd: pkg.path,
          }))?.stdout ?? '',
        })

        // Only npm gives its web 2FA links without a terminal: the other package managers fall back below
        if (packageManager !== 'npm' || staged || dryRun) {
          return run(command)
        }
        return runNpmPublishWithWebAuth({ run, build, cwd: pkg.path, onWebAuth })
      },
    })
  }
  finally {
    process.chdir(cwd)
  }
}
