import type { LogLevel } from '@maz-ui/node'
import { execPromise } from '@maz-ui/node'

/**
 * Low-level git ref/tag helpers. This module is intentionally a leaf (it only
 * depends on `@maz-ui/node`) so it can be imported from anywhere -- including
 * `rewritten-tags.ts` -- without creating an import cycle through `repo.ts`.
 */

/**
 * Wrap a value in single quotes for safe shell interpolation.
 * Single quotes preserve everything literally; embedded single quotes are
 * escaped via the `'\''` idiom. Used for refs, tags and commit subjects that
 * may contain `(`, `)`, `:`, spaces, etc.
 */
function shellSingleQuote(value: string): string {
  return `'${value.replaceAll('\'', '\'\\\'\'')}'`
}

/**
 * Returns true when `ancestor` is an ancestor of `descendant` (i.e. reachable
 * from it). Uses `git merge-base --is-ancestor`, which exits 0 when true and
 * non-zero otherwise. Any error (e.g. unknown ref) is treated as "not an
 * ancestor".
 */
export async function isAncestor(ancestor: string, descendant: string, cwd?: string): Promise<boolean> {
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
export async function tagExists(tag: string, cwd?: string): Promise<boolean> {
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
