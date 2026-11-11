import type { VersionChange } from '@relizy/core'
import type { GitCommit, MonorepoConfig, PackageBase, PrivatePackages, ReadPackage } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { logger } from '@maz-ui/node'
import { getErrorMessage } from '@maz-ui/utils/helpers/getErrorMessage'
import { getPackageCommits as coreGetPackageCommits, readPackageJson as coreReadPackageJson, readPackages as coreReadPackages, determineReleaseType, getPackageDependencies, getPackageNewVersion, GLOB_IGNORE, globDirsAbsolute } from '@relizy/core'
import fastGlob from 'fast-glob'
import { planPackages } from './bump-plan'
import { reconcileFromTag } from './rewritten-tags'
import { resolveTags } from './tags'

export function readPackageJson(packagePath: string): ReadPackage | undefined {
  return coreReadPackageJson(packagePath, logger)
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
        logger,
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
          logger,
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

  return isStandalone
    ? 'release'
    : config.monorepo?.privatePackages ?? 'ignore'
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
  return coreReadPackages({
    cwd,
    patterns,
    ignored,
    privatePackages,
    logger,
  })
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
        allPackageNames: new Set([
          ...readedPackages.map(p => p.name),
          ...(externalBumps?.keys() ?? []),
        ]),
        dependencyTypes: config.bump?.dependencyTypes,
      })

      packages.set(packageBase.name, {
        ...packageBase,
        path: matchPath,
        fromTag: from,
        dependencies,
        commits,
        reason: commits.length > 0
          ? 'commits'
          : undefined,
        dependencyChain: undefined,
        newVersion: undefined,
      })
    }
  }

  planPackages({
    packages,
    externalBumps,
    config,
    force,
    suffix,
    newVersionOverride,
  })

  const allPackages = Array.from(packages.values())
  const packagesToBump = includeAll
    ? allPackages
    : allPackages.filter(p => p.reason || force)

  if (packagesToBump.length === 0) {
    logger.debug('No packages to bump')
    return []
  }

  return packagesToBump
}

/**
 * The conventional commits of a package between two refs, see
 * `getPackageCommits()` of `@relizy/core`: the types, scopes, packages, moved
 * packages and private packages of the config apply, and a `from` tag a
 * rebase orphaned is recovered (see `reconcileFromTag`).
 */
export function getPackageCommits({
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
  return coreGetPackageCommits({
    pkg,
    from,
    to,
    cwd: config.cwd,
    types: config.types,
    changelog,
    scopeMap: config.scopeMap,
    monorepo: {
      packages: config.monorepo?.packages,
      ignored: config.monorepo?.ignored,
      privatePackages: getPrivatePackagesMode(config),
      movedPackages: config.monorepo?.movedPackages,
    },
    reconcileFrom: reconciledFrom => reconcileFromTag({
      from: reconciledFrom,
      to,
      config,
      pkg,
      dryRun,
    }),
    logger,
  })
}
