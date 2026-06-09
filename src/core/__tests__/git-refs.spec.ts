import { execPromise } from '@maz-ui/node'
import {
  findReachableCommitBySubject,
  getCommitSubject,
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

const mockExec = vi.mocked(execPromise)

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
