import { getGitlabAuthHeader } from './gitlab-auth'

/**
 * GitLab REST API calls: the releases of a project, on gitlab.com or a
 * self-hosted instance (its `domain`).
 */

/** The payload to create a GitLab release */
export interface GitlabRelease {
  /** The git tag of the release, created from `ref` when it does not exist yet */
  tag_name: string
  /** The title of the release, the tag name by default */
  name?: string
  /** The description of the release, in markdown */
  description?: string
  /** The commit, tag or branch the tag is created from when it does not exist yet */
  ref?: string
  /** The titles of the milestones the release is associated with. Not sent by `getGitlabReleasePayload` */
  milestones?: string[]
  /** Assets attached to the release. Not sent by `getGitlabReleasePayload` */
  assets?: {
    /** Links shown with the release */
    links?: Array<{
      /** Label of the link */
      name: string
      /** Target of the link */
      url: string
    }>
  }
  /** The release date, an ISO 8601 string. Not sent by `getGitlabReleasePayload` */
  released_at?: string
}

/** A GitLab release as returned by the API */
export interface GitlabReleaseResponse {
  /** The git tag of the release */
  tag_name: string
  /** The title of the release */
  name: string
  /** The description of the release, in markdown */
  description: string
  /** Creation date of the release, an ISO 8601 string */
  created_at: string
  /** Release date, an ISO 8601 string */
  released_at: string
  _links: {
    /** URL of the release in GitLab */
    self: string
  }
}

/**
 * The releases endpoint of a project: `repo` is its `owner/name` path,
 * `domain` the host of the instance (`gitlab.com` by default).
 *
 * @param options - The project and the instance
 * @param options.repo - The `owner/name` path of the project, URL-encoded in the endpoint
 * @param options.domain - The host of the instance, `gitlab.com` when omitted or empty
 * @returns The `https://{domain}/api/v4/projects/{repo}/releases` URL
 * @example
 * ```ts
 * getGitlabReleasesUrl({ repo: 'group/project' })
 * // 'https://gitlab.com/api/v4/projects/group%2Fproject/releases'
 * ```
 */
export function getGitlabReleasesUrl({ repo, domain }: { repo: string, domain?: string }): string {
  return `https://${domain || 'gitlab.com'}/api/v4/projects/${encodeURIComponent(repo)}/releases`
}

/**
 * The body of the request creating a release: the name defaults to the tag
 * name, the description to an empty string and the ref to `main`. The other
 * fields of the release (milestones, assets, release date) are not sent.
 *
 * @param release - The release to create
 * @returns The `tag_name`, `name`, `description` and `ref` of the request
 * @example
 * ```ts
 * getGitlabReleasePayload({ tag_name: 'v1.2.0' })
 * // { tag_name: 'v1.2.0', name: 'v1.2.0', description: '', ref: 'main' }
 * ```
 */
export function getGitlabReleasePayload(release: GitlabRelease): Required<Pick<GitlabRelease, 'tag_name' | 'name' | 'description' | 'ref'>> {
  return {
    tag_name: release.tag_name,
    name: release.name || release.tag_name,
    description: release.description || '',
    ref: release.ref || 'main',
  }
}

/**
 * Creates a release with the GitLab API (`POST` on the releases endpoint of
 * the project). The token authenticates with the `JOB-TOKEN` header when
 * it is the job token of a GitLab CI job, `PRIVATE-TOKEN` otherwise.
 * Makes a network call.
 *
 * @param options - The token, the project and the release
 * @param options.token - The access token or the job token
 * @param options.repo - The `owner/name` path of the project
 * @param options.domain - The host of the instance, `gitlab.com` when omitted
 * @param options.release - The release to create, sent through `getGitlabReleasePayload`
 * @returns The release created, as returned by the API
 * @throws When the response is not ok: `GitLab API error (<status>): <response text>`.
 * @example
 * ```ts
 * const release = await createGitlabRelease({
 *   token: process.env.GITLAB_TOKEN!,
 *   repo: 'group/project',
 *   release: { tag_name: 'v1.2.0', description: '### Features\n- add x' },
 * })
 * ```
 */
