import type { GitProvider, PrCommentMode } from '../types'
import type { ResolvedRelizyConfig } from './config'
import process from 'node:process'
import { logger } from '@maz-ui/node'
import { detectGitProvider, getCurrentGitBranch, getGitlabAuthHeader, GITLAB_JOB_TOKEN_MR_COMMENT_WARNING, isGitlabJobToken } from '@relizy/core'
import { readGitHubEvent } from './merge-preview/context'

/**
 * The auth header of the merge request requests: `PRIVATE-TOKEN`, or
 * `Authorization: Bearer` for an OAuth token (the one of `glab auth login`).
 * Never `JOB-TOKEN`: the job token cannot comment a merge request
 */
function gitlabAuthHeader(token: string): Record<string, string> {
  return getGitlabAuthHeader(token, {})
}

export interface PullRequestInfo {
  /**
   * PR/MR number
   */
  number: number
  /**
   * PR/MR URL
   */
  url: string
  /**
   * Git provider
   */
  provider: GitProvider
  /**
   * Found from a commit, not from an open pull request of the branch: the
   * release of a merge
   */
  ofCommit?: boolean
}

export function getGitHubApiBase(domain?: string): string {
  const apiDomain = domain === 'github.com' || !domain
    ? 'api.github.com'
    : domain
  return apiDomain === 'api.github.com'
    ? `https://${apiDomain}`
    : `https://${apiDomain}/api/v3`
}

export async function findGitHubPR({
  token,
  repo,
  branch,
  domain,
}: {
  token: string
  repo: string
  branch: string
  domain?: string
}): Promise<PullRequestInfo | null> {
  const owner = repo.split('/')[0]
  const head = encodeURIComponent(`${owner}:${branch}`)
  const url = `${getGitHubApiBase(domain)}/repos/${repo}/pulls?state=open&head=${head}`

  logger.debug(`Querying GitHub API for open PRs: ${url}`)

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.warn(`GitHub API error (${response.status}): ${errorText}`)
    return null
  }

  const pulls = await response.json() as Array<{ number: number, html_url: string }>

  if (pulls.length === 0) {
    logger.debug('No open PRs found for this branch')
    return null
  }

  const pr = pulls[0]
  logger.debug(`Found PR #${pr.number}: ${pr.html_url}`)

  return {
    number: pr.number,
    url: pr.html_url,
    provider: 'github',
  }
}

