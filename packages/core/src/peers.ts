import type { PackageBase, ReadPackage } from './types'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as semver from 'semver'
import { cachedGitRead } from './git-cache'
import { tryGitSync } from './git-exec'
import { NEW_PACKAGE_MARKER } from './tags'

/** Dependency fields of a `package.json` */
export type DependencyField = 'dependencies' | 'devDependencies' | 'peerDependencies'

const LOCAL_VERSION_RANGES = new Set(['*', '^', '~', ''])

/**
 * The workspace package and the range of a `workspace:` specifier, also through
 * an alias (`workspace:other-name@^`), or null for another protocol.
 *
 * @param dependencyName - Name the dependency is declared under
 * @param specifier - The version specifier
 * @returns The target package (the dependency name without alias) and the range, or null when it is not a `workspace:` specifier
 * @example
 * ```ts
 * parseWorkspaceProtocol('core', 'workspace:^') // { target: 'core', range: '^' }
 * parseWorkspaceProtocol('alias', 'workspace:core@~1.0.0') // { target: 'core', range: '~1.0.0' }
 * parseWorkspaceProtocol('core', '^1.0.0') // null
 * ```
 */
export function parseWorkspaceProtocol(dependencyName: string, specifier: string): { target: string, range: string } | null {
  if (!specifier.startsWith('workspace:')) {
    return null
  }

  const range = specifier.slice('workspace:'.length)
  const alias = /^(@[^/@]+\/[^@]+|[^@]+)@(.*)$/.exec(range)

  return alias
    ? { target: alias[1]!, range: alias[2]! }
    : { target: dependencyName, range }
}

/**
 * A `workspace:` specifier the package manager replaces with the version of the
 * workspace package: `workspace:*`, `workspace:^`, `workspace:~`, also through an
 * alias (`workspace:other-name@^`). Explicit ranges (`workspace:^1.2.0`) are
 * published as the range itself, not as the local version: they return null.
 *
 * @param dependencyName - Name the dependency is declared under
 * @param specifier - The version specifier
 * @returns The target package, or null when the specifier is not one of these forms
 * @example
 * ```ts
 * parseWorkspaceSpecifier('core', 'workspace:*') // { target: 'core' }
 * parseWorkspaceSpecifier('core', 'workspace:^1.2.0') // null
 * ```
 */
export function parseWorkspaceSpecifier(dependencyName: string, specifier: string): { target: string } | null {
  const workspaceProtocol = parseWorkspaceProtocol(dependencyName, specifier)

  return workspaceProtocol && LOCAL_VERSION_RANGES.has(workspaceProtocol.range)
    ? { target: workspaceProtocol.target }
    : null
}

/**
 * The range a dependency specifier is published as, with the version the
 * dependency had when the package was published: `workspace:^` becomes
 * `^1.2.0`, an explicit range stays as is. Null when it is not a semver range
 * (`catalog:`, `npm:`, `link:`...).
 *
 * @param options - The options
 * @param options.dependencyName - Name the dependency is declared under
 * @param options.specifier - The version specifier
 * @param options.dependencyVersion - Version of the dependency when the package was published
 * @returns The target package and the published range, or null when the specifier is not a semver range
 * @example
 * ```ts
 * getPublishedRange({ dependencyName: 'core', specifier: 'workspace:^', dependencyVersion: '1.2.0' })
 * // { target: 'core', range: '^1.2.0' }
 * getPublishedRange({ dependencyName: 'core', specifier: 'catalog:', dependencyVersion: '1.2.0' }) // null
 * ```
 */
export function getPublishedRange({
  dependencyName,
  specifier,
  dependencyVersion,
}: {
  dependencyName: string
  specifier: string
  dependencyVersion: string
}): { target: string, range: string } | null {
  const workspaceProtocol = parseWorkspaceProtocol(dependencyName, specifier)
  const target = workspaceProtocol?.target ?? dependencyName
  const range = workspaceProtocol?.range ?? specifier

  if (range === '*' || range === '') {
    return { target, range: dependencyVersion }
  }

  if (range === '^' || range === '~') {
    return { target, range: `${range}${dependencyVersion}` }
  }

  return semver.validRange(range)
    ? { target, range }
    : null
}

