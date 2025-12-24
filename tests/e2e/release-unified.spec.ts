import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bump } from '../../src/commands/bump'
import { changelog } from '../../src/commands/changelog'
import { providerRelease } from '../../src/commands/provider-release'
import { publish } from '../../src/commands/publish'
import { release } from '../../src/commands/release'
import { social } from '../../src/commands/social'
import { executeHook, generateChangelog, getRootPackage, loadRelizyConfig, readPackageJson, resolveTags } from '../../src/core'
import { createMockConfig } from '../mocks'

vi.mock('../../src/core', async () => {
  const actual = await vi.importActual('../../src/core')
  return {
    ...actual,
    loadRelizyConfig: vi.fn(),
    executeHook: vi.fn(),
    readPackageJson: vi.fn(),
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
    const config = createMockConfig({
      bump: { type: 'patch' },
      release: {
        commit: true,
        changelog: true,
        publish: true,
        push: true,
        providerRelease: true,
        social: true,
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
    vi.mocked(readPackageJson).mockReturnValue({
      name: 'test-package',
      version: '1.0.0',
      path: '/root',
      private: false,
    })
    vi.mocked(getRootPackage).mockResolvedValue({
      name: 'test-package',
      version: '1.0.0',
      path: '/root',
      private: false,
      fromTag: 'v0.9.0',
      commits: [],
    })
    vi.mocked(resolveTags).mockResolvedValue({ from: 'v0.9.0', to: 'v1.0.0' })
    vi.mocked(generateChangelog).mockResolvedValue('## v1.0.0\n\n- Feature')
    vi.mocked(bump).mockResolvedValue({
      newVersion: '1.0.0',
      bumpedPackages: [],
      bumped: true,
      fromTag: 'v0.9.0',
    } as any)
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
    it('Then executes all steps in correct order', async () => {
      await release({})

      const callOrder: string[] = []
      vi.mocked(bump).mock.invocationCallOrder.forEach(() => callOrder.push('bump'))
      vi.mocked(changelog).mock.invocationCallOrder.forEach(() => callOrder.push('changelog'))
      vi.mocked(publish).mock.invocationCallOrder.forEach(() => callOrder.push('publish'))
      vi.mocked(providerRelease).mock.invocationCallOrder.forEach(() => callOrder.push('providerRelease'))
      vi.mocked(social).mock.invocationCallOrder.forEach(() => callOrder.push('social'))

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

      expect(changelog).toHaveBeenCalledWith(
        expect.objectContaining({ bumpResult }),
      )
      expect(providerRelease).toHaveBeenCalledWith(
        expect.objectContaining({ bumpResult }),
      )
      expect(social).toHaveBeenCalledWith(
        expect.objectContaining({ bumpResult }),
      )
    })

    it('Then executes before and success hooks', async () => {
      await release({})

      expect(executeHook).toHaveBeenCalledWith('before:release', expect.any(Object), false)
      expect(executeHook).toHaveBeenCalledWith('success:release', expect.any(Object), false)
    })
  })

  describe('When bumping patch version', () => {
    it('Then creates new patch version', async () => {
      await release({ type: 'patch' })

      expect(bump).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'patch' }),
      )
    })

    it('Then updates package.json with new version', async () => {
      vi.mocked(bump).mockResolvedValue({
        newVersion: '1.0.1',
        bumpedPackages: [],
        bumped: true,
        fromTag: 'v1.0.0',
      } as any)

      await release({ type: 'patch' })

      expect(changelog).toHaveBeenCalledWith(
        expect.objectContaining({
          bumpResult: expect.objectContaining({ newVersion: '1.0.1' }),
        }),
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
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await release({})

      expect(changelog).not.toHaveBeenCalled()
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
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await release({})

      expect(publish).not.toHaveBeenCalled()
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
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await release({})

      expect(providerRelease).not.toHaveBeenCalled()
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
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await release({})

      expect(social).not.toHaveBeenCalled()
    })
  })

  describe('When in dry-run mode', () => {
    it('Then passes dryRun to all commands', async () => {
      await release({ dryRun: true })

      expect(bump).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))
      expect(changelog).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))
      expect(publish).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))
      expect(providerRelease).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))
      expect(social).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))
    })

    it('Then passes dryRun to hooks', async () => {
      await release({ dryRun: true })

      expect(executeHook).toHaveBeenCalledWith('before:release', expect.any(Object), true)
      expect(executeHook).toHaveBeenCalledWith('success:release', expect.any(Object), true)
    })
  })

  describe('When error occurs during bump', () => {
    it('Then executes error hook', async () => {
      const error = new Error('Bump failed')
      vi.mocked(bump).mockRejectedValue(error)

      await expect(release({})).rejects.toThrow('Bump failed')

      expect(executeHook).toHaveBeenCalledWith('error:release', expect.any(Object), false)
    })

    it('Then stops execution and does not run subsequent steps', async () => {
      vi.mocked(bump).mockRejectedValue(new Error('Bump failed'))

      await expect(release({})).rejects.toThrow()

      expect(changelog).not.toHaveBeenCalled()
      expect(publish).not.toHaveBeenCalled()
      expect(providerRelease).not.toHaveBeenCalled()
      expect(social).not.toHaveBeenCalled()
    })
  })

  describe('When error occurs during changelog', () => {
    it('Then executes error hook and stops', async () => {
      vi.mocked(changelog).mockRejectedValue(new Error('Changelog failed'))
      vi.mocked(bump).mockResolvedValue({
        newVersion: '1.0.1',
        bumpedPackages: [],
        bumped: true,
        fromTag: 'v1.0.0',
      } as any)

      await expect(release({})).rejects.toThrow('Changelog failed')

      expect(executeHook).toHaveBeenCalledWith('error:release', expect.any(Object), false)
      expect(publish).not.toHaveBeenCalled()
    })
  })

  describe('When error occurs during publish', () => {
    it('Then executes error hook and stops', async () => {
      vi.mocked(publish).mockRejectedValue(new Error('Publish failed'))

      await expect(release({})).rejects.toThrow('Publish failed')

      expect(executeHook).toHaveBeenCalledWith('error:release', expect.any(Object), false)
      expect(providerRelease).not.toHaveBeenCalled()
    })
  })

  describe('When error occurs during social', () => {
    it('Then logs error but release succeeds', async () => {
      vi.mocked(social).mockResolvedValue({
        results: [
          { platform: 'twitter', success: false, error: 'Twitter failed' },
          { platform: 'slack', success: true },
        ],
        hasErrors: true,
      })

      await release({})

      expect(social).toHaveBeenCalled()
      // Release succeeds despite social errors
      expect(executeHook).toHaveBeenCalledWith('success:release', expect.any(Object), false)
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

  describe('When workflow completes successfully', () => {
    it('Then all steps are executed', async () => {
      await release({})

      expect(bump).toHaveBeenCalled()
      expect(changelog).toHaveBeenCalled()
      expect(publish).toHaveBeenCalled()
      expect(providerRelease).toHaveBeenCalled()
      expect(social).toHaveBeenCalled()
    })

    it('Then success hook is called', async () => {
      await release({})

      expect(executeHook).toHaveBeenCalledWith('success:release', expect.any(Object), false)
    })
  })
})
