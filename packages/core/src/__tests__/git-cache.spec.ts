import { cachedGitRead, clearGitCache, oncePerRun, withGitCache } from '../git-cache'
import { runGit, runGitSync } from '../git-exec'
import { getCurrentGitBranch, getFirstCommit, getGitDiff, isAncestor, listTags, retagAnnotatedLocal, tagExists } from '../git-refs'

vi.mock('../git-exec', async (importActual) => {
  const actual = await importActual<typeof import('../git-exec')>()
  return {
    ...actual,
    runGit: vi.fn(),
    runGitSync: vi.fn(),
  }
})

const mockRun = vi.mocked(runGit)
const mockRunSync = vi.mocked(runGitSync)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Given cachedGitRead', () => {
  describe('When it runs outside withGitCache', () => {
    it('Then it reads git each time', () => {
      const read = vi.fn(() => 'main')

      cachedGitRead({
        key: ['branch'],
        cwd: '/repo',
        read,
      })
      cachedGitRead({
        key: ['branch'],
        cwd: '/repo',
        read,
      })

      expect(read).toHaveBeenCalledTimes(2)
    })
  })

  describe('When it runs inside withGitCache', () => {
    it('Then it reads git once for the same key and cwd', () => {
      const read = vi.fn(() => 'main')

      const values = withGitCache(() => [
        cachedGitRead({
          key: ['branch'],
          cwd: '/repo',
          read,
        }),
        cachedGitRead({
          key: ['branch'],
          cwd: '/repo',
          read,
        }),
      ])

      expect(values).toEqual(['main', 'main'])
      expect(read).toHaveBeenCalledTimes(1)
    })

    it('Then it reads again for another key or another cwd', () => {
      const read = vi.fn(() => 'value')

      withGitCache(() => {
        cachedGitRead({
          key: ['branch'],
          cwd: '/repo',
          read,
        })
        cachedGitRead({
          key: ['first-commit'],
          cwd: '/repo',
          read,
        })
        cachedGitRead({
          key: ['branch'],
          cwd: '/other',
          read,
        })
      })

      expect(read).toHaveBeenCalledTimes(3)
    })

    it('Then a read that throws is read again', () => {
      const read = vi.fn()
        .mockImplementationOnce(() => {
          throw new Error('not a git repository')
        })
        .mockImplementationOnce(() => 'main')

      withGitCache(() => {
        expect(() => cachedGitRead({
          key: ['branch'],
          cwd: '/repo',
          read,
        })).toThrow('not a git repository')
        expect(cachedGitRead({
          key: ['branch'],
          cwd: '/repo',
          read,
        })).toBe('main')
      })
    })

    it('Then a rejected promise is read again', async () => {
      const read = vi.fn()
        .mockRejectedValueOnce(new Error('failed'))
        .mockResolvedValueOnce(['v1.0.0'])

      await withGitCache(async () => {
        await expect(cachedGitRead({
          key: ['tags'],
          cwd: '/repo',
          read,
        })).rejects.toThrow('failed')
        await expect(cachedGitRead({
          key: ['tags'],
          cwd: '/repo',
          read,
        })).resolves.toEqual(['v1.0.0'])
      })

      expect(read).toHaveBeenCalledTimes(2)
    })

    it('Then clearGitCache makes the next read run git', () => {
      const read = vi.fn(() => 'main')

      withGitCache(() => {
        cachedGitRead({
          key: ['branch'],
          cwd: '/repo',
          read,
        })
        clearGitCache()
        cachedGitRead({
          key: ['branch'],
          cwd: '/repo',
          read,
        })
      })

      expect(read).toHaveBeenCalledTimes(2)
    })
  })

  describe('When withGitCache is nested', () => {
    it('Then the inner run shares the cache of the outer one', () => {
      const read = vi.fn(() => 'main')

      withGitCache(() => {
        cachedGitRead({
          key: ['branch'],
          cwd: '/repo',
          read,
        })
        withGitCache(() => cachedGitRead({
          key: ['branch'],
          cwd: '/repo',
          read,
        }))
      })

      expect(read).toHaveBeenCalledTimes(1)
    })
  })

  describe('When two runs are concurrent', () => {
    it('Then each one has its own cache', async () => {
      const read = vi.fn(() => Promise.resolve('main'))

      await Promise.all([
        withGitCache(() => cachedGitRead({
          key: ['branch'],
          cwd: '/repo',
          read,
        })),
        withGitCache(() => cachedGitRead({
          key: ['branch'],
          cwd: '/repo',
          read,
        })),
      ])

      expect(read).toHaveBeenCalledTimes(2)
    })
  })

  describe('When a run is over', () => {
    it('Then the next run reads git again', () => {
      const read = vi.fn(() => 'main')

      withGitCache(() => cachedGitRead({
        key: ['branch'],
        cwd: '/repo',
        read,
      }))
      withGitCache(() => cachedGitRead({
        key: ['branch'],
        cwd: '/repo',
        read,
      }))

      expect(read).toHaveBeenCalledTimes(2)
    })
  })
})

