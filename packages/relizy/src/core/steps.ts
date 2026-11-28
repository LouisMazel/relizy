/**
 * The steps of a release, named as the steps of the hooks (`before:bump`,
 * `success:commit-and-tag`...): the names of the progress events and of the
 * steps of the release preview.
 */
export type ReleaseStepId = 'checks' | 'bump' | 'changelog' | 'publish' | 'commit-and-tag' | 'push' | 'sync' | 'provider-release' | 'approve' | 'social' | 'pr-comment'

/** Every step, in the order of the release, checked by the type: a new step must be listed here */
const STEP_ORDER: Record<ReleaseStepId, true> = {
  'checks': true,
  'bump': true,
  'changelog': true,
  'publish': true,
  'commit-and-tag': true,
  'push': true,
  'sync': true,
  'provider-release': true,
  // Only with publish.staged: the approval of the staged versions, before the posts
  'approve': true,
  'social': true,
  'pr-comment': true,
}

export const RELEASE_STEPS = Object.keys(STEP_ORDER) as readonly ReleaseStepId[]

/** The steps of the other commands that are not a step of the release: `relizy merge-preview`, `relizy stage list` and `reject`, `relizy trust` */
export type CommandStepId = ReleaseStepId | 'merge-preview' | 'list' | 'reject' | 'trust'

export const RELEASE_STEP_LABELS: Record<ReleaseStepId, string> = {
  'checks': 'Safety checks',
  'bump': 'Bump the versions',
  'changelog': 'Write the changelogs',
  'publish': 'Publish to the registry',
  'commit-and-tag': 'Commit and tag',
  'push': 'Push',
  'sync': 'Sync the branches',
  'provider-release': 'GitHub/GitLab release',
  'approve': 'Approve the staged versions',
  'social': 'Social posts',
  'pr-comment': 'Comment the pull request',
}