export async function findGitLabMR({
  token,
  repo,
  branch,
  domain,
}: {
  token: string
  repo: string
  branch: string
  domain?: string
}): Promise<PullRequestInfo | null> {
  const gitlabDomain = domain || 'gitlab.com'
  const projectPath = encodeURIComponent(repo)
  const url = `https://${gitlabDomain}/api/v4/projects/${projectPath}/merge_requests?state=opened&source_branch=${encodeURIComponent(branch)}`

  logger.debug(`Querying GitLab API for open MRs: ${url}`)

  const response = await fetch(url, {
    headers: {
      ...gitlabAuthHeader(token),
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.warn(`GitLab API error (${response.status}): ${errorText}`)
    return null
  }

  const mergeRequests = await response.json() as Array<{ iid: number, web_url: string }>

  if (mergeRequests.length === 0) {
    logger.debug('No open MRs found for this branch')
    return null
  }

  const mr = mergeRequests[0]
  logger.debug(`Found MR !${mr.iid}: ${mr.web_url}`)

  return {
    number: mr.iid,
    url: mr.web_url,
    provider: 'gitlab',
  }
}

function buildPrOverrideInfo(provider: GitProvider, prNumber: number, repo: string, domain?: string): PullRequestInfo | null {
  if (provider === 'github') {
    const githubDomain = domain === 'github.com' || !domain
      ? 'github.com'
      : domain
    return {
      number: prNumber,
      url: `https://${githubDomain}/${repo}/pull/${prNumber}`,
      provider: 'github',
    }
  }

  if (provider === 'gitlab') {
    const gitlabDomain = domain || 'gitlab.com'
    return {
      number: prNumber,
      url: `https://${gitlabDomain}/${repo}/-/merge_requests/${prNumber}`,
      provider: 'gitlab',
    }
  }

  return null
}

/** A pull request of a commit, with where it merges and whether it is merged */
interface CommitPullRequest extends PullRequestInfo {
  merged: boolean
  targetBranch?: string
}

function toPullRequestInfo({ merged: _merged, targetBranch: _targetBranch, ...pr }: CommitPullRequest): PullRequestInfo {
  return pr
}

/**
 * The pull requests of a commit, merged or not: the release of a merge on the
 * default branch comments the pull request it merged
 */
async function listGitHubPrsOfCommit({ token, repo, sha, domain }: { token: string, repo: string, sha: string, domain?: string }): Promise<CommitPullRequest[] | null> {
  const url = `${getGitHubApiBase(domain)}/repos/${repo}/commits/${sha}/pulls`

  logger.debug(`Querying GitHub API for the pull requests of the commit: ${url}`)

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  })

  if (!response.ok) {
    logger.warn(`GitHub API error (${response.status}): ${await response.text()}`)
    return null
  }

  const pulls = await response.json() as Array<{ number: number, html_url: string, merged_at?: string | null, base?: { ref?: string } }>

  return pulls.map(pr => ({
    number: pr.number,
    url: pr.html_url,
    provider: 'github',
    ofCommit: true,
    merged: Boolean(pr.merged_at),
    targetBranch: pr.base?.ref,
  }))
}

/**
 * The merge requests of a commit, merged or not
 */
async function listGitLabMrsOfCommit({ token, repo, sha, domain }: { token: string, repo: string, sha: string, domain?: string }): Promise<CommitPullRequest[] | null> {
  const url = `https://${domain || 'gitlab.com'}/api/v4/projects/${encodeURIComponent(repo)}/repository/commits/${sha}/merge_requests`

  logger.debug(`Querying GitLab API for the merge requests of the commit: ${url}`)

  const response = await fetch(url, {
    headers: {
      ...gitlabAuthHeader(token),
    },
  })

  if (!response.ok) {
    logger.warn(`GitLab API error (${response.status}): ${await response.text()}`)
    return null
  }

  const mergeRequests = await response.json() as Array<{ iid: number, web_url: string, state?: string, target_branch?: string }>

  return mergeRequests.map(mr => ({
    number: mr.iid,
    url: mr.web_url,
    provider: 'gitlab',
    ofCommit: true,
    merged: mr.state === 'merged',
    targetBranch: mr.target_branch,
  }))
}

async function listPrsOfCommit(provider: GitProvider, token: string, repo: string, sha: string, domain?: string): Promise<CommitPullRequest[]> {
  try {
    const list = provider === 'github'
      ? await listGitHubPrsOfCommit({ token, repo, sha, domain })
      : provider === 'gitlab'
        ? await listGitLabMrsOfCommit({ token, repo, sha, domain })
        : null

    return list ?? []
  }
  catch (error) {
    logger.warn(`Could not read the pull requests of the commit ${sha}: ${error}`)
    return []
  }
}

/**
 * The pull request of a GitHub Actions run started by its merge (`pull_request`
 * event, `closed` action, merged): the one the release of the merge comments
 */
function getMergedPullRequestOfEvent(env: NodeJS.ProcessEnv = process.env): PullRequestInfo | null {
  if (env.GITHUB_ACTIONS !== 'true' || !env.GITHUB_EVENT_NAME?.startsWith('pull_request')) {
    return null
  }

  const event = readGitHubEvent(env)
  const pullRequest = event?.pull_request
  if (event?.action !== 'closed' || pullRequest?.merged !== true || !Number.isInteger(pullRequest.number) || typeof pullRequest.html_url !== 'string') {
    return null
  }

  return {
    number: pullRequest.number,
    url: pullRequest.html_url,
    provider: 'github',
    ofCommit: true,
  }
}