describe('Given oncePerRun', () => {
  it('Then runs once per run and cwd, even after a git write, and again in the next run', () => {
    const run = vi.fn(() => 'checked')

    withGitCache(() => {
      oncePerRun({ key: 'check', cwd: '/repo', run })
      clearGitCache()
      oncePerRun({ key: 'check', cwd: '/repo', run })
      oncePerRun({ key: 'check', cwd: '/other', run })
    })
    withGitCache(() => oncePerRun({ key: 'check', cwd: '/repo', run }))

    expect(run).toHaveBeenCalledTimes(3)
  })

  it('Then runs each time outside withGitCache', () => {
    const run = vi.fn()

    oncePerRun({ key: 'check', cwd: '/repo', run })
    oncePerRun({ key: 'check', cwd: '/repo', run })

    expect(run).toHaveBeenCalledTimes(2)
  })
})

describe('Given the git reads of a run', () => {
  describe('When they are read several times inside withGitCache', () => {
    it('Then each one runs git once', async () => {
      mockRun.mockResolvedValue('v1.1.0\nv1.0.0')
      mockRunSync.mockReturnValue('main')

      await withGitCache(async () => {
        for (let i = 0; i < 3; i++) {
          getCurrentGitBranch('/repo')
          await tagExists('v1.0.0', '/repo')
          await isAncestor('v1.0.0', 'HEAD', '/repo')
          await listTags({ cwd: '/repo' })
        }
      })

      expect(mockRunSync).toHaveBeenCalledTimes(1)
      expect(mockRun).toHaveBeenCalledTimes(3)
    })

    it('Then getFirstCommit runs git once', () => {
      mockRunSync.mockReturnValue('abc123')

      withGitCache(() => {
        expect(getFirstCommit('/repo')).toBe('abc123')
        expect(getFirstCommit('/repo')).toBe('abc123')
      })

      expect(mockRunSync).toHaveBeenCalledTimes(1)
    })
  })

  describe('When a caller changes what it got', () => {
    it('Then the next caller gets the commits and the tags read from git', async () => {
      mockRunSync.mockReturnValue('\x1Efeat: add\x1Fabc1234\x1FJane\x1Fjane@example.com')
      mockRun.mockResolvedValue('v1.0.0')

      await withGitCache(async () => {
        const commits = getGitDiff('v1.0.0', 'HEAD', '/repo')
        commits[0]!.author.name = 'Changed'
        commits.pop()

        const tags = await listTags({ cwd: '/repo' })
        tags.push('v2.0.0')

        expect(getGitDiff('v1.0.0', 'HEAD', '/repo')).toEqual([
          {
            message: 'feat: add',
            shortHash: 'abc1234',
            author: { name: 'Jane', email: 'jane@example.com' },
            body: '',
          },
        ])
        expect(await listTags({ cwd: '/repo' })).toEqual(['v1.0.0'])
      })

      expect(mockRunSync).toHaveBeenCalledTimes(1)
      expect(mockRun).toHaveBeenCalledTimes(1)
    })
  })

  describe('When relizy moves a tag', () => {
    it('Then the tags are read again', async () => {
      mockRun.mockResolvedValue('v1.0.0')

      await withGitCache(async () => {
        await listTags({ cwd: '/repo' })
        await retagAnnotatedLocal({
          tag: 'v1.0.0',
          commit: 'abc1234',
          message: 'v1.0.0',
          cwd: '/repo',
        })
        await listTags({ cwd: '/repo' })
      })

      const listCalls = mockRun.mock.calls.filter(([args]) => args[0] === 'tag' && args.includes('--sort=-creatordate'))
      expect(listCalls).toHaveLength(2)
    })
  })
})
