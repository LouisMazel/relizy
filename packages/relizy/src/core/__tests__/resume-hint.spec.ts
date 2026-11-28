import { describeResumeHint } from '../resume-hint'

describe('Given a release that failed', () => {
  it('When it published versions before the end of the push, Then tells to re-run the same commit with --skip-existing-versions', () => {
    expect(describeResumeHint({ failedStep: 'Push', published: 2, startCommit: 'abcdef1234567' }))
      .toBe('2 versions are already published. To resume, re-run the release from commit abcdef1 (the same commit, never after new commits) with --skip-existing-versions. See https://relizy.dev/guide/resume-a-release')
    expect(describeResumeHint({
      failedStep: 'Publish',
      published: 1,
      startCommit: 'abcdef1234567',
      githubActions: true,
    }))
      .toBe('1 version is already published. To resume, re-run the release from commit abcdef1 (the same commit, never after new commits) with --skip-existing-versions. In GitHub Actions: "Re-run failed jobs". See https://relizy.dev/guide/resume-a-release')
  })

  it.each([
    { failedStep: 'Publish', published: 0 },
    { failedStep: 'Bump', published: 0 },
    { failedStep: 'Provider release', published: 3 },
    { failedStep: 'Social media', published: 1 },
  ])('When it failed at $failedStep with $published published, Then there is nothing to resume this way', (failure) => {
    expect(describeResumeHint(failure)).toBeUndefined()
  })
})
