import { findReachableCommitBySubject, getCommitSubject, isAncestor, tagExists } from './git-refs'

/**
 * Where a tag stands against a ref, see `detectRewrittenTag`:
 * - `missing`: no such tag (a SHA, a branch name... are not tags);
 * - `reachable`: the commit of the tag is in the history of the ref;
 * - `rewritten`: the commit of the tag is no longer in the history of the ref,
 *   most likely rewritten by a rebase after the tag was created, or never
 *   pushed (rejected push of a release).
 */
export type RewrittenTagCheck
  = | { status: 'missing' }
    | { status: 'reachable' }
    | {
      status: 'rewritten'
      /** The subject of the commit the tag points to, `null` when it cannot be read */
      subject: string | null
      /** The most recent commit of the ref with the same subject (the rewritten twin of the tagged commit), `null` when none */
      twin: string | null
    }

/**
 * Whether a tag points to a commit that is no longer reachable from `to`
 * (a rewritten or orphaned tag), and the equivalent commit of `to` when there
 * is one. Reads git only: nothing is moved, see `retagAnnotatedLocal` and
 * `pushTagForce` to correct the tag.
 *
 * @param options - Tag and ref to compare.
 * @param options.tag - Name of the tag to check.
 * @param options.to - Ref (branch, SHA, `HEAD`...) whose history the tag commit must belong to.
 * @param options.cwd - Directory of the git repository (the current directory by default).
 * @returns `missing` when the tag does not exist, `reachable` when its commit is an ancestor of `to`, else `rewritten` with the subject of the tagged commit and its twin in `to` (both `null` when not found).
 * @example
 * ```ts
 * const check = await detectRewrittenTag({ tag: 'v1.2.0', to: 'main' })
 * if (check.status === 'rewritten' && check.twin) {
 *   // check.twin is the commit of main with the same subject as the tagged one
 * }
 * ```
 */
export async function detectRewrittenTag({ tag, to, cwd }: { tag: string, to: string, cwd?: string }): Promise<RewrittenTagCheck> {
  if (!(await tagExists(tag, cwd))) {
    return { status: 'missing' }
  }

  if (await isAncestor(tag, to, cwd)) {
    return { status: 'reachable' }
  }

  const subject = await getCommitSubject(tag, cwd)
  const twin = subject
    ? await findReachableCommitBySubject(subject, to, cwd)
    : null

  return { status: 'rewritten', subject, twin }
}
