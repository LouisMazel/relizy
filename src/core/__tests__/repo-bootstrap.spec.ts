import type { GitCommit } from 'changelogen'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { getGitDiff, parseCommits } from 'changelogen'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockCommit, createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import { getPackageCommits } from '../repo'
import { NEW_PACKAGE_MARKER } from '../tags'

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn(),
}))

vi.mock('changelogen', () => ({
  getGitDiff: vi.fn(),
  parseCommits: vi.fn(),
}))

describe('Given NEW_PACKAGE_MARKER commit lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(execSync).mockImplementation((command) => {
      if (command === 'git log --reverse --format="%H" -- "packages/pkg-a"') {
        return 'abc123\nxyz456\n'
      }

      throw new Error(`Unexpected command: ${command}`)
    })
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(statSync).mockReturnValue({
      isDirectory: () => true,
    } as ReturnType<typeof statSync>)
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      name: 'repo-root',
      version: '1.0.0',
      private: false,
    }))

    vi.mocked(getGitDiff).mockResolvedValue([] as any)
    vi.mocked(parseCommits).mockReturnValue([
      {
        ...createMockCommit('feat', 'first package release'),
        body: 'packages/pkg-a',
      } as GitCommit,
    ])
  })

  it('uses the first package commit parent without relying on shell head', async () => {
    const commits = await getPackageCommits({
      pkg: createMockPackageInfo({
        name: 'pkg-a',
        path: '/repo/packages/pkg-a',
      }),
      from: NEW_PACKAGE_MARKER,
      to: 'HEAD',
      config: createMockConfig({
        cwd: '/repo',
        bump: { type: 'patch' },
        monorepo: {
          versionMode: 'selective',
          packages: undefined as any,
        },
      }),
      changelog: false,
    })

    expect(execSync).toHaveBeenCalledWith(
      'git log --reverse --format="%H" -- "packages/pkg-a"',
      expect.objectContaining({ cwd: '/repo', encoding: 'utf8' }),
    )
    expect(getGitDiff).toHaveBeenCalledWith('abc123^', 'HEAD', '/repo')
    expect(commits).toHaveLength(1)
  })

  it('returns empty commits when the package history lookup is empty', async () => {
    vi.mocked(execSync).mockReturnValueOnce('\n')

    const commits = await getPackageCommits({
      pkg: createMockPackageInfo({
        name: 'pkg-a',
        path: '/repo/packages/pkg-a',
      }),
      from: NEW_PACKAGE_MARKER,
      to: 'HEAD',
      config: createMockConfig({
        cwd: '/repo',
        bump: { type: 'patch' },
        monorepo: {
          versionMode: 'selective',
          packages: undefined as any,
        },
      }),
      changelog: false,
    })

    expect(getGitDiff).not.toHaveBeenCalled()
    expect(commits).toEqual([])
  })
})
