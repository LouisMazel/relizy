/**
 * The steps of a release, named as the steps of the hooks (`before:bump`,
 * `success:commit-and-tag`...): the names of the progress events and of the
 * steps of the release preview.
 */
export type ReleaseStepId = 'checks' | 'bump' | 'changelog' | 'publish' | 'commit-and-tag' | 'push' | 'provider-release' | 'social' | 'pr-comment'

/** Every step, in the order of the release, checked by the type: a new step must be listed here */
const STEP_ORDER: Record<ReleaseStepId, true> = {
  'checks': true,
  'bump': true,
  'changelog': true,
  'publish': true,
  'commit-and-tag': true,
  'push': true,
  'provider-release': true,
  'social': true,
  'pr-comment': true,
}

export const RELEASE_STEPS = Object.keys(STEP_ORDER) as readonly ReleaseStepId[]

/** The steps of the other commands that are not a step of the release */
export type CommandStepId = ReleaseStepId | 'merge-preview'

export const RELEASE_STEP_LABELS: Record<ReleaseStepId, string> = {
  'checks': 'Safety checks',
  'bump': 'Bump the versions',
  'changelog': 'Write the changelogs',
  'publish': 'Publish to the registry',
  'commit-and-tag': 'Commit and tag',
  'push': 'Push',
  'provider-release': 'GitHub/GitLab release',
  'social': 'Social posts',
  'pr-comment': 'Comment the pull request',
}
