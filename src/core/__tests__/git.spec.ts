import type { BumpResultTruthy } from '../../types'
import type { ResolvedRelizyConfig } from '../config'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execPromise, logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import { getIndependentTag, hasLernaJson, loadRelizyConfig, readPackageJson } from '../../core'
import {
  checkGitStatusIfDirty,
  createCommitAndTags,
  detectGitProvider,
  fetchGitTags,
  getCurrentGitBranch,
  getCurrentGitRef,
  getFirstCommit,
  getGitStatus,
  parseGitRemoteUrl,
  pushCommitAndTags,
} from '../git'
import { executeHook } from '../utils'

vi.mock('node:child_process')
vi.mock('node:fs')
vi.mock('node:path')

vi.mock('../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config')>()
  return {
    ...actual,
    loadRelizyConfig: vi.fn(),
  }
})

vi.mock('../tags', () => {
  return {
    getIndependentTag: vi.fn(),
  }
})

vi.mock('../repo', () => {
  return {
    readPackageJson: vi.fn(),
    hasLernaJson: vi.fn(),
  }
})

vi.mock('../utils', () => {
  return {
    executeHook: vi.fn(),
  }
})

describe('Given getGitStatus function', () => {
  describe('When git status is clean', () => {
    it('Then returns empty string', () => {
      vi.mocked(execSync).mockReturnValue('  ')

      const result = getGitStatus()

      expect(result).toBe('')
      expect(execSync).toHaveBeenCalledWith('git status --porcelain', {
        cwd: undefined,
        encoding: 'utf8',
      })
    })

    it('Then uses provided cwd', () => {
      vi.mocked(execSync).mockReturnValue('')

      getGitStatus('/custom/path')

      expect(execSync).toHaveBeenCalledWith('git status --porcelain', {
        cwd: '/custom/path',
        encoding: 'utf8',
      })
    })
  })

  describe('When git status has changes', () => {
    it('Then returns trimmed status output', () => {
      vi.mocked(execSync).mockReturnValue(' M package.json\n?? new-file.ts  \n')

      const result = getGitStatus()

      expect(result).toBe('M package.json\n?? new-file.ts')
    })

    it('Then returns multiple lines of changes', () => {
      vi.mocked(execSync).mockReturnValue('M src/core/git.ts\nA src/core/new.ts\nD old-file.ts')

      const result = getGitStatus()

      expect(result).toBe('M src/core/git.ts\nA src/core/new.ts\nD old-file.ts')
    })
  })
})

describe('Given checkGitStatusIfDirty function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When git status is clean', () => {
    it('Then does not throw error', () => {
      vi.mocked(execSync).mockReturnValue('')

      expect(() => checkGitStatusIfDirty()).not.toThrow()
    })

    it('Then logs debug message', () => {
      vi.mocked(execSync).mockReturnValue('  ')
      const loggerSpy = vi.spyOn(logger, 'debug')

      checkGitStatusIfDirty()

      expect(loggerSpy).toHaveBeenCalledWith('Checking git status')
    })
  })

  describe('When git status is dirty', () => {
    it('Then throws error with dirty status message', () => {
      vi.mocked(execSync).mockReturnValue('M package.json')

      expect(() => checkGitStatusIfDirty()).toThrow('Git status is dirty!')
      expect(() => checkGitStatusIfDirty()).toThrow('Please commit or stash your changes')
      expect(() => checkGitStatusIfDirty()).toThrow('M package.json')
    })

    it('Then includes --no-clean flag hint in error', () => {
      vi.mocked(execSync).mockReturnValue('?? new-file.ts')

      expect(() => checkGitStatusIfDirty()).toThrow('--no-clean flag')
    })

    it('Then logs debug with formatted status', () => {
      vi.mocked(execSync).mockReturnValue('M file1.ts\nA file2.ts')
      const loggerSpy = vi.spyOn(logger, 'debug')

      try {
        checkGitStatusIfDirty()
      }
      catch {
        // Expected
      }

      expect(loggerSpy).toHaveBeenCalledWith('git status:', expect.stringContaining('M file1.ts'))
    })
  })

  describe('When git status has whitespace', () => {
    it('Then trims and formats dirty status', () => {
      vi.mocked(execSync).mockReturnValue('  M  src/file.ts  \n  ?? another.ts  ')

      expect(() => checkGitStatusIfDirty()).toThrow('M  src/file.ts')
      expect(() => checkGitStatusIfDirty()).toThrow('?? another.ts')
    })
  })
})

