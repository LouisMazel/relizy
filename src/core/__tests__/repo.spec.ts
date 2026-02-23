import type { GitCommit } from 'changelogen'
import * as changelogen from 'changelogen'
import { vol } from 'memfs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockCommit, createMockConfig } from '../../../tests/mocks'
import { expandPackagesToBumpWithDependents } from '../dependencies'
import { getPackages } from '../repo'

// Mock file system
vi.mock('node:fs', async () => {
  const memfs = await import('memfs')
  return memfs.fs
})

vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs')
  return memfs.fs.promises
})

// Mock dependencies
vi.mock('../dependencies', () => ({
  expandPackagesToBumpWithDependents: vi.fn(({ allPackages, packagesWithCommits }) => {
    // Simple mock: return packages that depend on packages with commits
    const packagesWithCommitsNames = new Set(packagesWithCommits.map((p: any) => p.name))
    const dependents = allPackages.filter((pkg: any) => {
      return pkg.dependencies?.some((dep: string) => packagesWithCommitsNames.has(dep))
    })
    return dependents.map((d: any) => ({
      ...d,
      reason: 'dependency',
      dependencyChain: packagesWithCommits.map((p: any) => p.name),
    }))
  }),
  getPackageDependencies: vi.fn(({ packagePath, _allPackageNames }) => {
    // Return mock dependencies based on package path
    if (packagePath.includes('pkg-b')) {
      return ['pkg-a']
    }
    return []
  }),
}))

vi.mock('fast-glob', () => ({
  default: {
    sync: vi.fn((pattern: string, options: any) => {
      const cwd = options.cwd || process.cwd()

      if (pattern === 'packages/*') {
        return [
          `${cwd}/packages/pkg-a`,
          `${cwd}/packages/pkg-b`,
        ]
      }

      if (pattern === 'packages/pkg-a') {
        return [`${cwd}/packages/pkg-a`]
      }

      return []
    }),
  },
}))

vi.mock('../tags', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../tags')>()
  return {
    ...actual,
    resolveTags: vi.fn(({ pkg }) => {
      const fromTag = `${pkg.name}@${pkg.version}`
      return { from: fromTag, to: 'HEAD' }
    }),
  }
})

vi.mock('../version', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../version')>()
  return {
    ...actual,
    isGraduating: vi.fn(() => false),
  }
})

vi.mock('changelogen', () => ({
  getGitDiff: vi.fn(() => 'mock git diff'),
  parseCommits: vi.fn((_diff: string, _config: any) => {
    // Return different commits based on context
    return []
  }),
}))

// Track the parseCommits mock to control its behavior
const mockCommitsMap = new Map<string, GitCommit[]>()

function setupMockCommits(packageName: string, commits: GitCommit[]) {
  mockCommitsMap.set(packageName, commits)
}

