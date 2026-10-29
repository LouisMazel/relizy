import type { SemverBumpType } from 'changelogen'
import type { ResolvedRelizyConfig, ResolvedVersionGroup, VersionChange } from '../core'
import type { BumpOptions, BumpResult, PackageBase, VersionGroup } from '../types'

import { logger } from '@maz-ui/node'
import { assertVersionGroupsOption, checkGitStatusIfDirty, confirmBump, determineSemverChange, executeHook, fetchGitTags, getBumpedIndependentPackages, getCanaryVersion, getDependencyReleaseType, getPackageCommits, getPackageDependencies, getPackageNewVersion, getPackages, getRootPackage, getShortCommitSha, hasVersionGroups, loadRelizyConfig, mergeGroupBumpResults, readPackageJson, readPackages, readWorkspacePackages, resolveTags, resolveVersionGroups, updateLernaVersion, writeVersion } from '../core'

interface BumpStrategyInput {
  config: ResolvedRelizyConfig
  dryRun: boolean
  force: boolean
  suffix: string | undefined
  /**
   * Packages bumped by the other version groups
   */
  externalBumps?: Map<string, VersionChange>
}

/**
 * A bump computed without writing anything: `confirm` asks for confirmation
 * (or logs the summary with `--yes`), then `write` writes the new versions.
 * Computing every version group before writing lets the groups depend on each
 * other, and a refused confirmation leaves the files untouched.
 */
interface BumpPlan {
  result: BumpResult
  confirm?: () => Promise<void>
  write?: () => void
}

const NOT_BUMPED: BumpPlan = { result: { bumped: false } }

/**
 * New root version of a unified/selective bump: from the commits, or a patch
 * when the packages are only bumped because they depend on packages bumped by
 * another version group.
 */
function getRootNewVersion({
  config,
  rootPackage,
  packages,
  suffix,
}: {
  config: ResolvedRelizyConfig
  rootPackage: { name: string, version: string, newVersion?: string }
  packages: PackageBase[]
  suffix: string | undefined
}): string | undefined {
  // Without commits of the group, its packages can only be bumped as dependents of packages of other groups
  if (rootPackage.newVersion || !packages.some(pkg => pkg.reason === 'dependency')) {
    return rootPackage.newVersion
  }

  logger.debug(`${rootPackage.name}: no commits, bumped because packages depend on packages of other version groups`)

  return getDependencyRootVersion({ config, rootPackage, suffix })
}

/**
 * Root version of a unified/selective group bumped only for the dependents of
 * packages of other version groups: a patch (or the matching prerelease).
 */
function getDependencyRootVersion({
  config,
  rootPackage,
  suffix,
}: {
  config: ResolvedRelizyConfig
  rootPackage: { name: string, version: string }
  suffix: string | undefined
}): string {
  return getPackageNewVersion({
    name: rootPackage.name,
    currentVersion: rootPackage.version,
    releaseType: getDependencyReleaseType(rootPackage.version, config.bump.type),
    preid: config.bump.preid,
    suffix,
  })
}

/**
 * Version the bumped packages of a unified/selective group get: the root
 * version from the commits, or the one of a bump for dependents only.
 */
function getPlannedRootVersion({
  config,
  rootPackage,
  externalBumps,
  suffix,
}: {
  config: ResolvedRelizyConfig
  rootPackage: { name: string, version: string, newVersion?: string }
  externalBumps: Map<string, VersionChange> | undefined
  suffix: string | undefined
}): string | undefined {
  return rootPackage.newVersion ?? (externalBumps?.size ? getDependencyRootVersion({ config, rootPackage, suffix }) : undefined)
}

