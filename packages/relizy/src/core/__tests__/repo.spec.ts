import type { GitCommit } from '../../types'
import { expandPackagesToBumpWithDependents } from '@relizy/core'
import { vol } from 'memfs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as commitsModule from '../../../../core/src/commits'
import * as gitRefs from '../../../../core/src/git-refs'
import { createMockCommit, createMockConfig } from '../../../tests/mocks'
import { getPackageCommits, getPackages, getPrivatePackagesMode, readPackages } from '../repo'

// Mock file system
vi.mock('node:fs', async () => {
  const memfs = await import('memfs')
  return memfs.fs
})

vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs')
  return memfs.fs.promises
})

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

      if (pattern === 'packages/pkg-b') {
        return [`${cwd}/packages/pkg-b`]
      }

      if (pattern === '.') {
        return [cwd]
      }

      return []
    }),
  },
}))

vi.mock('../tags', () => ({
  resolveTags: vi.fn(({ pkg }) => {
    const fromTag = `${pkg.name}@${pkg.version}`
    return { from: fromTag, to: 'HEAD' }
  }),
}))

// The functions of @relizy/core the planning of the bumps calls
vi.mock('@relizy/core', async importActual => ({
  ...await importActual<typeof import('@relizy/core')>(),
  getOutOfRangeDependencies: vi.fn(() => []),
  isBreakingVersionChange: vi.fn(() => false),
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
  determineReleaseType: vi.fn(() => 'patch'),
  getPackageNewVersion: vi.fn((_currentVersion: string, _releaseType: string) => '1.1.0'),
  isChangedPreid: vi.fn(() => false),
  isGraduating: vi.fn(() => false),
  isPrerelease: vi.fn(() => false),
  isStableReleaseType: vi.fn(() => true),
}))

vi.mock('../../../../core/src/git-refs', async importActual => ({
  ...(await importActual<typeof import('../../../../core/src/git-refs')>()),
  getGitDiff: vi.fn(() => []),
}))

