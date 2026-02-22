import type { GitProvider } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { logger } from '@maz-ui/node'
import { detectGitProvider, getCurrentGitBranch } from './git'

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
}

function getGitHubApiBase(domain?: string): string {
  const apiDomain = domain === 'github.com' || !domain ? 'api.github.com' : domain
  return apiDomain === 'api.github.com' ? `https://${apiDomain}` : `https://${apiDomain}/api/v3`
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
      'PRIVATE-TOKEN': token,
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
    const githubDomain = domain === 'github.com' || !domain ? 'github.com' : domain
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
    return config.tokens.github || config.repo?.token
  }

  if (provider === 'gitlab') {
    return config.tokens.gitlab || config.repo?.token
  }

  return undefined
}

export async function detectPullRequest({
  config,
  prNumber,
}: {
  config: ResolvedRelizyConfig
  prNumber?: number
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

  const branch = getCurrentGitBranch(config.cwd)

  if (!branch || branch === 'HEAD') {
    logger.debug('Cannot detect PR: not on a named branch (detached HEAD)')
    return null
  }

  logger.debug(`Detecting PR for branch: ${branch}`)

  const token = getProviderToken(config, provider)
  if (!token) {
    logger.warn(`No ${provider === 'github' ? 'GitHub' : 'GitLab'} token available for PR detection`)
    return null
  }

  return await findPrForProvider(provider, token, repo, branch, domain)
}
