import type { BranchSyncResult } from '@relizy/core'
import type { SyncBranchResult, SyncMode, SyncResult } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { logger } from '@maz-ui/node'
import { getErrorMessage } from '@maz-ui/utils/helpers/getErrorMessage'
import { createGithubPullRequest, createGitlabMergeRequest, ensurePushAccess, findGithubPullRequest, findGitlabMergeRequest, getGitPushTarget, isGitlabJobToken, plural, remoteBranchExists, runGit, syncGitBranch } from '@relizy/core'
import micromatch from 'micromatch'
import { recordLink } from './progress'

/**
 * The sync of the branches (`sync` of the config): the released branch merged
 * into the others, after `relizy release` or with `relizy sync`. The git work
 * is `syncGitBranch` of `@relizy/core`.
 */

/** The released branch: the branch of its remote that the release pushed */
export interface SyncSource {
  /** The remote of the branch: `origin` */
  remote: string
  /** The name of the branch on the remote: `main` */
  branch: string
}

/** The released branch: the push target of the current branch */
export function getSyncSource(cwd: string): Promise<SyncSource> {
  return getGitPushTarget(cwd)
}

/** A branch to merge the released branch into, with how */
export interface SyncTarget {
  branch: string
  mode: SyncMode
  /** The template of the merge commit message and of the pull request title */
  message: string
}

const DEFAULT_SYNC_MESSAGE = 'chore(release): sync {{target}} with {{source}}'

/**
 * The branches to merge the released branch into: the `to` of each rule of
 * `sync.rules` whose `from` matches it (a name or a glob: `*` stops at `/`,
 * `**` does not), once each with the mode and message of its first rule, or
 * the `branches` of the run (`--sync`, `--to`) whatever the rules. The
 * released branch is never merged into itself. `mode` (`--sync-mode`) wins over
 * the modes of the rules.
 */
export function getSyncTargets(config: ResolvedRelizyConfig, source: SyncSource, { branches, mode }: { branches?: string[], mode?: SyncMode } = {}): SyncTarget[] {
  const defaults = {
    mode: mode ?? config.sync?.mode ?? 'push',
    message: config.sync?.message || DEFAULT_SYNC_MESSAGE,
  }
  const candidates = branches
    ? branches.map(branch => ({ branch, ...defaults }))
    : (config.sync?.rules ?? [])
        .filter(rule => micromatch.isMatch(source.branch, rule.from))
        .flatMap(rule => rule.to.map(branch => ({
          branch,
          mode: mode ?? rule.mode ?? defaults.mode,
          message: rule.message || defaults.message,
        })))
  const targets = new Map<string, SyncTarget>()

  for (const target of candidates) {
    if (target.branch === source.branch) {
      logger.debug(`sync: "${source.branch}" is the released branch, it is not synced with itself`)
    }
    else if (!targets.has(target.branch)) {
      targets.set(target.branch, target)
    }
  }

  return [
    ...targets.values(),
  ]
}

/** The message of the merge commit, the title of the pull request */
function getSyncMessage({ template, source, target, tags }: { template: string, source: string, target: string, tags: string[] }): string {
  return template
    .replaceAll('{{source}}', source)
    .replaceAll('{{target}}', target)
    .replaceAll('{{tags}}', tags.join(', '))
}

function getGitlabToken(config: ResolvedRelizyConfig): string {
  const token = config.tokens.gitlab

  if (!token) {
    throw new Error('The sync mode "pull-request" needs a GitLab token to open the merge requests: set GITLAB_TOKEN (or RELIZY_GITLAB_TOKEN) to an access token with the api scope')
  }
  if (isGitlabJobToken(token)) {
    throw new Error('The sync mode "pull-request": the CI_JOB_TOKEN of GitLab cannot open merge requests, set GITLAB_TOKEN (or RELIZY_GITLAB_TOKEN) to a project, group or personal access token with the api scope')
  }

  return token
}

/** The provider of the pull requests, and its token */
function checkPullRequestAccess(config: ResolvedRelizyConfig): void {
  const provider = config.repo?.provider

  if (!config.repo?.repo || (provider !== 'github' && provider !== 'gitlab')) {
    throw new Error('The sync mode "pull-request" needs a GitHub or GitLab repository (repo.provider and repo.repo of the config, or the URL of the remote)')
  }

  if (provider === 'github' && !config.tokens.github) {
    throw new Error('The sync mode "pull-request" needs a GitHub token to open the pull requests: set GITHUB_TOKEN or GH_TOKEN (with the pull-requests: write permission in GitHub Actions)')
  }

  if (provider === 'gitlab') {
    getGitlabToken(config)
  }
}

