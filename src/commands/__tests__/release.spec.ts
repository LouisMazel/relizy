import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig } from '../../../tests/mocks'
import { checkGitStatusIfDirty, executeHook, fetchGitTags, loadRelizyConfig } from '../../core'
import { bump } from '../bump'

import { changelog } from '../changelog'
import { prComment } from '../pr-comment'
import { providerRelease } from '../provider-release'
import { publish } from '../publish'
import { buildReleaseSummary, release } from '../release'
import { social } from '../social'

vi.mock('../../core', async () => {
  const actual = await vi.importActual('../../core')
  return {
    ...actual,
    loadRelizyConfig: vi.fn(),
    executeHook: vi.fn(),
    checkGitStatusIfDirty: vi.fn(),
    fetchGitTags: vi.fn(),
    pushCommitAndTags: vi.fn(),
    readPackageJson: vi.fn(),
    createCommitAndTags: vi.fn(),
  }
})
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
vi.mock('../provider-release', () => ({
  providerRelease: vi.fn(),
  providerReleaseSafetyCheck: vi.fn(),
}))
vi.mock('../social', () => ({
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

    it('Then executes success hook', async () => {
      vi.mocked(bump).mockResolvedValue({ newVersion: '1.0.0', bumpedPackages: [], bumped: true })

      await release({})

      expect(executeHook).toHaveBeenNthCalledWith(
        4,
        'success:release',
        expect.any(Object),
        false,
      )
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
      expect(executeHook).toHaveBeenCalledWith('success:release', expect.any(Object), true)
    })
  })

  describe('When error occurs', () => {
    it('Then executes error hook', async () => {
      vi.mocked(bump).mockRejectedValue(new Error('Bump failed'))

      await expect(release({})).rejects.toThrow('Bump failed')

      expect(executeHook).toHaveBeenCalledWith('error:release', expect.any(Object), false)
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
      vi.mocked(bump).mockResolvedValue({ newVersion: '1.1.0-canary.abc1234.0', bumpedPackages: [], bumped: true })

      await release({ canary: true })

      expect(bump).toHaveBeenCalledWith(
        expect.objectContaining({ canary: true }),
      )
      expect(changelog).not.toHaveBeenCalled()
      expect(providerRelease).not.toHaveBeenCalled()
      expect(social).not.toHaveBeenCalled()
    })

    it('Then still publishes to npm in canary mode', async () => {
      setupCanaryConfig()
      vi.mocked(bump).mockResolvedValue({ newVersion: '1.1.0-canary.abc1234.0', bumpedPackages: [], bumped: true })

      await release({ canary: true })

      expect(publish).toHaveBeenCalled()
    })

    it('Then still posts PR comment in canary mode', async () => {
      setupCanaryConfig()
      vi.mocked(bump).mockResolvedValue({ newVersion: '1.1.0-canary.abc1234.0', bumpedPackages: [], bumped: true })

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
      vi.mocked(bump).mockResolvedValue({ newVersion: '1.1.0-snapshot.abc1234.0', bumpedPackages: [], bumped: true })

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

describe('Given buildReleaseSummary function', () => {
  const bumpResult = { bumped: true, newVersion: '2.0.0', bumpedPackages: [] } as any

  function summaryConfig(release: Record<string, boolean> = {}) {
    return createMockConfig({
      release: {
        commit: true,
        changelog: true,
        push: true,
        publish: true,
        providerRelease: true,
        social: true,
        prComment: true,
        clean: true,
        noVerify: false,
        gitTag: true,
        ...release,
      },
    })
  }

  describe('When every step ran successfully', () => {
    it('Then renders each step outcome', () => {
      const summary = buildReleaseSummary({
        config: summaryConfig(),
        bumpResult,
        publishResponse: { publishedPackages: [{}, {}, {}] } as any,
        createdTags: ['v2.0.0'],
        provider: 'github',
        postedReleases: [{}] as any,
        socialResults: { hasErrors: false, results: [{ platform: 'twitter', success: true }, { platform: 'slack', success: true }] } as any,
        prCommentPosted: true,
      })

      expect(summary).toContain('Version: 2.0.0')
      expect(summary).toContain('Tag(s): v2.0.0')
      expect(summary).toContain('Pushed: Yes')
      expect(summary).toContain('Published packages: 3')
      expect(summary).toContain('Provider release: 1 release')
      expect(summary).toContain('Social media: 2 succeeded')
      expect(summary).toContain('PR comment: Posted')
      expect(summary).toContain('Git provider: github')
    })
  })

  describe('When steps are disabled', () => {
    it('Then marks them as Disabled and shows no tags', () => {
      const summary = buildReleaseSummary({
        config: summaryConfig({ push: false, publish: false, providerRelease: false, social: false, prComment: false }),
        bumpResult,
        createdTags: [],
        postedReleases: [],
        prCommentPosted: false,
      })

      expect(summary).toContain('Pushed: Disabled')
      expect(summary).toContain('Published packages: Disabled')
      expect(summary).toContain('Provider release: Disabled')
      expect(summary).toContain('Social media: Disabled')
      expect(summary).toContain('PR comment: Disabled')
      expect(summary).toContain('Tag(s): None')
    })
  })

  describe('When in independent version mode', () => {
    it('Then summarizes the number of packages bumped', () => {
      const summary = buildReleaseSummary({
        config: createMockConfig({ versionMode: 'independent', release: { push: true, publish: true, providerRelease: true, social: true, prComment: true, commit: true, changelog: true, clean: true, noVerify: false, gitTag: true } }),
        bumpResult: { bumped: true, newVersion: undefined, bumpedPackages: [{}, {}, {}] } as any,
        createdTags: ['pkg-a@1.0.0'],
        postedReleases: [],
        prCommentPosted: true,
      })

      expect(summary).toContain('Version: 3 packages bumped independently')
    })
  })

  describe('When provider, social and pr-comment reported failures', () => {
    it('Then reflects each failure', () => {
      const summary = buildReleaseSummary({
        config: summaryConfig(),
        bumpResult,
        createdTags: ['v2.0.0'],
        postedReleases: [],
        providerError: 'boom',
        socialResults: { hasErrors: true, results: [{ platform: 'slack', success: true }, { platform: 'twitter', success: false }] } as any,
        prCommentPosted: false,
      })

      expect(summary).toContain('Provider release: Failed: boom')
      expect(summary).toContain('Social media: 1 succeeded, 1 failed (twitter)')
      expect(summary).toContain('PR comment: Failed')
    })
  })
})
