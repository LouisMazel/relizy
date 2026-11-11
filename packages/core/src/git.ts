import type { GitUpstream } from './git-refs'
import type { CoreLogger } from './types'
import { isPushRejectedAsBehind } from './ci'
import { isInCI } from './ci-env'
import { plural } from './format'
import { clearGitCache } from './git-cache'
import { formatGitCommand, runGit, tryGit } from './git-exec'
import { getGitStatus, getGitUpstream, isAncestor, tagExists } from './git-refs'

/**
 * Git writes and checks of a release: the working directory, the commit, the
 * tags, the push, and the state of the branch against its remote. The commit
 * message, the tag names and the options are given by the caller.
 */

const GIT_STATUS_LABELS: Record<string, string> = {
  '?': 'new',
  'A': 'added',
  'M': 'modified',
  'D': 'deleted',
  'R': 'renamed',
  'C': 'copied',
  'U': 'conflict',
}

/** An uncommitted change of the working directory */
export interface GitStatusChange {
  /** The path of the file, relative to the repository root (the new path of a rename) */
  path: string
  /** What changed: `new`, `added`, `modified`, `deleted`, `renamed`, `copied`, `conflict` or `changed` */
  change: string
}

/**
 * The uncommitted changes of `git status --porcelain`: the path of each file
 * and what changed. Give the output untrimmed (`getGitStatus(cwd, false)`):
 * the first column of the first line is significant.
 *
 * @param status - The output of `git status --porcelain`, one line per file
 * @returns One entry per non-empty line; for a rename (`old -> new`) the new path, quotes removed; an unknown status code gives `changed`
 * @example
 * ```ts
 * parseGitStatus(' M src/a.ts\n?? notes.md\nR  old.ts -> new.ts')
 * // [
 * //   { path: 'src/a.ts', change: 'modified' },
 * //   { path: 'notes.md', change: 'new' },
 * //   { path: 'new.ts', change: 'renamed' },
 * // ]
 * ```
 */
export function parseGitStatus(status: string): GitStatusChange[] {
  return status.split('\n').filter(line => line.trim()).map((line) => {
    const code = line.slice(0, 2).trim()[0] ?? 'M'
    const path = line.slice(3).split(' -> ').at(-1)!.replace(/^"|"$/g, '')

    return { path, change: GIT_STATUS_LABELS[code] ?? 'changed' }
  })
}

/**
 * Throws when the working directory has uncommitted changes, with the first
 * ones in the message (every file goes to the debug log). Returns nothing when
 * the working directory is clean.
 *
 * @param options - The options
 * @param options.cwd - Directory of the repository
 * @param options.logger - Receives the debug logs
 * @throws Error `Uncommitted changes: <path> (<change>), ...` (the first 3 files, then `and N more`) followed by a hint to commit, stash or use `--no-clean`; also throws when git fails (not a repository)
 * @example
 * ```ts
 * checkGitStatusIfDirty({ cwd: '/path/to/repo' })
 * // throws Error: Uncommitted changes: src/a.ts (modified), notes.md (new)
 * ```
 */
export function checkGitStatusIfDirty({ cwd, logger }: { cwd: string, logger?: CoreLogger }): void {
  logger?.debug?.('Checking git status')

  // Untrimmed: the first column of the first line is significant
  const changes = parseGitStatus(getGitStatus(cwd, false))

  if (changes.length > 0) {
    const names = changes.map(({ path, change }) => `${path} (${change})`)
    // Every file in the log, the first ones in the error
    logger?.debug?.(`Uncommitted changes: ${names.join(', ')}`)
    const files = names.slice(0, 3).join(', ') + (names.length > 3
      ? `, and ${names.length - 3} more`
      : '')

    throw new Error(`Uncommitted changes: ${files}\nCommit or stash them first, or keep them with --no-clean.`)
  }
}