describe('Given fetchGitTags function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When fetching tags succeeds', () => {
    it('Then executes git fetch command', async () => {
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })

      await fetchGitTags()

      expect(execPromise).toHaveBeenCalledWith('git fetch --tags', {
        cwd: undefined,
        noStderr: true,
        noStdout: true,
        noSuccess: true,
      })
    })

    it('Then uses provided cwd', async () => {
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })

      await fetchGitTags('/project/path')

      expect(execPromise).toHaveBeenCalledWith('git fetch --tags', {
        cwd: '/project/path',
        noStderr: true,
        noStdout: true,
        noSuccess: true,
      })
    })

    it('Then logs debug messages', async () => {
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })
      const loggerSpy = vi.spyOn(logger, 'debug')

      await fetchGitTags()

      expect(loggerSpy).toHaveBeenCalledWith('Fetching git tags from remote')
      expect(loggerSpy).toHaveBeenCalledWith('Git tags fetched successfully')
    })
  })

  describe('When fetching tags fails', () => {
    it('Then catches error and logs failure', async () => {
      const error = new Error('Network error')
      vi.mocked(execPromise).mockRejectedValue(error)
      const loggerFailSpy = vi.spyOn(logger, 'fail')
      const loggerInfoSpy = vi.spyOn(logger, 'info')

      await fetchGitTags()

      expect(loggerFailSpy).toHaveBeenCalledWith(
        'Failed to fetch some git tags from remote (tags might already exist locally)',
        error,
      )
      expect(loggerInfoSpy).toHaveBeenCalledWith('Continuing with local tags')
    })

    it('Then does not throw error on failure', async () => {
      vi.mocked(execPromise).mockRejectedValue(new Error('Failed'))

      await expect(fetchGitTags()).resolves.toBeUndefined()
    })
  })
})

describe('Given detectGitProvider function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When remote URL is GitHub', () => {
    it('Then returns github for github.com HTTPS URL', () => {
      vi.mocked(execSync).mockReturnValue('https://github.com/user/repo.git')

      const result = detectGitProvider()

      expect(result).toBe('github')
    })

    it('Then returns github for github.com SSH URL', () => {
      vi.mocked(execSync).mockReturnValue('git@github.com:user/repo.git')

      const result = detectGitProvider()

      expect(result).toBe('github')
    })

    it('Then uses provided cwd', () => {
      vi.mocked(execSync).mockReturnValue('https://github.com/user/repo.git')

      detectGitProvider('/custom/path')

      expect(execSync).toHaveBeenCalledWith('git remote get-url origin', {
        cwd: '/custom/path',
        encoding: 'utf8',
      })
    })
  })

  describe('When remote URL is GitLab', () => {
    it('Then returns gitlab for gitlab.com URL', () => {
      vi.mocked(execSync).mockReturnValue('https://gitlab.com/group/project.git')

      const result = detectGitProvider()

      expect(result).toBe('gitlab')
    })

    it('Then returns gitlab for custom gitlab domain', () => {
      vi.mocked(execSync).mockReturnValue('https://gitlab.company.com/team/repo.git')

      const result = detectGitProvider()

      expect(result).toBe('gitlab')
    })

    it('Then returns gitlab for SSH URL', () => {
      vi.mocked(execSync).mockReturnValue('git@gitlab.com:group/project.git')

      const result = detectGitProvider()

      expect(result).toBe('gitlab')
    })
  })

  describe('When remote URL is Bitbucket', () => {
    it('Then returns bitbucket for bitbucket.org URL', () => {
      vi.mocked(execSync).mockReturnValue('https://bitbucket.org/workspace/repo.git')

      const result = detectGitProvider()

      expect(result).toBe('bitbucket')
    })

    it('Then returns bitbucket for custom bitbucket domain', () => {
      vi.mocked(execSync).mockReturnValue('https://bitbucket.company.com/team/repo.git')

      const result = detectGitProvider()

      expect(result).toBe('bitbucket')
    })

    it('Then returns bitbucket for SSH URL', () => {
      vi.mocked(execSync).mockReturnValue('git@bitbucket.org:workspace/repo.git')

      const result = detectGitProvider()

      expect(result).toBe('bitbucket')
    })
  })

  describe('When remote URL is unknown provider', () => {
    it('Then returns null for unrecognized URL', () => {
      vi.mocked(execSync).mockReturnValue('https://example.com/user/repo.git')

      const result = detectGitProvider()

      expect(result).toBeNull()
    })
  })

  describe('When git command fails', () => {
    it('Then returns null and catches error', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Not a git repository')
      })

      const result = detectGitProvider()

      expect(result).toBeNull()
    })

    it('Then handles missing remote', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('No such remote')
      })

      const result = detectGitProvider()

      expect(result).toBeNull()
    })
  })

  describe('When using default cwd', () => {
    it('Then defaults to process.cwd()', () => {
      vi.mocked(execSync).mockReturnValue('https://github.com/user/repo.git')

      detectGitProvider()

      expect(execSync).toHaveBeenCalledWith('git remote get-url origin', {
        cwd: process.cwd(),
        encoding: 'utf8',
      })
    })
  })
})