async function planUnifiedMode({
  config,
  dryRun,
  force,
  suffix,
  externalBumps,
}: BumpStrategyInput): Promise<BumpPlan> {
  logger.debug('Starting bump in unified mode')

  const rootPackageBase = readPackageJson(config.cwd)

  if (!rootPackageBase) {
    throw new Error('Failed to read root package.json')
  }

  const { from, to } = await resolveTags<'bump'>({
    config,
    step: 'bump',
    newVersion: undefined,
    pkg: rootPackageBase,
  })

  const rootPackage = await getRootPackage({
    config,
    force,
    from,
    to,
    suffix,
    changelog: false,
    dryRun,
  })

  // Only needed to find dependents of other version groups when there is no new version
  const packages = rootPackage.newVersion || externalBumps?.size
    ? await getPackages({ config, suffix, force, includeAll: true, dryRun, externalBumps, newVersionOverride: getPlannedRootVersion({ config, rootPackage, externalBumps, suffix }) })
    : []

  const currentVersion = rootPackage.version
  const newVersion = getRootNewVersion({ config, rootPackage, packages, suffix })

  if (!newVersion) {
    logger.debug('Could not determine a new version')
    return NOT_BUMPED
  }

  logger.debug(`Bump from ${from} to ${to}`)

  logger.debug(`${currentVersion} → ${newVersion} (${config.monorepo?.versionMode || 'standalone'} mode)`)

  if (packages.length === 0) {
    logger.debug('No packages to bump')
    return NOT_BUMPED
  }

  return {
    result: {
      bumped: true,
      oldVersion: currentVersion,
      fromTag: from,
      newVersion,
      rootPackage: { ...rootPackage, newVersion },
      bumpedPackages: packages.map(pkg => ({
        ...pkg,
        oldVersion: pkg.version,
        newVersion,
        fromTag: from,
        reason: 'commits',
      })),
    },
    confirm: async () => {
      if (!config.bump.yes) {
        await confirmBump({
          versionMode: 'unified',
          packages,
          config,
          force,
          currentVersion,
          newVersion,
          dryRun,
        })
      }
      else {
        logger.info(`${packages.length === 1 ? packages[0].name : packages.length} package(s) bumped from ${currentVersion} to ${newVersion} (${config.monorepo?.versionMode || 'standalone'} mode)`)
      }
    },
    write: () => {
      const packagesToWrite = [rootPackage, ...packages]

      for (const pkg of packagesToWrite) {
        writeVersion(pkg.path, newVersion, dryRun)
      }

      updateLernaVersion({
        rootDir: config.cwd,
        versionMode: config.monorepo?.versionMode,
        version: newVersion,
        dryRun,
      })

      if (!dryRun) {
        logger.info(`All ${packages.length} package(s) bumped to ${newVersion}`)
      }
    },
  }
}