function findPrForProvider(provider: GitProvider, token: string, repo: string, branch: string, domain?: string): Promise<PullRequestInfo | null> {
  if (provider === 'github') {
    return findGitHubPR({ token, repo, branch, domain })
  }

  if (provider === 'gitlab') {
    return findGitLabMR({ token, repo, branch, domain })
  }

  logger.debug(`PR detection not supported for provider: ${provider}`)
  return Promise.resolve(null)
}

function getProviderToken(config: ResolvedRelizyConfig, provider: GitProvider): string | undefined {
  if (provider === 'github') {
    return config.tokens.github
  }

  if (provider === 'gitlab') {
    return config.tokens.gitlab
  }

  return undefined
}

/**
 * The pull request of a branch and of a commit: the one merged into the
 * branch by the commit (the release of a merge), else the open one of the
 * branch, else the first one of the commit
 */
async function findReleasePullRequest({ provider, token, repo, domain, branch, sha }: { provider: GitProvider, token: string, repo: string, domain?: string, branch?: string, sha?: string }): Promise<PullRequestInfo | null> {
  const onBranch = Boolean(branch)
  const ofCommit = sha
    ? await listPrsOfCommit(provider, token, repo, sha, domain)
    : []

  // The release of a merge: the pull request merged into the branch, before an
  // open pull request from the branch (the one syncing main into develop)
  const mergedIntoBranch = onBranch
    ? ofCommit.find(pr => pr.merged && pr.targetBranch === branch)
    : undefined
  if (mergedIntoBranch) {
    logger.debug(`Using the pull request merged into ${branch} by the commit ${sha}: #${mergedIntoBranch.number}`)
    return toPullRequestInfo(mergedIntoBranch)
  }

  if (onBranch) {
    logger.debug(`Detecting PR for branch: ${branch}`)
    const pr = await findPrForProvider(provider, token, repo, branch!, domain)

    if (pr || !sha) {
      return pr
    }
  }

  logger.debug(`No open PR for the branch, looking for the PR of the commit ${sha}`)

  // A detached HEAD: the pull request the commit merged, else the first one
  const pr = ofCommit.find(candidate => candidate.merged) ?? ofCommit[0]

  return pr
    ? toPullRequestInfo(pr)
    : null
}

export async function detectPullRequest({
  config,
  prNumber,
  sha,
}: {
  config: ResolvedRelizyConfig
  prNumber?: number
  /**
   * The commit whose pull request is commented when the branch has no open one
   */
  sha?: string
}): Promise<PullRequestInfo | null> {
  const provider = config.repo?.provider as GitProvider | undefined ?? detectGitProvider(config.cwd) ?? undefined
  const repo = config.repo?.repo
  const domain = config.repo?.domain

  if (!provider) {
    logger.warn('Could not detect git provider for PR detection')
    return null
  }

  if (!repo) {
    logger.warn('No repository configuration found for PR detection')
    return null
  }

  if (prNumber) {
    logger.debug(`Using CLI override PR number: ${prNumber}`)
    return buildPrOverrideInfo(provider, prNumber, repo, domain)
  }

  // A workflow run by the merge of a pull request (`pull_request: closed`)
  const merged = provider === 'github'
    ? getMergedPullRequestOfEvent()
    : null
  if (merged) {
    logger.debug(`Using the pull request merged by the event: #${merged.number}`)
    return merged
  }

  const branch = getCurrentGitBranch(config.cwd)
  const onBranch = Boolean(branch) && branch !== 'HEAD'

  if (!onBranch && !sha) {
    logger.debug('Cannot detect PR: not on a named branch (detached HEAD)')
    return null
  }

  const token = getProviderToken(config, provider)
  if (!token) {
    logger.warn(`No ${provider === 'github'
      ? 'GitHub'
      : 'GitLab'} token available for PR detection`)
    return null
  }

  if (provider === 'gitlab' && isGitlabJobToken(token)) {
    logger.warn(GITLAB_JOB_TOKEN_MR_COMMENT_WARNING)
    return null
  }

  return await findReleasePullRequest({
    provider,
    token,
    repo,
    domain,
    branch: onBranch
      ? branch
      : undefined,
    sha,
  })
}

