import type { ResolvedRelizyConfig } from '../config'
import { logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import {
  assertBranchUpToDateWithRemote,
  assertReleaseTagsAvailable,
  BranchBehindRemoteError,
  getGitUpstream,
  getReleaseTagNames,
  pushCommitAndTags,
} from '../git'
import { runGit, runGitSync } from '../git-exec'
import { isAncestor, tagExists } from '../git-refs'
import { readPackageJson } from '../repo'

vi.mock('../git-exec', async (importActual) => {
  const actual = await importActual<typeof import('../git-exec')>()
  const runGit = vi.fn()
  return {
    ...actual,
    runGit,
    runGitSync: vi.fn(),
    tryGit: vi.fn(async (...args: Parameters<typeof actual.runGit>) => {
      try {
        return await runGit(...args)
      }
      catch {
        return undefined
      }
    }),
  }
})

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
  'config --get branch.develop.remote': 'origin\n',
  'config --get branch.develop.merge': 'refs/heads/develop\n',
  'rev-parse --symbolic-full-name @{upstream}': 'refs/remotes/origin/develop\n',
}

function mockGit(responses: Record<string, GitResponse>) {
  vi.mocked(runGit).mockImplementation((args: string[]) => {
    const command = args.join(' ')
    const key = Object.keys(responses).find(prefix => command.startsWith(prefix))
    const response = key === undefined
      ? ''
      : responses[key]

    try {
      if (response instanceof Error) {
        throw response
      }

      const stdout = typeof response === 'function'
        ? response()
        : response

      return Promise.resolve((stdout ?? '').trim())
    }
    catch (error) {
      return Promise.reject(error)
    }
  })
}

function getExecutedCommands(): string[] {
  return vi.mocked(runGit).mock.calls.map(([args]) => args.join(' '))
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
  const config = createMockConfig({
    bump: { type: 'patch' },
  })

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
    vi.mocked(runGitSync).mockReturnValue('develop')
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
      vi.mocked(runGitSync).mockReturnValue('HEAD')
      mockGit(upstreamResponses)

      const upstream = await getGitUpstream('/project')

      expect(upstream).toBeNull()
    })
  })

  describe('When the branch has no upstream', () => {
    it('Then returns null', async () => {
      mockGit({
        ...upstreamResponses,
        'rev-parse --symbolic-full-name @{upstream}': new Error('no upstream configured'),
      })

      const upstream = await getGitUpstream('/project')

      expect(upstream).toBeNull()
    })
  })
})

describe('Given a branch named with shell metacharacters', () => {
  it('Then passes it inside a single git argument', async () => {
    const branch = 'feat/$(whoami)"`id`\''
    vi.clearAllMocks()
    vi.mocked(runGitSync).mockReturnValue(branch)
    mockGit({
      [`config --get branch.${branch}.remote`]: 'origin\n',
      [`config --get branch.${branch}.merge`]: 'refs/heads/develop\n',
      'rev-parse --symbolic-full-name': 'refs/remotes/origin/develop\n',
    })

    await expect(getGitUpstream('/project')).resolves.toMatchObject({ remote: 'origin' })

    expect(vi.mocked(runGit).mock.calls.map(([args]) => args)).toContainEqual(['config', '--get', `branch.${branch}.remote`])
  })
})

