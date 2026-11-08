import type { ResolvedRelizyConfig } from '../config'
import { getGitlabAuthHeader } from '../gitlab-auth'
import { getGitHubApiBase, getGitLabApiBase } from '../pr-comment'

/**
 * The REST API of the provider of the pull/merge request: GitHub from the
 * repository (`/repos/<repo>`), GitLab from the project (`/projects/<id>`).
 */
export interface ProviderApi {
  provider: 'github' | 'gitlab'
  /** Throws the status and the response of a failed request */
  request: <T>(method: 'GET' | 'POST', path: string, body?: unknown) => Promise<T>
}

/**
 * The API of the provider, none without a token or a repository
 */
export function getProviderApi(config: ResolvedRelizyConfig, provider: 'github' | 'gitlab'): ProviderApi | undefined {
  const repo = config.repo?.repo
  const token = provider === 'github'
    ? config.tokens.github
    : config.tokens.gitlab
  if (!repo || !token) {
    return undefined
  }

  const base = provider === 'github'
    ? `${getGitHubApiBase(config.repo?.domain)}/repos/${repo}`
    : `${getGitLabApiBase(config.repo?.domain)}/projects/${encodeURIComponent(repo)}`
  const headers = provider === 'github'
    ? { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
    : getGitlabAuthHeader(token)

  return {
    provider,
    async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: {
          ...headers,
          ...(body === undefined
            ? {}
            : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined
          ? {}
          : {
              body: JSON.stringify(body),
            }),
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error([`${method} ${path}: ${response.status}`, text].filter(Boolean).join(' '))
      }

      return await response.json() as T
    },
  }
}
