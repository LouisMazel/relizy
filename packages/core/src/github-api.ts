import type { RepoConfig } from './types'

/**
 * GitHub REST API calls, ported from changelogen 0.6.2:
 * https://github.com/unjs/changelogen/blob/v0.6.2/src/github.ts
 *
 * MIT License - Copyright (c) Pooya Parsa <pooya@pi0.io>
 */

/** A GitHub release, as sent to and returned by the API */
export interface GithubRelease {
  /** Set by GitHub in the response, not needed to create a release */
  id?: string
  /** The git tag of the release */
  tag_name: string
  /** The title of the release */
  name?: string
  /** The description of the release, in markdown */
  body?: string
  /** Create the release as a draft, not published */
  draft?: boolean
  /** Mark the release as a prerelease */
  prerelease?: boolean
}

/** What is needed to call the GitHub API: the repository and the token */
export interface GithubApiConfig {
  /** The repository: its `domain` picks the API URL (github.com or a GitHub Enterprise Server) and `repo` is its `owner/name` */
  repo: RepoConfig
  /** The `github` token is sent as a bearer token, the call is anonymous without it */
  tokens?: { github?: string }
}

/** `https://api.github.com` for github.com, the `/api/v3` of a GitHub Enterprise Server */
export function getGithubApiUrl(domain: string | undefined): string {
  return domain === 'github.com'
    ? 'https://api.github.com'
    : `https://${domain}/api/v3`
}

async function githubFetch<T>(config: GithubApiConfig, path: string, init: { method: string, body?: unknown }): Promise<T> {
  const url = `${getGithubApiUrl(config.repo.domain)}${path}`
  const token = config.tokens?.github

  const response = await fetch(url, {
    method: init.method,
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      ...(token
        ? { authorization: `Bearer ${token}` }
        : {}),
    },
    body: init.body === undefined
      ? undefined
      : JSON.stringify(init.body),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    const message = `[${init.method}] "${url}": ${response.status} ${response.statusText}`
    throw new Error(errorText
      ? `${message} ${errorText}`
      : message)
  }

  return await response.json() as T
}

/**
 * Creates a release with the GitHub API (`POST /repos/{repo}/releases`), on
 * `api.github.com` or the `/api/v3` of a GitHub Enterprise Server.
 * Makes a network call.
 *
 * @param config - The repository and the GitHub token
 * @param body - The release to create
 * @returns The release created, as returned by the API
 * @throws When the response is not ok: `[POST] "<url>": <status> <statusText>` followed by the response text when there is one.
 * @example
 * ```ts
 * const release = await createGithubRelease(
 *   { repo: { provider: 'github', domain: 'github.com', repo: 'maz-ui/relizy' }, tokens: { github: process.env.GITHUB_TOKEN } },
 *   { tag_name: 'v1.2.0', name: 'v1.2.0', body: '### Features\n- add x' },
 * )
 * ```
 */
export async function createGithubRelease(config: GithubApiConfig, body: GithubRelease): Promise<GithubRelease> {
  return await githubFetch<GithubRelease>(config, `/repos/${config.repo.repo}/releases`, {
    method: 'POST',
    body,
  })
}

/** A GitHub pull request, as returned by the API */
export interface GithubPullRequest {
  number: number
  /** Its page on GitHub */
  html_url: string
  title: string
}

/** The pull request to create */
export interface GithubPullRequestInput {
  title: string
  /** The branch to merge */
  head: string
  /** The branch to merge into */
  base: string
  /** The description, in markdown */
  body?: string
}

/**
 * The first open pull request from `head` into `base`
 * (`GET /repos/{repo}/pulls?state=open`). Makes a network call.
 *
 * @param config - The repository and the GitHub token
 * @param options - The branches
 * @param options.head - The branch to merge, without its owner
 * @param options.base - The branch to merge into
 * @returns The pull request, undefined when there is none
 * @throws When the response is not ok: `[GET] "<url>": <status> <statusText>` followed by the response text when there is one.
 * @example
 * ```ts
 * const pr = await findGithubPullRequest(config, { head: 'main', base: 'develop' })
 * ```
 */
export async function findGithubPullRequest(config: GithubApiConfig, { head, base }: { head: string, base: string }): Promise<GithubPullRequest | undefined> {
  const owner = config.repo.repo?.split('/')[0]
  const query = new URLSearchParams({ state: 'open', head: `${owner}:${head}`, base })
  const pulls = await githubFetch<GithubPullRequest[]>(config, `/repos/${config.repo.repo}/pulls?${query}`, { method: 'GET' })

  return pulls[0]
}

/**
 * Creates a pull request with the GitHub API (`POST /repos/{repo}/pulls`).
 * Makes a network call.
 *
 * @param config - The repository and the GitHub token
 * @param body - The pull request to create
 * @returns The pull request created, as returned by the API
 * @throws When the response is not ok (`[POST] "<url>": <status> <statusText>` and the response text), e.g. a 422 when the branches have no difference or a pull request already exists
 * @example
 * ```ts
 * const pr = await createGithubPullRequest(config, { title: 'chore(release): sync develop with main', head: 'main', base: 'develop' })
 * ```
 */
export async function createGithubPullRequest(config: GithubApiConfig, body: GithubPullRequestInput): Promise<GithubPullRequest> {
  return await githubFetch<GithubPullRequest>(config, `/repos/${config.repo.repo}/pulls`, {
    method: 'POST',
    body,
  })
}
