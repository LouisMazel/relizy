import type { RepoConfig } from '../types'

/**
 * GitHub REST API calls, ported from changelogen 0.6.2:
 * https://github.com/unjs/changelogen/blob/v0.6.2/src/github.ts
 *
 * MIT License - Copyright (c) Pooya Parsa <pooya@pi0.io>
 */

export interface GithubRelease {
  id?: string
  tag_name: string
  name?: string
  body?: string
  draft?: boolean
  prerelease?: boolean
}

interface GithubApiConfig {
  repo: RepoConfig
  tokens?: { github?: string }
}

/** `https://api.github.com` for github.com, the `/api/v3` of a GitHub Enterprise Server */
function getGithubApiUrl(domain: string | undefined): string {
  return domain === 'github.com'
    ? 'https://api.github.com'
    : `https://${domain}/api/v3`
}

async function githubFetch<T>(config: GithubApiConfig, path: string, init: { method: string, body: unknown }): Promise<T> {
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
    body: JSON.stringify(init.body),
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

export async function createGithubRelease(config: GithubApiConfig, body: GithubRelease): Promise<GithubRelease> {
  return await githubFetch<GithubRelease>(config, `/repos/${config.repo.repo}/releases`, {
    method: 'POST',
    body,
  })
}
