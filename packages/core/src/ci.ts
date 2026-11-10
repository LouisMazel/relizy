import type { CoreLogger } from './types'
import process from 'node:process'
import { getCIName, isInCI } from './ci-env'
import { clearGitCache, oncePerRun } from './git-cache'
import { runGitSync, tryGitSync } from './git-exec'

/**
 * What a release tool does for itself in a CI job, whatever the provider: the
 * full history of a shallow clone, the branch of a detached HEAD, the identity
 * of the release commit, and a push that works (or fails before publishing).
 */

/** The name and the email of the author of a commit, as the git identity of the release commit */
export interface GitIdentity {
  /** Display name of the author */
  name: string
  /** Email of the author */
  email: string
}

/**
 * The git identity (`relizy[bot]`, `noreply@relizy.dev`) of the release commit
 * of a bot, or of a CI that does not tell who started it
 */
export const RELIZY_BOT_IDENTITY: GitIdentity = { name: 'relizy[bot]', email: 'noreply@relizy.dev' }

type Env = NodeJS.ProcessEnv

function getHost(url: string | undefined, fallback: string): string {
  try {
    return url
      ? new URL(url).host
      : fallback
  }
  catch {
    return fallback
  }
}

/**
 * The person who started the release, with the noreply email their provider
 * links to their profile: `12446546+octocat@users.noreply.github.com` on
 * GitHub, `42-octocat@users.noreply.gitlab.com` on GitLab. A bot, or a CI
 * that does not tell, gets `relizy[bot]`. Only GitHub Actions and GitLab CI are read.
 *
 * @param env - The environment to read, `process.env` by default
 * @returns The name and the noreply email, `RELIZY_BOT_IDENTITY` for a bot, another CI or outside a CI
 * @example
 * ```ts
 * getCiGitIdentity({ GITHUB_ACTIONS: 'true', GITHUB_ACTOR: 'octocat', GITHUB_ACTOR_ID: '12446546' })
 * // { name: 'octocat', email: '12446546+octocat@users.noreply.github.com' }
 * ```
 */
export function getCiGitIdentity(env: Env = process.env): GitIdentity {
  if (env.GITHUB_ACTIONS === 'true') {
    const login = env.GITHUB_ACTOR
    const id = env.GITHUB_ACTOR_ID

    if (!login || !id || login.endsWith('[bot]')) {
      return RELIZY_BOT_IDENTITY
    }

    return { name: login, email: `${id}+${login}@users.noreply.${getHost(env.GITHUB_SERVER_URL, 'github.com')}` }
  }

  if (env.GITLAB_CI === 'true') {
    const login = env.GITLAB_USER_LOGIN
    const id = env.GITLAB_USER_ID

    // The users of the access tokens: `project_42_bot_...`, `group_42_bot_...`
    if (!login || !id || /^(?:project|group)_\d+_bot/.test(login)) {
      return RELIZY_BOT_IDENTITY
    }

    return { name: env.GITLAB_USER_NAME || login, email: `${id}-${login}@users.noreply.${env.CI_SERVER_HOST || 'gitlab.com'}` }
  }

  return RELIZY_BOT_IDENTITY
}

/**
 * The branch a CI job runs on, when its HEAD is detached: the head branch of a
 * GitHub pull request or of a GitLab merge request (named by its author,
 * quoted in the shell commands), none for the tag pipelines. Also reads the
 * branch variables of Travis, Azure Pipelines, Bitbucket, CircleCI, Buildkite,
 * Drone, `BRANCH_NAME` and `GIT_BRANCH`.
 *
 * @param env - The environment to read, `process.env` by default
 * @returns The branch name, or undefined when the CI does not tell it
 * @example
 * ```ts
 * getCiBranch({ GITLAB_CI: 'true', CI_COMMIT_BRANCH: 'main' }) // 'main'
 * getCiBranch({ GITHUB_ACTIONS: 'true', GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v1.0.0' }) // undefined
 * ```
 */
