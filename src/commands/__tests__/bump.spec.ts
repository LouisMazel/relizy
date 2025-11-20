import { exit } from 'node:process'
import { logger } from '@maz-ui/node'
import { vol } from 'memfs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockCommit } from '../../../tests/mocks'
import * as core from '../../core'
import { bump } from '../bump'

logger.setLevel('error')

// Mock file system
vi.mock('node:fs', async () => {
  const memfs = await import('memfs')
  return memfs.fs
})

vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs')
  return memfs.fs.promises
})

vi.mock('node:process', () => ({
  exit: vi.fn(),
}))

// Mock core functions
vi.mock('../../core', () => ({
  checkGitStatusIfDirty: vi.fn(),
  confirmBump: vi.fn(() => true),
  fetchGitTags: vi.fn(() => {}),
  getBumpedIndependentPackages: vi.fn((args) => {
    return args.packages.map((pkg: any) => ({
      ...pkg,
      oldVersion: pkg.version,
    }))
  }),
  getPackages: vi.fn(() => []),
  getRootPackage: vi.fn(() => ({
    name: 'root-package',
    version: '1.0.0',
    newVersion: '1.1.0',
    path: '/test-repo',
    private: false,
    fromTag: 'v1.0.0',
    commits: [],
  })),
  loadRelizyConfig: vi.fn((args) => {
    const defaultConfig = {
      cwd: '/test-repo',
      bump: {
        type: args?.overrides?.bump?.type || 'release',
        yes: args?.overrides?.bump?.yes ?? false,
        clean: args?.overrides?.bump?.clean ?? false,
        preid: args?.overrides?.bump?.preid,
      },
      release: {
        clean: false,
      },
      monorepo: undefined,
      types: {
        feat: { title: 'Features', semver: 'minor' },
        fix: { title: 'Bug Fixes', semver: 'patch' },
      },
      templates: {
        tagBody: 'v{{newVersion}}',
      },
      logLevel: 'default',
    }
    return defaultConfig as any
  }),
  readPackageJson: vi.fn(() => ({
    name: 'root-package',
    version: '1.0.0',
    path: '/test-repo',
    private: false,
  })),
  readPackages: vi.fn(() => [
    {
      name: 'pkg-a',
      version: '1.0.0',
      path: '/test-repo/packages/pkg-a',
      private: false,
    },
    {
      name: 'pkg-b',
      version: '1.0.0',
      path: '/test-repo/packages/pkg-b',
      private: false,
    },
  ]),
  resolveTags: vi.fn(() => ({ from: 'v1.0.0', to: 'HEAD' })),
  updateLernaVersion: vi.fn(),
  writeVersion: vi.fn(),
}))

vi.mock('../../core/utils', () => ({
  executeHook: vi.fn(() => {}),
}))

