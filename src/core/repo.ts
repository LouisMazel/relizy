import type { GitCommit } from 'changelogen'
import type { ConfigType, PackageBase, ReadPackage } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { logger } from '@maz-ui/node'
import { getErrorMessage } from '@maz-ui/utils/helpers/getErrorMessage'
import { getGitDiff, parseCommits } from 'changelogen'
import fastGlob from 'fast-glob'
import { expandPackagesToBumpWithDependents, getPackageDependencies } from './dependencies'
import { reconcileFromTag } from './rewritten-tags'
import { NEW_PACKAGE_MARKER, resolveTags } from './tags'
import { determineReleaseType, getPackageNewVersion, isChangedPreid, isGraduating, isPrerelease, isStableReleaseType } from './version'

/**
 * Get the first commit hash that touched a specific package directory.
 * This is used for new packages without tags to avoid ENOBUFS errors
 * when using the first commit of the entire repo.
 */
function getFirstPackageCommitHash(packagePath: string, cwd: string): string | null {
  const relativePath = relative(cwd, packagePath)

  try {
    // Get the oldest commit that touched this package directory
    const result = execSync(
      `git log --reverse --format="%H" -- "${relativePath}" | head -1`,
      { cwd, encoding: 'utf8' },
    )
    const hash = result.trim()

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

const GLOB_IGNORE = ['**/node_modules/**', '**/dist/**', '**/.git/**']

/**
 * Resolve a set of path globs (relative to `cwd`) to the absolute directories
 * they match. Shared by package discovery and ignore resolution.
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
 * Relative POSIX paths of every package ignored by config, resolved from BOTH
 * `monorepo.ignored` (path globs) and `monorepo.ignorePackageNames` (names).
 *
 * The name-based source is resolved against the configured `packages` globs so
 * the two options behave identically downstream (path filtering + root commit
 * exclusion).
 */
export function resolveIgnoredPackagePaths(config: ResolvedRelizyConfig): string[] {
  const cwd = config.cwd
  const paths = new Set<string>()

  for (const absolutePath of globDirsAbsolute(cwd, config.monorepo?.ignored)) {
    paths.add(relative(cwd, absolutePath).split(sep).join('/'))
  }

  const ignorePackageNames = config.monorepo?.ignorePackageNames ?? []
  if (ignorePackageNames.length > 0) {
    for (const absolutePath of globDirsAbsolute(cwd, config.monorepo?.packages)) {
      const packageBase = readPackageJson(absolutePath)
      if (packageBase && ignorePackageNames.includes(packageBase.name)) {
        paths.add(relative(cwd, absolutePath).split(sep).join('/'))
      }
    }
  }

  return [...paths].filter(Boolean)
}

/**
 * Extract the changed file paths (POSIX) from a commit body. `getGitDiff` runs
 * `git log --name-status`, so the body carries lines like `M\tpath/to/file`
 * (renames/copies use `R100\told\tnew` - the new path is the last field).
 */
export function getCommitChangedFiles(commit: GitCommit): string[] {
  return commit.body
    .split('\n')
    .filter(line => /^[A-Z]\d*\t/.test(line))
    .map((line) => {
      const parts = line.split('\t')
      return parts[parts.length - 1]?.trim()
    })
    .filter((path): path is string => Boolean(path))
}

function isUnderIgnoredPath(file: string, ignoredPaths: string[]): boolean {
  return ignoredPaths.some(ignored => file === ignored || file.startsWith(`${ignored}/`))
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

export function readPackages({
  cwd,
  patterns,
  ignorePackageNames,
  ignored,
  includePrivates,
}: {
  cwd: string
  patterns?: string[]
  ignorePackageNames: NonNullable<ResolvedRelizyConfig['monorepo']>['ignorePackageNames']
  ignored?: NonNullable<ResolvedRelizyConfig['monorepo']>['ignored']
  includePrivates?: boolean
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
        ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
      })

      for (const matchPath of matches) {
        if (foundPaths.has(matchPath))
          continue

        if (ignoredDirs.has(matchPath))
          continue

        const packageBase = readPackageJson(matchPath)

        if (!packageBase || (packageBase.private && !includePrivates) || ignorePackageNames?.includes(packageBase.name))
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

function getPackageReleaseType({
  pkg,
  config,
  force,
}: {
  pkg: PackageBase
  config: ResolvedRelizyConfig
  force: boolean
}) {
  const releaseType = config.bump.type

  if (force) {
    return determineReleaseType({
      currentVersion: pkg.version,
      commits: pkg.commits,
      releaseType,
      preid: config.bump.preid,
      types: config.types,
      force,
      capZeroMajor: config.bump.capZeroMajor,
    })
  }

  if (pkg.reason === 'dependency') {
    if (isStableReleaseType(releaseType))
      return 'patch'
    if (isPrerelease(pkg.version))
      return 'prerelease'
    return 'prepatch'
  }

  return determineReleaseType({
    currentVersion: pkg.version,
    commits: pkg.commits,
    releaseType,
    preid: config.bump.preid,
    types: config.types,
    force,
    capZeroMajor: config.bump.capZeroMajor,
  })
}

// eslint-disable-next-line sonarjs/cognitive-complexity, complexity
export async function getPackages({
  config,
  suffix,
  force,
  includeAll = false,
  dryRun = false,
}: {
  config: ResolvedRelizyConfig
  suffix: string | undefined
  force: boolean
  includeAll?: boolean
  dryRun?: boolean
}): Promise<PackageBase[]> {
  const patterns = config.monorepo?.packages

  const readedPackages = readPackages({
    cwd: config.cwd,
    patterns,
    ignorePackageNames: config.monorepo?.ignorePackageNames,
    ignored: config.monorepo?.ignored,
    includePrivates: config.monorepo?.includePrivates,
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
      ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
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

      if (packageBase.private && !config.monorepo?.includePrivates) {
        logger.debug(`${packageBase.name} is private and will be ignored`)
        continue
      }
      if (config.monorepo?.ignorePackageNames?.includes(packageBase.name)) {
        logger.debug(`${packageBase.name} ignored by config (monorepo.ignorePackageNames)`)
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
        allPackageNames: new Set(readedPackages.map(p => p.name)),
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
  const packagesWithCommits = packagesArray.filter(p => p.commits.length > 0)

  const expandedPackages = expandPackagesToBumpWithDependents({
    allPackages: packagesArray,
    packagesWithCommits,
  })

  for (const pkg of expandedPackages) {
    packages.set(pkg.name, pkg)
  }

  for (const pkg of Array.from(packages.values())) {
    const releaseType = getPackageReleaseType({
      pkg,
      config,
      force,
    })

    const newVersion = releaseType
      ? getPackageNewVersion({
          name: pkg.name,
          currentVersion: pkg.version,
          releaseType,
          preid: config.bump.preid,
          suffix,
        })
      : undefined

    const graduating = (releaseType && isGraduating(pkg.version, releaseType)) || isChangedPreid(pkg.version, config.bump.preid)

    packages.set(pkg.name, {
      ...pkg,
      newVersion,
      reason: pkg.reason || (releaseType && graduating && 'graduation') || undefined,
    })
  }

  const allPackages = Array.from(packages.values())
  const packagesToBump = includeAll ? allPackages : allPackages.filter(p => p.reason || force)

  if (packagesToBump.length === 0) {
    logger.debug('No packages to bump')
    return []
  }

  return packagesToBump
}

function isAllowedCommit({
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
  let actualFrom: string
  if (from === NEW_PACKAGE_MARKER) {
    const firstPackageCommit = getFirstPackageCommitHash(pkg.path, config.cwd)
    if (!firstPackageCommit) {
      logger.debug(`${pkg.name} has no commits yet, returning empty`)
      return []
    }
    logger.debug(`${pkg.name} is a new package, using first package commit: ${firstPackageCommit.slice(0, 8)}`)
    // Use the parent of the first commit to include it in the diff
    actualFrom = `${firstPackageCommit}^`
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
    from: actualFrom,
    to,
  }

  const rawCommits = await getGitDiff(actualFrom, to, changelogConfig.cwd)
  const allCommits = parseCommits(rawCommits, changelogConfig)

  const hasBreakingChanges = allCommits.some(commit => commit.isBreaking)
  logger.debug(`Has breaking changes: ${hasBreakingChanges}`)

  const rootPackage = readPackageJson(changelogConfig.cwd)

  if (!rootPackage) {
    throw new Error('Failed to read root package.json')
  }

  const isRootPackage = pkg.path === changelogConfig.cwd || pkg.name === rootPackage.name

  // Paths of ignored packages, resolved once for the root filter below.
  const ignoredPackagePaths = isRootPackage ? resolveIgnoredPackagePaths(changelogConfig) : []

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

    const packageRelativePath = relative(changelogConfig.cwd, pkg.path).split(sep).join('/')
    return commit.body.includes(packageRelativePath)
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
