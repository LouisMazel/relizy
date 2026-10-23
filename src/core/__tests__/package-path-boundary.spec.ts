/**
 * Regression test: a commit only belongs to the packages whose directory it changes.
 *
 * Bug: `getPackageCommits` attributed a commit to a sub-package when its body
 * merely contained the package path (`commit.body.includes(path)`). A package
 * whose path is a prefix of a sibling one (`packages/components` and
 * `packages/components-mcp`) received every commit of the sibling: wrong bumps
 * and changelog entries. The same happened when the path only appeared in the
 * body text of the commit, or in a nested directory (`apps/demo/packages/components`).
 *
 * Fix: compare the `--name-status` paths of the commit with the package
 * directory as a whole (`path` or `path/...`).
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
      return [`${cwd}/packages/components`, `${cwd}/packages/components-mcp`]
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

vi.mock('changelogen', () => ({
  parseCommits: vi.fn(() => []),
}))

const MOCK_CWD = '/test-repo'

function makePackage(name: string, directory: string) {
  return {
    name,
    path: `${MOCK_CWD}/${directory}`,
    version: '1.0.0',
    private: false,
  }
}

function makeCommit(description: string, nameStatus: string[], text = ''): GitCommit {
  return {
    shortHash: 'abc1234',
    author: { name: 'Test', email: 'test@example.com' },
    message: `feat: ${description}`,
    body: `\n${[text, nameStatus.join('\n')].filter(Boolean).join('\n\n')}\n`,
    type: 'feat',
    scope: '',
    references: [],
    description,
    isBreaking: false,
    authors: [],
  } as GitCommit
}

async function commitsOf(pkg: ReturnType<typeof makePackage>) {
  const config = createMockConfig({
    cwd: MOCK_CWD,
    bump: { type: 'release' },
    monorepo: { versionMode: 'independent', packages: ['packages/*'] },
  })

  const commits = await getPackageCommits({
    pkg: pkg as any,
    from: `${pkg.name}@1.0.0`,
    to: 'HEAD',
    config,
    changelog: true,
  })

  return commits.map(commit => commit.description)
}

describe('Given packages whose directory names are prefixes of each other', () => {
  const components = makePackage('components', 'packages/components')
  const componentsMcp = makePackage('components-mcp', 'packages/components-mcp')

  beforeEach(() => {
    vi.clearAllMocks()
    vol.fromJSON(
      {
        [`${MOCK_CWD}/package.json`]: JSON.stringify({ name: 'root-package', version: '1.0.0' }),
        [`${components.path}/package.json`]: JSON.stringify({ name: 'components', version: '1.0.0' }),
        [`${componentsMcp.path}/package.json`]: JSON.stringify({ name: 'components-mcp', version: '1.0.0' }),
      },
      MOCK_CWD,
    )
  })

  afterEach(() => {
    vol.reset()
  })

  describe('When a commit only changes the sibling package', () => {
    it('Then it belongs to the sibling package only', async () => {
      vi.mocked(changelogen.parseCommits).mockReturnValue([
        makeCommit('mcp tool', ['M\tpackages/components-mcp/src/tools.ts']),
      ])

      expect(await commitsOf(components)).toEqual([])
      expect(await commitsOf(componentsMcp)).toEqual(['mcp tool'])
    })
  })

  describe('When a commit changes both packages', () => {
    it('Then it belongs to both packages', async () => {
      vi.mocked(changelogen.parseCommits).mockReturnValue([
        makeCommit('shared change', ['M\tpackages/components/src/index.ts', 'M\tpackages/components-mcp/src/index.ts']),
      ])

      expect(await commitsOf(components)).toEqual(['shared change'])
      expect(await commitsOf(componentsMcp)).toEqual(['shared change'])
    })
  })

  describe('When a commit only mentions the package path in its body text', () => {
    it('Then it does not belong to the package', async () => {
      vi.mocked(changelogen.parseCommits).mockReturnValue([
        makeCommit('document the setup', ['M\tdocs/guide.md'], 'Moved from packages/components/README.md.'),
      ])

      expect(await commitsOf(components)).toEqual([])
    })
  })

  describe('When a commit changes a nested directory with the same name in another package', () => {
    it('Then it does not belong to the package', async () => {
      vi.mocked(changelogen.parseCommits).mockReturnValue([
        makeCommit('demo app', ['M\tapps/demo/packages/components/index.ts']),
      ])

      expect(await commitsOf(components)).toEqual([])
    })
  })

  describe('When a commit moves a file between the packages', () => {
    it('Then it belongs to the package of the old path and to the package of the new path', async () => {
      vi.mocked(changelogen.parseCommits).mockReturnValue([
        makeCommit('move the helper', ['R100\tpackages/components/src/helper.ts\tpackages/components-mcp/src/helper.ts']),
      ])

      expect(await commitsOf(components)).toEqual(['move the helper'])
      expect(await commitsOf(componentsMcp)).toEqual(['move the helper'])
    })
  })
})

describe('Given a package path contained in a longer directory name', () => {
  const relatedDropdown = makePackage('related-dropdown', 'shared-components/related-dropdown')

  beforeEach(() => {
    vi.clearAllMocks()
    vol.fromJSON(
      {
        [`${MOCK_CWD}/package.json`]: JSON.stringify({ name: 'root-package', version: '1.0.0' }),
        [`${relatedDropdown.path}/package.json`]: JSON.stringify({ name: 'related-dropdown', version: '1.0.0' }),
      },
      MOCK_CWD,
    )
  })

  afterEach(() => {
    vol.reset()
  })

  describe('When a commit only changes the other directory', () => {
    it('Then it does not belong to the package', async () => {
      vi.mocked(changelogen.parseCommits).mockReturnValue([
        makeCommit('other component', ['M\tshared-components/ah-related-dropdown/src/index.ts']),
      ])

      expect(await commitsOf(relatedDropdown)).toEqual([])
    })
  })

  describe('When a commit changes a file of the package with an unusual name, quoted by git', () => {
    it('Then it belongs to the package', async () => {
      vi.mocked(changelogen.parseCommits).mockReturnValue([
        makeCommit('accented file', ['A\t"shared-components/related-dropdown/src/caf\\303\\251.ts"']),
      ])

      expect(await commitsOf(relatedDropdown)).toEqual(['accented file'])
    })
  })
})