/**
 * Fetch the tags of the remote (`git fetch --tags`), and go on with the local
 * ones when it fails (the tags might already exist locally). Never throws, and
 * clears the git cache.
 *
 * Runs `git fetch --tags` and clears the git cache.
 *
 * @param options - The options, all optional
 * @param options.cwd - Directory of the repository, the current directory by default
 * @param options.logger - Receives the debug, failure and info logs
 * @example
 * ```ts
 * await fetchGitTags({ cwd })
 * ```
 */
export async function fetchGitTags({ cwd, logger }: { cwd?: string, logger?: CoreLogger } = {}): Promise<void> {
  logger?.debug?.('Fetching git tags from remote')
  try {
    await runGit(['fetch', '--tags'], { cwd })
    logger?.debug?.('Git tags fetched successfully')
  }
  catch (error) {
    logger?.fail?.('Failed to fetch some git tags from remote (tags might already exist locally)', error)
    logger?.info?.('Continuing with local tags')
  }

  clearGitCache()
}

/**
 * Commit the staged files (`git commit -m <message>`). With `dryRun`, only logs
 * the command. Throws when git fails (nothing staged, a hook rejects...), and
 * clears the git cache.
 *
 * @param options - The options
 * @param options.message - The title of the commit
 * @param options.body - The body of the commit, in its own paragraph
 * @param options.noVerify - Skip the git hooks of the commit (`--no-verify`), false by default
 * @param options.dryRun - Only log the command, false by default
 * @param options.cwd - Directory of the repository, the current directory by default
 * @param options.logger - Receives the logs
 * @throws The git error (secrets redacted, stderr in the message) when `git commit` fails
 * @example
 * ```ts
 * await createGitCommit({ message: 'chore(release): v1.2.0', cwd, noVerify: true })
 * ```
 */
export async function createGitCommit({
  message,
  body,
  noVerify = false,
  dryRun = false,
  cwd,
  logger,
}: {
  /** The title of the commit */
  message: string
  /** The body of the commit, in its own paragraph */
  body?: string
  /** Skip the git hooks of the commit (`--no-verify`) */
  noVerify?: boolean
  /** Only log the command without running it */
  dryRun?: boolean
  /** Directory of the repository, the current directory by default */
  cwd?: string
  /** Receives the debug, info (dry-run) and success logs */
  logger?: CoreLogger
}): Promise<void> {
  logger?.debug?.(`No verify: ${noVerify}`)

  const commitArgs = [
    'commit',
    ...(noVerify
      ? ['--no-verify']
      : []),
    '-m',
    message,
    ...(body
      ? ['-m', body]
      : []),
  ]

  if (dryRun) {
    logger?.info?.(`[dry-run] ${formatGitCommand(commitArgs)}`)
    return
  }

  logger?.debug?.(`Executing: ${formatGitCommand(commitArgs)}`)
  await runGit(commitArgs, { cwd })
  clearGitCache()
  logger?.success?.(`Committed: ${message}${noVerify ? ' (--no-verify)' : ''}`)
}

/** An annotated tag to create */
export interface GitTagToCreate {
  /** The name of the tag, e.g. `v1.2.0` */
  name: string
  /** The message of the tag, its name by default */
  message?: string
}

async function createGitTag(
  { name: tagName, message }: GitTagToCreate,
  { sign, dryRun, cwd, logger }: { sign?: boolean, dryRun: boolean, cwd?: string, logger?: CoreLogger },
): Promise<void> {
  const tagArgs = [
    'tag',
    ...(sign
      ? ['-s']
      : []),
    '-a',
    tagName,
    '-m',
    message || tagName,
  ]

  if (dryRun) {
    logger?.info?.(`[dry-run] ${formatGitCommand(tagArgs)}`)
    return
  }

  logger?.debug?.(`Executing: ${formatGitCommand(tagArgs)}`)
  try {
    await runGit(tagArgs, { cwd })
    clearGitCache()
    logger?.debug?.(`Tag created: ${tagName}`)
  }
  catch (error) {
    logger?.error?.(`Failed to create tag ${tagName}:`, error)
    throw error
  }
}

