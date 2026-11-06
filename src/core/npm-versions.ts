import type { PackageBase, PackageManager, RegistryTarget } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { execPromise, logger } from '@maz-ui/node'
import { getNpmRegistry, withRegistryNpmrc } from './npm-registry'

/**
 * The versions already published on a registry
 */

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
 * Whether a package is on the registry, from its packument without
 * authentication: `null` when the registry does not answer clearly (network
 * error, 401, 5xx). A private package is not visible without token: a 404.
 */
export async function isPackageOnRegistry({ name, registry, timeoutMs = 15000 }: { name: string, registry: string, timeoutMs?: number }): Promise<boolean | null> {
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
    logger.debug(`Packument request for ${name} failed: ${error instanceof Error ? error.message : String(error)}`)
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

  const token = registryTarget.token || config.tokens.registry
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
