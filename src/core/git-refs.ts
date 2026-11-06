import type { LogLevel } from '@maz-ui/node'
import type { RawGitCommit } from '../types'
import { execSync } from 'node:child_process'
import { execPromise } from '@maz-ui/node'
import { cachedGitRead, clearGitCache } from './git-cache'
import { shellArg, shellSingleQuote } from './shell'

/**
 * Low-level git ref/tag helpers. This module is intentionally a leaf (it only
 * depends on `@maz-ui/node` and the leaves `git-cache.ts` and `shell.ts`) so it can be imported
 * from anywhere -- including `rewritten-tags.ts` -- without creating an import
 * cycle through `repo.ts`.
 */

/**
 * Returns true when `ancestor` is an ancestor of `descendant` (i.e. reachable
 * from it). Uses `git merge-base --is-ancestor`, which exits 0 when true and
 * non-zero otherwise. Any error (e.g. unknown ref) is treated as "not an
 * ancestor".
 */
export function isAncestor(ancestor: string, descendant: string, cwd?: string): Promise<boolean> {
  return cachedGitRead({
    key: ['is-ancestor', ancestor, descendant],
    cwd,
    read: async () => {
      try {
        await execPromise(
          `git merge-base --is-ancestor ${shellSingleQuote(ancestor)} ${shellSingleQuote(descendant)}`,
          { cwd, noStderr: true, noStdout: true, noSuccess: true, noError: true },
        )
        return true
      }
      catch {
        return false
      }
    },
  })
}

/**
 * Returns the subject (first line) of the commit a ref points to, or null.
 */
export async function getCommitSubject(ref: string, cwd?: string): Promise<string | null> {
  try {
    const { stdout } = await execPromise(
      `git log -1 --format=%s ${shellSingleQuote(ref)}`,
      { cwd, noStderr: true, noStdout: true, noSuccess: true, noError: true },
    )
    return stdout.trim() || null
  }
  catch {
    return null
  }
}

/**
 * Find the most recent commit reachable from `to` whose subject matches
 * `subject` literally. Used to locate the "twin" of a release commit that was
 * rewritten by a rebase (the orphaned tag still points to the old commit).
 */
export async function findReachableCommitBySubject(subject: string, to: string, cwd?: string): Promise<string | null> {
  try {
    const { stdout } = await execPromise(
      `git log ${shellSingleQuote(to)} --grep=${shellSingleQuote(subject)} --fixed-strings --format=%H -n 1`,
      { cwd, noStderr: true, noStdout: true, noSuccess: true, noError: true },
    )
    return stdout.trim().split('\n')[0]?.trim() || null
  }
  catch {
    return null
  }
}

/**
 * Returns true when a tag with the given name exists locally.
 */
export function tagExists(tag: string, cwd?: string): Promise<boolean> {
  return cachedGitRead({
    key: ['tag-exists', tag],
    cwd,
    read: async () => {
      try {
        const tagRef = `refs/tags/${tag}`
        await execPromise(
          `git rev-parse --verify --quiet ${shellSingleQuote(tagRef)}`,
          { cwd, noStderr: true, noStdout: true, noSuccess: true, noError: true },
        )
        return true
      }
      catch {
        return false
      }
    },
  })
}

// Large enough for every tag of a repository with a long release history: the
// default 1 MB of `exec` is reached around 40k tags.
const LIST_TAGS_MAX_BUFFER = 64 * 1024 * 1024

/**
 * Returns the local tags, most recent first (`--sort=-creatordate`). With
 * `pattern` (a `git tag --list` glob, e.g. `v*`), only the tags matching it are
 * listed. Any error returns an empty list.
 */
export async function listTags({
  pattern,
  cwd,
  logLevel,
}: {
  pattern?: string
  cwd?: string
  logLevel?: LogLevel
} = {}): Promise<string[]> {
  const list = pattern ? ` --list ${shellSingleQuote(pattern)}` : ''

  const tags = await cachedGitRead({
    key: ['list-tags', pattern ?? ''],
    cwd,
    read: async () => {
      try {
        const { stdout } = await execPromise(
          `git tag${list} --sort=-creatordate`,
          { cwd, logLevel, noStderr: true, noStdout: true, noSuccess: true, maxBuffer: LIST_TAGS_MAX_BUFFER },
        )
        return stdout.trim().split('\n').filter(tag => tag.length > 0)
      }
      catch {
        return []
      }
    },
  })

  return [...tags]
}

/**
 * Move an annotated tag to a different commit locally (force). Never rewrites
 * any commit; only the tag pointer moves.
 */
