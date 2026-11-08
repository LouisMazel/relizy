/**
 * The commits of the root package in a monorepo: the root version and changelog
 * come from the commits of the released packages, so a commit changing only
 * root-level files (CI config, scripts, lockfile, an app out of the release)
 * releases nothing. A project without workspace packages keeps every commit.
 */
import type { GitCommit } from '../../types'
import { vol } from 'memfs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockCommit, createMockConfig } from '../../../tests/mocks'
import * as commitsModule from '../commits'
import { getPackageCommits } from '../repo'

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
    sync: vi.fn((_pattern: string, options: any) => {
      const cwd = options?.cwd || '/test-repo'
      return [`${cwd}/packages/pkg-a`]
    }),
  },
}))

vi.mock('../tags', () => ({
  NEW_PACKAGE_MARKER: '__NEW_PACKAGE__',
  resolveTags: vi.fn(({ pkg }: any) => ({
    from: `${pkg.name}@${pkg.version}`,
    to: 'HEAD',
  })),
}))

vi.mock('../git-refs', async importActual => ({
  ...(await importActual<typeof import('../git-refs')>()),
  getGitDiff: vi.fn(() => []),
}))

vi.mock('../commits', () => ({
  parseCommits: vi.fn(() => []),
}))

const MOCK_CWD = '/test-repo'
const PKG_PATH = `${MOCK_CWD}/packages/pkg-a`

function makeRootPkg() {
  return {
    name: 'root-package',
    path: MOCK_CWD,
    version: '1.0.0',
    private: false,
  }
}

function makeSubPkg() {
  return {
    name: 'pkg-a',
    path: PKG_PATH,
    version: '1.0.0',
    private: false,
  }
}

function makeCommit(overrides: Partial<GitCommit>): GitCommit {
  return createMockCommit('build', 'build: test', { description: 'test', ...overrides })
}