/**
 * Create annotated tags (`git tag -a <name> -m <message>`) on HEAD, returns their names. Clears the git cache after each tag. With `dryRun`, only logs
 * the commands. Throws on the first tag that cannot be created (for example one
 * that already exists); the tags created before stay.
 *
 * @param options - The options
 * @param options.tags - The tags to create, in order
 * @param options.sign - Sign the tags (`git tag -s`), false by default
 * @param options.dryRun - Only log the commands, false by default
 * @param options.cwd - Directory of the repository, the current directory by default
 * @param options.logger - Receives the logs
 * @returns The names of the tags, in the order of `tags` (also in dry-run, where none is created)
 * @throws The git error (secrets redacted) of the first tag that fails, after logging it
 * @example
 * ```ts
 * await createGitTags({ tags: [{ name: 'v1.2.0', message: 'Release v1.2.0' }], cwd })
 * // ['v1.2.0']
 * ```
 */
export async function createGitTags({
  tags,
  sign,
  dryRun = false,
  cwd,
  logger,
}: {
  /** The tags to create, in order; the message of each defaults to its name */
  tags: GitTagToCreate[]
  /** Sign the tags (`git tag -s`) */
  sign?: boolean
  /** Only log the commands without running them */
  dryRun?: boolean
  /** Directory of the repository, the current directory by default */
  cwd?: string
  /** Receives the debug, info (dry-run), error and success logs */
  logger?: CoreLogger
}): Promise<string[]> {
  logger?.debug?.(`Sign tags: ${sign}`)
  const createdTags: string[] = []

  logger?.debug?.(`Creating ${tags.length} tag(s)`)

  for (const tag of tags) {
    await createGitTag(tag, { sign, dryRun, cwd, logger })
    createdTags.push(tag.name)
  }

  if (createdTags.length > 1) {
    logger?.success?.(`Created ${createdTags.length} tags, ${createdTags.join(', ')}`)
  }

  logger?.debug?.('Created Tags:', createdTags.join(', '))

  return createdTags
}

async function fetchUpstream(upstream: GitUpstream, cwd: string): Promise<void> {
  await runGit(['fetch', upstream.remote, `+${upstream.mergeRef}:${upstream.trackingRef}`], { cwd })
  clearGitCache()
}

/**
 * Thrown by `assertBranchUpToDateWithRemote` when the current branch misses
 * commits of its upstream branch, pushed after the run started. The message
 * tells how to fix it, differently in CI and locally (`inCI` defaults to
 * `isInCI()`).
 */
export class BranchBehindRemoteError extends Error {
  override name = 'BranchBehindRemoteError'

  /**
   * Builds the error; `upstream` and `missingCommits` are kept as readonly properties.
   *
   * @param upstream - The short remote-tracking name, e.g. `origin/main`
   * @param missingCommits - The number of commits of the upstream the branch does not have
   * @param inCI - Whether to word the fix for a CI job, detected by default
   */
  constructor(readonly upstream: string, readonly missingCommits: number, inCI = isInCI()) {
    const commits = plural(missingCommits, 'commit')
    super(inCI
      ? `The current branch is behind "${upstream}" by ${commits}, pushed after this job checked out the branch: the release commit would not be pushed.\n`
      + `Fix: run the job again on the latest commit of "${upstream}".`
      : `The current branch is behind "${upstream}" by ${commits} that this checkout does not have: the release commit would not be pushed.\n`
        + 'Fix: get them with "git pull --rebase", then run the release again.')
  }
}