/**
 * Version of a package before and after a bump
 */
export interface VersionChange {
  /** Version before the bump */
  oldVersion: string
  /** Version after the bump */
  newVersion: string
}

/**
 * Whether a new version breaks the consumers of the previous one: `^oldVersion`
 * does not accept it (a new major, a new minor in `0.x`). A prerelease counts as
 * the version it leads to: `6.19.1` to `6.20.0-beta.0` is not breaking,
 * `6.19.1` to `7.0.0-beta.0` is.
 *
 * @param change - The versions before and after the bump
 * @param change.oldVersion - Version before the bump
 * @param change.newVersion - Version after the bump
 * @returns True when `^oldVersion` rejects the new version
 * @example
 * ```ts
 * isBreakingVersionChange({ oldVersion: '1.2.0', newVersion: '2.0.0' }) // true
 * isBreakingVersionChange({ oldVersion: '0.3.0', newVersion: '0.4.0' }) // true
 * isBreakingVersionChange({ oldVersion: '1.2.0', newVersion: '1.3.0' }) // false
 * ```
 */
export function isBreakingVersionChange({ oldVersion, newVersion }: VersionChange): boolean {
  return !semver.satisfies(newVersion, `^${oldVersion}`, { includePrerelease: true })
}

/**
 * The `package.json` of a package, in the working tree or at `ref`, undefined
 * when it does not exist there. A ref git cannot resolve (outside a
 * repository, tags not fetched) falls back to the working tree.
 */
function readPackageJsonContent(packagePath: string, ref: string | undefined): string | undefined {
  if (ref === undefined) {
    const packageJsonPath = join(packagePath, 'package.json')

    return existsSync(packageJsonPath)
      ? readFileSync(packageJsonPath, 'utf-8')
      : undefined
  }

  if (ref === NEW_PACKAGE_MARKER) {
    return undefined
  }

  const released = cachedGitRead({
    key: ['show', ref, 'package.json'],
    cwd: packagePath,
    read: () => tryGitSync(['show', `${ref}:./package.json`], { cwd: packagePath }),
  })

  if (released !== undefined) {
    return released
  }

  const refExists = tryGitSync([
    'rev-parse',
    '--verify',
    '--quiet',
    `${ref}^{commit}`,
  ], { cwd: packagePath }) !== undefined

  return refExists
    ? undefined
    : readPackageJsonContent(packagePath, undefined)
}

/**
 * Dependency whose published range rejects the new version of the dependency.
 */
export interface OutOfRangeDependency extends VersionChange {
  /**
   * Name of the workspace package (the target of an alias)
   */
  dependency: string
  /**
   * Field of the `package.json` declaring the dependency
   */
  field: DependencyField
  /**
   * Range the package was published with, null when the specifier is not a
   * semver range (`catalog:`, `link:`, `npm:`...): it cannot be checked
   */
  range: string | null
}

/**
 * Peer dependency whose published range rejects the new version of the dependency.
 */
export interface OutOfRangePeer extends OutOfRangeDependency {
  /** Range the package was published with (always a semver range here, never null) */
  range: string
}