export async function retagAnnotatedLocal({
  tag,
  commit,
  message,
  signed,
  cwd,
  logLevel,
}: {
  tag: string
  commit: string
  message: string
  signed?: boolean
  cwd?: string
  logLevel?: LogLevel
}): Promise<void> {
  const sign = signed ? '-s ' : ''
  await execPromise(
    `git tag -f ${sign}-a ${shellSingleQuote(tag)} ${shellSingleQuote(commit)} -m ${shellSingleQuote(message)}`,
    { cwd, logLevel, noStderr: true, noStdout: true },
  )
  clearGitCache()
}

/**
 * Force-push a single tag to origin. Used only after explicit confirmation.
 */
export async function pushTagForce(tag: string, cwd?: string, logLevel?: LogLevel): Promise<void> {
  await execPromise(
    `git push origin ${shellSingleQuote(tag)} --force`,
    { cwd, logLevel, noStderr: true, noStdout: true },
  )
}

/**
 * A line of the `--name-status` list `getGitDiff` appends to the commit bodies:
 * a status letter, a similarity score for renames and copies, then a tab
 * (`M\tpath`, `R100\told\tnew`). A line of prose never has this tab
 * ("A new option" is not a file).
 */
export const NAME_STATUS_LINE = /^[A-Z]\d*\t/

/**
 * Git quotes the paths with unusual characters (`"packages/pkg-a/caf\303\251.ts"`,
 * see `core.quotePath`): drop the quotes so the directory part can be compared.
 */
function unquoteGitPath(path: string): string {
  return path.length > 1 && path.startsWith('"') && path.endsWith('"') ? path.slice(1, -1) : path
}

/** A file line of the `--name-status` list: its status (`M`, `A`, `R100`...) and its paths (old then new for renames and copies) */
export interface NameStatusEntry {
  status: string
  paths: string[]
}

/**
 * The file lines of the `--name-status` list `getGitDiff` appends to a commit
 * body (`M\tpath/to/file`, `R100\told\tnew`).
 */
export function parseNameStatus(body: string): NameStatusEntry[] {
  return body
    .split('\n')
    .filter(line => NAME_STATUS_LINE.test(line))
    .map((line) => {
      const [status = '', ...paths] = line.split('\t')

      return { status, paths: paths.map(path => unquoteGitPath(path.trim())).filter(Boolean) }
    })
    .filter(entry => entry.paths.length > 0)
}

/**
 * The text of a commit body without the `--name-status` list git writes after
 * it: the last block of lines, after a blank line. A line of the text that
 * looks like a file line is kept.
 */
export function stripNameStatus(body: string): string {
  const lines = body.trimEnd().split('\n')
  let end = lines.length

  while (end > 0 && NAME_STATUS_LINE.test(lines[end - 1]!)) {
    end--
  }

  return lines.slice(0, end).join('\n')
}

// ASCII record and unit separators: they never appear in a commit message,
// unlike the `----` and `|` delimiters used by changelogen's `getGitDiff`.
const COMMIT_SEPARATOR = '\x1E'
const FIELD_SEPARATOR = '\x1F'

/**
 * The output of `git log` over a long range (the whole history of a new package
 * in a large repository) overflows the 1 MB default of `execSync` (ENOBUFS).
 */
const GIT_LOG_MAX_BUFFER = 1024 ** 3

/**
 * Drop-in replacement for changelogen's `getGitDiff`, which splits the
 * `git log` output on `----\n` and the subject line on `|`. A commit body
 * containing a `----` line (GitHub adds `---------` before the
 * `Co-authored-by:` trailers of a squash merge) then loses its trailers and its
 * `--name-status` file list, and a subject containing `|` is truncated.
 */
export function getGitDiff(from: string | undefined, to = 'HEAD', cwd?: string): RawGitCommit[] {
  const range = from ? `${from}...${to}` : to
  // The same range is read for each package and each step: parsed once, a copy returned to each caller
  const commits = cachedGitRead({ key: ['log', range], cwd, read: () => readGitLog(range, cwd) })

  return commits.map(commit => ({ ...commit, author: { ...commit.author } }))
}

function readGitLog(range: string, cwd?: string): RawGitCommit[] {
  const output = execSync(
    `git --no-pager log ${shellArg(range)} --pretty="%x1E%s%x1F%h%x1F%an%x1F%ae%n%b" --name-status`,
    { cwd, encoding: 'utf8', maxBuffer: GIT_LOG_MAX_BUFFER },
  ).trim()

  return output.split(COMMIT_SEPARATOR).slice(1).map((record) => {
    const [firstLine = '', ...body] = record.split('\n')
    const [message = '', shortHash = '', authorName = '', authorEmail = ''] = firstLine.split(FIELD_SEPARATOR)

    return {
      message,
      shortHash,
      author: { name: authorName, email: authorEmail },
      body: body.join('\n'),
    }
  })
}
