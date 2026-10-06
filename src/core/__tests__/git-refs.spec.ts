import { execSync } from 'node:child_process'
import { execPromise } from '@maz-ui/node'
import {
  findReachableCommitBySubject,
  getCommitSubject,
  getGitDiff,
  isAncestor,
  pushTagForce,
  retagAnnotatedLocal,
  tagExists,
} from '../git-refs'

vi.mock('@maz-ui/node', async (importActual) => {
  const actual = await importActual<typeof import('@maz-ui/node')>()
  return {
    ...actual,
    execPromise: vi.fn(),
  }
})

vi.mock('node:child_process', async (importActual) => {
  const actual = await importActual<typeof import('node:child_process')>()
  return {
    ...actual,
    execSync: vi.fn(),
  }
})

const mockExec = vi.mocked(execPromise)
const mockExecSync = vi.mocked(execSync)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Given isAncestor', () => {
  it('Then returns true when git merge-base exits 0', async () => {
    mockExec.mockResolvedValue({ stdout: '', stderr: '' } as any)
    const result = await isAncestor('v1.0.0', 'HEAD', '/repo')
    expect(result).toBe(true)
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('git merge-base --is-ancestor'),
      expect.objectContaining({ cwd: '/repo', noError: true }),
    )
  })

  it('Then returns false when the command rejects (not an ancestor)', async () => {
    mockExec.mockRejectedValue(new Error('exit 1'))
    expect(await isAncestor('v1.0.0', 'HEAD')).toBe(false)
  })
})

describe('Given getCommitSubject', () => {
  it('Then returns the trimmed subject', async () => {
    mockExec.mockResolvedValue({ stdout: 'chore(release): bump version to 1.0.0\n', stderr: '' } as any)
    expect(await getCommitSubject('v1.0.0')).toBe('chore(release): bump version to 1.0.0')
  })

  it('Then returns null on empty output', async () => {
    mockExec.mockResolvedValue({ stdout: '\n', stderr: '' } as any)
    expect(await getCommitSubject('v1.0.0')).toBeNull()
  })

  it('Then returns null when the command rejects', async () => {
    mockExec.mockRejectedValue(new Error('bad ref'))
    expect(await getCommitSubject('nope')).toBeNull()
  })
})

describe('Given findReachableCommitBySubject', () => {
  it('Then returns the first matching commit SHA', async () => {
    mockExec.mockResolvedValue({ stdout: 'abc123def\n', stderr: '' } as any)
    const sha = await findReachableCommitBySubject('bump version to 1.0.0', 'HEAD')
    expect(sha).toBe('abc123def')
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('--fixed-strings'),
      expect.objectContaining({ noError: true }),
    )
  })

  it('Then returns null when no commit matches', async () => {
    mockExec.mockResolvedValue({ stdout: '', stderr: '' } as any)
    expect(await findReachableCommitBySubject('nothing', 'HEAD')).toBeNull()
  })

  it('Then returns null when the command rejects', async () => {
    mockExec.mockRejectedValue(new Error('fail'))
    expect(await findReachableCommitBySubject('x', 'HEAD')).toBeNull()
  })
})

describe('Given tagExists', () => {
  it('Then returns true when the tag resolves', async () => {
    mockExec.mockResolvedValue({ stdout: 'sha', stderr: '' } as any)
    expect(await tagExists('v1.0.0')).toBe(true)
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('refs/tags/v1.0.0'),
      expect.anything(),
    )
  })

  it('Then returns false when the tag does not exist', async () => {
    mockExec.mockRejectedValue(new Error('not found'))
    expect(await tagExists('missing')).toBe(false)
  })
})

describe('Given retagAnnotatedLocal', () => {
  it('Then force-creates an annotated tag at the given commit', async () => {
    mockExec.mockResolvedValue({ stdout: '', stderr: '' } as any)
    await retagAnnotatedLocal({ tag: 'v1.0.0', commit: 'abc123', message: 'Bump to 1.0.0', cwd: '/repo' })
    const cmd = mockExec.mock.calls[0]![0] as string
    expect(cmd).toContain('git tag -f -a')
    expect(cmd).toContain('v1.0.0')
    expect(cmd).toContain('abc123')
    expect(cmd).not.toContain('-s -a')
  })

  it('Then adds the sign flag when signed is true', async () => {
    mockExec.mockResolvedValue({ stdout: '', stderr: '' } as any)
    await retagAnnotatedLocal({ tag: 'v1.0.0', commit: 'abc123', message: 'm', signed: true })
    expect(mockExec.mock.calls[0]![0]).toContain('git tag -f -s -a')
  })
})

describe('Given pushTagForce', () => {
  it('Then force-pushes the tag to origin', async () => {
    mockExec.mockResolvedValue({ stdout: '', stderr: '' } as any)
    await pushTagForce('v1.0.0', '/repo')
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('git push origin'),
      expect.objectContaining({ cwd: '/repo' }),
    )
    expect(mockExec.mock.calls[0]![0]).toContain('--force')
  })
})

describe('Given getGitDiff', () => {
  it('Then reads the log with record and field separators', () => {
    mockExecSync.mockReturnValue('')

    getGitDiff('v1.0.0', 'HEAD', '/repo')

    expect(mockExecSync).toHaveBeenCalledWith(
      'git --no-pager log "v1.0.0...HEAD" --pretty="%x1E%s%x1F%h%x1F%an%x1F%ae%n%b" --name-status',
      { cwd: '/repo', encoding: 'utf8' },
    )
  })

  it('Then logs the whole history when there is no from ref', () => {
    mockExecSync.mockReturnValue('')

    getGitDiff(undefined, 'HEAD', '/repo')

    expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('log "HEAD"'), expect.anything())
  })

  it('Then keeps the co-author trailers and changed files of a GitHub squash merge', () => {
    mockExecSync.mockReturnValue([
      '\x1Efeat: support multiple registries (#113)\x1Ff5bbc52\x1FMazel\x1Fme@example.com',
      '* feat: support multiple registries (#112)',
      '',
      '---------',
      '',
      'Co-authored-by: Raphaël <lestote@users.noreply.github.com>',
      '',
      'M\tsrc/core/npm.ts',
      '\x1Efix: second commit\x1Fabc1234\x1FAlice\x1Falice@example.com',
      '',
      'M\tpackages/pkg-a/index.ts',
    ].join('\n'))

    const commits = getGitDiff('v1.0.0', 'HEAD', '/repo')

    expect(commits).toHaveLength(2)
    expect(commits[0]).toEqual({
      message: 'feat: support multiple registries (#113)',
      shortHash: 'f5bbc52',
      author: { name: 'Mazel', email: 'me@example.com' },
      body: '* feat: support multiple registries (#112)\n\n---------\n\nCo-authored-by: Raphaël <lestote@users.noreply.github.com>\n\nM\tsrc/core/npm.ts\n',
    })
    expect(commits[1]?.shortHash).toBe('abc1234')
    expect(commits[1]?.body).toContain('M\tpackages/pkg-a/index.ts')
  })

  it('Then keeps a subject containing a pipe', () => {
    mockExecSync.mockReturnValue('\x1Efeat: support a | b\x1Fabc1234\x1FAlice\x1Falice@example.com\n')

    const [commit] = getGitDiff('v1.0.0', 'HEAD', '/repo')

    expect(commit?.message).toBe('feat: support a | b')
    expect(commit?.shortHash).toBe('abc1234')
  })
})
