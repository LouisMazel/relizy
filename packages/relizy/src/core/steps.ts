/**
 * The steps of a release, named as the steps of the hooks (`before:bump`,
 * `success:commit-and-tag`...): the names of the progress events and of the
 * steps of the release preview.
 */
export const RELEASE_STEPS = [
  'checks',
  'bump',
  'changelog',
  'publish',
  'commit-and-tag',
  'push',
  'provider-release',
  'social',
  'pr-comment',
] as const

export type ReleaseStepId = typeof RELEASE_STEPS[number]

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
