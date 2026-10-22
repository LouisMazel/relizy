import type { LogLevel } from '@maz-ui/node'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative } from 'node:path'
import process from 'node:process'
import { getLastTag } from '../tags'

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function gitOrUndefined(args: string[], cwd: string): string | undefined {
  try {
    return git(args, cwd)
  }
  catch {
    return undefined
  }
}

/** Absolute path of a file of the git directory (`COMMIT_EDITMSG`, `hooks`...) */
function getGitPath(path: string, cwd: string): string {
  const gitPath = git(['rev-parse', '--git-path', path], cwd)
  return isAbsolute(gitPath) ? gitPath : join(cwd, gitPath)
}

/** Character git uses for the comment lines of the edited messages */
export function getCommentChar(cwd: string): string {
  const commentChar = gitOrUndefined(['config', 'core.commentChar'], cwd)
  return commentChar && commentChar !== 'auto' ? commentChar : '#'
}

/**
 * Path of the message of the commit being created: the file given to the
 * `commit-msg` hook, `.git/COMMIT_EDITMSG` by default.
 */
export function getCommitMessageFile(file: string | undefined, cwd: string): string {
  return file ? (isAbsolute(file) ? file : join(cwd, file)) : getGitPath('COMMIT_EDITMSG', cwd)
}

/** The message of the commit being created */
export function readCommitMessageFile(file: string | undefined, cwd: string): string {
  return readFileSync(getCommitMessageFile(file, cwd), 'utf8')
}

/** Files staged for the commit being created, relative to the repository root */
export function getStagedFiles(cwd: string): string[] {
  const output = gitOrUndefined(['diff', '--cached', '--name-only'], cwd)
  return output ? output.split('\n').filter(Boolean) : []
}

export interface RangeCommit {
  hash: string
  message: string
  files: string[]
}

// ASCII record, unit and group separators: they never appear in a commit message
const COMMIT_SEPARATOR = '\x1E'
const FIELD_SEPARATOR = '\x1F'
const FILES_SEPARATOR = '\x1D'

/**
 * Commits reachable from `to` and not from `from`, oldest first, with their
 * full message and changed files. Every commit up to `to` without `from`.
 */
export function getCommitsInRange({ from, to = 'HEAD', cwd }: { from?: string, to?: string, cwd: string }): RangeCommit[] {
  const output = git([
    'log',
    '--reverse',
    `--format=${COMMIT_SEPARATOR}%H${FIELD_SEPARATOR}%B${FILES_SEPARATOR}`,
    '--name-only',
    from ? `${from}..${to}` : to,
  ], cwd)

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
  return gitOrUndefined(['rev-parse', '--is-shallow-repository'], cwd) === 'true'
}

/**
 * Throws a helpful error when the start of the range is not in the local
 * history, e.g. in a shallow clone of the CI.
 */
export function assertRefAvailable(ref: string, cwd: string): void {
  if (gitOrUndefined(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd)) {
    return
  }
  const reason = isShallowRepository(cwd)
    ? `the repository is a shallow clone: fetch the full history (${getFetchHistoryHint()})`
    : 'fetch it before linting'
  throw new Error(`Cannot find "${ref}": ${reason}`)
}

export interface PullRequestTitle {
  title: string
  /** `pull request` on GitHub, `merge request` on GitLab */
  kind: 'pull request' | 'merge request'
}

/**
 * Title of the pull/merge request of the CI run, which becomes the commit
 * message of a squash merge. The draft markers of GitLab are removed.
 */
export function getPullRequestTitle(): PullRequestTitle | undefined {
  const gitlabTitle = process.env.CI_MERGE_REQUEST_TITLE
  if (gitlabTitle) {
    return { title: gitlabTitle.replace(/^(?:draft:|\[draft\]|\(draft\))\s*/i, ''), kind: 'merge request' }
  }

  const eventPath = process.env.GITHUB_EVENT_PATH
  if (process.env.GITHUB_BASE_REF && eventPath && existsSync(eventPath)) {
    try {
      const title = JSON.parse(readFileSync(eventPath, 'utf8'))?.pull_request?.title
      return typeof title === 'string' && title ? { title, kind: 'pull request' } : undefined
    }
    catch {
      return undefined
    }
  }

  return undefined
}

export interface DefaultRangeStart {
  from?: string
  /** Why this start was chosen, for the logs */
  reason: string
}

/**
 * Start of the commits to lint when `--from` is not given: the merge-base with
 * the target branch of the pull/merge request in GitHub Actions and GitLab CI,
 * otherwise the last tag, otherwise the whole history.
 */
export async function resolveDefaultRangeStart({ cwd, logLevel }: { cwd: string, logLevel?: LogLevel }): Promise<DefaultRangeStart> {
  const githubBase = process.env.GITHUB_BASE_REF
  if (githubBase) {
    const mergeBase = gitOrUndefined(['merge-base', `origin/${githubBase}`, 'HEAD'], cwd)
    if (!mergeBase) {
      throw new Error(`Cannot find the merge-base of HEAD and origin/${githubBase}: fetch the history of the base branch (${getFetchHistoryHint()}), or pass --from`)
    }
    return { from: mergeBase, reason: `merge-base with origin/${githubBase}` }
  }

  const gitlabBase = process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA
  if (gitlabBase) {
    return { from: gitlabBase, reason: 'base of the merge request' }
  }

  const lastTag = await getLastTag({ cwd, logLevel })
  if (lastTag) {
    return { from: lastTag, reason: `last tag ${lastTag}` }
  }

  return { reason: 'whole history, no tag found' }
}

export interface InstalledHook {
  path: string
  status: 'created' | 'replaced' | 'unchanged'
}

const HOOK_COMMAND = 'npx --no -- relizy commitlint --edit "$1"'

/**
 * Write the `commit-msg` hook running `relizy commitlint`: in `.husky/` when
 * husky is set up, otherwise in the hooks directory of git. An existing hook is
 * only replaced with `force`.
 */
export function installCommitMsgHook({ cwd, force = false }: { cwd: string, force?: boolean }): InstalledHook {
  const root = git(['rev-parse', '--show-toplevel'], cwd)
  const husky = join(root, '.husky')
  const hooksPath = gitOrUndefined(['config', 'core.hooksPath'], cwd)
  const hooksDirectory = hooksPath ? (isAbsolute(hooksPath) ? hooksPath : join(root, hooksPath)) : getGitPath('hooks', cwd)
  const path = join(existsSync(husky) ? husky : hooksDirectory, 'commit-msg')
  const content = path.startsWith(husky) ? `${HOOK_COMMAND}\n` : `#!/bin/sh\n${HOOK_COMMAND}\n`

  let status: InstalledHook['status'] = 'created'
  if (existsSync(path)) {
    const existing = readFileSync(path, 'utf8')
    if (existing.includes('relizy commitlint')) {
      return { path, status: 'unchanged' }
    }
    if (!force) {
      throw new Error(`A commit-msg hook already exists (${relative(root, path)}). Add "${HOOK_COMMAND}" to it, or run with --force to replace it`)
    }
    status = 'replaced'
  }

  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  chmodSync(path, 0o755)
  return { path, status }
}
