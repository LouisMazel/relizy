import type { PackageBase, PackageManager, RegistryTarget } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path, { join } from 'node:path'
import { input } from '@inquirer/prompts'
import { execPromise, logger } from '@maz-ui/node'
import micromatch from 'micromatch'
import { getIndependentTag, resolveTags } from './tags'
import { isInCI } from './utils'
import { isPrerelease, writeVersion } from './version'

const DEFAULT_REGISTRY = 'https://registry.npmjs.org/'

// Store OTP per registry for the session to avoid re-prompting for each package
const sessionOtpByRegistry = new Map<string, string>()

/**
 * Resolve the effective npm registry from the environment (`.npmrc` files, env
 * variables, npm/pnpm defaults) via `npm config get registry`. Falls back to the
 * public registry when npm is unavailable or returns nothing.
 *
 * Used when the user did not set `publish.registry`, so Relizy honors a custom
 * registry (e.g. a corporate proxy) configured in the user's `.npmrc` instead of
 * forcing the public registry.
 */
export function getNpmRegistry(cwd: string = process.cwd()): string {
  try {
    const output = execSync('npm config get registry', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()

    return output && output !== 'undefined' ? output : DEFAULT_REGISTRY
  }
  catch {
    return DEFAULT_REGISTRY
  }
}

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
        const errorString = e instanceof Error ? e.message : String(e)
        logger.debug(`Failed to parse package.json: ${errorString}`)
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
    logger.fail(`Error detecting package manager: ${error}, defaulting to npm`)
    return 'npm'
  }
}

export function determinePublishTag(version: string, configTag?: string): string {
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
  sortedPackages: PackageBase[],
  rootVersion: string | undefined,
): PackageBase[] {
  const packagesToPublish: PackageBase[] = []

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
  sortedPackages: PackageBase[],
  config: ResolvedRelizyConfig,
): Promise<PackageBase[]> {
  const packagesToPublish: PackageBase[] = []

  for (const pkg of sortedPackages) {
    const { from, to } = await resolveTags<'publish'>({
      config,
      step: 'publish',
      pkg,
      newVersion: pkg.newVersion || pkg.version,
    })

    if (pkg.commits.length > 0) {
      packagesToPublish.push(pkg)
      logger.debug(`${pkg.name}: ${pkg.commits.length} commit(s) since ${from} → ${to}`)
    }
  }

  return packagesToPublish
}

function isYarnBerry() {
  return existsSync(path.join(process.cwd(), '.yarnrc.yml'))
}

/**
 * Build the implicit registry target from the legacy single-registry config
 * fields (`publish.registry`/`token`/`tag`/`access`/`otp`). Publishing to this
 * target reproduces the exact pre-multi-registry behavior.
 */
function buildLegacyRegistryTarget(config: ResolvedRelizyConfig): RegistryTarget {
  return {
    name: 'default',
    registry: config.publish.registry ?? '',
    token: config.publish.token || config.tokens.registry,
    tag: config.publish.tag,
    access: config.publish.access,
    otp: config.publish.otp,
  }
}

/**
 * Normalize a registry URL for comparison purposes only (trims trailing
 * slashes), so `https://registry.npmjs.org` and `https://registry.npmjs.org/`
 * are recognized as the same registry when deduplicating targets. The
 * original, non-normalized URL is still what gets published to.
 */
function normalizeRegistryKey(registry: string): string {
  return registry.endsWith('/') ? registry.slice(0, -1) : registry
}

/**
 * Deduplicate registry targets by registry URL, keeping the first occurrence
 * (the legacy target takes priority over explicit `registries` entries).
 */
function dedupRegistryTargets(targets: RegistryTarget[]): RegistryTarget[] {
  const seen = new Set<string>()
  const result: RegistryTarget[] = []

  for (const target of targets) {
    const key = normalizeRegistryKey(target.registry || '')
    if (seen.has(key)) {
      logger.debug(`Skipping duplicate registry target "${target.name ?? target.registry}"`)
      continue
    }
    seen.add(key)
    result.push(target)
  }

  return result
}