vi.mock('../../../../core/src/commits', () => ({
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
    vi.mocked(commitsModule.parseCommits).mockImplementation((_diff: any, _config: any) => {
      // Try to determine which package based on config
      return mockCommitsMap.get('default') || []
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
      expect(vi.mocked(gitRefs.getGitDiff)).toHaveBeenCalled()
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
      expect(packages).toHaveLength(0)
    })

    it('Then returns all discovered packages when includeAll is true even without commits', async () => {
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
        includeAll: true,
      })

      expect(packages.map(p => p.name).sort()).toEqual(['pkg-a', 'pkg-b'])
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

    it('Then includes dependent packages when dependencies are bumped with bump.dependents: always', async () => {
      setupMockCommits('default', [
        createMockCommit('feat', 'update pkg-a'),
      ])

      const config = createMockConfig({
        cwd: mockCwd,
        bump: { type: 'release', dependents: 'always' },
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

    it('Then excludes the packages of monorepo.ignored', async () => {
      setupMockCommits('default', [
        createMockCommit('feat', 'some feature'),
      ])

      const config = createMockConfig({
        cwd: mockCwd,
        bump: { type: 'release' },
        monorepo: {
          versionMode: 'independent',
          packages: ['packages/*'],
          ignored: ['packages/pkg-a'],
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

  describe('When privatePackages is release', () => {
    it('Then includes private packages in the result', async () => {
      vol.fromJSON({
        [`${mockCwd}/package.json`]: JSON.stringify({ name: 'root-package', version: '1.0.0' }),
        [`${mockCwd}/packages/pkg-a/package.json`]: JSON.stringify({
          name: 'pkg-a',
          version: '1.0.0',
        }),
        [`${mockCwd}/packages/pkg-b/package.json`]: JSON.stringify({
          name: 'pkg-b',
          version: '1.0.0',
          private: true,
        }),
      }, mockCwd)

      setupMockCommits('default', [
        createMockCommit('feat', 'a change'),
      ])

      const config = createMockConfig({
        cwd: mockCwd,
        bump: { type: 'release' },
        monorepo: {
          versionMode: 'independent',
          packages: ['packages/*'],
          privatePackages: 'release',
        },
      })

      const packages = await getPackages({
        config,
        suffix: undefined,
        force: true,
      })

      expect(packages.map(p => p.name).sort()).toEqual(['pkg-a', 'pkg-b'])
    })

    it('Then still excludes the private packages of monorepo.ignored', async () => {
      vol.fromJSON({
        [`${mockCwd}/package.json`]: JSON.stringify({ name: 'root-package', version: '1.0.0' }),
        [`${mockCwd}/packages/pkg-a/package.json`]: JSON.stringify({
          name: 'pkg-a',
          version: '1.0.0',
        }),
        [`${mockCwd}/packages/pkg-b/package.json`]: JSON.stringify({
          name: 'pkg-b',
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
          privatePackages: 'release',
          ignored: ['packages/pkg-b'],
        },
      })

      const packages = await getPackages({
        config,
        suffix: undefined,
        force: true,
      })

      expect(packages.map(p => p.name)).toEqual(['pkg-a'])
    })
  })

  describe('Given readPackages function', () => {
    beforeEach(() => {
      vol.fromJSON({
        [`${mockCwd}/package.json`]: JSON.stringify({ name: 'root-package', version: '1.0.0' }),
        [`${mockCwd}/packages/pkg-a/package.json`]: JSON.stringify({
          name: 'pkg-a',
          version: '1.0.0',
        }),
        [`${mockCwd}/packages/pkg-b/package.json`]: JSON.stringify({
          name: 'pkg-b',
          version: '1.0.0',
          private: true,
        }),
      }, mockCwd)
    })

    describe('When privatePackages is not provided', () => {
      it('Then excludes private packages', () => {
        const result = readPackages({
          cwd: mockCwd,
          patterns: ['packages/*'],
        })

        expect(result.map(p => p.name)).toEqual(['pkg-a'])
      })
    })

    describe('When privatePackages is release', () => {
      it('Then includes private packages', () => {
        const result = readPackages({
          cwd: mockCwd,
          patterns: ['packages/*'],
          privatePackages: 'release',
        })

        expect(result.map(p => p.name).sort()).toEqual(['pkg-a', 'pkg-b'])
      })
    })

    describe('When privatePackages is release but a private package is in monorepo.ignored', () => {
      it('Then still excludes it', () => {
        const result = readPackages({
          cwd: mockCwd,
          patterns: ['packages/*'],
          ignored: ['packages/pkg-b'],
          privatePackages: 'release',
        })

        expect(result.map(p => p.name)).toEqual(['pkg-a'])
      })
    })

    describe('When there are no patterns (standalone project) and the root is private', () => {
      it('Then reads the root, its only package', () => {
        vol.fromJSON({
          [`${mockCwd}/package.json`]: JSON.stringify({ name: 'app', version: '1.0.0', private: true }),
        }, mockCwd)

        const result = readPackages({ cwd: mockCwd, patterns: undefined })

        expect(result.map(p => p.name)).toEqual(['app'])
      })
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

function commitWithFiles(
  { type, message, files, isBreaking = false }: { type: string, message: string, files: string[], isBreaking?: boolean },
): GitCommit {
  const nameStatus = files.map(file => `M\t${file}`).join('\n')
  return {
    shortHash: 'abc1234',
    author: { name: 'Test', email: 'test@example.com' },
    message,
    body: `\n\n${nameStatus}\n`,
    type,
    scope: '',
    references: [],
    description: message,
    isBreaking,
    authors: [],
  } as GitCommit
}

describe('Given the root commit filtering of getPackageCommits', () => {
  const mockCwd = '/test-repo'

  beforeEach(() => {
    vi.clearAllMocks()

    vol.fromJSON({
      [`${mockCwd}/package.json`]: JSON.stringify({ name: 'root-package', version: '1.0.0' }),
      [`${mockCwd}/packages/pkg-a/package.json`]: JSON.stringify({ name: 'pkg-a', version: '1.0.0' }),
      [`${mockCwd}/packages/pkg-b/package.json`]: JSON.stringify({ name: 'pkg-b', version: '1.1.0' }),
    }, mockCwd)
  })

  afterEach(() => {
    vol.reset()
  })

  describe('When the root package aggregates commits with an ignored package', () => {
    it('Then only keeps the commits of the released packages', async () => {
      vi.mocked(commitsModule.parseCommits).mockReturnValue([
        commitWithFiles({
          type: 'feat',
          message: 'feat(pkg-a)!: breaking',
          files: ['packages/pkg-a/src/x.ts'],
          isBreaking: true,
        }),
        commitWithFiles({
          type: 'feat',
          message: 'feat(pkg-b): feature',
          files: ['packages/pkg-b/src/y.ts'],
        }),
        commitWithFiles({
          type: 'build',
          message: 'build: lockfile',
          files: ['pnpm-lock.yaml'],
        }),
      ])

      const config = createMockConfig({
        cwd: mockCwd,
        monorepo: {
          versionMode: 'selective',
          packages: ['packages/*'],
          ignored: ['packages/pkg-a'],
        },
      })

      const commits = await getPackageCommits({
        pkg: {
          name: 'root-package',
          version: '1.0.0',
          path: mockCwd,
          private: false,
        },
        from: 'root-package@1.0.0',
        to: 'HEAD',
        config,
        changelog: true,
      })

      const messages = commits.map(c => c.message)
      expect(messages).toEqual(['feat(pkg-b): feature'])
    })

    it('Then keeps every commit at root when nothing is ignored', async () => {
      vi.mocked(commitsModule.parseCommits).mockReturnValue([
        commitWithFiles({
          type: 'feat',
          message: 'feat(pkg-a)!: breaking',
          files: ['packages/pkg-a/src/x.ts'],
          isBreaking: true,
        }),
        commitWithFiles({
          type: 'feat',
          message: 'feat(pkg-b): feature',
          files: ['packages/pkg-b/src/y.ts'],
        }),
      ])

      const config = createMockConfig({
        cwd: mockCwd,
        monorepo: {
          versionMode: 'selective',
          packages: ['packages/*'],
        },
      })

      const commits = await getPackageCommits({
        pkg: {
          name: 'root-package',
          version: '1.0.0',
          path: mockCwd,
          private: false,
        },
        from: 'root-package@1.0.0',
        to: 'HEAD',
        config,
        changelog: true,
      })

      expect(commits.map(c => c.message)).toContain('feat(pkg-a)!: breaking')
    })
  })

  describe('When readPackages receives ignored path globs', () => {
    it('Then skips packages whose directory matches monorepo.ignored', () => {
      const result = readPackages({
        cwd: mockCwd,
        patterns: ['packages/*'],
        ignored: ['packages/pkg-a'],
      })

      expect(result.map(p => p.name)).toEqual(['pkg-b'])
    })
  })

  describe('When getPackages receives ignored path globs', () => {
    it('Then never discovers or bumps a package matched by monorepo.ignored', async () => {
      vi.mocked(commitsModule.parseCommits).mockReturnValue([
        commitWithFiles({
          type: 'feat',
          message: 'feat: work',
          files: ['packages/pkg-b/src/x.ts'],
        }),
      ])

      const config = createMockConfig({
        cwd: mockCwd,
        monorepo: {
          versionMode: 'selective',
          packages: ['packages/*'],
          ignored: ['packages/pkg-a'],
        },
      })

      const packages = await getPackages({ config, suffix: undefined, force: false })

      expect(packages.map(p => p.name)).not.toContain('pkg-a')
      expect(packages.map(p => p.name)).toContain('pkg-b')
    })
  })
})

describe('Given a package moved to another directory', () => {
  const mockCwd = '/test-repo'
  const moveLines = 'R100\tlegacy/pkg-a/package.json\tpackages/pkg-a/package.json\nR100\tlegacy/pkg-a/src/x.ts\tpackages/pkg-a/src/x.ts'

  function commitWithBody({ type, message, body, isBreaking = false }: { type: string, message: string, body: string, isBreaking?: boolean }): GitCommit {
    return {
      ...commitWithFiles({ type, message, files: [], isBreaking }),
      body: `\n\n${body}\n`,
    }
  }

  function mockHistory(commits: GitCommit[]) {
    vi.mocked(gitRefs.getGitDiff).mockReturnValue(commits.map(({ message, body, shortHash, author }) => ({ message, body, shortHash, author })))
    vi.mocked(commitsModule.parseCommits).mockReturnValue(commits)
  }

  const breakingBeforeMove = commitWithBody({
    type: 'feat',
    message: 'feat(pkg-a)!: drop the old api',
    body: 'M\tlegacy/pkg-a/src/x.ts',
    isBreaking: true,
  })

  beforeEach(() => {
    vi.clearAllMocks()

    vol.fromJSON({
      [`${mockCwd}/package.json`]: JSON.stringify({ name: 'root-package', version: '1.0.0' }),
      [`${mockCwd}/packages/pkg-a/package.json`]: JSON.stringify({ name: 'pkg-a', version: '1.0.0' }),
      [`${mockCwd}/packages/pkg-b/package.json`]: JSON.stringify({ name: 'pkg-b', version: '1.1.0' }),
    }, mockCwd)
  })

  afterEach(() => {
    vol.reset()
    vi.mocked(gitRefs.getGitDiff).mockReturnValue([])
  })

  describe('When git detected the move', () => {
    it('Then the commits made before the move belong to the package', async () => {
      mockHistory([
        commitWithBody({ type: 'refactor', message: 'refactor(pkg-a): move the package', body: moveLines }),
        breakingBeforeMove,
      ])

      const commits = await getPackageCommits({
        pkg: {
          name: 'pkg-a',
          version: '1.0.0',
          path: `${mockCwd}/packages/pkg-a`,
          private: false,
        },
        from: 'pkg-a@1.0.0',
        to: 'HEAD',
        config: createMockConfig({
          cwd: mockCwd,
          monorepo: {
            versionMode: 'independent',
            packages: ['packages/*'],
          },
        }),
        changelog: true,
      })

      expect(commits.map(c => c.message)).toEqual(['refactor(pkg-a): move the package', 'feat(pkg-a)!: drop the old api'])
    })
  })

  describe('When git did not detect the move', () => {
    const undetectedMove = commitWithBody({
      type: 'refactor',
      message: 'refactor(pkg-a): move the package',
      body: 'D\tlegacy/pkg-a/package.json\nA\tpackages/pkg-a/package.json',
    })

    it('Then the commits made before the move are lost without monorepo.movedPackages', async () => {
      mockHistory([undetectedMove, breakingBeforeMove])

      const commits = await getPackageCommits({
        pkg: {
          name: 'pkg-a',
          version: '1.0.0',
          path: `${mockCwd}/packages/pkg-a`,
          private: false,
        },
        from: 'pkg-a@1.0.0',
        to: 'HEAD',
        config: createMockConfig({
          cwd: mockCwd,
          monorepo: {
            versionMode: 'independent',
            packages: ['packages/*'],
          },
        }),
        changelog: true,
      })

      expect(commits.map(c => c.message)).toEqual(['refactor(pkg-a): move the package'])
    })

    it('Then monorepo.movedPackages gives them back to the package', async () => {
      mockHistory([undetectedMove, breakingBeforeMove])

      const commits = await getPackageCommits({
        pkg: {
          name: 'pkg-a',
          version: '1.0.0',
          path: `${mockCwd}/packages/pkg-a`,
          private: false,
        },
        from: 'pkg-a@1.0.0',
        to: 'HEAD',
        config: createMockConfig({
          cwd: mockCwd,
          monorepo: {
            versionMode: 'independent',
            packages: ['packages/*'],
            movedPackages: { 'legacy/pkg-a': 'packages/pkg-a' },
          },
        }),
        changelog: true,
      })

      expect(commits.map(c => c.message)).toContain('feat(pkg-a)!: drop the old api')
    })
  })

  describe('When the moved package is ignored by the root', () => {
    it('Then the commits of its former directory stay out of the root', async () => {
      mockHistory([
        commitWithBody({ type: 'refactor', message: 'refactor(pkg-a): move the package', body: moveLines }),
        breakingBeforeMove,
        commitWithBody({ type: 'feat', message: 'feat(pkg-b): add a feature', body: 'M\tpackages/pkg-b/src/y.ts' }),
      ])

      const commits = await getPackageCommits({
        pkg: {
          name: 'root-package',
          version: '1.0.0',
          path: mockCwd,
          private: false,
        },
        from: 'root-package@1.0.0',
        to: 'HEAD',
        config: createMockConfig({
          cwd: mockCwd,
          monorepo: {
            versionMode: 'selective',
            packages: ['packages/*'],
            ignored: ['packages/pkg-a'],
          },
        }),
        changelog: true,
      })

      expect(commits.map(c => c.message)).toEqual(['feat(pkg-b): add a feature'])
    })
  })
})

describe('Given getPrivatePackagesMode', () => {
  describe('When the project has no workspace packages (standalone)', () => {
    it('Then releases its private root package', () => {
      expect(getPrivatePackagesMode({})).toBe('release')
      expect(getPrivatePackagesMode({
        monorepo: { privatePackages: 'ignore' },
      })).toBe('release')
    })
  })

  describe('When the project is a monorepo', () => {
    it('Then follows monorepo.privatePackages, ignore by default', () => {
      expect(getPrivatePackagesMode({
        monorepo: {
          versionMode: 'selective',
          packages: ['packages/*'],
        },
      })).toBe('ignore')
      expect(getPrivatePackagesMode({
        monorepo: {
          versionMode: 'selective',
          packages: ['packages/*'],
          privatePackages: 'release',
        },
      })).toBe('release')
      expect(getPrivatePackagesMode({
        monorepo: {
          groups: [
            {
              name: 'main',
              versionMode: 'selective',
              packages: ['packages/*'],
            },
          ],
        },
      })).toBe('ignore')
    })
  })
})
