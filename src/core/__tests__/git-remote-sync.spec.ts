import type { ResolvedRelizyConfig } from '../config'
import { execSync } from 'node:child_process'
import { execPromise, logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import {
  assertBranchUpToDateWithRemote,
  assertReleaseTagsAvailable,
  getGitUpstream,
  getReleaseTagNames,
  pushCommitAndTags,
} from '../git'
import { isAncestor, tagExists } from '../git-refs'
import { readPackageJson } from '../repo'

vi.mock('node:child_process')

vi.mock('../git-refs', () => ({
  tagExists: vi.fn(),
  isAncestor: vi.fn(),
}))

vi.mock('../repo', () => ({
  readPackageJson: vi.fn(),
  hasLernaJson: vi.fn(),
}))

type GitResponse = string | Error | (() => string)

const upstreamResponses: Record<string, GitResponse> = {
  'git config --get branch.develop.remote': 'origin\n',
  'git config --get branch.develop.merge': 'refs/heads/develop\n',
  'git rev-parse --symbolic-full-name @{upstream}': 'refs/remotes/origin/develop\n',
}

function mockGit(responses: Record<string, GitResponse>) {
  vi.mocked(execPromise).mockImplementation((command: string) => {
    const key = Object.keys(responses).find(prefix => command.startsWith(prefix))
    const response = key === undefined ? '' : responses[key]

    try {
      if (response instanceof Error) {
        throw response
      }

      const stdout = typeof response === 'function' ? response() : response

      return Promise.resolve({ stdout: stdout ?? '', stderr: '' })
    }
    catch (error) {
      return Promise.reject(error)
    }
  })
}

function getExecutedCommands(): string[] {
  return vi.mocked(execPromise).mock.calls.map(([command]) => command)
}

function createPushRejectedError(reason = 'non-fast-forward') {
  return Object.assign(new Error('Command failed: git push --follow-tags'), {
    stderr: ` ! [rejected]          develop -> develop (${reason})\nerror: failed to push some refs\n`,
  })
}

function rejectFirstPush(error: Error): () => string {
  let attempts = 0

  return () => {
    attempts++

    if (attempts === 1) {
      throw error
    }

    return ''
  }
}

function createReleaseConfig(overrides: Partial<ResolvedRelizyConfig['release']> = {}): ResolvedRelizyConfig {
  const config = createMockConfig({ bump: { type: 'patch' } })

  config.release = {
    ...config.release,
    gitTag: true,
    commit: true,
    push: true,
    noVerify: false,
    ...overrides,
  }

  return config
}

describe('Given getGitUpstream function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(execSync).mockReturnValue('develop\n')
  })

  describe('When the current branch tracks a remote branch', () => {
    it('Then returns the upstream details', async () => {
      mockGit(upstreamResponses)

      const upstream = await getGitUpstream('/project')

      expect(upstream).toEqual({
        remote: 'origin',
        mergeRef: 'refs/heads/develop',
        trackingRef: 'refs/remotes/origin/develop',
        name: 'origin/develop',
      })
    })
  })

  describe('When HEAD is detached', () => {
    it('Then returns null', async () => {
      vi.mocked(execSync).mockReturnValue('HEAD\n')
      mockGit(upstreamResponses)

      const upstream = await getGitUpstream('/project')

      expect(upstream).toBeNull()
    })
  })

  describe('When the branch has no upstream', () => {
    it('Then returns null', async () => {
      mockGit({
        ...upstreamResponses,
        'git rev-parse --symbolic-full-name @{upstream}': new Error('no upstream configured'),
      })

      const upstream = await getGitUpstream('/project')

      expect(upstream).toBeNull()
    })
  })
})

