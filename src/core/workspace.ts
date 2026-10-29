import type { PackageBase, ReadPackage } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '@maz-ui/node'
import fastGlob from 'fast-glob'
import { getOutOfRangePeers, parseWorkspaceSpecifier, topologicalSort } from './dependencies'
import { GLOB_IGNORE } from './glob'
import { getMonorepoPackagePatterns } from './groups'
import { isVersionPublished, resolveRegistryTargetsForPackage } from './npm'
import { readPackageJson } from './repo'

/**
 * Dependency fields the package manager resolves when a published package is
 * installed: a package must be published after the internal packages listed
 * there, and their `workspace:` specifiers must resolve to installable versions.
 */
export const PUBLISH_DEPENDENCY_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'] as const

type DependencyMap = Partial<Record<typeof PUBLISH_DEPENDENCY_FIELDS[number], Record<string, string>>>

function readDependencyFields(packagePath: string): DependencyMap {
  const packageJsonPath = join(packagePath, 'package.json')

  if (!existsSync(packageJsonPath)) {
    return {}
  }

  return JSON.parse(readFileSync(packageJsonPath, 'utf8')) as DependencyMap
}

/**
 * Sort the packages to publish so that each package comes after the internal
 * packages it depends on through `dependencies`, `peerDependencies` or
 * `optionalDependencies`, whatever `bump.dependencyTypes` is (that option only
 * drives which dependents get bumped).
 */
export function sortPackagesForPublish<T extends PackageBase>(packages: T[]): T[] {
  const names = new Set(packages.map(pkg => pkg.name))
  const byName = new Map(packages.map(pkg => [pkg.name, pkg]))

  const withPublishDependencies = packages.map((pkg) => {
    const fields = readDependencyFields(pkg.path)
    const dependencies = PUBLISH_DEPENDENCY_FIELDS
      .flatMap(field => Object.keys(fields[field] ?? {}))
      .filter(name => names.has(name) && name !== pkg.name)

    return { ...pkg, dependencies: [...new Set(dependencies)] }
  })

  return topologicalSort(withPublishDependencies).map(pkg => byName.get(pkg.name)!)
}

/**
 * Every package of the workspace that relizy knows about (the packages matched
 * by `monorepo.packages` or the version groups, private and ignored ones
 * included), by name.
 */
