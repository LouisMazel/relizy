import type { GitCommit } from '@relizy/core'
import type { BumpResult, BumpResultTruthy, PackageBase, ReleaseOptions, VersionMode } from '../types'
import type { ResolvedRelizyConfig } from './config'
import type { MergePreviewProblem } from './merge-preview'
import type { PackageSet } from './package-sets'
import type { ReleaseStepId } from './steps'
import { logger } from '@maz-ui/node'
import { aggregateIndependentChangelogs, fetchGitTags } from '@relizy/core'
import * as semver from 'semver'
import { planBumps } from '../commands/bump'
import { getReleaseConfig } from '../commands/release'
import { generateChangelog } from './changelog'
import { getReleaseTags } from './git'
import { keepLogLevel, withLogCapture } from './log-capture'
import { checkMergePreview } from './merge-preview/problems'
import { readPackageSets, relativePath } from './package-sets'
import { getReleaseOverview } from './release-overview'
import { readPackageJson } from './repo'
import { resetRewrittenTagCache } from './rewritten-tags'
import { RELEASE_STEP_LABELS } from './steps'

/** A commit that explains a bump */
export interface PreviewCommit {
  hash: string
  shortHash: string
  /** `feat`, `fix`... */
  type: string
  /** Empty without scope */
  scope: string
  /** The subject without its type and scope */
  description: string
  breaking: boolean
  author?: string
}

/** The release type of a bump, from the old version to the new one */
export type PreviewBumpType = 'major' | 'minor' | 'patch' | 'premajor' | 'preminor' | 'prepatch' | 'prerelease' | 'graduation' | 'canary'

export interface PreviewPackage {
  name: string
  /** Directory of the package, relative to the project (`.` for the root) */
  path: string
  private: boolean
  oldVersion: string
  newVersion: string
  /** `major`, `minor`... computed from the two versions */
  bump: PreviewBumpType
  /** The release tag of the package: its own tag in an `independent` group, the one of the repository otherwise */
  tag?: string
  /**
   * Why it is released: its `commits`, a bumped `dependency` (see `dependency`), the `graduation`
   * of its prerelease, `forced` (`force`), or the `unified` version it follows
   */
  reason: 'commits' | 'dependency' | 'graduation' | 'forced' | 'unified'
  commits: PreviewCommit[]
  /** Set for the `dependency` reason */
  dependency?: {
    /** The dependencies leading to the one that bumps it, the first one released by commits last */
    chain: string[]
    /** The version group releasing the dependency, when it is another one */
    group?: string
    /** The new version of the dependency is out of the published range of the package: the range, the field and the new version */
    outOfRange?: { name: string, field: 'dependencies' | 'devDependencies' | 'peerDependencies', range: string | null, newVersion: string }
  }
  /** A peer dependency making a breaking change that the published range of the package rejects */
  breakingPeerDependency?: string
}

export interface PreviewSet {
  /** Name of the version group, none without `monorepo.groups` */
  group?: string
  title: string
  versionMode: VersionMode | 'standalone'
  /** False when nothing in the set is released */
  released: boolean
  /** Version of a `unified`/`selective` set (the root version), `oldVersion` the one it compares against */
  oldVersion?: string
  newVersion?: string
  /** Tag the commits are read from */
  fromTag?: string
  /** The repository tag of a `unified`/`selective` set */
  tag?: string
  bump?: PreviewBumpType
  /** The commits of the set (the root package): the ones of each package are in `packages` */
  commits: PreviewCommit[]
  packages: PreviewPackage[]
  /** The packages of the set that are not released (no commit, no bumped dependency) */
  notReleased: string[]
}

export interface PreviewStep {
  name: ReleaseStepId
  label: string
  /** Whether `relizy release` runs the step with this config */
  enabled: boolean
  /** The option turning the step off, when it is off: `release.social`, `release.canary` */
  disabledBy?: string
}

export interface PreviewChangelog {
  /** What it is for: `root (relizy)`, the name of a package */
  label: string
  /** The file it is added to, relative to the project: `packages/core/CHANGELOG.md` */
  file: string
  packageName: string
  /** The entry the release adds at the top of the file, in markdown */
  content: string
}

