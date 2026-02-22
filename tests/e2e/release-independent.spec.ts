import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bump } from '../../src/commands/bump'
import { changelog } from '../../src/commands/changelog'
import { providerRelease } from '../../src/commands/provider-release'
import { publish } from '../../src/commands/publish'
import { release } from '../../src/commands/release'
import { social } from '../../src/commands/social'
import { checkGitStatusIfDirty, executeHook, fetchGitTags, generateChangelog, getIndependentTag, getRootPackage, loadRelizyConfig, readPackageJson, resolveTags } from '../../src/core'
import { createMockConfig } from '../mocks'

vi.mock('../../src/core', async () => {
  const actual = await vi.importActual('../../src/core')
  return {
    ...actual,
    loadRelizyConfig: vi.fn(),
    executeHook: vi.fn(),
    checkGitStatusIfDirty: vi.fn(),
    fetchGitTags: vi.fn(),
    readPackageJson: vi.fn(),
    getRootPackage: vi.fn(),
    resolveTags: vi.fn(),
    generateChangelog: vi.fn(),
    writeChangelogToFile: vi.fn(),
    createCommitAndTags: vi.fn(),
    pushCommitAndTags: vi.fn(),
    publishPackages: vi.fn(),
    getPackagesOrBumpedPackages: vi.fn(),
    expandPackagesToBumpWithDependents: vi.fn(),
    getIndependentTag: vi.fn(),
  }
})

vi.mock('../../src/commands/bump')
vi.mock('../../src/commands/changelog')
vi.mock('../../src/commands/publish')
vi.mock('../../src/commands/provider-release')
vi.mock('../../src/commands/social')