describe('Given assertBranchUpToDateWithRemote function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(runGitSync).mockReturnValue('develop')
  })

  describe('When the branch contains every remote commit', () => {
    it('Then resolves after fetching the upstream branch', async () => {
      mockGit({ ...upstreamResponses, 'rev-list --count': '0\n' })

      await expect(assertBranchUpToDateWithRemote({ cwd: '/project' })).resolves.toBeUndefined()

      expect(getExecutedCommands()).toContain('fetch origin +refs/heads/develop:refs/remotes/origin/develop')
      expect(getExecutedCommands()).toContain('rev-list --count HEAD..refs/remotes/origin/develop')
    })
  })

  describe('When the remote branch received new commits', () => {
    it('Then rejects with the number of missing commits', async () => {
      mockGit({ ...upstreamResponses, 'rev-list --count': '2\n' })

      const error = await assertBranchUpToDateWithRemote({ cwd: '/project' }).catch((error: unknown) => error)

      expect(error).toBeInstanceOf(BranchBehindRemoteError)
      expect(error).toMatchObject({ upstream: 'origin/develop', missingCommits: 2 })
      expect((error as Error).message).toContain('The current branch is behind "origin/develop" by 2 commits')
    })

    it('Then gives the fix for where it runs: pull the commits locally, run the job again in CI', () => {
      expect(new BranchBehindRemoteError('origin/develop', 1, false).message).toBe(
        'The current branch is behind "origin/develop" by 1 commit that this checkout does not have: the release commit would not be pushed.\n'
        + 'Fix: get them with "git pull --rebase", then run the release again.',
      )
      expect(new BranchBehindRemoteError('origin/develop', 2, true).message).toBe(
        'The current branch is behind "origin/develop" by 2 commits, pushed after this job checked out the branch: the release commit would not be pushed.\n'
        + 'Fix: run the job again on the latest commit of "origin/develop".',
      )
    })
  })

  describe('When the branch has no upstream', () => {
    it('Then resolves without fetching', async () => {
      vi.mocked(runGitSync).mockReturnValue('HEAD')
      mockGit(upstreamResponses)

      await expect(assertBranchUpToDateWithRemote({ cwd: '/project' })).resolves.toBeUndefined()

      expect(getExecutedCommands().some(command => command.startsWith('fetch'))).toBe(false)
    })
  })

  describe('When the remote cannot be fetched', () => {
    it('Then resolves with a warning', async () => {
      const warnSpy = vi.spyOn(logger, 'warn')
      mockGit({
        ...upstreamResponses,
        fetch: new Error('network error'),
      })

      await expect(assertBranchUpToDateWithRemote({ cwd: '/project' })).resolves.toBeUndefined()

      expect(warnSpy).toHaveBeenCalledWith('Could not fetch "origin/develop", skipping remote sync check')
    })
  })
})