/**
 * Resolve every distinct registry referenced by the config (legacy `registry`
 * plus every `registries` entry, regardless of package scoping). Conservative
 * fallback for the pre-publish authentication safety check when the package
 * list to publish isn't known yet - prefer `resolveRegistryTargetsForPackages`
 * once it is, so a registry scoped to packages outside this release doesn't
 * needlessly block it.
 *
 * When no default `registry` is configured but explicit `registries` are, the
 * legacy target degrades to an empty URL that would target the ambient
 * `.npmrc` registry with no managed auth. It is a phantom in that case and is
 * excluded, so a config that lists every registry explicitly does not
 * authenticate against a bogus empty registry.
 */
export function resolveAllConfiguredRegistryTargets(config: ResolvedRelizyConfig): RegistryTarget[] {
  const legacyTarget = buildLegacyRegistryTarget(config)
  const explicitTargets = config.publish.registries ?? []

  const skipEmptyDefault = !config.publish.registry && explicitTargets.length > 0

  return dedupRegistryTargets([
    ...(skipEmptyDefault ? [] : [legacyTarget]),
    ...explicitTargets,
  ])
}

/**
 * Resolve the registry targets a given package should be published to: the
 * legacy registry (if any) plus every `registries` entry that either has no
 * `packageFilter` (mirrored to all packages) or whose `packageFilter` glob
 * patterns match the package name.
 *
 * The legacy/default registry is skipped for this package when either:
 * - an applicable entry is marked `exclusive` - the package is published only
 *   to the matching registries instead of mirroring on top of the default one;
 * - no default `registry` is configured yet the package already has at least
 *   one applicable explicit registry. Without a default, the legacy target
 *   degrades to an empty URL that would publish to the ambient `.npmrc`
 *   registry with no managed auth, so it is a phantom once real targets exist.
 *   When nothing else covers the package, the empty legacy target is kept as
 *   the historical `.npmrc` fallback.
 */
export function resolveRegistryTargetsForPackage(
  pkg: PackageBase,
  config: ResolvedRelizyConfig,
): RegistryTarget[] {
  const legacyTarget = buildLegacyRegistryTarget(config)
  const explicitTargets = config.publish.registries ?? []

  const applicableTargets = explicitTargets.filter(
    target => !target.packageFilter?.length || micromatch.isMatch(pkg.name, target.packageFilter),
  )

  const skipForExclusive = applicableTargets.some(target => target.exclusive)
  const skipEmptyDefault = !config.publish.registry && applicableTargets.length > 0

  return dedupRegistryTargets([
    ...(skipForExclusive || skipEmptyDefault ? [] : [legacyTarget]),
    ...applicableTargets,
  ])
}

/**
 * Resolve every distinct registry actually needed to publish the given set of
 * packages - the union of `resolveRegistryTargetsForPackage` across all of
 * them, deduped by registry URL. Used for the pre-publish authentication
 * safety check once the package list to publish is known, so a registry
 * scoped to packages that are not part of this release does not block it.
 */
export function resolveRegistryTargetsForPackages(
  packages: PackageBase[],
  config: ResolvedRelizyConfig,
): RegistryTarget[] {
  const allTargets = packages.flatMap(pkg => resolveRegistryTargetsForPackage(pkg, config))

  return dedupRegistryTargets(allTargets)
}

/**
 * Package managers that read auth and registry configuration from `.npmrc`.
 * Yarn (Berry) uses `.yarnrc.yml` instead, so relizy never writes `.npmrc`
 * auth for it - preserving the historical "token only for npm/pnpm" behavior,
 * now also covering bun, which honors `.npmrc` too.
 */
function readsNpmrc(packageManager: PackageManager): boolean {
  return packageManager === 'npm' || packageManager === 'pnpm' || packageManager === 'bun'
}

/**
 * Extract the npm scope of a package name (`@accor/foo` -> `@accor`), or
 * `undefined` for an unscoped package.
 */
function getPackageScope(packageName: string | undefined): string | undefined {
  if (!packageName?.startsWith('@') || !packageName.includes('/')) {
    return undefined
  }

  return packageName.slice(0, packageName.indexOf('/'))
}

/**
 * Build the `.npmrc` entries relizy needs to inject for a registry target so a
 * command authenticates and targets the right registry, WITHOUT relying on CLI
 * rc-option flags (`--//host:_authToken=`, `--@scope:registry=`) which the
 * pnpm 10+ CLI parser rejects as "unexpected argument". Each entry carries its
 * `key` (used to override any pre-existing line for that key) and the full
 * `line` to write.
 *
 * - `@scope:registry=<registry>` forces scoped packages to this registry:
 *   npm/pnpm resolve a scoped package's publish registry from `@scope:registry`
 *   with priority over `--registry`, so without this a scoped package would be
 *   published to whatever registry the ambient `.npmrc` points at.
 * - `//host/path:_authToken=<token>` authenticates when a token is configured.
 */
