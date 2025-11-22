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
    const config = createMockConfig({ bump: { type: 'patch' } })
    config.monorepo = {
      versionMode: 'selective',
      packages: ['packages/*'],
    }
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
      name: 'test-monorepo',
      version: '1.0.0',
      path: '/root',
    })
    vi.mocked(core.getRootPackage).mockResolvedValue({
      name: 'test-monorepo',
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
      expect(changelogCmd).toHaveBeenCalledWith(
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

      expect(changelogCmd).toHaveBeenCalledWith(
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

      await release({})

      expect(changelogCmd).toHaveBeenCalled()
      expect(publishCmd).toHaveBeenCalled()
    })
  })

  describe('When using unified version for all packages', () => {
    it('Then all packages get same version', async () => {
      vi.mocked(bump).mockResolvedValue({
        newVersion: '2.0.0',
        bumpedPackages: [
          { name: 'pkg-a', version: '1.0.0', newVersion: '2.0.0', path: '/packages/pkg-a' },
          { name: 'pkg-b', version: '1.0.0', newVersion: '2.0.0', path: '/packages/pkg-b' },
        ],
        bumped: true,
        fromTag: 'v1.0.0',
      } as any)

      await release({ releaseType: 'major' })

      expect(bump).toHaveBeenCalledWith(
        expect.objectContaining({ releaseType: 'major' }),
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

      expect(publishCmd).toHaveBeenCalledWith(
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

      expect(changelogCmd).toHaveBeenCalled()
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

      expect(providerReleaseCmd).toHaveBeenCalledWith(
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

      expect(socialCmd).toHaveBeenCalled()
    })
  })

  describe('When workflow executes in dry-run mode', () => {
    it('Then passes dryRun to all commands', async () => {
      await release({ dryRun: true })

      expect(bump).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))
      expect(changelogCmd).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))
      expect(publishCmd).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))
      expect(providerReleaseCmd).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))
      expect(socialCmd).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))
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

      expect(changelogCmd).toHaveBeenCalledWith(
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

      expect(core.executeHook).toHaveBeenCalledWith('error:release', expect.any(Object), false)
    })

    it('Then stops execution', async () => {
      vi.mocked(changelogCmd).mockRejectedValue(new Error('Changelog failed'))

      await expect(release({})).rejects.toThrow('Changelog failed')

      expect(publishCmd).not.toHaveBeenCalled()
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
        clean: true,
        noVerify: false,
        gitTag: true,
      }
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)

      await release({})

      expect(bump).toHaveBeenCalled()
      expect(changelogCmd).not.toHaveBeenCalled()
      expect(publishCmd).not.toHaveBeenCalled()
      expect(providerReleaseCmd).not.toHaveBeenCalled()
      expect(socialCmd).not.toHaveBeenCalled()
    })
  })

  describe('When workflow completes successfully', () => {
    it('Then executes success hook', async () => {
      await release({})

      expect(core.executeHook).toHaveBeenCalledWith('success:release', expect.any(Object), false)
    })

    it('Then all enabled steps are executed', async () => {
      await release({})

      expect(bump).toHaveBeenCalled()
      expect(changelogCmd).toHaveBeenCalled()
      expect(publishCmd).toHaveBeenCalled()
      expect(providerReleaseCmd).toHaveBeenCalled()
      expect(socialCmd).toHaveBeenCalled()
    })
  })
})
