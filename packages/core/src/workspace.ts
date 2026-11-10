import type { CoreLogger, PackageBase, PrivatePackages, ReadPackage } from './types'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import fastGlob from 'fast-glob'
import { topologicalSort } from './dependencies'
import { GLOB_IGNORE } from './glob'

/**
 * Read the `package.json` of a package directory. Undefined when the directory
 * has none (reported with `logger.fail`); throws when it has no name or no version.
 *
 * @param packagePath - Absolute directory of the package
 * @param logger - Receives the failure when there is no `package.json`
 * @returns The name, version, `private` flag (false when unset) and path of the package, or undefined
 * @throws When the `package.json` has no name or no version (`Invalid package.json at <path> - missing name or version`), or is not valid JSON
 * @example
 * ```ts
 * readPackageJson('/repo/packages/core')
 * // { name: '@scope/core', version: '1.2.0', private: false, path: '/repo/packages/core' }
 * ```
 */
export function readPackageJson(packagePath: string, logger?: CoreLogger): ReadPackage | undefined {
  const packageJsonPath = join(packagePath, 'package.json')

  if (!existsSync(packageJsonPath)) {
    logger?.fail?.(`package.json not found at ${packageJsonPath}`)
    return
  }
  if (!statSync(packagePath).isDirectory()) {
    logger?.fail?.(`Not a directory: ${packagePath}`)
    return
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    name: string | undefined
    version: string | undefined
    private: boolean | undefined
  }

  if (!packageJson.name || !packageJson.version) {
    throw new Error(`Invalid package.json at ${packagePath} - missing name or version`)
  }

  return {
    name: packageJson.name,
    version: packageJson.version,
    private: packageJson.private || false,
    path: packagePath,
  }
}

/**
 * Resolve a set of path globs (relative to `cwd`) to the absolute directories
 * they match. Shared by package discovery and ignore resolution. Only
 * directories are matched, and `GLOB_IGNORE` directories are skipped.
 *
 * @param cwd - Directory the globs are relative to
 * @param globs - The path globs (default: none)
 * @returns The set of absolute directories
 * @example
 * ```ts
 * globDirsAbsolute('/repo', ['packages/*'])
 * // Set { '/repo/packages/core', '/repo/packages/cli' }
 * ```
 */
export function globDirsAbsolute(cwd: string, globs?: string[]): Set<string> {
  const dirs = new Set<string>()

  for (const pattern of globs ?? []) {
    const matches = fastGlob.sync(pattern, {
      cwd,
      onlyDirectories: true,
      absolute: true,
      ignore: GLOB_IGNORE,
    })

    for (const match of matches) {
      dirs.add(match)
    }
  }

  return dirs
}

/**
 * The packages of the directories matched by `patterns` (the root when there
 * is none), without the `ignored` directories and, in a workspace, the private
 * packages unless `privatePackages` is `release`. A directory without
 * `package.json` is skipped, an error while reading a pattern is reported with
 * `logger.error` and the other patterns still apply.
 *
 * @param options - The options
 * @param options.cwd - Root of the repository
 * @param options.patterns - Path globs of the packages, relative to `cwd` (default: the root only)
 * @param options.ignored - Path globs of the packages left out
 * @param options.privatePackages - `release` keeps the private packages of a workspace
 * @param options.logger - Receives debug and error messages
 * @returns The packages, each with its absolute `path`, in the order of the patterns
 * @example
 * ```ts
 * readPackages({ cwd: '/repo', patterns: ['packages/*'], ignored: ['packages/docs'] })
 * // [{ name: 'core', version: '1.0.0', private: false, path: '/repo/packages/core' }, ...]
 * ```
 */
export function readPackages({
  cwd,
  patterns,
  ignored,
  privatePackages,
  logger,
}: {
  cwd: string
  patterns?: string[]
  ignored?: string[]
  privatePackages?: PrivatePackages
  logger?: CoreLogger
}): ReadPackage[] {
  const packages: ReadPackage[] = []
  const foundPaths = new Set<string>()
  const patternsSet = new Set<string>(patterns)
  const ignoredDirs = globDirsAbsolute(cwd, ignored)

  if (!patterns)
    patternsSet.add('.')

  logger?.debug?.(`Read package.json files from patterns: ${[...patternsSet].join(', ')}`)

  for (const pattern of patternsSet) {
    try {
      const matches = fastGlob.sync(pattern, {
        cwd,
        onlyDirectories: true,
        absolute: true,
        ignore: GLOB_IGNORE,
      })

      for (const matchPath of matches) {
        if (foundPaths.has(matchPath))
          continue

        if (ignoredDirs.has(matchPath))
          continue

        const packageBase = readPackageJson(matchPath, logger)

        if (!packageBase || (packageBase.private && patterns?.length && privatePackages !== 'release'))
          continue

        foundPaths.add(matchPath)
        packages.push({
          ...packageBase,
          path: matchPath,
        })
      }
    }
    catch (error) {
      logger?.error?.(error)
    }
  }

  return packages
}

