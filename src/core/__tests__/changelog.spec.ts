import type { ResolvedRelizyConfig } from '../config'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockCommit, createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import { getFirstCommit, getIndependentTag } from '../../core'
import { generateChangelog, writeChangelogToFile } from '../changelog'
import { generateMarkDown } from '../markdown'
import { executeHook } from '../utils'

logger.setLevel('silent')

vi.mock('node:fs')
vi.mock('node:path', async () => {
  const actual = await vi.importActual('node:path')
  return {
    ...actual,
    join: vi.fn((...args) => args.join('/')),
    relative: vi.fn((from, to) => to),
  }
})
vi.mock('@maz-ui/node', async () => {
  const actual = await vi.importActual('@maz-ui/node')
  return {
    ...actual,
  }
})
vi.mock('../markdown')
vi.mock('../utils', async () => {
  const actual = await vi.importActual('../utils')
  return {
    ...actual,
    executeHook: vi.fn(),
  }
})
vi.mock('../git', () => {
  return {
    getFirstCommit: vi.fn(),
  }
})
vi.mock('../tags', () => {
  return {
    getIndependentTag: vi.fn(),
  }
})

describe('Given generateChangelog function', () => {
  let config: ResolvedRelizyConfig

  beforeEach(() => {
    vi.clearAllMocks()
    config = createMockConfig({ bump: { type: 'patch' } })
    config.templates = {
      commitMessage: 'chore(release): {{newVersion}}',
      tagBody: 'v{{newVersion}}',
      tagMessage: 'Release {{newVersion}}',
      emptyChangelogContent: 'No significant changes',
      twitterMessage: '',
      slackMessage: undefined,
    }
    vi.mocked(getFirstCommit).mockReturnValue('abc123')
    vi.mocked(generateMarkDown).mockResolvedValue('## v1.0.0...v1.1.0\n\n- Feature added')
    vi.mocked(executeHook).mockResolvedValue(undefined)
  })

  describe('When generating changelog for regular commit', () => {
    it('Then generates markdown changelog', async () => {
      const pkg = {
        name: 'test-package',
        commits: [createMockCommit('feat', 'add feature')],
      }

      await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.1.0',
      })

      expect(generateMarkDown).toHaveBeenCalledWith(
        expect.objectContaining({
          commits: pkg.commits,
          config: expect.any(Object),
        }),
      )
    })

    it('Then uses from config when available', async () => {
      config.from = 'v1.0.0'
      const pkg = {
        name: 'test-package',
        commits: [createMockCommit('feat', 'feature')],
      }

      await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.1.0',
      })

      expect(generateMarkDown).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'v1.0.0',
        }),
      )
    })

    it('Then uses pkg fromTag when config.from not available', async () => {
      const pkg = {
        name: 'test-package',
        fromTag: 'v0.9.0',
        commits: [createMockCommit('feat', 'feature')],
      }

      await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.0.0',
      })

      expect(generateMarkDown).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'v0.9.0',
        }),
      )
    })

    it('Then falls back to first commit when no fromTag', async () => {
      vi.mocked(getFirstCommit).mockReturnValue('initial123')
      const pkg = {
        name: 'test-package',
        commits: [createMockCommit('feat', 'feature')],
      }

      await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.0.0',
      })

      expect(getFirstCommit).toHaveBeenCalledWith(config.cwd)
    })

    it('Then generates toTag from template', async () => {
      const pkg = {
        name: 'test-package',
        commits: [createMockCommit('feat', 'feature')],
      }

      await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '2.0.0',
      })

      expect(generateMarkDown).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'v2.0.0',
        }),
      )
    })

    it('Then uses config.to when provided', async () => {
      config.to = 'v3.0.0'
      const pkg = {
        name: 'test-package',
        commits: [createMockCommit('feat', 'feature')],
      }

      await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '3.0.0',
      })

      expect(generateMarkDown).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'v3.0.0',
        }),
      )
    })
  })

  describe('When generating for independent mode', () => {
    it('Then uses independent tag for toTag', async () => {
      config.monorepo = { versionMode: 'independent', packages: ['packages/*'] }
      vi.mocked(getIndependentTag).mockReturnValue('pkg-a@1.1.0')
      const pkg = {
        name: 'pkg-a',
        commits: [createMockCommit('feat', 'feature')],
      }

      await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.1.0',
      })

      expect(getIndependentTag).toHaveBeenCalledWith({
        version: '1.1.0',
        name: 'pkg-a',
      })
    })

    it('Then uses independent tag for first commit', async () => {
      config.monorepo = { versionMode: 'independent', packages: ['packages/*'] }
      vi.mocked(getFirstCommit).mockReturnValue('initial')
      vi.mocked(getIndependentTag).mockReturnValue('pkg-a@0.0.0')
      const pkg = {
        name: 'pkg-a',
        commits: [createMockCommit('feat', 'initial')],
      }

      await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.0.0',
      })

      expect(getIndependentTag).toHaveBeenCalledWith({
        version: '0.0.0',
        name: 'pkg-a',
      })
    })
  })

  describe('When changelog has no commits', () => {
    it('Then appends empty changelog content', async () => {
      const pkg = {
        name: 'test-package',
        commits: [],
      }

      const result = await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.0.1',
      })

      expect(result).toContain('No significant changes')
    })

    it('Then still generates markdown structure', async () => {
      const pkg = {
        name: 'test-package',
        commits: [],
      }

      await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.0.1',
      })

      expect(generateMarkDown).toHaveBeenCalled()
    })
  })

  describe('When executing hooks', () => {
    it('Then executes generate:changelog hook', async () => {
      const pkg = {
        name: 'test-package',
        commits: [createMockCommit('feat', 'feature')],
      }

      await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.1.0',
      })

      expect(executeHook).toHaveBeenCalledWith(
        'generate:changelog',
        expect.any(Object),
        false,
        expect.objectContaining({
          commits: pkg.commits,
          changelog: expect.any(String),
        }),
      )
    })

    it('Then uses hook result when provided', async () => {
      vi.mocked(executeHook).mockResolvedValue('Custom changelog from hook')
      const pkg = {
        name: 'test-package',
        commits: [createMockCommit('feat', 'feature')],
      }

      const result = await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.1.0',
      })

      expect(result).toBe('Custom changelog from hook')
    })

    it('Then passes dryRun to hook', async () => {
      const pkg = {
        name: 'test-package',
        commits: [createMockCommit('feat', 'feature')],
      }

      await generateChangelog({
        pkg,
        config,
        dryRun: true,
        newVersion: '1.1.0',
      })

      expect(executeHook).toHaveBeenCalledWith(
        'generate:changelog',
        expect.any(Object),
        true,
        expect.any(Object),
      )
    })
  })

  describe('When in dry-run mode', () => {
    it('Then logs dry-run message', async () => {
      const loggerSpy = vi.spyOn(logger, 'info')
      const pkg = {
        name: 'test-package',
        commits: [createMockCommit('feat', 'feature')],
      }

      await generateChangelog({
        pkg,
        config,
        dryRun: true,
        newVersion: '1.1.0',
      })

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[dry-run]'),
      )
    })
  })

  describe('When error occurs', () => {
    it('Then throws error with package name and tags', async () => {
      vi.mocked(generateMarkDown).mockRejectedValue(new Error('Markdown error'))
      const pkg = {
        name: 'test-package',
        commits: [createMockCommit('feat', 'feature')],
      }

      await expect(generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.1.0',
      })).rejects.toThrow('Error generating changelog for test-package')
    })
  })

  describe('When toTag cannot be determined', () => {
    it('Then throws error', async () => {
      config.to = undefined
      config.templates.tagBody = ''
      const pkg = {
        name: 'test-package',
        commits: [createMockCommit('feat', 'feature')],
      }

      await expect(generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.1.0',
      })).rejects.toThrow('No tag found for test-package')
    })
  })
})

