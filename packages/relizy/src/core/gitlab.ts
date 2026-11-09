import type { GitlabRelease, GitlabReleaseResponse } from '@relizy/core'
import type { PostedRelease, ProviderReleaseOptions } from '../types'
import type { ResolvedRelizyConfig } from './config'
import type { ReleaseProvider } from './provider-releases'
import { logger } from '@maz-ui/node'
import { formatJson } from '@maz-ui/utils/helpers/formatJson'
import { getCurrentGitBranch, getGitlabReleasePayload, getGitlabReleasesUrl, createGitlabRelease as postGitlabRelease } from '@relizy/core'
import { postProviderReleases } from './provider-releases'

export type { GitlabRelease, GitlabReleaseResponse }

export async function createGitlabRelease({
  config,
  release,
  dryRun,
}: {
  config: ResolvedRelizyConfig
  release: GitlabRelease
  dryRun?: boolean
}): Promise<GitlabReleaseResponse> {
  const token = config.tokens.gitlab

  if (!token && !dryRun) {
    throw new Error(
      'No GitLab token found. Set GITLAB_TOKEN or CI_JOB_TOKEN environment variable or configure tokens.gitlab',
    )
  }

  const repoConfig = config.repo?.repo

  if (!repoConfig) {
    throw new Error('No repository URL found in config')
  }

  logger.debug(`Parsed repository URL: ${repoConfig}`)

  const apiUrl = getGitlabReleasesUrl({ repo: repoConfig, domain: config.repo?.domain })

  logger.info(`Creating GitLab release at: ${apiUrl}`)

  const payload = getGitlabReleasePayload(release)

  try {
    if (dryRun) {
      logger.info('[dry-run] GitLab release:', formatJson(payload))
      return {
        tag_name: release.tag_name,
        name: release.name || release.tag_name,
        description: release.description || '',
        created_at: new Date().toISOString(),
        released_at: new Date().toISOString(),
        _links: {
          self: `${apiUrl}/${encodeURIComponent(release.tag_name)}`,
        },
      }
    }

    logger.debug(`POST GitLab release to ${apiUrl} with payload: ${formatJson(payload)}`)

    const result = await postGitlabRelease({
      token: token || '',
      repo: repoConfig,
      domain: config.repo?.domain,
      release,
    })

    logger.debug(`Created GitLab release: ${result._links.self}`)

    return result
  }
  catch (error) {
    logger.error('Failed to create GitLab release:', error)
    throw error
  }
}

export const gitlabReleaseProvider: ReleaseProvider = {
  name: 'GitLab',
  tokenKey: 'gitlab',
  flagsPrereleases: false,
  // The token and the repository are checked when creating the release: not needed in a dry run
  check: () => {},
  create: ({ config, release, dryRun }) => createGitlabRelease({
    config,
    release: {
      tag_name: release.tag,
      name: release.tag,
      description: release.notes,
      ref: getCurrentGitBranch(config.cwd),
    },
    dryRun,
  }),
}

export function gitlab(options: Partial<ProviderReleaseOptions> = {}): Promise<PostedRelease[]> {
  return postProviderReleases(gitlabReleaseProvider, options)
}
