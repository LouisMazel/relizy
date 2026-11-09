import { runGit, runGitSync } from '../git-exec'
import {
  findReachableCommitBySubject,
  getCommitSubject,
  getGitDiff,
  isAncestor,
  NAME_STATUS_LINE,
  parseNameStatus,
  pushTagForce,
  retagAnnotatedLocal,
  stripNameStatus,
  tagExists,
} from '../git-refs'

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
  vi.resetAllMocks()
})

describe('Given isAncestor', () => {
  it('Then returns true when git merge-base exits 0', async () => {
    mockRun.mockResolvedValue('')
    const result = await isAncestor('v1.0.0', 'HEAD', '/repo')
    expect(result).toBe(true)
    expect(mockRun).toHaveBeenCalledWith([
      'merge-base',
      '--is-ancestor',
      'v1.0.0',
      'HEAD',
    ], { cwd: '/repo' })
  })

  it('Then returns false when the command rejects (not an ancestor)', async () => {
    mockRun.mockRejectedValue(new Error('exit 1'))
    expect(await isAncestor('v1.0.0', 'HEAD')).toBe(false)
  })
})

describe('Given getCommitSubject', () => {
  it('Then returns the subject', async () => {
    mockRun.mockResolvedValue('chore(release): bump version to 1.0.0')
    expect(await getCommitSubject('v1.0.0')).toBe('chore(release): bump version to 1.0.0')
  })

  it('Then returns null on empty output', async () => {
    mockRun.mockResolvedValue('')
    expect(await getCommitSubject('v1.0.0')).toBeNull()
  })

  it('Then returns null when the command rejects', async () => {
    mockRun.mockRejectedValue(new Error('bad ref'))
    expect(await getCommitSubject('nope')).toBeNull()
  })
})

describe('Given findReachableCommitBySubject', () => {
  it('Then returns the first matching commit SHA', async () => {
    mockRun.mockResolvedValue('abc123def')
    const sha = await findReachableCommitBySubject('bump version to 1.0.0', 'HEAD')
    expect(sha).toBe('abc123def')
    expect(mockRun).toHaveBeenCalledWith(
      [
        'log',
        'HEAD',
        '--grep=bump version to 1.0.0',
        '--fixed-strings',
        '--format=%H',
        '-n',
        '1',
      ],
      { cwd: undefined },
    )
  })

  it('Then passes a subject with quotes and substitutions as a single argument', async () => {
    mockRun.mockResolvedValue('abc123def')
    const subject = 'fix: "quoted" $(whoami) `id`'
    await findReachableCommitBySubject(subject, 'HEAD')
    expect(mockRun.mock.calls[0]![0]).toContain(`--grep=${subject}`)
  })

  it('Then returns null when no commit matches', async () => {
    mockRun.mockResolvedValue('')
    expect(await findReachableCommitBySubject('nothing', 'HEAD')).toBeNull()
  })

  it('Then returns null when the command rejects', async () => {
    mockRun.mockRejectedValue(new Error('fail'))
    expect(await findReachableCommitBySubject('x', 'HEAD')).toBeNull()
  })
})

describe('Given tagExists', () => {
  it('Then returns true when the tag resolves', async () => {
    mockRun.mockResolvedValue('sha')
    expect(await tagExists('v1.0.0')).toBe(true)
    expect(mockRun).toHaveBeenCalledWith([
      'rev-parse',
      '--verify',
      '--quiet',
      'refs/tags/v1.0.0',
    ], { cwd: undefined })
  })

  it('Then returns false when the tag does not exist', async () => {
    mockRun.mockRejectedValue(new Error('not found'))
    expect(await tagExists('missing')).toBe(false)
  })
})

describe('Given retagAnnotatedLocal', () => {
  it('Then force-creates an annotated tag at the given commit', async () => {
    mockRun.mockResolvedValue('')
    await retagAnnotatedLocal({
      tag: 'v1.0.0',
      commit: 'abc123',
      message: 'Bump to 1.0.0',
      cwd: '/repo',
    })
    expect(mockRun).toHaveBeenCalledWith([
      'tag',
      '-f',
      '-a',
      'v1.0.0',
      'abc123',
      '-m',
      'Bump to 1.0.0',
    ], { cwd: '/repo' })
  })

  it('Then adds the sign flag when signed is true', async () => {
    mockRun.mockResolvedValue('')
    await retagAnnotatedLocal({
      tag: 'v1.0.0',
      commit: 'abc123',
      message: 'm',
      signed: true,
    })
    expect(mockRun.mock.calls[0]![0]).toEqual([
      'tag',
      '-f',
      '-s',
      '-a',
      'v1.0.0',
      'abc123',
      '-m',
      'm',
    ])
  })
})

