import type { CoreLogger, PackageManager, RegistryTarget } from './types'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import micromatch from 'micromatch'

/**
 * The registries of the packages, the `.npmrc`, and the temporary `.npmrc`
 * giving a registry its token
 */

const DEFAULT_REGISTRY = 'https://registry.npmjs.org/'

/**
 * Resolve the effective npm registry from the environment (`.npmrc` files, env
 * variables, npm/pnpm defaults) via `npm config get registry`. Falls back to the
 * public registry when npm is unavailable or returns nothing.
 *
 * @param cwd - Directory where the npm configuration is read (the current directory by default).
 * @returns The registry URL, `https://registry.npmjs.org/` by default.
 * @example
 * ```ts
 * getNpmRegistry('/repo') // 'https://registry.npmjs.org/' without a custom .npmrc
 * ```
 */
export function getNpmRegistry(cwd: string = process.cwd()): string {
  try {
    const output = execSync('npm config get registry', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()

    return output && output !== 'undefined'
      ? output
      : DEFAULT_REGISTRY
  }
  catch {
    return DEFAULT_REGISTRY
  }
}

/**
 * Normalize a registry URL for comparison purposes only (trims trailing
 * slashes), so `https://registry.npmjs.org` and `https://registry.npmjs.org/`
 * are recognized as the same registry when deduplicating targets. The
 * original, non-normalized URL is still what gets published to.
 *
 * @param registry - Registry URL.
 * @returns The URL without its one trailing slash.
 * @example
 * ```ts
 * normalizeRegistryKey('https://registry.npmjs.org/') // 'https://registry.npmjs.org'
 * ```
 */
export function normalizeRegistryKey(registry: string): string {
  return registry.endsWith('/')
    ? registry.slice(0, -1)
    : registry
}

/**
 * Deduplicate registry targets by registry URL, keeping the first occurrence
 * (the legacy target takes priority over explicit `registries` entries).
 */
function dedupRegistryTargets(targets: RegistryTarget[], logger?: CoreLogger): RegistryTarget[] {
  const seen = new Set<string>()
  const result: RegistryTarget[] = []

  for (const target of targets) {
    const key = normalizeRegistryKey(target.registry || '')
    if (seen.has(key)) {
      logger?.debug?.(`Skipping duplicate registry target "${target.name ?? target.registry}"`)
      continue
    }
    seen.add(key)
    result.push(target)
  }

  return result
}

/**
 * How the registries of a project are declared: the default registry (and its
 * target, built on demand) and the explicit `registries`.
 */
export interface RegistryTargetsOptions {
  /** The default registry, as set by the user. Unset: the registries that cover a package replace it */
  registry?: string
  /** The explicit registries, routed to the packages by `packageFilter` */
  registries?: RegistryTarget[]
  /** Builds the target of the default registry, called only when the default registry applies to a package */
  buildDefaultTarget: () => RegistryTarget
  /** Receives a debug message for each duplicate target skipped */
  logger?: CoreLogger
}

/**
 * Resolve the registry targets a given package should be published to: the
 * default registry (if any) plus every `registries` entry that either has no
 * `packageFilter` (mirrored to all packages) or whose `packageFilter` glob
 * patterns match the package name.
 *
 * The default registry is skipped for this package when either:
 * - an applicable entry is marked `exclusive`;
 * - `registry` is not set and the package has at least one applicable entry.
 *
 * Targets are deduplicated by registry URL, the first one is kept.
 *
 * @param pkg - The package.
 * @param pkg.name - Package name, matched against the `packageFilter` globs.
 * @param options - How the registries are declared, see `RegistryTargetsOptions`.
 * @param options.registry - The default registry, as set by the user.
 * @param options.registries - The explicit registries.
 * @param options.buildDefaultTarget - Builds the target of the default registry.
 * @param options.logger - Receives a debug message for each duplicate target skipped.
 * @returns The targets to publish the package to, the default one first. Empty when the default registry is skipped and no entry applies.
 * @example
 * ```ts
 * resolveRegistryTargetsForPackage(
 *   { name: '@acme/ui' },
 *   {
 *     registry: 'https://registry.npmjs.org/',
 *     registries: [{ registry: 'https://nexus.acme.dev/', packageFilter: ['@acme/*'] }],
 *     buildDefaultTarget: () => ({ registry: 'https://registry.npmjs.org/' }),
 *   },
 * )
 * // [npmjs target, nexus target]
 * ```
 */
export function resolveRegistryTargetsForPackage(
  pkg: { name: string },
  { registry, registries, buildDefaultTarget, logger }: RegistryTargetsOptions,
): RegistryTarget[] {
  const explicitTargets = registries ?? []

  const applicableTargets = explicitTargets.filter(
    target => !target.packageFilter?.length || micromatch.isMatch(pkg.name, target.packageFilter),
  )

  const skipForExclusive = applicableTargets.some(target => target.exclusive)
  const skipUndeclaredDefault = !registry && applicableTargets.length > 0

  return dedupRegistryTargets([
    ...(skipForExclusive || skipUndeclaredDefault
      ? []
      : [
          buildDefaultTarget(),
        ]),
    ...applicableTargets,
  ], logger)
}

/**
 * Resolve every distinct registry actually needed to publish the given set of
 * packages - the union of `resolveRegistryTargetsForPackage` across all of
 * them, deduped by registry URL.
 *
 * @param packages - The packages to publish, only their names are used.
 * @param options - How the registries are declared, see `RegistryTargetsOptions`.
 * @returns The distinct targets, in the order they are first met.
 */
export function resolveRegistryTargetsForPackages(
  packages: { name: string }[],
  options: RegistryTargetsOptions,
): RegistryTarget[] {
  const allTargets = packages.flatMap(pkg => resolveRegistryTargetsForPackage(pkg, options))

  return dedupRegistryTargets(allTargets, options.logger)
}

/**
 * Package managers that read auth and registry configuration from `.npmrc`.
 * Yarn (Berry) uses `.yarnrc.yml` instead.
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
 * Build the `.npmrc` entries needed for a registry target so a command
 * authenticates and targets the right registry, without CLI rc-option flags
 * (rejected by the pnpm 10+ CLI parser). Each entry carries its `key` (used to
 * override any pre-existing line for that key) and the full `line` to write.
 *
 * - `@scope:registry=<registry>` forces scoped packages to this registry;
 * - `//host/path:_authToken=<token>` authenticates when a token is configured.
 */
function buildNpmrcEntries({
  registryTarget,
  scope,
  packageManager,
  logger,
}: {
  registryTarget: RegistryTarget
  scope?: string
  packageManager: PackageManager
  logger?: CoreLogger
}): { key: string, line: string }[] {
  const { registry, token } = registryTarget
  const entries: { key: string, line: string }[] = []

  if (registry && scope) {
    entries.push({ key: `${scope}:registry`, line: `${scope}:registry=${registry}` })
  }

  if (token) {
    if (!registry) {
      logger?.warn?.('Publish token provided but no registry specified')
    }
    else if (!readsNpmrc(packageManager)) {
      logger?.warn?.('Publish token only supported for npm, pnpm and bun')
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
 * temporarily written to the `.npmrc` of `cwd`, then restore the original file
 * - or remove it if it did not exist - ALWAYS, even on failure, and when the
 * process stops before the end. Only the keys managed here are overridden;
 * every other line of the `.npmrc` is preserved. When there is nothing to
 * inject, the `.npmrc` is left as is and `fn` runs against it.
 *
 * Concurrent calls on the same `.npmrc` run one after the other, and the
 * injected lines sit between `# relizy:start` and `# relizy:end` markers that
 * are never taken for the original content: a block left by another relizy
 * process (or a crash) is removed, the token is never written back.
 *
 * @param options - Target, package and callback.
 * @param options.cwd - Directory of the `.npmrc` (root of the project).
 * @param options.registryTarget - Registry whose token and scope registry are injected.
 * @param options.packageName - Package name, its scope (`@scope`) gets the `@scope:registry` entry when the name is scoped.
 * @param options.packageManager - Package manager; the token is only injected for npm, pnpm and bun (a warning is logged otherwise).
 * @param options.logger - Receives the warnings (token without registry, unsupported package manager).
 * @param options.fn - Callback run while the `.npmrc` is modified.
 * @returns What `fn` returns. An error of `fn` is rethrown after the `.npmrc` is restored.
 * @example
 * ```ts
 * await withRegistryNpmrc({
 *   cwd: '/repo',
 *   registryTarget: { registry: 'https://registry.npmjs.org/', token: process.env.NPM_TOKEN },
 *   packageName: '@acme/ui',
 *   packageManager: 'pnpm',
 *   fn: () => execPromise('pnpm view @acme/ui version'),
 * })
 * ```
 */
export async function withRegistryNpmrc<T>({
  cwd,
  registryTarget,
  packageName,
  packageManager,
  logger,
  fn,
}: {
  cwd: string
  registryTarget: RegistryTarget
  packageName?: string
  packageManager: PackageManager
  logger?: CoreLogger
  fn: () => Promise<T>
}): Promise<T> {
  const scope = getPackageScope(packageName)
  const entries = buildNpmrcEntries({
    registryTarget,
    scope,
    packageManager,
    logger,
  })

  if (entries.length === 0) {
    return fn()
  }

  const npmrcPath = join(cwd, '.npmrc')
  // One write of a `.npmrc` at a time in the process: two concurrent calls
  // (the registry checks of several packages) would each take the file of the
  // other for the original, and the last to restore would leave the token
  return await withNpmrcLock(npmrcPath, () => withInjectedNpmrc(npmrcPath, entries, fn))
}

/**
 * Lines written by `withRegistryNpmrc`, between these markers: they are never
 * taken for the original content, so a block left by another process or a
 * crash is removed instead of written back
 */
const NPMRC_BLOCK_START = '# relizy:start (temporary registry auth, removed after the command)'
const NPMRC_BLOCK_END = '# relizy:end'

/** The `.npmrc` without the temporary blocks of relizy */
export function stripRelizyNpmrcBlocks(content: string): string {
  const lines: string[] = []
  let inBlock = false
  for (const line of content.split('\n')) {
    if (line.trim() === NPMRC_BLOCK_START) {
      inBlock = true
      continue
    }
    if (inBlock) {
      inBlock = line.trim() !== NPMRC_BLOCK_END
      continue
    }
    lines.push(line)
  }
  return lines.join('\n')
}

const npmrcLocks = new Map<string, Promise<unknown>>()

async function withNpmrcLock<T>(npmrcPath: string, fn: () => Promise<T>): Promise<T> {
  const previous = npmrcLocks.get(npmrcPath) ?? Promise.resolve()
  const current = previous.catch(() => {}).then(fn)
  const settled = current.catch(() => {})
  npmrcLocks.set(npmrcPath, settled)
  try {
    return await current
  }
  finally {
    if (npmrcLocks.get(npmrcPath) === settled) {
      npmrcLocks.delete(npmrcPath)
    }
  }
}

async function withInjectedNpmrc<T>(npmrcPath: string, entries: Array<{ key: string, line: string }>, fn: () => Promise<T>): Promise<T> {
  // The original is the file without any temporary block, so the token of a
  // block left by another process is never written back
  const original = existsSync(npmrcPath)
    ? stripRelizyNpmrcBlocks(readFileSync(npmrcPath, 'utf8'))
    : ''
  const existed = original.trim().length > 0

  const managedKeys = new Set(entries.map(entry => entry.key))
  const preservedLines = original.split('\n').filter((line) => {
    const key = line.split('=')[0]?.trim()
    return !key || !managedKeys.has(key)
  })

  const nextContent = `${[
    ...preservedLines.filter(Boolean),
    NPMRC_BLOCK_START,
    ...entries.map(entry => entry.line),
    NPMRC_BLOCK_END,
  ].join('\n')}\n`

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
