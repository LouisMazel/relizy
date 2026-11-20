import type { SimulatedSquash } from '@relizy/core'
import type { ResolvedRelizyConfig } from '../config'
import type { ProviderApi } from './api'
import type { MergePreviewContext, MergePreviewPullRequest } from './context'
import { logger } from '@maz-ui/node'
import { runGitSync } from '@relizy/core'
import { getProviderApi } from './api'

/**
 * How the merge of the pull request is computed: on the commit of a squash
 * merge, on the commits of the pull request (merge commit, rebase), or both
 * when the merge method is not known before the merge.
 */
export type MergePreviewSquashMode = 'squash' | 'commits' | 'both'

export interface MergePreviewSquash {
  mode: MergePreviewSquashMode
  /** Why this mode: "the repository only allows squash merges" */
  reason: string
  /** The commit of the squash merge, unless the mode is `commits` */
  squash?: SimulatedSquash
  /** The squash commit takes the message of the only commit of the pull request, not its title (see `isSquashTitleFromCommit`) */
  titleFromCommit?: boolean
}

/** How GitHub writes the commit of a squash merge, from the settings of the repository */
export interface SquashMessageSettings {
  title?: 'PR_TITLE' | 'COMMIT_OR_PR_TITLE'
  body?: 'PR_BODY' | 'COMMIT_MESSAGES' | 'BLANK'
}

/** Whether the merge of a pull request squashes its commits, and how GitHub writes the squash commit */
export interface MergeSquashDetection extends SquashMessageSettings {
  /** Undefined when only the merge will tell */
  squash?: boolean
  reason: string
}

interface GitHubRepository {
  allow_squash_merge?: boolean
  allow_merge_commit?: boolean
  allow_rebase_merge?: boolean
  squash_merge_commit_title?: SquashMessageSettings['title']
  squash_merge_commit_message?: SquashMessageSettings['body']
}

interface GitHubPull {
  auto_merge?: { merge_method?: 'merge' | 'squash' | 'rebase' } | null
}

async function detectGitHubSquash(api: ProviderApi, number: number): Promise<MergeSquashDetection> {
  const [repository, pull] = await Promise.all([
    api.request<GitHubRepository>('GET', ''),
    api.request<GitHubPull>('GET', `/pulls/${number}`),
  ])
  const settings = { title: repository.squash_merge_commit_title, body: repository.squash_merge_commit_message }

  const method = pull.auto_merge?.merge_method
  if (method) {
    return { ...settings, squash: method === 'squash', reason: `auto-merge is enabled with the ${method} method` }
  }
  if (repository.allow_squash_merge === false) {
    return { ...settings, squash: false, reason: 'the repository does not allow squash merges' }
  }
  if (repository.allow_squash_merge && repository.allow_merge_commit === false && repository.allow_rebase_merge === false) {
    return { ...settings, squash: true, reason: 'the repository only allows squash merges' }
  }

  return { ...settings, reason: 'the repository allows several merge methods' }
}

interface GitLabProject {
  squash_option?: 'never' | 'always' | 'default_on' | 'default_off'
}

interface GitLabMergeRequest {
  squash?: boolean
  /** Whether the merge squashes, the setting of the project applied (GitLab 16.4+) */
  squash_on_merge?: boolean
}

async function detectGitLabSquash(api: ProviderApi, iid: number): Promise<MergeSquashDetection> {
  const [project, mergeRequest] = await Promise.all([
    api.request<GitLabProject>('GET', ''),
    api.request<GitLabMergeRequest>('GET', `/merge_requests/${iid}`),
  ])

  if (project.squash_option === 'always' || project.squash_option === 'never') {
    return { squash: project.squash_option === 'always', reason: `the project ${project.squash_option === 'always'
      ? 'always'
      : 'never'} squashes the commits` }
  }

  const squash = mergeRequest.squash_on_merge ?? mergeRequest.squash
  if (typeof squash === 'boolean') {
    return { squash, reason: `the merge request ${squash ? 'squashes' : 'does not squash'} its commits` }
  }

  return { reason: 'the merge request does not tell whether it squashes its commits' }
}

async function detectSquash({ config, pullRequest }: { config: ResolvedRelizyConfig, pullRequest: MergePreviewPullRequest }): Promise<MergeSquashDetection> {
  const api = getProviderApi(config, pullRequest.provider)
  if (!api || !pullRequest.number) {
    return { reason: `the ${pullRequest.kind} could not be read from the API` }
  }

  try {
    return pullRequest.provider === 'github'
      ? await detectGitHubSquash(api, pullRequest.number)
      : await detectGitLabSquash(api, pullRequest.number)
  }
  catch (error) {
    logger.debug(`Merge preview: cannot read the merge method: ${error instanceof Error
      ? error.message
      : String(error)}`)
    return { reason: `the ${pullRequest.kind} could not be read from the API` }
  }
}

