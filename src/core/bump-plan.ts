import type { ReleaseType } from 'semver'
import type { PackageBase } from '../types'
import type { ResolvedRelizyConfig } from './config'
import type { VersionChange } from './dependencies'
import { logger } from '@maz-ui/node'
import { expandPackagesToBumpWithDependents, getOutOfRangePeers, isBreakingVersionChange } from './dependencies'
import { determineReleaseType, getPackageNewVersion, isChangedPreid, isGraduating, isPrerelease, isStableReleaseType } from './version'

/**
 * The planning of the bumps of `getPackages()`: the release type of each
 * package, its new version, and the dependents bumped with it (workspace
 * dependents, out-of-range peer dependents)
 */

/**
 * Release type of a package bumped only because one of its dependencies is
 * bumped: a patch (or the matching prerelease).
 */
export function getDependencyReleaseType(currentVersion: string, releaseType: ReleaseType): ReleaseType {
  if (isStableReleaseType(releaseType))
    return 'patch'
  if (isPrerelease(currentVersion))
    return 'prerelease'
  return 'prepatch'
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
 * Mark the seeds and their dependents (following `bump.dependencyTypes`) as
 * bumped, keeping the reason of the packages already bumped. A seed with a
 * `dependency` is bumped because of that dependency, the others for their commits.
 * With `outOfRangePeer`, the dependency of the seeds is a peer dependency whose
 * published range rejects its new version.
 */
export function markDependents({
  packages,
  seeds,
  outOfRangePeer = false,
}: {
  packages: Map<string, PackageBase>
  seeds: { pkg: PackageBase, dependency?: string }[]
  outOfRangePeer?: boolean
}): void {
  const seedDependencies = new Map(seeds.map(({ pkg, dependency }) => [pkg.name, dependency]))

  const expandedPackages = expandPackagesToBumpWithDependents({
    allPackages: Array.from(packages.values()),
    packagesWithCommits: seeds.map(({ pkg }) => pkg),
  })

  for (const pkg of expandedPackages) {
    const current = packages.get(pkg.name)!
    // The expansion marks its seeds as bumped by commits
    const dependency = seedDependencies.get(pkg.name)

    if (current.reason && current.reason !== 'commits') {
      continue
    }

    if (current.reason === 'commits') {
      packages.set(pkg.name, { ...pkg, reason: 'commits' })
    }
    else {
      packages.set(pkg.name, dependency
        ? { ...pkg, reason: 'dependency', dependencyChain: [dependency], ...(outOfRangePeer ? { outOfRangePeer: dependency } : {}) }
        : pkg)
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
 * The packages to bump because of their peer dependencies, given the bumped
 * versions: the packages not bumped out of range (`seeds`, with `bumpOutOfRange`)
 * and the bumped packages whose dependency makes a breaking change (`breaking`).
 */
function findPeerDependents({
  packages,
  bumped,
  bumpOutOfRange,
}: {
  packages: Map<string, PackageBase>
  bumped: Map<string, VersionChange>
  bumpOutOfRange: boolean
}) {
  const seeds: { pkg: PackageBase, dependency: string }[] = []
  const breaking: { pkg: PackageBase, dependency: string }[] = []

  for (const pkg of packages.values()) {
    if (pkg.breakingPeerDependency || (!pkg.reason && !bumpOutOfRange)) {
      continue
    }

    const outOfRange = getOutOfRangePeers({ packagePath: pkg.path, bumped })
    const breakingPeer = outOfRange.find(isBreakingVersionChange)

    if (!pkg.reason && outOfRange[0]) {
      seeds.push({ pkg, dependency: outOfRange[0].dependency })
    }
    else if (pkg.reason && breakingPeer) {
      breaking.push({ pkg, dependency: breakingPeer.dependency })
    }
  }

  return { seeds, breaking }
}

/**
 * Follow the peer dependencies whose published range rejects the new version
 * of a bumped dependency, until nothing changes:
 * - with `bumpOutOfRange` (`bump.outOfRangePeers: 'bump'`), the packages not
 *   bumped are bumped as dependents, and their own dependents follow;
 * - the packages bumped while the dependency makes a breaking change are
 *   bumped as for a breaking commit (`breakingPeerDependency`).
 */
export function bumpPeerDependents({
  packages,
  externalBumps,
  bumpOutOfRange,
  ...versionContext
}: {
  packages: Map<string, PackageBase>
  externalBumps?: Map<string, VersionChange>
  bumpOutOfRange: boolean
  config: ResolvedRelizyConfig
  force: boolean
  suffix: string | undefined
  newVersionOverride?: string
}): void {
  for (;;) {
    const bumped = new Map(externalBumps)

    for (const pkg of packages.values()) {
      if (pkg.reason && pkg.newVersion) {
        bumped.set(pkg.name, { oldVersion: pkg.version, newVersion: pkg.newVersion })
      }
    }

    const { seeds, breaking } = findPeerDependents({ packages, bumped, bumpOutOfRange })

    if (seeds.length === 0 && breaking.length === 0) {
      return
    }

    for (const { pkg, dependency } of seeds) {
      logger.debug(`${pkg.name}: the published range of its peer dependency ${dependency} does not accept its new version, bumped as a dependent`)
    }

    markDependents({ packages, seeds, outOfRangePeer: true })

    for (const { pkg, dependency } of breaking) {
      logger.debug(`${pkg.name}: its peer dependency ${dependency} makes a breaking change, bumped as for a breaking commit`)
      packages.set(pkg.name, { ...packages.get(pkg.name)!, breakingPeerDependency: dependency })
    }

    computeNewVersions({ packages, ...versionContext })
  }
}