export function getCiBranch(env: Env = process.env): string | undefined {
  if (env.GITHUB_ACTIONS === 'true') {
    // A pull request checks out its merge commit: GITHUB_REF_NAME is `<number>/merge`, GITHUB_HEAD_REF its branch
    if (env.GITHUB_HEAD_REF) {
      return env.GITHUB_HEAD_REF
    }

    return env.GITHUB_REF_TYPE === 'branch'
      ? env.GITHUB_REF_NAME
      : undefined
  }
  if (env.GITLAB_CI === 'true') {
    // A merge request pipeline has no CI_COMMIT_BRANCH; a merged results one checks out its merge commit
    return env.CI_COMMIT_BRANCH || env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME || undefined
  }
  if (env.TRAVIS === 'true') {
    return env.TRAVIS_PULL_REQUEST === 'false'
      ? env.TRAVIS_BRANCH
      : undefined
  }
  if (env.TF_BUILD === 'True' && env.BUILD_SOURCEBRANCH?.startsWith('refs/heads/')) {
    return env.BUILD_SOURCEBRANCH.slice('refs/heads/'.length)
  }

  return env.BITBUCKET_BRANCH
    || env.CIRCLE_BRANCH
    || env.BUILDKITE_BRANCH
    || env.DRONE_BRANCH
    || env.BRANCH_NAME
    || env.GIT_BRANCH?.replace(/^origin\//, '')
    || undefined
}

/**
 * Fetch the full history and the tags of a shallow clone (`fetch-depth: 1` of
 * GitHub Actions, `GIT_DEPTH` of GitLab CI): the versions and the changelogs
 * need every commit since the last release. Outside a CI, a warning tells
 * how to fetch it and nothing is fetched. Does nothing on a full clone.
 * Side effect: runs `git fetch --unshallow --tags` in a CI, then clears the git cache.
 *
 * @param cwd - The directory of the repository
 * @param options - The options
 * @param options.logger - Receives the warning and the info messages, silent by default
 * @throws When the fetch fails in a CI: the history is needed, the message gives the fix for GitHub (`fetch-depth: 0`) and GitLab (`GIT_DEPTH: 0`), the git error is the `cause`.
 * @example
 * ```ts
 * ensureFullHistory(process.cwd(), { logger })
 * ```
 */
export function ensureFullHistory(cwd: string, { logger }: { logger?: CoreLogger } = {}): void {
  if (tryGitSync(['rev-parse', '--is-shallow-repository'], { cwd }) !== 'true') {
    return
  }

  if (!isInCI()) {
    logger?.warn?.('The repository is a shallow clone: the versions and the changelogs may miss commits. Fetch its history with "git fetch --unshallow --tags"')
    return
  }

  try {
    runGitSync([
      'fetch',
      '--unshallow',
      '--tags',
      '--quiet',
    ], { cwd })
    clearGitCache()
    logger?.info?.('Fetched the full git history of the shallow clone')
  }
  catch (error) {
    throw new Error(
      'The repository is a shallow clone and its history could not be fetched: the versions and the changelogs need every commit since the last release.\n'
      + 'Clone the full history: "fetch-depth: 0" in the actions/checkout step on GitHub, the "GIT_DEPTH: 0" variable on GitLab.',
      { cause: error },
    )
  }
}

/**
 * Put a detached HEAD (GitLab CI and others check out the commit) on the
 * branch of the job, tracking the remote one: the release commit can then be
 * pushed, and checked against the remote before publishing. Does nothing
 * outside a CI or when HEAD is on a branch, and leaves a detached HEAD as is
 * when the CI does not tell the branch. Side effect: runs
 * `git checkout -B <branch>`, then fetches `origin/<branch>` and sets it as upstream
 * when that fetch works. CI detection reads `process.env`, the branch is read from `env`.
 *
 * @param cwd - The directory of the repository
 * @param options - The options
 * @param options.env - The environment to read the branch from, `process.env` by default
 * @param options.logger - Receives the debug and info messages, silent by default
 */
export function attachCiBranch(cwd: string, { env = process.env, logger }: { env?: Env, logger?: CoreLogger } = {}): void {
  if (!isInCI() || tryGitSync(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }) !== 'HEAD') {
    return
  }

  const branch = getCiBranch(env)
  if (!branch) {
    logger?.debug?.('Detached HEAD without the branch of the CI job: left as is')
    return
  }

  runGitSync(['checkout', '-B', branch], { cwd })
  clearGitCache()

  const tracked = tryGitSync([
    'fetch',
    '--quiet',
    'origin',
    `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
  ], { cwd }) !== undefined
  if (tracked) {
    runGitSync(['branch', `--set-upstream-to=origin/${branch}`], { cwd })
  }

  logger?.info?.(`Checked out the branch "${branch}" of the CI job (detached HEAD)`)
}

/**
 * Give the git commands of a CI job an identity when it has none. The release commit and the tags of a CI job without git identity (none in
 * the git config nor the GIT_AUTHOR_* variables) are made by the person who
 * started the release, through the environment: the git config is not
 * changed. Does nothing outside a CI or when an identity exists (CI detection
 * reads `process.env`). Side effect: sets the `GIT_AUTHOR_*` and `GIT_COMMITTER_*`
 * variables of `env`.
 *
 * @param cwd - The directory of the repository
 * @param options - The options
 * @param options.env - The environment to read and to set the identity in, `process.env` by default
 * @param options.logger - Receives the info message, silent by default
 * @returns The identity applied, or undefined when none was needed
 */
export function applyCiGitIdentity(cwd: string, { env = process.env, logger }: { env?: Env, logger?: CoreLogger } = {}): GitIdentity | undefined {
  if (!isInCI() || env.GIT_AUTHOR_NAME || env.GIT_COMMITTER_NAME) {
    return undefined
  }

  if (tryGitSync(['config', 'user.name'], { cwd }) && tryGitSync(['config', 'user.email'], { cwd })) {
    return undefined
  }

  const identity = getCiGitIdentity(env)
  Object.assign(env, {
    GIT_AUTHOR_NAME: identity.name,
    GIT_AUTHOR_EMAIL: identity.email,
    GIT_COMMITTER_NAME: identity.name,
    GIT_COMMITTER_EMAIL: identity.email,
  })
  logger?.info?.(`The release commit and tags are made by ${identity.name} <${identity.email}>`)

  return identity
}

/**
 * Prepare the repository of a CI job for a command reading the history or
 * committing: once per repository and run, a no-op outside a CI (except the
 * shallow clone warning). `commit: false` for a command that only reads it:
 * no git identity of the release commit. Runs `ensureFullHistory`,
 * `attachCiBranch` and, with `commit`, `applyCiGitIdentity` (see them for
 * their git commands and their errors).
 *
 * @param cwd - The directory of the repository
 * @param options - The options
 * @param options.commit - Whether the command commits and needs the git identity, true by default
 * @param options.logger - Receives the messages of the steps, silent by default
 * @example
 * ```ts
 * prepareCiRepository(process.cwd(), { commit: false, logger })
 * ```
 */
export function prepareCiRepository(cwd: string, { commit = true, logger }: { commit?: boolean, logger?: CoreLogger } = {}): void {
  oncePerRun({
    key: commit
      ? 'prepare-ci-repository'
      : 'prepare-ci-repository-read',
    cwd,
    run: () => {
      ensureFullHistory(cwd, { logger })
      attachCiBranch(cwd, { logger })
      if (commit) {
        applyCiGitIdentity(cwd, { logger })
      }
    },
  })
}

/**
 * A token able to push to the GitLab project, other than the job token of
 * the remote (it cannot push by default)
 */
function getGitlabPushToken(token: string | undefined, env: Env): string | undefined {
  return env.GITLAB_CI === 'true' && token && token !== env.CI_JOB_TOKEN
    ? token
    : undefined
}

/**
 * Push through `url` instead of the URL of `remote`, without changing the
 * remote: the `pushInsteadOf` of git, given by the environment, so the token
 * is in no command line nor log
 */
function pushThrough({ url, remoteUrl, env }: { url: string, remoteUrl: string, env: Env }): void {
  const index = Number(env.GIT_CONFIG_COUNT) || 0
  Object.assign(env, {
    GIT_CONFIG_COUNT: String(index + 1),
    [`GIT_CONFIG_KEY_${index}`]: `url.${url}.pushInsteadOf`,
    [`GIT_CONFIG_VALUE_${index}`]: remoteUrl,
  })
}

/**
 * True when git refused a push because the remote branch has commits the
 * local one does not: the credentials could push, the history is behind
 *
 * @param error - The error of the failed git push, its message and `stderr` are read
 * @returns True when the output holds `(non-fast-forward)` or `(fetch first)`
 */
export function isPushRejectedAsBehind(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const { message, stderr } = error as { message?: unknown, stderr?: unknown }
  const output = `${typeof message === 'string'
    ? message
    : ''}\n${typeof stderr === 'string'
    ? stderr
    : ''}`

  return output.includes('(non-fast-forward)') || output.includes('(fetch first)')
}

/** Without the credentials an http URL may hold */
function withoutCredentials(text: string): string {
  return text.replaceAll(/\/\/[^/@\s]+@/g, '//')
}

/**
 * Why git refused the push: its `fatal:`, `error:`, `remote:` and rejected
 * lines (permission denied, protected branch, unreachable host...), without credentials
 */
function getPushRefusal(error: unknown): string | undefined {
  const { stderr } = (error ?? {}) as { stderr?: unknown }
  const lines = (typeof stderr === 'string'
    ? stderr
    : '').split('\n').map(line => line.trim())
  const reasons = lines.filter(line => /^(?:fatal|error|remote):/.test(line) || line.includes('[rejected]') || line.includes('[remote rejected]'))

  return reasons.length > 0
    ? withoutCredentials(reasons.slice(0, 3).join('\n'))
    : undefined
}

/**
 * Undefined when the credentials can push to the remote, else why git refused
 * it (empty when git says nothing). A branch behind its remote can push too:
 * the check of the branch reports it, with its fix
 */
function getPushProblem({ remote, branch, cwd, env }: { remote: string, branch: string, cwd: string, env: Env }): string | undefined {
  try {
    runGitSync([
      'push',
      '--dry-run',
      '--no-verify',
      '--quiet',
      remote,
      `HEAD:refs/heads/${branch}`,
    ], { cwd, env })
    return undefined
  }
  catch (error) {
    return isPushRejectedAsBehind(error)
      ? undefined
      : getPushRefusal(error) ?? ''
  }
}

/**
 * The error of a release that cannot be pushed: why git refused it, and the
 * fix for where it runs
 */
function getPushError({ remote, remoteUrl, env, refusal }: { remote: string, remoteUrl?: string, env: Env, refusal?: string }): string {
  const refusalLines = refusal
    ? refusal.split('\n').map(line => `  ${line}`).join('\n')
    : ''
  const gitSaid = refusal
    ? `Git refused it with:\n${refusalLines}\n`
    : ''

  if (env.GITLAB_CI === 'true') {
    return `relizy cannot push the release commit and tags to "${remote}" from GitLab CI: the job token cannot push.\n${gitSaid}`
      + 'Fix: add a GITLAB_TOKEN CI/CD variable (an access token with the "write_repository" and "api" scopes), '
      + 'or allow the job token to push in Settings > CI/CD > Job token permissions.'
  }
  if (env.GITHUB_ACTIONS === 'true') {
    return `relizy cannot push the release commit and tags to "${remote}" from GitHub Actions: the token of the job cannot push.\n${gitSaid}`
      + 'Fix: give the release job write access in your workflow:\n\n'
      + '  permissions:\n'
      + '    contents: write\n\n'
      + 'or check out the repository with a token allowed to push (actions/checkout, input "token").'
  }

  const ci = getCIName()
  if (ci) {
    return `relizy cannot push the release commit and tags to "${remote}" from ${ci === 'Unknown CI'
      ? 'the CI'
      : ci}: the credentials of the job cannot push.\n${gitSaid}`
      + 'Fix: give the release job credentials allowed to push to this repository (a deploy key or a token with write access).'
  }

  const url = remoteUrl
    ? ` (${withoutCredentials(remoteUrl)})`
    : ''
  return `relizy cannot push the release commit and tags to "${remote}"${url}: git push --dry-run was refused.\n${gitSaid}`
    + 'Fix: check that your git credentials can push to this repository (SSH key, or a token allowed to write), '
    + 'or release without pushing with --no-push.'
}

/**
 * A run of a pull request (GitHub) or a merge request (GitLab): its token is
 * read-only, the release never runs there
 *
 * @param env - The environment to read, `process.env` by default
 * @returns True for a `pull_request` or `pull_request_target` event, or a `merge_request_event` pipeline
 */
export function isPullRequestRun(env: Env = process.env): boolean {
  return env.GITHUB_EVENT_NAME === 'pull_request'
    || env.GITHUB_EVENT_NAME === 'pull_request_target'
    || env.CI_PIPELINE_SOURCE === 'merge_request_event'
}

/**
 * The warning of a dry run of a pull request, whose token cannot push
 *
 * @param env - The environment to read, `process.env` by default
 * @returns The warning, worded for a merge request on GitLab and a pull request otherwise
 */
export function getPullRequestPushWarning(env: Env = process.env): string {
  if (env.GITLAB_CI === 'true') {
    return 'The push is not checked on a merge request: its job token cannot push, the release never runs here.\n'
      + 'The release job checks it (it needs a GITLAB_TOKEN CI/CD variable allowed to push).'
  }

  return 'The push is not checked on a pull request: its token is read-only, the release never runs here.\n'
    + 'The release job checks it (it needs "permissions: contents: write").'
}

/**
 * The warning of a dry run of a pull request whose branch received new
 * commits after the run started: their own run previews the release
 *
 * @param options - The branch and the commits missing
 * @param options.upstream - The remote branch, shown in the warning
 * @param options.missingCommits - The number of commits pushed after the run started
 * @param options.env - The environment to read, `process.env` by default
 * @returns The warning, worded for a merge request on GitLab and a pull request otherwise
 */
export function getPullRequestOutdatedWarning({ upstream, missingCommits, env = process.env }: { upstream: string, missingCommits: number, env?: Env }): string {
  const request = env.GITLAB_CI === 'true'
    ? 'merge request'
    : 'pull request'

  return `This run is outdated: ${missingCommits} new commit(s) were pushed to the ${request} ("${upstream}") after it started.\n`
    + 'Nothing to fix: the run of the latest commit previews the release with them, and the release checks the branch again.'
}

/**
 * Check, before publishing anything, that the release commit and the tags can
 * be pushed: a push failing after the publish leaves versions on the registry
 * without their commit nor their tags. On GitLab, when the remote cannot push
 * (the job token), the push goes through the GitLab token instead. Once per
 * repository and run. The rules of the protected branches are only checked
 * by the real push. Does nothing on a detached HEAD. Runs
 * `git push --dry-run` (nothing is pushed). A branch behind
 * its remote is not an error here. When the fallback applies, `env` gets the
 * `GIT_CONFIG_*` variables routing the push through the token.
 *
 * @param options - The options
 * @param options.cwd - The directory of the repository
 * @param options.gitlabToken - The token of the GitLab project, used to push when the job token cannot
 * @param options.env - The environment to read and to set the push config in, `process.env` by default
 * @param options.logger - Receives the debug and info messages, silent by default
 * @returns A promise resolved when the release can be pushed
 * @throws When the push is refused: the message tells why (the `fatal:`, `error:` or `remote:` lines of git, without credentials) and the fix for the CI (GitHub Actions, GitLab CI, another CI or a local run).
 * @example
 * ```ts
 * await ensurePushAccess({ cwd: process.cwd(), gitlabToken: process.env.GITLAB_TOKEN })
 * ```
 */
export function ensurePushAccess({ cwd, gitlabToken, env = process.env, logger }: {
  cwd: string
  /** The token of the GitLab project, used to push when the job token cannot */
  gitlabToken?: string
  env?: Env
  logger?: CoreLogger
}): Promise<void> {
  return oncePerRun({
    key: 'push-access',
    cwd,
    run: () => Promise.resolve().then(() => {
      const branch = tryGitSync(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd })
      if (!branch || branch === 'HEAD') {
        logger?.debug?.('Detached HEAD: the push access is not checked')
        return
      }

      const remote = tryGitSync(['config', `branch.${branch}.remote`], { cwd }) || 'origin'
      let refusal = getPushProblem({ remote, branch, cwd, env })
      if (refusal === undefined) {
        logger?.debug?.(`The release can be pushed to "${remote}"`)
        return
      }

      const token = getGitlabPushToken(gitlabToken, env)
      const remoteUrl = tryGitSync(['remote', 'get-url', '--push', remote], { cwd })
      if (token && remoteUrl?.startsWith('http') && env.CI_SERVER_URL && env.CI_PROJECT_PATH) {
        const url = new URL(env.CI_SERVER_URL)
        url.username = 'oauth2'
        url.password = token
        url.pathname = `${url.pathname.replace(/\/$/, '')}/${env.CI_PROJECT_PATH}.git`
        pushThrough({
          url: url.toString(),
          remoteUrl,
          env,
        })

        refusal = getPushProblem({ remote, branch, cwd, env })
        if (refusal === undefined) {
          logger?.info?.('The release is pushed with the GitLab token (the job token cannot push)')
          return
        }
      }

      throw new Error(getPushError({ remote, remoteUrl, env, refusal }))
    }),
  })
}
