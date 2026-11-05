import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { anyHookContext, createMockConfig } from '../../../tests/mocks'
import {
  assertBranchUpToDateWithRemote,
  assertReleaseTagsAvailable,
  checkGitStatusIfDirty,
  createCommitAndTags,
  executeHook,
  fetchGitTags,
  loadRelizyConfig,
  pushCommitAndTags,
  RelizyCancelError,
  rollbackModifiedFiles,
} from '../../core'
import { recordAIRewrite } from '../../core/progress'
import { bump } from '../bump'

import { changelog } from '../changelog'
import { prComment } from '../pr-comment'
import { providerRelease } from '../provider-release'
import { publish } from '../publish'
import { release } from '../release'
import { social, socialSafetyCheck } from '../social'

vi.mock('../../core', async () => {
  const actual = await vi.importActual('../../core')
  return {
    ...actual,
    loadRelizyConfig: vi.fn(),
    executeHook: vi.fn(),
    checkGitStatusIfDirty: vi.fn(),
    fetchGitTags: vi.fn(),
    pushCommitAndTags: vi.fn(),
    assertBranchUpToDateWithRemote: vi.fn(),
    assertReleaseTagsAvailable: vi.fn(),
    rollbackModifiedFiles: vi.fn(),
    readPackageJson: vi.fn(),
    createCommitAndTags: vi.fn(),
  }
})
// The git of the summary, without the repository of the tests
vi.mock('../../core/release-facts', async importActual => ({
  ...await importActual<typeof import('../../core/release-facts')>(),
  getReleaseGit: vi.fn(() => Promise.resolve({ branch: 'main', commit: 'a1b2c3d', remote: 'origin/main' })),
}))
vi.mock('../bump', () => ({
  bump: vi.fn(),
}))
vi.mock('../changelog', () => ({
  changelog: vi.fn(),
}))
vi.mock('../publish', () => ({
  publish: vi.fn(),
  publishSafetyCheck: vi.fn(),
}))
vi.mock('../provider-release', async importActual => ({
  describeProviderReleaseResult: (await importActual<typeof import('../provider-release')>()).describeProviderReleaseResult,
  providerRelease: vi.fn(),
  providerReleaseSafetyCheck: vi.fn(),
}))
vi.mock('../social', async importActual => ({
  describeSocialResult: (await importActual<typeof import('../social')>()).describeSocialResult,
  social: vi.fn(),
  socialSafetyCheck: vi.fn(),
}))
vi.mock('../pr-comment', () => {
  const prComment = vi.fn()
  // Test double mirroring the real gate + delegation so the assertions below can
  // keep targeting `prComment`. The real `tryPostPrComment` logic is unit-tested
  // in pr-comment.spec.ts.
  const tryPostPrComment = vi.fn(async ({ config, releaseContext, prNumber, dryRun, logLevel, configName }: any) => {
    if (!config.release.prComment) {
      return false
    }
    try {
      return await prComment({ prNumber, dryRun, logLevel, configName, config, releaseContext })
    }
    catch {
      return false
    }
  })
  return { prComment, tryPostPrComment }
})

