import type { MergePreviewChecks, MergePreviewContext, MergePreviewPlan, MergePreviewResult, MergePreviewSquash, ReleaseReport, ReleaseUi, ResolvedRelizyConfig } from '../core'
import type { MergePreviewConfig, ReleaseOptions } from '../types'
import { logger } from '@maz-ui/node'
import {
  checkMergePreview,
  createCommandUi,
  detectPullRequest,
  fetchGitTags,
  formatMergePreviewMarkdown,
  formatMergePreviewText,
  getCurrentGitBranch,
  getMergePreviewPullRequest,
  getMergePreviewStatusDescription,
  getPublishTag,
  markErrorReported,
  MERGE_PREVIEW_MARKER,
  planMergePreview,
  postPrComment,
  prepareMergePreviewContext,
  resolveMergePreviewSquash,
  setMergePreviewStatus,
  writeReleaseReport,
} from '../core'
import { prepareCiRepository } from '../core/ci'
import { plural } from '../core/format'
import { withGitCache } from '../core/git-cache'
import { planBumps } from './bump'
import { getReleaseConfig } from './release'

/**
 * The options of `relizy merge-preview`: the options of the release job it
 * previews (they decide the versions, the tags and the dist-tag), and the
 * outputs of the preview
 */
export interface MergePreviewOptions extends Pick<ReleaseOptions, 'type' | 'preid' | 'suffix' | 'from' | 'to' | 'force' | 'publish' | 'commit' | 'gitTag' | 'providerRelease'
  | 'registry' | 'tag' | 'token' | 'publishToken' | 'privatePackages' | 'prNumber' | 'logLevel' | 'configName' | 'groups' | 'report'> {
  /**
   * Override of `mergePreview.comment` for this run
   */
  comment?: boolean
  /**
   * Override of `mergePreview.check` for this run
   */
  check?: boolean
}

/** Thrown when the release of the merge would fail: the job of the merge preview fails */
export class MergePreviewError extends Error {
  override name = 'MergePreviewError'
}

function describeProblems(checks: MergePreviewChecks): string {
  const problems = checks.problems.map(problem => `- ${problem.message}`)
  return ['The release of the merge would fail:', ...problems].join('\n')
}

/** `Pull request` or `Merge request` */
function getPullRequestLabel(context: MergePreviewContext): string {
  return context.pullRequest.kind === 'merge request'
    ? 'Merge request'
    : 'Pull request'
}

/** The settings of the run: `mergePreview` of the config, with the flags of the CLI */
function getSettings(config: ResolvedRelizyConfig, options: MergePreviewOptions): MergePreviewConfig {
  return {
    ...config.mergePreview,
    ...(options.comment === undefined
      ? {}
      : { comment: options.comment }),
    ...(options.check === undefined
      ? {}
      : { check: options.check }),
  }
}

interface ComputedPreview {
  context?: MergePreviewContext
  plan?: MergePreviewPlan
  checks: MergePreviewChecks
}

/**
 * The release of the merge and what would make it fail: an error while
 * computing it is a problem of the preview, not a crash of the job
 */
async function computePreview({ config, options, settings, ui }: {
  config: ResolvedRelizyConfig
  options: MergePreviewOptions
  settings: MergePreviewConfig
  ui: ReleaseUi
}): Promise<ComputedPreview> {
  const computed: ComputedPreview = {
    checks: { problems: [], warnings: [] },
  }

  try {
    // The CI clone: full history, branch
    prepareCiRepository(config.cwd)

    const pullRequest = getMergePreviewPullRequest()
    if (pullRequest) {
      computed.context = await ui.step({
        running: `Merging ${pullRequest.targetBranch}, as the merge will`,
        done: result => result.merged
          ? `Computed on ${pullRequest.targetBranch} + this ${pullRequest.kind}`
          : `Computed without the last commits of ${pullRequest.targetBranch}`,
        run: () => prepareMergePreviewContext({ pullRequest, cwd: config.cwd }),
      })
    }
    else {
      logger.info('Not a pull request pipeline: previewing the next release of the current branch, without comment nor commit status')
    }

    const { context } = computed
    const squash: MergePreviewSquash = context
      ? await resolveMergePreviewSquash({
          config,
          context,
          option: settings.squash ?? 'auto',
          cwd: config.cwd,
        })
      : { mode: 'commits', reason: 'not a pull request' }

    await fetchGitTags(config.cwd)

    const subject = context ? 'The merge' : 'The next release'
    const plan = await ui.step({
      running: context ? 'Computing the release of the merge' : 'Computing the next release',
      done: result => result.outcome.packages.length > 0
        ? `${subject} releases ${plural(result.outcome.packages.length, 'package')}`
        : `${subject} releases nothing`,
      run: () => planMergePreview({
        config,
        context,
        squash,
        planBump: async () => (await planBumps({
          config,
          dryRun: true,
          force: options.force,
          suffix: options.suffix,
          groups: options.groups,
        })).result,
      }),
    })
    computed.plan = plan

    computed.checks = await ui.step({
      running: 'Checking what would make the release fail',
      done: result => result.problems.length > 0
        ? `${plural(result.problems.length, 'problem')} would make the release fail`
        : 'Nothing blocks the release',
      failed: result => result.problems.length > 0,
      run: () => checkMergePreview({
        config,
        plan,
        context,
        commitlint: settings.commitlint ?? 'auto',
      }),
    })
  }
  catch (error) {
    computed.checks.problems.push({
      kind: 'error',
      message: error instanceof Error
        ? error.message
        : String(error),
    })
  }

  return computed
}

