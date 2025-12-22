import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig } from '../../../tests/mocks'
import { checkGitStatusIfDirty, executeHook, fetchGitTags, loadRelizyConfig } from '../../core'
import { bump } from '../bump'

import { changelog } from '../changelog'
import { providerRelease } from '../provider-release'
import { publish } from '../publish'
import { release } from '../release'
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

describe('Given release command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const config = createMockConfig({ bump: { type: 'patch' } })
    config.release = {
      commit: true,
      changelog: true,
      publish: true,
      push: true,
      providerRelease: true,
      social: true,
      clean: true,
      noVerify: false,
      gitTag: true,
    }
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
})
