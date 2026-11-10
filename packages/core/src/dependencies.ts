import type { DependencyField } from './peers'
import type { CoreLogger, PackageBase } from './types'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The workspace packages a package depends on, through the dependency fields
 * of `dependencyTypes` (none when it is not set). Reads the `package.json` of
 * the package, and returns an empty list when it has none.
 *
 * @param options - The options
 * @param options.packagePath - Directory of the package
 * @param options.allPackageNames - The names of the workspace packages
 * @param options.dependencyTypes - The dependency fields to follow (`dependencies`, `peerDependencies`, `devDependencies`); `undefined` follows none and returns `[]`
 * @returns The names of the workspace packages it depends on (each once; `dependencies`, then `peerDependencies`, then `devDependencies` order)
 * @throws When the `package.json` is not valid JSON
 * @example
 * ```ts
 * getPackageDependencies({
 *   packagePath: '/repo/packages/cli',
 *   allPackageNames: new Set(['core', 'cli']),
 *   dependencyTypes: ['dependencies', 'peerDependencies'],
 * })
 * // ['core']
 * ```
 */
export function getPackageDependencies({
  packagePath,
  allPackageNames,
  dependencyTypes,
}: {
  /** Directory of the package */
  packagePath: string
  /** The names of the workspace packages */
  allPackageNames: Set<string>
  /** The dependency fields to follow */
  dependencyTypes: DependencyField[] | undefined
}): string[] {
  const packageJsonPath = join(packagePath, 'package.json')
  if (!existsSync(packageJsonPath)) {
    return []
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  const deps: string[] = []

  // Only check dependencies and peerDependencies (not devDependencies per industry best practices)
  const allDeps = {
    ...(dependencyTypes?.includes('dependencies')
      ? packageJson.dependencies
      : {}),
    ...(dependencyTypes?.includes('peerDependencies')
      ? packageJson.peerDependencies
      : {}),
    ...(dependencyTypes?.includes('devDependencies')
      ? packageJson.devDependencies
      : {}),
  }

  for (const depName of Object.keys(allDeps)) {
    if (allPackageNames.has(depName)) {
      deps.push(depName)
    }
  }

  return deps
}

/**
 * The packages that depend on the given package (direct dependents only; see
 * `expandPackagesToBumpWithDependents` for the transitive ones).
 *
 * @param options - The options
 * @param options.allPackages - Packages, each with the names of its dependencies (e.g. from `getPackageDependencies`)
 * @param options.packageName - Name of the package
 * @returns The entries of `allPackages` whose `dependencies` list includes `packageName`, as given (same objects, original order); empty when none
 * @example
 * ```ts
 * getDependentsOf({ allPackages: [{ name: 'cli', dependencies: ['core'] }], packageName: 'core' })
 * // [{ name: 'cli', dependencies: ['core'] }]
 * ```
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
 * Expand the packages to bump with all their dependents, transitive ones
 * included. Returns the packages with the reason they are bumped for and the
 * dependency chain that bumps them, for traceability.
 *
 * @param options - The options
 * @param options.allPackages - Every package of the workspace, each with its `dependencies` (names) filled
 * @param options.packagesWithCommits - The packages that are bumped for their own commits
 * @param options.logger - Receives debug messages
 * @returns The packages to bump: `reason: 'commits'` for the given ones, `reason: 'dependency'` with a `dependencyChain` for their dependents
 * @example
 * ```ts
 * // cli depends on core, app depends on cli
 * expandPackagesToBumpWithDependents({ allPackages, packagesWithCommits: [core] })
 * // core (commits), cli (dependency, chain ['core']), app (dependency, chain ['core', 'cli'])
 * ```
 */
export function expandPackagesToBumpWithDependents({
  allPackages,
  packagesWithCommits,
  logger,
}: {
  /** Every package of the workspace */
  allPackages: PackageBase[]
  /** The packages that are bumped for their own commits */
  packagesWithCommits: PackageBase[]
  /** Receives debug messages */
  logger?: CoreLogger
}) {
  const result = new Map<string, PackageBase>()

  logger?.debug?.(`Expanding packages to bump: ${packagesWithCommits.length} packages with commits, ${allPackages.length} total packages`)

  for (const pkg of packagesWithCommits) {
    const packageToBump = {
      ...pkg,
      reason: 'commits',
    } satisfies Omit<PackageBase, 'newVersion'>

    result.set(pkg.name, packageToBump)
  }

  const toProcess = [
    ...packagesWithCommits.map(p => p.name),
  ]
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

          logger?.debug?.(`${dependent.name} will be bumped (depends on ${chain.join(' → ')})`)
        }
      }
    }
  }

  return Array.from(result.values())
}

/**
 * Topological sort of packages based on their dependencies: a package comes
 * after the packages it depends on. A circular dependency is reported with
 * `logger.warn` and the edge that closes the cycle is skipped (no error is thrown). Dependencies that are not in `packages` are ignored.
 *
 * @param packages - The packages, with the names of their dependencies
 * @param logger - Receives the circular dependency warning
 * @returns A new array with the same package objects, dependencies first; input order is kept between independent packages
 * @example
 * ```ts
 * // cli depends on core
 * topologicalSort([cli, core]).map(pkg => pkg.name) // ['core', 'cli']
 * ```
 */
export function topologicalSort(packages: PackageBase[], logger?: CoreLogger): PackageBase[] {
  const sorted: PackageBase[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  const packageMap = new Map<string, PackageBase>()
  for (const pkg of packages) {
    packageMap.set(pkg.name, pkg)
  }

  function visit(pkgName: string, path: string[] = []) {
    logger?.debug?.(`Visiting ${pkgName}, path: ${path.join(' → ')}, visiting: ${Array.from(visiting).join(', ')}`)

    if (visiting.has(pkgName)) {
      const cycle = [...path, pkgName]
      logger?.warn?.(`Circular dependency detected: ${cycle.join(' → ')}`)
      return
    }

    if (visited.has(pkgName)) {
      logger?.debug?.(`${pkgName} already visited globally, skipping`)
      return
    }

    visiting.add(pkgName)
    logger?.debug?.(`Added ${pkgName} to visiting set`)

    const pkg = packageMap.get(pkgName)
    if (!pkg) {
      logger?.debug?.(`Package ${pkgName} not found in packageMap`)
      visiting.delete(pkgName)
      return
    }

    logger?.debug?.(`${pkgName} has dependencies: ${pkg.dependencies.join(', ')}`)

    for (const depName of pkg.dependencies) {
      visit(depName, [...path, pkgName])
    }

    visiting.delete(pkgName)
    visited.add(pkgName)
    sorted.push(pkg)
    logger?.debug?.(`Finished visiting ${pkgName}`)
  }

  for (const pkg of packages) {
    visit(pkg.name)
  }

  return sorted
}
