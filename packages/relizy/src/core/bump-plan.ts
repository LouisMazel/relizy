import type { DependencyField, OutOfRangeDependency, VersionChange } from '@relizy/core'
import type { PackageBase } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { logger } from '@maz-ui/node'
import { describeOutOfRange, determineReleaseType, expandPackagesToBumpWithDependents, getDependencyReleaseType, getOutOfRangeDependencies, getPackageNewVersion, isBreakingVersionChange, isChangedPreid, isGraduating } from '@relizy/core'

/**
 * The planning of the bumps of `getPackages()`: the release type of each
 * package, its new version, and the dependents bumped with it (workspace
 * dependents, out-of-range dependents)
 */

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
      logger,
    })
  }

  const breakingPeer = Boolean(pkg.breakingPeerDependency)

  if (pkg.reason === 'dependency' && !breakingPeer) {
    return getDependencyReleaseType(pkg.version, releaseType)
  }

  return determineReleaseType({
    currentVersion: pkg.version,
    commits: pkg.commits,
    releaseType,
    preid: config.bump.preid,
    types: config.types,
    force,
    capZeroMajor: config.bump.capZeroMajor,
    breakingPeer,
    logger,
  })
}

/**
 * Packages without commits of their own that depend on a package bumped outside
 * of the config (see `getPackages` `externalBumps`).
 */
export function getExternalDependents(packages: PackageBase[], externalBumps: Map<string, VersionChange> | undefined): PackageBase[] {
  if (!externalBumps?.size) {
    return []
  }

  return packages.filter(pkg => pkg.commits.length === 0 && pkg.dependencies.some(name => externalBumps.has(name)))
}

/**
 * Mark the seeds and, with `expand`, their dependents (following
 * `bump.dependencyTypes`) as bumped, keeping the reason of the packages already
 * bumped. A seed with a `dependency` is bumped because of that dependency, the
 * others for their commits. With `outOfRange`, the published range of the seed
 * rejects the new version of its dependency.
 */
export function markDependents({
  packages,
  seeds,
  expand = true,
}: {
  packages: Map<string, PackageBase>
  seeds: { pkg: PackageBase, dependency?: string, outOfRange?: OutOfRangeDependency }[]
  expand?: boolean
}): void {
  const seedsByName = new Map(seeds.map(seed => [seed.pkg.name, seed]))

  const expandedPackages = expand
    ? expandPackagesToBumpWithDependents({
        allPackages: Array.from(packages.values()),
        packagesWithCommits: seeds.map(({ pkg }) => pkg),
        logger,
      })
    : seeds.map(({ pkg }) => pkg)

  for (const pkg of expandedPackages) {
    const current = packages.get(pkg.name)!
    // The expansion marks its seeds as bumped by commits
    const seed = seedsByName.get(pkg.name)
    const dependency = seed?.outOfRange?.dependency ?? seed?.dependency

    if (current.reason && current.reason !== 'commits') {
      continue
    }

    if (current.reason === 'commits') {
      packages.set(pkg.name, { ...pkg, reason: 'commits' })
    }
    else if (dependency) {
      const outOfRange = seed?.outOfRange

      packages.set(pkg.name, {
        ...pkg,
        reason: 'dependency',
        dependencyChain: [dependency],
        ...(outOfRange
          ? {
              outOfRangeDependency: {
                name: outOfRange.dependency,
                field: outOfRange.field,
                range: outOfRange.range,
                newVersion: outOfRange.newVersion,
              },
            }
          : {}),
      })
    }
    else {
      packages.set(pkg.name, pkg)
    }
  }
}

export function computeNewVersions({
  packages,
  config,
  force,
  suffix,
  newVersionOverride,
}: {
  packages: Map<string, PackageBase>
  config: ResolvedRelizyConfig
  force: boolean
  suffix: string | undefined
  newVersionOverride?: string
}): void {
  for (const pkg of Array.from(packages.values())) {
    const releaseType = getPackageReleaseType({
      pkg,
      config,
      force,
    })

    const newVersion = releaseType
      ? newVersionOverride ?? getPackageNewVersion({
        name: pkg.name,
        currentVersion: pkg.version,
        releaseType,
        preid: config.bump.preid,
        suffix,
        logger,
      })
      : undefined

    const graduating = (releaseType && isGraduating(pkg.version, releaseType)) || isChangedPreid(pkg.version, config.bump.preid)

    packages.set(pkg.name, {
      ...pkg,
      newVersion,
      reason: pkg.reason || (releaseType && graduating && 'graduation') || undefined,
    })
  }
}

/**
 * The packages to bump because of the published ranges of their dependencies,
 * given the bumped versions: the packages not bumped whose range rejects the
 * new version (`seeds`) of a peer dependency (with `bumpOutOfRange`) or of a
 * field of `dependencyFields` (a specifier that is not a semver range counts
 * as out of range there), and the bumped packages whose
 * peer dependency makes a breaking change (`breaking`). Only a peer dependency
 * breaks the consumers of the package: a dependency is installed for it.
 */