/**
 * Why a pull request cannot be read nor commented without token, with the
 * ways to give one
 */
export function getMissingTokenReason(provider: 'github' | 'gitlab'): string {
  return provider === 'github'
    ? 'no GitHub token: set RELIZY_GITHUB_TOKEN, GITHUB_TOKEN or GH_TOKEN, or log in with gh auth login'
    : 'no GitLab token: set RELIZY_GITLAB_TOKEN, GITLAB_TOKEN or GITLAB_API_TOKEN, or log in with glab auth login'
}

export const PR_COMMENT_MARKER = '<!-- relizy-pr-comment -->'

/** Marks the merge preview of a pull request (`relizy merge-preview`), rewritten by the release of its merge */
export const MERGE_PREVIEW_MARKER = '<!-- relizy-merge-preview -->'

/** The first comment holding a marker, the markers by priority */
function findMarkedComment(comments: Array<{ id: number, body: string }>, markers: string[]): number | null {
  for (const marker of markers) {
    const comment = comments.find(candidate => candidate.body?.includes(marker))
    if (comment) {
      return comment.id
    }
  }

  return null
}

async function createGitHubComment({
  token,
  repo,
  prNumber,
  body,
  domain,
}: {
  token: string
  repo: string
  prNumber: number
  body: string
  domain?: string
}): Promise<boolean> {
  const url = `${getGitHubApiBase(domain)}/repos/${repo}/issues/${prNumber}/comments`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.warn(`Failed to post PR comment (${response.status}): ${errorText}`)
    return false
  }

  return true
}

async function findExistingGitHubComment({
  token,
  repo,
  prNumber,
  domain,
  markers,
}: {
  token: string
  repo: string
  prNumber: number
  domain?: string
  markers: string[]
}): Promise<number | null> {
  const url = `${getGitHubApiBase(domain)}/repos/${repo}/issues/${prNumber}/comments?per_page=100`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.warn(`Failed to list PR comments (${response.status}): ${errorText}`)
    return null
  }

  return findMarkedComment(await response.json() as Array<{ id: number, body: string }>, markers)
}

async function updateGitHubComment({
  token,
  repo,
  commentId,
  body,
  domain,
}: {
  token: string
  repo: string
  commentId: number
  body: string
  domain?: string
}): Promise<boolean> {
  const url = `${getGitHubApiBase(domain)}/repos/${repo}/issues/comments/${commentId}`

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.warn(`Failed to update PR comment (${response.status}): ${errorText}`)
    return false
  }

  return true
}

async function deleteGitHubComment({
  token,
  repo,
  commentId,
  domain,
}: {
  token: string
  repo: string
  commentId: number
  domain?: string
}): Promise<boolean> {
  const url = `${getGitHubApiBase(domain)}/repos/${repo}/issues/comments/${commentId}`

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.warn(`Failed to delete the previous PR comment (${response.status}): ${errorText}`)
    return false
  }

  return true
}

export function getGitLabApiBase(domain?: string): string {
  const gitlabDomain = domain || 'gitlab.com'
  return `https://${gitlabDomain}/api/v4`
}

async function createGitLabComment({
  token,
  repo,
  mrNumber,
  body,
  domain,
}: {
  token: string
  repo: string
  mrNumber: number
  body: string
  domain?: string
}): Promise<boolean> {
  const projectPath = encodeURIComponent(repo)
  const url = `${getGitLabApiBase(domain)}/projects/${projectPath}/merge_requests/${mrNumber}/notes`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...gitlabAuthHeader(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.warn(`Failed to post MR comment (${response.status}): ${errorText}`)
    return false
  }

  return true
}