describe('Given writeChangelogToFile function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(join).mockImplementation((...args) => args.join('/'))
    vi.mocked(relative).mockImplementation((from, to) => to.replace(`${from}/`, ''))
  })

  describe('When writing to new changelog file', () => {
    it('Then creates file with title and content', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      const pkg = createMockPackageInfo()
      const changelog = '## v1.0.0\n\n- Feature added'

      writeChangelogToFile({
        cwd: '/project',
        pkg,
        changelog,
        dryRun: false,
      })

      expect(writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('# Changelog'),
        'utf8',
      )
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('## v1.0.0'),
        'utf8',
      )
    })

    it('Then logs success message', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      const loggerSpy = vi.spyOn(logger, 'info')
      const pkg = createMockPackageInfo()

      writeChangelogToFile({
        cwd: '/project',
        pkg,
        changelog: '## v1.0.0\n\n- Feature',
        dryRun: false,
      })

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Changelog updated'),
      )
    })
  })

  describe('When updating existing changelog', () => {
    it('Then inserts new content after title', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue('# Changelog\n\n## v0.9.0\n\n- Old feature')
      const pkg = createMockPackageInfo()

      writeChangelogToFile({
        cwd: '/project',
        pkg,
        changelog: '## v1.0.0\n\n- New feature',
        dryRun: false,
      })

      const writtenContent = vi.mocked(writeFileSync).mock.calls[0]?.[1] as string
      expect(writtenContent).toContain('# Changelog')
      expect(writtenContent.indexOf('## v1.0.0')).toBeLessThan(writtenContent.indexOf('## v0.9.0'))
    })

    it('Then preserves existing changelog content', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue('# Changelog\n\n## v0.9.0\n\n- Old content')
      const pkg = createMockPackageInfo()

      writeChangelogToFile({
        cwd: '/project',
        pkg,
        changelog: '## v1.0.0\n\n- New',
        dryRun: false,
      })

      const writtenContent = vi.mocked(writeFileSync).mock.calls[0]?.[1] as string
      expect(writtenContent).toContain('- Old content')
    })

    it('Then handles changelog without title', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue('## v0.9.0\n\n- Old content')
      const pkg = createMockPackageInfo()

      writeChangelogToFile({
        cwd: '/project',
        pkg,
        changelog: '## v1.0.0\n\n- New',
        dryRun: false,
      })

      const writtenContent = vi.mocked(writeFileSync).mock.calls[0]?.[1] as string
      expect(writtenContent).toContain('# Changelog')
      expect(writtenContent).toContain('## v1.0.0')
      expect(writtenContent).toContain('## v0.9.0')
    })
  })

  describe('When in dry-run mode', () => {
    it('Then logs dry-run message without writing', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      const loggerSpy = vi.spyOn(logger, 'info')
      const pkg = createMockPackageInfo()

      writeChangelogToFile({
        cwd: '/project',
        pkg,
        changelog: '## v1.0.0\n\n- Feature',
        dryRun: true,
      })

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[dry-run]'),
      )
      expect(writeFileSync).not.toHaveBeenCalled()
    })

    it('Then includes relative path in message', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(relative).mockReturnValue('packages/test/CHANGELOG.md')
      const loggerSpy = vi.spyOn(logger, 'info')
      const pkg = createMockPackageInfo()

      writeChangelogToFile({
        cwd: '/project',
        pkg,
        changelog: '## v1.0.0\n\n- Feature',
        dryRun: true,
      })

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('packages/test/CHANGELOG.md'),
      )
    })
  })

  describe('When using package with newVersion', () => {
    it('Then includes newVersion in log message', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      const loggerSpy = vi.spyOn(logger, 'info')
      const pkg = {
        ...createMockPackageInfo(),
        newVersion: '1.1.0',
      }

      writeChangelogToFile({
        cwd: '/project',
        pkg,
        changelog: '## v1.1.0\n\n- Feature',
        dryRun: false,
      })

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('1.1.0'),
      )
    })

    it('Then falls back to version when no newVersion', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      const loggerSpy = vi.spyOn(logger, 'info')
      const pkg = {
        ...createMockPackageInfo(),
        version: '1.0.0',
        newVersion: undefined,
      }

      writeChangelogToFile({
        cwd: '/project',
        pkg,
        changelog: '## v1.0.0\n\n- Feature',
        dryRun: false,
      })

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('1.0.0'),
      )
    })
  })
})
