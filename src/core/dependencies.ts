import type { BumpConfig, PackageBase } from '../types'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '@maz-ui/node'

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