async function planSelectiveMode({
  config,
  dryRun,
  force,
  suffix,
  externalBumps,
}: BumpStrategyInput): Promise<BumpPlan> {
  logger.debug('Starting bump in selective mode')

  const rootPackageBase = readPackageJson(config.cwd)

  if (!rootPackageBase) {
    throw new Error('Failed to read root package.json')
  }

  const { from, to } = await resolveTags<'bump'>({
    config,
    step: 'bump',
    pkg: rootPackageBase,
    newVersion: undefined,
  })

  const rootPackage = await getRootPackage({
    config,
    force,
    from,
    to,
    suffix,
    changelog: false,
    dryRun,
  })

  if (!rootPackage.newVersion && !externalBumps?.size) {
    logger.debug('Could not determine a new version')
    return NOT_BUMPED
  }

  logger.debug('Determining packages to bump...')
  const packages = await getPackages({
    config,
    suffix,
    force,
    dryRun,
    externalBumps,
    newVersionOverride: getPlannedRootVersion({ config, rootPackage, externalBumps, suffix }),
  })

  const currentVersion = rootPackage.version
  const newVersion = getRootNewVersion({ config, rootPackage, packages, suffix })

  if (!newVersion) {
    logger.debug('Could not determine a new version')
    return NOT_BUMPED
  }

  logger.debug(`Bump from ${currentVersion} to ${newVersion}`)

  if (packages.length === 0) {
    logger.debug('No packages to bump')
    return NOT_BUMPED
  }

  return {
    result: {
      bumped: true,
      oldVersion: currentVersion,
      rootPackage: { ...rootPackage, newVersion },
      fromTag: from,
      newVersion,
      bumpedPackages: packages.map(pkg => ({
        ...pkg,
        oldVersion: pkg.version,
        fromTag: from,
        newVersion,
      })),
    },
    confirm: async () => {
      if (!config.bump.yes) {
        await confirmBump({
          versionMode: 'selective',
          config,
          packages,
          force,
          currentVersion,
          newVersion,
          dryRun,
        })
      }
      else if (force) {
        logger.info(`${packages.length} package(s) bumped to ${newVersion} (force)`)
      }
      else {
        const bumpedByCommits = packages.filter(p => 'reason' in p && p.reason === 'commits').length
        const bumpedByDependency = packages.filter(p => 'reason' in p && p.reason === 'dependency').length
        const bumpedByGraduation = packages.filter(p => 'reason' in p && p.reason === 'graduation').length

        logger.info(
          `${currentVersion} → ${newVersion} (selective mode: ${bumpedByCommits} with commits, ${bumpedByDependency} as dependents, ${bumpedByGraduation} from graduation)`,
        )
      }
    },
    write: () => {
      logger.debug(`Writing version to ${packages.length} package(s)`)

      const packagesToWrite = [rootPackage, ...packages]

      for (const pkg of packagesToWrite) {
        writeVersion(pkg.path, newVersion, dryRun)
      }

      updateLernaVersion({
        rootDir: config.cwd,
        versionMode: config.monorepo?.versionMode,
        version: newVersion,
        dryRun,
      })

      if (!dryRun) {
        logger.info(
          `${packages.length} package(s) bumped to ${newVersion}`,
        )
      }
    },
  }
}

async function planIndependentMode({
  config,
  dryRun,
  suffix,
  force,
  externalBumps,
}: BumpStrategyInput): Promise<BumpPlan> {
  logger.debug('Starting bump in independent mode')

  const packagesToBump = await getPackages({
    config,
    suffix,
    force,
    dryRun,
    externalBumps,
  })

  if (packagesToBump.length === 0) {
    logger.debug('No packages to bump')
    return NOT_BUMPED
  }

  const bumpedPackages = packagesToBump.filter(pkg => pkg.newVersion)

  return {
    result: {
      bumped: bumpedPackages.length > 0,
      bumpedPackages: bumpedPackages.map(pkg => ({
        ...pkg,
        oldVersion: pkg.version,
      })),
    } as BumpResult,
    confirm: async () => {
      if (!config.bump.yes) {
        await confirmBump({
          versionMode: 'independent',
          config,
          packages: packagesToBump,
          force,
          dryRun,
        })
      }
      else {
        const bumpedByCommits = packagesToBump.filter(p => p.reason === 'commits').length
        const bumpedByDependency = packagesToBump.filter(p => p.reason === 'dependency').length
        const bumpedByGraduation = packagesToBump.filter(p => p.reason === 'graduation').length

        logger.info(
          `${bumpedByCommits + bumpedByDependency + bumpedByGraduation} package(s) will be bumped independently (${bumpedByCommits} from commits, ${bumpedByDependency} from dependencies, ${bumpedByGraduation} from graduation)`,
        )
      }
    },
    write: () => {
      const writtenPackages = getBumpedIndependentPackages({
        packages: packagesToBump,
        dryRun,
      })

      const bumpedByCommits = writtenPackages.filter(p =>
        packagesToBump.find(pkg => pkg.name === p.name)?.reason === 'commits',
      ).length
      const bumpedByDependency = writtenPackages.length - bumpedByCommits

      if (writtenPackages.length === 0) {
        logger.debug('No packages were bumped')
      }
      else {
        logger.info(
          `${dryRun ? '[dry-run] ' : ''}${writtenPackages.length} package(s) bumped independently (${bumpedByCommits} from commits, ${bumpedByDependency} from dependencies)`,
        )
      }
    },
  }
}

