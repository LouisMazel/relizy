import type { ConfigType, GitCommit, MonorepoConfig, PackageBase, PrivatePackages, ReadPackage } from '../types'
import type { ResolvedRelizyConfig } from './config'
import type { VersionChange } from './dependencies'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { logger } from '@maz-ui/node'
import { getErrorMessage } from '@maz-ui/utils/helpers/getErrorMessage'
import fastGlob from 'fast-glob'
import { bumpPeerDependents, computeNewVersions, getExternalDependents, markDependents } from './bump-plan'
import { getCommitCatalogChanges, prefetchCatalogChanges, referencesCatalogEntries } from './catalogs'
import { parseCommits } from './commits'
import { getPackageDependencies } from './dependencies'
import { runGitSync } from './git-exec'
import { getGitDiff, parseNameStatus } from './git-refs'
import { GLOB_IGNORE } from './glob'
import { getPackageJsonHistory, getPreviousPackagePaths } from './moved-packages'
import { reconcileFromTag } from './rewritten-tags'
import { NEW_PACKAGE_MARKER, resolveTags } from './tags'
import { determineReleaseType, getPackageNewVersion } from './version'

/**
 * Get the first commit hash that touched a specific package directory, or one
 * of its former directories (see `getPreviousPackagePaths`).
 * This is used for new packages without tags to avoid ENOBUFS errors
 * when using the first commit of the entire repo.
 */
function getFirstPackageCommitHash(packagePath: string, cwd: string, movedPackages?: Record<string, string>): string | null {
  const relativePath = relative(cwd, packagePath).split(sep).join('/')
  const previousPaths = relativePath
    ? getPreviousPackagePaths({ packagePath: relativePath, commits: getPackageJsonHistory(relativePath, cwd), movedPackages, cwd })
    : []

  try {
    // Get the oldest commit that touched this package directory
    const hash = runGitSync(['log', '--reverse', '--format=%H', '--', relativePath, ...previousPaths], { cwd }).split('\n')[0]?.trim()

    if (hash) {
      logger.debug(`First commit for package at ${relativePath}: ${hash.slice(0, 8)}`)
      return hash
    }

    return null
  }
  catch {
    return null
  }
}

/**
 * Get the parent hash of a commit. Returns null for the repository root
 * commit, which has no parent.
 */
function getCommitParentHash(hash: string, cwd: string): string | null {
  try {
    const parent = runGitSync(['rev-parse', '--verify', '--quiet', `${hash}^`], { cwd })

    return parent || null
  }
  catch {
    return null
  }
}

/**
 * Resolve the commit a new package's compare link starts from: the parent of
 * the first commit that touched the package, so the link covers the whole
 * package history. Falls back to that first commit when it is the repository
 * root commit (no parent). Returns null when the package has no commits yet.
 */
export function getNewPackageCompareBase(packagePath: string, cwd: string, movedPackages?: Record<string, string>): string | null {
  const firstPackageCommit = getFirstPackageCommitHash(packagePath, cwd, movedPackages)

  if (!firstPackageCommit) {
    return null
  }

  return getCommitParentHash(firstPackageCommit, cwd) || firstPackageCommit
}

