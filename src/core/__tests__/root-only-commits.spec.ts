/**
 * Regression test: root-only commits must appear in the root package changelog.
 *
 * Bug: `getPackageCommits` previously filtered commits for the root package
 * through `isCommitOfTrackedPackages`, which required the commit body to
 * contain at least one monorepo package path (e.g. `packages/*`).
 * Commits that only touched root-level files (CI config, root `package.json`,
 * lockfile, build scripts…) were therefore excluded from the root changelog,
 * even when their type (`build`, `ci`, …) was explicitly configured.
 *
 * Fix: for the root package, include every commit whose type is allowed.
 * The "does the commit touch any tracked package?" check no longer applies
 * to the root package.
 */
import type { GitCommit } from 'changelogen'
import * as changelogen from 'changelogen'
import { vol } from 'memfs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig } from '../../../tests/mocks'
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

vi.mock('changelogen', () => ({
  getGitDiff: vi.fn(() => 'mock diff'),
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
  return {
    shortHash: 'abc1234',
    author: { name: 'Test', email: 'test@example.com' },
    message: 'build: test',
    body: '',
    type: 'build',
    scope: '',
    references: [],
    description: 'test',
    isBreaking: false,
    authors: [],
    ...overrides,
  } as GitCommit
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
    it('Then a `build:` commit touching only root files IS included', async () => {
      // Mirrors what changelogen's `getGitDiff` produces with `--name-status`
      // for a root-only build commit (no `packages/…` path in the body).
      const rootOnlyBody = '\nM\t.gitlab/ci/release.yml\nM\tpackage.json\nM\tpnpm-lock.yaml\n'

      vi.mocked(changelogen.parseCommits).mockReturnValue([
        makeCommit({ type: 'build', description: 'upgrade relizy', body: rootOnlyBody }),
      ])

      const config = createMockConfig({
        cwd: MOCK_CWD,
        bump: { type: 'release' },
        monorepo: { versionMode: 'selective', packages: ['packages/*'] },
        types: {
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

      expect(commits).toHaveLength(1)
      expect(commits[0].type).toBe('build')
    })

    it('Then a `ci:` commit touching only root files IS included', async () => {
      const rootOnlyBody = '\nM\t.gitlab-ci.yml\n'

      vi.mocked(changelogen.parseCommits).mockReturnValue([
        makeCommit({ type: 'ci', description: 'tweak pipeline', body: rootOnlyBody }),
      ])

      const config = createMockConfig({
        cwd: MOCK_CWD,
        bump: { type: 'release' },
        monorepo: { versionMode: 'selective', packages: ['packages/*'] },
        types: {
          ci: { title: '🤖 CI' },
        },
      })

      const commits = await getPackageCommits({
        pkg: makeRootPkg() as any,
        from: 'v1.0.0',
        to: 'HEAD',
        config,
        changelog: true,
      })

      expect(commits).toHaveLength(1)
      expect(commits[0].type).toBe('ci')
    })

    it('Then `chore(release)` is still excluded by isAllowedCommit', async () => {
      const body = '\nM\tpackage.json\n'

      vi.mocked(changelogen.parseCommits).mockReturnValue([
        makeCommit({ type: 'chore', scope: 'release', description: 'bump', body }),
      ])

      const config = createMockConfig({
        cwd: MOCK_CWD,
        bump: { type: 'release' },
        monorepo: { versionMode: 'selective', packages: ['packages/*'] },
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

      vi.mocked(changelogen.parseCommits).mockReturnValue([
        makeCommit({ type: 'build', description: 'upgrade deps', body: rootOnlyBody }),
      ])

      const config = createMockConfig({
        cwd: MOCK_CWD,
        bump: { type: 'release' },
        monorepo: { versionMode: 'selective', packages: ['packages/*'] },
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

      vi.mocked(changelogen.parseCommits).mockReturnValue([
        makeCommit({ type: 'feat', description: 'new feature', body: subPkgBody }),
      ])

      const config = createMockConfig({
        cwd: MOCK_CWD,
        bump: { type: 'release' },
        monorepo: { versionMode: 'selective', packages: ['packages/*'] },
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
