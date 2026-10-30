import type { BumpResult, BumpResultTruthy, GroupBumpResult, VersionGroup, VersionMode } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { logger } from '@maz-ui/node'
import fastGlob from 'fast-glob'
import { GLOB_IGNORE } from './glob'

const VERSION_MODES: VersionMode[] = ['unified', 'selective', 'independent']

/**
 * A version group with the config its packages are released with: the global
 * config where `monorepo` describes this group only (its version mode, its
 * packages, and the packages of the other groups as ignored).
 */
export interface ResolvedVersionGroup {
  group: VersionGroup
  config: ResolvedRelizyConfig
  /**
   * Directories (relative to `cwd`, POSIX separators) of the packages of this group
   */
  packagePaths: string[]
}

/**
 * Configs derived for a group by `resolveVersionGroups`, with the name of their group.
 * `loadRelizyConfig` returns them as they are instead of loading the config file
 * again, which would bring `monorepo.groups` back.
 */
const groupConfigs = new WeakMap<object, string>()

export function getVersionGroupName(config: ResolvedRelizyConfig): string | undefined {
  return groupConfigs.get(config)
}

export function markVersionGroupConfig(config: ResolvedRelizyConfig, name: string): ResolvedRelizyConfig {
  groupConfigs.set(config, name)
  return config
}

/**
 * True when the config releases several version groups (`monorepo.groups`).
 * A config derived for a single group is not.
 */
export function hasVersionGroups(config: ResolvedRelizyConfig): boolean {
  return Boolean(config.monorepo?.groups?.length) && !groupConfigs.has(config)
}

function isRootVersionMode(versionMode: VersionMode): boolean {
  return versionMode !== 'independent'
}

/**
 * Check the shape of `monorepo.groups`. The packages they match are checked
 * later by `resolveVersionGroups`, when a command needs them.
 */
export function validateVersionGroups(config: ResolvedRelizyConfig): void {
  const monorepo = config.monorepo

  if (!monorepo || monorepo.groups === undefined) {
    return
  }

  if (!Array.isArray(monorepo.groups) || monorepo.groups.length === 0) {
    throw new Error('monorepo.groups must be a non-empty array of version groups')
  }

  if (monorepo.versionMode || monorepo.packages) {
    throw new Error('monorepo.versionMode and monorepo.packages cannot be used with monorepo.groups: set them on each group')
  }

  const names = new Set<string>()
  const rootGroups: string[] = []

  for (const group of monorepo.groups) {
    if (!group?.name || typeof group.name !== 'string') {
      throw new Error('Each version group of monorepo.groups needs a name')
    }

    if (names.has(group.name)) {
      throw new Error(`Version group "${group.name}" is defined twice in monorepo.groups`)
    }

    names.add(group.name)

    if (!VERSION_MODES.includes(group.versionMode)) {
      throw new Error(`Version group "${group.name}" has an invalid versionMode "${group.versionMode}" (expected ${VERSION_MODES.join(', ')})`)
    }

    if (!Array.isArray(group.packages) || group.packages.length === 0) {
      throw new Error(`Version group "${group.name}" needs at least one pattern in packages`)
    }

    if (isRootVersionMode(group.versionMode)) {
      rootGroups.push(group.name)
    }
  }

  if (rootGroups.length > 1) {
    throw new Error(
      `Only one version group can use the unified or selective mode (found ${rootGroups.join(', ')}): `
      + 'it owns the root package.json version and the repository tags. Use the independent mode for the other groups.',
    )
  }
}

function globDirectories(cwd: string, patterns: string[]): string[] {
  return patterns.length > 0
    ? fastGlob.sync(patterns, { cwd, onlyDirectories: true, absolute: true, ignore: GLOB_IGNORE })
    : []
}

function toPosixRelative(cwd: string, absolutePath: string): string {
  return relative(cwd, absolutePath).split(sep).join('/')
}

/**
 * True when the pattern is the path itself rather than a glob matching it
 * (`shared/nav`, `./shared/nav/`, or with escaped glob characters).
 */