function buildNpmrcEntries({
  registryTarget,
  scope,
  packageManager,
}: {
  registryTarget: RegistryTarget
  scope?: string
  packageManager: PackageManager
}): { key: string, line: string }[] {
  const { registry, token } = registryTarget
  const entries: { key: string, line: string }[] = []

  if (registry && scope) {
    entries.push({ key: `${scope}:registry`, line: `${scope}:registry=${registry}` })
  }

  if (token) {
    if (!registry) {
      logger.warn('Publish token provided but no registry specified')
    }
    else if (!readsNpmrc(packageManager)) {
      logger.warn('Publish token only supported for npm, pnpm and bun')
    }
    else {
      const url = new URL(registry)
      const authKey = `//${url.host}${url.pathname}:_authToken`
      entries.push({ key: authKey, line: `${authKey}=${token}` })
    }
  }

  return entries
}

/**
 * Run `fn` with the registry target's auth token and scope registry
 * temporarily written to the project `.npmrc` (at `config.cwd`), then restore
 * the original file - or remove it if it did not exist - ALWAYS, even on
 * failure.
 *
 * This is the version-proof replacement for passing rc-options as CLI flags:
 * the `.npmrc` contract is stable across npm/pnpm/bun and every version, so we
 * never depend on the CLI argument parser (which pnpm changed in v10+). Only
 * the keys relizy manages are overridden; every other line already in the
 * user's `.npmrc` is preserved untouched. When there is nothing to inject (no
 * token/scope, or a package manager that does not read `.npmrc` such as yarn),
 * the `.npmrc` is left as-is and `fn` runs against the user's own config.
 */
export async function withRegistryNpmrc<T>({
  config,
  registryTarget,
  packageName,
  packageManager,
  fn,
}: {
  config: ResolvedRelizyConfig
  registryTarget: RegistryTarget
  packageName?: string
  packageManager: PackageManager
  fn: () => Promise<T>
}): Promise<T> {
  const scope = getPackageScope(packageName)
  const entries = buildNpmrcEntries({ registryTarget, scope, packageManager })

  if (entries.length === 0) {
    return fn()
  }

  const npmrcPath = join(config.cwd, '.npmrc')
  const existed = existsSync(npmrcPath)
  const original = existed ? readFileSync(npmrcPath, 'utf8') : ''

  const managedKeys = new Set(entries.map(entry => entry.key))
  const preservedLines = original.split('\n').filter((line) => {
    const key = line.split('=')[0]?.trim()
    return !key || !managedKeys.has(key)
  })

  const nextContent = `${[...preservedLines, ...entries.map(entry => entry.line)].filter(Boolean).join('\n')}\n`

  try {
    writeFileSync(npmrcPath, nextContent)
    return await fn()
  }
  finally {
    if (existed) {
      writeFileSync(npmrcPath, original)
    }
    else {
      rmSync(npmrcPath, { force: true })
    }
  }
}

function getCommandArgs<T extends 'auth' | 'publish'>({
  packageManager,
  tag,
  registryTarget,
  otp,
  type,
  dryRun,
}: {
  packageManager: PackageManager
  tag: T extends 'publish' ? string : undefined
  registryTarget: RegistryTarget
  otp?: string
  type: T
  dryRun?: boolean
}) {
  const args = type === 'publish' ? ['publish', '--tag', tag] : ['whoami']

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
    if (isYarnBerry())
      args.push('--no-git-checks')
  }
  else if (packageManager === 'npm') {
    args.push('--yes')
  }

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

/**
 * Detect whether a failed publish is caused by the version already existing on
 * the registry (the registry refusing to overwrite an immutable asset), as
 * opposed to any other publish failure. This is what makes a retry safe: the
 * artifact is already there, so the failure is really a "nothing to do".
 *
 * Registries phrase this differently, so we match the known variants:
 * - npm public registry / verdaccio: `EPUBLISHCONFLICT`, `cannot publish over
 *   the previously published versions`, `you cannot publish over ...`;
 * - Nexus: `Repository does not allow updating assets` (HTTP 400);
 * - Artifactory/JFrog and others: `already exists` / `version already exists`;
 * - a bare HTTP 409 Conflict from a registry that returns no message body.
 */