/**
 * Ensure the current branch contains every commit of its remote counterpart.
 *
 * A release commit created on a branch that is behind its remote can never be
 * pushed. Since packages are published before the push, running this check
 * right before publishing prevents shipping a version whose release commit is
 * then rejected (leaving an orphan tag and the repository stuck on the
 * previous version).
 *
 * Skipped (no error) on a detached HEAD, without upstream, or when the remote
 * cannot be fetched. Throws a `BranchBehindRemoteError` when the branch is behind.
 * Fetches the upstream branch into its remote-tracking ref and clears the git cache.
 *
 * @param options - The options
 * @param options.cwd - Directory of the repository
 * @param options.logger - Receives the debug and warning logs
 * @throws BranchBehindRemoteError when `HEAD..<upstream>` contains at least one commit
 * @example
 * ```ts
 * await assertBranchUpToDateWithRemote({ cwd }) // throws BranchBehindRemoteError when behind
 * ```
 */
export async function assertBranchUpToDateWithRemote({ cwd, logger }: { cwd: string, logger?: CoreLogger }): Promise<void> {
  const upstream = await getGitUpstream(cwd)

  if (!upstream) {
    logger?.debug?.('No upstream branch configured, skipping remote sync check')
    return
  }

  try {
    await fetchUpstream(upstream, cwd)
  }
  catch (error) {
    logger?.warn?.(`Could not fetch "${upstream.name}", skipping remote sync check`)
    logger?.debug?.('Fetch error:', error)
    return
  }

  const count = await runGit(['rev-list', '--count', `HEAD..${upstream.trackingRef}`], { cwd })
  const missingCommits = Number.parseInt(count, 10) || 0

  if (missingCommits > 0) {
    throw new BranchBehindRemoteError(upstream.name, missingCommits)
  }

  logger?.debug?.(`Branch is up to date with "${upstream.name}"`)
}

/**
 * Recover from a push rejected because the remote branch received new commits
 * after the release started: merge the remote branch into the release commit
 * and push again. A merge (not a rebase) keeps the tags on the exact commit
 * that was published, and keeps the concurrent commits out of the released
 * range so they show up in the next changelog.
 */
async function recoverRejectedPush({
  pushArgs,
  tags,
  pushError,
  noVerify,
  cwd,
  logger,
}: {
  pushArgs: string[]
  tags: string[]
  pushError: unknown
  noVerify: boolean
  cwd: string
  logger?: CoreLogger
}): Promise<void> {
  const upstream = await getGitUpstream(cwd)

  if (!upstream) {
    throw pushError
  }

  logger?.warn?.(`Push rejected: "${upstream.name}" received new commits during the release. Merging them into the release commit and retrying...`)

  try {
    await fetchUpstream(upstream, cwd)
    await runGit([
      'merge',
      '--no-edit',
      ...(noVerify
        ? ['--no-verify']
        : []),
      upstream.name,
    ], { cwd })
    clearGitCache()
  }
  catch (mergeError) {
    await tryGit(['merge', '--abort'], { cwd })

    if (tags.length > 0) {
      await tryGit([
        'push',
        upstream.remote,
        ...tags.map(tag => `refs/tags/${tag}`),
      ], { cwd })
    }

    const recoverRef = tags[0] ?? 'HEAD'

    throw new Error(
      `Push rejected: "${upstream.name}" received new commits during the release, and they could not be merged automatically into the release commit.\n`
      + 'The packages are already published, but the release commit is not on the branch.\n'
      + `To recover, merge it manually: git fetch --tags && git merge ${recoverRef} && git push`,
      { cause: mergeError },
    )
  }

  await runGit(pushArgs, { cwd })

  logger?.success?.(`Merged "${upstream.name}" into the release commit and pushed`)
}

