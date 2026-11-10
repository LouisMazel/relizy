import type { GitProvider, RawGitCommit } from './types'
import process from 'node:process'
import { cachedGitRead, clearGitCache } from './git-cache'
import { runGit, runGitSync, tryGitSync } from './git-exec'
import { applySimulatedSquash } from './squash-simulation'

/**
 * Git ref, tag and branch helpers, on top of `git-exec.ts` and `git-cache.ts`.
 */

/**
 * The output of `git status --porcelain`, one line per changed file. Throws
 * when git fails (not a repository).
 *
 * @param cwd - Directory of the repository, the current directory by default
 * @param trim - Trim the output, true by default; give false to keep the first column of the first line (see `parseGitStatus`)
 * @returns The porcelain output, empty when the working directory is clean
 * @throws The git error when git fails (not a repository)
 * @example
 * ```ts
 * getGitStatus(cwd, false) // ' M src/a.ts\n?? notes.md'
 * ```
 */
export function getGitStatus(cwd?: string, trim = true) {
  return runGitSync(['status', '--porcelain'], { cwd, trim })
}

/**
 * Returns true when `ancestor` is an ancestor of `descendant` (i.e. reachable
 * from it). Uses `git merge-base --is-ancestor`, which exits 0 when true and
 * non-zero otherwise. Any error (e.g. unknown ref) is treated as "not an
 * ancestor". Cached inside `withGitCache()`.
 *
 * @param ancestor - The ref expected to be reachable from `descendant`
 * @param descendant - The ref to start from, e.g. `HEAD`
 * @param cwd - Directory of the repository, the current directory by default
 * @returns True when `ancestor` is reachable from `descendant`, false otherwise
 * @example
 * ```ts
 * await isAncestor('v1.0.0', 'HEAD', cwd) // true when the tag is in the history of HEAD
 * ```
 */