async function planCanaryMode({
  config,
  dryRun,
  preid = 'canary',
  externalBumps,
}: {
  config: ResolvedRelizyConfig
  dryRun: boolean
  preid?: string
  externalBumps?: Map<string, VersionChange>
}): Promise<BumpPlan> {
  logger.debug('Starting bump in canary mode')

  // Branch early for independent mode — each package gets its own canary version
  if (config.monorepo?.versionMode === 'independent') {
    const sha = getShortCommitSha(config.cwd)
    const packages = await getPackages({ config, suffix: undefined, force: false, dryRun, externalBumps })

    if (packages.length === 0) {
      logger.debug('No packages to bump')
      return NOT_BUMPED
    }

    return planCanaryIndependentMode({ config, dryRun, preid, sha, packages })
  }

  const rootPackageBase = readPackageJson(config.cwd)

  if (!rootPackageBase) {
    throw new Error('Failed to read root package.json')
  }

  const currentVersion = rootPackageBase.version

  const { from, to } = await resolveTags<'bump'>({
    config,
    step: 'bump',
    newVersion: undefined,
    pkg: rootPackageBase,
  })

  const commits = await getPackageCommits({
    pkg: rootPackageBase,
    from,
    to,
    config,
    changelog: false,
    dryRun,
  })

  const releaseType = determineSemverChange(commits, config.types as Record<string, { title: string, semver?: SemverBumpType }>)

  const sha = getShortCommitSha(config.cwd)

  const canaryVersion = getCanaryVersion({
    currentVersion,
    releaseType,
    preid,
    sha,
  })

  logger.info(`Canary version: ${canaryVersion}`)

  const versionMode = config.monorepo?.versionMode || 'unified'
  const isUnified = versionMode === 'unified'

  // In unified mode, every package must receive the canary version regardless of commits.
  // In selective mode, only packages with commits + dependents are bumped.
  const packages = await getPackages({
    config,
    suffix: undefined,
    force: false,
    includeAll: isUnified,
    dryRun,
    externalBumps,
    newVersionOverride: canaryVersion,
  })

  if (packages.length === 0) {
    logger.debug('No packages to bump')
    return NOT_BUMPED
  }

  // Override newVersion on each package with the canary version
  const packagesWithCanaryVersion = packages.map(pkg => ({
    ...pkg,
    newVersion: canaryVersion,
  }))

  return {
    result: {
      bumped: true,
      oldVersion: currentVersion,
      fromTag: from,
      newVersion: canaryVersion,
      rootPackage: {
        ...rootPackageBase,
        path: config.cwd,
        fromTag: from,
        commits,
        newVersion: canaryVersion,
      },
      bumpedPackages: packages.map(pkg => ({
        ...pkg,
        oldVersion: pkg.version,
        newVersion: canaryVersion,
        fromTag: from,
      })),
    },
    confirm: async () => {
      if (!config.bump.yes) {
        await confirmBump({
          versionMode,
          config,
          packages: packagesWithCanaryVersion,
          force: false,
          currentVersion,
          newVersion: canaryVersion,
          dryRun,
        })
      }
      else {
        logger.info(`${packages.length === 1 ? packages[0].name : packages.length} package(s) will be bumped to ${canaryVersion} (canary)`)
      }
    },
    write: () => {
      const allPackages = [rootPackageBase, ...packages]

      for (const pkg of allPackages) {
        writeVersion(pkg.path, canaryVersion, dryRun)
      }

      logger.info(`${dryRun ? '[dry-run] ' : ''}${allPackages.length} package(s) bumped to ${canaryVersion} (canary)`)
    },
  }
}

