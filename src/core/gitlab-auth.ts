import process from 'node:process'

/**
 * Authentication to the GitLab API. Leaf module, without dependency.
 */

/**
 * The job token of a GitLab CI job (`CI_JOB_TOKEN`) authenticates with the
 * `JOB-TOKEN` header, and only reaches some endpoints: it creates the releases,
 * but cannot comment a merge request.
 */
export function isGitlabJobToken(token: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.CI_JOB_TOKEN) && token === env.CI_JOB_TOKEN
}

/**
 * The auth header of a GitLab API request: `JOB-TOKEN` for the job token of
 * the CI job, `PRIVATE-TOKEN` for a personal, project or group access token
 */
export function getGitlabAuthHeader(token: string, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return isGitlabJobToken(token, env) ? { 'JOB-TOKEN': token } : { 'PRIVATE-TOKEN': token }
}

export const GITLAB_JOB_TOKEN_MR_COMMENT_WARNING = 'The CI_JOB_TOKEN of GitLab cannot comment merge requests: set GITLAB_TOKEN (or RELIZY_GITLAB_TOKEN) to a project, group or personal access token with the api scope'