describe('Given parseGitRemoteUrl function', () => {
  describe('When parsing SSH URLs', () => {
    it('Then extracts owner and repo from GitHub SSH URL', () => {
      const result = parseGitRemoteUrl('git@github.com:user/repo.git')

      expect(result).toEqual({ owner: 'user', repo: 'repo' })
    })

    it('Then extracts owner and repo without .git suffix', () => {
      const result = parseGitRemoteUrl('git@github.com:organization/project')

      expect(result).toEqual({ owner: 'organization', repo: 'project' })
    })

    it('Then handles GitLab SSH URL', () => {
      const result = parseGitRemoteUrl('git@gitlab.walkingnerds.dev:renaissance/edr.git')

      expect(result).toEqual({ owner: 'renaissance', repo: 'edr' })
    })

    it('Then handles custom domain SSH URL', () => {
      const result = parseGitRemoteUrl('git@gitlab.company.com:team/service.git')

      expect(result).toEqual({ owner: 'team', repo: 'service' })
    })

    it('Then handles hyphens and dots in names', () => {
      const result = parseGitRemoteUrl('git@github.com:my-org/my.repo.git')

      expect(result).toEqual({ owner: 'my-org', repo: 'my.repo' })
    })
  })

  describe('When parsing HTTPS URLs', () => {
    it('Then extracts owner and repo from HTTPS URL', () => {
      const result = parseGitRemoteUrl('https://github.com/user/repo.git')

      expect(result).toEqual({ owner: 'user', repo: 'repo' })
    })

    it('Then extracts owner and repo without .git', () => {
      const result = parseGitRemoteUrl('https://github.com/organization/project')

      expect(result).toEqual({ owner: 'organization', repo: 'project' })
    })

    it('Then handles HTTP URLs', () => {
      const result = parseGitRemoteUrl('https://gitlab.com/group/project.git')

      expect(result).toEqual({ owner: 'group', repo: 'project' })
    })

    it('Then handles nested paths', () => {
      const result = parseGitRemoteUrl('https://gitlab.walkingnerds.dev/twn/packages/eslint-config.git')

      expect(result).toEqual({ owner: 'twn/packages', repo: 'eslint-config' })
    })

    it('Then handles custom domains', () => {
      const result = parseGitRemoteUrl('https://bitbucket.company.com/team/repo.git')

      expect(result).toEqual({ owner: 'team', repo: 'repo' })
    })
  })

  describe('When URL format is invalid', () => {
    it('Then returns null for malformed URL', () => {
      const result = parseGitRemoteUrl('invalid-url')

      expect(result).toBeNull()
    })

    it('Then returns null for local path', () => {
      const result = parseGitRemoteUrl('/local/path/to/repo')

      expect(result).toBeNull()
    })

    it('Then returns null for empty string', () => {
      const result = parseGitRemoteUrl('')

      expect(result).toBeNull()
    })

    it('Then returns null for URL without owner/repo', () => {
      const result = parseGitRemoteUrl('https://github.com/')

      expect(result).toBeNull()
    })
  })
})