function planCanaryIndependentMode({
  config,
  dryRun,
  preid,
  sha,
  packages,
}: {
  config: ResolvedRelizyConfig
  dryRun: boolean
  preid: string
  sha: string
  packages: PackageBase[]
}): BumpPlan {
  logger.debug('Starting canary bump in independent mode')

  const typesConfig = config.types as Record<string, { title: string, semver?: SemverBumpType }>

  // Compute per-package canary versions based on each package's own version and commits
  const packagesWithCanaryVersion = packages.map((pkg) => {
    const releaseType = determineSemverChange(pkg.commits, typesConfig)

    const canaryVersion = getCanaryVersion({
      currentVersion: pkg.version,
      releaseType,
      preid,
      sha,
    })

    return {
      ...pkg,
      newVersion: canaryVersion,
    }
  })

  return {
    result: {
      bumped: true,
      bumpedPackages: packagesWithCanaryVersion.map(pkg => ({
        ...pkg,
        oldVersion: pkg.version,
      })),
    },
    confirm: async () => {
      if (!config.bump.yes) {
        await confirmBump({
          versionMode: 'independent',
          config,
          packages: packagesWithCanaryVersion,
          force: false,
          dryRun,
        })
      }
      else {
        for (const pkg of packagesWithCanaryVersion) {
          logger.info(`${pkg.name}: ${pkg.version} → ${pkg.newVersion} (canary)`)
        }
      }
    },
    write: () => {
      for (const pkg of packagesWithCanaryVersion) {
        writeVersion(pkg.path, pkg.newVersion, dryRun)
      }

      logger.info(`${dryRun ? '[dry-run] ' : ''}${packagesWithCanaryVersion.length} package(s) bumped independently (canary)`)
    },
  }
}

/**
 * Compute the bump of the packages of the config with the strategy of its version mode.
 */
function planBump({
  config,
  dryRun,
  force,
  suffix,
  canary,
  externalBumps,
}: BumpStrategyInput & { canary: boolean }): Promise<BumpPlan> {
  if (canary) {
    return planCanaryMode({
      config,
      dryRun,
      preid: config.bump.preid,
      externalBumps,
    })
  }

  const payload = {
    config,
    dryRun,
    force,
    suffix,
    externalBumps,
  }

  if (config.monorepo?.versionMode === 'unified' || !config.monorepo?.versionMode) {
    return planUnifiedMode(payload)
  }

  if (config.monorepo?.versionMode === 'selective') {
    return planSelectiveMode(payload)
  }

  return planIndependentMode(payload)
}

/**
 * Ask for the confirmation of every plan, then write them: a refused
 * confirmation leaves every file untouched.
 */
async function applyBumpPlans(plans: BumpPlan[]): Promise<void> {
  const bumpedPlans = plans.filter(plan => plan.result.bumped)

  for (const plan of bumpedPlans) {
    await plan.confirm?.()
  }

  for (const plan of bumpedPlans) {
    plan.write?.()
  }
}

function getBumpedVersions(result: BumpResult): string {
  return result.bumped ? result.bumpedPackages.map(pkg => `${pkg.name}@${pkg.newVersion}`).join(',') : ''
}

/**
 * The packages of each version group and the packages of the other groups they
 * depend on (following the `bump.dependencyTypes` of the group, and the peer
 * dependencies with `bump.outOfRangePeers: 'bump'`).
 */
