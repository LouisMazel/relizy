import { execSync } from 'node:child_process'
import { vol } from 'memfs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig } from '../../../tests/mocks'
import { getGitDiff } from '../git-refs'
import { getNewPackageCompareBase, getPackageCommits } from '../repo'

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}))

vi.mock('node:fs', async () => {
  const memfs = await import('memfs')
  return memfs.fs
})

vi.mock('../git-refs', async importActual => ({
  ...(await importActual<typeof import('../git-refs')>()),
  getGitDiff: vi.fn(() => []),
}))

function mockGit({ firstCommit, parent }: { firstCommit: string, parent?: string | Error }) {
  vi.mocked(execSync).mockImplementation(((command: string) => {
    if (command.startsWith('git log')) {
      return `${firstCommit}\n`
    }
    if (command.startsWith('git rev-parse')) {
      if (parent instanceof Error) {
        throw parent
      }
      return `${parent ?? ''}\n`
    }
    throw new Error(`Unexpected command: ${command}`)
  }) as typeof execSync)
}

describe('Given getNewPackageCompareBase function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When the first package commit has a parent', () => {
    it('Then returns the parent commit so the whole package history is covered', () => {
      mockGit({ firstCommit: 'first123', parent: 'parent456' })

      expect(getNewPackageCompareBase('/repo/packages/web', '/repo')).toBe('parent456')
      expect(execSync).toHaveBeenCalledWith(
        'git rev-parse --verify --quiet "first123^"',
        expect.objectContaining({ cwd: '/repo' }),
      )
    })
  })

  describe('When the first package commit is the repository root commit', () => {
    it('Then falls back to the first package commit', () => {
      mockGit({ firstCommit: 'root123', parent: new Error('no parent') })

      expect(getNewPackageCompareBase('/repo/packages/web', '/repo')).toBe('root123')
    })
  })

  describe('When the package has no commits yet', () => {
    it('Then returns null', () => {
      mockGit({ firstCommit: '' })

      expect(getNewPackageCompareBase('/repo/packages/web', '/repo')).toBeNull()
    })
  })
})

describe('Given getPackageCommits function with a new package', () => {
  const cwd = '/repo'
  const pkg = { name: '@scope/web', version: '0.0.0', path: `${cwd}/packages/web`, fromTag: '__NEW_PACKAGE__', private: false }

  beforeEach(() => {
    vi.clearAllMocks()
    vol.reset()
    vol.fromJSON({
      [`${cwd}/package.json`]: JSON.stringify({ name: 'root', version: '1.0.0' }),
      [`${pkg.path}/package.json`]: JSON.stringify({ name: pkg.name, version: pkg.version }),
    })
  })

  function run() {
    return getPackageCommits({
      pkg,
      from: '__NEW_PACKAGE__',
      to: 'HEAD',
      config: createMockConfig({ cwd, bump: { type: 'release' } }),
      changelog: true,
    })
  }

  describe('When the first package commit has a parent', () => {
    it('Then scopes git log from that parent', async () => {
      mockGit({ firstCommit: 'first123', parent: 'parent456' })

      await run()

      expect(getGitDiff).toHaveBeenCalledWith('parent456', 'HEAD', cwd)
    })
  })

  describe('When the first package commit is the repository root commit', () => {
    it('Then drops the lower bound instead of passing an invalid `<root>^` ref', async () => {
      mockGit({ firstCommit: 'root123', parent: new Error('no parent') })

      await run()

      expect(getGitDiff).toHaveBeenCalledWith(undefined, 'HEAD', cwd)
    })
  })

  describe('When the package has no commits yet', () => {
    it('Then returns no commits without calling git log', async () => {
      mockGit({ firstCommit: '' })

      await expect(run()).resolves.toEqual([])
      expect(getGitDiff).not.toHaveBeenCalled()
    })
  })
})