/** The comment of the pull request, posted or updated in place */
async function commentPullRequest({ config, context, markdown, prNumber }: { config: ResolvedRelizyConfig, context: MergePreviewContext, markdown: string, prNumber?: number }): Promise<boolean> {
  const pr = await detectPullRequest({ config, prNumber: prNumber ?? context.pullRequest.number })
  if (!pr) {
    logger.warn(`No ${context.pullRequest.kind} found to comment`)
    return false
  }

  return postPrComment({
    config,
    pr,
    body: markdown,
    marker: MERGE_PREVIEW_MARKER,
  })
}

/** The comment and the commit status of the pull request, as the settings ask */
async function postOnPullRequest({ config, context, result, settings, prNumber, ui }: {
  config: ResolvedRelizyConfig
  context: MergePreviewContext
  result: MergePreviewResult
  settings: MergePreviewConfig
  prNumber?: number
  ui: ReleaseUi
}): Promise<void> {
  const failed = result.checks.problems.length > 0

  if (settings.comment) {
    const label = getPullRequestLabel(context)
    await ui.step({
      running: `Commenting the ${context.pullRequest.kind}`,
      done: posted => posted
        ? `${label} commented`
        : `${label} not commented`,
      failed: posted => !posted,
      run: () => commentPullRequest({
        config,
        context,
        markdown: formatMergePreviewMarkdown(result),
        prNumber,
      }),
    })
  }

  if (settings.check) {
    await ui.step({
      running: 'Setting the commit status',
      done: set => set
        ? `Commit status ${failed ? 'failed' : 'success'}`
        : 'Commit status not set',
      failed: set => !set,
      run: () => setMergePreviewStatus({
        config,
        context,
        failed,
        description: getMergePreviewStatusDescription(result),
      }),
    })
  }
}

function getReportStatus(result: MergePreviewResult): ReleaseReport['status'] {
  if (result.checks.problems.length > 0) {
    return 'failed'
  }

  return result.plan?.outcome.bumpResult.bumped ? 'released' : 'nothing'
}

/** The report of the run: nothing released, the merge preview in the summary of the CI job */
function getReport(result: MergePreviewResult): ReleaseReport {
  const { context, plan, checks } = result

  return {
    status: getReportStatus(result),
    released: false,
    dryRun: true,
    canary: false,
    release: plan?.outcome.overview,
    version: plan?.outcome.overview?.groups.find(group => group.versionMode !== 'independent')?.version,
    tags: [],
    steps: [],
    mergePreview: {
      pullRequest: context?.pullRequest.number,
      squash: plan?.squash.mode,
      problems: checks.problems,
      warnings: checks.warnings,
      markdown: formatMergePreviewMarkdown(result),
    },
    ...(checks.problems.length > 0
      ? {
          error: describeProblems(checks),
        }
      : {}),
  }
}

function getOutcomeMessage(result: MergePreviewResult): string {
  if (result.checks.problems.length > 0) {
    return 'The release would fail'
  }
  if (result.plan?.outcome.packages.length) {
    return 'Merge preview ready'
  }

  return `${result.context ? 'The merge' : 'The next release'} releases nothing`
}

/**
 * `relizy merge-preview`: what the merge of the pull request of the CI job
 * releases, computed as the release of the merge will run (with the options of
 * the release job), without writing, committing, tagging, pushing nor
 * publishing anything, and without the hooks. Posted as a comment and a commit
 * status of the pull request, printed in the terminal and the summary of the
 * CI job. Throws a `MergePreviewError` when the release of the merge would fail.
 */
export function mergePreview(options: MergePreviewOptions = {}): Promise<ReleaseReport> {
  // One git cache for the run, as a release
  return withGitCache(() => runMergePreview(options))
}

async function runMergePreview(options: MergePreviewOptions): Promise<ReleaseReport> {
  const config = await getReleaseConfig(options)
  const settings = getSettings(config, options)
  const ui = createCommandUi({
    title: 'relizy merge-preview',
    dryRun: true,
    logLevel: config.logLevel,
    cwd: config.cwd,
  })
  const { context, plan, checks } = await computePreview({ config, options, settings, ui })

  const outcome = plan?.outcome
  const version = outcome?.bumpResult.bumped
    ? outcome.bumpResult.newVersion ?? outcome.packages[0]?.newVersion ?? ''
    : ''
  const result: MergePreviewResult = {
    context,
    plan,
    checks,
    publish: {
      enabled: Boolean(config.release.publish),
      distTag: getPublishTag(version, config.publish.tag),
    },
    branch: context?.pullRequest.targetBranch ?? getCurrentGitBranch(config.cwd),
  }

  if (context) {
    await postOnPullRequest({
      config,
      context,
      result,
      settings,
      prNumber: options.prNumber,
      ui,
    })
  }

  const report = getReport(result)
  writeReleaseReport({ config, report })

  const failed = checks.problems.length > 0
  ui.complete({
    message: getOutcomeMessage(result),
    nothing: !failed && !outcome?.packages.length,
    failed,
    details: formatMergePreviewText(result).split('\n'),
  })

  if (failed) {
    const error = new MergePreviewError(describeProblems(checks))
    // Already shown by the output of the command
    markErrorReported(error)
    throw error
  }

  return report
}