function readGroupsDependencies({
  config,
  groups,
}: {
  config: ResolvedRelizyConfig
  groups: ResolvedVersionGroup[]
}): Map<string, { names: Set<string>, externalDependencies: Set<string> }> {
  const workspaceNames = new Set(readWorkspacePackages(config).keys())

  return new Map(groups.map(({ group, config: groupConfig }) => {
    // The peer dependencies also count when out-of-range peers are bumped
    const dependencyTypes = groupConfig.bump.outOfRangePeers === 'bump'
      ? [...new Set([...(groupConfig.bump.dependencyTypes ?? []), 'peerDependencies' as const])]
      : groupConfig.bump.dependencyTypes
    const packages = readPackages({
      cwd: groupConfig.cwd,
      patterns: groupConfig.monorepo?.packages,
      ignorePackageNames: groupConfig.monorepo?.ignorePackageNames,
      ignored: groupConfig.monorepo?.ignored,
      includePrivates: groupConfig.monorepo?.includePrivates,
    })
    const names = new Set(packages.map(pkg => pkg.name))
    const externalDependencies = new Set(packages
      .flatMap(pkg => getPackageDependencies({ packagePath: pkg.path, allPackageNames: workspaceNames, dependencyTypes }))
      .filter(name => !names.has(name)))

    return [group.name, { names, externalDependencies }]
  }))
}

/**
 * Order the version groups so that a group comes after the groups it depends
 * on, in declaration order otherwise (and for the groups depending on each other).
 */
function sortGroupsByDependencies(
  groups: ResolvedVersionGroup[],
  dependencies: Map<string, { names: Set<string>, externalDependencies: Set<string> }>,
): ResolvedVersionGroup[] {
  const sorted: ResolvedVersionGroup[] = []
  const remaining = [...groups]

  const dependsOnRemaining = (candidate: ResolvedVersionGroup) => remaining.some(other => other !== candidate
    && [...dependencies.get(candidate.group.name)!.externalDependencies].some(name => dependencies.get(other.group.name)!.names.has(name)))

  while (remaining.length > 0) {
    const next = remaining.find(candidate => !dependsOnRemaining(candidate)) ?? remaining[0]!
    sorted.push(next)
    remaining.splice(remaining.indexOf(next), 1)
  }

  return sorted
}

/**
 * Bump each version group (`monorepo.groups`) with its own version mode, then
 * merge their results.
 *
 * A package depending on a package bumped by another group is bumped too (as
 * a dependent, following the `bump.dependencyTypes` of its group, or when its
 * published peer dependency range rejects the new version), so that its
 * published dependency ranges follow. The groups are computed in dependency
 * order, again until no group changes when they depend on each other, then
 * confirmed, and only then written.
 */
async function bumpVersionGroups({
  config,
  dryRun,
  force,
  suffix,
  canary,
  groups,
}: {
  config: ResolvedRelizyConfig
  dryRun: boolean
  force: boolean
  suffix: string | undefined
  canary: boolean
  groups?: string[]
}): Promise<BumpResult> {
  const resolvedGroups = resolveVersionGroups({ config, only: groups })
  const dependencies = readGroupsDependencies({ config, groups: resolvedGroups })
  const sortedGroups = sortGroupsByDependencies(resolvedGroups, dependencies)
  const plans = new Map<string, { plan: BumpPlan, externalKey: string }>()

  const getExternalBumps = (name: string) => new Map([...plans.entries()]
    .filter(([other]) => other !== name)
    .flatMap(([, { plan }]) => plan.result.bumped ? plan.result.bumpedPackages : [])
    .filter(pkg => pkg.newVersion && dependencies.get(name)!.externalDependencies.has(pkg.name))
    .map(pkg => [pkg.name, { oldVersion: pkg.oldVersion, newVersion: pkg.newVersion! }]))

  // A group can only bump more packages when the other groups do: each pass that changes something
  // bumps at least one more package, and the passes stop once no group changes
  const maxPasses = [...dependencies.values()].reduce((count, { names }) => count + names.size, 0) + 1
  let changed = true
  let pass = 0

  while (changed) {
    if (pass++ > maxPasses) {
      throw new Error('The bumps of the version groups do not converge')
    }

    changed = false

    for (const { group, config: groupConfig } of sortedGroups) {
      const externalBumps = getExternalBumps(group.name)
      const externalKey = [...externalBumps].map(([bumped, { newVersion }]) => `${bumped}@${newVersion}`).sort().join(',')
      const previous = plans.get(group.name)

      if (previous && previous.externalKey === externalKey) {
        continue
      }

      const dependingOn = externalBumps.size ? `, depending on ${[...externalBumps.keys()].join(', ')}` : ''
      logger.info(`Version group "${group.name}" (${group.versionMode} mode)${dependingOn}`)

      const plan = await planBump({ config: groupConfig, dryRun, force, suffix, canary, externalBumps })

      changed ||= getBumpedVersions(plan.result) !== getBumpedVersions(previous?.plan.result ?? { bumped: false })
      plans.set(group.name, { plan, externalKey })
    }
  }

  const results: { group: VersionGroup, result: BumpResult }[] = resolvedGroups.map(({ group }) => ({
    group,
    result: plans.get(group.name)!.plan.result,
  }))

  for (const { group, result } of results) {
    if (!result.bumped) {
      logger.info(`Version group "${group.name}": no packages to bump`)
    }
  }

  await applyBumpPlans(resolvedGroups.map(({ group }) => plans.get(group.name)!.plan))

  return mergeGroupBumpResults(results)
}