/**
 * Check, before the release writes anything, that the branches can get it:
 * they exist on the remote, and the release can push to them (`push`) or open
 * the pull requests (`pull-request`)
 */
export async function syncSafetyCheck({ config, source, targets }: { config: ResolvedRelizyConfig, source: SyncSource, targets: SyncTarget[] }): Promise<void> {
  const branches = targets.map(target => target.branch)

  if (branches.length === 0) {
    return
  }

  const exists = await Promise.all(branches.map(branch => remoteBranchExists({ cwd: config.cwd, remote: source.remote, branch })))
  const missing = branches.filter((_, index) => !exists[index])

  if (missing.length > 0) {
    const names = missing.map(branch => JSON.stringify(branch)).join(', ')
    const [verb, pronoun] = missing.length === 1
      ? ['does', 'it']
      : ['do', 'them']
    throw new Error(`sync: ${names} ${verb} not exist on "${source.remote}" (the branches to merge "${source.branch}" into): create ${pronoun}, or remove ${pronoun} from the rules of sync`)
  }

  if (targets.some(target => target.mode === 'pull-request')) {
    checkPullRequestAccess(config)
  }

  for (const target of targets.filter(target => target.mode === 'push')) {
    await ensurePushAccess({
      cwd: config.cwd,
      gitlabToken: config.tokens.gitlab,
      branch: target.branch,
      logger,
    })
  }
}

const asCode = (value: string) => `\`${value}\``

function getPullRequestBody({ source, target, tags, conflicts }: { source: string, target: string, tags: string[], conflicts?: string[] }): string {
  const release = tags.length > 0
    ? ` after the release of ${tags.map(asCode).join(', ')}`
    : ''

  return [
    `Merges \`${source}\` into \`${target}\`${release}, so that \`${target}\` gets the release commit and its tags.`,
    ...(conflicts?.length
      ? ['', `The merge is in conflict on ${conflicts.map(asCode).join(', ')}: resolve it in this pull request.`]
      : []),
    '',
    '<sub>Opened by [relizy](https://relizy.dev)</sub>',
  ].join('\n')
}

/** The open pull request from the released branch into `target`, else a new one */
async function openPullRequest({ config, source, target, title, body, dryRun }: {
  config: ResolvedRelizyConfig
  source: string
  target: string
  title: string
  body: string
  dryRun: boolean
}): Promise<SyncBranchResult['pullRequest']> {
  const repo = config.repo!

  if (repo.provider === 'gitlab') {
    const token = getGitlabToken(config)
    const api = { token, repo: repo.repo!, domain: repo.domain }
    const existing = await findGitlabMergeRequest({ ...api, sourceBranch: source, targetBranch: target })

    if (existing) {
      return { number: existing.iid, url: existing.web_url, existing: true }
    }
    if (dryRun) {
      return undefined
    }

    const created = await createGitlabMergeRequest({
      ...api,
      mergeRequest: {
        source_branch: source,
        target_branch: target,
        title,
        description: body,
      },
    })
    return { number: created.iid, url: created.web_url, existing: false }
  }

  const api = { repo, tokens: config.tokens }
  const existing = await findGithubPullRequest(api, { head: source, base: target })

  if (existing) {
    return { number: existing.number, url: existing.html_url, existing: true }
  }
  if (dryRun) {
    return undefined
  }

  const created = await createGithubPullRequest(api, {
    title,
    head: source,
    base: target,
    body,
  })
  return { number: created.number, url: created.html_url, existing: false }
}

function describeConflict(merge: BranchSyncResult): string {
  return `Merge it by hand: ${merge.manualCommands?.join(' && ')}`
}

/**
 * What a branch the source is already in gets from the release commit that a
 * dry run does not create: a fast-forward when it is the source itself, else a
 * merge commit
 */
async function getPendingStatus({ config, remote, target, sourceRef }: { config: ResolvedRelizyConfig, remote: string, target: string, sourceRef: string }): Promise<'fast-forward' | 'merged'> {
  const [targetCommit, sourceCommit] = await Promise.all([
    runGit(['rev-parse', `refs/remotes/${remote}/${target}`], { cwd: config.cwd }),
    runGit(['rev-parse', sourceRef], { cwd: config.cwd }),
  ])

  return targetCommit === sourceCommit
    ? 'fast-forward'
    : 'merged'
}