describe('Given createCommitAndTags function', () => {
  let config: ResolvedRelizyConfig
  let bumpedPackages: BumpResultTruthy['bumpedPackages']

  beforeEach(() => {
    vi.clearAllMocks()
    config = createMockConfig({ bump: { type: 'patch' } })
    config.templates = {
      commitMessage: 'chore(release): bump version to {{newVersion}}',
      tagBody: 'v{{newVersion}}',
      tagMessage: 'Release {{newVersion}}',
      emptyChangelogContent: 'No relevant changes for this release',
      twitterMessage: '🚀 {{projectName}} {{newVersion}} is out!\n\n{{changelog}}\n\n📦 {{releaseUrl}}',
      slackMessage: undefined,
    }
    config.release = {
      gitTag: true,
      commit: true,
      publish: true,
      changelog: true,
      push: true,
      clean: true,
      providerRelease: true,
      noVerify: false,
      social: true,
    }
    config.signTags = false
    bumpedPackages = []

    vi.mocked(executeHook).mockResolvedValue(undefined)
    vi.mocked(hasLernaJson).mockReturnValue(false)
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(join).mockImplementation((...args) => args.join('/'))
    vi.mocked(readPackageJson).mockReturnValue({ name: 'test', version: '1.0.0', path: '/project', private: false })
    vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })
    vi.mocked(execSync).mockReturnValue('')
  })

  describe('When creating commit in dry-run mode', () => {
    it('Then logs dry-run messages without executing', async () => {
      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: true,
        logLevel: 'normal',
      })

      expect(execPromise).not.toHaveBeenCalled()
    })

    it('Then executes before and after hooks', async () => {
      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: true,
        logLevel: 'normal',
      })

      expect(executeHook).toHaveBeenCalledWith('before:commit-and-tag', config, true)
      expect(executeHook).toHaveBeenCalledWith('success:commit-and-tag', config, true)
    })

    it('Then logs tag creation in dry-run', async () => {
      const loggerSpy = vi.spyOn(logger, 'info')

      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '2.0.0',
        dryRun: true,
        logLevel: 'normal',
      })

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run] git tag'))
    })
  })

  describe('When creating commit with noVerify flag', () => {
    it('Then includes --no-verify in commit command', async () => {
      await createCommitAndTags({
        config,
        noVerify: true,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: false,
        logLevel: 'normal',
      })

      expect(execPromise).toHaveBeenCalledWith(
        expect.stringContaining('git commit --no-verify'),
        expect.any(Object),
      )
    })

    it('Then logs no-verify flag usage', async () => {
      const loggerSpy = vi.spyOn(logger, 'success')

      await createCommitAndTags({
        config,
        noVerify: true,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: false,
        logLevel: 'normal',
      })

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('--no-verify'))
    })
  })

  describe('When creating commit without noVerify', () => {
    it('Then excludes --no-verify from commit command', async () => {
      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: false,
        logLevel: 'normal',
      })

      const calls = vi.mocked(execPromise).mock.calls
      const commitCall = calls.find(call => call[0].includes('git commit'))
      expect(commitCall?.[0]).not.toContain('--no-verify')
    })
  })

  describe('When creating tags with signTags enabled', () => {
    it('Then includes -s flag in tag commands', async () => {
      config.signTags = true

      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: false,
        logLevel: 'normal',
      })

      const calls = vi.mocked(execPromise).mock.calls
      const tagCall = calls.find(call => call[0].includes('git tag'))
      expect(tagCall?.[0]).toContain('git tag -s')
    })
  })

  describe('When version mode is independent', () => {
    it('Then creates individual tags for each bumped package', async () => {
      config.monorepo = { versionMode: 'independent', packages: ['packages/*'] }
      bumpedPackages = [
        { ...createMockPackageInfo(), name: 'package-a', version: '1.0.0', oldVersion: '1.0.0', newVersion: '1.1.0', path: '/path/a' },
        { ...createMockPackageInfo(), name: 'package-b', version: '2.0.0', oldVersion: '2.0.0', newVersion: '2.1.0', path: '/path/b' },
      ]
      vi.mocked(getIndependentTag)
        .mockReturnValueOnce('package-a@1.1.0')
        .mockReturnValueOnce('package-b@2.1.0')
        .mockReturnValueOnce('package-a@1.1.0')
        .mockReturnValueOnce('package-b@2.1.0')

      const result = await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        dryRun: false,
        logLevel: 'normal',
      })

      expect(result).toEqual(['package-a@1.1.0', 'package-b@2.1.0'])
      expect(getIndependentTag).toHaveBeenCalledWith({ name: 'package-a', version: '1.1.0' })
      expect(getIndependentTag).toHaveBeenCalledWith({ name: 'package-b', version: '2.1.0' })
    })

    it('Then uses independent tags in commit message', async () => {
      config.monorepo = { versionMode: 'independent', packages: ['packages/*'] }
      bumpedPackages = [
        { ...createMockPackageInfo(), name: 'pkg-a', version: '1.0.0', oldVersion: '1.0.0', newVersion: '1.1.0', path: '/path/a' },
      ]
      vi.mocked(getIndependentTag).mockReturnValue('pkg-a@1.1.0')

      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        dryRun: false,
        logLevel: 'normal',
      })

      expect(execPromise).toHaveBeenCalledWith(
        expect.stringContaining('pkg-a@1.1.0'),
        expect.any(Object),
      )
    })

    it('Then skips packages without newVersion', async () => {
      config.monorepo = { versionMode: 'independent', packages: ['packages/*'] }
      bumpedPackages = [
        { ...createMockPackageInfo(), name: 'package-a', newVersion: '1.0.0', oldVersion: '0.0.9', path: '/path/a' },
        { ...createMockPackageInfo(), name: 'package-b', newVersion: '2.0.0', oldVersion: '1.0.0', path: '/path/b' },
      ]
      vi.mocked(getIndependentTag).mockImplementation(pkg => `${pkg.name}@${pkg.version}`)

      const result = await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        logLevel: 'normal',
      })

      expect(result).toHaveLength(2)
      expect(result).toEqual(['package-a@1.0.0', 'package-b@2.0.0'])
    })
  })

  describe('When version mode is not independent', () => {
    it('Then creates single tag with version', async () => {
      config.monorepo = { versionMode: 'unified', packages: ['packages/*'] }

      const result = await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '3.0.0',
        dryRun: false,
        logLevel: 'normal',
      })

      expect(result).toEqual(['v3.0.0'])
    })

    it('Then uses template for tag name', async () => {
      config.templates.tagBody = 'release-{{newVersion}}'

      const result = await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '2.5.0',
        dryRun: false,
        logLevel: 'normal',
      })

      expect(result).toEqual(['release-2.5.0'])
    })

    it('Then uses template for tag message', async () => {
      config.templates.tagMessage = 'Version {{newVersion}} released'

      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '1.2.3',
        dryRun: false,
        logLevel: 'normal',
      })

      const calls = vi.mocked(execPromise).mock.calls
      const tagCall = calls.find(call => call[0].includes('git tag'))
      expect(tagCall?.[0]).toContain('Version 1.2.3 released')
    })
  })

  describe('When gitTag is disabled', () => {
    it('Then skips tag creation', async () => {
      config.release.gitTag = false

      const result = await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: false,
        logLevel: 'normal',
      })

      expect(result).toEqual([])
      const calls = vi.mocked(execPromise).mock.calls
      const tagCalls = calls.filter(call => call[0].includes('git tag'))
      expect(tagCalls).toHaveLength(0)
    })
  })

  describe('When adding files to staging', () => {
    it('Then adds standard file patterns', async () => {
      // Mock git status to return modified release files
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (cmd === 'git status --porcelain') {
          return ' M package.json\n M packages/a/CHANGELOG.md\n M packages/a/package.json\n'
        }
        return ''
      })

      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: false,
        logLevel: 'normal',
      })

      expect(execSync).toHaveBeenCalledWith('git add package.json')
      expect(execSync).toHaveBeenCalledWith('git add packages/a/CHANGELOG.md')
      expect(execSync).toHaveBeenCalledWith('git add packages/a/package.json')
    })

    it('Then skips lerna.json when not present', async () => {
      // Mock git status to return lerna.json as modified
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (cmd === 'git status --porcelain') {
          return ' M lerna.json\n'
        }
        return ''
      })
      vi.mocked(hasLernaJson).mockReturnValue(false)
      const loggerSpy = vi.spyOn(logger, 'verbose')

      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: false,
        logLevel: 'verbose',
      })

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping lerna.json'))
    })

    it('Then adds lerna.json when present', async () => {
      // Mock git status to return lerna.json as modified
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (cmd === 'git status --porcelain') {
          return ' M lerna.json\n'
        }
        return ''
      })
      vi.mocked(hasLernaJson).mockReturnValue(true)
      vi.mocked(existsSync).mockReturnValue(true)

      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: false,
        logLevel: 'normal',
      })

      expect(execSync).toHaveBeenCalledWith('git add lerna.json')
    })

    it('Then ignores errors when pattern matches no files', async () => {
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (cmd === 'git add **/CHANGELOG.md') {
          throw new Error('No files matched')
        }
        return ''
      })

      await expect(createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: false,
        logLevel: 'normal',
      })).resolves.toBeDefined()
    })
  })

  describe('When commit message template is used', () => {
    it('Then replaces {{newVersion}} placeholder', async () => {
      config.templates.commitMessage = 'release: {{newVersion}}'

      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '5.0.0',
        dryRun: false,
        logLevel: 'normal',
      })

      expect(execPromise).toHaveBeenCalledWith(
        expect.stringContaining('release: 5.0.0'),
        expect.any(Object),
      )
    })

    it('Then uses default message when template is undefined', async () => {
      config.templates.commitMessage = undefined as any

      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: false,
        logLevel: 'normal',
      })

      expect(execPromise).toHaveBeenCalledWith(
        expect.stringContaining('chore(release): bump version to 1.0.1'),
        expect.any(Object),
      )
    })
  })

  describe('When newVersion is not provided', () => {
    it('Then uses version from root package.json', async () => {
      vi.mocked(readPackageJson).mockReturnValue({ name: 'test', version: '4.5.6', path: '/project', private: false })

      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        dryRun: false,
        logLevel: 'normal',
      })

      expect(execPromise).toHaveBeenCalledWith(
        expect.stringContaining('4.5.6'),
        expect.any(Object),
      )
    })
  })

  describe('When reading root package fails', () => {
    it('Then throws error', async () => {
      vi.mocked(readPackageJson).mockReturnValue(undefined as any)

      await expect(createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        dryRun: false,
        logLevel: 'normal',
      })).rejects.toThrow('Failed to read root package.json')
    })
  })

  describe('When tag creation fails', () => {
    it('Then logs error and throws', async () => {
      const error = new Error('Tag already exists')
      vi.mocked(execPromise).mockImplementation((cmd) => {
        if (cmd.includes('git tag')) {
          return Promise.reject(error)
        }
        return Promise.resolve({ stdout: '', stderr: '' })
      })
      const loggerSpy = vi.spyOn(logger, 'error')

      await expect(createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: false,
        logLevel: 'normal',
      })).rejects.toThrow('Tag already exists')

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to create tag'), error)
    })

    it('Then executes error hook', async () => {
      vi.mocked(execPromise).mockImplementation((cmd) => {
        if (cmd.includes('git tag')) {
          return Promise.reject(new Error('Failed'))
        }
        return Promise.resolve({ stdout: '', stderr: '' })
      })

      try {
        await createCommitAndTags({
          config,
          noVerify: false,
          bumpedPackages,
          newVersion: '1.0.1',
          dryRun: false,
          logLevel: 'normal',
        })
      }
      catch {
        // Expected
      }

      expect(executeHook).toHaveBeenCalledWith('error:commit-and-tag', config, false)
    })
  })

  describe('When commit fails', () => {
    it('Then executes error hook', async () => {
      vi.mocked(execPromise).mockRejectedValue(new Error('Commit failed'))

      try {
        await createCommitAndTags({
          config,
          noVerify: false,
          bumpedPackages,
          newVersion: '1.0.1',
          dryRun: false,
          logLevel: 'normal',
        })
      }
      catch {
        // Expected
      }

      expect(executeHook).toHaveBeenCalledWith('error:commit-and-tag', config, false)
    })
  })

  describe('When config is not provided', () => {
    it('Then loads config automatically', async () => {
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await createCommitAndTags({
        config: undefined as any,
        noVerify: false,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: false,
        logLevel: 'normal',
      })

      expect(loadRelizyConfig).toHaveBeenCalled()
    })
  })
})

