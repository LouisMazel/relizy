import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkGitStatusIfDirty, createGitCommit, createGitTags, fetchGitTags, parseGitStatus, pushGitChanges } from '../git'
import { runGit, runGitSync, tryGit, tryGitSync } from '../git-exec'

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

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  fail: vi.fn(),
  error: vi.fn(),
}

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
  for (const log of Object.values(logger)) {
    log.mockReset()
  }
})

describe('Given parseGitStatus function', () => {
  it('Then names the path and the change of each line of the porcelain status', () => {
    expect(parseGitStatus(' M package.json\n?? "new file.ts"\nR  old.ts -> new.ts\nUU conflict.ts\n D gone.ts\nAD both.ts\n!! odd.ts\n')).toEqual([
      { path: 'package.json', change: 'modified' },
      { path: 'new file.ts', change: 'new' },
      { path: 'new.ts', change: 'renamed' },
      { path: 'conflict.ts', change: 'conflict' },
      { path: 'gone.ts', change: 'deleted' },
      { path: 'both.ts', change: 'added' },
      { path: 'odd.ts', change: 'changed' },
    ])
  })

  it('Then returns nothing for a clean working directory', () => {
    expect(parseGitStatus('')).toEqual([])
    expect(parseGitStatus('\n  \n')).toEqual([])
  })
})

describe('Given checkGitStatusIfDirty function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When git status is clean', () => {
    it('Then does not throw error', () => {
      vi.mocked(runGitSync).mockReturnValue('')

      expect(() => checkGitStatusIfDirty({ cwd: '/repo', logger })).not.toThrow()
    })

    it('Then reads the status of the project directory', () => {
      vi.mocked(runGitSync).mockReturnValue('')

      checkGitStatusIfDirty({ cwd: '/repo', logger })

      expect(runGitSync).toHaveBeenCalledWith(['status', '--porcelain'], expect.objectContaining({ cwd: '/repo' }))
    })

    it('Then logs debug message', () => {
      vi.mocked(runGitSync).mockReturnValue('  ')
      checkGitStatusIfDirty({ cwd: '/repo', logger })

      expect(logger.debug).toHaveBeenCalledWith('Checking git status')
    })
  })

  describe('When git status is dirty', () => {
    it('Then throws error with dirty status message', () => {
      vi.mocked(runGitSync).mockReturnValue(' M package.json\n?? src/new.ts\n')

      expect(() => checkGitStatusIfDirty({ cwd: '/repo', logger })).toThrow('Uncommitted changes: package.json (modified), src/new.ts (new)\nCommit or stash them first, or keep them with --no-clean.')
    })

    it('Then names each change of the porcelain status', () => {
      vi.mocked(runGitSync).mockReturnValue('M  file1.ts\nA  file2.ts\nR  old.ts -> new.ts\n D "with space.ts"\nUU conflict.ts\n')

      expect(() => checkGitStatusIfDirty({ cwd: '/repo', logger })).toThrow('Uncommitted changes: file1.ts (modified), file2.ts (added), new.ts (renamed), and 2 more')
      expect(logger.debug).toHaveBeenCalledWith('Uncommitted changes: file1.ts (modified), file2.ts (added), new.ts (renamed), with space.ts (deleted), conflict.ts (conflict)')
    })
  })
})

describe('Given fetchGitTags function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When fetching tags succeeds', () => {
    it('Then executes git fetch command', async () => {
      vi.mocked(runGit).mockResolvedValue('')

      await fetchGitTags()

      expect(runGit).toHaveBeenCalledWith(['fetch', '--tags'], { cwd: undefined })
    })

    it('Then uses provided cwd', async () => {
      vi.mocked(runGit).mockResolvedValue('')

      await fetchGitTags({ cwd: '/project/path' })

      expect(runGit).toHaveBeenCalledWith(['fetch', '--tags'], { cwd: '/project/path' })
    })

    it('Then logs debug messages', async () => {
      vi.mocked(runGit).mockResolvedValue('')

      await fetchGitTags({ logger })

      expect(logger.debug).toHaveBeenCalledWith('Fetching git tags from remote')
      expect(logger.debug).toHaveBeenCalledWith('Git tags fetched successfully')
    })
  })

  describe('When fetching tags fails', () => {
    it('Then catches error and logs failure', async () => {
      const error = new Error('Network error')
      vi.mocked(runGit).mockRejectedValue(error)
      await fetchGitTags({ logger })

      expect(logger.fail).toHaveBeenCalledWith(
        'Failed to fetch some git tags from remote (tags might already exist locally)',
        error,
      )
      expect(logger.info).toHaveBeenCalledWith('Continuing with local tags')
    })

    it('Then does not throw error on failure', async () => {
      vi.mocked(runGit).mockRejectedValue(new Error('Failed'))

      await expect(fetchGitTags()).resolves.toBeUndefined()
    })
  })
})