describe('Given a commit touching only root-level files in a monorepo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vol.fromJSON(
      {
        [`${MOCK_CWD}/package.json`]: JSON.stringify({ name: 'root-package', version: '1.0.0' }),
        [`${PKG_PATH}/package.json`]: JSON.stringify({ name: 'pkg-a', version: '1.0.0' }),
      },
      MOCK_CWD,
    )
  })

  afterEach(() => {
    vol.reset()
  })

  describe('When generating commits for the root package', () => {
    it('Then a `fix:` commit touching only root files is excluded', async () => {
      // Mirrors what `getGitDiff` produces with `--name-status`
      vi.mocked(commitsModule.parseCommits).mockReturnValue([
        makeCommit({ type: 'fix', description: 'fix the linters workflow', body: '\nM\t.github/workflows/linters.yml\n' }),
        makeCommit({ type: 'build', description: 'upgrade relizy', body: '\nM\tpackage.json\nM\tpnpm-lock.yaml\n' }),
      ])

      const config = createMockConfig({
        cwd: MOCK_CWD,
        bump: { type: 'release' },
        monorepo: {
          versionMode: 'unified',
          packages: ['packages/*'],
        },
        types: {
          fix: { title: '🩹 Fixes', semver: 'patch' },
          build: { title: '🏗️ Build', semver: 'patch' },
        },
      })

      const commits = await getPackageCommits({
        pkg: makeRootPkg() as any,
        from: 'v1.0.0',
        to: 'HEAD',
        config,
        changelog: true,
      })

      expect(commits).toEqual([])
    })

    it('Then a commit touching a package and root files is included', async () => {
      vi.mocked(commitsModule.parseCommits).mockReturnValue([
        makeCommit({ type: 'fix', description: 'fix a bug', body: '\nM\t.github/workflows/linters.yml\nM\tpackages/pkg-a/src/index.ts\n' }),
      ])

      const config = createMockConfig({
        cwd: MOCK_CWD,
        bump: { type: 'release' },
        monorepo: {
          versionMode: 'selective',
          packages: ['packages/*'],
        },
      })

      const commits = await getPackageCommits({
        pkg: makeRootPkg() as any,
        from: 'v1.0.0',
        to: 'HEAD',
        config,
        changelog: true,
      })

      expect(commits.map(commit => commit.description)).toEqual(['fix a bug'])
    })

    it('Then a commit of a private package is excluded, unless privatePackages is release', async () => {
      vol.fromJSON({
        [`${PKG_PATH}/package.json`]: JSON.stringify({ name: 'pkg-a', version: '1.0.0', private: true }),
      }, MOCK_CWD)
      vi.mocked(commitsModule.parseCommits).mockReturnValue([
        makeCommit({ type: 'fix', description: 'fix the app', body: '\nM\tpackages/pkg-a/src/index.ts\n' }),
      ])

      const config = createMockConfig({
        cwd: MOCK_CWD,
        bump: { type: 'release' },
        monorepo: {
          versionMode: 'unified',
          packages: ['packages/*'],
        },
      })
      const getRootCommits = () => getPackageCommits({
        pkg: makeRootPkg() as any,
        from: 'v1.0.0',
        to: 'HEAD',
        config,
        changelog: true,
      })

      expect(await getRootCommits()).toEqual([])

      config.monorepo!.privatePackages = 'release'

      expect((await getRootCommits()).map(commit => commit.description)).toEqual(['fix the app'])
    })

    it('Then a commit touching only root files is included in a project without workspace packages', async () => {
      vi.mocked(commitsModule.parseCommits).mockReturnValue([
        makeCommit({ type: 'ci', description: 'tweak pipeline', body: '\nM\t.gitlab-ci.yml\n' }),
      ])

      const config = createMockConfig({
        cwd: MOCK_CWD,
        bump: { type: 'release' },
        types: {
          ci: { title: '🤖 CI' },
        },
      })
      delete config.monorepo!.packages

      const commits = await getPackageCommits({
        pkg: makeRootPkg() as any,
        from: 'v1.0.0',
        to: 'HEAD',
        config,
        changelog: true,
      })

      expect(commits.map(commit => commit.type)).toEqual(['ci'])
    })

    it('Then `chore(release)` is still excluded by isAllowedCommit', async () => {
      vi.mocked(commitsModule.parseCommits).mockReturnValue([
        makeCommit({
          type: 'chore',
          scope: 'release',
          description: 'bump',
          body: '\nM\tpackages/pkg-a/package.json\n',
        }),
      ])

      const config = createMockConfig({
        cwd: MOCK_CWD,
        bump: { type: 'release' },
        monorepo: {
          versionMode: 'selective',
          packages: ['packages/*'],
        },
      })

      const commits = await getPackageCommits({
        pkg: makeRootPkg() as any,
        from: 'v1.0.0',
        to: 'HEAD',
        config,
        changelog: true,
      })

      expect(commits).toHaveLength(0)
    })
  })

  describe('When generating commits for a sub-package', () => {
    it('Then a root-only commit is correctly excluded', async () => {
      const rootOnlyBody = '\nM\tpackage.json\nM\tpnpm-lock.yaml\n'

      vi.mocked(commitsModule.parseCommits).mockReturnValue([
        makeCommit({ type: 'build', description: 'upgrade deps', body: rootOnlyBody }),
      ])

      const config = createMockConfig({
        cwd: MOCK_CWD,
        bump: { type: 'release' },
        monorepo: {
          versionMode: 'selective',
          packages: ['packages/*'],
        },
      })

      const commits = await getPackageCommits({
        pkg: makeSubPkg() as any,
        from: 'pkg-a@1.0.0',
        to: 'HEAD',
        config,
        changelog: true,
      })

      expect(commits).toHaveLength(0)
    })

    it('Then a commit touching the sub-package path is still included', async () => {
      const subPkgBody = '\nM\tpackages/pkg-a/src/index.ts\n'

      vi.mocked(commitsModule.parseCommits).mockReturnValue([
        makeCommit({ type: 'feat', description: 'new feature', body: subPkgBody }),
      ])

      const config = createMockConfig({
        cwd: MOCK_CWD,
        bump: { type: 'release' },
        monorepo: {
          versionMode: 'selective',
          packages: ['packages/*'],
        },
      })

      const commits = await getPackageCommits({
        pkg: makeSubPkg() as any,
        from: 'pkg-a@1.0.0',
        to: 'HEAD',
        config,
        changelog: true,
      })

      expect(commits).toHaveLength(1)
      expect(commits[0].type).toBe('feat')
    })
  })
})