export interface ReleasePreview {
  /** The profile applied */
  profile?: string
  /** A canary release (`release.canary`) */
  canary: boolean
  /** The version mode of the project, `groups` with `monorepo.groups` (each set has its own) */
  versionMode: VersionMode | 'standalone' | 'groups'
  /** True when at least one package is released */
  released: boolean
  /** One set for the project, one per version group with `monorepo.groups` */
  sets: PreviewSet[]
  /** The git tags the release creates */
  tags: string[]
  /** Every step of `relizy release` in its order, with whether it runs */
  steps: PreviewStep[]
  /** What would make the release fail (version or tag already taken...), with `checks: true` */
  problems: MergePreviewProblem[]
  /** What could not be checked, and the warnings of the computation */
  warnings: string[]
  /** The changelog entries of the release, with `changelog: true` */
  changelogs: PreviewChangelog[]
}

export interface PreviewReleaseOptions extends Pick<ReleaseOptions, 'configName' | 'config' | 'profile' | 'overrides' | 'type' | 'preid' | 'suffix' | 'from' | 'to' | 'canary' | 'force' | 'groups'> {
  /** Root of the project, `process.cwd()` by default */
  cwd?: string
  /** Run `git fetch --tags` first, as the release does (network). Default: false, the local tags are used */
  fetchTags?: boolean
  /** Check what would make the release fail: versions already published, tags already on the remote (network). Default: false */
  checks?: boolean
  /** Generate the changelog entries (`changelogs`), for every package, or only for `{ package }` ("root" for the root changelog). With `contributors`, the contributors section (may reach the network). Default: false */
  changelog?: boolean | { package?: string, contributors?: boolean }
}

export type PreviewChangelogOptions = Omit<PreviewReleaseOptions, 'changelog' | 'checks'> & {
  /** Only the changelog of this package, `root` for the root changelog */
  package?: string
  /** Include the contributors section (may reach the network). Default: false */
  contributors?: boolean
}

/** Run a function keeping the logs of relizy instead of printing them (the previews are quiet): the warnings are returned */
async function captureWarnings<T>(run: () => Promise<T>): Promise<{ value: T, warnings: string[] }> {
  const warnings: string[] = []
  const value = await keepLogLevel(() => withLogCapture(({ type, message }) => {
    if (type === 'warn') {
      warnings.push(message.split('\n')[0]!)
    }
  }, run))

  return { value, warnings }
}

/** Thrown by `previewChangelog({ package })` for a package the release does not release */
export class UnreleasedPackageError extends Error {
  override name = 'UnreleasedPackageError'

  constructor(readonly packageName: string, readonly released: string[], readonly root: boolean) {
    super(`"${packageName}" is not released by this release. Released: ${released.join(', ') || 'nothing'}${root ? ' (and root)' : ''}`)
  }
}

interface ReleasePlan {
  config: ResolvedRelizyConfig
  result: BumpResult
  sets: { set: PackageSet, result: BumpResult }[]
}

async function planRelease(options: PreviewReleaseOptions): Promise<ReleasePlan> {
  const config = await getReleaseConfig({
    configName: options.configName,
    config: options.config,
    profile: options.profile,
    type: options.type,
    preid: options.preid,
    from: options.from,
    to: options.to,
    canary: options.canary,
    yes: true,
    // The warnings are kept for `warnings`, unless the overrides ask for another level
    logLevel: options.overrides?.logLevel ?? 'default',
    overrides: {
      // Nothing runs nor asks
      onRewrittenTag: 'ephemeral',
      ...(options.cwd
        ? { cwd: options.cwd }
        : {}),
      ...options.overrides,
    },
  })
  config.hooks = {}
  resetRewrittenTagCache()

  if (options.fetchTags) {
    await fetchGitTags({ cwd: config.cwd, logger })
  }

  const planned = await planBumps({
    config,
    dryRun: true,
    force: options.force,
    suffix: options.suffix ?? config.bump.suffix,
    canary: config.release.canary ?? false,
    groups: options.groups,
  })

  return toReleasePlan({ config, result: planned.result, groups: options.groups })
}

/** The sets of the release (the project, or each version group) with what each one bumps */
function toReleasePlan({ config, result, groups }: { config: ResolvedRelizyConfig, result: BumpResult, groups?: string[] }): ReleasePlan {
  const sets = readPackageSets(config)
    .filter(set => !set.group || !groups?.length || groups.includes(set.group.name))
    .map(set => ({
      set,
      result: set.group
        ? (result.bumped && result.groups?.find(group => group.name === set.group!.name)) || { bumped: false as const }
        : result,
    }))

  return { config, result, sets }
}

/**
 * The changelog entries a bump adds, per file, without writing anything nor
 * running the hooks: what the merge preview shows
 */