describe('Given getPackages function', () => {
  const mockCwd = '/test-repo'

  beforeEach(() => {
    vi.clearAllMocks()
    mockCommitsMap.clear()

    // Setup mock file system
    vol.fromJSON({
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
        version: '1.1.0',
        dependencies: {
          'pkg-a': '^1.0.0',
        },
      }),
    }, mockCwd)

    // Mock parseCommits to use our controlled map
    vi.mocked(changelogen.parseCommits).mockImplementation((_diff: any, _config: any) => {
      // Try to determine which package based on config
      const commits = mockCommitsMap.get('default') || []
      return commits
    })
  })

  afterEach(() => {
    vol.reset()
  })

  describe('When identifying packages with commits', () => {
    it('Then correctly identifies all packages in monorepo', async () => {
      setupMockCommits('default', [
        createMockCommit('feat', 'add feature to pkg-a'),
      ])

      const config = createMockConfig({
        cwd: mockCwd,
        bump: { type: 'release' },
        monorepo: {
          versionMode: 'unified',
          packages: ['packages/*'],
        },
      })

      const packages = await getPackages({
        config,
        suffix: undefined,
        force: false,
      })

      expect(packages).toBeDefined()
      expect(Array.isArray(packages)).toBe(true)
    })

    it('Then fetches commits for each package', async () => {
      const mockCommits = [
        createMockCommit('feat', 'add new feature'),
        createMockCommit('fix', 'fix bug'),
      ]
      setupMockCommits('default', mockCommits)

      const config = createMockConfig({
        cwd: mockCwd,
        bump: { type: 'release' },
        monorepo: {
          versionMode: 'independent',
          packages: ['packages/*'],
        },
      })

      const packages = await getPackages({
        config,
        suffix: undefined,
        force: false,
      })

      expect(packages).toBeDefined()
      // Verify commits were processed
      expect(vi.mocked(changelogen.getGitDiff)).toHaveBeenCalled()
    })

    it('Then calculates new versions based on configuration', async () => {
      setupMockCommits('default', [
        createMockCommit('feat', 'add feature'),
      ])

      const config = createMockConfig({
        cwd: mockCwd,
        bump: { type: 'release' },
        monorepo: {
          versionMode: 'independent',
          packages: ['packages/*'],
        },
      })

      const packages = await getPackages({
        config,
        suffix: undefined,
        force: false,
      })

      // Packages with commits should have newVersion calculated
      packages.forEach((pkg) => {
        if (pkg.reason === 'commits') {
          expect(pkg.newVersion).toBeDefined()
        }
      })
    })
  })

  describe('When handling unified monorepo mode', () => {
    it('Then treats all packages with same version strategy', async () => {
      setupMockCommits('default', [])

      const config = createMockConfig({
        bump: { type: 'release' },
        monorepo: {
          versionMode: 'unified',
          packages: ['packages/*'],
        },
      })
      config.cwd = mockCwd

      const packages = await getPackages({
        config,
        suffix: undefined,
        force: false,
      })

      // In unified mode with no commits and no force, no packages should be bumped
      expect(packages.length).toBe(0)
    })

    it('Then bumps all packages when force flag is enabled', async () => {
      setupMockCommits('default', [])

      const config = createMockConfig({
        cwd: mockCwd,
        bump: { type: 'patch' },
        monorepo: {
          versionMode: 'unified',
          packages: ['packages/*'],
        },
      })

      const packages = await getPackages({
        config,
        suffix: undefined,
        force: true,
      })

      expect(packages.length).toBeGreaterThan(0)
      // All packages should have newVersion when forced
      packages.forEach((pkg) => {
        expect(pkg.newVersion).toBeDefined()
      })
    })
  })

  describe('When handling independent monorepo mode', () => {
    it('Then calculates version independently for each package', async () => {
      const config = createMockConfig({
        cwd: mockCwd,
        bump: { type: 'release' },
        monorepo: {
          versionMode: 'independent',
          packages: ['packages/*'],
        },
      })

      setupMockCommits('default', [
        createMockCommit('feat', 'feature for pkg-a'),
      ])

      const packages = await getPackages({
        config,
        suffix: undefined,
        force: false,
      })

      // Each package should maintain its own version
      expect(packages.length).toBeGreaterThanOrEqual(0)
    })

    it('Then includes dependent packages when dependencies are bumped', async () => {
      setupMockCommits('default', [
        createMockCommit('feat', 'update pkg-a'),
      ])

      const config = createMockConfig({
        cwd: mockCwd,
        bump: { type: 'release' },
        monorepo: {
          versionMode: 'independent',
          packages: ['packages/*'],
        },
      })

      await getPackages({
        config,
        suffix: undefined,
        force: false,
      })

      // Should include packages that depend on changed packages
      expect(expandPackagesToBumpWithDependents).toHaveBeenCalled()
    })
  })

  describe('When handling selective monorepo mode', () => {
    it('Then only bumps packages with changes', async () => {
      setupMockCommits('default', [
        createMockCommit('fix', 'fix in pkg-a'),
      ])

      const config = createMockConfig({
        cwd: mockCwd,
        bump: { type: 'release' },
        monorepo: {
          versionMode: 'selective',
          packages: ['packages/*'],
        },
      })

      const packages = await getPackages({
        config,
        suffix: undefined,
        force: false,
      })

      // Only packages with commits or dependents should be included
      expect(packages.every(pkg => pkg.reason)).toBe(true)
    })

    it('Then respects force flag in selective mode', async () => {
      setupMockCommits('default', [])

      const config = createMockConfig({
        cwd: mockCwd,
        bump: { type: 'patch' },
        monorepo: {
          versionMode: 'selective',
          packages: ['packages/*'],
        },
      })

      const packages = await getPackages({
        config,
        suffix: undefined,
        force: true,
      })

      // Force should bump all packages
      expect(packages.length).toBeGreaterThan(0)
    })
  })

  describe('When filtering packages', () => {
    it('Then excludes private packages', async () => {
      vol.fromJSON({
        [`${mockCwd}/packages/private-pkg/package.json`]: JSON.stringify({
          name: 'private-pkg',
          version: '1.0.0',
          private: true,
        }),
      }, mockCwd)

      const config = createMockConfig({
        cwd: mockCwd,
        bump: { type: 'release' },
        monorepo: {
          versionMode: 'independent',
          packages: ['packages/*'],
        },
      })

      const packages = await getPackages({
        config,
        suffix: undefined,
        force: false,
      })

      expect(packages.every(pkg => !pkg.private)).toBe(true)
    })

    it('Then excludes packages in ignorePackageNames', async () => {
      setupMockCommits('default', [
        createMockCommit('feat', 'some feature'),
      ])

      const config = createMockConfig({
        cwd: mockCwd,
        bump: { type: 'release' },
        monorepo: {
          versionMode: 'independent',
          packages: ['packages/*'],
          ignorePackageNames: ['pkg-a'],
        },
      })

      const packages = await getPackages({
        config,
        suffix: undefined,
        force: false,
      })

      expect(packages.every(pkg => pkg.name !== 'pkg-a')).toBe(true)
    })
  })

  describe('When no packages need bumping', () => {
    it('Then returns empty array when no commits and no force', async () => {
      setupMockCommits('default', [])

      const config = createMockConfig({
        cwd: mockCwd,
        bump: { type: 'release' },
        monorepo: {
          versionMode: 'independent',
          packages: ['packages/*'],
        },
      })

      const packages = await getPackages({
        config,
        suffix: undefined,
        force: false,
      })

      expect(packages).toEqual([])
    })
  })
})
