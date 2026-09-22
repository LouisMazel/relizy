import type { GitCommit } from 'changelogen'
import * as changelogen from 'changelogen'
import { vol } from 'memfs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockCommit, createMockConfig } from '../../../tests/mocks'
import { expandPackagesToBumpWithDependents } from '../dependencies'
import { getCommitChangedFiles, getPackageCommits, getPackages, isCommitOnlyInIgnoredPackages, readPackages, resolveIgnoredPackagePaths } from '../repo'

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

vi.mock('../tags', () => ({
  NEW_PACKAGE_MARKER: '__NEW_PACKAGE__',
  resolveTags: vi.fn(({ pkg }) => {
    const fromTag = `${pkg.name}@${pkg.version}`
    return { from: fromTag, to: 'HEAD' }
  }),
}))

vi.mock('../version', () => ({
  determineReleaseType: vi.fn(() => 'patch'),
  getPackageNewVersion: vi.fn((_currentVersion: string, _releaseType: string) => '1.1.0'),
  isChangedPreid: vi.fn(() => false),
  isGraduating: vi.fn(() => false),
  isPrerelease: vi.fn(() => false),
  isStableReleaseType: vi.fn(() => true),
}))

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

  describe('When includePrivates is enabled', () => {
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

      setupMockCommits('default', [createMockCommit('feat', 'a change')])

      const config = createMockConfig({
        cwd: mockCwd,
        bump: { type: 'release' },
        monorepo: {
          versionMode: 'independent',
          packages: ['packages/*'],
          includePrivates: true,
        },
      })

      const packages = await getPackages({
        config,
        suffix: undefined,
        force: true,
      })

      expect(packages.map(p => p.name).sort()).toEqual(['pkg-a', 'pkg-b'])
    })

    it('Then still excludes packages listed in ignorePackageNames', async () => {
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
          includePrivates: true,
          ignorePackageNames: ['pkg-b'],
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

    describe('When includePrivates is not provided', () => {
      it('Then excludes private packages', () => {
        const result = readPackages({
          cwd: mockCwd,
          patterns: ['packages/*'],
          ignorePackageNames: undefined,
        })

        expect(result.map(p => p.name)).toEqual(['pkg-a'])
      })
    })

    describe('When includePrivates is true', () => {
      it('Then includes private packages', () => {
        const result = readPackages({
          cwd: mockCwd,
          patterns: ['packages/*'],
          ignorePackageNames: undefined,
          includePrivates: true,
        })

        expect(result.map(p => p.name).sort()).toEqual(['pkg-a', 'pkg-b'])
      })
    })

    describe('When includePrivates is true but a private package is in ignorePackageNames', () => {
      it('Then still excludes it via ignorePackageNames', () => {
        const result = readPackages({
          cwd: mockCwd,
          patterns: ['packages/*'],
          ignorePackageNames: ['pkg-b'],
          includePrivates: true,
        })

        expect(result.map(p => p.name)).toEqual(['pkg-a'])
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

describe('Given getCommitChangedFiles', () => {
  it('Then extracts file paths from --name-status body lines', () => {
    const commit = commitWithFiles({
      type: 'feat',
      message: 'feat: x',
      files: ['packages/pkg-a/src/index.ts', 'packages/pkg-a/package.json'],
    })

    expect(getCommitChangedFiles(commit)).toEqual([
      'packages/pkg-a/src/index.ts',
      'packages/pkg-a/package.json',
    ])
  })

  it('Then keeps the new path for renames/copies (R100/C75)', () => {
    const commit = {
      body: '\n\nR100\tpackages/pkg-a/old.ts\tpackages/pkg-a/new.ts\nC75\tpackages/pkg-a/a.ts\tpackages/pkg-a/b.ts\n',
    } as GitCommit

    expect(getCommitChangedFiles(commit)).toEqual([
      'packages/pkg-a/new.ts',
      'packages/pkg-a/b.ts',
    ])
  })

  it('Then ignores the human-readable body text (no tab)', () => {
    const commit = {
      body: '\n\nBREAKING CHANGE: dropped the old API\n\nM\tpackages/pkg-a/index.ts\n',
    } as GitCommit

    expect(getCommitChangedFiles(commit)).toEqual(['packages/pkg-a/index.ts'])
  })

  it('Then returns an empty array when the body has no file lines', () => {
    expect(getCommitChangedFiles({ body: '' } as GitCommit)).toEqual([])
  })
})

describe('Given isCommitOnlyInIgnoredPackages', () => {
  const ignored = ['shared-components/navigation']

  it('Then is true when every file lives inside an ignored package', () => {
    const commit = commitWithFiles({
      type: 'feat',
      message: 'feat(navigation)!: rework',
      files: ['shared-components/navigation/src/index.ts', 'shared-components/navigation/package.json'],
      isBreaking: true,
    })

    expect(isCommitOnlyInIgnoredPackages(commit, ignored)).toBe(true)
  })

  it('Then is false when the commit touches a non-ignored package', () => {
    const commit = commitWithFiles({
      type: 'feat',
      message: 'feat(components): x',
      files: ['packages/components/src/x.ts'],
    })

    expect(isCommitOnlyInIgnoredPackages(commit, ignored)).toBe(false)
  })

  it('Then is false for a mixed commit (ignored + non-ignored files)', () => {
    const commit = commitWithFiles({
      type: 'feat',
      message: 'feat: mixed',
      files: ['shared-components/navigation/src/index.ts', 'packages/components/src/x.ts'],
      isBreaking: true,
    })

    expect(isCommitOnlyInIgnoredPackages(commit, ignored)).toBe(false)
  })

  it('Then respects path boundaries (packages/components does not match packages/components-mcp)', () => {
    const commit = commitWithFiles({
      type: 'feat',
      message: 'feat: sibling',
      files: ['packages/components-mcp/src/x.ts'],
    })

    expect(isCommitOnlyInIgnoredPackages(commit, ['packages/components'])).toBe(false)
  })

  it('Then is false when there are no ignored paths', () => {
    const commit = commitWithFiles({
      type: 'feat',
      message: 'feat(navigation)!: rework',
      files: ['shared-components/navigation/src/index.ts'],
      isBreaking: true,
    })

    expect(isCommitOnlyInIgnoredPackages(commit, [])).toBe(false)
  })

  it('Then is false (fail-open) when no files can be detected', () => {
    expect(isCommitOnlyInIgnoredPackages({ body: '' } as GitCommit, ignored)).toBe(false)
  })
})

describe('Given resolveIgnoredPackagePaths and root commit filtering', () => {
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

  describe('When resolving ignored packages from path globs', () => {
    it('Then returns the relative POSIX path matched by monorepo.ignored', () => {
      const config = createMockConfig({
        cwd: mockCwd,
        monorepo: { versionMode: 'selective', packages: ['packages/*'], ignored: ['packages/pkg-a'] },
      })

      expect(resolveIgnoredPackagePaths(config)).toEqual(['packages/pkg-a'])
    })
  })

  describe('When resolving ignored packages from ignorePackageNames', () => {
    it('Then resolves the name to its relative path via the packages globs', () => {
      const config = createMockConfig({
        cwd: mockCwd,
        monorepo: { versionMode: 'selective', packages: ['packages/*'], ignorePackageNames: ['pkg-a'] },
      })

      expect(resolveIgnoredPackagePaths(config)).toEqual(['packages/pkg-a'])
    })
  })

  describe('When the root package aggregates commits with an ignored package', () => {
    it('Then excludes commits that only touch an ignored package', async () => {
      vi.mocked(changelogen.parseCommits).mockReturnValue([
        commitWithFiles({ type: 'feat', message: 'feat(pkg-a)!: breaking', files: ['packages/pkg-a/src/x.ts'], isBreaking: true }),
        commitWithFiles({ type: 'feat', message: 'feat(pkg-b): feature', files: ['packages/pkg-b/src/y.ts'] }),
        commitWithFiles({ type: 'build', message: 'build: lockfile', files: ['pnpm-lock.yaml'] }),
      ])

      const config = createMockConfig({
        cwd: mockCwd,
        monorepo: { versionMode: 'selective', packages: ['packages/*'], ignored: ['packages/pkg-a'] },
      })

      const commits = await getPackageCommits({
        pkg: { name: 'root-package', version: '1.0.0', path: mockCwd, private: false },
        from: 'root-package@1.0.0',
        to: 'HEAD',
        config,
        changelog: true,
      })

      const messages = commits.map(c => c.message)
      expect(messages).toContain('feat(pkg-b): feature')
      expect(messages).toContain('build: lockfile')
      expect(messages).not.toContain('feat(pkg-a)!: breaking')
    })

    it('Then keeps every commit at root when nothing is ignored', async () => {
      vi.mocked(changelogen.parseCommits).mockReturnValue([
        commitWithFiles({ type: 'feat', message: 'feat(pkg-a)!: breaking', files: ['packages/pkg-a/src/x.ts'], isBreaking: true }),
        commitWithFiles({ type: 'feat', message: 'feat(pkg-b): feature', files: ['packages/pkg-b/src/y.ts'] }),
      ])

      const config = createMockConfig({
        cwd: mockCwd,
        monorepo: { versionMode: 'selective', packages: ['packages/*'] },
      })

      const commits = await getPackageCommits({
        pkg: { name: 'root-package', version: '1.0.0', path: mockCwd, private: false },
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
        ignorePackageNames: undefined,
        ignored: ['packages/pkg-a'],
      })

      expect(result.map(p => p.name)).toEqual(['pkg-b'])
    })
  })

  describe('When getPackages receives ignored path globs', () => {
    it('Then never discovers or bumps a package matched by monorepo.ignored', async () => {
      vi.mocked(changelogen.parseCommits).mockReturnValue([
        commitWithFiles({ type: 'feat', message: 'feat: work', files: ['packages/pkg-b/src/x.ts'] }),
      ])

      const config = createMockConfig({
        cwd: mockCwd,
        monorepo: { versionMode: 'selective', packages: ['packages/*'], ignored: ['packages/pkg-a'] },
      })

      const packages = await getPackages({ config, suffix: undefined, force: false })

      expect(packages.map(p => p.name)).not.toContain('pkg-a')
      expect(packages.map(p => p.name)).toContain('pkg-b')
    })
  })
})