/**
 * Every package of the workspace, by name: the root and the directories matched
 * by `patterns`, private and ignored ones included. A directory whose package
 * cannot be read is skipped (debug message only).
 *
 * @param options - The options
 * @param options.cwd - Root of the repository
 * @param options.patterns - Path globs of the workspace packages, relative to `cwd`
 * @param options.logger - Receives debug messages
 * @returns The packages indexed by name; the root itself is included when it has a readable `package.json`
 * @example
 * ```ts
 * const packages = readWorkspacePackages({ cwd: '/repo', patterns: ['packages/*'] })
 * packages.get('@scope/core')?.version // '1.2.0'
 * ```
 */
export function readWorkspacePackages({
  cwd,
  patterns,
  logger,
}: {
  cwd: string
  patterns: string[]
  logger?: CoreLogger
}): Map<string, ReadPackage> {
  const packages = new Map<string, ReadPackage>()

  const directories = fastGlob.sync(patterns, {
    cwd,
    onlyDirectories: true,
    absolute: true,
    ignore: GLOB_IGNORE,
  })

  for (const directory of [cwd, ...directories]) {
    if (!existsSync(join(directory, 'package.json'))) {
      continue
    }

    try {
      const pkg = readPackageJson(directory, logger)

      if (pkg) {
        packages.set(pkg.name, pkg)
      }
    }
    catch (error) {
      logger?.debug?.(`Cannot read the package of ${directory}: ${error instanceof Error
        ? error.message
        : String(error)}`)
    }
  }

  return packages
}

/**
 * Names of the dependency fields the package manager resolves when a published package is
 * installed: a package must be published after the internal packages listed
 * there, and their `workspace:` specifiers must resolve to installable versions.
 */
export const PUBLISH_DEPENDENCY_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'] as const

/** The dependency fields of a `package.json` that matter when it is published (see `PUBLISH_DEPENDENCY_FIELDS`) */
export type PublishDependencies = Partial<Record<typeof PUBLISH_DEPENDENCY_FIELDS[number], Record<string, string>>>

/**
 * The publish dependency fields of the `package.json` of a package directory
 * (see `PUBLISH_DEPENDENCY_FIELDS`), empty when it has none.
 *
 * @param packagePath - Directory of the package
 * @returns The dependency maps of the `package.json` (name to specifier), `{}` when there is no `package.json`. Only the fields present in the file are set
 * @throws When the `package.json` is not valid JSON
 */
export function readDependencyFields(packagePath: string): PublishDependencies {
  const packageJsonPath = join(packagePath, 'package.json')

  if (!existsSync(packageJsonPath)) {
    return {}
  }

  return JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PublishDependencies
}

/**
 * Sort the packages to publish so that each package comes after the internal
 * packages it depends on through `dependencies`, `peerDependencies` or
 * `optionalDependencies`. A circular dependency is reported by `topologicalSort`.
 *
 * @param packages - The packages to publish
 * @param logger - Receives the warning about circular dependencies
 * @returns The same package objects, dependencies first
 * @example
 * ```ts
 * // cli depends on core
 * sortPackagesForPublish([cli, core]).map(pkg => pkg.name) // ['core', 'cli']
 * ```
 */
export function sortPackagesForPublish<T extends PackageBase>(packages: T[], logger?: CoreLogger): T[] {
  const names = new Set(packages.map(pkg => pkg.name))
  const byName = new Map(packages.map(pkg => [pkg.name, pkg]))

  const withPublishDependencies = packages.map((pkg) => {
    const fields = readDependencyFields(pkg.path)
    const dependencies = PUBLISH_DEPENDENCY_FIELDS
      .flatMap(field => Object.keys(fields[field] ?? {}))
      .filter(name => names.has(name) && name !== pkg.name)

    return {
      ...pkg,
      dependencies: [
        ...new Set(dependencies),
      ],
    }
  })

  return topologicalSort(withPublishDependencies, logger).map(pkg => byName.get(pkg.name)!)
}

/**
 * True when the project has a `lerna.json` at its root.
 *
 * @param rootDir - Root directory of the project
 * @returns True when `lerna.json` exists there
 */
export function hasLernaJson(rootDir: string): boolean {
  return existsSync(join(rootDir, 'lerna.json'))
}
