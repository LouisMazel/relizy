import type { ResolvedRelizyConfig } from '../config'
import type { MergePreviewPullRequest } from './context'
import { detectGitProvider, isGitlabJobToken } from '@relizy/core'
import { getMissingTokenReason } from '../pr-comment'
import { getProviderApi } from './api'

interface GitHubPull {
  number: number
  state: string
  merged_at?: string | null
  title?: string
  body?: string | null
  base: { ref: string }
  head: { sha: string }
}

interface GitLabMergeRequest {
  iid: number
  state: string
  title?: string
  description?: string | null
  target_branch: string
  sha: string
}

/** The pull request read from the API, or why it cannot be */
export type RemotePullRequest = { pullRequest: MergePreviewPullRequest, reason?: undefined } | { pullRequest?: undefined, reason: string }

function isNotFound(error: unknown): boolean {
  return error instanceof Error && /: 404\b/.test(error.message)
}

function describeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error)
}

async function readGitHubPull(config: ResolvedRelizyConfig, number: number): Promise<RemotePullRequest> {
  const api = getProviderApi(config, 'github')
  if (!api) {
    return {
      reason: getMissingTokenReason('github'),
    }
  }

  try {
    const pull = await api.request<GitHubPull>('GET', `/pulls/${number}`)
    if (pull.state !== 'open') {
      return { reason: `the pull request #${number} is ${pull.merged_at ? 'merged' : 'closed'}` }
    }

    return {
      pullRequest: {
        provider: 'github',
        kind: 'pull request',
        number,
        title: pull.title || undefined,
        body: pull.body || undefined,
        targetBranch: pull.base.ref,
        headSha: pull.head.sha,
      },
    }
  }
  catch (error) {
    return {
      reason: isNotFound(error)
        ? `the pull request #${number} was not found in ${config.repo?.repo}`
        : `the pull request #${number} could not be read: ${describeError(error)}`,
    }
  }
}

async function readGitLabMergeRequest(config: ResolvedRelizyConfig, number: number): Promise<RemotePullRequest> {
  const api = getProviderApi(config, 'gitlab')
  if (!api) {
    return {
      reason: getMissingTokenReason('gitlab'),
    }
  }

  if (isGitlabJobToken(config.tokens.gitlab!)) {
    return { reason: 'the job token of GitLab (CI_JOB_TOKEN) cannot read nor comment a merge request: set RELIZY_GITLAB_TOKEN' }
  }

  try {
    const mergeRequest = await api.request<GitLabMergeRequest>('GET', `/merge_requests/${number}`)
    if (mergeRequest.state !== 'opened') {
      return { reason: `the merge request !${number} is ${mergeRequest.state}` }
    }

    return {
      pullRequest: {
        provider: 'gitlab',
        kind: 'merge request',
        number,
        title: mergeRequest.title?.replace(/^(?:draft:|\[draft\]|\(draft\))\s*/i, '') || undefined,
        body: mergeRequest.description || undefined,
        targetBranch: mergeRequest.target_branch,
        headSha: mergeRequest.sha,
      },
    }
  }
  catch (error) {
    return {
      reason: isNotFound(error)
        ? `the merge request !${number} was not found in ${config.repo?.repo}`
        : `the merge request !${number} could not be read: ${describeError(error)}`,
    }
  }
}

function getRemoteProvider(config: ResolvedRelizyConfig) {
  return config.repo?.provider ?? detectGitProvider(config.cwd) ?? undefined
}

/** `merge request !7` on GitLab, `pull request #7` otherwise: the request `number` named as its forge does */
export function getRemotePullRequestName(config: ResolvedRelizyConfig, number: number): string {
  return getRemoteProvider(config) === 'gitlab'
    ? `merge request !${number}`
    : `pull request #${number}`
}

/**
 * The open pull/merge request `number` of the repository, read from the API
 * of its forge with the token of the config (the GitHub or GitLab CLI when
 * none is set): what the merge preview of a pull request computes outside its
 * pipeline. Gives why it cannot be read instead of throwing: no token, forge
 * unknown, not found, closed.
 */
export function readRemotePullRequest(config: ResolvedRelizyConfig, number: number): Promise<RemotePullRequest> {
  const provider = getRemoteProvider(config)

  if (provider !== 'github' && provider !== 'gitlab') {
    return Promise.resolve({ reason: `the forge of the repository is unknown${provider
      ? ` (${provider})`
      : ''}: set repo.provider to github or gitlab` })
  }

  if (!config.repo?.repo) {
    return Promise.resolve({ reason: 'no repository found: set repo.repo (owner/name) in the config' })
  }

  return provider === 'github'
    ? readGitHubPull(config, number)
    : readGitLabMergeRequest(config, number)
}
