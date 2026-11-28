/** The guide of the recovery of a failed release */
export const RESUME_GUIDE_URL = 'https://relizy.dev/guide/resume-a-release'

/** The steps a failure leaves the published versions without their release commit nor their tags (`failedStep` of the report) */
const BEFORE_END_OF_PUSH = new Set([
  'Publish',
  'Approval',
  'Commit',
  'Push',
])

/**
 * How to resume a release that failed after publishing: re-run it from the
 * same commit with `--skip-existing-versions`, never after new commits (the
 * new commits would be tagged with versions that do not contain them). None
 * when nothing was published, or when the release failed after the push.
 */
export function describeResumeHint({ failedStep, published, startCommit, githubActions = false }: {
  /** The step running when the release failed: `failedStep` of the report */
  failedStep: string
  /** The versions published or staged before the failure */
  published: number
  /** The commit the release started from */
  startCommit?: string
  /** The release runs in GitHub Actions: its re-run keeps the commit */
  githubActions?: boolean
}): string | undefined {
  if (published === 0 || !BEFORE_END_OF_PUSH.has(failedStep)) {
    return undefined
  }

  const versions = published === 1
    ? '1 version is'
    : `${published} versions are`
  const commit = startCommit
    ? `from commit ${startCommit.slice(0, 7)} `
    : ''
  const rerun = githubActions
    ? ' In GitHub Actions: "Re-run failed jobs".'
    : ''

  return `${versions} already published. To resume, re-run the release ${commit}(the same commit, never after new commits) with --skip-existing-versions.${rerun} See ${RESUME_GUIDE_URL}`
}