async function syncBranch({ config, source, sourceRef, target: { branch: target, mode, message: template }, tags, dryRun, pendingCommit }: {
  config: ResolvedRelizyConfig
  source: SyncSource
  sourceRef: string
  target: SyncTarget
  tags: string[]
  dryRun: boolean
  pendingCommit: boolean
}): Promise<SyncBranchResult> {
  const message = getSyncMessage({
    template,
    source: source.branch,
    target,
    tags,
  })
  const pullRequestMode = mode === 'pull-request'
  const merge = await syncGitBranch({
    cwd: config.cwd,
    target,
    source: sourceRef,
    sourceName: source.branch,
    remote: source.remote,
    message,
    noVerify: config.release.noVerify,
    // The pull request mode only computes the merge: the provider does it
    dryRun: dryRun || pullRequestMode,
    logger: pullRequestMode
      ? { debug: logger.debug }
      : logger,
  })

  if (merge.status === 'up-to-date' && !pendingCommit) {
    return { branch: target, mode, status: 'up-to-date' }
  }
  if (merge.status === 'up-to-date' && !pullRequestMode) {
    return { branch: target, mode, status: await getPendingStatus({
      config,
      remote: source.remote,
      target,
      sourceRef,
    }) }
  }

  if (!pullRequestMode) {
    return merge.status === 'conflict'
      ? {
          branch: target,
          mode,
          status: 'conflict',
          conflicts: merge.conflicts,
          reason: describeConflict(merge),
        }
      : {
          branch: target,
          mode,
          status: merge.status,
          ...(merge.commit
            ? { commit: merge.commit }
            : {}),
        }
  }

  const pullRequest = await openPullRequest({
    config,
    source: source.branch,
    target,
    title: message,
    body: getPullRequestBody({
      source: source.branch,
      target,
      tags,
      conflicts: merge.conflicts,
    }),
    dryRun,
  })

  if (pullRequest) {
    recordLink({ step: 'sync', label: `#${pullRequest.number}`, url: pullRequest.url })
  }

  return {
    branch: target,
    mode,
    status: 'pull-request',
    ...(pullRequest
      ? { pullRequest }
      : {}),
    ...(merge.conflicts
      ? { conflicts: merge.conflicts }
      : {}),
  }
}

/** One branch in words: `develop merged`, `develop: pull request #12` */
export function describeSyncBranch(result: SyncBranchResult): string {
  switch (result.status) {
    case 'pull-request':
      return result.pullRequest
        ? `${result.branch}: pull request #${result.pullRequest.number}${result.pullRequest.existing ? ' (already open)' : ''}`
        : `${result.branch}: pull request`
    case 'conflict':
      return `${result.branch}: conflict on ${plural(result.conflicts?.length ?? 0, 'file')}`
    case 'failed':
      return `${result.branch}: failed`
    default:
      return `${result.branch} ${result.status}`
  }
}

/** What the sync did, in one line: `main → develop merged, next up-to-date` */
export function describeSyncResult(result: SyncResult): string {
  return `${result.source} → ${result.branches.map(describeSyncBranch).join(', ')}`
}

/** True when a branch did not get the release: a conflict, or a failure */
export function hasSyncFailures(result: SyncResult): boolean {
  return result.branches.some(branch => branch.status === 'conflict' || branch.status === 'failed')
}

/**
 * Merge the released branch into each target (or open a pull request into
 * it): a conflict or a failure of a branch does not stop the others, it is in
 * the result and logged as a warning with what to do
 */
export async function syncBranches({ config, source, targets, sourceRef = 'HEAD', tags = [], dryRun, pendingCommit = false }: {
  config: ResolvedRelizyConfig
  source: SyncSource
  /** The branches to merge into, see `getSyncTargets` */
  targets: SyncTarget[]
  /** The commit merged, `HEAD` by default */
  sourceRef?: string
  /** The tags of the release, for `{{tags}}` and the pull requests */
  tags?: string[]
  dryRun: boolean
  /**
   * The dry run of a release: its commit, not created, is on top of
   * `sourceRef`, so a branch that already has `sourceRef` still gets it
   */
  pendingCommit?: boolean
}): Promise<SyncResult> {
  const results: SyncBranchResult[] = []

  for (const target of targets) {
    try {
      const result = await syncBranch({
        config,
        source,
        sourceRef,
        target,
        tags,
        dryRun,
        pendingCommit,
      })

      if (result.status === 'conflict') {
        logger.warn(`The merge of "${source.branch}" into "${target.branch}" is in conflict (${result.conflicts?.join(', ')}), nothing was pushed. ${result.reason}`)
      }
      results.push(result)
    }
    catch (error) {
      const reason = getErrorMessage(error)
      logger.warn(`"${target.branch}" could not be synced with "${source.branch}": ${reason}`)
      results.push({
        branch: target.branch,
        mode: target.mode,
        status: 'failed',
        reason,
      })
    }
  }

  return {
    source: source.branch,
    dryRun,
    branches: results,
  }
}
