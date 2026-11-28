import process from 'node:process'

/**
 * Authentication to the GitLab API. Leaf module, without dependency.
 */

/**
 * Whether the token is the job token of a GitLab CI job (`CI_JOB_TOKEN`): it
 * authenticates with the `JOB-TOKEN` header, and only reaches some endpoints
 * (it creates the releases, but cannot comment a merge request).
 *
 * @param token - The token to check
 * @param env - The environment to read `CI_JOB_TOKEN` from, `process.env` by default
 * @returns True when `CI_JOB_TOKEN` is set and equals the token
 */
export function isGitlabJobToken(token: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.CI_JOB_TOKEN) && token === env.CI_JOB_TOKEN
}

/**
 * Whether the token is an OAuth access token of GitLab (64 hexadecimal
 * characters), such as the one of `glab auth login`: the `PRIVATE-TOKEN`
 * header rejects it, it authenticates with `Authorization: Bearer`. No
 * personal, project nor group access token has this format.
 */
function isGitlabOAuthToken(token: string): boolean {
  return /^[0-9a-f]{64}$/.test(token)
}

/**
 * The auth header of a GitLab API request: `JOB-TOKEN` for the job token of
 * the CI job, `Authorization: Bearer` for an OAuth access token (64
 * hexadecimal characters, the token of `glab auth login`), `PRIVATE-TOKEN`
 * for a personal, project or group access token
 *
 * @param token - The token of the request
 * @param env - The environment to read `CI_JOB_TOKEN` from, `process.env` by default
 * @returns A one-entry headers object, to spread in the headers of the request
 * @example
 * ```ts
 * getGitlabAuthHeader('glpat-xxxx', {}) // { 'PRIVATE-TOKEN': 'glpat-xxxx' }
 * getGitlabAuthHeader('abc', { CI_JOB_TOKEN: 'abc' }) // { 'JOB-TOKEN': 'abc' }
 * ```
 */
export function getGitlabAuthHeader(token: string, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  if (isGitlabJobToken(token, env)) {
    return { 'JOB-TOKEN': token }
  }

  return isGitlabOAuthToken(token)
    ? { Authorization: `Bearer ${token}` }
    : { 'PRIVATE-TOKEN': token }
}

/** The warning about a CI job token that cannot comment merge requests */
export const GITLAB_JOB_TOKEN_MR_COMMENT_WARNING = 'The CI_JOB_TOKEN of GitLab cannot comment merge requests: set GITLAB_TOKEN (or RELIZY_GITLAB_TOKEN) to a project, group or personal access token with the api scope'
