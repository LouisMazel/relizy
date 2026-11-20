import type { CommitlintResult } from '@relizy/core'
import type { CommitlintTitleMode } from '../../types'
import type { MergeSquashDetection } from '../merge-preview/squash'

/** How the title and the commits of a pull/merge request are linted */
export interface PullRequestLint {
  /** Severity of the problems of the title, `off` when it is not linted */
  title: 'error' | 'warn' | 'off'
  /** Severity of the errors of the commits: `warn` when a squash merge does not keep them */
  commits: 'error' | 'warn'
  /** Why the title or the commits are only linted as warnings, for the report */
  note?: string
}

/**
 * The mode of `commitlint.title`: `true` is `'error'`, `false` is `'off'`.
 * @param value - `commitlint.title` or `--title`
 * @returns The mode, `'auto'` when unset
 */
export function getTitleMode(value: CommitlintTitleMode | boolean | undefined): CommitlintTitleMode {
  if (value === true) {
    return 'error'
  }
  if (value === false) {
    return 'off'
  }
  return value ?? 'auto'
}

/**
 * How to lint a pull/merge request: what lands on the target branch fails the
 * check, what may land only warns. With `auto`, a squash merge keeps the title
 * (errors) and drops the commits (warnings), a merge without squash keeps the
 * commits (the title is not linted), an unknown merge method keeps the commits
 * and maybe the title (warnings). The other modes set the level of the title,
 * the commits stay errors.
 * @param options - The mode and what is known of the merge
 * @param options.mode - `commitlint.title`
 * @param options.detection - Whether the merge squashes, `undefined` outside a pull request
 * @param options.titleFromCommit - A squash merge takes the message of the only commit, not the title
 * @param options.kind - `pull request` or `merge request`, for the note
 */
export function resolvePullRequestLint({ mode, detection, titleFromCommit = false, kind = 'pull request' }: {
  mode: CommitlintTitleMode
  detection?: MergeSquashDetection
  titleFromCommit?: boolean
  kind?: 'pull request' | 'merge request'
}): PullRequestLint {
  if (mode !== 'auto') {
    return { title: mode, commits: 'error' }
  }

  // The title never becomes a commit: a merge keeps the commits, a squash takes the message of the only one
  if (detection?.squash === false || titleFromCommit) {
    return { title: 'off', commits: 'error' }
  }

  const reason = detection?.reason ?? `the merge method of the ${kind} is unknown`
  if (detection?.squash) {
    return {
      title: 'error',
      commits: 'warn',
      note: `squash merge (${reason}): the merge only keeps the ${kind} title, the problems of its commits are warnings`,
    }
  }

  return {
    title: 'warn',
    commits: 'error',
    note: `merge method unknown (${reason}): the ${kind} title becomes the commit of a squash merge, its problems are warnings`,
  }
}

/**
 * The result with its errors turned into warnings: it does not fail the check
 * @param result - The lint of a message
 * @returns A valid result, or the result itself when it has no error
 */
export function toWarnings(result: CommitlintResult): CommitlintResult {
  if (!result.problems.some(problem => problem.severity === 'error')) {
    return result
  }

  return {
    ...result,
    valid: true,
    problems: result.problems.map(problem => ({ ...problem, severity: 'warn' })),
  }
}