export function generateBumpChangelogs({ config, result, groups }: { config: ResolvedRelizyConfig, result: BumpResult, groups?: string[] }): Promise<PreviewChangelog[]> {
  return generateChangelogs(toReleasePlan({
    config: { ...config, hooks: {} },
    result,
    groups,
  }), {})
}

function toPreviewCommit(commit: GitCommit): PreviewCommit {
  return {
    hash: commit.shortHash,
    shortHash: commit.shortHash,
    type: commit.type,
    scope: commit.scope,
    description: commit.description,
    breaking: commit.isBreaking,
    ...(commit.authors?.[0]?.name
      ? { author: commit.authors[0].name }
      : {}),
  }
}

function getBumpType(oldVersion: string, newVersion: string, { canary, graduation }: { canary: boolean, graduation: boolean }): PreviewBumpType {
  if (canary) {
    return 'canary'
  }

  if (graduation) {
    return 'graduation'
  }

  const diff = semver.valid(oldVersion) && semver.valid(newVersion)
    ? semver.diff(oldVersion, newVersion)
    : null

  return (diff ?? 'patch') as PreviewBumpType
}

function toPreviewPackage({ pkg, plan, set, tag }: {
  pkg: PackageBase & { oldVersion?: string }
  plan: ReleasePlan
  set: PackageSet
  tag?: string
}): PreviewPackage {
  const commits = pkg.commits ?? []
  const oldVersion = pkg.oldVersion ?? pkg.version
  const newVersion = pkg.newVersion ?? pkg.version
  const reason: PreviewPackage['reason'] = pkg.reason ?? (set.versionMode === 'unified' && commits.length === 0
    ? 'unified'
    : commits.length > 0
      ? 'commits'
      : 'forced')
  const otherGroup = pkg.dependencyChain?.[0]
    ? plan.sets.find(other => other.set !== set && other.set.packages.some(candidate => candidate.name === pkg.dependencyChain![0]))?.set.group?.name
    : undefined

  return {
    name: pkg.name,
    path: relativePath(plan.config.cwd, pkg.path),
    private: pkg.private,
    oldVersion,
    newVersion,
    bump: getBumpType(oldVersion, newVersion, { canary: plan.config.release.canary === true, graduation: reason === 'graduation' }),
    ...(tag
      ? { tag }
      : {}),
    reason,
    commits: commits.map(toPreviewCommit),
    ...(reason === 'dependency'
      ? {
          dependency: {
            chain: pkg.dependencyChain ?? [],
            ...(otherGroup
              ? { group: otherGroup }
              : {}),
            ...(pkg.outOfRangeDependency
              ? { outOfRange: pkg.outOfRangeDependency }
              : {}),
          },
        }
      : {}),
    ...(pkg.breakingPeerDependency
      ? { breakingPeerDependency: pkg.breakingPeerDependency }
      : {}),
  }
}

/** The version of a `unified`/`selective` set: its versions and its tag, none for an `independent` one */
function getSetVersion({ set, result, plan, tags }: { set: PackageSet, result: BumpResultTruthy, plan: ReleasePlan, tags: Map<string, string> }): Partial<PreviewSet> {
  if (set.versionMode === 'independent' || !result.newVersion) {
    return {}
  }

  const oldVersion = result.oldVersion ?? result.rootPackage?.version ?? ''
  const tag = tags.get(`set:${set.group?.name ?? ''}`)

  return {
    oldVersion,
    newVersion: result.newVersion,
    bump: getBumpType(oldVersion, result.newVersion, { canary: plan.config.release.canary === true, graduation: false }),
    ...tag
      ? { tag }
      : {},
  }
}

function toPreviewSet({ entry, plan, tags }: { entry: ReleasePlan['sets'][number], plan: ReleasePlan, tags: Map<string, string> }): PreviewSet {
  const { set, result } = entry
  const title = set.group?.title ?? set.group?.name ?? (plan.config.projectName || readPackageJson(plan.config.cwd)?.name || '')
  const base = {
    ...set.group
      ? { group: set.group.name }
      : {},
    title,
    versionMode: set.versionMode,
  }

  if (!result.bumped) {
    return {
      ...base,
      released: false,
      commits: [],
      packages: [],
      notReleased: set.packages.map(pkg => pkg.name),
    }
  }

  const bumped = new Set(result.bumpedPackages.map(pkg => pkg.name))

  return {
    ...base,
    released: true,
    ...getSetVersion({ set, result, plan, tags }),
    ...result.fromTag
      ? { fromTag: result.fromTag }
      : {},
    commits: (result.rootPackage?.commits ?? []).map(toPreviewCommit),
    packages: result.bumpedPackages
      .map(pkg => toPreviewPackage({
        pkg,
        plan,
        set,
        tag: tags.get(pkg.name),
      }))
      .toSorted((a, b) => a.name.localeCompare(b.name)),
    notReleased: set.versionMode === 'unified'
      ? []
      : set.packages.filter(pkg => !bumped.has(pkg.name)).map(pkg => pkg.name),
  }
}