describe('Given independent mode release workflow', () => {
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
      monorepo: {
        versionMode: 'independent',
        packages: ['packages/*'],
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
    vi.mocked(readPackageJson).mockReturnValue({
      name: 'test-monorepo',
      version: '1.0.0',
      path: '/root',
      private: false,
    })
    vi.mocked(getRootPackage).mockResolvedValue({
      name: 'test-monorepo',
      version: '1.0.0',
      path: '/root',
      private: false,
      fromTag: 'v0.9.0',
      commits: [],
    })
    vi.mocked(resolveTags).mockResolvedValue({ from: 'v0.9.0', to: 'v1.0.0' })
    vi.mocked(generateChangelog).mockResolvedValue('## v1.0.0\n\n- Feature')
    vi.mocked(getIndependentTag).mockImplementation(({ name, version }) => {
      return `${name}@${version}`
    })
    vi.mocked(bump).mockResolvedValue({
      newVersion: '1.0.0',
      bumpedPackages: [
        { name: 'pkg-a', version: '1.0.0', newVersion: '1.1.0', path: '/packages/pkg-a' },
        { name: 'pkg-b', version: '2.0.0', newVersion: '2.0.1', path: '/packages/pkg-b' },
      ],
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

  describe('When bumping packages independently', () => {
    it('Then each package gets its own version', async () => {
      await release({})

      expect(bump).toHaveBeenCalled()
      expect(changelog).toHaveBeenCalledWith(
        expect.objectContaining({
          bumpResult: expect.objectContaining({
            bumpedPackages: expect.arrayContaining([
              expect.objectContaining({ name: 'pkg-a', newVersion: '1.1.0' }),
              expect.objectContaining({ name: 'pkg-b', newVersion: '2.0.1' }),
            ]),
          }),
        }),
      )
    })

    it('Then root package version stays separate', async () => {
      await release({})

      expect(changelog).toHaveBeenCalledWith(
        expect.objectContaining({
          bumpResult: expect.objectContaining({ newVersion: '1.0.0' }),
        }),
      )
    })
  })

  describe('When packages have different bump types', () => {
    it('Then applies correct bump to each package', async () => {
      vi.mocked(bump).mockResolvedValue({
        newVersion: '1.0.0',
        bumpedPackages: [
          { name: 'pkg-a', version: '1.0.0', newVersion: '2.0.0', path: '/packages/pkg-a' },
          { name: 'pkg-b', version: '2.0.0', newVersion: '2.0.1', path: '/packages/pkg-b' },
          { name: 'pkg-c', version: '3.0.0', newVersion: '3.1.0', path: '/packages/pkg-c' },
        ],
        bumped: true,
        fromTag: 'v0.9.0',
      } as any)

      await release({})

      expect(changelog).toHaveBeenCalledWith(
        expect.objectContaining({
          bumpResult: expect.objectContaining({
            bumpedPackages: expect.arrayContaining([
              expect.objectContaining({ name: 'pkg-a', newVersion: '2.0.0' }),
              expect.objectContaining({ name: 'pkg-b', newVersion: '2.0.1' }),
              expect.objectContaining({ name: 'pkg-c', newVersion: '3.1.0' }),
            ]),
          }),
        }),
      )
    })
  })

  describe('When creating changelogs independently', () => {
    it('Then generates changelog for each package', async () => {
      await release({})

      expect(changelog).toHaveBeenCalled()
    })

    it('Then generates changelog for root package', async () => {
      await release({})

      expect(changelog).toHaveBeenCalledWith(
        expect.objectContaining({
          bumpResult: expect.objectContaining({ newVersion: '1.0.0' }),
        }),
      )
    })
  })

  describe('When publishing independently', () => {
    it('Then publishes each bumped package', async () => {
      await release({})

      expect(publish).toHaveBeenCalledWith(
        expect.objectContaining({
          bumpResult: expect.objectContaining({
            bumpedPackages: expect.arrayContaining([
              expect.objectContaining({ name: 'pkg-a' }),
              expect.objectContaining({ name: 'pkg-b' }),
            ]),
          }),
        }),
      )
    })
  })

  describe('When creating provider releases independently', () => {
    it('Then creates release for each package', async () => {
      await release({})

      expect(providerRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          bumpResult: expect.objectContaining({
            bumpedPackages: expect.arrayContaining([
              expect.objectContaining({ name: 'pkg-a' }),
              expect.objectContaining({ name: 'pkg-b' }),
            ]),
          }),
        }),
      )
    })
  })

  describe('When posting to social media independently', () => {
    it('Then posts for each package', async () => {
      await release({})

      expect(social).toHaveBeenCalledWith(
        expect.objectContaining({
          bumpResult: expect.objectContaining({
            bumpedPackages: expect.arrayContaining([
              expect.objectContaining({ name: 'pkg-a' }),
              expect.objectContaining({ name: 'pkg-b' }),
            ]),
          }),
        }),
      )
    })
  })

  describe('When only one package has changes', () => {
    it('Then only bumps that package', async () => {
      vi.mocked(bump).mockResolvedValue({
        newVersion: '1.0.0',
        bumpedPackages: [
          { name: 'pkg-a', version: '1.0.0', newVersion: '1.1.0', path: '/packages/pkg-a' },
        ],
        bumped: true,
        fromTag: 'v0.9.0',
      } as any)

      await release({})

      expect(changelog).toHaveBeenCalledWith(
        expect.objectContaining({
          bumpResult: expect.objectContaining({
            bumpedPackages: expect.arrayContaining([
              expect.objectContaining({ name: 'pkg-a', newVersion: '1.1.0' }),
            ]),
          }),
        }),
      )
    })
  })

  describe('When dependent packages exist', () => {
    it('Then bumps dependent packages with minimum patch', async () => {
      vi.mocked(bump).mockResolvedValue({
        newVersion: '1.0.0',
        bumpedPackages: [
          { name: 'pkg-core', version: '1.0.0', newVersion: '2.0.0', path: '/packages/core' },
          { name: 'pkg-app', version: '1.0.0', newVersion: '1.0.1', path: '/packages/app' },
        ],
        bumped: true,
        fromTag: 'v0.9.0',
      } as any)

      await release({})

      expect(changelog).toHaveBeenCalledWith(
        expect.objectContaining({
          bumpResult: expect.objectContaining({
            bumpedPackages: expect.arrayContaining([
              expect.objectContaining({ name: 'pkg-core', newVersion: '2.0.0' }),
              expect.objectContaining({ name: 'pkg-app', newVersion: '1.0.1' }),
            ]),
          }),
        }),
      )
    })
  })

  describe('When using force option', () => {
    it('Then forces bump for all packages', async () => {
      await release({ force: true })

      expect(bump).toHaveBeenCalledWith(
        expect.objectContaining({ force: true }),
      )
    })
  })

  describe('When using suffix option', () => {
    it('Then applies suffix to all package versions', async () => {
      await release({ suffix: 'beta' })

      expect(bump).toHaveBeenCalledWith(
        expect.objectContaining({ suffix: 'beta' }),
      )
    })
  })

  describe('When workflow executes in dry-run mode', () => {
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

  describe('When skipping steps in independent mode', () => {
    it('Then respects skip flags', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.monorepo = {
        versionMode: 'independent',
        packages: ['packages/*'],
      }
      config.release = {
        commit: true,
        changelog: false,
        publish: false,
        push: true,
        providerRelease: false,
        social: false,
        prComment: true,
        clean: true,
        noVerify: false,
        gitTag: true,
      }
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await release({})

      expect(bump).toHaveBeenCalled()
      expect(changelog).not.toHaveBeenCalled()
      expect(publish).not.toHaveBeenCalled()
      expect(providerRelease).not.toHaveBeenCalled()
      expect(social).not.toHaveBeenCalled()
    })
  })

  describe('When error occurs during bump', () => {
    it('Then executes error hook', async () => {
      vi.mocked(bump).mockRejectedValue(new Error('Bump failed'))

      await expect(release({})).rejects.toThrow('Bump failed')

      expect(executeHook).toHaveBeenCalledWith('error:release', expect.any(Object), false)
    })

    it('Then stops execution', async () => {
      vi.mocked(bump).mockRejectedValue(new Error('Bump failed'))

      await expect(release({})).rejects.toThrow()

      expect(changelog).not.toHaveBeenCalled()
      expect(publish).not.toHaveBeenCalled()
    })
  })

  describe('When error occurs during changelog', () => {
    it('Then executes error hook and stops', async () => {
      vi.mocked(changelog).mockRejectedValue(new Error('Changelog failed'))

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

  describe('When packages have different prerelease identifiers', () => {
    it('Then maintains separate prerelease tracks', async () => {
      vi.mocked(bump).mockResolvedValue({
        newVersion: '1.0.0',
        bumpedPackages: [
          { name: 'pkg-a', version: '1.0.0-alpha.0', newVersion: '1.0.0-alpha.1', path: '/pkg-a' },
          { name: 'pkg-b', version: '2.0.0-beta.0', newVersion: '2.0.0-beta.1', path: '/pkg-b' },
        ],
        bumped: true,
        fromTag: 'v0.9.0',
      } as any)

      await release({})

      expect(changelog).toHaveBeenCalledWith(
        expect.objectContaining({
          bumpResult: expect.objectContaining({
            bumpedPackages: expect.arrayContaining([
              expect.objectContaining({ newVersion: '1.0.0-alpha.1' }),
              expect.objectContaining({ newVersion: '2.0.0-beta.1' }),
            ]),
          }),
        }),
      )
    })
  })

  describe('When workflow completes successfully', () => {
    it('Then executes success hook', async () => {
      await release({})

      expect(executeHook).toHaveBeenCalledWith('success:release', expect.any(Object), false)
    })

    it('Then all enabled steps are executed', async () => {
      await release({})

      expect(bump).toHaveBeenCalled()
      expect(changelog).toHaveBeenCalled()
      expect(publish).toHaveBeenCalled()
      expect(providerRelease).toHaveBeenCalled()
      expect(social).toHaveBeenCalled()
    })
  })

  describe('When clean is disabled', () => {
    it('Then skips git status check', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.monorepo = {
        versionMode: 'independent',
        packages: ['packages/*'],
      }
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

  describe('When using custom config name', () => {
    it('Then loads custom config', async () => {
      await release({ configName: 'custom' })

      expect(bump).toHaveBeenCalledWith(
        expect.objectContaining({ configName: 'custom' }),
      )
    })
  })
})