describe('Given release command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const config = createMockConfig({
      bump: { type: 'patch' },
      release: {
        commit: true,
        changelog: true,
        publish: true,
        push: true,
        providerRelease: true,
        social: true,
        prComment: true,
        clean: true,
        noVerify: false,
        gitTag: true,
      },
      social: {
        twitter: {
          enabled: true,
        },
        slack: {
          enabled: true,
        },
      },
    })
    vi.mocked(loadRelizyConfig).mockResolvedValue(config)
    vi.mocked(executeHook).mockResolvedValue(undefined)
    vi.mocked(checkGitStatusIfDirty).mockReturnValue(undefined)
    vi.mocked(fetchGitTags).mockResolvedValue(undefined)
    vi.mocked(bump).mockResolvedValue({ newVersion: '1.0.0', bumpedPackages: [] } as any)
    vi.mocked(changelog).mockResolvedValue(undefined)
    vi.mocked(publish).mockResolvedValue(undefined)
    vi.mocked(providerRelease).mockResolvedValue({ detectedProvider: 'github', postedReleases: [] })
    vi.mocked(social).mockResolvedValue({
      results: [
        { platform: 'twitter', success: true },
        { platform: 'slack', success: true },
      ],
      hasErrors: false,
    })
    vi.mocked(prComment).mockResolvedValue(false)
    vi.mocked(createCommitAndTags).mockResolvedValue([])
  })

  describe('When running full release workflow', () => {
    it('Then loads config and executes hooks', async () => {
      await release({})

      expect(loadRelizyConfig).toHaveBeenCalled()
      expect(executeHook).toHaveBeenCalledWith('before:release', expect.any(Object), false)
    })

    it('Then runs all release steps in order', async () => {
      vi.mocked(bump).mockResolvedValue({ newVersion: '1.0.0', bumpedPackages: [], bumped: true })
      await release({})

      expect(bump).toHaveBeenCalled()
      expect(changelog).toHaveBeenCalled()
      expect(publish).toHaveBeenCalled()
      expect(providerRelease).toHaveBeenCalled()
      expect(social).toHaveBeenCalled()
    })

    it('Then checks the social config when the release posts', async () => {
      vi.mocked(bump).mockResolvedValue({ newVersion: '1.0.0', bumpedPackages: [], bumped: true })

      await release({})

      expect(socialSafetyCheck).toHaveBeenCalled()
    })

    it('Then does not check the social config with --no-social', async () => {
      const config = createMockConfig({ bump: { type: 'patch' }, social: { twitter: { enabled: true } } })
      config.release.social = false
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(bump).mockResolvedValue({ newVersion: '1.0.0', bumpedPackages: [], bumped: true })

      await release({ social: false })

      expect(socialSafetyCheck).not.toHaveBeenCalled()
    })

    it('Then forwards the targeted version groups to every step', async () => {
      vi.mocked(bump).mockResolvedValue({ newVersion: '1.0.0', bumpedPackages: [], bumped: true })

      await release({ groups: ['header'] })

      for (const step of [bump, changelog, publish, providerRelease, social]) {
        expect(step).toHaveBeenCalledWith(expect.objectContaining({ groups: ['header'] }))
      }
    })

    it('Then creates the tags of every version group that bumped', async () => {
      const nav = { name: '@scope/nav', version: '1.2.0', newVersion: '2.0.0', oldVersion: '1.2.0', path: '/nav', private: false, fromTag: '@scope/nav@1.2.0', commits: [], dependencies: [] }
      const groups = [{ name: 'header', title: 'header', versionMode: 'independent' as const, bumped: true as const, bumpedPackages: [nav] }]
      vi.mocked(bump).mockResolvedValue({ bumpedPackages: [nav], bumped: true, groups })

      await release({})

      expect(assertReleaseTagsAvailable).toHaveBeenCalledWith(expect.objectContaining({ tags: ['@scope/nav@2.0.0'] }))
      expect(createCommitAndTags).toHaveBeenCalledWith(expect.objectContaining({ groups }))
    })

    it('Then executes success hook', async () => {
      vi.mocked(bump).mockResolvedValue({ newVersion: '1.0.0', bumpedPackages: [], bumped: true })

      await release({})

      expect(executeHook).toHaveBeenNthCalledWith(
        4,
        'success:release',
        expect.any(Object),
        false,
        anyHookContext,
      )
    })

    it('Then gives the bump result and the overview of the release to the hooks after the bump', async () => {
      const bumpResult = { newVersion: '1.0.0', oldVersion: '0.9.0', bumpedPackages: [], bumped: true as const }
      vi.mocked(bump).mockResolvedValue(bumpResult)

      await release({})

      expect(executeHook).toHaveBeenCalledWith('before:release', expect.any(Object), false)
      expect(executeHook).toHaveBeenCalledWith('success:release', expect.any(Object), false, {
        bumpResult,
        release: expect.objectContaining({ groups: [expect.objectContaining({ version: '1.0.0', tag: 'v1.0.0' })] }),
      })
    })
  })

  describe('When skipping steps via config', () => {
    it('Then skips changelog when disabled', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.release = {
        commit: true,
        changelog: false,
        publish: true,
        push: true,
        providerRelease: true,
        social: true,
        prComment: true,
        clean: true,
        noVerify: false,
        gitTag: true,
      }
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await release({})

      expect(changelog).not.toHaveBeenCalled()
    })

    it('Then skips publish when disabled', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.release = {
        commit: true,
        changelog: true,
        publish: false,
        push: true,
        providerRelease: true,
        social: true,
        prComment: true,
        clean: true,
        noVerify: false,
        gitTag: true,
      }
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await release({})

      expect(publish).not.toHaveBeenCalled()
    })

    it('Then skips provider release when disabled', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.release = {
        commit: true,
        changelog: true,
        publish: true,
        push: true,
        providerRelease: false,
        social: true,
        prComment: true,
        clean: true,
        noVerify: false,
        gitTag: true,
      }
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await release({})

      expect(providerRelease).not.toHaveBeenCalled()
    })

    it('Then skips social when disabled', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.release = {
        commit: true,
        changelog: true,
        publish: true,
        push: true,
        providerRelease: true,
        social: false,
        prComment: true,
        clean: true,
        noVerify: false,
        gitTag: true,
      }
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await release({})

      expect(social).not.toHaveBeenCalled()
    })

    it('Then skips git status check when clean is disabled', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.release = {
        commit: true,
        changelog: true,
        publish: true,
        push: true,
        providerRelease: true,
        social: true,
        prComment: true,
        clean: false,
        noVerify: false,
        gitTag: true,
      }
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await release({})

      expect(checkGitStatusIfDirty).not.toHaveBeenCalled()
    })
  })

  describe('When a Slack changelog format is given', () => {
    it('Then forwards it to the social step', async () => {
      vi.mocked(bump).mockResolvedValue({ newVersion: '1.0.0', bumpedPackages: [], bumped: true })
      await release({ slackFormat: 'full' })

      expect(social).toHaveBeenCalledWith(expect.objectContaining({ slackFormat: 'full' }))
    })
  })

  describe('When in dry-run mode', () => {
    it('Then passes dryRun to all steps', async () => {
      vi.mocked(bump).mockResolvedValue({ newVersion: '1.0.0', bumpedPackages: [], bumped: true })
      await release({ dryRun: true })

      expect(bump).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))
      expect(changelog).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))
      expect(publish).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))
      expect(providerRelease).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))
      expect(social).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))
    })

    it('Then passes dryRun to hooks', async () => {
      vi.mocked(bump).mockResolvedValue({ newVersion: '1.0.0', bumpedPackages: [], bumped: true })
      await release({ dryRun: true })

      expect(executeHook).toHaveBeenCalledWith('before:release', expect.any(Object), true)
      expect(executeHook).toHaveBeenCalledWith('success:release', expect.any(Object), true, anyHookContext)
    })
  })

  describe('When error occurs', () => {
    it('Then executes error hook', async () => {
      vi.mocked(bump).mockRejectedValue(new Error('Bump failed'))

      await expect(release({})).rejects.toThrow('Bump failed')

      expect(executeHook).toHaveBeenCalledWith('error:release', expect.any(Object), false, anyHookContext)
    })

    it('Then rethrows a cancelled prompt without the error hook nor the failed PR comment', async () => {
      vi.mocked(bump).mockRejectedValue(new RelizyCancelError('Bump refused'))

      await expect(release({})).rejects.toThrow(RelizyCancelError)

      expect(executeHook).not.toHaveBeenCalledWith('error:release', expect.any(Object), false, anyHookContext)
      expect(prComment).not.toHaveBeenCalled()
    })

    it('Then stops execution on error', async () => {
      vi.mocked(bump).mockResolvedValue({ newVersion: '2.0.0', bumpedPackages: [], bumped: true })
      vi.mocked(changelog).mockRejectedValue(new Error('Changelog failed'))

      await expect(release({})).rejects.toThrow('Changelog failed')

      expect(publish).not.toHaveBeenCalled()
      expect(providerRelease).not.toHaveBeenCalled()
      expect(social).not.toHaveBeenCalled()
    })
  })

  describe('When passing options to sub-commands', () => {
    it('Then passes options to bump', async () => {
      await release({ type: 'major' })

      expect(loadRelizyConfig).toHaveBeenCalledWith(
        expect.objectContaining({ overrides: expect.objectContaining({ bump: expect.objectContaining({ type: 'major' }) }) }),
      )
    })

    it('Then forwards includePrivates to config overrides, bump, and changelog', async () => {
      const bumpResult = { newVersion: '2.0.0', bumpedPackages: [], bumped: true }
      vi.mocked(bump).mockResolvedValue(bumpResult)

      await release({ includePrivates: true })

      expect(loadRelizyConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          overrides: expect.objectContaining({
            monorepo: expect.objectContaining({ includePrivates: true }),
          }),
        }),
      )
      expect(bump).toHaveBeenCalledWith(
        expect.objectContaining({ includePrivates: true }),
      )
      expect(changelog).toHaveBeenCalledWith(
        expect.objectContaining({ includePrivates: true }),
      )
    })

    it('Then passes bumpResult to subsequent steps', async () => {
      const bumpResult = { newVersion: '2.0.0', bumpedPackages: [], bumped: true }
      vi.mocked(bump).mockResolvedValue(bumpResult)

      await release({})

      expect(changelog).toHaveBeenCalledWith(
        expect.objectContaining({ bumpResult }),
      )
      expect(providerRelease).toHaveBeenCalledWith(
        expect.objectContaining({ bumpResult }),
      )
    })
  })

  describe('When posting PR comment', () => {
    it('Then posts success comment with release context', async () => {
      const bumpResult = { newVersion: '2.0.0', bumpedPackages: [], bumped: true }
      vi.mocked(bump).mockResolvedValue(bumpResult)

      await release({})

      expect(prComment).toHaveBeenCalledWith(
        expect.objectContaining({
          releaseContext: expect.objectContaining({
            status: 'success',
            bumpResult,
          }),
        }),
      )
    })

    it('Then posts no-release comment when no packages bumped', async () => {
      vi.mocked(bump).mockResolvedValue({ bumped: false })

      await release({})

      expect(prComment).toHaveBeenCalledWith(
        expect.objectContaining({
          releaseContext: expect.objectContaining({
            status: 'no-release',
          }),
        }),
      )
    })

    it('Then posts failed comment when error occurs', async () => {
      vi.mocked(bump).mockRejectedValue(new Error('Bump failed'))

      await expect(release({})).rejects.toThrow('Bump failed')

      expect(prComment).toHaveBeenCalledWith(
        expect.objectContaining({
          releaseContext: expect.objectContaining({
            status: 'failed',
            error: 'Bump failed',
          }),
        }),
      )
    })

    it('Then does not post when prComment is disabled', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        release: {
          commit: true,
          changelog: true,
          publish: true,
          push: true,
          providerRelease: true,
          social: true,
          prComment: false,
          clean: true,
          noVerify: false,
          gitTag: true,
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(bump).mockResolvedValue({ newVersion: '1.0.0', bumpedPackages: [], bumped: true })

      await release({})

      expect(prComment).not.toHaveBeenCalled()
    })

    it('Then passes prNumber to prComment', async () => {
      vi.mocked(bump).mockResolvedValue({ newVersion: '1.0.0', bumpedPackages: [], bumped: true })

      await release({ prNumber: 123 })

      expect(prComment).toHaveBeenCalledWith(
        expect.objectContaining({
          prNumber: 123,
        }),
      )
    })
  })

  describe('When guarding the release against a stale branch', () => {
    beforeEach(() => {
      vi.mocked(assertBranchUpToDateWithRemote).mockReset()
      vi.mocked(assertReleaseTagsAvailable).mockReset()
      vi.mocked(createCommitAndTags).mockReset().mockResolvedValue([])
      vi.mocked(bump).mockResolvedValue({ newVersion: '1.0.1', bumpedPackages: [], bumped: true })
    })

    it('Then checks the remote branch during safety checks and right before publishing', async () => {
      await release({})

      expect(assertBranchUpToDateWithRemote).toHaveBeenCalledTimes(2)
      expect(vi.mocked(assertBranchUpToDateWithRemote).mock.invocationCallOrder[1]).toBeLessThan(vi.mocked(publish).mock.invocationCallOrder[0]!)
    })

    it('Then checks that the release tag is still available', async () => {
      await release({})

      expect(assertReleaseTagsAvailable).toHaveBeenCalledWith(expect.objectContaining({ tags: ['v1.0.1'] }))
    })

    it('Then passes the created tags to the push', async () => {
      vi.mocked(createCommitAndTags).mockResolvedValue(['v1.0.1'])

      await release({})

      expect(pushCommitAndTags).toHaveBeenCalledWith(expect.objectContaining({ tags: ['v1.0.1'] }))
    })

    describe('When the branch is behind its remote right before publishing', () => {
      beforeEach(() => {
        vi.mocked(assertBranchUpToDateWithRemote)
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('The current branch is behind "origin/main"'))
      })

      it('Then aborts before publishing and rolls back the release files', async () => {
        await expect(release({})).rejects.toThrow('The current branch is behind "origin/main"')

        expect(publish).not.toHaveBeenCalled()
        expect(pushCommitAndTags).not.toHaveBeenCalled()
        expect(rollbackModifiedFiles).toHaveBeenCalled()
      })
    })

    describe('When the release tag already exists', () => {
      beforeEach(() => {
        vi.mocked(assertReleaseTagsAvailable).mockRejectedValue(new Error('Tag "v1.0.1" already exists'))
      })

      it('Then aborts before the changelog and rolls back the release files', async () => {
        await expect(release({})).rejects.toThrow('Tag "v1.0.1" already exists')

        expect(changelog).not.toHaveBeenCalled()
        expect(publish).not.toHaveBeenCalled()
        expect(rollbackModifiedFiles).toHaveBeenCalled()
      })

      it('Then does not roll back files in dry-run mode', async () => {
        await expect(release({ dryRun: true })).rejects.toThrow('Tag "v1.0.1" already exists')

        expect(rollbackModifiedFiles).not.toHaveBeenCalled()
      })
    })

    describe('When the push is disabled', () => {
      it('Then skips the remote branch check', async () => {
        const config = createMockConfig({
          bump: { type: 'patch' },
          release: { commit: true, push: false, publish: true, changelog: true, gitTag: true },
        })
        vi.mocked(loadRelizyConfig).mockResolvedValue(config)

        await release({})

        expect(assertBranchUpToDateWithRemote).not.toHaveBeenCalled()
      })
    })
  })

  describe('When running in canary mode', () => {
    function setupCanaryConfig() {
      const config = createMockConfig({
        bump: { type: 'patch' },
        release: {
          commit: false,
          changelog: false,
          publish: true,
          push: false,
          providerRelease: false,
          social: false,
          prComment: true,
          clean: true,
          noVerify: false,
          gitTag: false,
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
    }

    it('Then disables changelog, commit, push, providerRelease, social, and gitTag', async () => {
      setupCanaryConfig()
      vi.mocked(bump).mockResolvedValue({ newVersion: '1.1.0-0.canary-abc1234', bumpedPackages: [], bumped: true })

      await release({ canary: true })

      expect(bump).toHaveBeenCalledWith(
        expect.objectContaining({ canary: true }),
      )
      expect(changelog).not.toHaveBeenCalled()
      expect(providerRelease).not.toHaveBeenCalled()
      expect(social).not.toHaveBeenCalled()
    })

    it('Then does not check the social config, which canary releases do not post to', async () => {
      setupCanaryConfig()
      vi.mocked(bump).mockResolvedValue({ newVersion: '1.1.0-0.canary-abc1234', bumpedPackages: [], bumped: true })

      await release({ canary: true })

      expect(socialSafetyCheck).not.toHaveBeenCalled()
    })

    it('Then still publishes to npm in canary mode', async () => {
      setupCanaryConfig()
      vi.mocked(bump).mockResolvedValue({ newVersion: '1.1.0-0.canary-abc1234', bumpedPackages: [], bumped: true })

      await release({ canary: true })

      expect(publish).toHaveBeenCalled()
    })

    it('Then still posts PR comment in canary mode', async () => {
      setupCanaryConfig()
      vi.mocked(bump).mockResolvedValue({ newVersion: '1.1.0-0.canary-abc1234', bumpedPackages: [], bumped: true })

      await release({ canary: true })

      expect(prComment).toHaveBeenCalledWith(
        expect.objectContaining({
          releaseContext: expect.objectContaining({
            status: 'success',
          }),
        }),
      )
    })

    it('Then uses custom preid when provided', async () => {
      setupCanaryConfig()
      vi.mocked(bump).mockResolvedValue({ newVersion: '1.1.0-0.snapshot-abc1234', bumpedPackages: [], bumped: true })

      await release({ canary: true, preid: 'snapshot' })

      // Canary sets type to 'prerelease' and passes preid through config
      expect(loadRelizyConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          overrides: expect.objectContaining({
            bump: expect.objectContaining({ type: 'prerelease', preid: 'snapshot' }),
          }),
        }),
      )
    })
  })
})