describe('Given pushTagForce', () => {
  it('Then force-pushes the tag to origin', async () => {
    mockRun.mockResolvedValue('')
    await pushTagForce('v1.0.0', '/repo')
    expect(mockRun).toHaveBeenCalledWith(['push', 'origin', 'v1.0.0', '--force'], { cwd: '/repo' })
  })
})

describe('Given getGitDiff', () => {
  it('Then reads the log with record and field separators', () => {
    mockRunSync.mockReturnValue('')

    getGitDiff('v1.0.0', 'HEAD', '/repo')

    expect(mockRunSync).toHaveBeenCalledWith(
      [
        '--no-pager',
        'log',
        'v1.0.0...HEAD',
        '--pretty=%x1E%s%x1F%h%x1F%an%x1F%ae%n%b',
        '--name-status',
      ],
      { cwd: '/repo' },
    )
  })

  it('Then reads the log with the default buffer of git-exec (1 GB), not a smaller one', () => {
    mockRunSync.mockReturnValue('')

    getGitDiff(undefined, 'HEAD', '/repo')

    expect(mockRunSync.mock.calls[0]![1]).not.toHaveProperty('maxBuffer')
  })

  it('Then logs the whole history when there is no from ref', () => {
    mockRunSync.mockReturnValue('')

    getGitDiff(undefined, 'HEAD', '/repo')

    expect(mockRunSync.mock.calls[0]![0].slice(0, 3)).toEqual(['--no-pager', 'log', 'HEAD'])
  })

  it('Then keeps the co-author trailers and changed files of a GitHub squash merge', () => {
    mockRunSync.mockReturnValue([
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
    mockRunSync.mockReturnValue('\x1Efeat: support a | b\x1Fabc1234\x1FAlice\x1Falice@example.com\n')

    const [commit] = getGitDiff('v1.0.0', 'HEAD', '/repo')

    expect(commit?.message).toBe('feat: support a | b')
    expect(commit?.shortHash).toBe('abc1234')
  })
})

describe('Given stripNameStatus', () => {
  it('Then removes the --name-status list git writes after the body', () => {
    expect(stripNameStatus('First line\n\nSecond paragraph\n\nM\tsrc/a.ts\nR100\told.ts\tnew.ts\nD\t"caf\\303\\251.ts"\n')).toBe('First line\n\nSecond paragraph\n')
  })

  it('Then keeps the lines of the text that look like status lines', () => {
    expect(stripNameStatus('A new option\nM is the default\nD\tin the text\n\nM\tsrc/a.ts')).toBe('A new option\nM is the default\nD\tin the text\n')
  })

  it('Then returns an empty text for a body made of files only, and the body as is without files', () => {
    expect(stripNameStatus('\nM\tsrc/a.ts\n').trim()).toBe('')
    expect(stripNameStatus('Only text')).toBe('Only text')
    expect(stripNameStatus('')).toBe('')
  })
})

describe('Given NAME_STATUS_LINE', () => {
  it('Then only matches a status letter, an optional score and a tab', () => {
    expect(['M\tsrc/a.ts', 'R100\ta\tb', 'C075\ta\tb'].every(line => NAME_STATUS_LINE.test(line))).toBe(true)
    expect([
      'A new option',
      'M src/a.ts',
      'Mention\tx',
      '',
    ].some(line => NAME_STATUS_LINE.test(line))).toBe(false)
  })
})

describe('Given parseNameStatus', () => {
  it('Then returns the status and the paths of each file line', () => {
    expect(parseNameStatus('Fix the parser\n\nM\tsrc/a.ts\nR100\tpackages/a/package.json\tpackages/b/package.json\n')).toEqual([
      {
        status: 'M',
        paths: ['src/a.ts'],
      },
      {
        status: 'R100',
        paths: ['packages/a/package.json', 'packages/b/package.json'],
      },
    ])
  })

  it('Then drops the quotes git adds around paths with unusual characters', () => {
    expect(parseNameStatus('\n\nR100\t"packages/a b/package.json"\t"packages/c d/package.json"\n')).toEqual([
      {
        status: 'R100',
        paths: ['packages/a b/package.json', 'packages/c d/package.json'],
      },
    ])
  })

  it('Then ignores the lines of prose', () => {
    expect(parseNameStatus('A new option\n\nBREAKING CHANGE: removed')).toEqual([])
  })
})