describe('Given createGitCommit function', () => {
  it('Then commits with the message and the body as two paragraphs, and logs it', async () => {
    await createGitCommit({
      message: 'chore(release): v1.0.0',
      body: 'The packages',
      cwd: '/project',
      logger,
    })

    expect(runGit).toHaveBeenCalledWith([
      'commit',
      '-m',
      'chore(release): v1.0.0',
      '-m',
      'The packages',
    ], { cwd: '/project' })
    expect(logger.debug).toHaveBeenCalledWith('No verify: false')
    expect(logger.debug).toHaveBeenCalledWith('Executing: git commit -m "chore(release): v1.0.0" -m "The packages"')
    expect(logger.success).toHaveBeenCalledWith('Committed: chore(release): v1.0.0')
  })

  it('Then skips the git hooks with noVerify', async () => {
    await createGitCommit({ message: 'chore: release', noVerify: true, logger })

    expect(runGit).toHaveBeenCalledWith([
      'commit',
      '--no-verify',
      '-m',
      'chore: release',
    ], { cwd: undefined })
    expect(logger.success).toHaveBeenCalledWith('Committed: chore: release (--no-verify)')
  })

  it('Then only logs the command in dry-run', async () => {
    await createGitCommit({ message: 'chore: release', dryRun: true, logger })

    expect(runGit).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith('[dry-run] git commit -m "chore: release"')
    expect(logger.success).not.toHaveBeenCalled()
  })

  it('Then rejects when git fails', async () => {
    vi.mocked(runGit).mockRejectedValue(new Error('nothing to commit'))

    await expect(createGitCommit({ message: 'chore: release' })).rejects.toThrow('nothing to commit')
  })

  it('Then is silent without logger', async () => {
    await expect(createGitCommit({ message: 'chore: release', noVerify: true })).resolves.toBeUndefined()
  })
})

describe('Given createGitTags function', () => {
  it('Then creates an annotated tag per tag, with its message or its name, and returns the names', async () => {
    const created = await createGitTags({
      tags: [
        { name: 'v1.0.0', message: 'Release 1.0.0' },
        { name: 'pkg@1.0.0' },
      ],
      cwd: '/project',
      logger,
    })

    expect(created).toEqual(['v1.0.0', 'pkg@1.0.0'])
    expect(runGit).toHaveBeenNthCalledWith(1, [
      'tag',
      '-a',
      'v1.0.0',
      '-m',
      'Release 1.0.0',
    ], { cwd: '/project' })
    expect(runGit).toHaveBeenNthCalledWith(2, [
      'tag',
      '-a',
      'pkg@1.0.0',
      '-m',
      'pkg@1.0.0',
    ], { cwd: '/project' })
    expect(logger.success).toHaveBeenCalledWith('Created 2 tags, v1.0.0, pkg@1.0.0')
    expect(logger.debug).toHaveBeenCalledWith('Created Tags:', 'v1.0.0, pkg@1.0.0')
  })

  it('Then signs the tags with sign', async () => {
    await createGitTags({
      tags: [
        { name: 'v1.0.0' },
      ],
      sign: true,
    })

    expect(runGit).toHaveBeenCalledWith([
      'tag',
      '-s',
      '-a',
      'v1.0.0',
      '-m',
      'v1.0.0',
    ], { cwd: undefined })
  })

  it('Then only logs the commands in dry-run, and returns the names', async () => {
    const created = await createGitTags({
      tags: [
        { name: 'v1.0.0' },
      ],
      dryRun: true,
      logger,
    })

    expect(created).toEqual(['v1.0.0'])
    expect(runGit).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith('[dry-run] git tag -a v1.0.0 -m v1.0.0')
  })

  it('Then logs the failure and throws on the first tag that cannot be created', async () => {
    const error = new Error('tag already exists')
    vi.mocked(runGit).mockRejectedValue(error)

    await expect(createGitTags({
      tags: [
        { name: 'v1.0.0' },
        { name: 'v1.0.1' },
      ],
      logger,
    })).rejects.toBe(error)

    expect(logger.error).toHaveBeenCalledWith('Failed to create tag v1.0.0:', error)
    expect(runGit).toHaveBeenCalledTimes(1)
  })

  it('Then is silent without logger and creates nothing without tag', async () => {
    await expect(createGitTags({ tags: [] })).resolves.toEqual([])
    await expect(createGitTags({
      tags: [
        { name: 'v1.0.0' },
      ],
    })).resolves.toEqual(['v1.0.0'])
  })
})

describe('Given pushGitChanges function', () => {
  it('Then pushes with the tags the commits reach when asked to follow them', async () => {
    await pushGitChanges({ cwd: '/project', followTags: true, logger })

    expect(runGit).toHaveBeenCalledWith(['push', '--follow-tags'], { cwd: '/project' })
    expect(logger.debug).toHaveBeenCalledWith('Executing: git push --follow-tags')
  })

  it('Then pushes the commits only otherwise', async () => {
    await pushGitChanges({ cwd: '/project' })

    expect(runGit).toHaveBeenCalledWith(['push'], { cwd: '/project' })
  })

  it('Then runs beforePush first, and not in dry-run', async () => {
    const order: string[] = []
    const beforePush = vi.fn(() => {
      order.push('before')
    })
    vi.mocked(runGit).mockImplementation(() => {
      order.push('push')
      return Promise.resolve('')
    })

    await pushGitChanges({ cwd: '/project', beforePush })
    await pushGitChanges({
      cwd: '/project',
      beforePush,
      dryRun: true,
      logger,
    })

    expect(order).toEqual(['before', 'push'])
    expect(beforePush).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith('[dry-run] git push')
  })

  it('Then does not push when beforePush rejects', async () => {
    await expect(pushGitChanges({
      cwd: '/project',
      beforePush: () => Promise.reject(new Error('no access')),
    })).rejects.toThrow('no access')

    expect(runGit).not.toHaveBeenCalled()
  })

  it('Then logs and rethrows a push failing for another reason', async () => {
    const error = new Error('remote hung up')
    vi.mocked(runGit).mockRejectedValue(error)

    await expect(pushGitChanges({ cwd: '/project', logger })).rejects.toBe(error)

    expect(logger.error).toHaveBeenCalledWith('git push failed', error)
  })
})