export async function createGitlabRelease({
  token,
  repo,
  domain,
  release,
}: {
  token: string
  repo: string
  domain?: string
  release: GitlabRelease
}): Promise<GitlabReleaseResponse> {
  const response = await fetch(getGitlabReleasesUrl({ repo, domain }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getGitlabAuthHeader(token),
    },
    body: JSON.stringify(getGitlabReleasePayload(release)),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`GitLab API error (${response.status}): ${errorText}`)
  }

  return (await response.json()) as GitlabReleaseResponse
}

/** A GitLab merge request, as returned by the API */
export interface GitlabMergeRequest {
  /** Its number in the project */
  iid: number
  /** Its page on GitLab */
  web_url: string
  title: string
}

/** The merge request to create */
export interface GitlabMergeRequestInput {
  /** The branch to merge */
  source_branch: string
  /** The branch to merge into */
  target_branch: string
  title: string
  /** The description, in markdown */
  description?: string
}

function getGitlabMergeRequestsUrl({ repo, domain }: { repo: string, domain?: string }): string {
  return `https://${domain || 'gitlab.com'}/api/v4/projects/${encodeURIComponent(repo)}/merge_requests`
}

async function gitlabFetch<T>({ url, token, method, body }: { url: string, token: string, method: string, body?: unknown }): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...getGitlabAuthHeader(token),
    },
    body: body === undefined
      ? undefined
      : JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`GitLab API error (${response.status}): ${errorText}`)
  }

  return (await response.json()) as T
}

/**
 * The first open merge request from `sourceBranch` into `targetBranch`.
 * Makes a network call.
 *
 * @param options - The token, the project and the branches
 * @param options.token - An access token with the api scope (the job token cannot read nor create merge requests)
 * @param options.repo - The `owner/name` path of the project
 * @param options.domain - The host of the instance, `gitlab.com` when omitted
 * @param options.sourceBranch - The branch to merge
 * @param options.targetBranch - The branch to merge into
 * @returns The merge request, undefined when there is none
 * @throws When the response is not ok: `GitLab API error (<status>): <response text>`.
 * @example
 * ```ts
 * const mr = await findGitlabMergeRequest({ token, repo: 'group/project', sourceBranch: 'main', targetBranch: 'develop' })
 * ```
 */
export async function findGitlabMergeRequest({ token, repo, domain, sourceBranch, targetBranch }: {
  token: string
  repo: string
  domain?: string
  sourceBranch: string
  targetBranch: string
}): Promise<GitlabMergeRequest | undefined> {
  const query = new URLSearchParams({ state: 'opened', source_branch: sourceBranch, target_branch: targetBranch })
  const mergeRequests = await gitlabFetch<GitlabMergeRequest[]>({
    url: `${getGitlabMergeRequestsUrl({ repo, domain })}?${query}`,
    token,
    method: 'GET',
  })

  return mergeRequests[0]
}

/**
 * Creates a merge request with the GitLab API. Makes a network call.
 *
 * @param options - The token, the project and the merge request
 * @param options.token - An access token with the api scope
 * @param options.repo - The `owner/name` path of the project
 * @param options.domain - The host of the instance, `gitlab.com` when omitted
 * @param options.mergeRequest - The merge request to create
 * @returns The merge request created, as returned by the API
 * @throws When the response is not ok: `GitLab API error (<status>): <response text>` (a 409 when a merge request of these branches is already open)
 * @example
 * ```ts
 * const mr = await createGitlabMergeRequest({
 *   token,
 *   repo: 'group/project',
 *   mergeRequest: { source_branch: 'main', target_branch: 'develop', title: 'chore(release): sync develop with main' },
 * })
 * ```
 */
export async function createGitlabMergeRequest({ token, repo, domain, mergeRequest }: {
  token: string
  repo: string
  domain?: string
  mergeRequest: GitlabMergeRequestInput
}): Promise<GitlabMergeRequest> {
  return await gitlabFetch<GitlabMergeRequest>({
    url: getGitlabMergeRequestsUrl({ repo, domain }),
    token,
    method: 'POST',
    body: mergeRequest,
  })
}
