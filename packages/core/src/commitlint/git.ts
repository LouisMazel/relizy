import type { CoreLogger } from '../types'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import process from 'node:process'
import { clearGitCache } from '../git-cache'
import { runGitSync, tryGitSync } from '../git-exec'
import { listTags } from '../git-refs'

/**
 * What the commit linter reads of git: the message being created, the staged
 * files, the commits of a range, and the history of a shallow clone.
 */

/**
 * Absolute path of a file of the git directory (`COMMIT_EDITMSG`, `hooks`...),
 * resolved with `git rev-parse --git-path`, so worktrees are handled. Runs git
 * but reads no file.
 * @param path - Path relative to the git directory, e.g. `COMMIT_EDITMSG`
 * @param cwd - Directory to run git from
 * @returns The absolute path (relative results of git are joined to `cwd`)
 * @throws When git fails, e.g. `cwd` is not in a git repository
 * @example
 * ```ts
 * getGitPath('COMMIT_EDITMSG', '/repo') // '/repo/.git/COMMIT_EDITMSG'
 * ```
 */
export function getGitPath(path: string, cwd: string): string {
  const gitPath = runGitSync(['rev-parse', '--git-path', path], { cwd })
  return isAbsolute(gitPath)
    ? gitPath
    : join(cwd, gitPath)
}

/**
 * Character git uses for the comment lines of the edited messages: the
 * `core.commentChar` setting.
 * @param cwd - Directory to run git from
 * @returns The configured character, `#` when it is unset or `auto`
 */
export function getCommentChar(cwd: string): string {
  const commentChar = tryGitSync(['config', 'core.commentChar'], { cwd })
  return commentChar && commentChar !== 'auto'
    ? commentChar
    : '#'
}

/**
 * Path of the message of the commit being created: the file given to the
 * `commit-msg` hook, `.git/COMMIT_EDITMSG` by default.
 * @param file - File given to the hook, absolute or relative to `cwd`, if any
 * @param cwd - Directory to run git from, and to resolve a relative `file`
 * @returns The absolute path of the message file
 */
export function getCommitMessageFile(file: string | undefined, cwd: string): string {
  return file
    ? (isAbsolute(file)
        ? file
        : join(cwd, file))
    : getGitPath('COMMIT_EDITMSG', cwd)
}

/**
 * The message of the commit being created, as written in the file (comment
 * lines included, see `stripGitComments`). Reads the file from disk; runs git
 * only to locate `.git/COMMIT_EDITMSG` when `file` is omitted.
 * @param file - File given to the `commit-msg` hook, `.git/COMMIT_EDITMSG` when omitted
 * @param cwd - Directory to run git from, and to resolve a relative `file`
 * @returns The content of the message file (UTF-8)
 * @throws When the file cannot be read, or git fails while locating the default file
 */
export function readCommitMessageFile(file: string | undefined, cwd: string): string {
  return readFileSync(getCommitMessageFile(file, cwd), 'utf8')
}

/**
 * Files staged for the commit being created, relative to the repository root.
 * @param cwd - Directory to run git from
 * @returns The staged paths, empty when nothing is staged or git fails
 */
export function getStagedFiles(cwd: string): string[] {
  const output = tryGitSync(['diff', '--cached', '--name-only'], { cwd })
  return output
    ? output.split('\n').filter(Boolean)
    : []
}

/** A commit of a range: hash, message and changed files */
export interface RangeCommit {
  /** Full hash of the commit */
  hash: string
  /** Full message, trailing whitespace trimmed */
  message: string
  /** Changed files, relative to the repository root */
  files: string[]
}

// ASCII record, unit and group separators: they never appear in a commit message
const COMMIT_SEPARATOR = '\x1E'
const FIELD_SEPARATOR = '\x1F'
const FILES_SEPARATOR = '\x1D'

/**
 * Commits reachable from `to` and not from `from`, oldest first, with their
 * full message and changed files. Without `from`, every commit up to `to`.
 * Runs `git log`; merge commits list no files.
 * @param options - Range and repository
 * @param options.from - Exclusive start of the range, the whole history up to `to` when omitted
 * @param options.to - Inclusive end of the range (default: `HEAD`)
 * @param options.cwd - Directory to run git from
 * @returns The commits of the range, empty when there are none
 * @throws When git fails, e.g. on an unknown ref
 * @example
 * ```ts
 * const commits = getCommitsInRange({ from: 'v1.0.0', cwd: '/repo' })
 * // [{ hash: '3f2a...', message: 'feat(core): add the parser', files: ['packages/core/src/parser.ts'] }]
 * ```
 */