export function isAncestor(ancestor: string, descendant: string, cwd?: string): Promise<boolean> {
  return cachedGitRead({
    key: ['is-ancestor', ancestor, descendant],
    cwd,
    read: async () => {
      try {
        await runGit([
          'merge-base',
          '--is-ancestor',
          ancestor,
          descendant,
        ], { cwd })
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
 *
 * @param ref - A commit, tag or branch
 * @param cwd - Directory of the repository, the current directory by default
 * @returns The subject, or null when the ref is unknown or the subject is empty
 * @example
 * ```ts
 * await getCommitSubject('v1.0.0', cwd) // 'chore(release): v1.0.0'
 * ```
 */
export async function getCommitSubject(ref: string, cwd?: string): Promise<string | null> {
  try {
    return await runGit(['log', '-1', '--format=%s', ref], { cwd }) || null
  }
  catch {
    return null
  }
}

/**
 * Find the most recent commit reachable from `to` whose subject matches
 * `subject` literally. Used to locate the "twin" of a release commit that was
 * rewritten by a rebase (the orphaned tag still points to the old commit).
 *
 * @param subject - The text to look for in the commit messages, matched as a fixed string
 * @param to - The ref to search back from, e.g. `HEAD`
 * @param cwd - Directory of the repository, the current directory by default
 * @returns The full hash of the commit, or null when none matches or git fails
 * @example
 * ```ts
 * await findReachableCommitBySubject('chore(release): v1.0.0', 'HEAD', cwd)
 * // '3f2c1a9e...' (full hash)
 * ```
 */
export async function findReachableCommitBySubject(subject: string, to: string, cwd?: string): Promise<string | null> {
  try {
    const stdout = await runGit([
      'log',
      to,
      `--grep=${subject}`,
      '--fixed-strings',
      '--format=%H',
      '-n',
      '1',
    ], { cwd })
    return stdout.split('\n')[0]?.trim() || null
  }
  catch {
    return null
  }
}

/**
 * Returns true when a tag with the given name exists locally. Cached inside
 * `withGitCache()`.
 *
 * @param tag - The tag name, e.g. `v1.0.0`
 * @param cwd - Directory of the repository, the current directory by default
 * @returns True when `refs/tags/<tag>` exists, false otherwise (also when git fails)
 * @example
 * ```ts
 * await tagExists('v1.0.0', cwd) // true
 * ```
 */
export function tagExists(tag: string, cwd?: string): Promise<boolean> {
  return cachedGitRead({
    key: ['tag-exists', tag],
    cwd,
    read: async () => {
      try {
        await runGit([
          'rev-parse',
          '--verify',
          '--quiet',
          `refs/tags/${tag}`,
        ], { cwd })
        return true
      }
      catch {
        return false
      }
    },
  })
}

/**
 * Returns the local tags, most recent first (`--sort=-creatordate`). With
 * `pattern` (a `git tag --list` glob, e.g. `v*`), only the tags matching it are
 * listed. Any error returns an empty list.
 *
 * @param options - The options
 * @param options.pattern - A `git tag --list` glob, e.g. `v*`; every tag by default
 * @param options.cwd - Directory of the repository, the current directory by default
 * @returns The tag names, most recent first; a new array on each call
 * @example
 * ```ts
 * await listTags({ pattern: 'v*', cwd })
 * // ['v1.1.0', 'v1.0.0']
 * ```
 */
export async function listTags({
  pattern,
  cwd,
}: {
  pattern?: string
  cwd?: string
} = {}): Promise<string[]> {
  const tags = await cachedGitRead({
    key: ['list-tags', pattern ?? ''],
    cwd,
    read: async () => {
      try {
        const stdout = await runGit([
          'tag',
          ...(pattern
            ? ['--list', pattern]
            : []),
          '--sort=-creatordate',
        ], { cwd })
        return stdout.split('\n').filter(tag => tag.length > 0)
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
 * any commit; only the tag pointer moves. Throws when git fails, and clears the
 * git cache.
 *
 * @param options - The options
 * @param options.tag - The tag to move
 * @param options.commit - The commit the tag will point to
 * @param options.message - The message of the new annotated tag
 * @param options.signed - Sign the tag (`git tag -s`), false by default
 * @param options.cwd - Directory of the repository, the current directory by default
 * @throws The git error (secrets redacted) when `git tag -f -a` fails, e.g. unknown commit
 * @example
 * ```ts
 * await retagAnnotatedLocal({ tag: 'v1.0.0', commit: newHash, message: 'Release v1.0.0', cwd })
 * ```
 */
export async function retagAnnotatedLocal({
  tag,
  commit,
  message,
  signed,
  cwd,
}: {
  tag: string
  commit: string
  message: string
  signed?: boolean
  cwd?: string
}): Promise<void> {
  await runGit([
    'tag',
    '-f',
    ...(signed
      ? ['-s']
      : []),
    '-a',
    tag,
    commit,
    '-m',
    message,
  ], { cwd })
  clearGitCache()
}

/**
 * Force-push a single tag to `origin` (`git push origin <tag> --force`). Used
 * only after explicit confirmation. Throws when the push fails.
 *
 * @param tag - The tag to push
 * @param cwd - Directory of the repository, the current directory by default
 * @throws The git error (secrets redacted) when the push fails
 * @example
 * ```ts
 * await pushTagForce('v1.0.0', cwd)
 * ```
 */
export async function pushTagForce(tag: string, cwd?: string): Promise<void> {
  await runGit(['push', 'origin', tag, '--force'], { cwd })
}

/** The upstream branch of the current branch: remote, ref and local tracking ref */
export interface GitUpstream {
  /** Remote name, e.g. `origin` */
  remote: string
  /** Remote branch ref, e.g. `refs/heads/main` */
  mergeRef: string
  /** Remote-tracking ref, e.g. `refs/remotes/origin/main` */
  trackingRef: string
  /** Short remote-tracking name, e.g. `origin/main` */
  name: string
}

/**
 * Resolve the upstream of the current branch. Returns null on a detached HEAD
 * or when the branch has no upstream configured (any git error also gives null).
 *
 * @param cwd - Directory of the repository
 * @returns The upstream, or null; never throws
 * @example
 * ```ts
 * await getGitUpstream(cwd)
 * // { remote: 'origin', mergeRef: 'refs/heads/main', trackingRef: 'refs/remotes/origin/main', name: 'origin/main' }
 * ```
 */
export async function getGitUpstream(cwd: string): Promise<GitUpstream | null> {
  try {
    const branch = getCurrentGitBranch(cwd)

    if (!branch || branch === 'HEAD') {
      return null
    }

    const [remote, mergeRef, trackingRef] = await Promise.all([
      runGit(['config', '--get', `branch.${branch}.remote`], { cwd }),
      runGit(['config', '--get', `branch.${branch}.merge`], { cwd }),
      runGit(['rev-parse', '--symbolic-full-name', '@{upstream}'], { cwd }),
    ])

    if (!remote || !mergeRef || !trackingRef) {
      return null
    }

    return {
      remote,
      mergeRef,
      trackingRef,
      name: trackingRef.replace(/^refs\/remotes\//, ''),
    }
  }
  catch {
    return null
  }
}

/**
 * The hash of the first commit of the repository, the root commit reachable
 * from HEAD. Throws when git fails. With several root commits, the hashes are
 * joined by newlines. Cached inside `withGitCache()`.
 *
 * @param cwd - Directory of the repository
 * @returns The full hash of the root commit
 * @throws The git error when git fails (not a repository, no commit yet)
 * @example
 * ```ts
 * getFirstCommit(cwd) // '9fceb02d0ae598e95dc970b74767f19372d61af8'
 * ```
 */
export function getFirstCommit(cwd: string): string {
  return cachedGitRead({
    key: ['first-commit'],
    cwd,
    read: () => {
      return runGitSync(['rev-list', '--max-parents=0', 'HEAD'], { cwd })
    },
  })
}

/**
 * The name of the current branch (`HEAD` on a detached HEAD). Throws when git
 * fails (not a repository, no commit yet). Cached inside `withGitCache()`.
 *
 * @param cwd - Directory of the repository
 * @returns The branch name, e.g. `main`, or `HEAD`
 * @throws The git error when git fails
 * @example
 * ```ts
 * getCurrentGitBranch(cwd) // 'main'
 * ```
 */
export function getCurrentGitBranch(cwd: string): string {
  return cachedGitRead({
    key: ['current-branch'],
    cwd,
    read: () => {
      return runGitSync(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd })
    },
  })
}

/**
 * The current branch, or `HEAD` when detached (same as `getCurrentGitBranch`, with `HEAD` also for an empty result). Not cached by itself, it reads through `getCurrentGitBranch`.
 *
 * @param cwd - Directory of the repository
 * @returns The branch name, or `HEAD`
 * @throws The git error when git fails
 */
export function getCurrentGitRef(cwd: string): string {
  const branch = getCurrentGitBranch(cwd)
  return branch || 'HEAD'
}

/**
 * The full hash of HEAD, undefined outside a git repository or before the first commit
 *
 * @param cwd - Directory of the repository
 * @returns The full hash as printed by `git rev-parse HEAD`, or undefined; never throws
 * @example
 * ```ts
 * getHeadCommit(cwd) // '9fceb02d0ae598e95dc970b74767f19372d61af8'
 * ```
 */
export function getHeadCommit(cwd: string): string | undefined {
  return tryGitSync(['rev-parse', 'HEAD'], { cwd }) || undefined
}

/**
 * The abbreviated hash of HEAD. Throws when git fails.
 *
 * @param cwd - Directory of the repository
 * @param length - Minimum number of characters, 7 by default (git can return more to stay unique)
 * @returns The abbreviated hash
 * @throws The git error when git fails (not a repository, no commit yet)
 * @example
 * ```ts
 * getShortCommitSha(cwd) // '9fceb02'
 * ```
 */
export function getShortCommitSha(cwd: string, length = 7): string {
  return runGitSync(['rev-parse', `--short=${length}`, 'HEAD'], { cwd })
}

/**
 * The git provider of the `origin` remote, from its URL: `github` for
 * `github.com`, `gitlab` for a URL containing `gitlab`, `bitbucket` for one
 * containing `bitbucket`.
 *
 * @param cwd - Directory of the repository, `process.cwd()` by default
 * @returns The provider, or null when the URL matches none or there is no `origin` remote (also when git fails)
 * @example
 * ```ts
 * detectGitProvider(cwd) // 'github' for git@github.com:org/repo.git
 * ```
 */
export function detectGitProvider(cwd: string = process.cwd()): GitProvider | null {
  try {
    const remoteUrl = runGitSync(['remote', 'get-url', 'origin'], { cwd })

    if (remoteUrl.includes('github.com')) {
      return 'github'
    }

    if (remoteUrl.includes('gitlab.com') || remoteUrl.includes('gitlab')) {
      return 'gitlab'
    }

    if (remoteUrl.includes('bitbucket.org') || remoteUrl.includes('bitbucket')) {
      return 'bitbucket'
    }

    return null
  }
  catch {
    return null
  }
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
  return path.length > 1 && path.startsWith('"') && path.endsWith('"')
    ? path.slice(1, -1)
    : path
}

/** A file line of the `--name-status` list: its status (`M`, `A`, `R100`...) and its paths (old then new for renames and copies) */
export interface NameStatusEntry {
  /** The status letter, followed by the similarity score for renames and copies (`M`, `A`, `D`, `R100`...) */
  status: string
  /** The paths of the line, without git quotes: one, or the old then the new path for a rename or a copy */
  paths: string[]
}

/**
 * The file lines of the `--name-status` list `getGitDiff` appends to a commit
 * body (`M\tpath/to/file`, `R100\told\tnew`).
 *
 * @param body - The body of a commit as returned by `getGitDiff`
 * @returns One entry per file line, in order; lines that are not file lines are ignored
 * @example
 * ```ts
 * parseNameStatus('Fix the cache\n\nM\tsrc/a.ts\nR100\told.ts\tnew.ts')
 * // [
 * //   { status: 'M', paths: ['src/a.ts'] },
 * //   { status: 'R100', paths: ['old.ts', 'new.ts'] },
 * // ]
 * ```
 */
export function parseNameStatus(body: string): NameStatusEntry[] {
  return body
    .split('\n')
    .filter(line => NAME_STATUS_LINE.test(line))
    .map((line) => {
      const [status = '', ...paths] = line.split('\t')

      return {
        status,
        paths: paths.map(path => unquoteGitPath(path.trim())).filter(Boolean),
      }
    })
    .filter(entry => entry.paths.length > 0)
}

/**
 * The text of a commit body without the `--name-status` list git writes after
 * it: the last block of lines, after a blank line. A line of the text that
 * looks like a file line is kept.
 *
 * @param body - The body of a commit as returned by `getGitDiff`
 * @returns The body without the trailing file lines, trailing whitespace of the body removed
 * @example
 * ```ts
 * stripNameStatus('Fix the cache\n\nM\tsrc/a.ts')
 * // 'Fix the cache\n'
 * ```
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
 * Drop-in replacement for changelogen's `getGitDiff`, which splits the
 * `git log` output on `----\n` and the subject line on `|`. A commit body
 * containing a `----` line (GitHub adds `---------` before the
 * `Co-authored-by:` trailers of a squash merge) then loses its trailers and its
 * `--name-status` file list, and a subject containing `|` is truncated.
 *
 * Reads `git log <from>...<to>` (the whole history of `to` without `from`),
 * newest first, each commit body ending with its `--name-status` file list
 * (see `parseNameStatus` and `stripNameStatus`). Throws when git fails (unknown
 * ref). The result is cached inside `withGitCache()` and a copy is returned
 * each time. Inside `withSimulatedSquash`, the commits of the simulated pull
 * request are replaced by the squash commit.
 *
 * @param from - The ref to start after (excluded); the whole history of `to` when undefined
 * @param to - The ref to read up to, `HEAD` by default
 * @param cwd - Directory of the repository, the current directory by default
 * @returns The raw commits with `message` (subject), `shortHash`, `author` (`name`, `email`) and `body`
 * @throws The git error (secrets redacted) when `git log` fails, e.g. an unknown ref
 * @example
 * ```ts
 * const commits = getGitDiff('v1.0.0', 'HEAD', cwd)
 * // [{ message: 'feat: add x', shortHash: 'a1b2c3d', author: { name: 'Jane', email: 'jane@example.com' }, body: '...' }]
 * ```
 */
export function getGitDiff(from: string | undefined, to = 'HEAD', cwd?: string): RawGitCommit[] {
  const range = from
    ? `${from}...${to}`
    : to
  // The same range is read for each package and each step: parsed once, a copy returned to each caller
  const commits = cachedGitRead({
    key: ['log', range],
    cwd,
    read: () => readGitLog(range, cwd),
  })

  // The merge preview of a pull request squashes its commits, as a squash merge will
  return applySimulatedSquash(commits.map(commit => ({
    ...commit,
    author: { ...commit.author },
  })))
}

function readGitLog(range: string, cwd?: string): RawGitCommit[] {
  // The default buffer of `runGitSync` (1 GB) holds the whole history of a new package in a large repository
  const output = runGitSync([
    '--no-pager',
    'log',
    range,
    '--pretty=%x1E%s%x1F%h%x1F%an%x1F%ae%n%b',
    '--name-status',
  ], { cwd })

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
