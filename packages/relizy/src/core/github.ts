import type { PostedRelease, ProviderReleaseOptions } from '../types'
import type { ReleaseProvider } from './provider-releases'
import { createGithubRelease } from '@relizy/core'
import { postProviderReleases } from './provider-releases'

export const githubReleaseProvider: ReleaseProvider = {
  name: 'GitHub',
  tokenKey: 'github',
  flagsPrereleases: true,
  check: (config) => {
    if (!config.repo) {
      throw new Error('No repository configuration found. Please check your changelog config.')
    }

    if (!config.tokens.github) {
      throw new Error('No GitHub token specified. Log in the GitHub CLI (gh auth login), or set GITHUB_TOKEN or GH_TOKEN environment variable.')
    }
  },
  create: ({ config, release }) => createGithubRelease(
    { repo: config.repo!, tokens: config.tokens },
    {
      tag_name: release.tag,
      name: release.tag,
      body: release.notes,
      prerelease: release.prerelease,
    },
  ),
}

export function github(options: ProviderReleaseOptions): Promise<PostedRelease[]> {
  return postProviderReleases(githubReleaseProvider, options)
}
