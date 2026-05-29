import type { GitCommit } from 'changelogen'
import type { ResolvedRelizyConfig } from '../config'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockCommit, createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import { getFirstCommit, getIndependentTag } from '../../core'
import { generateChangelog, writeChangelogToFile } from '../changelog'
import { buildChangelogBody, buildCompareLink, buildContributors } from '../markdown'
import { getPackageCommits } from '../repo'
import { executeHook } from '../utils'

vi.mock('node:fs')
vi.mock('node:path', async () => {
  const actual = await vi.importActual('node:path')
  return {
    ...actual,
    join: vi.fn((...args) => args.join('/')),
    relative: vi.fn((from, to) => to),
  }
})
vi.mock('../markdown', () => ({
  buildChangelogBody: vi.fn(() => '- feat: feature'),
  buildCompareLink: vi.fn(() => '[v1.0.0...v1.1.0](compare)'),
  buildContributors: vi.fn(() => Promise.resolve('### ❤️ Contributors\n\n- Alice')),
}))
vi.mock('../repo', () => ({
  getPackageCommits: vi.fn(() => Promise.resolve([] as GitCommit[])),
}))
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
    getCurrentGitRef: vi.fn(() => 'HEAD'),
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
      commitBody: undefined,
      tagBody: 'v{{newVersion}}',
      tagMessage: 'Release {{newVersion}}',
      emptyChangelogContent: 'No significant changes',
      twitterMessage: '',
      slackMessage: undefined,
      changelogTitle: '{{oldVersion}}...{{newVersion}}',
    }
    vi.mocked(getFirstCommit).mockReturnValue('abc123')
    vi.mocked(getPackageCommits).mockResolvedValue([createMockCommit('feat', 'feature')])
    vi.mocked(buildChangelogBody).mockReturnValue('- feat: feature')
    vi.mocked(buildCompareLink).mockReturnValue('[compare](url)')
    vi.mocked(buildContributors).mockResolvedValue('### ❤️ Contributors\n\n- Alice')
    vi.mocked(executeHook).mockResolvedValue(undefined)
  })

  describe('When generating changelog for regular commit', () => {
    it('Then fetches commits with changelog: true', async () => {
      const pkg = { name: 'test-package', path: '/p/test' }

      await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.1.0',
      })

      expect(getPackageCommits).toHaveBeenCalledWith(
        expect.objectContaining({ pkg, changelog: true }),
      )
    })

    it('Then uses from config when available', async () => {
      config.from = 'v1.0.0'
      const pkg = { name: 'test-package', path: '/p/test' }

      await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.1.0',
      })

      expect(getPackageCommits).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'v1.0.0' }),
      )
    })

    it('Then uses pkg fromTag when config.from not available', async () => {
      const pkg = { name: 'test-package', path: '/p/test', fromTag: 'v0.9.0' }

      await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.0.0',
      })

      expect(getPackageCommits).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'v0.9.0' }),
      )
    })

    it('Then falls back to first commit when no fromTag', async () => {
      vi.mocked(getFirstCommit).mockReturnValue('initial123')
      const pkg = { name: 'test-package', path: '/p/test' }

      await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.0.0',
      })

      expect(getFirstCommit).toHaveBeenCalledWith(config.cwd)
    })

    it('Then uses HEAD as the git log `to` ref (release tag does not exist yet)', async () => {
      const pkg = { name: 'test-package', path: '/p/test' }

      await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '2.0.0',
      })

      // `git log` must use HEAD since the future tag is created after the
      // changelog step. The templated `v2.0.0` is only used for display.
      expect(getPackageCommits).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'HEAD' }),
      )
    })

    it('Then uses config.to for the git log `to` ref when provided (CLI override)', async () => {
      config.to = 'v3.0.0'
      const pkg = { name: 'test-package', path: '/p/test' }

      await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '3.0.0',
      })

      expect(getPackageCommits).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'v3.0.0' }),
      )
    })

    it('Then assembles title, compareLink, body and contributors by default', async () => {
      const pkg = { name: 'test-package', path: '/p/test', fromTag: 'v1.0.0' }

      const result = await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.1.0',
      })

      expect(result).toContain('## v1.0.0...v1.1.0')
      expect(result).toContain('[compare](url)')
      expect(result).toContain('- feat: feature')
      expect(result).toContain('❤️ Contributors')
    })
  })

  describe('When generating for independent mode', () => {
    it('Then uses independent tag for toTag', async () => {
      config.monorepo = { versionMode: 'independent', packages: ['packages/*'] }
      vi.mocked(getIndependentTag).mockReturnValue('pkg-a@1.1.0')
      const pkg = { name: 'pkg-a', path: '/p/pkg-a' }

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
      const pkg = { name: 'pkg-a', path: '/p/pkg-a' }

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
      vi.mocked(getPackageCommits).mockResolvedValueOnce([])
      vi.mocked(buildChangelogBody).mockReturnValueOnce('')
      const pkg = { name: 'test-package', path: '/p/test' }

      const result = await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.0.1',
      })

      expect(result).toContain('No significant changes')
    })
  })

  describe('When using `include` to filter sections', () => {
    it('Then omits title and contributors when only body+compareLink requested', async () => {
      const pkg = { name: 'test-package', path: '/p/test' }

      const result = await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.1.0',
        include: { title: false, compareLink: true, body: true, contributors: false },
      })

      expect(result).not.toContain('## v1.0.0...v1.1.0')
      expect(result).toContain('[compare](url)')
      expect(result).toContain('- feat: feature')
      expect(result).not.toContain('Contributors')
    })

    it('Then returns only the body when include.body is the sole flag', async () => {
      const pkg = { name: 'test-package', path: '/p/test' }

      const result = await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.1.0',
        include: { title: false, compareLink: false, body: true, contributors: false },
      })

      expect(result).toBe('- feat: feature')
    })
  })

  describe('When using transformBody', () => {
    it('Then passes the rendered body through the callback before assembly', async () => {
      const pkg = { name: 'test-package', path: '/p/test' }

      const result = await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.1.0',
        include: { title: false, compareLink: false, body: true, contributors: false },
        transformBody: body => `AI(${body})`,
      })

      expect(result).toBe('AI(- feat: feature)')
    })
  })

  describe('When in minify mode', () => {
    it('Then skips compareLink and contributors even if included', async () => {
      const pkg = { name: 'test-package', path: '/p/test' }

      const result = await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.1.0',
        minify: true,
      })

      expect(result).not.toContain('[compare](url)')
      expect(result).not.toContain('Contributors')
      expect(result).toContain('- feat: feature')
    })
  })

  describe('When executing hooks', () => {
    it('Then executes generate:changelog hook for full output', async () => {
      const pkg = { name: 'test-package', path: '/p/test' }

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
          commits: expect.any(Array),
          changelog: expect.any(String),
        }),
      )
    })

    it('Then skips the hook when only a partial section is requested', async () => {
      const pkg = { name: 'test-package', path: '/p/test' }

      await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.1.0',
        include: { title: false, compareLink: false, body: true, contributors: false },
      })

      expect(executeHook).not.toHaveBeenCalled()
    })

    it('Then uses hook result when provided', async () => {
      vi.mocked(executeHook).mockResolvedValue('Custom changelog from hook')
      const pkg = { name: 'test-package', path: '/p/test' }

      const result = await generateChangelog({
        pkg,
        config,
        dryRun: false,
        newVersion: '1.1.0',
      })

      expect(result).toBe('Custom changelog from hook')
    })

    it('Then passes dryRun to hook', async () => {
      const pkg = { name: 'test-package', path: '/p/test' }

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
      const pkg = { name: 'test-package', path: '/p/test' }

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
      vi.mocked(getPackageCommits).mockRejectedValue(new Error('commits error'))
      const pkg = { name: 'test-package', path: '/p/test' }

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
      const pkg = { name: 'test-package', path: '/p/test' }

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