async function findExistingGitLabComment({
  token,
  repo,
  mrNumber,
  domain,
  markers,
}: {
  token: string
  repo: string
  mrNumber: number
  domain?: string
  markers: string[]
}): Promise<number | null> {
  const projectPath = encodeURIComponent(repo)
  const url = `${getGitLabApiBase(domain)}/projects/${projectPath}/merge_requests/${mrNumber}/notes?per_page=100`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      ...gitlabAuthHeader(token),
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.warn(`Failed to list MR comments (${response.status}): ${errorText}`)
    return null
  }

  return findMarkedComment(await response.json() as Array<{ id: number, body: string }>, markers)
}

async function updateGitLabComment({
  token,
  repo,
  mrNumber,
  noteId,
  body,
  domain,
}: {
  token: string
  repo: string
  mrNumber: number
  noteId: number
  body: string
  domain?: string
}): Promise<boolean> {
  const projectPath = encodeURIComponent(repo)
  const url = `${getGitLabApiBase(domain)}/projects/${projectPath}/merge_requests/${mrNumber}/notes/${noteId}`

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      ...gitlabAuthHeader(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.warn(`Failed to update MR comment (${response.status}): ${errorText}`)
    return false
  }

  return true
}

async function deleteGitLabComment({
  token,
  repo,
  mrNumber,
  noteId,
  domain,
}: {
  token: string
  repo: string
  mrNumber: number
  noteId: number
  domain?: string
}): Promise<boolean> {
  const projectPath = encodeURIComponent(repo)
  const url = `${getGitLabApiBase(domain)}/projects/${projectPath}/merge_requests/${mrNumber}/notes/${noteId}`

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      ...gitlabAuthHeader(token),
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.warn(`Failed to delete the previous MR comment (${response.status}): ${errorText}`)
    return false
  }

  return true
}

async function postGitLabMrComment({
  token,
  repo,
  pr,
  body,
  mode,
  domain,
  markers,
}: {
  token: string
  repo: string
  pr: PullRequestInfo
  body: string
  mode: PrCommentMode
  domain?: string
  markers: string[]
}): Promise<boolean> {
  const existingNoteId = mode === 'append'
    ? null
    : await findExistingGitLabComment({
        token,
        repo,
        mrNumber: pr.number,
        domain,
        markers,
      })

  if (mode === 'update' && existingNoteId) {
    const updated = await updateGitLabComment({
      token,
      repo,
      mrNumber: pr.number,
      noteId: existingNoteId,
      body,
      domain,
    })
    if (updated) {
      logger.success(`Updated comment on MR !${pr.number}`)
    }
    return updated
  }

  const created = await createGitLabComment({
    token,
    repo,
    mrNumber: pr.number,
    body,
    domain,
  })
  if (created) {
    logger.success(`Posted comment on MR !${pr.number}`)
  }

  // Deleted once the new one is posted: a failed post keeps the previous comment
  if (created && existingNoteId) {
    await deleteGitLabComment({
      token,
      repo,
      mrNumber: pr.number,
      noteId: existingNoteId,
      domain,
    })
  }

  return created
}

async function postGitHubPrComment({
  token,
  repo,
  pr,
  body,
  mode,
  domain,
  markers,
}: {
  token: string
  repo: string
  pr: PullRequestInfo
  body: string
  mode: PrCommentMode
  domain?: string
  markers: string[]
}): Promise<boolean> {
  const existingCommentId = mode === 'append'
    ? null
    : await findExistingGitHubComment({
        token,
        repo,
        prNumber: pr.number,
        domain,
        markers,
      })

  if (mode === 'update' && existingCommentId) {
    const updated = await updateGitHubComment({
      token,
      repo,
      commentId: existingCommentId,
      body,
      domain,
    })
    if (updated) {
      logger.success(`Updated comment on PR #${pr.number}`)
    }
    return updated
  }

  const created = await createGitHubComment({
    token,
    repo,
    prNumber: pr.number,
    body,
    domain,
  })
  if (created) {
    logger.success(`Posted comment on PR #${pr.number}`)
  }

  // Deleted once the new one is posted: a failed post keeps the previous comment
  if (created && existingCommentId) {
    await deleteGitHubComment({
      token,
      repo,
      commentId: existingCommentId,
      domain,
    })
  }

  return created
}