describe('Given assertBranchUpToDateWithRemote function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(execSync).mockReturnValue('develop\n')
  })

  describe('When the branch contains every remote commit', () => {
    it('Then resolves after fetching the upstream branch', async () => {
      mockGit({ ...upstreamResponses, 'git rev-list --count': '0\n' })

      await expect(assertBranchUpToDateWithRemote({ cwd: '/project' })).resolves.toBeUndefined()

      expect(getExecutedCommands()).toContain('git fetch origin +refs/heads/develop:refs/remotes/origin/develop')
      expect(getExecutedCommands()).toContain('git rev-list --count HEAD..refs/remotes/origin/develop')
    })
  })

  describe('When the remote branch received new commits', () => {
    it('Then rejects with the number of missing commits', async () => {
      mockGit({ ...upstreamResponses, 'git rev-list --count': '2\n' })

      await expect(assertBranchUpToDateWithRemote({ cwd: '/project' }))
        .rejects
        .toThrow('The current branch is behind "origin/develop" by 2 commit(s)')
    })
  })

  describe('When the branch has no upstream', () => {
    it('Then resolves without fetching', async () => {
      vi.mocked(execSync).mockReturnValue('HEAD\n')
      mockGit(upstreamResponses)

      await expect(assertBranchUpToDateWithRemote({ cwd: '/project' })).resolves.toBeUndefined()

      expect(getExecutedCommands().some(command => command.startsWith('git fetch'))).toBe(false)
    })
  })

  describe('When the remote cannot be fetched', () => {
    it('Then resolves with a warning', async () => {
      const warnSpy = vi.spyOn(logger, 'warn')
      mockGit({ ...upstreamResponses, 'git fetch': new Error('network error') })

      await expect(assertBranchUpToDateWithRemote({ cwd: '/project' })).resolves.toBeUndefined()

      expect(warnSpy).toHaveBeenCalledWith('Could not fetch "origin/develop", skipping remote sync check')
    })
  })
})

describe('Given pushCommitAndTags function with a rejected push', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(execSync).mockReturnValue('develop\n')
  })

  describe('When the push is rejected as non-fast-forward', () => {
    describe('When the remote commits merge cleanly', () => {
      it('Then merges the upstream branch and pushes again', async () => {
        mockGit({ ...upstreamResponses, 'git push': rejectFirstPush(createPushRejectedError()) })

        await pushCommitAndTags({ config: createReleaseConfig(), dryRun: false, cwd: '/project', tags: ['v1.0.1'] })

        const commands = getExecutedCommands()
        expect(commands).toContain('git fetch origin +refs/heads/develop:refs/remotes/origin/develop')
        expect(commands).toContain('git merge --no-edit origin/develop')
        expect(commands.filter(command => command === 'git push --follow-tags')).toHaveLength(2)
      })

      it('Then passes --no-verify to the merge when noVerify is enabled', async () => {
        mockGit({ ...upstreamResponses, 'git push': rejectFirstPush(createPushRejectedError()) })

        await pushCommitAndTags({ config: createReleaseConfig({ noVerify: true }), dryRun: false, cwd: '/project' })

        expect(getExecutedCommands()).toContain('git merge --no-edit --no-verify origin/develop')
      })
    })

    describe('When the remote commits conflict with the release commit', () => {
      it('Then aborts the merge, pushes the tags and rejects with recovery instructions', async () => {
        mockGit({
          ...upstreamResponses,
          'git push --follow-tags': () => {
            throw createPushRejectedError()
          },
          'git merge --no-edit': new Error('CONFLICT (content): Merge conflict in package.json'),
        })

        await expect(pushCommitAndTags({ config: createReleaseConfig(), dryRun: false, cwd: '/project', tags: ['v1.0.1'] }))
          .rejects
          .toThrow('git fetch --tags && git merge v1.0.1 && git push')

        const commands = getExecutedCommands()
        expect(commands).toContain('git merge --abort')
        expect(commands).toContain('git push origin refs/tags/v1.0.1')
      })

      it('Then still rejects with recovery instructions when the cleanup commands fail', async () => {
        mockGit({
          ...upstreamResponses,
          'git push origin': new Error('network error'),
          'git push --follow-tags': () => {
            throw createPushRejectedError()
          },
          'git merge --no-edit': new Error('CONFLICT (content): Merge conflict in package.json'),
          'git merge --abort': new Error('There is no merge to abort'),
        })

        await expect(pushCommitAndTags({ config: createReleaseConfig(), dryRun: false, cwd: '/project', tags: ['v1.0.1'] }))
          .rejects
          .toThrow('git fetch --tags && git merge v1.0.1 && git push')
      })
    })
  })

  describe('When the push is rejected because the remote has unknown commits', () => {
    it('Then merges the upstream branch and pushes again', async () => {
      mockGit({ ...upstreamResponses, 'git push': rejectFirstPush(createPushRejectedError('fetch first')) })

      await pushCommitAndTags({ config: createReleaseConfig(), dryRun: false, cwd: '/project' })

      expect(getExecutedCommands()).toContain('git merge --no-edit origin/develop')
    })
  })

  describe('When the push fails for another reason', () => {
    it('Then rethrows the error without merging', async () => {
      const pushError = Object.assign(new Error('Command failed: git push --follow-tags'), {
        stderr: ' ! [remote rejected] develop -> develop (protected branch hook declined)\n',
      })
      mockGit({ ...upstreamResponses, 'git push': pushError })

      await expect(pushCommitAndTags({ config: createReleaseConfig(), dryRun: false, cwd: '/project' }))
        .rejects
        .toBe(pushError)

      expect(getExecutedCommands().some(command => command.startsWith('git merge'))).toBe(false)
    })
  })

  describe('When the branch has no upstream', () => {
    it('Then rethrows the push error', async () => {
      vi.mocked(execSync).mockReturnValue('HEAD\n')
      const pushError = createPushRejectedError()
      mockGit({ 'git push': pushError })

      await expect(pushCommitAndTags({ config: createReleaseConfig(), dryRun: false, cwd: '/project' }))
        .rejects
        .toBe(pushError)
    })
  })
})

