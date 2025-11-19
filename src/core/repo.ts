import type { GitCommit } from 'changelogen'
import type { ResolvedRelizyConfig } from '../core'
import type { ConfigType, PackageBase, ReadPackage } from '../types'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { logger } from '@maz-ui/node'
import { getGitDiff, parseCommits } from 'changelogen'
import fastGlob from 'fast-glob'
import { determineReleaseType, getPackageNewVersion, isChangedPreid, isGraduating, isPrerelease, isStableReleaseType, resolveTags } from '../core'
import { expandPackagesToBumpWithDependents, getPackageDependencies } from './dependencies'

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
}: {
  config: ResolvedRelizyConfig
  force: boolean
  from: string
  to: string
  suffix: string | undefined
  changelog: boolean
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
      })

      if (!releaseType) {
        logger.fail('No commits require a version bump')
        process.exit(0)
      }

      newVersion = getPackageNewVersion({
        name: packageJson.name,
        currentVersion: packageJson.version,
        releaseType,
        preid: config.bump.preid,
        suffix,
      })
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
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(errorMessage)
  }
}

export function readPackages({
  cwd,
  patterns,
  ignorePackageNames,
}: {
  cwd: string
  patterns?: string[]
  ignorePackageNames: NonNullable<ResolvedRelizyConfig['monorepo']>['ignorePackageNames']
}) {
  const packages: ReadPackage[] = []
  const foundPaths = new Set<string>()
  const patternsSet = new Set<string>(patterns)

  if (!patterns)
    patternsSet.add('.')

  logger.debug(`Read package.json files from patterns: ${patternsSet.values()}`)

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

        const packageBase = readPackageJson(matchPath)

        if (!packageBase || packageBase.private || ignorePackageNames?.includes(packageBase.name))
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
  })
}

// eslint-disable-next-line sonarjs/cognitive-complexity, complexity
export async function getPackages({
  patterns,
  config,
  suffix,
  force,
}: {
  patterns?: string[]
  config: ResolvedRelizyConfig
  suffix: string | undefined
  force: boolean
}): Promise<PackageBase[]> {
  const readedPackages = readPackages({
    cwd: config.cwd,
    patterns,
    ignorePackageNames: config.monorepo?.ignorePackageNames,
  })

  const packages = new Map<string, PackageBase>()
  const foundPaths = new Set<string>()
  const patternsSet = new Set<string>(patterns)

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

      const packageBase = readPackageJson(matchPath)

      if (!packageBase) {
        logger.debug(`Failed to read package.json at ${matchPath} - ignored`)
        continue
      }

      if (packageBase.private) {
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

  const packagesToBump = Array.from(packages.values()).filter(p => p.reason || force)

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
}: {
  pkg: ReadPackage
  from: string
  to: string
  config: ResolvedRelizyConfig
  changelog: boolean
}): Promise<GitCommit[]> {
  logger.debug(`Analyzing commits for ${pkg.name} since ${from} to ${to}`)

  const changelogConfig = {
    ...config,
    from,
    to,
  }

  const rawCommits = await getGitDiff(from, to, changelogConfig.cwd)
  const allCommits = parseCommits(rawCommits, changelogConfig)

  const hasBreakingChanges = allCommits.some(commit => commit.isBreaking)
  logger.debug(`Has breaking changes: ${hasBreakingChanges}`)

  const rootPackage = readPackageJson(changelogConfig.cwd)

  if (!rootPackage) {
    throw new Error('Failed to read root package.json')
  }

  const commits = allCommits.filter((commit) => {
    const type = changelogConfig?.types[commit.type] as ConfigType | undefined

    if (!isAllowedCommit({ commit, type, changelog })) {
      return false
    }

    if (pkg.path === changelogConfig.cwd || pkg.name === rootPackage.name) {
      return true
    }

    const packageRelativePath = relative(changelogConfig.cwd, pkg.path)

    const scopeMatches = commit.scope === pkg.name
    const bodyContainsPath = commit.body.includes(packageRelativePath)

    return scopeMatches || bodyContainsPath
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