describe('Given the report of release', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadRelizyConfig).mockResolvedValue(createMockConfig({
      bump: { type: 'patch' },
      release: { commit: true, changelog: true, publish: true, push: true, providerRelease: true, social: true, prComment: false, clean: true, noVerify: false, gitTag: true },
      social: { twitter: { enabled: true }, slack: { enabled: true } },
    }))
    vi.mocked(createCommitAndTags).mockResolvedValue(['v1.0.0'])
    vi.mocked(publish).mockResolvedValue({ publishedPackages: [{} as any, {} as any] })
    vi.mocked(providerRelease).mockResolvedValue({ detectedProvider: 'github', postedReleases: [{ name: 'v1.0.0', tag: 'v1.0.0', prerelease: false, version: '1.0.0' }] })
  })

  it('Then returns what each step did', async () => {
    vi.mocked(bump).mockResolvedValue({ newVersion: '1.0.0', oldVersion: '0.9.0', bumpedPackages: [], bumped: true })
    vi.mocked(social).mockResolvedValue({ results: [{ platform: 'twitter', success: true }, { platform: 'slack', success: false, error: 'down' }], hasErrors: true })

    const report = await release({})

    expect(report).toEqual(expect.objectContaining({ status: 'released', released: true, dryRun: false, version: '1.0.0', tags: ['v1.0.0'] }))
    expect(report.steps).toEqual([
      { name: 'changelog', status: 'done' },
      { name: 'publish', status: 'done', detail: '2 packages' },
      { name: 'commit', status: 'done', detail: 'v1.0.0' },
      { name: 'push', status: 'done' },
      { name: 'providerRelease', status: 'done', detail: '1 release on github' },
      { name: 'social', status: 'failed', detail: 'slack: down' },
      { name: 'prComment', status: 'skipped' },
    ])
  })

  it('Then is not released in dry-run', async () => {
    vi.mocked(bump).mockResolvedValue({ newVersion: '1.0.0', bumpedPackages: [], bumped: true })

    const report = await release({ dryRun: true })

    expect(report).toEqual(expect.objectContaining({ status: 'released', released: false, dryRun: true }))
  })

  it('Then reports when there is nothing to release', async () => {
    vi.mocked(bump).mockResolvedValue({ bumped: false })

    const report = await release({})

    expect(report).toEqual(expect.objectContaining({ status: 'nothing', released: false, steps: [] }))
    expect(changelog).not.toHaveBeenCalled()
  })
})