describe('Given pushCommitAndTags function with a rejected push', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(runGitSync).mockReturnValue('develop')
  })

  describe('When the push is rejected as non-fast-forward', () => {
    describe('When the remote commits merge cleanly', () => {
      it('Then merges the upstream branch and pushes again', async () => {
        mockGit({
          ...upstreamResponses,
          push: rejectFirstPush(createPushRejectedError()),
        })

        await pushCommitAndTags({
          config: createReleaseConfig(),
          dryRun: false,
          cwd: '/project',
          tags: ['v1.0.1'],
        })

        const commands = getExecutedCommands()
        expect(commands).toContain('fetch origin +refs/heads/develop:refs/remotes/origin/develop')
        expect(commands).toContain('merge --no-edit origin/develop')
        expect(commands.filter(command => command === 'push --follow-tags')).toHaveLength(2)
      })

      it('Then passes --no-verify to the merge when noVerify is enabled', async () => {
        mockGit({
          ...upstreamResponses,
          push: rejectFirstPush(createPushRejectedError()),
        })

        await pushCommitAndTags({
          config: createReleaseConfig({ noVerify: true }),
          dryRun: false,
          cwd: '/project',
        })

        expect(getExecutedCommands()).toContain('merge --no-edit --no-verify origin/develop')
      })
    })

    describe('When the remote commits conflict with the release commit', () => {
      it('Then aborts the merge, pushes the tags and rejects with recovery instructions', async () => {
        mockGit({
          ...upstreamResponses,
          'push --follow-tags': () => {
            throw createPushRejectedError()
          },
          'merge --no-edit': new Error('CONFLICT (content): Merge conflict in package.json'),
        })

        await expect(pushCommitAndTags({
          config: createReleaseConfig(),
          dryRun: false,
          cwd: '/project',
          tags: ['v1.0.1'],
        }))
          .rejects
          .toThrow('git fetch --tags && git merge v1.0.1 && git push')

        const commands = getExecutedCommands()
        expect(commands).toContain('merge --abort')
        expect(commands).toContain('push origin refs/tags/v1.0.1')
      })

      it('Then still rejects with recovery instructions when the cleanup commands fail', async () => {
        mockGit({
          ...upstreamResponses,
          'push origin': new Error('network error'),
          'push --follow-tags': () => {
            throw createPushRejectedError()
          },
          'merge --no-edit': new Error('CONFLICT (content): Merge conflict in package.json'),
          'merge --abort': new Error('There is no merge to abort'),
        })

        await expect(pushCommitAndTags({
          config: createReleaseConfig(),
          dryRun: false,
          cwd: '/project',
          tags: ['v1.0.1'],
        }))
          .rejects
          .toThrow('git fetch --tags && git merge v1.0.1 && git push')
      })
    })
  })

  describe('When the push is rejected because the remote has unknown commits', () => {
    it('Then merges the upstream branch and pushes again', async () => {
      mockGit({
        ...upstreamResponses,
        push: rejectFirstPush(createPushRejectedError('fetch first')),
      })

      await pushCommitAndTags({
        config: createReleaseConfig(),
        dryRun: false,
        cwd: '/project',
      })

      expect(getExecutedCommands()).toContain('merge --no-edit origin/develop')
    })
  })

  describe('When the push fails for another reason', () => {
    it('Then rethrows the error without merging', async () => {
      const pushError = Object.assign(new Error('Command failed: git push --follow-tags'), {
        stderr: ' ! [remote rejected] develop -> develop (protected branch hook declined)\n',
      })
      mockGit({ ...upstreamResponses, push: pushError })

      await expect(pushCommitAndTags({
        config: createReleaseConfig(),
        dryRun: false,
        cwd: '/project',
      }))
        .rejects
        .toBe(pushError)

      expect(getExecutedCommands().some(command => command.startsWith('merge'))).toBe(false)
    })
  })

  describe('When the branch has no upstream', () => {
    it('Then rethrows the push error', async () => {
      vi.mocked(runGitSync).mockReturnValue('HEAD')
      const pushError = createPushRejectedError()
      mockGit({ push: pushError })

      await expect(pushCommitAndTags({
        config: createReleaseConfig(),
        dryRun: false,
        cwd: '/project',
      }))
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
      vi.mocked(readPackageJson).mockReturnValue({
        name: 'root',
        version: '1.3.0',
        path: '/project',
        private: true,
      })
      const config = createReleaseConfig()

      expect(getReleaseTagNames({ config })).toEqual(['v1.3.0'])
    })
  })

  describe('When the version mode is independent', () => {
    it('Then returns one tag per bumped package', () => {
      const config = createReleaseConfig()
      config.monorepo = { ...config.monorepo!, versionMode: 'independent' }
      const bumpedPackages = [
        {
          ...createMockPackageInfo({ name: 'pkg-a', newVersion: '1.0.1' }),
          oldVersion: '1.0.0',
        },
        {
          ...createMockPackageInfo({ name: 'pkg-b', newVersion: '2.1.0' }),
          oldVersion: '2.0.0',
        },
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

      await expect(assertReleaseTagsAvailable({
        tags: ['v1.0.1'],
        cwd: '/project',
      })).resolves.toBeUndefined()
    })
  })

  describe('When a tag exists outside of the branch history', () => {
    it('Then rejects with recovery instructions', async () => {
      vi.mocked(tagExists).mockResolvedValue(true)
      vi.mocked(isAncestor).mockResolvedValue(false)

      await expect(assertReleaseTagsAvailable({
        tags: ['v1.0.1'],
        cwd: '/project',
      }))
        .rejects
        .toThrow('git fetch --tags && git merge v1.0.1 && git push')
    })
  })

  describe('When a tag exists in the branch history', () => {
    it('Then rejects because the package versions are behind', async () => {
      vi.mocked(tagExists).mockResolvedValue(true)
      vi.mocked(isAncestor).mockResolvedValue(true)

      await expect(assertReleaseTagsAvailable({
        tags: ['v1.0.1'],
        cwd: '/project',
      }))
        .rejects
        .toThrow('Tag "v1.0.1" already exists. Check the versions in your package.json files')
    })
  })
})