function isExactPathPattern(pattern: string, path: string): boolean {
  const literal = pattern.replace(/\\(.)/g, '$1').replace(/^\.\//, '').replace(/\/$/, '')

  return literal === path
}

const warnedOverlaps = new Set<string>()

interface GroupMatch {
  group: string
  exact: boolean
}

/**
 * The groups matching each package directory (relative to `cwd`), and whether
 * they list its exact path.
 */
function collectGroupMatches({ cwd, groups, ignored }: { cwd: string, groups: VersionGroup[], ignored?: string[] }): Map<string, GroupMatch[]> {
  const matchesByPath = new Map<string, GroupMatch[]>()

  for (const group of groups) {
    const ignoredDirs = new Set(globDirectories(cwd, [...(ignored ?? []), ...(group.ignored ?? [])]))

    for (const pattern of group.packages) {
      for (const absolutePath of globDirectories(cwd, [pattern])) {
        if (ignoredDirs.has(absolutePath) || !existsSync(join(absolutePath, 'package.json'))) {
          continue
        }

        const path = toPosixRelative(cwd, absolutePath)
        const exact = isExactPathPattern(pattern, path)
        const pathMatches = matchesByPath.get(path) ?? []
        const existing = pathMatches.find(match => match.group === group.name)

        if (existing) {
          existing.exact ||= exact
        }
        else {
          pathMatches.push({ group: group.name, exact })
        }

        matchesByPath.set(path, pathMatches)
      }
    }
  }

  return matchesByPath
}

/**
 * Assign each package directory matched by the groups to one group. A package
 * matched by several groups goes to the group listing its exact path (a pattern
 * without glob); any other overlap is ambiguous and throws. The directories
 * ignored globally (`ignored`) or by a group (its `ignored` option) are not
 * matched by that group.
 */
export function assignPackagesToGroups({ cwd, groups, ignored }: { cwd: string, groups: VersionGroup[], ignored?: string[] }): Map<string, string[]> {
  const matchesByPath = collectGroupMatches({ cwd, groups, ignored })
  const pathsByGroup = new Map<string, string[]>(groups.map(group => [group.name, []]))

  for (const [path, pathMatches] of matchesByPath) {
    if (pathMatches.length === 1) {
      pathsByGroup.get(pathMatches[0]!.group)!.push(path)
      continue
    }

    const groupNames = pathMatches.map(match => match.group).join(', ')
    const exactMatches = pathMatches.filter(match => match.exact)

    if (exactMatches.length !== 1) {
      throw new Error(
        `Package "${path}" is matched by several version groups (${groupNames}). `
        + 'List its exact path in the group it belongs to (an exact path wins over a glob), or exclude it with the ignored option of the other groups.',
      )
    }

    const winner = exactMatches[0]!.group
    const warning = `Package "${path}" is matched by several version groups (${groupNames}): assigned to "${winner}", which lists its exact path`

    // Each release step resolves the groups: warn once per run
    if (!warnedOverlaps.has(`${cwd}:${warning}`)) {
      warnedOverlaps.add(`${cwd}:${warning}`)
      logger.warn(warning)
    }

    pathsByGroup.get(winner)!.push(path)
  }

  for (const paths of pathsByGroup.values()) {
    paths.sort()
  }

  return pathsByGroup
}

function deriveGroupConfig({
  config,
  group,
  otherGroupsPaths,
}: {
  config: ResolvedRelizyConfig
  group: VersionGroup
  otherGroupsPaths: string[]
}): ResolvedRelizyConfig {
  const groupConfig = {
    ...config,
    monorepo: {
      versionMode: group.versionMode,
      packages: group.packages,
      // The packages of the other groups are released by their own group: they
      // must stay out of this group, including its root version and changelog.
      ignored: [...new Set([...(config.monorepo?.ignored ?? []), ...(group.ignored ?? []), ...otherGroupsPaths.map(path => fastGlob.escapePath(path))])],
      ignorePackageNames: config.monorepo?.ignorePackageNames,
      includePrivates: config.monorepo?.includePrivates,
    },
    bump: { ...config.bump, ...group.bump },
    changelog: { ...config.changelog, ...group.changelog },
  } as ResolvedRelizyConfig

  return markVersionGroupConfig(groupConfig, group.name)
}

/**
 * Fail when version groups are targeted (`--group`) on a config without
 * `monorepo.groups`, instead of silently releasing every package.
 */
export function assertVersionGroupsOption({ config, groups }: { config: ResolvedRelizyConfig, groups?: string[] }): void {
  if (groups?.length && !config.monorepo?.groups?.length && !groupConfigs.has(config)) {
    throw new Error(`Version group(s) ${groups.join(', ')} targeted, but the config has no monorepo.groups`)
  }
}

/**
 * Resolve the version groups of the config (in their declaration order), each
 * with the config its packages are released with.
 */
export function resolveVersionGroups({
  config,
  only,
}: {
  config: ResolvedRelizyConfig
  only?: string[]
}): ResolvedVersionGroup[] {
  const groups = config.monorepo?.groups ?? []

  for (const name of only ?? []) {
    if (!groups.some(group => group.name === name)) {
      throw new Error(`Unknown version group "${name}" (available: ${groups.map(group => group.name).join(', ')})`)
    }
  }

  const pathsByGroup = assignPackagesToGroups({ cwd: config.cwd, groups, ignored: config.monorepo?.ignored })

  return groups
    .filter(group => !only?.length || only.includes(group.name))
    .map((group) => {
      const otherGroupsPaths = groups
        .filter(other => other.name !== group.name)
        .flatMap(other => pathsByGroup.get(other.name) ?? [])

      return {
        group,
        config: deriveGroupConfig({ config, group, otherGroupsPaths }),
        packagePaths: pathsByGroup.get(group.name) ?? [],
      }
    })
}

/**
 * The result of a group in the bump result of a grouped release. Returns null
 * when the group did not bump, and undefined when there is no bump result (the
 * command then computes the packages of the group itself).
 */
export function getGroupBumpResult(bumpResult: BumpResultTruthy | undefined, name: string): GroupBumpResult | null | undefined {
  if (!bumpResult) {
    return undefined
  }

  if (!bumpResult.groups) {
    throw new Error('The bump result does not come from a grouped bump (monorepo.groups): it has no result per group')
  }

  return bumpResult.groups.find(group => group.name === name) ?? null
}

/**
 * Merge the results of the groups into one bump result (see `BumpResultTruthy.groups`).
 */
export function mergeGroupBumpResults(results: { group: VersionGroup, result: BumpResult }[]): BumpResult {
  const groups: GroupBumpResult[] = results
    .filter((entry): entry is { group: VersionGroup, result: BumpResultTruthy } => entry.result.bumped)
    .map(({ group, result }) => ({
      ...result,
      name: group.name,
      versionMode: group.versionMode,
    }))

  if (groups.length === 0) {
    return { bumped: false }
  }

  const rootGroup = groups.find(group => isRootVersionMode(group.versionMode))

  return {
    bumped: true,
    oldVersion: rootGroup?.oldVersion,
    newVersion: rootGroup?.newVersion,
    fromTag: rootGroup?.fromTag,
    rootPackage: rootGroup?.rootPackage,
    bumpedPackages: groups.flatMap(group => group.bumpedPackages),
    groups,
  }
}

/**
 * The result of the `unified`/`selective` group, when it bumped.
 */
export function getRootGroupBumpResult(groups: GroupBumpResult[] | undefined): GroupBumpResult | undefined {
  return groups?.find(group => isRootVersionMode(group.versionMode))
}

/**
 * Glob patterns of every package of the monorepo: `monorepo.packages`, or the
 * packages of every version group.
 */
export function getMonorepoPackagePatterns(config: ResolvedRelizyConfig): string[] | undefined {
  if (config.monorepo?.groups) {
    return [...new Set(config.monorepo.groups.flatMap(group => group.packages))]
  }

  return config.monorepo?.packages
}

/**
 * True when the release has a repository version (the root `package.json`
 * version, tagged with `templates.tagBody`): in `unified`/`selective` mode, or
 * with version groups when the `unified`/`selective` group is released.
 */
export function hasRepositoryVersion(config: ResolvedRelizyConfig, bumpResult?: BumpResultTruthy): boolean {
  if (hasVersionGroups(config)) {
    return bumpResult?.groups
      ? Boolean(getRootGroupBumpResult(bumpResult.groups))
      : config.monorepo!.groups!.some(group => isRootVersionMode(group.versionMode))
  }

  return config.monorepo?.versionMode !== 'independent'
}