export function isVersionAlreadyPublishedError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const errorMessage = 'message' in error && typeof error.message === 'string'
    ? error.message.toLowerCase()
    : ''
  const searchText = `${errorMessage} ${String(error).toLowerCase()}`

  const patterns = [
    'epublishconflict',
    'cannot publish over',
    'does not allow updating assets',
    'version already exists',
    'already exists in the repository',
    'status 409',
    '409 conflict',
  ]

  return patterns.some(pattern => searchText.includes(pattern))
}

/**
 * The `view` command follows the npm registry protocol on npm and pnpm only.
 * yarn and bun expose no equivalent we can rely on (bun ships no `view` at all,
 * and may be installed without npm), so for those we query the registry over
 * HTTP instead of shelling out to a `view` command.
 */
function canQueryVersionViaView(packageManager: PackageManager): packageManager is 'npm' | 'pnpm' {
  return packageManager === 'npm' || packageManager === 'pnpm'
}

/**
 * Detect whether an error from `view` means the package (or version) simply is
 * not on the registry - a definitive "not published" answer - as opposed to an
 * inconclusive failure (auth, network, unreachable registry) where we must not
 * assume anything.
 */
function isPackageNotFoundError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const errorMessage = 'message' in error && typeof error.message === 'string'
    ? error.message.toLowerCase()
    : ''
  const searchText = `${errorMessage} ${String(error).toLowerCase()}`

  return searchText.includes('e404')
    || searchText.includes('404 not found')
    || searchText.includes('is not in this registry')
    || searchText.includes('no match found')
}

/**
 * Query `pkg@version` existence with the package manager's `view` command
 * (npm/pnpm only), reusing the exact same auth, scoped registry and `.npmrc`
 * environment as the publish (via withRegistryNpmrc). Returns `true`/`false`
 * when the registry gives a definitive answer, or `null` when the check is
 * inconclusive (auth/network/registry error, or npm not available).
 */
