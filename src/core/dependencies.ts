import type { BumpConfig, PackageBase } from '../types'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '@maz-ui/node'
import * as semver from 'semver'

/**
 * Get workspace dependencies of a package (only dependencies and peerDependencies, not devDependencies)
 */
export function getPackageDependencies({
  packagePath,
  allPackageNames,
  dependencyTypes,
}: {
  packagePath: string
  allPackageNames: Set<string>
  dependencyTypes: BumpConfig['dependencyTypes']
}): string[] {
  const packageJsonPath = join(packagePath, 'package.json')
  if (!existsSync(packageJsonPath)) {
    return []
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  const deps: string[] = []

  // Only check dependencies and peerDependencies (not devDependencies per industry best practices)
  const allDeps = {
    ...(dependencyTypes?.includes('dependencies') ? packageJson.dependencies : {}),
    ...(dependencyTypes?.includes('peerDependencies') ? packageJson.peerDependencies : {}),
    ...(dependencyTypes?.includes('devDependencies') ? packageJson.devDependencies : {}),
  }

  for (const depName of Object.keys(allDeps)) {
    if (allPackageNames.has(depName)) {
      deps.push(depName)
    }
  }

  return deps
}

/**
 * Get all packages that depend on the given package name
 */
export function getDependentsOf({
  allPackages,
  packageName,
}: {
  allPackages: {
    name: string
    dependencies: string[]
  }[]
  packageName: string
}) {
  return allPackages.filter(pkg =>
    pkg.dependencies.includes(packageName),
  )
}

/**
 * Recursively expand packages to bump with all their dependents (transitive)
 * Returns packages with reason for bumping and dependency chain for traceability
 */

export function expandPackagesToBumpWithDependents({
  allPackages,
  packagesWithCommits,
}: {
  allPackages: PackageBase[]
  packagesWithCommits: PackageBase[]
}) {
  const result = new Map<string, PackageBase>()

  logger.debug(`Expanding packages to bump: ${packagesWithCommits.length} packages with commits, ${allPackages.length} total packages`)

  for (const pkg of packagesWithCommits) {
    const packageToBump = {
      ...pkg,
      reason: 'commits',
    } satisfies Omit<PackageBase, 'newVersion'>

    result.set(pkg.name, packageToBump)
  }

  const toProcess = [...packagesWithCommits.map(p => p.name)]
  const processed = new Set<string>()

  while (toProcess.length > 0) {
    const currentPkgName = toProcess.shift()

    if (!currentPkgName || processed.has(currentPkgName)) {
      continue
    }

    processed.add(currentPkgName)

    // Find all packages that depend on current package
    const dependents = getDependentsOf({
      packageName: currentPkgName,
      allPackages,
    })

    for (const dependent of dependents) {
      if (!result.has(dependent.name)) {
        // Build dependency chain for logging
        const currentChain = result.get(currentPkgName)?.dependencyChain || []
        const chain = [...currentChain, currentPkgName]

        const packageBase = allPackages.find(p => p.name === dependent.name)

        if (packageBase) {
          const packageToBump = {
            ...packageBase,
            reason: 'dependency',
            dependencyChain: chain,
          } satisfies PackageBase

          result.set(dependent.name, packageToBump)

          toProcess.push(dependent.name)

          logger.debug(`${dependent.name} will be bumped (depends on ${chain.join(' → ')})`)
        }
      }
    }
  }

  return Array.from(result.values())
}

/**
 * Topological sort of packages based on their dependencies
 * Ensures dependencies are processed before dependents
 */
export function topologicalSort(packages: PackageBase[]): PackageBase[] {
  const sorted: PackageBase[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  const packageMap = new Map<string, PackageBase>()
  for (const pkg of packages) {
    packageMap.set(pkg.name, pkg)
  }

  function visit(pkgName: string, path: string[] = []) {
    logger.debug(`Visiting ${pkgName}, path: ${path.join(' → ')}, visiting: ${Array.from(visiting).join(', ')}`)

    if (visiting.has(pkgName)) {
      const cycle = [...path, pkgName]
      logger.warn(`Circular dependency detected: ${cycle.join(' → ')}`)
      return
    }

    if (visited.has(pkgName)) {
      logger.debug(`${pkgName} already visited globally, skipping`)
      return
    }

    visiting.add(pkgName)
    logger.debug(`Added ${pkgName} to visiting set`)

    const pkg = packageMap.get(pkgName)
    if (!pkg) {
      logger.debug(`Package ${pkgName} not found in packageMap`)
      visiting.delete(pkgName)
      return
    }

    logger.debug(`${pkgName} has dependencies: ${pkg.dependencies.join(', ')}`)

    for (const depName of pkg.dependencies) {
      visit(depName, [...path, pkgName])
    }

    visiting.delete(pkgName)
    visited.add(pkgName)
    sorted.push(pkg)
    logger.debug(`Finished visiting ${pkgName}`)
  }

  for (const pkg of packages) {
    visit(pkg.name)
  }

  return sorted
}

const LOCAL_VERSION_RANGES = new Set(['*', '^', '~', ''])

/**
 * The workspace package and the range of a `workspace:` specifier, also through
 * an alias (`workspace:other-name@^`), or null for another protocol.
 */
export function parseWorkspaceProtocol(dependencyName: string, specifier: string): { target: string, range: string } | null {
  if (!specifier.startsWith('workspace:')) {
    return null
  }

  const range = specifier.slice('workspace:'.length)
  const alias = /^(@[^/@]+\/[^@]+|[^@]+)@(.*)$/.exec(range)

  return alias ? { target: alias[1]!, range: alias[2]! } : { target: dependencyName, range }
}

/**
 * A `workspace:` specifier the package manager replaces with the version of the
 * workspace package: `workspace:*`, `workspace:^`, `workspace:~`, also through an
 * alias (`workspace:other-name@^`). Explicit ranges (`workspace:^1.2.0`) are
 * published as the range itself, not as the local version: they return null.
 */
export function parseWorkspaceSpecifier(dependencyName: string, specifier: string): { target: string } | null {
  const workspaceProtocol = parseWorkspaceProtocol(dependencyName, specifier)

  return workspaceProtocol && LOCAL_VERSION_RANGES.has(workspaceProtocol.range) ? { target: workspaceProtocol.target } : null
}

/**
 * The range a dependency specifier is published as, with the version the
 * dependency had when the package was published: `workspace:^` becomes
 * `^1.2.0`, an explicit range stays as is. Null when it is not a semver range
 * (`catalog:`, `npm:`, `link:`...).
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

  return semver.validRange(range) ? { target, range } : null
}

/**
 * Version of a package before and after a bump
 */
export interface VersionChange {
  oldVersion: string
  newVersion: string
}

/**
 * The peer dependencies of a package whose published range (computed with the
 * version the dependency had before the bump) does not accept the new version
 * of the dependency.
 */
export function getOutOfRangePeers({
  packagePath,
  bumped,
}: {
  packagePath: string
  bumped: Map<string, VersionChange>
}): { dependency: string, range: string, newVersion: string }[] {
  const packageJsonPath = join(packagePath, 'package.json')

  if (bumped.size === 0 || !existsSync(packageJsonPath)) {
    return []
  }

  const { peerDependencies = {} } = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { peerDependencies?: Record<string, string> }
  const outOfRange: { dependency: string, range: string, newVersion: string }[] = []

  for (const [dependencyName, specifier] of Object.entries(peerDependencies)) {
    const change = bumped.get(parseWorkspaceProtocol(dependencyName, specifier)?.target ?? dependencyName)
    const published = change && getPublishedRange({ dependencyName, specifier, dependencyVersion: change.oldVersion })

    if (change && published && !semver.satisfies(change.newVersion, published.range, { includePrerelease: true })) {
      outOfRange.push({ dependency: published.target, range: published.range, newVersion: change.newVersion })
    }
  }

  return outOfRange
}
