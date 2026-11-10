import { runGit, runGitSync, tryGit, tryGitSync } from '../git-exec'
import { detectGitProvider, getCurrentGitBranch, getCurrentGitRef, getFirstCommit, getGitStatus, getGitUpstream, getShortCommitSha } from '../git-refs'

vi.mock('../git-exec', async (importActual) => {
  const actual = await importActual<typeof import('../git-exec')>()
  return {
    ...actual,
    runGitSync: vi.fn(),
    runGit: vi.fn(),
    tryGitSync: vi.fn(),
    tryGit: vi.fn(),
  }
})

beforeEach(() => {
  vi.mocked(runGitSync).mockReset()
  vi.mocked(runGitSync).mockReturnValue('')
  vi.mocked(runGit).mockReset()
  vi.mocked(runGit).mockResolvedValue('')
  vi.mocked(tryGitSync).mockImplementation((args, options) => {
    try {
      return vi.mocked(runGitSync)(args, options)
    }
    catch {
      return undefined
    }
  })
  vi.mocked(tryGit).mockImplementation(async (args, options) => {
    try {
      return await vi.mocked(runGit)(args, options)
    }
    catch {
      return undefined
    }
  })
})

describe('Given getGitStatus function', () => {
  describe('When git status is clean', () => {
    it('Then returns empty string', () => {
      vi.mocked(runGitSync).mockReturnValue('')

      const result = getGitStatus()

      expect(result).toBe('')
      expect(runGitSync).toHaveBeenCalledWith(['status', '--porcelain'], { cwd: undefined, trim: true })
    })

    it('Then uses provided cwd', () => {
      vi.mocked(runGitSync).mockReturnValue('')

      getGitStatus('/custom/path')

      expect(runGitSync).toHaveBeenCalledWith(['status', '--porcelain'], { cwd: '/custom/path', trim: true })
    })
  })

  describe('When git status has changes', () => {
    it('Then returns the status output, untrimmed when asked', () => {
      vi.mocked(runGitSync).mockReturnValue(' M package.json\n?? new-file.ts\n')

      const result = getGitStatus('/repo', false)

      expect(result).toBe(' M package.json\n?? new-file.ts\n')
      expect(runGitSync).toHaveBeenCalledWith(['status', '--porcelain'], { cwd: '/repo', trim: false })
    })

    it('Then returns multiple lines of changes', () => {
      vi.mocked(runGitSync).mockReturnValue('M src/core/git.ts\nA src/core/new.ts\nD old-file.ts')

      const result = getGitStatus()

      expect(result).toBe('M src/core/git.ts\nA src/core/new.ts\nD old-file.ts')
    })
  })
})

describe('Given detectGitProvider function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When remote URL is GitHub', () => {
    it('Then returns github for github.com HTTPS URL', () => {
      vi.mocked(runGitSync).mockReturnValue('https://github.com/user/repo.git')

      const result = detectGitProvider()

      expect(result).toBe('github')
    })

    it('Then returns github for github.com SSH URL', () => {
      vi.mocked(runGitSync).mockReturnValue('git@github.com:user/repo.git')

      const result = detectGitProvider()

      expect(result).toBe('github')
    })

    it('Then uses provided cwd', () => {
      vi.mocked(runGitSync).mockReturnValue('https://github.com/user/repo.git')

      detectGitProvider('/custom/path')

      expect(runGitSync).toHaveBeenCalledWith(['remote', 'get-url', 'origin'], { cwd: '/custom/path' })
    })
  })

  describe('When remote URL is GitLab', () => {
    it.each([
      ['gitlab.com URL', 'https://gitlab.com/group/project.git'],
      ['custom gitlab domain', 'https://gitlab.company.com/team/repo.git'],
      ['SSH URL', 'git@gitlab.com:group/project.git'],
    ])('Then returns gitlab for %s', (_label, url) => {
      vi.mocked(runGitSync).mockReturnValue(url)

      const result = detectGitProvider()

      expect(result).toBe('gitlab')
    })
  })

  describe('When remote URL is Bitbucket', () => {
    it.each([
      ['bitbucket.org URL', 'https://bitbucket.org/workspace/repo.git'],
      ['custom bitbucket domain', 'https://bitbucket.company.com/team/repo.git'],
      ['SSH URL', 'git@bitbucket.org:workspace/repo.git'],
    ])('Then returns bitbucket for %s', (_label, url) => {
      vi.mocked(runGitSync).mockReturnValue(url)

      const result = detectGitProvider()

      expect(result).toBe('bitbucket')
    })
  })

  describe('When remote URL is unknown provider', () => {
    it('Then returns null for unrecognized URL', () => {
      vi.mocked(runGitSync).mockReturnValue('https://example.com/user/repo.git')

      const result = detectGitProvider()

      expect(result).toBeNull()
    })
  })

  describe('When git command fails', () => {
    it('Then returns null and catches error', () => {
      vi.mocked(runGitSync).mockImplementation(() => {
        throw new Error('Not a git repository')
      })

      const result = detectGitProvider()

      expect(result).toBeNull()
    })

    it('Then handles missing remote', () => {
      vi.mocked(runGitSync).mockImplementation(() => {
        throw new Error('No such remote')
      })

      const result = detectGitProvider()

      expect(result).toBeNull()
    })
  })

  describe('When using default cwd', () => {
    it('Then defaults to process.cwd()', () => {
      vi.mocked(runGitSync).mockReturnValue('https://github.com/user/repo.git')

      detectGitProvider()

      expect(runGitSync).toHaveBeenCalledWith(['remote', 'get-url', 'origin'], {
        cwd: process.cwd(),
      })
    })
  })
})