describe('Given getReleaseTagNames function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When the version mode is unified', () => {
    it('Then returns the tag built from the new version', () => {
      const config = createReleaseConfig()
      config.monorepo = { ...config.monorepo!, versionMode: 'unified' }

      expect(getReleaseTagNames({ config, newVersion: '1.2.0' })).toEqual(['v1.2.0'])
    })

    it('Then falls back to the root package version', () => {
      vi.mocked(readPackageJson).mockReturnValue({ name: 'root', version: '1.3.0', path: '/project', private: true })
      const config = createReleaseConfig()

      expect(getReleaseTagNames({ config })).toEqual(['v1.3.0'])
    })
  })

  describe('When the version mode is independent', () => {
    it('Then returns one tag per bumped package', () => {
      const config = createReleaseConfig()
      config.monorepo = { ...config.monorepo!, versionMode: 'independent' }
      const bumpedPackages = [
        { ...createMockPackageInfo({ name: 'pkg-a', newVersion: '1.0.1' }), oldVersion: '1.0.0' },
        { ...createMockPackageInfo({ name: 'pkg-b', newVersion: '2.1.0' }), oldVersion: '2.0.0' },
      ]

      expect(getReleaseTagNames({ config, bumpedPackages })).toEqual(['pkg-a@1.0.1', 'pkg-b@2.1.0'])
    })
  })

  describe('When git tags are disabled', () => {
    it('Then returns no tag', () => {
      const config = createReleaseConfig({ gitTag: false })

      expect(getReleaseTagNames({ config, newVersion: '1.2.0' })).toEqual([])
    })
  })
})

describe('Given assertReleaseTagsAvailable function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When none of the tags exist', () => {
    it('Then resolves', async () => {
      vi.mocked(tagExists).mockResolvedValue(false)

      await expect(assertReleaseTagsAvailable({ tags: ['v1.0.1'], cwd: '/project' })).resolves.toBeUndefined()
    })
  })

  describe('When a tag exists outside of the branch history', () => {
    it('Then rejects with recovery instructions', async () => {
      vi.mocked(tagExists).mockResolvedValue(true)
      vi.mocked(isAncestor).mockResolvedValue(false)

      await expect(assertReleaseTagsAvailable({ tags: ['v1.0.1'], cwd: '/project' }))
        .rejects
        .toThrow('git fetch --tags && git merge v1.0.1 && git push')
    })
  })

  describe('When a tag exists in the branch history', () => {
    it('Then rejects because the package versions are behind', async () => {
      vi.mocked(tagExists).mockResolvedValue(true)
      vi.mocked(isAncestor).mockResolvedValue(true)

      await expect(assertReleaseTagsAvailable({ tags: ['v1.0.1'], cwd: '/project' }))
        .rejects
        .toThrow('Tag "v1.0.1" already exists. Check the versions in your package.json files')
    })
  })
})