/**
 * The dependencies of a package, in the given fields, whose published range
 * (computed with the version the dependency had before the bump) does not
 * accept the new version of the dependency.
 *
 * The ranges are checked as npm does, which rejects a prerelease unless the
 * range targets the same version: `^6.19.1` does not accept `6.20.0-beta.0`.
 * pnpm accepts it, but the consumers of the package may use npm.
 *
 * A specifier that is not a semver range (`catalog:`, `link:`...) is returned
 * with a null `range`: it cannot be checked.
 *
 * With `ref`, the ranges are the ones the package was published with: its
 * `package.json` at its last release. A dependency added since then rejects
 * nothing, no consumer has its range, and a package never released (no
 * `package.json` at `ref`, or `NEW_PACKAGE_MARKER`) has nothing out of range.
 * A `ref` git cannot resolve falls back to the working tree.
 *
 * @param options - The options
 * @param options.packagePath - Directory of the package, whose `package.json` is read
 * @param options.bumped - The versions before and after the bump, by package name
 * @param options.fields - The dependency fields to check
 * @param options.ref - Ref of the last release of the package (its last tag, see `resolveFromTag`): its `package.json` is read at this ref instead of the working tree
 * @returns The dependencies to flag, in the order of `fields`; empty when nothing is bumped, no field is given, the package has no `package.json` or was never released at `ref`
 * @throws When the `package.json` is not valid JSON
 * @example
 * ```ts
 * // the package has "peerDependencies": { "core": "^1.2.0" }
 * getOutOfRangeDependencies({
 *   packagePath,
 *   bumped: new Map([['core', { oldVersion: '1.2.0', newVersion: '2.0.0' }]]),
 *   fields: ['peerDependencies'],
 * })
 * // [{ dependency: 'core', field: 'peerDependencies', range: '^1.2.0', oldVersion: '1.2.0', newVersion: '2.0.0' }]
 *
 * // the same, with the ranges of its last release, tagged `my-lib@1.0.0`
 * getOutOfRangeDependencies({ packagePath, bumped, fields: ['peerDependencies'], ref: 'my-lib@1.0.0' })
 * ```
 */
export function getOutOfRangeDependencies({
  packagePath,
  bumped,
  fields,
  ref,
}: {
  packagePath: string
  bumped: Map<string, VersionChange>
  fields: DependencyField[]
  ref?: string
}): OutOfRangeDependency[] {
  if (bumped.size === 0 || fields.length === 0) {
    return []
  }

  const content = readPackageJsonContent(packagePath, ref)

  if (content === undefined) {
    return []
  }

  const packageJson = JSON.parse(content) as Partial<Record<DependencyField, Record<string, string>>>
  const outOfRange: OutOfRangeDependency[] = []

  for (const field of fields) {
    for (const [dependencyName, specifier] of Object.entries(packageJson[field] ?? {})) {
      const target = parseWorkspaceProtocol(dependencyName, specifier)?.target ?? dependencyName
      const change = bumped.get(target)

      if (!change) {
        continue
      }

      const published = getPublishedRange({ dependencyName, specifier, dependencyVersion: change.oldVersion })

      if (!published || !semver.satisfies(change.newVersion, published.range)) {
        outOfRange.push({
          dependency: target,
          field,
          range: published?.range ?? null,
          ...change,
        })
      }
    }
  }

  return outOfRange
}

/**
 * The peer dependencies of a package whose published range rejects the new
 * version of the dependency (see `getOutOfRangeDependencies`). The specifiers
 * that are not semver ranges are left out.
 *
 * @param options - The options
 * @param options.packagePath - Directory of the package, whose `package.json` is read
 * @param options.bumped - The versions before and after the bump, by package name
 * @param options.ref - Ref of the last release of the package: its published `package.json` is read at this ref (see `getOutOfRangeDependencies`)
 * @returns The peers to flag, empty when none
 * @throws When the `package.json` is not valid JSON
 * @example
 * ```ts
 * // the package has "peerDependencies": { "core": "^1.2.0" }
 * getOutOfRangePeers({ packagePath, bumped: new Map([['core', { oldVersion: '1.2.0', newVersion: '2.0.0' }]]) })
 * // [{ dependency: 'core', field: 'peerDependencies', range: '^1.2.0', oldVersion: '1.2.0', newVersion: '2.0.0' }]
 * ```
 */
export function getOutOfRangePeers({
  packagePath,
  bumped,
  ref,
}: {
  packagePath: string
  bumped: Map<string, VersionChange>
  ref?: string
}): OutOfRangePeer[] {
  return getOutOfRangeDependencies({
    packagePath,
    bumped,
    fields: ['peerDependencies'],
    ref,
  })
    .filter((peer): peer is OutOfRangePeer => peer.range !== null)
}

