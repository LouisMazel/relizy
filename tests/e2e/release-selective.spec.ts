import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bump } from '../../src/commands/bump'
import { changelog } from '../../src/commands/changelog'
import { providerRelease } from '../../src/commands/provider-release'
import { publish } from '../../src/commands/publish'
import { release } from '../../src/commands/release'
import { social } from '../../src/commands/social'
import { checkGitStatusIfDirty, executeHook, fetchGitTags, generateChangelog, getRootPackage, loadRelizyConfig, readPackageJson, resolveTags } from '../../src/core'
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
  }
})

vi.mock('../../src/commands/bump')
vi.mock('../../src/commands/changelog')
vi.mock('../../src/commands/publish')
vi.mock('../../src/commands/provider-release')
vi.mock('../../src/commands/social')

describe('Given selective mode release workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const config = createMockConfig({
      bump: { type: 'patch' },
      monorepo: {
        versionMode: 'selective',
        packages: ['packages/*'],
      },
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

  describe('When bumping packages with changes', () => {
    it('Then only bumps packages with commits', async () => {
      vi.mocked(bump).mockResolvedValue({
        newVersion: '1.0.0',
        bumpedPackages: [
          { name: 'pkg-a', version: '1.0.0', newVersion: '1.0.1', path: '/packages/pkg-a' },
        ],
        bumped: true,
        fromTag: 'v0.9.0',
      } as any)

      await release({})

      expect(bump).toHaveBeenCalled()
      expect(changelog).toHaveBeenCalledWith(
        expect.objectContaining({
          bumpResult: expect.objectContaining({
            bumpedPackages: expect.arrayContaining([
              expect.objectContaining({ name: 'pkg-a' }),
            ]),
          }),
        }),
      )
    })

    it('Then bumps dependent packages', async () => {
      vi.mocked(bump).mockResolvedValue({
        newVersion: '1.0.0',
        bumpedPackages: [
          { name: 'pkg-a', version: '1.0.0', newVersion: '1.0.1', path: '/packages/pkg-a' },
          { name: 'pkg-b', version: '1.0.0', newVersion: '1.0.1', path: '/packages/pkg-b' },
        ],
        bumped: true,
        fromTag: 'v0.9.0',
      } as any)

      await release({})

      expect(changelog).toHaveBeenCalledWith(
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

  describe('When no packages have changes', () => {
    it('Then still executes workflow', async () => {
      vi.mocked(bump).mockResolvedValue({
        newVersion: '1.0.0',
        bumpedPackages: [],
        bumped: false,
        fromTag: 'v0.9.0',
      } as any)
      vi.mocked(bump).mockResolvedValue({
        newVersion: '1.0.0',
        bumpedPackages: [],
        bumped: true,
        fromTag: 'v0.9.0',
      } as any)

      await release({})

      expect(changelog).toHaveBeenCalled()
      expect(publish).toHaveBeenCalled()
    })
  })

  describe('When using unified version for all packages', () => {
    it('Then all packages get same version', async () => {
      vi.mocked(loadRelizyConfig).mockResolvedValue(createMockConfig({
        bump: { type: 'major' },
      }))

      await release({ type: 'major' })

      expect(bump).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'major' }),
      )
    })
  })

  describe('When publishing selectively bumped packages', () => {
    it('Then only publishes bumped packages', async () => {
      vi.mocked(bump).mockResolvedValue({
        newVersion: '1.0.0',
        bumpedPackages: [
          { name: 'pkg-a', version: '1.0.0', newVersion: '1.0.1', path: '/packages/pkg-a' },
        ],
        bumped: true,
        fromTag: 'v0.9.0',
      } as any)

      await release({})

      expect(publish).toHaveBeenCalledWith(
        expect.objectContaining({
          bumpResult: expect.objectContaining({
            bumpedPackages: expect.arrayContaining([
              expect.objectContaining({ name: 'pkg-a' }),
            ]),
          }),
        }),
      )
    })
  })

  describe('When creating changelogs for selective packages', () => {
    it('Then generates changelog for root and bumped packages', async () => {
      vi.mocked(bump).mockResolvedValue({
        newVersion: '1.0.0',
        bumpedPackages: [
          { name: 'pkg-a', version: '1.0.0', newVersion: '1.0.1', path: '/packages/pkg-a' },
        ],
        bumped: true,
        fromTag: 'v0.9.0',
      } as any)

      await release({})

      expect(changelog).toHaveBeenCalled()
    })
  })

  describe('When creating provider releases', () => {
    it('Then creates unified release for root package', async () => {
      vi.mocked(bump).mockResolvedValue({
        newVersion: '1.0.0',
        bumpedPackages: [
          { name: 'pkg-a', version: '1.0.0', newVersion: '1.0.1', path: '/packages/pkg-a' },
        ],
        bumped: true,
        fromTag: 'v0.9.0',
      } as any)

      await release({})

      expect(providerRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          bumpResult: expect.objectContaining({ newVersion: '1.0.0' }),
        }),
      )
    })
  })

  describe('When posting to social media', () => {
    it('Then posts unified release announcement', async () => {
      vi.mocked(bump).mockResolvedValue({
        newVersion: '1.0.0',
        bumpedPackages: [
          { name: 'pkg-a', version: '1.0.0', newVersion: '1.0.1', path: '/packages/pkg-a' },
        ],
        bumped: true,
        fromTag: 'v0.9.0',
      } as any)

      await release({})

      expect(social).toHaveBeenCalled()
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
  })

  describe('When multiple packages depend on each other', () => {
    it('Then bumps all packages in dependency chain', async () => {
      vi.mocked(bump).mockResolvedValue({
        newVersion: '1.0.0',
        bumpedPackages: [
          { name: 'pkg-core', version: '1.0.0', newVersion: '1.1.0', path: '/packages/core' },
          { name: 'pkg-utils', version: '1.0.0', newVersion: '1.0.1', path: '/packages/utils' },
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
              expect.objectContaining({ name: 'pkg-core' }),
              expect.objectContaining({ name: 'pkg-utils' }),
              expect.objectContaining({ name: 'pkg-app' }),
            ]),
          }),
        }),
      )
    })
  })

  describe('When error occurs in selective mode', () => {
    it('Then executes error hook', async () => {
      vi.mocked(bump).mockRejectedValue(new Error('Bump failed'))

      await expect(release({})).rejects.toThrow('Bump failed')

      expect(executeHook).toHaveBeenCalledWith('error:release', expect.any(Object), false)
    })

    it('Then stops execution', async () => {
      vi.mocked(changelog).mockRejectedValue(new Error('Changelog failed'))

      await expect(release({})).rejects.toThrow('Changelog failed')

      expect(publish).not.toHaveBeenCalled()
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
    it('Then applies suffix to bumped versions', async () => {
      await release({ suffix: 'beta' })

      expect(bump).toHaveBeenCalledWith(
        expect.objectContaining({ suffix: 'beta' }),
      )
    })
  })

  describe('When skipping steps in selective mode', () => {
    it('Then respects skip flags', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.monorepo = {
        versionMode: 'selective',
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
})