describe('Given bump command', () => {
  const mockCwd = '/test-repo'

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup mock file system
    vol.fromJSON(
      {
        [`${mockCwd}/package.json`]: JSON.stringify({
          name: 'root-package',
          version: '1.0.0',
        }),
        [`${mockCwd}/packages/pkg-a/package.json`]: JSON.stringify({
          name: 'pkg-a',
          version: '1.0.0',
        }),
        [`${mockCwd}/packages/pkg-b/package.json`]: JSON.stringify({
          name: 'pkg-b',
          version: '1.0.0',
        }),
      },
      mockCwd,
    )
  })

  afterEach(() => {
    vol.reset()
  })

  describe('When running in unified mode', () => {
    it('Then successfully updates all package versions to same version', async () => {
      vi.mocked(core.loadRelizyConfig).mockResolvedValueOnce({
        cwd: mockCwd,
        bump: {
          type: 'minor',
          yes: true,
          clean: false,
          dependencyTypes: ['dependencies'],
        },
        release: { clean: false },
        monorepo: {
          versionMode: 'unified',
          packages: ['packages/*'],
        },
        types: {
          feat: { title: 'Features', semver: 'minor' },
          fix: { title: 'Bug Fixes', semver: 'patch' },
        },
        templates: {
          commitMessage: 'chore: bump version {{newVersion}}',
          tagBody: 'v{{newVersion}}',
          tagMessage: 'chore: bump version {{newVersion}}',
          emptyChangelogContent: 'No changes',
        },
        logLevel: 'default',
      } as unknown as core.ResolvedRelizyConfig)

      vi.mocked(core.getRootPackage).mockResolvedValueOnce({
        name: 'root-package',
        private: false,
        version: '1.0.0',
        newVersion: '1.1.0',
        path: mockCwd,
        fromTag: 'v1.0.0',
        commits: [createMockCommit('feat', 'add feature')],
      })

      vi.mocked(core.getPackages).mockResolvedValueOnce([
        {
          name: 'pkg-a',
          version: '1.0.0',
          path: `${mockCwd}/packages/pkg-a`,
          newVersion: '1.1.0',
          reason: 'commits',
          commits: [createMockCommit('feat', 'add feature')],
          fromTag: 'v1.0.0',
          dependencies: [],
          private: false,
        },
        {
          name: 'pkg-b',
          version: '1.0.0',
          path: `${mockCwd}/packages/pkg-b`,
          newVersion: '1.1.0',
          reason: 'commits',
          commits: [],
          fromTag: 'v1.0.0',
          dependencies: [],
          private: false,
        },
      ])

      const result = await bump({
        type: 'minor',
        yes: true,
      })

      expect(result.bumped).toBe(true)
      if (result.bumped) {
        expect(result.newVersion).toBe('1.1.0')
        expect(result.oldVersion).toBe('1.0.0')
      }
      expect(vi.mocked(core.writeVersion)).toHaveBeenCalled()
    })

    it('Then writes correct versions to package.json files', async () => {
      vi.mocked(core.loadRelizyConfig).mockResolvedValueOnce({
        cwd: mockCwd,
        bump: {
          type: 'patch',
          yes: true,
        },
        release: { clean: false },
        monorepo: {
          versionMode: 'unified',
          packages: ['packages/*'],
        },
        types: {},
        templates: { tagBody: 'v{{newVersion}}' },
        logLevel: 'default',
      } as unknown as core.ResolvedRelizyConfig)

      vi.mocked(core.getRootPackage).mockResolvedValueOnce({
        name: 'root-package',
        version: '1.0.0',
        newVersion: '1.0.1',
        path: mockCwd,
        fromTag: 'v1.0.0',
        commits: [createMockCommit('fix', 'fix bug')],
        private: false,
      })

      vi.mocked(core.getPackages).mockResolvedValueOnce([
        {
          name: 'pkg-a',
          version: '1.0.0',
          path: `${mockCwd}/packages/pkg-a`,
          newVersion: '1.0.1',
          fromTag: 'v1.0.0',
          commits: [],
          dependencies: [],
          private: false,
        },
      ])

      await bump({
        type: 'patch',
        yes: true,
      })

      expect(vi.mocked(core.writeVersion)).toHaveBeenCalledWith(mockCwd, '1.0.1', false)
      expect(vi.mocked(core.writeVersion)).toHaveBeenCalledWith(
        `${mockCwd}/packages/pkg-a`,
        '1.0.1',
        false,
      )
    })

    it('Then updates lerna.json in unified mode', async () => {
      vi.mocked(core.loadRelizyConfig).mockResolvedValueOnce({
        cwd: mockCwd,
        bump: {
          type: 'minor',
          yes: true,
        },
        release: { clean: false },
        monorepo: {
          versionMode: 'unified',
          packages: ['packages/*'],
        },
        types: {},
        templates: { tagBody: 'v{{newVersion}}' },
        logLevel: 'default',
      } as unknown as core.ResolvedRelizyConfig)

      vi.mocked(core.getRootPackage).mockResolvedValueOnce({
        name: 'root-package',
        version: '1.0.0',
        newVersion: '1.1.0',
        path: mockCwd,
        fromTag: 'v1.0.0',
        commits: [],
        private: false,
      })

      vi.mocked(core.getPackages).mockResolvedValueOnce([
        {
          name: 'pkg-a',
          version: '1.0.0',
          path: `${mockCwd}/packages/pkg-a`,
          newVersion: '1.1.0',
          fromTag: 'v1.0.0',
          commits: [],
          dependencies: [],
          private: false,
        },
      ])

      await bump({
        type: 'minor',
        yes: true,
      })

      expect(vi.mocked(core.updateLernaVersion)).toHaveBeenCalledWith({
        rootDir: mockCwd,
        versionMode: 'unified',
        version: '1.1.0',
        dryRun: false,
      })
    })
  })

  describe('When running in independent mode', () => {
    it('Then updates each package with its own version', async () => {
      vi.mocked(core.loadRelizyConfig).mockResolvedValueOnce({
        cwd: mockCwd,
        bump: {
          type: 'release',
          yes: true,
        },
        release: { clean: false },
        monorepo: {
          versionMode: 'independent',
          packages: ['packages/*'],
        },
        types: {
          feat: { semver: 'minor' },
          fix: { semver: 'patch' },
        },
        templates: { tagBody: 'v{{newVersion}}' },
        logLevel: 'default',
      } as unknown as core.ResolvedRelizyConfig)

      vi.mocked(core.getPackages).mockResolvedValueOnce([
        {
          name: 'pkg-a',
          version: '1.0.0',
          newVersion: '1.1.0',
          path: `${mockCwd}/packages/pkg-a`,
          reason: 'commits',
          commits: [createMockCommit('feat', 'add feature to pkg-a')],
          fromTag: 'v1.0.0',
          private: false,
          dependencies: [],
        },
        {
          name: 'pkg-b',
          version: '2.0.0',
          newVersion: '2.0.1',
          path: `${mockCwd}/packages/pkg-b`,
          reason: 'commits',
          commits: [createMockCommit('fix', 'fix bug in pkg-b')],
          fromTag: 'v2.0.0',
          private: false,
          dependencies: [],
        },
      ])

      const result = await bump({
        type: 'release',
        yes: true,
      })

      expect(result.bumped).toBe(true)
      if (result.bumped) {
        expect(result.bumpedPackages).toHaveLength(2)
        expect(result.bumpedPackages?.[0].name).toBe('pkg-a')
        expect(result.bumpedPackages?.[1].name).toBe('pkg-b')
      }
    })

    it('Then writes different versions for each package', async () => {
      vi.mocked(core.loadRelizyConfig).mockResolvedValueOnce({
        cwd: mockCwd,
        bump: {
          type: 'release',
          yes: true,
        },
        release: { clean: false },
        monorepo: {
          versionMode: 'independent',
          packages: ['packages/*'],
        },
        types: {
          feat: { semver: 'minor' },
          fix: { semver: 'patch' },
        },
        templates: { tagBody: '{{newVersion}}' },
        logLevel: 'default',
      } as unknown as core.ResolvedRelizyConfig)

      vi.mocked(core.getPackages).mockResolvedValueOnce([
        {
          name: 'pkg-a',
          version: '1.0.0',
          newVersion: '1.1.0',
          path: `${mockCwd}/packages/pkg-a`,
          reason: 'commits',
          fromTag: 'v1.0.0',
          commits: [],
          dependencies: [],
          private: false,
        },
        {
          name: 'pkg-b',
          version: '2.0.0',
          newVersion: '2.0.1',
          path: `${mockCwd}/packages/pkg-b`,
          reason: 'commits',
          fromTag: 'v2.0.0',
          commits: [],
          dependencies: [],
          private: false,
        },
      ])

      vi.mocked(core.getBumpedIndependentPackages).mockReturnValueOnce([
        {
          name: 'pkg-a',
          version: '1.0.0',
          newVersion: '1.1.0',
          path: `${mockCwd}/packages/pkg-a`,
          fromTag: 'v1.0.0',
          commits: [],
          dependencies: [],
          private: false,
        },
        {
          name: 'pkg-b',
          version: '2.0.0',
          newVersion: '2.0.1',
          path: `${mockCwd}/packages/pkg-b`,
          fromTag: 'v2.0.0',
          commits: [],
          dependencies: [],
          private: false,
        },
      ])

      await bump({
        type: 'release',
        yes: true,
      })

      expect(vi.mocked(core.getBumpedIndependentPackages)).toHaveBeenCalledWith({
        packages: expect.any(Array),
        dryRun: false,
      })
    })

    it('Then does not update lerna.json in independent mode', async () => {
      vi.mocked(core.loadRelizyConfig).mockResolvedValueOnce({
        cwd: mockCwd,
        bump: {
          type: 'release',
          yes: true,
        },
        release: { clean: false },
        monorepo: {
          versionMode: 'independent',
          packages: ['packages/*'],
        },
        types: {},
        templates: { tagBody: '{{newVersion}}' },
        logLevel: 'default',
      } as unknown as core.ResolvedRelizyConfig)

      vi.mocked(core.getPackages).mockResolvedValueOnce([
        {
          name: 'pkg-a',
          version: '1.0.0',
          newVersion: '1.1.0',
          path: `${mockCwd}/packages/pkg-a`,
          fromTag: 'v1.0.0',
          commits: [],
          dependencies: [],
          private: false,
        },
      ])

      await bump({
        type: 'release',
        yes: true,
      })

      // In independent mode, updateLernaVersion should not update version
      expect(vi.mocked(core.updateLernaVersion)).not.toHaveBeenCalled()
    })
  })

  describe('When running in selective mode', () => {
    it('Then only bumps packages with commits', async () => {
      vi.mocked(core.loadRelizyConfig).mockResolvedValueOnce({
        cwd: mockCwd,
        bump: {
          type: 'release',
          yes: true,
        },
        release: { clean: false },
        monorepo: {
          versionMode: 'selective',
          packages: ['packages/*'],
        },
        types: {
          feat: { semver: 'minor' },
        },
        templates: { tagBody: 'v{{newVersion}}' },
        logLevel: 'default',
      } as unknown as core.ResolvedRelizyConfig)

      vi.mocked(core.getRootPackage).mockResolvedValueOnce({
        name: 'root-package',
        version: '1.0.0',
        newVersion: '1.1.0',
        path: mockCwd,
        fromTag: 'v1.0.0',
        commits: [createMockCommit('feat', 'feature')],
        private: false,
      })

      vi.mocked(core.getPackages).mockResolvedValueOnce([
        {
          name: 'pkg-a',
          version: '1.0.0',
          newVersion: '1.1.0',
          path: `${mockCwd}/packages/pkg-a`,
          reason: 'commits',
          commits: [createMockCommit('feat', 'feature in pkg-a')],
          fromTag: 'v1.0.0',
          dependencies: [],
          private: false,
        },
      ])

      const result = await bump({
        type: 'release',
        yes: true,
      })

      expect(result.bumped).toBe(true)

      if (result.bumped) {
        expect(result.bumpedPackages).toHaveLength(1)
        expect(result.bumpedPackages?.[0].reason).toBe('commits')
      }
    })

    it('Then bumps dependent packages in selective mode', async () => {
      vi.mocked(core.loadRelizyConfig).mockResolvedValueOnce({
        cwd: mockCwd,
        bump: {
          type: 'release',
          yes: true,
        },
        release: { clean: false },
        monorepo: {
          versionMode: 'selective',
          packages: ['packages/*'],
        },
        types: {
          feat: { semver: 'minor' },
        },
        templates: { tagBody: 'v{{newVersion}}' },
        logLevel: 'default',
      } as unknown as core.ResolvedRelizyConfig)

      vi.mocked(core.getRootPackage).mockResolvedValueOnce({
        name: 'root-package',
        version: '1.0.0',
        newVersion: '1.1.0',
        path: mockCwd,
        fromTag: 'v1.0.0',
        commits: [createMockCommit('feat', 'feature')],
        private: false,
      })

      vi.mocked(core.getPackages).mockResolvedValueOnce([
        {
          name: 'pkg-a',
          version: '1.0.0',
          newVersion: '1.1.0',
          path: `${mockCwd}/packages/pkg-a`,
          reason: 'commits',
          fromTag: 'v1.0.0',
          commits: [],
          dependencies: [],
          private: false,
        },
        {
          name: 'pkg-b',
          version: '1.0.0',
          newVersion: '1.1.0',
          path: `${mockCwd}/packages/pkg-b`,
          reason: 'dependency',
          fromTag: 'v1.0.0',
          dependencyChain: ['pkg-a'],
          commits: [],
          dependencies: [],
          private: false,
        },
      ])

      const result = await bump({
        type: 'release',
        yes: true,
      })

      expect(result.bumped).toBe(true)

      if (result.bumped) {
        expect(result.bumpedPackages).toHaveLength(2)
        expect(result.bumpedPackages?.some(p => p.reason === 'dependency')).toBe(true)
      }
    })

    it('Then writes root and selected packages with same version', async () => {
      vi.mocked(core.loadRelizyConfig).mockResolvedValueOnce({
        cwd: mockCwd,
        bump: {
          type: 'patch',
          yes: true,
        },
        release: { clean: false },
        monorepo: {
          versionMode: 'selective',
          packages: ['packages/*'],
        },
        types: {},
        templates: { tagBody: 'v{{newVersion}}' },
        logLevel: 'default',
      } as unknown as core.ResolvedRelizyConfig)

      vi.mocked(core.getRootPackage).mockResolvedValueOnce({
        name: 'root-package',
        version: '1.0.0',
        newVersion: '1.0.1',
        path: mockCwd,
        fromTag: 'v1.0.0',
        commits: [],
        private: false,
      })

      vi.mocked(core.getPackages).mockResolvedValueOnce([
        {
          name: 'pkg-a',
          version: '1.0.0',
          newVersion: '1.0.1',
          path: `${mockCwd}/packages/pkg-a`,
          reason: 'commits',
          fromTag: 'v1.0.0',
          commits: [],
          dependencies: [],
          private: false,
        },
      ])

      await bump({
        type: 'patch',
        yes: true,
      })

      expect(vi.mocked(core.writeVersion)).toHaveBeenCalledWith(mockCwd, '1.0.1', false)
      expect(vi.mocked(core.writeVersion)).toHaveBeenCalledWith(
        `${mockCwd}/packages/pkg-a`,
        '1.0.1',
        false,
      )
    })
  })

  describe('When using dry-run mode', () => {
    it('Then does not write files in dry-run', async () => {
      vi.mocked(core.loadRelizyConfig).mockResolvedValueOnce({
        cwd: mockCwd,
        bump: {
          type: 'minor',
          yes: true,
        },
        release: { clean: false },
        monorepo: {
          versionMode: 'unified',
          packages: ['packages/*'],
        },
        types: {},
        templates: { tagBody: 'v{{newVersion}}' },
        logLevel: 'default',
      } as unknown as core.ResolvedRelizyConfig)

      vi.mocked(core.getRootPackage).mockResolvedValueOnce({
        name: 'root-package',
        version: '1.0.0',
        newVersion: '1.1.0',
        path: mockCwd,
        fromTag: 'v1.0.0',
        commits: [],
        private: false,
      })

      vi.mocked(core.getPackages).mockResolvedValueOnce([])

      try {
        await bump({
          type: 'minor',
          yes: true,
          dryRun: true,
        })
      }
      catch {
      }

      expect(vi.mocked(core.writeVersion)).not.toHaveBeenCalled()
    })
  })

  describe('When force flag is enabled', () => {
    it('Then bumps all packages regardless of commits', async () => {
      vi.mocked(core.loadRelizyConfig).mockResolvedValueOnce({
        cwd: mockCwd,
        bump: {
          type: 'patch',
          yes: true,
        },
        release: { clean: false },
        monorepo: {
          versionMode: 'independent',
          packages: ['packages/*'],
        },
        types: {},
        templates: { tagBody: '{{newVersion}}' },
        logLevel: 'default',
      } as unknown as core.ResolvedRelizyConfig)

      vi.mocked(core.getPackages).mockResolvedValueOnce([
        {
          name: 'pkg-a',
          version: '1.0.0',
          newVersion: '1.0.1',
          path: `${mockCwd}/packages/pkg-a`,
          reason: undefined,
          fromTag: 'v1.0.0',
          commits: [],
          dependencies: [],
          private: false,
        },
        {
          name: 'pkg-b',
          version: '1.0.0',
          newVersion: '1.0.1',
          path: `${mockCwd}/packages/pkg-b`,
          reason: undefined,
          fromTag: 'v1.0.0',
          commits: [],
          dependencies: [],
          private: false,
        },
      ])

      vi.mocked(core.getBumpedIndependentPackages).mockReturnValueOnce([
        {
          name: 'pkg-a',
          version: '1.0.0',
          newVersion: '1.0.1',
          path: `${mockCwd}/packages/pkg-a`,
          fromTag: 'v1.0.0',
          commits: [],
          dependencies: [],
          private: false,
        },
        {
          name: 'pkg-b',
          version: '1.0.0',
          newVersion: '1.0.1',
          path: `${mockCwd}/packages/pkg-b`,
          fromTag: 'v1.0.0',
          commits: [],
          dependencies: [],
          private: false,
        },
      ])

      const result = await bump({
        type: 'patch',
        yes: true,
        force: true,
      })

      expect(result.bumped).toBe(true)
    })
  })

  describe('When no packages need bumping', () => {
    it('Then exists with code 10 when no changes', async () => {
      vi.mocked(core.loadRelizyConfig).mockResolvedValueOnce({
        cwd: mockCwd,
        bump: {
          type: 'release',
          yes: true,
        },
        release: { clean: false },
        monorepo: {
          versionMode: 'independent',
          packages: ['packages/*'],
        },
        types: {},
        templates: { tagBody: '{{newVersion}}' },
        logLevel: 'default',
      } as unknown as core.ResolvedRelizyConfig)

      vi.mocked(core.getPackages).mockResolvedValueOnce([])

      await bump({
        type: 'release',
        yes: true,
      })

      expect(vi.mocked(exit)).toHaveBeenCalledWith(10)
    })
  })
})
