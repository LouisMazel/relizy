import { logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bump } from '../../src/commands/bump'
import { changelog as changelogCmd } from '../../src/commands/changelog'
import { providerRelease as providerReleaseCmd } from '../../src/commands/provider-release'
import { publish as publishCmd } from '../../src/commands/publish'
import { release } from '../../src/commands/release'
import { social as socialCmd } from '../../src/commands/social'
import * as core from '../../src/core'
import { createMockConfig } from '../mocks'

logger.setLevel('error')

vi.mock('../../src/core', async () => {
  const actual = await vi.importActual('../../src/core')
  return {
    ...actual,
    loadRelizyConfig: vi.fn(),
    executeHook: vi.fn(),
    checkGitStatusIfDirty: vi.fn(),
    fetchGitTags: vi.fn(),
    readPackageJson: vi.fn(),
    writePackageJson: vi.fn(),
    getRootPackage: vi.fn(),
    resolveTags: vi.fn(),
    generateChangelog: vi.fn(),
    writeChangelogToFile: vi.fn(),
    createCommitAndTags: vi.fn(),
    pushCommitAndTags: vi.fn(),
    publishPackages: vi.fn(),
    createGithubRelease: vi.fn(),
    postReleaseToTwitter: vi.fn(),
    postReleaseToSlack: vi.fn(),
  }
})

vi.mock('../../src/commands/bump')
vi.mock('../../src/commands/changelog')
vi.mock('../../src/commands/publish')
vi.mock('../../src/commands/provider-release')
vi.mock('../../src/commands/social')

