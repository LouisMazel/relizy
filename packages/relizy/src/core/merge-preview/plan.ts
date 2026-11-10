import type { BumpResult, PackageBase } from '../../types'
import type { ResolvedRelizyConfig } from '../config'
import type { ReleaseOverview } from '../release-overview'
import type { MergePreviewContext } from './context'
import type { MergePreviewSquash } from './squash'
import { withSimulatedSquash } from '@relizy/core'
import { getReleaseOverview } from '../release-overview'

/** A commit of a released package */
export interface MergePreviewCommit {
  type: string
  scope: string
  description: string
  isBreaking: boolean
  shortHash: string
  /** The commit comes from the pull request, not from the target branch */
  fromPullRequest: boolean
}

/** Why a package is released, and what of it the pull request brings */
export interface MergePreviewPackage {
  name: string
  oldVersion: string
  newVersion: string
  /** `forced` for a package bumped without commit (`--force`) */
  reason: 'commits' | 'dependency' | 'graduation' | 'forced'
  /** The dependency releasing a `dependency` package */
  dependency?: string
  commits: MergePreviewCommit[]
  /** A commit of the pull request releases the package */
  fromPullRequest: boolean
}

/** The release of the merge, computed one way (merge commit, or squash) */
export interface MergePreviewOutcome {
  bumpResult: BumpResult
  /** What the release ships, by version group; none when nothing is released */
  overview?: ReleaseOverview
  /** The released packages, with their reason */
  packages: MergePreviewPackage[]
}

/** What the merge of the pull request releases */
export interface MergePreviewPlan {
  squash: MergePreviewSquash
  /** The release of the merge: with the squash commit when the merge squashes, with the commits otherwise */
  outcome: MergePreviewOutcome
  /** The release of a squash merge, when the merge method is unknown and the squash releases something else */
  squashOutcome?: MergePreviewOutcome
}

/** True when the commit comes from the pull request: one of its commits, or the commit of its squash merge */
function isFromPullRequest(shortHash: string, context?: MergePreviewContext): boolean {
  return Boolean(shortHash && context) && [...context!.commits, context!.headSha].some(hash => hash.startsWith(shortHash))
}

function toPreviewPackage(pkg: PackageBase & { oldVersion: string }, context?: MergePreviewContext): MergePreviewPackage {
  const commits = (pkg.commits ?? []).map(commit => ({
    type: commit.type,
    scope: commit.scope,
    description: commit.description,
    isBreaking: commit.isBreaking,
    shortHash: commit.shortHash,
    fromPullRequest: isFromPullRequest(commit.shortHash, context),
  }))
  const reason = pkg.reason ?? (commits.length > 0
    ? 'commits'
    : 'forced')

  return {
    name: pkg.name,
    oldVersion: pkg.oldVersion,
    newVersion: pkg.newVersion ?? pkg.version,
    reason,
    ...(reason === 'dependency' && pkg.dependencyChain?.[0]
      ? { dependency: pkg.dependencyChain[0] }
      : {}),
    commits,
    fromPullRequest: commits.some(commit => commit.fromPullRequest),
  }
}

async function planOutcome({ config, context, planBump }: {
  config: ResolvedRelizyConfig
  context?: MergePreviewContext
  planBump: () => Promise<BumpResult>
}): Promise<MergePreviewOutcome> {
  const bumpResult = await planBump()
  if (!bumpResult.bumped) {
    return { bumpResult, packages: [] }
  }

  return {
    bumpResult,
    overview: getReleaseOverview({ config, bumpResult }),
    packages: bumpResult.bumpedPackages.map(pkg => toPreviewPackage(pkg, context)).toSorted((a, b) => a.name.localeCompare(b.name)),
  }
}

/** The versions an outcome releases, to compare two outcomes */
function getVersionsKey(outcome: MergePreviewOutcome): string {
  return outcome.packages.map(pkg => `${pkg.name}@${pkg.newVersion}`).join(',')
}

/**
 * Plan the release of the merge of the pull request, as `relizy release`
 * will run it after the merge, without writing anything: on the squash commit
 * when the merge squashes, on the commits otherwise, and both when the merge
 * method is unknown (the squash kept when it releases other versions).
 */
export async function planMergePreview({ config, context, squash, planBump }: {
  config: ResolvedRelizyConfig
  /** The pull request and its merge, none outside a pull request pipeline: the next release */
  context?: MergePreviewContext
  squash: MergePreviewSquash
  /** The bump of the release, planned without writing (`planBumps` of `relizy bump`) */
  planBump: () => Promise<BumpResult>
}): Promise<MergePreviewPlan> {
  const plan = (simulateSquash: boolean) => simulateSquash && squash.squash
    ? withSimulatedSquash(squash.squash, () => planOutcome({ config, context, planBump }))
    : planOutcome({ config, context, planBump })

  if (squash.mode === 'squash') {
    return { squash, outcome: await plan(true) }
  }

  const outcome = await plan(false)
  if (squash.mode === 'commits') {
    return { squash, outcome }
  }

  const squashOutcome = await plan(true)

  return getVersionsKey(squashOutcome) === getVersionsKey(outcome)
    ? { squash, outcome }
    : { squash, outcome, squashOutcome }
}