/**
 * Why the published range of a package rejects the new version of its
 * dependency, in words: "the published range of its dependency `core`
 * (`^5.4.0`) rejects 6.0.0"
 *
 * @param options - The options
 * @param options.dependency - Name of the dependency
 * @param options.field - The dependency field that declares it (selects the wording: dependency, dev dependency, peer dependency)
 * @param options.range - The published range, null when it is not a semver range (the sentence then says it cannot accept the version)
 * @param options.newVersion - The new version of the dependency
 * @returns A sentence fragment without trailing period
 * @example
 * ```ts
 * describeOutOfRange({ dependency: 'core', field: 'peerDependencies', range: '^5.4.0', newVersion: '6.0.0' })
 * // 'the published range of its peer dependency `core` (`^5.4.0`) rejects 6.0.0'
 * ```
 */
export function describeOutOfRange({ dependency, field, range, newVersion }: { dependency: string, field: DependencyField, range: string | null, newVersion: string }): string {
  const kind = { dependencies: 'dependency', devDependencies: 'dev dependency', peerDependencies: 'peer dependency' }[field]

  return range === null
    ? `the range of its ${kind} \`${dependency}\` is not a semver range, it cannot accept ${newVersion}`
    : `the published range of its ${kind} \`${dependency}\` (\`${range}\`) rejects ${newVersion}`
}

/**
 * A package whose published peer dependency range rejects the new version of
 * an internal dependency
 */
export interface StaleDependent extends OutOfRangePeer {
  /** Name of the package that declares the peer dependency */
  dependent: string
}

/**
 * Find the packages that are not released by a run while their published
 * peer dependency ranges do not accept the new version of an internal
 * dependency: their consumers get peer dependency warnings, or errors with
 * `strict-peer-dependencies`. The private packages are left out.
 *
 * The published range is computed from the version the dependency had before
 * the release, so only the ranges the release breaks are reported. With
 * `refs`, it is read from the `package.json` of the dependent at its last
 * release (see `getOutOfRangeDependencies`): a peer dependency added since then
 * is not reported.
 *
 * @param options - The options
 * @param options.workspacePackages - Every package of the workspace
 * @param options.bumpedPackages - Packages bumped by the run, with their version before and after
 * @param options.publishedPackages - Packages published by the run, which are not reported
 * @param options.refs - Ref of the last release of each dependent, by name; the dependents without one are read in the working tree
 * @returns One entry per stale peer range, with the `dependent` package name; empty when nothing is bumped. Only packages bumped to a different version count, and dependents that are private or in `publishedPackages` are skipped
 * @throws When the `package.json` of a dependent is not valid JSON
 * @example
 * ```ts
 * // docs (not published) has "peerDependencies": { "core": "^1.2.0" }, core goes 1.2.0 -> 2.0.0
 * findStalePeerDependents({ workspacePackages: [docs, core], bumpedPackages: [core], publishedPackages: [core] })
 * // [{ dependent: 'docs', dependency: 'core', field: 'peerDependencies', range: '^1.2.0', oldVersion: '1.2.0', newVersion: '2.0.0' }]
 * ```
 */
export function findStalePeerDependents({
  workspacePackages,
  bumpedPackages,
  publishedPackages,
  refs,
}: {
  /**
   * Every package of the workspace
   */
  workspacePackages: Iterable<ReadPackage>
  /**
   * Packages bumped by the run, with their version before and after the bump
   */
  bumpedPackages: (PackageBase & { oldVersion: string })[]
  /**
   * Packages published by the run
   */
  publishedPackages: PackageBase[]
  /**
   * Ref of the last release of each dependent (its last tag), by name
   */
  refs?: Map<string, string>
}): StaleDependent[] {
  const bumped = new Map(bumpedPackages
    .filter(pkg => pkg.newVersion && pkg.newVersion !== pkg.oldVersion)
    .map(pkg => [
      pkg.name,
      { oldVersion: pkg.oldVersion, newVersion: pkg.newVersion! },
    ]))
  const published = new Set(publishedPackages.map(pkg => pkg.name))

  if (bumped.size === 0) {
    return []
  }

  return [
    ...workspacePackages,
  ]
    .filter(dependent => !dependent.private && !published.has(dependent.name))
    .flatMap(dependent => getOutOfRangePeers({
      packagePath: dependent.path,
      bumped,
      ref: refs?.get(dependent.name),
    })
      .map(peer => ({ dependent: dependent.name, ...peer })))
}