/** The tag of each released package, and the tag of each set (`set:<group name>`) */
function collectTags(plan: ReleasePlan): Map<string, string> {
  const tags = new Map<string, string>()

  if (!plan.result.bumped) {
    return tags
  }

  const overview = getReleaseOverview({ config: plan.config, bumpResult: plan.result as BumpResultTruthy })

  for (const group of overview.groups) {
    if (group.tag) {
      tags.set(`set:${group.name ?? ''}`, group.tag)
    }

    for (const pkg of group.packages) {
      tags.set(pkg.name, pkg.tag)
    }
  }

  return tags
}

/** The options `release.canary` turns off */
const CANARY_OFF = new Set([
  'changelog',
  'commit',
  'push',
  'providerRelease',
  'social',
  'gitTag',
])

/** The steps of `relizy release` in its order, and what turns each one off */
function getSteps(config: ResolvedRelizyConfig): PreviewStep[] {
  const { release } = config
  const state = (key: keyof typeof release, ...needs: (keyof typeof release)[]): Pick<PreviewStep, 'enabled' | 'disabledBy'> => {
    const off = [key, ...needs].find(option => release[option] === false)

    if (!off) {
      return { enabled: true }
    }

    return {
      enabled: false,
      disabledBy: release.canary && CANARY_OFF.has(off)
        ? 'release.canary'
        : `release.${off}`,
    }
  }

  return [
    { name: 'bump', label: RELEASE_STEP_LABELS.bump, enabled: true },
    {
      name: 'changelog',
      label: RELEASE_STEP_LABELS.changelog,
      ...state('changelog'),
    },
    {
      name: 'publish',
      label: RELEASE_STEP_LABELS.publish,
      ...state('publish'),
    },
    {
      name: 'commit-and-tag',
      label: RELEASE_STEP_LABELS['commit-and-tag'],
      ...state('commit'),
    },
    {
      name: 'push',
      label: RELEASE_STEP_LABELS.push,
      ...state('push', 'commit'),
    },
    {
      name: 'provider-release',
      label: RELEASE_STEP_LABELS['provider-release'],
      ...state('providerRelease'),
    },
    {
      name: 'social',
      label: RELEASE_STEP_LABELS.social,
      ...state('social'),
    },
    {
      name: 'pr-comment',
      label: RELEASE_STEP_LABELS['pr-comment'],
      ...state('prComment'),
    },
  ]
}

function getVersionModeOf(plan: ReleasePlan): ReleasePreview['versionMode'] {
  return plan.sets.length === 1 && !plan.sets[0]!.set.group
    ? plan.sets[0]!.set.versionMode
    : 'groups'
}

/**
 * What `relizy release` would do now, as data and without writing anything: for
 * each set of packages (the project, or each version group) the versions before and
 * after, the type of the bump, the commits and the reason of each released package
 * (commits, bumped dependency, peer range, graduation...), the tags, the steps that
 * would run, and with `checks` what would make the release fail. No hook runs, nothing
 * is asked, and the network is only used with `fetchTags`, `checks` and `changelog.contributors`.
 * The profile, the config and the overrides apply as in `release()`.
 *
 * @example
 * const preview = await previewRelease({ profile: 'beta' })
 * for (const set of preview.sets) {
 *   console.log(set.title, set.oldVersion, '->', set.newVersion)
 * }
 */