export function readWorkspacePackages(config: ResolvedRelizyConfig): Map<string, ReadPackage> {
  const packages = new Map<string, ReadPackage>()

  const directories = fastGlob.sync(getMonorepoPackagePatterns(config) ?? [], {
    cwd: config.cwd,
    onlyDirectories: true,
    absolute: true,
    ignore: GLOB_IGNORE,
  })

  for (const directory of [config.cwd, ...directories]) {
    if (!existsSync(join(directory, 'package.json'))) {
      continue
    }

    try {
      const pkg = readPackageJson(directory)

      if (pkg) {
        packages.set(pkg.name, pkg)
      }
    }
    catch (error) {
      logger.debug(`Cannot read the package of ${directory}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return packages
}

interface WorkspaceDependency {
  field: string
  target: ReadPackage
  /**
   * Version the package manager writes in place of the `workspace:` specifier
   */
  version: string
}

/**
 * The internal dependencies of a package declared with a `workspace:` specifier
 * resolved to the local version, with that version.
 */
function getWorkspaceDependencies({
  pkg,
  workspacePackages,
  plannedVersions,
}: {
  pkg: PackageBase
  workspacePackages: Map<string, ReadPackage>
  plannedVersions: Map<string, string>
}): WorkspaceDependency[] {
  const fields = readDependencyFields(pkg.path)
  const dependencies: WorkspaceDependency[] = []

  for (const field of PUBLISH_DEPENDENCY_FIELDS) {
    for (const [dependencyName, specifier] of Object.entries(fields[field] ?? {})) {
      const workspaceDependency = parseWorkspaceSpecifier(dependencyName, specifier)
      const target = workspaceDependency && workspacePackages.get(workspaceDependency.target)

      if (target) {
        dependencies.push({ field, target, version: plannedVersions.get(target.name) ?? target.version })
      }
      else if (workspaceDependency) {
        logger.debug(`${pkg.name}: ${dependencyName} (${specifier}) is not a known workspace package, not checked`)
      }
    }
  }

  return dependencies
}

interface UnresolvedWorkspaceDependency {
  dependent: string
  field: string
  dependency: string
  version: string
  /**
   * `missing`: the registry confirms the version does not exist;
   * `unknown`: the registry could not be queried.
   */
  status: 'missing' | 'unknown'
}

/**
 * Check the internal dependencies declared with the `workspace:` protocol by the
 * packages about to be published. The package manager replaces them with the
 * version of the workspace package; that version must be published by this run
 * or already be on the registry, otherwise the published package cannot be
 * installed. Read-only: the replacement itself stays the package manager's job.
 *
 * Throws when the registry confirms a version is missing, warns when the
 * registry cannot be queried.
 */
export async function checkWorkspaceDependencies({
  config,
  packages,
  plannedVersions = new Map(),
}: {
  config: ResolvedRelizyConfig
  /**
   * Packages about to be published, with their new version
   */
  packages: PackageBase[]
  /**
   * New versions of the packages bumped by this run (not written on disk in dry-run)
   */
  plannedVersions?: Map<string, string>
}): Promise<void> {
  if (config.publish.checkWorkspaceDependencies === false) {
    logger.debug('Workspace dependencies check disabled (publish.checkWorkspaceDependencies)')
    return
  }

  const workspacePackages = readWorkspacePackages(config)
  // The version actually published: the one planned by the run (not written on disk in dry-run), or the one on disk
  const published = new Map(packages.map(pkg => [pkg.name, plannedVersions.get(pkg.name) ?? workspacePackages.get(pkg.name)?.version ?? pkg.version]))
  const registryChecks = new Map<string, Promise<boolean | null>>()

  const dependencies = packages.flatMap(pkg => getWorkspaceDependencies({ pkg, workspacePackages, plannedVersions })
    .filter(dependency => published.get(dependency.target.name) !== dependency.version)
    .map((dependency) => {
      const key = `${dependency.target.name}@${dependency.version}`

      if (!registryChecks.has(key)) {
        registryChecks.set(key, queryRegistries({ config, target: dependency.target, version: dependency.version }))
      }

      return { dependent: pkg.name, ...dependency, onRegistry: registryChecks.get(key)! }
    }))

  // The registry queries run in parallel
  const results = await Promise.all(dependencies.map(async dependency => ({ ...dependency, onRegistry: await dependency.onRegistry })))

  const unresolved: UnresolvedWorkspaceDependency[] = results
    .filter(({ onRegistry }) => onRegistry !== true)
    .map(({ dependent, field, target, version, onRegistry }) => ({
      dependent,
      field,
      dependency: target.name,
      version,
      status: onRegistry === false ? 'missing' : 'unknown',
    }))

  reportUnresolvedWorkspaceDependencies(unresolved)
}

/**
 * True when the version is on one of the registries the dependency is published
 * to, false when every registry confirms it is missing, null when a registry
 * could not be queried.
 */
async function queryRegistries({
  config,
  target,
  version,
}: {
  config: ResolvedRelizyConfig
  target: ReadPackage
  version: string
}): Promise<boolean | null> {
  const pkg = { ...target, fromTag: '', commits: [], dependencies: [] } satisfies PackageBase
  let inconclusive = false

  for (const registryTarget of resolveRegistryTargetsForPackage(pkg, config)) {
    const published = await isVersionPublished({
      pkg,
      version,
      config,
      packageManager: config.publish.packageManager,
      registryTarget,
    })

    if (published) {
      return true
    }

    inconclusive ||= published === null
  }

  return inconclusive ? null : false
}

function formatUnresolved(dependency: UnresolvedWorkspaceDependency): string {
  return `  - ${dependency.dependent} (${dependency.field}): ${dependency.dependency}@${dependency.version}`
}

function reportUnresolvedWorkspaceDependencies(unresolved: UnresolvedWorkspaceDependency[]): void {
  const unknown = unresolved.filter(dependency => dependency.status === 'unknown')
  const missing = unresolved.filter(dependency => dependency.status === 'missing')

  if (unknown.length > 0) {
    logger.warn(
      'Cannot check on the registry the versions some workspace dependencies resolve to:\n'
      + `${unknown.map(formatUnresolved).join('\n')}\n`
      + 'Make sure they are published, otherwise the packages depending on them cannot be installed.',
    )
  }

  if (missing.length > 0) {
    throw new Error(
      'Some workspace dependencies resolve to versions that are neither published by this release nor on the registry:\n'
      + `${missing.map(formatUnresolved).join('\n')}\n`
      + 'The published packages could not be installed. Publish these versions (or include their packages in the release), '
      + 'or disable this check with publish.checkWorkspaceDependencies: false.',
    )
  }
}

export interface StaleDependent {
  dependent: string
  dependency: string
  range: string
  newVersion: string
}

/**
 * Find the packages that are not released by this run while their published
 * peer dependency ranges do not accept the new version of an internal
 * dependency: their consumers get peer dependency warnings, or errors with
 * `strict-peer-dependencies`.
 *
 * The published range is computed from the version the dependency had before
 * this release, so only the ranges this release breaks are reported.
 */
export function findStalePeerDependents({
  config,
  bumpedPackages,
  publishedPackages,
}: {
  config: ResolvedRelizyConfig
  /**
   * Packages bumped by this run, with their version before and after the bump
   */
  bumpedPackages: (PackageBase & { oldVersion: string })[]
  /**
   * Packages published by this run
   */
  publishedPackages: PackageBase[]
}): StaleDependent[] {
  const bumped = new Map(bumpedPackages
    .filter(pkg => pkg.newVersion && pkg.newVersion !== pkg.oldVersion)
    .map(pkg => [pkg.name, { oldVersion: pkg.oldVersion, newVersion: pkg.newVersion! }]))
  const published = new Set(publishedPackages.map(pkg => pkg.name))

  if (bumped.size === 0) {
    return []
  }

  return [...readWorkspacePackages(config).values()]
    .filter(dependent => !dependent.private && !published.has(dependent.name))
    .flatMap(dependent => getOutOfRangePeers({ packagePath: dependent.path, bumped })
      .map(peer => ({ dependent: dependent.name, ...peer })))
}

/**
 * Report the packages not released whose published peer dependency ranges
 * reject the new versions (see `findStalePeerDependents`): an error with
 * `bump.outOfRangePeers: 'error'`, a warning otherwise.
 */
export function reportStalePeerDependents(options: Parameters<typeof findStalePeerDependents>[0]): void {
  if (options.config.publish.checkWorkspaceDependencies === false) {
    return
  }

  const stale = findStalePeerDependents(options)

  if (stale.length === 0) {
    return
  }

  const lines = stale.map(({ dependent, dependency, range, newVersion }) => `  - ${dependent}: ${dependency} "${range}" does not accept ${newVersion}`)
  const message = 'Some packages are not released while their published peer dependencies do not accept the new versions:\n'
    + `${lines.join('\n')}\n`
    + 'Their consumers get peer dependency warnings, or errors with strict-peer-dependencies. Release them too '
    + '(with bump.outOfRangePeers: \'bump\', the packages of the release are bumped automatically).'

  if (options.config.bump.outOfRangePeers === 'error') {
    throw new Error(message)
  }

  logger.warn(message)
}