/**
 * Push the release commit, and its tags with `followTags`. When the push is
 * rejected because the remote branch moved, merges it into the release commit
 * and pushes again; if the merge fails, pushes the `tags` alone and throws
 * how to recover. With `dryRun`, only logs the command. Any other push failure
 * is logged and rethrown.
 *
 * @param options - The options
 * @param options.cwd - Directory of the repository
 * @param options.followTags - Push the annotated tags reachable from the pushed commits (`--follow-tags`), false by default
 * @param options.noVerify - Skip the git hooks of the merge made to recover a rejected push, false by default
 * @param options.dryRun - Only log the command, false by default
 * @param options.tags - The tags of the release, pushed alone when the rejected push cannot be recovered
 * @param options.beforePush - Runs before the push (not in dry-run), e.g. to check the access to the remote
 * @param options.logger - Receives the debug, info (dry-run), warning, error and success logs
 * @throws The git error (logged first) when the push fails for another reason than a rejection as behind, and that rejection when the branch has no upstream; an Error describing the manual recovery (`git fetch --tags && git merge <tag> && git push`) when merging the remote branch fails
 * @example
 * ```ts
 * await pushGitChanges({ cwd, followTags: true, tags: ['v1.2.0'] })
 * ```
 */
export async function pushGitChanges({
  cwd,
  followTags = false,
  noVerify = false,
  dryRun = false,
  tags = [],
  beforePush,
  logger,
}: {
  /** Directory of the repository */
  cwd: string
  /** Push the annotated tags reachable from the pushed commits (`--follow-tags`) */
  followTags?: boolean
  /** Skip the git hooks of the merge made to recover a rejected push */
  noVerify?: boolean
  /** Only log the command without running it */
  dryRun?: boolean
  /** The tags of the release, pushed alone when the rejected push cannot be recovered */
  tags?: string[]
  /** Runs before the push (not in dry-run), e.g. to check the access to the remote */
  beforePush?: () => void | Promise<void>
  /** Receives the debug, info (dry-run), warning, error and success logs */
  logger?: CoreLogger
}): Promise<void> {
  const pushArgs = followTags
    ? ['push', '--follow-tags']
    : ['push']
  const command = formatGitCommand(pushArgs)

  if (dryRun) {
    logger?.info?.(`[dry-run] ${command}`)
    return
  }

  logger?.debug?.(`Executing: ${command}`)

  await beforePush?.()

  try {
    await runGit(pushArgs, { cwd })
  }
  catch (error) {
    if (!isPushRejectedAsBehind(error)) {
      logger?.error?.(`${command} failed`, error)
      throw error
    }

    await recoverRejectedPush({
      pushArgs,
      tags,
      pushError: error,
      noVerify,
      cwd,
      logger,
    })
  }
}

/**
 * Fail early when a tag a release is about to create already exists.
 *
 * This typically happens after a release that published its packages and
 * pushed its tag, but whose release commit was rejected: the branch is still
 * on the previous version, so the next run computes the same version again.
 *
 * Throws, for the first existing tag, an error telling the package versions are
 * behind the release when the tag is in the history of HEAD, or how to merge
 * the release commit when it is not. Returns nothing when no tag exists.
 *
 * @param options - The options
 * @param options.tags - The names of the tags the release is about to create
 * @param options.cwd - Directory of the repository
 * @throws Error `Tag "<tag>" already exists...` for the first tag that exists locally (two different messages, see above)
 * @example
 * ```ts
 * await assertReleaseTagsAvailable({ tags: ['v1.2.0'], cwd })
 * // throws Error: Tag "v1.2.0" already exists. ...
 * ```
 */
export async function assertReleaseTagsAvailable({ tags, cwd }: { tags: string[], cwd: string }): Promise<void> {
  for (const tag of tags) {
    if (!(await tagExists(tag, cwd))) {
      continue
    }

    if (await isAncestor(tag, 'HEAD', cwd)) {
      throw new Error(`Tag "${tag}" already exists. Check the versions in your package.json files, they are behind the latest release.`)
    }

    throw new Error(
      `Tag "${tag}" already exists but is not part of the current branch history.\n`
      + 'A previous release most likely published this version and pushed its tag, but its release commit was never pushed to the branch.\n'
      + `To recover, merge the release commit, then re-run the release: git fetch --tags && git merge ${tag} && git push`,
    )
  }
}
