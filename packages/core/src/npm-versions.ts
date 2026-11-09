import type { CoreLogger, PackageManager, ReadPackage, RegistryTarget } from './types'
import { execPromise } from '@maz-ui/node'
import { getNpmRegistry, withRegistryNpmrc } from './registry'

/** The log level of the commands the package manager runs (the `LogLevel` of `@maz-ui/node`) */
export type ExecLogLevel = NonNullable<Parameters<typeof execPromise>[1]>['logLevel']

/** What is needed to query the registry about a version of a package */
export interface VersionQueryOptions {
  /** The package: its name and its directory, where the package manager runs */
  pkg: Pick<ReadPackage, 'name' | 'path'>
  /** The version to look for */
  version: string
  /** Root of the project, where its `.npmrc` is */
  cwd: string
  /** The registry to query, with its optional token */
  registryTarget: RegistryTarget
  /** Token used by the HTTP query when the registry target has none */
  token?: string
  /** Timeout of the HTTP query, in milliseconds (15000 by default) */
  timeoutMs?: number
  /** Log level of the commands run */
  logLevel?: ExecLogLevel
  /** Receives debug messages about inconclusive checks */
  logger?: CoreLogger
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
 *
 * @param error - The error thrown by the publish command (any value).
 * @returns `true` when the message or the string form of the error contains one of the known phrases (case-insensitive), `false` otherwise, including for a non-object.
 * @example
 * ```ts
 * isVersionAlreadyPublishedError(new Error('npm ERR! EPUBLISHCONFLICT')) // true
 * isVersionAlreadyPublishedError(new Error('ENETUNREACH')) // false
 * ```
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
  cwd,
  packageManager,
  registryTarget,
  logLevel,
  logger,
}: VersionQueryOptions & { packageManager: 'npm' | 'pnpm' }): Promise<boolean | null> {
  const args = [
    'view',
    `${pkg.name}@${version}`,
    'version',
    '--json',
  ]
  if (registryTarget.registry) {
    args.push('--registry', registryTarget.registry)
  }
  const command = `${packageManager} ${args.join(' ')}`

  try {
    const { stdout } = await withRegistryNpmrc({
      cwd,
      registryTarget,
      packageName: pkg.name,
      packageManager,
      logger,
      fn: () => execPromise(command, {
        cwd: pkg.path,
        noStdout: true,
        noStderr: true,
        noSuccess: true,
        noError: true,
        logLevel,
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
    logger?.debug?.(`\`view\` check was inconclusive for ${pkg.name}@${version}: ${error instanceof Error
      ? error.message
      : String(error)}`)
    return null
  }
}

/**
 * Build the packument URL for a package on a registry: `{registry}/{name}` with
 * the scope slash percent-encoded (`@scope/pkg` -> `@scope%2Fpkg`), as npm
 * registries expect. The `@` is kept literal.
 */
function buildPackumentUrl(registry: string, packageName: string): string {
  const base = registry.endsWith('/')
    ? registry
    : `${registry}/`
  const encodedName = packageName.replace('/', '%2F')
  return `${base}${encodedName}`
}

/**
 * Whether a package is on the registry, from its packument without
 * authentication: `null` when the registry does not answer clearly (network
 * error, 401, 5xx). A private package is not visible without token: a 404.
 *
 * @param options - Package and registry.
 * @param options.name - Package name, scoped names included.
 * @param options.registry - Registry URL.
 * @param options.timeoutMs - Timeout of the HTTP request in milliseconds (15000 by default).
 * @param options.logger - Receives a debug message when the request fails.
 * @returns `true` when the registry answers OK, `false` on a 404, `null` otherwise.
 * @example
 * ```ts
 * await isPackageOnRegistry({ name: '@scope/pkg', registry: 'https://registry.npmjs.org/' })
 * // true, false or null
 * ```
 */
export async function isPackageOnRegistry({ name, registry, timeoutMs = 15000, logger }: { name: string, registry: string, timeoutMs?: number, logger?: CoreLogger }): Promise<boolean | null> {
  try {
    const response = await fetch(buildPackumentUrl(registry, name), {
      // The abbreviated packument: only the versions, enough to know it exists
      headers: { accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (response.status === 404) {
      return false
    }

    return response.ok ? true : null
  }
  catch (error) {
    logger?.debug?.(`Packument request for ${name} failed: ${error instanceof Error
      ? error.message
      : String(error)}`)
    return null
  }
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
  cwd,
  registryTarget,
  token: defaultToken,
  timeoutMs = 15000,
  logger,
}: VersionQueryOptions): Promise<boolean | null> {
  const registry = registryTarget.registry || getNpmRegistry(cwd)
  if (!registry) {
    return null
  }

  const token = registryTarget.token || defaultToken
  const headers: Record<string, string> = { accept: 'application/json' }
  if (token) {
    headers.authorization = `Bearer ${token}`
  }

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
      logger?.debug?.(`Packument request for ${pkg.name} returned HTTP ${response.status} - treating as inconclusive`)
      return null
    }

    const packument = await response.json() as { versions?: Record<string, unknown> }
    return Boolean(packument.versions && Object.hasOwn(packument.versions, version))
  }
  catch (error) {
    logger?.debug?.(`Packument request for ${pkg.name} failed: ${error instanceof Error
      ? error.message
      : String(error)}`)
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
 *
 * @param options - See `VersionQueryOptions`, plus the package manager.
 * @param options.packageManager - Decides the method: `view` first for npm and pnpm, HTTP only for yarn and bun.
 * @param options.pkg - Name and directory of the package.
 * @param options.version - Version to look for.
 * @param options.cwd - Root of the project, where its `.npmrc` is.
 * @param options.registryTarget - Registry to query, with its optional token.
 * @param options.token - Token of the HTTP query when the registry target has none.
 * @param options.timeoutMs - Timeout of the HTTP query in milliseconds (15000 by default).
 * @param options.logLevel - Log level of the commands run.
 * @param options.logger - Receives debug messages about inconclusive checks.
 * @returns `true`, `false` or `null`, see above.
 * @example
 * ```ts
 * const published = await isVersionPublished({
 *   packageManager: 'pnpm',
 *   pkg: { name: 'my-lib', path: '/repo/packages/my-lib' },
 *   version: '1.2.0',
 *   cwd: '/repo',
 *   registryTarget: { registry: 'https://registry.npmjs.org/' },
 * })
 * if (published === true) {
 *   // skip the publish
 * }
 * ```
 */
export async function isVersionPublished({
  packageManager,
  ...options
}: VersionQueryOptions & { packageManager: PackageManager }): Promise<boolean | null> {
  if (canQueryVersionViaView(packageManager)) {
    const viaView = await queryVersionViaView({ ...options, packageManager })
    if (viaView !== null) {
      return viaView
    }
    options.logger?.debug?.(`Falling back to a direct registry request for ${options.pkg.name}@${options.version}`)
  }

  return queryVersionViaHttp(options)
}
