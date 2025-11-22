import { logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig } from '../../../tests/mocks'
import * as core from '../../core'
import { release } from '../release'

logger.setLevel('error')

vi.mock('../../core', async () => {
  const actual = await vi.importActual('../../core')
  return {
    ...actual,
    loadRelizyConfig: vi.fn(),
    executeHook: vi.fn(),
    checkGitStatusIfDirty: vi.fn(),
    fetchGitTags: vi.fn(),
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

const { bump } = await import('../bump')
const { changelog: changelogCmd } = await import('../changelog')
const { publish: publishCmd } = await import('../publish')
const { providerRelease: providerReleaseCmd } = await import('../provider-release')
const { social: socialCmd } = await import('../social')

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
    vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)
    vi.mocked(core.executeHook).mockResolvedValue(undefined)
    vi.mocked(core.checkGitStatusIfDirty).mockReturnValue(undefined)
    vi.mocked(core.fetchGitTags).mockResolvedValue(undefined)
    vi.mocked(bump).mockResolvedValue({ newVersion: '1.0.0', bumpedPackages: [] } as any)
    vi.mocked(changelogCmd).mockResolvedValue(undefined)
    vi.mocked(publishCmd).mockResolvedValue(undefined)
    vi.mocked(providerReleaseCmd).mockResolvedValue({ detectedProvider: 'github', postedReleases: [] })
    vi.mocked(socialCmd).mockResolvedValue(undefined)
  })

  describe('When running full release workflow', () => {
    it('Then loads config and executes hooks', async () => {
      await release({})

      expect(core.loadRelizyConfig).toHaveBeenCalled()
      expect(core.executeHook).toHaveBeenCalledWith('before:release', expect.any(Object), false)
    })

    it('Then checks git status when clean is enabled', async () => {
      await release({})

      expect(core.checkGitStatusIfDirty).toHaveBeenCalled()
    })

    it('Then fetches git tags', async () => {
      await release({})

      expect(core.fetchGitTags).toHaveBeenCalled()
    })

    it('Then runs all release steps in order', async () => {
      await release({})

      expect(bump).toHaveBeenCalled()
      expect(changelogCmd).toHaveBeenCalled()
      expect(publishCmd).toHaveBeenCalled()
      expect(providerReleaseCmd).toHaveBeenCalled()
      expect(socialCmd).toHaveBeenCalled()
    })

    it('Then executes success hook', async () => {
      await release({})

      expect(core.executeHook).toHaveBeenCalledWith('success:release', expect.any(Object), false)
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
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)

      await release({})

      expect(changelogCmd).not.toHaveBeenCalled()
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
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)

      await release({})

      expect(publishCmd).not.toHaveBeenCalled()
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
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)

      await release({})

      expect(providerReleaseCmd).not.toHaveBeenCalled()
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
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)

      await release({})

      expect(socialCmd).not.toHaveBeenCalled()
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
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)

      await release({})

      expect(core.checkGitStatusIfDirty).not.toHaveBeenCalled()
    })
  })

  describe('When in dry-run mode', () => {
    it('Then passes dryRun to all steps', async () => {
      await release({ dryRun: true })

      expect(bump).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))
      expect(changelogCmd).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))
      expect(publishCmd).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))
      expect(providerReleaseCmd).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))
      expect(socialCmd).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))
    })

    it('Then passes dryRun to hooks', async () => {
      await release({ dryRun: true })

      expect(core.executeHook).toHaveBeenCalledWith('before:release', expect.any(Object), true)
      expect(core.executeHook).toHaveBeenCalledWith('success:release', expect.any(Object), true)
    })
  })

  describe('When error occurs', () => {
    it('Then executes error hook', async () => {
      vi.mocked(bump).mockRejectedValue(new Error('Bump failed'))

      await expect(release({})).rejects.toThrow('Bump failed')

      expect(core.executeHook).toHaveBeenCalledWith('error:release', expect.any(Object), false)
    })

    it('Then stops execution on error', async () => {
      vi.mocked(changelogCmd).mockRejectedValue(new Error('Changelog failed'))

      await expect(release({})).rejects.toThrow('Changelog failed')

      expect(publishCmd).not.toHaveBeenCalled()
      expect(providerReleaseCmd).not.toHaveBeenCalled()
      expect(socialCmd).not.toHaveBeenCalled()
    })
  })

  describe('When passing options to sub-commands', () => {
    it('Then passes options to bump', async () => {
      await release({ type: 'major' })

      expect(bump).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'major' }),
      )
    })

    it('Then passes bumpResult to subsequent steps', async () => {
      const bumpResult = { newVersion: '2.0.0', bumpedPackages: [] }
      vi.mocked(bump).mockResolvedValue(bumpResult as any)

      await release({})

      expect(changelogCmd).toHaveBeenCalledWith(
        expect.objectContaining({ bumpResult }),
      )
      expect(providerReleaseCmd).toHaveBeenCalledWith(
        expect.objectContaining({ bumpResult }),
      )
    })
  })
})
