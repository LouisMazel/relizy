/**
 * Regression tests for Windows path separator mismatch in commit body matching.
 *
 * Root cause: `path.relative()` returns backslash-separated paths on win32
 * (e.g. `packages\pkg-a`), while `git log --name-status` always outputs
 * forward-slash paths (e.g. `packages/pkg-a/src/foo.ts`). Before the fix,
 * `commit.body.includes(relative(cwd, pkg.path))` always returned `false` on
 * Windows, causing every package's commit list to be empty in independent mode.
 *
 * Fix: normalize `relative()` result with `.split(sep).join('/')` before the
 * `includes` comparison in both `isCommitOfTrackedPackages` and `getPackageCommits`.
 *
 * @see https://github.com/LouisMazel/relizy/issues/52
 */
import type { GitCommit } from 'changelogen'
import * as changelogen from 'changelogen'
import { vol } from 'memfs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig } from '../../../tests/mocks'
import { getPackageCommits } from '../repo'

// ─── File system ──────────────────────────────────────────────────────────────

vi.mock('node:fs', async () => {
  const memfs = await import('memfs')
  return memfs.fs
})

vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs')
  return memfs.fs.promises
})

// ─── Simulate Windows path module ─────────────────────────────────────────────
// Override `sep` and `relative` to reproduce win32 behavior where `relative()`
// returns backslash-separated paths regardless of the actual OS.

vi.mock('node:path', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:path')>()
  return {
    ...original,
    sep: '\\',
    relative: (from: string, to: string): string => {
      // Use posix.relative so the test paths work on all platforms, then
      // convert forward slashes to backslashes to simulate win32 output.
      const posixResult = original.posix.relative(from, to)
      return posixResult.split('/').join('\\')
    },
  }
})

// ─── Other mocks ──────────────────────────────────────────────────────────────

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

vi.mock('../version', () => ({
  determineReleaseType: vi.fn(() => 'patch'),
  getPackageNewVersion: vi.fn(() => '1.0.1'),
  isChangedPreid: vi.fn(() => false),
  isGraduating: vi.fn(() => false),
  isPrerelease: vi.fn(() => false),
  isStableReleaseType: vi.fn(() => true),
}))

vi.mock('../dependencies', () => ({
  expandPackagesToBumpWithDependents: vi.fn(({ allPackages }: any) => allPackages),
  getPackageDependencies: vi.fn(() => []),
}))

vi.mock('changelogen', () => ({
  getGitDiff: vi.fn(() => 'mock diff'),
  parseCommits: vi.fn(() => []),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MOCK_CWD = '/test-repo'
const PKG_PATH = `${MOCK_CWD}/packages/pkg-a`

function makeMockPkg() {
  return {
    name: 'pkg-a',
    path: PKG_PATH,
    version: '1.0.0',
    private: false,
    newVersion: undefined as string | undefined,
    dependencies: [] as string[],
    dependencyChain: [] as string[],
    reason: undefined as string | undefined,
    fromTag: 'pkg-a@1.0.0',
    commits: [] as GitCommit[],
  }
}

function makeCommit(overrides: Partial<GitCommit>): GitCommit {
  return {
    shortHash: 'abc1234',
    author: { name: 'Test', email: 'test@example.com' },
    message: 'feat: test',
    body: '',
    type: 'feat',
    scope: '',
    references: [],
    description: 'test',
    isBreaking: false,
    authors: [],
    ...overrides,
  } as GitCommit
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Given Windows-style path separators from path.relative()', () => {
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

  describe('When commit body contains a forward-slash path (as git always produces)', () => {
    it('Then the commit IS included for the matching package', async () => {
      // git log --name-status always outputs forward slashes, even on Windows.
      const gitStyleBody = '\nM\tpackages/pkg-a/src/components/Button.vue\n'

      vi.mocked(changelogen.parseCommits).mockReturnValue([
        makeCommit({ type: 'feat', body: gitStyleBody }),
      ])

      const config = createMockConfig({
        cwd: MOCK_CWD,
        bump: { type: 'release' },
        monorepo: { versionMode: 'independent', packages: ['packages/*'] },
      })

      const commits = await getPackageCommits({
        pkg: makeMockPkg() as any,
        from: 'pkg-a@1.0.0',
        to: 'HEAD',
        config,
        changelog: false,
      })

      // With the fix, the commit IS included:
      // relative() → 'packages\\pkg-a'
      // .split(sep).join('/') → 'packages/pkg-a'
      // body.includes('packages/pkg-a') → true ✓
      expect(commits).toHaveLength(1)
      expect(commits[0].type).toBe('feat')
    })

    it('Then multiple commits touching the package are all included', async () => {
      const gitBodyA = '\nM\tpackages/pkg-a/src/utils.ts\n'
      const gitBodyB = '\nA\tpackages/pkg-a/src/newFile.ts\n'

      vi.mocked(changelogen.parseCommits).mockReturnValue([
        makeCommit({ shortHash: 'aaa0001', type: 'feat', body: gitBodyA }),
        makeCommit({ shortHash: 'bbb0002', type: 'fix', body: gitBodyB }),
      ])

      const config = createMockConfig({
        cwd: MOCK_CWD,
        bump: { type: 'release' },
        monorepo: { versionMode: 'independent', packages: ['packages/*'] },
      })

      const commits = await getPackageCommits({
        pkg: makeMockPkg() as any,
        from: 'pkg-a@1.0.0',
        to: 'HEAD',
        config,
        changelog: false,
      })

      expect(commits).toHaveLength(2)
    })

    it('Then a commit touching a different package is correctly excluded', async () => {
      // This commit only modifies pkg-b — it must NOT appear for pkg-a.
      const otherPkgBody = '\nM\tpackages/pkg-b/src/index.ts\n'

      vi.mocked(changelogen.parseCommits).mockReturnValue([
        makeCommit({ type: 'fix', body: otherPkgBody }),
      ])

      const config = createMockConfig({
        cwd: MOCK_CWD,
        bump: { type: 'release' },
        monorepo: { versionMode: 'independent', packages: ['packages/*'] },
      })

      const commits = await getPackageCommits({
        pkg: makeMockPkg() as any,
        from: 'pkg-a@1.0.0',
        to: 'HEAD',
        config,
        changelog: false,
      })

      // commit.body does not contain 'packages/pkg-a' → correctly excluded
      expect(commits).toHaveLength(0)
    })

    it('Then commits with empty body are excluded (no path to match)', async () => {
      vi.mocked(changelogen.parseCommits).mockReturnValue([
        makeCommit({ type: 'feat', body: '' }),
      ])

      const config = createMockConfig({
        cwd: MOCK_CWD,
        bump: { type: 'release' },
        monorepo: { versionMode: 'independent', packages: ['packages/*'] },
      })

      const commits = await getPackageCommits({
        pkg: makeMockPkg() as any,
        from: 'pkg-a@1.0.0',
        to: 'HEAD',
        config,
        changelog: false,
      })

      expect(commits).toHaveLength(0)
    })
  })
})