/**
 * Post the comment of a release on its pull request, update the comment
 * holding its marker (`prComment.mode: 'update'`), or post a new one and
 * delete the previous (`'recreate'`). The release of a merge
 * rewrites the merge preview of the pull request: the prediction becomes the
 * result. The merge preview updates (or recreates) its own comment, apart
 * from the comments of the releases (canary, prerelease).
 */
export async function postPrComment(options: {
  config: ResolvedRelizyConfig
  pr: PullRequestInfo
  body: string
  /** The comment to update: `PR_COMMENT_MARKER` for a release, `MERGE_PREVIEW_MARKER` for a merge preview */
  marker?: string
}): Promise<boolean> {
  return (await postPrCommentWithReason(options)).posted
}

/**
 * `postPrComment`, with why nothing was posted: no token, a job token of
 * GitLab, no repository, a provider without comments, a refused request
 */
// eslint-disable-next-line complexity
export async function postPrCommentWithReason({
  config,
  pr,
  body,
  marker = PR_COMMENT_MARKER,
}: {
  config: ResolvedRelizyConfig
  pr: PullRequestInfo
  body: string
  marker?: string
}): Promise<{ posted: boolean, reason?: string }> {
  const repo = config.repo?.repo
  const domain = config.repo?.domain
  const isMergePreview = marker === MERGE_PREVIEW_MARKER
  // The merge preview keeps a single comment, recomputed at each push: updated in place, or recreated
  const mode: PrCommentMode = isMergePreview && config.prComment.mode === 'append'
    ? 'update'
    : config.prComment.mode
  const markers = !isMergePreview && pr.ofCommit
    ? [MERGE_PREVIEW_MARKER, marker]
    : [marker]

  if (pr.provider !== 'github' && pr.provider !== 'gitlab') {
    logger.warn(`PR commenting not supported for provider: ${pr.provider}`)
    return { posted: false, reason: `the comments are not supported on ${pr.provider}` }
  }

  const token = getProviderToken(config, pr.provider)
  if (!token) {
    logger.warn(`No ${pr.provider === 'github'
      ? 'GitHub'
      : 'GitLab'} token available for PR commenting`)
    return {
      posted: false,
      reason: getMissingTokenReason(pr.provider),
    }
  }

  if (pr.provider === 'gitlab' && isGitlabJobToken(token)) {
    logger.warn(GITLAB_JOB_TOKEN_MR_COMMENT_WARNING)
    return { posted: false, reason: 'the job token of GitLab (CI_JOB_TOKEN) cannot comment a merge request: set RELIZY_GITLAB_TOKEN' }
  }

  if (!repo) {
    logger.warn('No repository configuration found for PR commenting')
    return { posted: false, reason: 'no repository found (repo of the config)' }
  }

  const refused = { posted: false, reason: `the API of ${pr.provider === 'github'
    ? 'GitHub'
    : 'GitLab'} refused the comment (see the warnings)` }

  try {
    if (pr.provider === 'github') {
      return await postGitHubPrComment({
        token,
        repo,
        pr,
        body,
        mode,
        domain,
        markers,
      })
        ? { posted: true }
        : refused
    }

    return await postGitLabMrComment({
      token,
      repo,
      pr,
      body,
      mode,
      domain,
      markers,
    })
      ? { posted: true }
      : refused
  }
  catch (error) {
    logger.warn(`Failed to post PR comment: ${error}`)
    return { posted: false, reason: `the comment failed: ${error instanceof Error
      ? error.message
      : String(error)}` }
  }
}