export async function previewRelease(options: PreviewReleaseOptions = {}): Promise<ReleasePreview> {
  const { value, warnings } = await captureWarnings(async () => {
    const plan = await planRelease(options)
    const tags = collectTags(plan)
    const bumpResult = plan.result
    const sets = plan.sets.map(entry => toPreviewSet({ entry, plan, tags }))
    const checks = options.checks && bumpResult.bumped
      ? await checkMergePreview({
          config: plan.config,
          plan: {
            squash: { mode: 'commits', reason: 'release preview' },
            outcome: { bumpResult, packages: [] },
          },
          commitlint: false,
        })
      : { problems: [], warnings: [] }
    const changelogs = options.changelog
      ? await generateChangelogs(plan, typeof options.changelog === 'object'
          ? options.changelog
          : {})
      : []

    return {
      ...(plan.config.profile
        ? { profile: plan.config.profile }
        : {}),
      canary: plan.config.release.canary === true,
      versionMode: getVersionModeOf(plan),
      released: bumpResult.bumped,
      sets,
      tags: bumpResult.bumped
        ? getReleaseTags({
            config: plan.config,
            bumpedPackages: bumpResult.bumpedPackages,
            newVersion: bumpResult.newVersion,
            groups: bumpResult.groups,
          }).map(tag => tag.name)
        : [],
      steps: getSteps(plan.config),
      problems: checks.problems,
      changelogs,
      checkWarnings: checks.warnings,
    }
  })

  const { checkWarnings, ...preview } = value

  return {
    ...preview,
    warnings: [
      ...new Set([
        ...warnings,
        ...checkWarnings,
      ]),
    ],
  }
}

type ChangelogPackage = Parameters<typeof generateChangelog>[0]['pkg'] & { newVersion: string }

interface ChangelogTarget {
  label: string
  file: string
  packageName: string
  generate: () => Promise<string>
}

async function generateChangelogs(plan: ReleasePlan, { package: only, contributors = false }: { package?: string, contributors?: boolean }): Promise<PreviewChangelog[]> {
  const targets: ChangelogTarget[] = []
  const generate = (pkg: ChangelogPackage, config: ResolvedRelizyConfig) => generateChangelog({
    pkg,
    config,
    dryRun: true,
    newVersion: pkg.newVersion,
    include: { contributors },
  })

  for (const { set, result } of plan.sets) {
    if (!result.bumped) {
      continue
    }

    const packages: ChangelogPackage[] = result.bumpedPackages.flatMap(pkg => pkg.newVersion && pkg.path !== plan.config.cwd
      ? [
          { ...pkg, newVersion: pkg.newVersion },
        ]
      : [])

    // As `relizy changelog`: the root changelog of an independent release aggregates the changelogs of its packages
    if (set.config.changelog.rootChangelog) {
      if (set.versionMode !== 'independent' && result.rootPackage && result.newVersion) {
        const rootPackage = { ...result.rootPackage, newVersion: result.newVersion }
        targets.push({
          label: `root (${rootPackage.name})`,
          file: 'CHANGELOG.md',
          packageName: rootPackage.name,
          generate: () => generate(rootPackage, set.config),
        })
      }
      else if (set.versionMode === 'independent' && packages.length > 0) {
        const rootName = readPackageJson(plan.config.cwd)?.name ?? 'root'
        targets.push({
          label: `root (${rootName}, the changelogs of the packages)`,
          file: 'CHANGELOG.md',
          packageName: rootName,
          generate: async () => aggregateIndependentChangelogs(await Promise.all(packages.map(pkg => generate(pkg, set.config)))) ?? '',
        })
      }
    }

    for (const pkg of packages) {
      targets.push({
        label: pkg.name,
        file: `${relativePath(plan.config.cwd, pkg.path)}/CHANGELOG.md`,
        packageName: pkg.name,
        generate: () => generate(pkg, set.config),
      })
    }
  }

  const selected = only
    ? targets.filter(target => target.packageName === only || (only === 'root' && target.file === 'CHANGELOG.md'))
    : targets

  if (only && selected.length === 0) {
    throw new UnreleasedPackageError(only, targets.map(target => target.packageName), targets.some(target => target.file === 'CHANGELOG.md'))
  }

  const changelogs: PreviewChangelog[] = []

  for (const target of selected) {
    changelogs.push({
      label: target.label,
      file: target.file,
      packageName: target.packageName,
      content: await target.generate(),
    })
  }

  return changelogs
}

/**
 * The changelog entries the next release would add, per file (the root `CHANGELOG.md` and
 * the one of each released package), without writing anything. Same options as
 * `previewRelease()`, plus `package` for a single package.
 *
 * @example
 * const changelogs = await previewChangelog({ profile: 'beta', package: 'root' })
 * console.log(changelogs[0].content)
 */
export async function previewChangelog(options: PreviewChangelogOptions = {}): Promise<PreviewChangelog[]> {
  const { package: only, contributors, ...rest } = options
  const { value } = await captureWarnings(async () => generateChangelogs(await planRelease(rest), { package: only, contributors }))

  return value
}
