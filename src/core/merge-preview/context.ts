import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'
import { logger } from '@maz-ui/node'
import { RELIZY_BOT_IDENTITY } from '../ci'
import { isInCI } from '../ci-env'
import { clearGitCache } from '../git-cache'
import { runGitSync, tryGitSync } from '../git-exec'
import { isAncestor } from '../git-refs'

type Env = NodeJS.ProcessEnv

/**
 * The pull/merge request a CI job previews, read from the environment of the
 * job: GitHub Actions (`pull_request` events) and GitLab CI (merge request
 * pipelines).
 */
export interface MergePreviewPullRequest {
  provider: 'github' | 'gitlab'
  /** `pull request` on GitHub, `merge request` on GitLab */
  kind: 'pull request' | 'merge request'
  /** Number of the pull request, IID of the merge request */
  number?: number
  /** Title, without the draft marker of GitLab: the commit message of a squash merge */
  title?: string
  /** Description: the body of a squash merge on GitHub, with the `PR_BODY` setting */
  body?: string
  /** Branch the pull request merges into */
  targetBranch: string
  /** Last commit of the pull request, when the CI gives it */
  headSha?: string
}

/**
 * What the merge of the pull request releases is computed on: HEAD holds the
 * target branch and the pull request, as after the merge.
 */
export interface MergePreviewContext {
  pullRequest: MergePreviewPullRequest
  /** Last commit of the target branch the preview is computed on */
  targetSha: string
  /** Last commit of the pull request */
  headSha: string
  /** Full hashes of the commits of the pull request, not on the target branch, merge commits left out */
  commits: string[]
  /** HEAD holds the target branch: the preview is the release of the merge */
  merged: boolean
  /** Why HEAD does not hold the target branch */
  warning?: string
}

function readGitHubEvent(env: Env): Record<string, any> | undefined {
  const eventPath = env.GITHUB_EVENT_PATH
  if (!eventPath || !existsSync(eventPath)) {
    return undefined
  }

  try {
    return JSON.parse(readFileSync(eventPath, 'utf8'))
  }
  catch {
    return undefined
  }
}

function toNumber(value: unknown): number | undefined {
  const number = Number(value)
  return Number.isInteger(number) && number > 0
    ? number
    : undefined
}

function getGitLabPullRequest(env: Env): MergePreviewPullRequest {
  return {
    provider: 'gitlab',
    kind: 'merge request',
    number: toNumber(env.CI_MERGE_REQUEST_IID),
    title: env.CI_MERGE_REQUEST_TITLE?.replace(/^(?:draft:|\[draft\]|\(draft\))\s*/i, '') || undefined,
    body: env.CI_MERGE_REQUEST_DESCRIPTION || undefined,
    targetBranch: env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME!,
    // CI_COMMIT_SHA is the merge commit of a merged results pipeline
    headSha: env.CI_MERGE_REQUEST_SOURCE_BRANCH_SHA || env.CI_COMMIT_SHA || undefined,
  }
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value
    ? value
    : undefined
}

function getGitHubPullRequest(env: Env): MergePreviewPullRequest {
  const pullRequest = readGitHubEvent(env)?.pull_request

  return {
    provider: 'github',
    kind: 'pull request',
    number: toNumber(pullRequest?.number),
    title: getString(pullRequest?.title),
    body: getString(pullRequest?.body),
    targetBranch: env.GITHUB_BASE_REF!,
    // HEAD is the merge commit of refs/pull/<number>/merge by default
    headSha: getString(pullRequest?.head?.sha),
  }
}

/**
 * The pull/merge request of the CI job, none outside a pull request pipeline
 */
export function getMergePreviewPullRequest(env: Env = process.env): MergePreviewPullRequest | undefined {
  if (env.GITLAB_CI === 'true' && env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME) {
    return getGitLabPullRequest(env)
  }

  if (env.GITHUB_ACTIONS === 'true' && env.GITHUB_BASE_REF) {
    return getGitHubPullRequest(env)
  }

  return undefined
}

function fetchTargetBranch(branch: string, cwd: string): void {
  if (tryGitSync([
    'fetch',
    '--quiet',
    '--no-tags',
    'origin',
    `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
  ], { cwd }) !== undefined) {
    clearGitCache()
  }
}

/**
 * Merge the target branch into HEAD, as the merge of the pull request will: in
 * a CI clone only, which is thrown away. Returns why it could not.
 */
function mergeTargetBranch({ targetBranch, targetSha, cwd }: { targetBranch: string, targetSha: string, cwd: string }): string | undefined {
  try {
    runGitSync([
      '-c',
      `user.name=${RELIZY_BOT_IDENTITY.name}`,
      '-c',
      `user.email=${RELIZY_BOT_IDENTITY.email}`,
      'merge',
      '--quiet',
      '--no-edit',
      '--no-ff',
      '--no-verify',
      '-m',
      `Merge ${targetBranch} for the release preview`,
      targetSha,
    ], { cwd })
    logger.debug(`Merged origin/${targetBranch} (${targetSha.slice(0, 7)}) into HEAD for the preview`)
    return undefined
  }
  catch {
    tryGitSync(['merge', '--abort'], { cwd })
    return `The pull request conflicts with ${targetBranch}: the preview is computed without its last commits`
  }
  finally {
    clearGitCache()
  }
}

/**
 * Make HEAD hold what the merge of the pull request releases: the target
 * branch and the pull request. A GitHub pull request checks out its merge
 * commit, a merged results pipeline of GitLab too; otherwise the target branch
 * is merged in a CI clone, and only warned about locally. Lists the commits of
 * the pull request, to tell what it brings to the release.
 */
export async function prepareMergePreviewContext({ pullRequest, cwd, env = process.env }: { pullRequest: MergePreviewPullRequest, cwd: string, env?: Env }): Promise<MergePreviewContext> {
  const { targetBranch } = pullRequest
  fetchTargetBranch(targetBranch, cwd)

  const targetSha = tryGitSync([
    'rev-parse',
    '--verify',
    '--quiet',
    `refs/remotes/origin/${targetBranch}^{commit}`,
  ], { cwd })
  ?? tryGitSync([
    'rev-parse',
    '--verify',
    '--quiet',
    `refs/heads/${targetBranch}^{commit}`,
  ], { cwd })
  if (!targetSha) {
    throw new Error(`Cannot find the target branch "${targetBranch}" of the ${pullRequest.kind}: fetch it before the preview (git fetch origin ${targetBranch})`)
  }

  const headSha = pullRequest.headSha && tryGitSync([
    'rev-parse',
    '--verify',
    '--quiet',
    `${pullRequest.headSha}^{commit}`,
  ], { cwd })
    ? pullRequest.headSha
    : runGitSync(['rev-parse', 'HEAD'], { cwd })

  let warning: string | undefined
  let merged = await isAncestor(targetSha, 'HEAD', cwd)
  if (!merged) {
    if (isInCI(env)) {
      warning = mergeTargetBranch({ targetBranch, targetSha, cwd })
      merged = !warning
    }
    else {
      warning = `HEAD is behind ${targetBranch}: the preview is computed without its last commits (git merge origin/${targetBranch})`
    }
  }

  const commits = runGitSync(['rev-list', '--no-merges', `${targetSha}..${headSha}`], { cwd }).split('\n').filter(Boolean)

  return {
    pullRequest,
    targetSha,
    headSha,
    commits,
    merged,
    ...(warning
      ? { warning }
      : {}),
  }
}
