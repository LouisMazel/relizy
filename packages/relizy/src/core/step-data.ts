import type { BumpResult, ProviderReleaseResult, SocialNetworkResult, SocialResult } from '../types'
import type { ResolvedRelizyConfig } from './config'
import type { BumpStepData, ChangelogStepData, CommitAndTagStepData, PrCommentStepData, ProgressStep, ProviderReleaseStepData, PublishStepData, PublishStepPackage, SocialStepData, SocialStepPost, StepItem } from './events'
import { getPublishTag } from '@relizy/core'
import { emitEvent, getRunState } from './events'
import { getNpmRegistry } from './npm-registry'
import { getReleaseUrl } from './social'

/**
 * The data of the steps of a command (the `data` of the `step:done` and
 * `step:failed` events) and the `step:item` events. What a command run by
 * another one did (the changelogs of `changelog()` in `release()`) is recorded
 * in the state of the run while it runs, then taken by the step that ran it.
 */

interface RecordedSteps {
  changelogs: ChangelogStepData['files']
  published: PublishStepPackage[]
  commit?: CommitAndTagStepData['commit']
  prComment?: Omit<PrCommentStepData, 'posted'>
}

const RECORDED = Symbol('step data')

/** What the running command recorded: its own, two runs at the same time never mix */
function getRecorded(): RecordedSteps {
  return getRunState<RecordedSteps>(RECORDED, () => ({ changelogs: [], published: [] }))
}

/** A step starts or ends one of its things, live */
export function emitStepItem(step: ProgressStep, item: StepItem): void {
  emitEvent({ type: 'step:item', step, item })
}

export function recordChangelogFile(file: ChangelogStepData['files'][number]): void {
  getRecorded().changelogs.push(file)
}

/** Forget what a previous run recorded */
export function clearChangelogFiles(): void {
  getRecorded().changelogs.splice(0)
}

/** The changelogs written since the last call */
export function takeChangelogFiles(): ChangelogStepData {
  return {
    files: getRecorded().changelogs.splice(0),
  }
}

export function recordPublishedPackage(pkg: PublishStepPackage): void {
  getRecorded().published.push(pkg)
}

/** Forget what a previous run recorded */
export function clearPublishedPackages(): void {
  getRecorded().published.splice(0)
}

/** The packages published since the last call, with the registry and the dist-tag */
export function takePublishStepData(config: ResolvedRelizyConfig, { dryRun }: { dryRun: boolean }): PublishStepData {
  const packages = getRecorded().published.splice(0)

  return {
    registry: config.publish.registry || getNpmRegistry(config.cwd),
    tag: getPublishTag(packages[0]?.version ?? '', config.publish.tag),
    dryRun,
    packages,
  }
}

export function recordReleaseCommit(commit: NonNullable<CommitAndTagStepData['commit']>): void {
  getRecorded().commit = commit
}

/** The release commit made since the last call, with the tags created */
export function takeCommitAndTagStepData(tags: string[]): CommitAndTagStepData {
  const recorded = getRecorded()
  const commit = recorded.commit
  recorded.commit = undefined

  return {
    ...(commit
      ? { commit }
      : {}),
    tags,
  }
}

/** The pull request about to be commented, none when not detected */
export function recordPrComment(pr: { number: number, url: string } | null | undefined): void {
  getRecorded().prComment = pr
    ? { number: pr.number, url: pr.url }
    : undefined
}

/** The pull request commented since the last call */
export function takePrCommentStepData(posted: boolean): PrCommentStepData {
  const recorded = getRecorded()
  const pr = recorded.prComment
  recorded.prComment = undefined

  return { posted, ...pr }
}

/** The packages of a bump, with their version group */
export function getBumpStepData(result: BumpResult): BumpStepData {
  if (!result.bumped) {
    return { packages: [] }
  }

  return {
    packages: result.bumpedPackages.map((pkg) => {
      const group = result.groups?.find(candidate => candidate.bumpedPackages.some(({ name }) => name === pkg.name))?.name

      return {
        name: pkg.name,
        oldVersion: pkg.oldVersion,
        // Set on every bumped package
        newVersion: pkg.newVersion!,
        ...(group
          ? { group }
          : {}),
      }
    }),
  }
}

/** The releases created on GitHub or GitLab, with their page */
export function getProviderReleaseStepData(config: ResolvedRelizyConfig, result: ProviderReleaseResult): ProviderReleaseStepData {
  return {
    provider: result.detectedProvider,
    releases: result.postedReleases.map((release) => {
      const url = getReleaseUrl(config, release.tag)

      return {
        tag: release.tag,
        name: release.name,
        ...(url
          ? { url }
          : {}),
      }
    }),
  }
}

/** A post on a platform, as data */
export function toSocialStepPost(result: SocialNetworkResult): SocialStepPost {
  const status = result.success
    ? result.skipped ? 'skipped' : 'posted'
    : 'failed'
  const reason = result.error ?? result.skipped

  return {
    platform: result.platform,
    status,
    ...(result.url
      ? { url: result.url }
      : {}),
    ...(reason
      ? { reason }
      : {}),
  }
}

/** The posts of a run, `dryRun` when nothing was posted for real */
export function getSocialStepData(result: SocialResult, { dryRun }: { dryRun: boolean }): SocialStepData {
  return {
    dryRun,
    posts: result.results.map(toSocialStepPost),
  }
}
