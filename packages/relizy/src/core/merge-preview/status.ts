import type { ResolvedRelizyConfig } from '../config'
import type { MergePreviewContext } from './context'
import process from 'node:process'
import { logger } from '@maz-ui/node'
import { isGitlabJobToken } from '@relizy/core'
import { getProviderApi } from './api'

/** Name of the commit status of the merge preview, to require in the protection of the branch */
export const MERGE_PREVIEW_STATUS_CONTEXT = 'relizy/merge-preview'

/** The page of the CI job, linked from the status */
function getJobUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID) {
    return `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
  }

  return env.CI_JOB_URL || undefined
}

/**
 * Set the commit status of the merge preview on the last commit of the pull
 * request: green with what the merge releases, red when the release of the
 * merge would fail. Returns false when it could not be set (warned).
 */
export async function setMergePreviewStatus({ config, context, failed, description }: {
  config: ResolvedRelizyConfig
  context: MergePreviewContext
  failed: boolean
  description: string
}): Promise<boolean> {
  const { provider } = context.pullRequest
  const api = getProviderApi(config, provider)
  if (!api) {
    logger.warn(`No ${provider === 'github'
      ? 'GitHub'
      : 'GitLab'} token or repository to set the commit status of the merge preview`)
    return false
  }
  if (provider === 'gitlab' && isGitlabJobToken(config.tokens.gitlab ?? '')) {
    logger.warn('The CI_JOB_TOKEN of GitLab cannot set commit statuses: set GITLAB_TOKEN (or RELIZY_GITLAB_TOKEN) to a project, group or personal access token with the api scope')
    return false
  }

  const targetUrl = getJobUrl()
  const body = provider === 'github'
    ? {
        state: failed ? 'failure' : 'success',
        context: MERGE_PREVIEW_STATUS_CONTEXT,
        description,
        ...(targetUrl
          ? { target_url: targetUrl }
          : {}),
      }
    : {
        state: failed ? 'failed' : 'success',
        name: MERGE_PREVIEW_STATUS_CONTEXT,
        description,
        ...(targetUrl
          ? { target_url: targetUrl }
          : {}),
      }

  try {
    await api.request('POST', `/statuses/${context.headSha}`, body)
    logger.debug(`Merge preview: commit status ${body.state} on ${context.headSha.slice(0, 7)}`)
    return true
  }
  catch (error) {
    logger.warn(`Failed to set the commit status of the merge preview: ${error instanceof Error
      ? error.message
      : String(error)}`)
    return false
  }
}