function findOutOfRangeDependents({
  packages,
  bumped,
  bumpOutOfRange,
  dependencyFields,
}: {
  packages: Map<string, PackageBase>
  bumped: Map<string, VersionChange>
  bumpOutOfRange: boolean
  dependencyFields: Set<DependencyField>
}) {
  const seeds: { pkg: PackageBase, outOfRange: OutOfRangeDependency }[] = []
  const breaking: { pkg: PackageBase, dependency: string }[] = []
  const fields = [
    ...new Set<DependencyField>(['peerDependencies', ...dependencyFields]),
  ]
  const isSeed = (dependency: OutOfRangeDependency) => dependencyFields.has(dependency.field)
    || (bumpOutOfRange && dependency.field === 'peerDependencies' && dependency.range !== null)

  for (const pkg of packages.values()) {
    if (pkg.breakingPeerDependency || (!pkg.reason && !bumpOutOfRange && dependencyFields.size === 0)) {
      continue
    }

    const outOfRange = getOutOfRangeDependencies({ packagePath: pkg.path, bumped, fields })
    const seed = outOfRange.find(isSeed)
    const breakingPeer = outOfRange.find(dependency => dependency.field === 'peerDependencies' && dependency.range !== null && isBreakingVersionChange(dependency))

    if (!pkg.reason && seed) {
      seeds.push({ pkg, outOfRange: seed })
    }
    else if (pkg.reason && breakingPeer) {
      breaking.push({ pkg, dependency: breakingPeer.dependency })
    }
  }

  return { seeds, breaking }
}

/**
 * Follow the dependencies whose published range rejects the new version of a
 * bumped dependency, until nothing changes:
 * - with `bumpOutOfRange` (`bump.outOfRangePeers: 'bump'`), the packages not
 *   bumped are bumped as dependents of their peer dependencies;
 * - with `outOfRangeDependents` (`bump.dependents: 'out-of-range'`), likewise
 *   for the fields of `bump.dependencyTypes`, then checked in turn as
 *   dependencies; otherwise their own dependents follow them on every bump;
 * - the packages bumped while a peer dependency makes a breaking change are
 *   bumped as for a breaking commit (`breakingPeerDependency`).
 */
export function bumpPeerDependents({
  packages,
  externalBumps,
  bumpOutOfRange,
  outOfRangeDependents = false,
  ...versionContext
}: {
  packages: Map<string, PackageBase>
  externalBumps?: Map<string, VersionChange>
  bumpOutOfRange: boolean
  outOfRangeDependents?: boolean
  config: ResolvedRelizyConfig
  force: boolean
  suffix: string | undefined
  newVersionOverride?: string
}): void {
  const dependencyFields = new Set<DependencyField>(outOfRangeDependents
    ? versionContext.config.bump.dependencyTypes
    : [])

  for (;;) {
    const bumped = new Map(externalBumps)

    for (const pkg of packages.values()) {
      if (pkg.reason && pkg.newVersion) {
        bumped.set(pkg.name, { oldVersion: pkg.version, newVersion: pkg.newVersion })
      }
    }

    const { seeds, breaking } = findOutOfRangeDependents({
      packages,
      bumped,
      bumpOutOfRange,
      dependencyFields,
    })

    if (seeds.length === 0 && breaking.length === 0) {
      return
    }

    for (const { pkg, outOfRange } of seeds) {
      logger.debug(`${pkg.name}: ${describeOutOfRange(outOfRange)}, bumped as a dependent`)
    }

    markDependents({ packages, seeds, expand: !outOfRangeDependents })

    for (const { pkg, dependency } of breaking) {
      logger.debug(`${pkg.name}: its peer dependency ${dependency} makes a breaking change, bumped as for a breaking commit`)
      packages.set(pkg.name, {
        ...packages.get(pkg.name)!,
        breakingPeerDependency: dependency,
      })
    }

    computeNewVersions({ packages, ...versionContext })
  }
}

/**
 * Plan the bumps of the packages of `getPackages()`: the packages with commits,
 * their dependents (out of range only with `bump.dependents: 'out-of-range'`,
 * on every bump with `always`), the dependents of the packages bumped
 * outside of the config (`externalBumps`), their new versions and the
 * out-of-range peer dependents.
 */
export function planPackages({
  packages,
  externalBumps,
  ...versionContext
}: {
  packages: Map<string, PackageBase>
  externalBumps?: Map<string, VersionChange>
  config: ResolvedRelizyConfig
  force: boolean
  suffix: string | undefined
  newVersionOverride?: string
}): void {
  const { config } = versionContext
  const packagesArray = Array.from(packages.values())
  // With `out-of-range`, the dependents are found once the new versions are known (`bumpPeerDependents`)
  const outOfRangeDependents = config.bump.dependents === 'out-of-range'
  const externalDependents = outOfRangeDependents
    ? []
    : getExternalDependents(packagesArray, externalBumps)

  markDependents({
    packages,
    seeds: [
      ...packagesArray.filter(p => p.commits.length > 0).map(pkg => ({ pkg })),
      ...externalDependents.map(pkg => ({
        pkg,
        dependency: pkg.dependencies.find(name => externalBumps!.has(name)),
      })),
    ],
    expand: !outOfRangeDependents,
  })

  computeNewVersions({ packages, ...versionContext })

  // `bump` is the default
  bumpPeerDependents({
    packages,
    externalBumps,
    bumpOutOfRange: !['warn', 'error'].includes(config.bump.outOfRangePeers!),
    outOfRangeDependents,
    ...versionContext,
  })
}