describe('Given unified mode release workflow', () => {
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
    vi.mocked(core.readPackageJson).mockReturnValue({
      name: 'test-package',
      version: '1.0.0',
      path: '/root',
    })
    vi.mocked(core.getRootPackage).mockResolvedValue({
      name: 'test-package',
      version: '1.0.0',
      path: '/root',
      commits: [],
    })
    vi.mocked(core.resolveTags).mockResolvedValue({ from: 'v0.9.0', to: 'v1.0.0' })
    vi.mocked(core.generateChangelog).mockResolvedValue('## v1.0.0\n\n- Feature')
    vi.mocked(bump).mockResolvedValue({
      newVersion: '1.0.0',
      bumpedPackages: [],
      bumped: true,
      fromTag: 'v0.9.0',
    } as any)
    vi.mocked(changelogCmd).mockResolvedValue(undefined)
    vi.mocked(publishCmd).mockResolvedValue(undefined)
    vi.mocked(providerReleaseCmd).mockResolvedValue(undefined)
    vi.mocked(socialCmd).mockResolvedValue(undefined)
  })

  describe('When running full release workflow', () => {
    it('Then executes all steps in correct order', async () => {
      await release({})

      const callOrder: string[] = []
      vi.mocked(bump).mock.invocationCallOrder.forEach(() => callOrder.push('bump'))
      vi.mocked(changelogCmd).mock.invocationCallOrder.forEach(() => callOrder.push('changelog'))
      vi.mocked(publishCmd).mock.invocationCallOrder.forEach(() => callOrder.push('publish'))
      vi.mocked(providerReleaseCmd).mock.invocationCallOrder.forEach(() => callOrder.push('providerRelease'))
      vi.mocked(socialCmd).mock.invocationCallOrder.forEach(() => callOrder.push('social'))

      expect(callOrder).toEqual(['bump', 'changelog', 'publish', 'providerRelease', 'social'])
    })

    it('Then passes bumpResult to subsequent steps', async () => {
      const bumpResult = {
        newVersion: '1.0.0',
        bumpedPackages: [],
        bumped: true,
        fromTag: 'v0.9.0',
      }
      vi.mocked(bump).mockResolvedValue(bumpResult as any)

      await release({})

      expect(changelogCmd).toHaveBeenCalledWith(
        expect.objectContaining({ bumpResult }),
      )
      expect(providerReleaseCmd).toHaveBeenCalledWith(
        expect.objectContaining({ bumpResult }),
      )
      expect(socialCmd).toHaveBeenCalledWith(
        expect.objectContaining({ bumpResult }),
      )
    })

    it('Then executes before and success hooks', async () => {
      await release({})

      expect(core.executeHook).toHaveBeenCalledWith('before:release', expect.any(Object), false)
      expect(core.executeHook).toHaveBeenCalledWith('success:release', expect.any(Object), false)
    })

    it('Then checks git status when clean is enabled', async () => {
      await release({})

      expect(core.checkGitStatusIfDirty).toHaveBeenCalled()
    })

    it('Then fetches git tags before bumping', async () => {
      await release({})

      expect(core.fetchGitTags).toHaveBeenCalled()
    })
  })

  describe('When bumping patch version', () => {
    it('Then creates new patch version', async () => {
      await release({ releaseType: 'patch' })

      expect(bump).toHaveBeenCalledWith(
        expect.objectContaining({ releaseType: 'patch' }),
      )
    })

    it('Then updates package.json with new version', async () => {
      vi.mocked(bump).mockResolvedValue({
        newVersion: '1.0.1',
        bumpedPackages: [],
        bumped: true,
        fromTag: 'v1.0.0',
      } as any)

      await release({ releaseType: 'patch' })

      expect(changelogCmd).toHaveBeenCalledWith(
        expect.objectContaining({
          bumpResult: expect.objectContaining({ newVersion: '1.0.1' }),
        }),
      )
    })
  })

  describe('When bumping minor version', () => {
    it('Then creates new minor version', async () => {
      vi.mocked(bump).mockResolvedValue({
        newVersion: '1.1.0',
        bumpedPackages: [],
        bumped: true,
        fromTag: 'v1.0.0',
      } as any)

      await release({ releaseType: 'minor' })

      expect(bump).toHaveBeenCalledWith(
        expect.objectContaining({ releaseType: 'minor' }),
      )
    })
  })

  describe('When bumping major version', () => {
    it('Then creates new major version', async () => {
      vi.mocked(bump).mockResolvedValue({
        newVersion: '2.0.0',
        bumpedPackages: [],
        bumped: true,
        fromTag: 'v1.0.0',
      } as any)

      await release({ releaseType: 'major' })

      expect(bump).toHaveBeenCalledWith(
        expect.objectContaining({ releaseType: 'major' }),
      )
    })
  })

  describe('When skipping changelog', () => {
    it('Then does not execute changelog command', async () => {
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
  })

  describe('When skipping publish', () => {
    it('Then does not execute publish command', async () => {
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
  })

  describe('When skipping provider release', () => {
    it('Then does not execute provider release command', async () => {
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
  })

  describe('When skipping social', () => {
    it('Then does not execute social command', async () => {
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
  })

  describe('When in dry-run mode', () => {
    it('Then passes dryRun to all commands', async () => {
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

    it('Then does not skip git status check', async () => {
      await release({ dryRun: true })

      expect(core.checkGitStatusIfDirty).toHaveBeenCalled()
    })
  })

  describe('When error occurs during bump', () => {
    it('Then executes error hook', async () => {
      const error = new Error('Bump failed')
      vi.mocked(bump).mockRejectedValue(error)

      await expect(release({})).rejects.toThrow('Bump failed')

      expect(core.executeHook).toHaveBeenCalledWith('error:release', expect.any(Object), false)
    })

    it('Then stops execution and does not run subsequent steps', async () => {
      vi.mocked(bump).mockRejectedValue(new Error('Bump failed'))

      await expect(release({})).rejects.toThrow()

      expect(changelogCmd).not.toHaveBeenCalled()
      expect(publishCmd).not.toHaveBeenCalled()
      expect(providerReleaseCmd).not.toHaveBeenCalled()
      expect(socialCmd).not.toHaveBeenCalled()
    })
  })

  describe('When error occurs during changelog', () => {
    it('Then executes error hook and stops', async () => {
      vi.mocked(changelogCmd).mockRejectedValue(new Error('Changelog failed'))

      await expect(release({})).rejects.toThrow('Changelog failed')

      expect(core.executeHook).toHaveBeenCalledWith('error:release', expect.any(Object), false)
      expect(publishCmd).not.toHaveBeenCalled()
    })
  })

  describe('When error occurs during publish', () => {
    it('Then executes error hook and stops', async () => {
      vi.mocked(publishCmd).mockRejectedValue(new Error('Publish failed'))

      await expect(release({})).rejects.toThrow('Publish failed')

      expect(core.executeHook).toHaveBeenCalledWith('error:release', expect.any(Object), false)
      expect(providerReleaseCmd).not.toHaveBeenCalled()
    })
  })

  describe('When error occurs during provider release', () => {
    it('Then executes error hook and stops', async () => {
      vi.mocked(providerReleaseCmd).mockRejectedValue(new Error('Provider release failed'))

      await expect(release({})).rejects.toThrow('Provider release failed')

      expect(core.executeHook).toHaveBeenCalledWith('error:release', expect.any(Object), false)
      expect(socialCmd).not.toHaveBeenCalled()
    })
  })

  describe('When error occurs during social', () => {
    it('Then executes error hook', async () => {
      vi.mocked(socialCmd).mockRejectedValue(new Error('Social failed'))

      await expect(release({})).rejects.toThrow('Social failed')

      expect(core.executeHook).toHaveBeenCalledWith('error:release', expect.any(Object), false)
    })
  })

  describe('When using custom config name', () => {
    it('Then loads custom config', async () => {
      await release({ configName: 'custom' })

      expect(bump).toHaveBeenCalledWith(
        expect.objectContaining({ configName: 'custom' }),
      )
    })
  })

  describe('When clean is disabled', () => {
    it('Then skips git status check', async () => {
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

  describe('When using prerelease version', () => {
    it('Then creates prerelease version', async () => {
      vi.mocked(bump).mockResolvedValue({
        newVersion: '1.0.0-beta.0',
        bumpedPackages: [],
        bumped: true,
        fromTag: 'v1.0.0-alpha.0',
      } as any)

      await release({ releaseType: 'prerelease', preid: 'beta' })

      expect(bump).toHaveBeenCalledWith(
        expect.objectContaining({
          releaseType: 'prerelease',
          preid: 'beta',
        }),
      )
    })
  })

  describe('When workflow completes successfully', () => {
    it('Then all steps are executed', async () => {
      await release({})

      expect(bump).toHaveBeenCalled()
      expect(changelogCmd).toHaveBeenCalled()
      expect(publishCmd).toHaveBeenCalled()
      expect(providerReleaseCmd).toHaveBeenCalled()
      expect(socialCmd).toHaveBeenCalled()
    })

    it('Then success hook is called', async () => {
      await release({})

      expect(core.executeHook).toHaveBeenCalledWith('success:release', expect.any(Object), false)
    })
  })
})