/**
 * Whether the merge of the pull request squashes its commits: forced by
 * `mergePreview.squash`, otherwise read from the provider (auto-merge, merge
 * methods of the repository, squash option of the merge request). `squash` is
 * undefined when only the merge will tell, or when the provider cannot be read
 * (no token).
 */
export async function detectMergeSquash({ config, pullRequest, option }: {
  config: ResolvedRelizyConfig
  pullRequest: MergePreviewPullRequest
  /** `mergePreview.squash` */
  option: 'auto' | boolean
}): Promise<MergeSquashDetection> {
  if (option === false) {
    return { squash: false, reason: 'mergePreview.squash is false' }
  }
  if (option === true) {
    return { squash: true, reason: 'mergePreview.squash is true' }
  }

  return await detectSquash({ config, pullRequest })
}

/**
 * True when a squash merge takes the message of the only commit of the pull
 * request, not its title: GitHub with the `COMMIT_OR_PR_TITLE` setting, its default
 */
export function isSquashTitleFromCommit({ provider, commitCount, settings = {} }: {
  provider: MergePreviewPullRequest['provider']
  /** Commits of the pull request, merge commits left out */
  commitCount: number
  settings?: SquashMessageSettings
}): boolean {
  return provider === 'github' && commitCount === 1 && (settings.title ?? 'COMMIT_OR_PR_TITLE') === 'COMMIT_OR_PR_TITLE'
}

/**
 * The commit a squash merge creates: the title of the pull request (the
 * message of its only commit with the `COMMIT_OR_PR_TITLE` setting of GitHub),
 * the body GitHub writes, every file the pull request changes. None without
 * the title.
 */
export function getSquashCommit({ context, settings = {}, cwd }: { context: MergePreviewContext, settings?: SquashMessageSettings, cwd: string }): SimulatedSquash | undefined {
  const { pullRequest, commits, headSha, targetSha } = context
  const github = pullRequest.provider === 'github'
  const bodySetting = settings.body ?? 'COMMIT_MESSAGES'
  const onlyCommit = isSquashTitleFromCommit({ provider: pullRequest.provider, commitCount: commits.length, settings })
    ? commits[0]
    : undefined

  let title = onlyCommit
    ? runGitSync(['log', '-1', '--format=%s', onlyCommit], { cwd })
    : pullRequest.title
  if (!title) {
    return undefined
  }
  if (github && pullRequest.number) {
    title = `${title} (#${pullRequest.number})`
  }

  let body = ''
  if (github && onlyCommit) {
    body = runGitSync(['log', '-1', '--format=%b', onlyCommit], { cwd })
  }
  else if (github && bodySetting === 'COMMIT_MESSAGES') {
    body = [...commits].reverse().map(hash => `* ${runGitSync(['log', '-1', '--format=%B', hash], { cwd })}`).join('\n\n')
  }
  else if (github && bodySetting === 'PR_BODY') {
    body = pullRequest.body ?? ''
  }

  const mergeBase = runGitSync(['merge-base', targetSha, headSha], { cwd })
  const files = runGitSync([
    'diff',
    '--name-status',
    '-M',
    mergeBase,
    headSha,
  ], { cwd })
  const [name = '', email = ''] = runGitSync([
    'log',
    '-1',
    '--format=%an%x1F%ae',
    headSha,
  ], { cwd }).split('\x1F')

  return {
    hashes: commits,
    commit: {
      message: title,
      body: [
        body.trim(),
        files,
      ].filter(Boolean).join('\n\n'),
      shortHash: headSha.slice(0, 7),
      author: { name, email },
    },
  }
}

/**
 * Whether the preview squashes the commits of the pull request: forced by
 * `mergePreview.squash`, otherwise read from the provider (auto-merge,
 * merge methods of the repository, squash option of the merge request); both
 * are computed when only the merge will tell.
 */
export async function resolveMergePreviewSquash({ config, context, option, cwd }: {
  config: ResolvedRelizyConfig
  context: MergePreviewContext
  option: 'auto' | boolean
  cwd: string
}): Promise<MergePreviewSquash> {
  if (context.commits.length === 0) {
    return { mode: 'commits', reason: `the ${context.pullRequest.kind} has no commit` }
  }
  if (option === false) {
    return { mode: 'commits', reason: 'mergePreview.squash is false' }
  }

  const detection = await detectMergeSquash({ config, pullRequest: context.pullRequest, option })

  if (detection.squash === false) {
    return { mode: 'commits', reason: detection.reason }
  }

  const squash = getSquashCommit({ context, settings: detection, cwd })
  if (!squash) {
    return { mode: 'commits', reason: `the title of the ${context.pullRequest.kind} is unknown` }
  }

  return {
    mode: detection.squash ? 'squash' : 'both',
    reason: detection.reason,
    squash,
    ...(isSquashTitleFromCommit({ provider: context.pullRequest.provider, commitCount: context.commits.length, settings: detection })
      ? { titleFromCommit: true }
      : {}),
  }
}