describe('Given the output of release in CI', () => {
  const env = { ...process.env }
  let output: string[]

  beforeEach(async () => {
    vi.clearAllMocks()
    Object.assign(process.env, { RELIZY_REPORTER: 'ci', NO_COLOR: '1' })
    delete process.env.GITHUB_ACTIONS
    delete process.env.GITLAB_CI
    const { logger } = await import('@maz-ui/node')
    vi.mocked(logger.removeReporter).mockReturnValue({ options: { reporters: [] } } as never)
    output = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      output.push(String(chunk))
      return true
    })
    vi.mocked(loadRelizyConfig).mockResolvedValue(createMockConfig({
      bump: { type: 'patch' },
      release: { commit: true, changelog: true, publish: true, push: true, providerRelease: true, social: true, prComment: false, clean: true, noVerify: false, gitTag: true },
      social: { twitter: { enabled: true }, slack: { enabled: true } },
    }))
    vi.mocked(createCommitAndTags).mockResolvedValue(['v1.0.0'])
    vi.mocked(publish).mockResolvedValue({ publishedPackages: [{ name: 'pkg-a', version: '0.9.0', newVersion: '1.0.0' } as any] })
    vi.mocked(providerRelease).mockResolvedValue({ detectedProvider: 'github', postedReleases: [{ name: 'v1.0.0', tag: 'v1.0.0', prerelease: false, version: '1.0.0' }] })
    vi.mocked(social).mockResolvedValue({ results: [{ platform: 'twitter', success: true }], hasErrors: false })
  })

  afterEach(() => {
    process.env = { ...env }
    vi.restoreAllMocks()
  })

  it('Then shows what each step did, then the summary', async () => {
    vi.mocked(bump).mockResolvedValue({ newVersion: '1.0.0', oldVersion: '0.9.0', bumped: true, bumpedPackages: [{ name: 'pkg-a', path: '/pkg-a', version: '0.9.0', oldVersion: '0.9.0', newVersion: '1.0.0', commits: [], reason: 'commits' } as any] })

    await release({ safetyCheck: false })

    const lines = output.join('').split('\n')
    expect(lines).toEqual(expect.arrayContaining([
      'relizy release · ci',
      '▸ Checking the release',
      expect.stringMatching(/^✔ Ready to release \(tokens, registry, branch\) {2}\d+ms$/),
      expect.stringMatching(/^✔ pkg-a {2}0\.9\.0 {2}→ {2}1\.0\.0 {2}forced {2}\d+ms$/),
      // The package and the root changelog
      expect.stringMatching(/^✔ 2 changelogs written {2}\d+ms$/),
      expect.stringMatching(/^✔ Published pkg-a@1\.0\.0 {2}\d+ms$/),
      expect.stringMatching(/^✔ Committed and tagged v1\.0\.0 {2}\d+ms$/),
      expect.stringMatching(/^✔ Pushed the commit and the tags {2}\d+ms$/),
      expect.stringMatching(/^✔ 1 GitHub release created {2}\d+ms$/),
      expect.stringMatching(/^✔ Posted on twitter {2}\d+ms$/),
      '○ PR comment skipped (--no-pr-comment)',
      expect.stringMatching(/^ {2}✔ Publish +pkg-a@1\.0\.0 · latest · registry\.npmjs\.org$/),
      expect.stringMatching(/^ {2}✔ Commit and tags +a1b2c3d · v1\.0\.0$/),
      expect.stringMatching(/^ {2}✔ Push +main → origin\/main$/),
      expect.stringMatching(/^ {4}Install +pnpm add pkg-a@1\.0\.0$/),
      expect.stringMatching(/^✔ Released relizy 1\.0\.0 {2}\d+ms$/),
    ]))
  })

  it('Then marks the steps that failed without stopping the release', async () => {
    vi.mocked(bump).mockResolvedValue({ newVersion: '1.0.0', oldVersion: '0.9.0', bumped: true, bumpedPackages: [] })
    vi.mocked(providerRelease).mockResolvedValue({ detectedProvider: 'github', postedReleases: [], error: 'Bad credentials' })
    vi.mocked(social).mockResolvedValue({ results: [{ platform: 'twitter', success: true }, { platform: 'slack', success: false, error: 'down' }], hasErrors: true })

    await release({})

    const lines = output.join('').split('\n')
    expect(lines).toEqual(expect.arrayContaining([
      expect.stringMatching(/^▲ GitHub release failed: Bad credentials {2}\d+ms$/),
      expect.stringMatching(/^▲ Posted on twitter, slack failed {2}\d+ms$/),
      expect.stringMatching(/^ {2}▲ Provider release +Bad credentials$/),
      expect.stringMatching(/^✔ Released relizy 1\.0\.0 {2}\d+ms$/),
    ]))
  })

  it('Then comments the pull request with the summary of the steps done before', async () => {
    const config = createMockConfig({ bump: { type: 'patch' }, release: { commit: true, changelog: true, publish: false, push: false, providerRelease: false, social: false, prComment: true, clean: true, noVerify: false, gitTag: true } })
    vi.mocked(loadRelizyConfig).mockResolvedValue(config)
    vi.mocked(bump).mockResolvedValue({ newVersion: '1.0.0', oldVersion: '0.9.0', bumped: true, bumpedPackages: [] })
    vi.mocked(prComment).mockResolvedValue(true)

    await release({})

    const { releaseContext } = vi.mocked(prComment).mock.calls[0]![0]!
    expect(releaseContext?.report?.steps.map(step => step.name)).toEqual(['changelog', 'publish', 'commit', 'push', 'providerRelease', 'social'])
    expect(output.join('')).toMatch(/✔ Pull request commented {2}\d+ms\n/)
  })

  it('Then gives the AI rewrites, their tokens and their cost to the comment and to the summary of the release', async () => {
    const config = createMockConfig({
      bump: { type: 'patch' },
      release: { commit: true, changelog: true, publish: false, push: false, providerRelease: true, social: true, prComment: true, clean: true, noVerify: false, gitTag: true },
      social: { twitter: { enabled: true } },
    })
    vi.mocked(loadRelizyConfig).mockResolvedValue(config)
    vi.mocked(bump).mockResolvedValue({ newVersion: '1.0.0', oldVersion: '0.9.0', bumped: true, bumpedPackages: [] })
    // The steps record their AI rewrites, as the real ones do
    vi.mocked(providerRelease).mockImplementation(() => {
      recordAIRewrite({ subject: 'the notes of v1.0.0', provider: 'claude-code', simulated: false, durationMs: 4000, inputTokens: 3000, outputTokens: 600, costUsd: 0.01 })
      return Promise.resolve({ detectedProvider: 'github', postedReleases: [] })
    })
    vi.mocked(social).mockImplementation(() => {
      recordAIRewrite({ subject: 'the Twitter post', provider: 'claude-code', simulated: false, durationMs: 2000, inputTokens: 1200, outputTokens: 200, costUsd: 0.02 })
      return Promise.resolve({ results: [{ platform: 'twitter', success: true }], hasErrors: false })
    })
    vi.mocked(prComment).mockResolvedValue(true)

    const report = await release({})

    const ai = { provider: 'claude-code', rewrites: 2, simulated: false, durationMs: 6000, inputTokens: 4200, outputTokens: 800, costUsd: 0.03 }
    expect(vi.mocked(prComment).mock.calls[0]![0]!.releaseContext?.report?.ai).toEqual(ai)
    expect(report.ai).toEqual(ai)
    expect(output.join('')).toContain('2 rewrites by claude-code in 6.0s · 5k tokens · $0.030')
  })

  it('Then comments the pull request when there is nothing to release', async () => {
    vi.mocked(loadRelizyConfig).mockResolvedValue(createMockConfig({ bump: { type: 'patch' }, release: { prComment: true } }))
    vi.mocked(bump).mockResolvedValue({ bumped: false })
    vi.mocked(prComment).mockResolvedValue(false)

    await release({})

    expect(vi.mocked(prComment).mock.calls[0]![0]!.releaseContext).toEqual(expect.objectContaining({ status: 'no-release', report: expect.objectContaining({ status: 'nothing' }) }))
    expect(output.join('')).toMatch(/✔ No pull request to comment {2}\d+ms\n/)
  })

  it('Then tells when there is nothing to release', async () => {
    vi.mocked(bump).mockResolvedValue({ bumped: false })

    await release({ safetyCheck: false })

    expect(output.join('')).toMatch(/✔ No commit to release {2}\d+ms\n/)
    expect(output.join('')).toMatch(/○ Nothing to release {2}\d+ms\n/)
  })

  it('Then shows the error once, with the step that failed and the summary of the steps done', async () => {
    vi.mocked(bump).mockResolvedValue({ newVersion: '1.0.0', oldVersion: '0.9.0', bumped: true, bumpedPackages: [] })
    vi.mocked(publish).mockRejectedValue(new Error('E403 Forbidden'))

    await expect(release({ safetyCheck: false })).rejects.toThrow('E403 Forbidden')

    const text = output.join('')
    expect(text).toMatch(/✖ Publishing the packages failed {2}\d+ms\n/)
    expect(text).toMatch(/ {2}✔ Changelog +done\n/)
    // The failed step is told by the error, not by the summary
    expect(text).not.toMatch(/ {2}✔ Publish/)
    expect(text).toContain('✖ Publish failed\n  E403 Forbidden\n')
  })
})