export function getCommitsInRange({ from, to = 'HEAD', cwd }: { from?: string, to?: string, cwd: string }): RangeCommit[] {
  const output = runGitSync([
    'log',
    '--reverse',
    `--format=${COMMIT_SEPARATOR}%H${FIELD_SEPARATOR}%B${FILES_SEPARATOR}`,
    '--name-only',
    from
      ? `${from}..${to}`
      : to,
  ], { cwd })

  return output.split(COMMIT_SEPARATOR).slice(1).map((record) => {
    const [hash = '', rest = ''] = record.split(FIELD_SEPARATOR)
    const [message = '', files = ''] = rest.split(FILES_SEPARATOR)
    return {
      hash,
      message: message.trimEnd(),
      files: files.split('\n').map(file => file.trim()).filter(Boolean),
    }
  })
}

/** How to fetch the full history, for the error messages */
function getFetchHistoryHint(): string {
  if (process.env.GITLAB_CI) {
    return 'set "GIT_DEPTH: 0" on the job'
  }
  if (process.env.GITHUB_ACTIONS) {
    return 'set "fetch-depth: 0" on actions/checkout'
  }
  return 'run "git fetch --unshallow"'
}

function isShallowRepository(cwd: string): boolean {
  return tryGitSync(['rev-parse', '--is-shallow-repository'], { cwd }) === 'true'
}

/**
 * Fetch what the range needs from `origin`: the full history in a shallow clone
 * (the default checkout of GitHub Actions and GitLab CI only has the last
 * commits), and the given refs. `false` when nothing could be fetched.
 */
function fetchHistory(cwd: string, { refspecs = [], tags = false, logger }: { refspecs?: string[], tags?: boolean, logger?: CoreLogger } = {}): boolean {
  const shallow = isShallowRepository(cwd)
  if (!shallow && refspecs.length === 0 && !tags) {
    return false
  }
  const args = [
    'fetch',
    '--quiet',
    ...(tags
      ? ['--tags']
      : ['--no-tags']),
    ...(shallow
      ? ['--unshallow']
      : []),
    'origin',
    ...refspecs,
  ]
  logger?.debug?.(`commitlint: git ${args.join(' ')}`)
  try {
    runGitSync(args, { cwd })
    clearGitCache()
    return true
  }
  catch (error) {
    logger?.debug?.(`commitlint: the fetch failed: ${error instanceof Error
      ? error.message
      : String(error)}`)
    return false
  }
}

function isRefAvailable(ref: string, cwd: string): boolean {
  return Boolean(tryGitSync([
    'rev-parse',
    '--verify',
    '--quiet',
    `${ref}^{commit}`,
  ], { cwd }))
}

/**
 * Makes sure the start of the range is in the local history: in a shallow
 * clone, the full history and the tags are fetched from `origin` (network, runs
 * `git fetch --unshallow --tags` and clears the git cache). Returns silently when
 * the ref is available.
 * @param ref - Ref to look for (commit, tag or branch)
 * @param cwd - Directory to run git from
 * @param logger - Receives the debug logs of the fetch
 * @throws When the ref is still missing, with a hint to fetch the history (`Cannot find "<ref>": ...`)
 */
export function assertRefAvailable(ref: string, cwd: string, logger?: CoreLogger): void {
  if (isRefAvailable(ref, cwd) || (isShallowRepository(cwd) && fetchHistory(cwd, { tags: true, logger }) && isRefAvailable(ref, cwd))) {
    return
  }
  const reason = isShallowRepository(cwd)
    ? `the repository is a shallow clone: fetch the full history (${getFetchHistoryHint()})`
    : 'fetch it before linting'
  throw new Error(`Cannot find "${ref}": ${reason}`)
}

/** The title of the pull request or merge request of the current CI run */
export interface PullRequestTitle {
  /** Title, draft markers of GitLab removed */
  title: string
  /** `pull request` on GitHub, `merge request` on GitLab */
  kind: 'pull request' | 'merge request'
}