// eslint-disable-next-line complexity
export async function bump(options: Partial<BumpOptions> = {}): Promise<BumpResult> {
  const config = await loadRelizyConfig({
    configFile: options.configName,
    baseConfig: options.config,
    overrides: {
      bump: {
        yes: options.yes,
        type: options.type,
        clean: options.clean,
        preid: options.preid,
        dependencyTypes: options.dependencyTypes,
      },
      monorepo: options.includePrivates !== undefined
        ? { includePrivates: options.includePrivates }
        : undefined,
      logLevel: options.logLevel,
    },
  })

  const dryRun = options.dryRun ?? false
  logger.debug(`Dry run: ${dryRun}`)

  const force = options.force ?? false
  logger.debug(`Bump forced: ${force}`)

  try {
    await executeHook('before:bump', config, dryRun)

    logger.start('Start bumping versions')

    if (config.bump.clean && config.release.clean) {
      checkGitStatusIfDirty()
    }

    await fetchGitTags(config.cwd)

    assertVersionGroupsOption({ config, groups: options.groups })

    let result: BumpResult

    if (hasVersionGroups(config)) {
      result = await bumpVersionGroups({
        config,
        dryRun,
        force,
        suffix: options.suffix,
        canary: options.canary ?? false,
        groups: options.groups,
      })
    }
    else {
      logger.debug(`Version mode: ${config.monorepo?.versionMode || 'standalone'}`)

      const packages = readPackages({
        cwd: config.cwd,
        patterns: config.monorepo?.packages,
        ignorePackageNames: config.monorepo?.ignorePackageNames,
        ignored: config.monorepo?.ignored,
      })

      logger.debug(`Found ${packages.length} package(s)`)

      const plan = await planBump({
        config,
        dryRun,
        force,
        suffix: options.suffix,
        canary: options.canary ?? false,
      })

      await applyBumpPlans([plan])

      result = plan.result
    }

    if (result.bumped) {
      const resultLog = result.bumpedPackages.length === 1 ? result.bumpedPackages[0].name : result.bumpedPackages.length
      logger.success(`${dryRun ? '[dry-run] ' : ''}Version bump completed (${resultLog} package${resultLog === 1 || typeof resultLog === 'string' ? '' : 's'} bumped)`)
    }
    else {
      logger.fail('No packages to bump, no relevant commits found')
      return result
    }

    await executeHook('success:bump', config, dryRun)

    return result
  }
  catch (error) {
    if (!options.config) {
      logger.error('Error while bumping version(s)!\n\n', error)
    }

    await executeHook('error:bump', config, dryRun)

    throw error
  }
}