describe('Given getGitUpstream function', () => {
  it('Then passes a branch with quotes and $() to git as a single argument', async () => {
    const branch = 'feat/$(id)"x\'`y`'
    vi.mocked(runGitSync).mockReturnValue(branch)
    vi.mocked(runGit).mockImplementation(args => Promise.resolve(args[0] === 'config'
      ? 'origin'
      : 'refs/remotes/origin/main'))

    const upstream = await getGitUpstream('/project')

    expect(upstream).toMatchObject({ remote: 'origin', name: 'origin/main' })
    expect(vi.mocked(runGit).mock.calls.map(([args]) => args)).toContainEqual(['config', '--get', `branch.${branch}.remote`])
  })
})

describe('Given getFirstCommit function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When repository has commits', () => {
    it('Then returns first commit hash', () => {
      vi.mocked(runGitSync).mockReturnValue('abc123def456')

      const result = getFirstCommit('/project')

      expect(result).toBe('abc123def456')
      expect(runGitSync).toHaveBeenCalledWith(['rev-list', '--max-parents=0', 'HEAD'], { cwd: '/project' })
    })
  })

  describe('When repository has multiple root commits', () => {
    it('Then returns first root commit', () => {
      vi.mocked(runGitSync).mockReturnValue('first123\nsecond456')

      const result = getFirstCommit('/project')

      expect(result).toBe('first123\nsecond456')
    })
  })
})

describe('Given getCurrentGitBranch function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When on a named branch', () => {
    it('Then returns branch name', () => {
      vi.mocked(runGitSync).mockReturnValue('main')

      const result = getCurrentGitBranch('/project')

      expect(result).toBe('main')
      expect(runGitSync).toHaveBeenCalledWith(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: '/project' })
    })

    it('Then handles branch with slashes', () => {
      vi.mocked(runGitSync).mockReturnValue('bugfix/issue-123')

      const result = getCurrentGitBranch('/project')

      expect(result).toBe('bugfix/issue-123')
    })
  })

  describe('When in detached HEAD state', () => {
    it('Then returns HEAD', () => {
      vi.mocked(runGitSync).mockReturnValue('HEAD')

      const result = getCurrentGitBranch('/project')

      expect(result).toBe('HEAD')
    })
  })
})

describe('Given getCurrentGitRef function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When on a branch', () => {
    it('Then returns branch name from getCurrentGitBranch', () => {
      vi.mocked(runGitSync).mockReturnValue('develop')

      const result = getCurrentGitRef('/project')

      expect(result).toBe('develop')
    })

    it('Then handles feature branches', () => {
      vi.mocked(runGitSync).mockReturnValue('feature/login')

      const result = getCurrentGitRef('/project')

      expect(result).toBe('feature/login')
    })
  })

  describe('When in detached HEAD state', () => {
    it('Then returns HEAD as fallback', () => {
      vi.mocked(runGitSync).mockReturnValue('')

      const result = getCurrentGitRef('/project')

      expect(result).toBe('HEAD')
    })
  })
})

describe('Given getShortCommitSha function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When getting short SHA with default length', () => {
    it('Then returns 7-character SHA', () => {
      vi.mocked(runGitSync).mockReturnValue('a3f4b2c')

      const result = getShortCommitSha('/project')

      expect(result).toBe('a3f4b2c')
      expect(runGitSync).toHaveBeenCalledWith(['rev-parse', '--short=7', 'HEAD'], { cwd: '/project' })
    })
  })

  describe('When getting short SHA with custom length', () => {
    it('Then uses specified length', () => {
      vi.mocked(runGitSync).mockReturnValue('a3f4b')

      const result = getShortCommitSha('/project', 5)

      expect(result).toBe('a3f4b')
      expect(runGitSync).toHaveBeenCalledWith(['rev-parse', '--short=5', 'HEAD'], { cwd: '/project' })
    })
  })
})
