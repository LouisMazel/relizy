import type { StagedVersion } from '@relizy/core'
import type { PackageBase } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { logger } from '@maz-ui/node'
import { getPublishTag, isNpmjsRegistry, oncePerRun, resolveStaged } from '@relizy/core'
import { getRunState } from './events'
import { getNpmRegistry, resolveRegistryTargetsForPackage } from './npm-registry'

/**
 * The staging of a run: whether `--staged` was asked for it, and the versions
 * it staged (kept in the state of the run, not in files, so the rollback of a
 * canary does not lose them)
 */

interface StagingState {
  /** `--staged` (or `staged: true` of the API) was given to this run: canaries are staged too */
  explicit: boolean
  /** The versions this run staged, in publish order */
  staged: StagedVersion[]
  /** The versions skipped by this run because they were already staged */
  alreadyStaged: Omit<StagedVersion, 'stageId'>[]
}

const STAGING = Symbol('staging')

function getStagingState(): StagingState {
  return getRunState<StagingState>(STAGING, () => ({ explicit: false, staged: [], alreadyStaged: [] }))
}

/** `--staged` was given to this run */
export function markStagedExplicit(): void {
  getStagingState().explicit = true
}

/** Forget the versions a previous publish of the run recorded */
export function clearStagedVersions(): void {
  const state = getStagingState()
  state.staged.splice(0)
  state.alreadyStaged.splice(0)
}

export function recordStagedVersion(version: StagedVersion): void {
  getStagingState().staged.push(version)
}

export function recordAlreadyStagedVersion(version: Omit<StagedVersion, 'stageId'>): void {
  getStagingState().alreadyStaged.push(version)
}

/** The versions this run staged, a copy */
export function getStagedVersions(): StagedVersion[] {
  return getStagingState().staged.map(version => ({ ...version }))
}

/** The versions this run skipped because they were already staged */
export function getAlreadyStagedVersions(): Omit<StagedVersion, 'stageId'>[] {
  return [
    ...getStagingState().alreadyStaged,
  ]
}

/** Mark the approved versions of this run */
export function markStagedApproved(names: { name: string, version: string }[]): void {
  for (const version of getStagingState().staged) {
    if (names.some(({ name, version: approved }) => name === version.name && approved === version.version)) {
      version.approved = true
    }
  }
}

/** The project stages something: `publish.staged` is not `false` */
export function isStagingConfigured(config: ResolvedRelizyConfig): boolean {
  return Boolean(config.publish.staged)
}

/**
 * Whether this version is staged on this registry: `publish.staged` and its
 * filters, the canary rule, and only on npmjs (another registry publishes
 * directly, said once per run)
 */
export function isVersionStaged({ config, packageName, tag, registry }: {
  config: ResolvedRelizyConfig
  packageName: string
  tag: string
  registry: string
}): boolean {
  if (!isStagingConfigured(config)) {
    return false
  }

  const canary = Boolean(config.release.canary)
  const explicit = getStagingState().explicit
  const staged = resolveStaged({
    staged: config.publish.staged,
    tag,
    packageName,
    canary,
    explicit,
  })

  if (!staged) {
    if (canary && resolveStaged({
      staged: config.publish.staged,
      tag,
      packageName,
      canary: false,
    })) {
      oncePerRun({
        key: 'relizy:canary-direct',
        cwd: config.cwd,
        run: () => logger.info('Canaries are published directly: list their tag in publish.staged.tags, or pass --staged, to stage them'),
      })
    }
    return false
  }

  if (!isNpmjsRegistry(registry)) {
    oncePerRun({
      key: `relizy:not-npmjs:${registry}`,
      cwd: config.cwd,
      run: () => logger.info(`${registry}: staging is npmjs only, published directly`),
    })
    return false
  }

  return true
}

/**
 * Whether the run stages none, some or all of the versions of these packages,
 * from their versions and registries, before publishing (no message)
 */
export function getStagingShare({ config, packages }: { config: ResolvedRelizyConfig, packages: PackageBase[] }): 'none' | 'some' | 'all' {
  if (!isStagingConfigured(config) || packages.length === 0) {
    return 'none'
  }

  const canary = Boolean(config.release.canary)
  const explicit = getStagingState().explicit
  const decisions = packages.flatMap(pkg => resolveRegistryTargetsForPackage(pkg, config).map((target) => {
    const tag = getPublishTag(pkg.newVersion || pkg.version, target.tag ?? config.publish.tag)
    const registry = target.registry || getNpmRegistry(config.cwd)
    return isNpmjsRegistry(registry) && resolveStaged({
      staged: config.publish.staged,
      tag,
      packageName: pkg.name,
      canary,
      explicit,
    })
  }))

  return decisions.every(Boolean)
    ? 'all'
    : decisions.some(Boolean)
      ? 'some'
      : 'none'
}

/** The label of the publish step: staging, publishing, or both */
export function getPublishStepLabel(share: 'none' | 'some' | 'all'): string {
  return share === 'all'
    ? 'Staging the packages'
    : share === 'some'
      ? 'Publishing and staging the packages'
      : 'Publishing the packages'
}

export function isStagedPackage(pkg: PackageBase, staged: { name: string, version: string }[]): boolean {
  return staged.some(version => version.name === pkg.name && version.version === (pkg.newVersion || pkg.version))
}

/**
 * What the publish did: `Published a@1.0.0`, or with staging `Published
 * a@1.0.0, staged b@1.0.0` and `Staged b@1.0.0`
 */
export function describePublishOutcome(packages: PackageBase[], verb: string): string {
  const staged = getStagedVersions()
  if (staged.length === 0) {
    return `${verb} ${describePackages(packages)}`
  }

  const direct = packages.filter(pkg => !isStagedPackage(pkg, staged))
  const stagedPackages = packages.filter(pkg => isStagedPackage(pkg, staged))
  const stagedVerb = verb === 'Published'
    ? 'Staged'
    : `${verb.replace(/ publication of$/, ' staging of')}`
  return direct.length > 0
    ? `${verb} ${describePackages(direct)}, staged ${describePackages(stagedPackages)}`
    : `${stagedVerb} ${describePackages(stagedPackages)}`
}

/** The versions: `relizy@2.0.0`, up to 3, else their count */
function describePackages(packages: PackageBase[]): string {
  return packages.length <= 3
    ? packages.map(pkg => `${pkg.name}@${pkg.newVersion || pkg.version}`).join(', ')
    : `${packages.length} packages`
}