async function queryVersionViaView({
  pkg,
  version,
  config,
  packageManager,
  registryTarget,
}: {
  pkg: PackageBase
  version: string
  config: ResolvedRelizyConfig
  packageManager: 'npm' | 'pnpm'
  registryTarget: RegistryTarget
}): Promise<boolean | null> {
  const args = ['view', `${pkg.name}@${version}`, 'version', '--json']
  if (registryTarget.registry) {
    args.push('--registry', registryTarget.registry)
  }
  const command = `${packageManager} ${args.join(' ')}`

  try {
    const { stdout } = await withRegistryNpmrc({
      config,
      registryTarget,
      packageName: pkg.name,
      packageManager,
      fn: () => execPromise(command, {
        cwd: pkg.path,
        noStdout: true,
        noStderr: true,
        noSuccess: true,
        noError: true,
        logLevel: config.logLevel,
      }),
    })

    // `view <pkg>@<exact-version> version --json` prints the version string when
    // it exists, and nothing (empty stdout, exit 0) when the package exists but
    // that version does not.
    const output = (stdout || '').trim()
    return output.length > 0 && output !== 'undefined' && output !== '[]'
  }
  catch (error) {
    if (isPackageNotFoundError(error)) {
      return false
    }
    logger.debug(`\`view\` check was inconclusive for ${pkg.name}@${version}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/**
 * Build the packument URL for a package on a registry: `{registry}/{name}` with
 * the scope slash percent-encoded (`@scope/pkg` -> `@scope%2Fpkg`), as npm
 * registries expect. The `@` is kept literal.
 */
function buildPackumentUrl(registry: string, packageName: string): string {
  const base = registry.endsWith('/') ? registry : `${registry}/`
  const encodedName = packageName.replace('/', '%2F')
  return `${base}${encodedName}`
}

/**
 * Query `pkg@version` existence with a direct HTTP request to the registry's
 * packument endpoint - the same metadata endpoint `install` relies on. This is
 * the package-manager-agnostic fallback that also works for yarn and bun (which
 * have no usable `view`). Auth reuses the resolved registry token.
 *
 * Returns `true`/`false` on a definitive answer, or `null` when inconclusive
 * (no registry URL, network error, auth failure, or a 5xx response).
 */
async function queryVersionViaHttp({
  pkg,
  version,
  config,
  registryTarget,
}: {
  pkg: PackageBase
  version: string
  config: ResolvedRelizyConfig
  registryTarget: RegistryTarget
}): Promise<boolean | null> {
  const registry = registryTarget.registry || getNpmRegistry(config.cwd)
  if (!registry) {
    return null
  }

  const token = registryTarget.token || config.publish.token || config.tokens.registry
  const headers: Record<string, string> = { accept: 'application/json' }
  if (token) {
    headers.authorization = `Bearer ${token}`
  }

  const timeoutMs = config.publish.safetyCheckTimeout ?? 15000

  try {
    const response = await fetch(buildPackumentUrl(registry, pkg.name), {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    })

    // A 404 is a definitive "package not on this registry".
    if (response.status === 404) {
      return false
    }
    // Any non-OK response (401, 403, 5xx...) is inconclusive - do not guess.
    if (!response.ok) {
      logger.debug(`Packument request for ${pkg.name} returned HTTP ${response.status} - treating as inconclusive`)
      return null
    }

    const packument = await response.json() as { versions?: Record<string, unknown> }
    return Boolean(packument.versions && Object.hasOwn(packument.versions, version))
  }
  catch (error) {
    logger.debug(`Packument request for ${pkg.name} failed: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/**
 * Ask the registry whether `pkg@version` already exists. This is the primary,
 * robust idempotency check: it relies on the standard registry metadata
 * endpoint that every npm-compatible registry (npm, Nexus, JFrog, Verdaccio,
 * GitHub/GitLab Packages) implements to serve `install`, rather than on the
 * wording of a publish error - which varies per registry.
 *
 * Strategy: for npm/pnpm, use the `view` command first (it inherits the full
 * `.npmrc` environment - proxy, CA, scoped auth). If that is inconclusive, or
 * for yarn/bun (no usable `view`), fall back to a direct HTTP request to the
 * packument endpoint so every package manager is covered.
 *
 * Returns:
 * - `true`  - the version is already published;
 * - `false` - the package, or that specific version, is not on the registry;
 * - `null`  - the check was inconclusive (auth/network/registry error), so the
 *   caller should fall back to attempting the publish rather than skipping.
 */
export async function isVersionPublished({
  pkg,
  version,
  config,
  packageManager,
  registryTarget,
}: {
  pkg: PackageBase
  version: string
  config: ResolvedRelizyConfig
  packageManager: PackageManager
  registryTarget: RegistryTarget
}): Promise<boolean | null> {
  if (canQueryVersionViaView(packageManager)) {
    const viaView = await queryVersionViaView({ pkg, version, config, packageManager, registryTarget })
    if (viaView !== null) {
      return viaView
    }
    logger.debug(`Falling back to a direct registry request for ${pkg.name}@${version}`)
  }

  return queryVersionViaHttp({ pkg, version, config, registryTarget })
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
  })

  return `${packageManager} ${args.join(' ')}`
}

function getPublishCommand({
  packageManager,
  tag,
  registryTarget,
  otp,
  dryRun,
}: {
  packageManager: PackageManager
  tag: string
  registryTarget: RegistryTarget
  otp?: string
  dryRun: boolean
}): string {
  const args = getCommandArgs<'publish'>({
    packageManager,
    tag,
    registryTarget,
    otp,
    dryRun,
    type: 'publish',
  })

  const baseCommand = packageManager === 'yarn' && isYarnBerry() ? 'yarn npm' : packageManager

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
    const alreadyPublished = await isVersionPublished({ pkg, version, config, packageManager, registryTarget })
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
          + 'This usually happens when re-running a release on the same commit (e.g. a canary rerun). '
          + 'Enable publish.skipExistingVersions (or pass --skip-existing-versions) to skip already-published versions instead of failing.',
          { cause: error },
        )
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

  let originalVersion: string | undefined
  if (needsTempVersionWrite) {
    const packageJsonPath = join(pkg.path, 'package.json')
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    originalVersion = packageJson.version
    logger.debug(`[dry-run] Temporarily writing ${pkg.newVersion} to ${pkg.name} for publish --dry-run validation`)
    writeVersion(pkg.path, pkg.newVersion!, false)
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
    if (needsTempVersionWrite && originalVersion) {
      logger.debug(`[dry-run] Restoring ${pkg.name} version to ${originalVersion}`)
      writeVersion(pkg.path, originalVersion, false)
    }
  }
}