export function readPackageJson(packagePath: string): ReadPackage | undefined {
  const packageJsonPath = join(packagePath, 'package.json')

  if (!existsSync(packageJsonPath)) {
    logger.fail(`package.json not found at ${packageJsonPath}`)
    return
  }
  if (!statSync(packagePath).isDirectory()) {
    logger.fail(`Not a directory: ${packagePath}`)
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
 * they match. Shared by package discovery and ignore resolution.
 */
function globDirsAbsolute(cwd: string, globs?: string[]): Set<string> {
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
 * Relative POSIX paths of every package ignored by config (`monorepo.ignored`)
 */
export function resolveIgnoredPackagePaths(config: ResolvedRelizyConfig): string[] {
  const cwd = config.cwd
  const paths = new Set<string>()

  for (const absolutePath of globDirsAbsolute(cwd, config.monorepo?.ignored)) {
    paths.add(relative(cwd, absolutePath).split(sep).join('/'))
  }

  return [...paths].filter(Boolean)
}

/**
 * The paths of each `--name-status` line of a commit body: `getGitDiff` runs
 * `git log --name-status`, so the body carries lines like `M\tpath/to/file`,
 * and `R100\told\tnew` for renames and copies.
 */
function getNameStatusPaths(commit: GitCommit): string[][] {
  return parseNameStatus(commit.body).map(entry => entry.paths)
}

/**
 * Extract the changed file paths (POSIX) from a commit body (renames/copies:
 * the new path, the last field of their `--name-status` line).
 */
export function getCommitChangedFiles(commit: GitCommit): string[] {
  return getNameStatusPaths(commit).map(paths => paths[paths.length - 1]!)
}

function isUnderPath(file: string, directory: string): boolean {
  return file === directory || file.startsWith(`${directory}/`)
}

function isUnderIgnoredPath(file: string, ignoredPaths: string[]): boolean {
  return ignoredPaths.some(ignored => isUnderPath(file, ignored))
}

/**
 * True when the commit changes a file of the package directory (POSIX, relative
 * to the repository). Both paths of a rename or a copy count, so a file moved
 * out of the package still belongs to its history. The directory is compared as
 * a whole: `packages/components` does not match `packages/components-mcp/...`.
 * The former directories of the package (`previousPaths`, see
 * `getPreviousPackagePaths`) count as the package directory.
 */
export function isCommitInPackage(commit: GitCommit, packageRelativePath: string, previousPaths: string[] = []): boolean {
  const directories = [packageRelativePath, ...previousPaths]

  return getNameStatusPaths(commit).some(paths => paths.some(file => directories.some(directory => isUnderPath(file, directory))))
}

/**
 * True when EVERY changed file of the commit lives inside an ignored package.
 * Such commits are excluded from the root (unified/selective) version bump and
 * changelog so a breaking change scoped to an ignored package never bumps the
 * whole repository. Commits with no detectable files are kept (fail-open).
 */
export function isCommitOnlyInIgnoredPackages(commit: GitCommit, ignoredPaths: string[]): boolean {
  if (ignoredPaths.length === 0) {
    return false
  }

  const files = getCommitChangedFiles(commit)
  if (files.length === 0) {
    return false
  }

  return files.every(file => isUnderIgnoredPath(file, ignoredPaths))
}

export interface RootPackage extends ReadPackage {
  fromTag: string
  commits: GitCommit[]
  newVersion?: string
}

export async function getRootPackage({
  config,
  force,
  from,
  to,
  suffix,
  changelog,
  dryRun = false,
}: {
  config: ResolvedRelizyConfig
  force: boolean
  from: string
  to: string
  suffix: string | undefined
  changelog: boolean
  dryRun?: boolean
}): Promise<RootPackage> {
  try {
    const packageJson = readPackageJson(config.cwd)

    if (!packageJson) {
      throw new Error('Failed to read root package.json')
    }

    const commits = await getPackageCommits({
      pkg: packageJson,
      from,
      to,
      config,
      changelog,
      dryRun,
    })

    let newVersion: string | undefined

    if (config.monorepo?.versionMode !== 'independent') {
      const releaseType = determineReleaseType({
        currentVersion: packageJson.version,
        commits,
        releaseType: config.bump.type,
        preid: config.bump.preid,
        types: config.types,
        force,
        capZeroMajor: config.bump.capZeroMajor,
      })

      if (!releaseType) {
        logger.debug('No commits require a version bump')
      }
      else {
        newVersion = getPackageNewVersion({
          name: packageJson.name,
          currentVersion: packageJson.version,
          releaseType,
          preid: config.bump.preid,
          suffix,
        })
      }
    }

    return {
      ...packageJson,
      path: config.cwd,
      fromTag: from,
      commits,
      newVersion,
    }
  }
  catch (error) {
    throw new Error(`Failed to get root package: ${getErrorMessage(error)}`, { cause: error })
  }
}

/**
 * What relizy does with the private packages of a config: `monorepo.privatePackages`,
 * and always `release` for a project without workspace packages, whose only
 * package is the root (a private app is versioned, never published)
 */
export function getPrivatePackagesMode(config: { monorepo?: MonorepoConfig }): PrivatePackages {
  const isStandalone = !config.monorepo?.packages?.length && !config.monorepo?.groups?.length

  return isStandalone ? 'release' : config.monorepo?.privatePackages ?? 'ignore'
}

export function readPackages({
  cwd,
  patterns,
  ignored,
  privatePackages,
}: {
  cwd: string
  patterns?: string[]
  ignored?: NonNullable<ResolvedRelizyConfig['monorepo']>['ignored']
  privatePackages?: PrivatePackages
}) {
  const packages: ReadPackage[] = []
  const foundPaths = new Set<string>()
  const patternsSet = new Set<string>(patterns)
  const ignoredDirs = globDirsAbsolute(cwd, ignored)

  if (!patterns)
    patternsSet.add('.')

  logger.debug(`Read package.json files from patterns: ${[...patternsSet].join(', ')}`)

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

        const packageBase = readPackageJson(matchPath)

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
      logger.error(error)
    }
  }

  return packages
}

// eslint-disable-next-line sonarjs/cognitive-complexity, complexity
export async function getPackages({
  config,
  suffix,
  force,
  includeAll = false,
  dryRun = false,
  externalBumps,
  newVersionOverride,
}: {
  config: ResolvedRelizyConfig
  suffix: string | undefined
  force: boolean
  includeAll?: boolean
  dryRun?: boolean
  /**
   * Packages bumped outside of the config (by the other version groups): the
   * packages depending on them are bumped as dependents.
   */
  externalBumps?: Map<string, VersionChange>
  /**
   * Version every bumped package gets (unified/selective root version, canary
   * version), when known: used to check the ranges of the peer dependencies.
   */
  newVersionOverride?: string
}): Promise<PackageBase[]> {
  const patterns = config.monorepo?.packages

  const readedPackages = readPackages({
    cwd: config.cwd,
    patterns,
    ignored: config.monorepo?.ignored,
    privatePackages: config.monorepo?.privatePackages,
  })

  const packages = new Map<string, PackageBase>()
  const foundPaths = new Set<string>()
  const patternsSet = new Set<string>(patterns)
  const ignoredDirs = globDirsAbsolute(config.cwd, config.monorepo?.ignored)

  if (!patterns)
    patternsSet.add('.')

  logger.debug(`Getting packages from patterns: ${patternsSet.values()}`)

  for (const pattern of patternsSet) {
    const matches = fastGlob.sync(pattern, {
      cwd: config.cwd,
      onlyDirectories: true,
      absolute: true,
      ignore: GLOB_IGNORE,
    })

    for (const matchPath of matches) {
      if (foundPaths.has(matchPath))
        continue

      if (ignoredDirs.has(matchPath)) {
        logger.debug(`${matchPath} ignored by config (monorepo.ignored)`)
        continue
      }

      const packageBase = readPackageJson(matchPath)

      if (!packageBase) {
        logger.debug(`Failed to read package.json at ${matchPath} - ignored`)
        continue
      }

      if (packageBase.private && getPrivatePackagesMode(config) !== 'release') {
        logger.debug(`${packageBase.name} is private and will be ignored`)
        continue
      }
      if (!packageBase.version) {
        logger.warn(`${packageBase.name} has no version and will be ignored`)
        continue
      }

      const { from, to } = await resolveTags<'bump'>({
        config,
        step: 'bump',
        pkg: packageBase,
        newVersion: undefined,
      })

      const commits = await getPackageCommits({
        pkg: packageBase,
        from,
        to,
        config,
        changelog: false,
        dryRun,
      })

      foundPaths.add(matchPath)

      const dependencies = getPackageDependencies({
        packagePath: matchPath,
        allPackageNames: new Set([...readedPackages.map(p => p.name), ...(externalBumps?.keys() ?? [])]),
        dependencyTypes: config.bump?.dependencyTypes,
      })

      packages.set(packageBase.name, {
        ...packageBase,
        path: matchPath,
        fromTag: from,
        dependencies,
        commits,
        reason: commits.length > 0 ? 'commits' : undefined,
        dependencyChain: undefined,
        newVersion: undefined,
      })
    }
  }

  const packagesArray = Array.from(packages.values())
  const externalDependents = getExternalDependents(packagesArray, externalBumps)

  markDependents({
    packages,
    seeds: [
      ...packagesArray.filter(p => p.commits.length > 0).map(pkg => ({ pkg })),
      ...externalDependents.map(pkg => ({ pkg, dependency: pkg.dependencies.find(name => externalBumps!.has(name)) })),
    ],
  })

  const versionContext = { config, force, suffix, newVersionOverride }

  computeNewVersions({ packages, ...versionContext })

  // `bump` is the default
  bumpPeerDependents({ packages, externalBumps, bumpOutOfRange: !['warn', 'error'].includes(config.bump.outOfRangePeers!), ...versionContext })

  const allPackages = Array.from(packages.values())
  const packagesToBump = includeAll ? allPackages : allPackages.filter(p => p.reason || force)

  if (packagesToBump.length === 0) {
    logger.debug('No packages to bump')
    return []
  }

  return packagesToBump
}

export function isAllowedCommit({
  commit,
  type,
  changelog,
}: {
  commit: GitCommit
  type?: ConfigType
  changelog: boolean
}): boolean {
  if (
    commit.type === 'chore'
    && ['deps', 'release'].includes(commit.scope)
    && !commit.isBreaking
  ) {
    return false
  }

  if (typeof type === 'object') {
    return !!type.semver || (changelog && !!type.title)
  }

  if (typeof type === 'boolean') {
    return type
  }

  return false
}

export async function getPackageCommits({
  pkg,
  from,
  to,
  config,
  changelog,
  dryRun = false,
}: {
  pkg: ReadPackage
  from: string
  to: string
  config: ResolvedRelizyConfig
  changelog: boolean
  dryRun?: boolean
}): Promise<GitCommit[]> {
  logger.debug(`Analyzing commits for ${pkg.name} since ${from} to ${to}`)

  // For new packages without any previous tags, find the first commit
  // that touched this package to avoid ENOBUFS errors.
  let actualFrom: string | undefined
  if (from === NEW_PACKAGE_MARKER) {
    const firstPackageCommit = getFirstPackageCommitHash(pkg.path, config.cwd, config.monorepo?.movedPackages)
    if (!firstPackageCommit) {
      logger.debug(`${pkg.name} has no commits yet, returning empty`)
      return []
    }
    logger.debug(`${pkg.name} is a new package, using first package commit: ${firstPackageCommit.slice(0, 8)}`)
    // Start from the parent of the first commit to include it in the diff.
    // When that commit is the repository root commit (no parent), drop the
    // lower bound: `git log <to>` then covers the full history, which is the
    // package history anyway.
    actualFrom = getCommitParentHash(firstPackageCommit, config.cwd) ?? undefined
  }
  else {
    // Recover from a rewritten/orphaned `from` tag (e.g. a rebase moved the
    // release commit). This only affects the range passed to `git log`; the
    // tag name used elsewhere (changelog title, compare link, new tag) is left
    // untouched. No-op for healthy tags, SHAs and the new-package marker.
    actualFrom = await reconcileFromTag({ from, to, config, pkg, dryRun })
  }

  const changelogConfig = {
    ...config,
    from: actualFrom ?? '',
    to,
  }

  const rawCommits = getGitDiff(actualFrom, to, changelogConfig.cwd)
  const allCommits = parseCommits(rawCommits, changelogConfig)

  const hasBreakingChanges = allCommits.some(commit => commit.isBreaking)
  logger.debug(`Has breaking changes: ${hasBreakingChanges}`)

  const rootPackage = readPackageJson(changelogConfig.cwd)

  if (!rootPackage) {
    throw new Error('Failed to read root package.json')
  }

  const isRootPackage = pkg.path === changelogConfig.cwd || pkg.name === rootPackage.name

  const movedPackages = changelogConfig.monorepo?.movedPackages
  const getPreviousPaths = (packagePath: string) => getPreviousPackagePaths({ packagePath, commits: rawCommits, movedPackages, cwd: changelogConfig.cwd })

  // Paths of ignored packages (and their former directories), resolved once for the root filter below.
  const ignoredPackagePaths = isRootPackage
    ? resolveIgnoredPackagePaths(changelogConfig).flatMap(path => [path, ...getPreviousPaths(path)])
    : []

  const packageRelativePath = relative(changelogConfig.cwd, pkg.path).split(sep).join('/')
  // The commits of the former directories of a moved package belong to it
  const previousPaths = isRootPackage ? [] : getPreviousPaths(packageRelativePath)

  if (previousPaths.length > 0) {
    logger.debug(`${pkg.name} was moved from ${previousPaths.join(', ')}: their commits belong to it`)
  }

  if (!isRootPackage) {
    // The catalogs changed by the commits, read at once
    prefetchCatalogChanges({ commits: allCommits.map(commit => ({ hash: commit.shortHash, files: getCommitChangedFiles(commit) })), cwd: changelogConfig.cwd })
  }

  const commits = allCommits.filter((commit) => {
    const type = changelogConfig?.types[commit.type] as ConfigType | undefined

    if (!isAllowedCommit({ commit, type, changelog })) {
      return false
    }

    // The root package represents the whole repository: it must include every
    // allowed commit, including those that only touch root-level files
    // (CI config, lockfile, build scripts…) and do not match any sub-package path.
    if (isRootPackage) {
      // …except commits whose changes live entirely inside an ignored package:
      // those are released on their own and must not bump/changelog the root.
      if (isCommitOnlyInIgnoredPackages(commit, ignoredPackagePaths)) {
        logger.debug(`Commit "${commit.message}" only touches ignored packages, excluded from root`)
        return false
      }
      return true
    }

    if (isCommitInPackage(commit, packageRelativePath, previousPaths)) {
      return true
    }

    // A commit changing an entry of a catalog (`catalog:` dependencies) changes the packages using it
    const catalogChanges = getCommitCatalogChanges({ hash: commit.shortHash, files: getCommitChangedFiles(commit), cwd: changelogConfig.cwd })

    return referencesCatalogEntries({ hash: commit.shortHash, packageRelativePath, entries: catalogChanges, cwd: changelogConfig.cwd })
  })

  logger.debug(`Found ${commits.length} commit(s) for ${pkg.name} from ${from} to ${to}`)

  if (commits.length > 0) {
    logger.debug(`${pkg.name}: ${commits.length} commit(s) found`)
  }
  else {
    logger.debug(`${pkg.name}: No commits found`)
  }

  return commits
}

export function hasLernaJson(rootDir: string): boolean {
  const lernaJsonPath = join(rootDir, 'lerna.json')
  return existsSync(lernaJsonPath)
}