describe('Given pushCommitAndTags function', () => {
  let config: ResolvedRelizyConfig

  beforeEach(() => {
    vi.clearAllMocks()
    config = createMockConfig({ bump: { type: 'patch' } })
    config.release = {
      gitTag: true,
      commit: true,
      publish: true,
      changelog: true,
      push: true,
      clean: true,
      providerRelease: true,
      noVerify: false,
      social: true,
    }
    vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })
  })

  describe('When pushing with gitTag enabled', () => {
    it('Then uses git push --follow-tags', async () => {
      await pushCommitAndTags({
        config,
        dryRun: false,
        logLevel: 'normal',
        cwd: '/project',
      })

      expect(execPromise).toHaveBeenCalledWith(
        'git push --follow-tags',
        {
          noStderr: true,
          noStdout: true,
          logLevel: 'normal',
          cwd: '/project',
        },
      )
    })

    it('Then logs success message', async () => {
      const loggerSpy = vi.spyOn(logger, 'success')

      await pushCommitAndTags({
        config,
        dryRun: false,
        logLevel: 'normal',
        cwd: '/project',
      })

      expect(loggerSpy).toHaveBeenCalledWith('Pushing changes and tags completed!')
    })
  })

  describe('When pushing with gitTag disabled', () => {
    it('Then uses git push without --follow-tags', async () => {
      config.release.gitTag = false

      await pushCommitAndTags({
        config,
        dryRun: false,
        logLevel: 'normal',
        cwd: '/project',
      })

      expect(execPromise).toHaveBeenCalledWith(
        'git push',
        expect.any(Object),
      )
    })
  })

  describe('When pushing in dry-run mode', () => {
    it('Then logs command without executing', async () => {
      const loggerSpy = vi.spyOn(logger, 'info')

      await pushCommitAndTags({
        config,
        dryRun: true,
        logLevel: 'normal',
        cwd: '/project',
      })

      expect(loggerSpy).toHaveBeenCalledWith('[dry-run] git push --follow-tags')
      expect(execPromise).not.toHaveBeenCalled()
    })

    it('Then still logs success message', async () => {
      const loggerSpy = vi.spyOn(logger, 'success')

      await pushCommitAndTags({
        config,
        dryRun: true,
        cwd: '/project',
      })

      expect(loggerSpy).toHaveBeenCalledWith('Pushing changes and tags completed!')
    })
  })

  describe('When logLevel is not provided', () => {
    it('Then calls execPromise with undefined logLevel', async () => {
      await pushCommitAndTags({
        config,
        dryRun: false,
        cwd: '/project',
      })

      expect(execPromise).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          logLevel: undefined,
        }),
      )
    })
  })
})

