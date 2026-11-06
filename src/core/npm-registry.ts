import type { PackageBase, PackageManager, RegistryTarget } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path, { join } from 'node:path'
import { logger } from '@maz-ui/node'
import micromatch from 'micromatch'

/**
 * The registries of the packages (`publish.registry`, `publish.registries`,
 * the `.npmrc`), the package manager, and the temporary `.npmrc` giving them
 * their tokens
 */

const DEFAULT_REGISTRY = 'https://registry.npmjs.org/'

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

/**
 * Run a binary of the dependencies with the package manager: `pnpm exec eslint`
 */
export function getExecCommand(packageManager: PackageManager, command: string): string {
  switch (packageManager) {
    case 'pnpm':
      return `pnpm exec ${command}`
    case 'yarn':
      return `yarn ${command}`
    case 'bun':
      return `bunx ${command}`
    default:
      return `npx ${command}`
  }
}

export function isYarnBerry(cwd: string) {
  return existsSync(path.join(cwd, '.yarnrc.yml'))
}

const npmrcRegistryByConfig = new WeakMap<ResolvedRelizyConfig, string>()

/**
 * The registry of the npm config / `.npmrc`, read once per config: the
 * registry of a package that no `registries` entry covers when
 * `publish.registry` is not set.
 */
function getNpmrcRegistry(config: ResolvedRelizyConfig): string {
  let registry = npmrcRegistryByConfig.get(config)

  if (registry === undefined) {
    registry = getNpmRegistry(config.cwd)
    npmrcRegistryByConfig.set(config, registry)
  }

  return registry
}

/**
 * Build the implicit registry target from the legacy single-registry config
 * fields (`publish.registry`/`token`/`tag`/`access`/`otp`). Publishing to this
 * target reproduces the exact pre-multi-registry behavior.
 */
export function buildLegacyRegistryTarget(config: ResolvedRelizyConfig): RegistryTarget {
  return {
    name: 'default',
    // Left unset by resolveConfig when `registries` are declared
    registry: config.publish.registry || (config.publish.registries?.length ? getNpmrcRegistry(config) : ''),
    token: config.tokens.registry,
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
export function normalizeRegistryKey(registry: string): string {
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
 * Resolve the registry targets a given package should be published to: the
 * legacy registry (if any) plus every `registries` entry that either has no
 * `packageFilter` (mirrored to all packages) or whose `packageFilter` glob
 * patterns match the package name.
 *
 * The legacy/default registry is skipped for this package when either:
 * - an applicable entry is marked `exclusive` - the package is published only
 *   to the matching registries instead of mirroring on top of the default one;
 * - `publish.registry` is not set and the package has at least one applicable
 *   entry: only the declared registries are used. When no entry covers the
 *   package, it is published to the `.npmrc` registry.
 */
export function resolveRegistryTargetsForPackage(
  pkg: Pick<PackageBase, 'name'>,
  config: ResolvedRelizyConfig,
): RegistryTarget[] {
  const explicitTargets = config.publish.registries ?? []

  const applicableTargets = explicitTargets.filter(
    target => !target.packageFilter?.length || micromatch.isMatch(pkg.name, target.packageFilter),
  )

  const skipForExclusive = applicableTargets.some(target => target.exclusive)
  const skipUndeclaredDefault = !config.publish.registry && applicableTargets.length > 0

  return dedupRegistryTargets([
    ...(skipForExclusive || skipUndeclaredDefault ? [] : [buildLegacyRegistryTarget(config)]),
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
  packages: Pick<PackageBase, 'name'>[],
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

const NPMRC_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const

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

  let restored = false
  const restore = () => {
    if (restored) {
      return
    }
    restored = true

    if (existed) {
      writeFileSync(npmrcPath, original)
    }
    else {
      rmSync(npmrcPath, { force: true })
    }
  }

  // The token must not stay on disk when the process stops before the end
  // (Ctrl+C, kill, closed terminal, process.exit): restore, then let the
  // signal do what it would have done
  function onSignal(signal: NodeJS.Signals) {
    restore()
    removeListeners()
    process.kill(process.pid, signal)
  }
  function removeListeners() {
    process.removeListener('exit', restore)
    for (const signal of NPMRC_SIGNALS) {
      process.removeListener(signal, onSignal)
    }
  }

  process.once('exit', restore)
  for (const signal of NPMRC_SIGNALS) {
    process.once(signal, onSignal)
  }

  try {
    writeFileSync(npmrcPath, nextContent)
    return await fn()
  }
  finally {
    restore()
    removeListeners()
  }
}