/**
 * Title of the pull/merge request of the CI run, which becomes the commit
 * message of a squash merge. The draft markers of GitLab are removed. Read from
 * `CI_MERGE_REQUEST_TITLE` on GitLab CI, and from the event file
 * (`GITHUB_EVENT_PATH`) on GitHub Actions pull request runs.
 * @returns The title and its kind, `undefined` outside a pull/merge request run or when the title cannot be read
 * @example
 * ```ts
 * getPullRequestTitle() // { title: 'feat(core): add the parser', kind: 'pull request' }
 * ```
 */
export function getPullRequestTitle(): PullRequestTitle | undefined {
  const gitlabTitle = process.env.CI_MERGE_REQUEST_TITLE
  if (gitlabTitle) {
    return {
      title: gitlabTitle.replace(/^(?:draft:|\[draft\]|\(draft\))\s*/i, ''),
      kind: 'merge request',
    }
  }

  const eventPath = process.env.GITHUB_EVENT_PATH
  if (process.env.GITHUB_BASE_REF && eventPath && existsSync(eventPath)) {
    try {
      const title = JSON.parse(readFileSync(eventPath, 'utf8'))?.pull_request?.title
      return typeof title === 'string' && title
        ? { title, kind: 'pull request' }
        : undefined
    }
    catch {
      return undefined
    }
  }

  return undefined
}

/** The start of the default range of commits to lint, and how it was found */
export interface DefaultRangeStart {
  /** Start of the range (exclusive), `undefined` for the whole history */
  from?: string
  /** Why this start was chosen, for the logs */
  reason: string
}

/**
 * Start of the commits to lint when `--from` is not given: the merge-base with
 * the target branch of the pull/merge request in GitHub Actions and GitLab CI,
 * otherwise the last tag, otherwise the whole history. In GitHub Actions, the
 * base branch is fetched from `origin` when missing, and an error is thrown when
 * the merge-base still cannot be found (this fetch uses the network and clears
 * the git cache). The environment variables `GITHUB_BASE_REF` and
 * `CI_MERGE_REQUEST_DIFF_BASE_SHA` decide which case applies; the last tag is
 * the first of the tags listed by `listTags`.
 * @param options - Repository and logging
 * @param options.cwd - Directory to run git from
 * @param options.logger - Receives debug logs
 * @returns The start of the range and the reason it was chosen
 * @throws In GitHub Actions pull request runs, when the merge-base with `origin/<GITHUB_BASE_REF>` cannot be found even after fetching
 * @example
 * ```ts
 * const { from, reason } = await resolveDefaultRangeStart({ cwd: '/repo' })
 * // { from: 'v1.2.0', reason: 'last tag v1.2.0' }
 * ```
 */
export async function resolveDefaultRangeStart({ cwd, logger }: { cwd: string, logger?: CoreLogger }): Promise<DefaultRangeStart> {
  const githubBase = process.env.GITHUB_BASE_REF
  if (githubBase) {
    const getMergeBase = () => tryGitSync(['merge-base', `origin/${githubBase}`, 'HEAD'], { cwd })
    // The default checkout of a pull request has neither the base branch nor the history
    const mergeBase = getMergeBase()
      ?? (fetchHistory(cwd, {
        refspecs: [`+refs/heads/${githubBase}:refs/remotes/origin/${githubBase}`],
        logger,
      })
        ? getMergeBase()
        : undefined)
    if (!mergeBase) {
      throw new Error(`Cannot find the merge-base of HEAD and origin/${githubBase}: fetch the history of the base branch (${getFetchHistoryHint()}), or pass --from`)
    }
    return { from: mergeBase, reason: `merge-base with origin/${githubBase}` }
  }

  const gitlabBase = process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA
  if (gitlabBase) {
    return { from: gitlabBase, reason: 'base of the merge request' }
  }

  const [lastTag = ''] = await listTags({ cwd })
  logger?.debug?.('Last tag:', lastTag || 'No tags found')
  if (lastTag) {
    return { from: lastTag, reason: `last tag ${lastTag}` }
  }

  return { reason: 'whole history, no tag found' }
}