describe('Given getFirstCommit function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When repository has commits', () => {
    it('Then returns first commit hash', () => {
      vi.mocked(execSync).mockReturnValue('abc123def456\n')

      const result = getFirstCommit('/project')

      expect(result).toBe('abc123def456')
      expect(execSync).toHaveBeenCalledWith(
        'git rev-list --max-parents=0 HEAD',
        {
          cwd: '/project',
          encoding: 'utf8',
        },
      )
    })

    it('Then trims whitespace from result', () => {
      vi.mocked(execSync).mockReturnValue('  abc123  \n')

      const result = getFirstCommit('/project')

      expect(result).toBe('abc123')
    })
  })

  describe('When repository has multiple root commits', () => {
    it('Then returns first root commit', () => {
      vi.mocked(execSync).mockReturnValue('first123\nsecond456\n')

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
      vi.mocked(execSync).mockReturnValue('main\n')

      const result = getCurrentGitBranch('/project')

      expect(result).toBe('main')
      expect(execSync).toHaveBeenCalledWith(
        'git rev-parse --abbrev-ref HEAD',
        {
          cwd: '/project',
          encoding: 'utf8',
        },
      )
    })

    it('Then trims whitespace from branch name', () => {
      vi.mocked(execSync).mockReturnValue('  feature/new-feature  \n')

      const result = getCurrentGitBranch('/project')

      expect(result).toBe('feature/new-feature')
    })

    it('Then handles branch with slashes', () => {
      vi.mocked(execSync).mockReturnValue('bugfix/issue-123\n')

      const result = getCurrentGitBranch('/project')

      expect(result).toBe('bugfix/issue-123')
    })
  })

  describe('When in detached HEAD state', () => {
    it('Then returns HEAD', () => {
      vi.mocked(execSync).mockReturnValue('HEAD\n')

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
      vi.mocked(execSync).mockReturnValue('develop\n')

      const result = getCurrentGitRef('/project')

      expect(result).toBe('develop')
    })

    it('Then handles feature branches', () => {
      vi.mocked(execSync).mockReturnValue('feature/login\n')

      const result = getCurrentGitRef('/project')

      expect(result).toBe('feature/login')
    })
  })

  describe('When in detached HEAD state', () => {
    it('Then returns HEAD as fallback', () => {
      vi.mocked(execSync).mockReturnValue('')

      const result = getCurrentGitRef('/project')

      expect(result).toBe('HEAD')
    })

    it('Then returns HEAD when branch is empty string', () => {
      vi.mocked(execSync).mockReturnValue('  \n')

      const result = getCurrentGitRef('/project')

      expect(result).toBe('HEAD')
    })
  })
})
