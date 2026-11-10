import type { BumpResultTruthy } from '../../types'
import type { ResolvedRelizyConfig } from '../config'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '@maz-ui/node'
import { getIndependentTag, hasLernaJson, isInCI } from '@relizy/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatGitCommand, runGit, runGitSync, tryGit, tryGitSync } from '../../../../core/src/git-exec'
import { anyHookContext, createMockConfig, createMockPackageInfo, setInteractiveTerminal } from '../../../tests/mocks'
import { loadRelizyConfig, readPackageJson } from '../../core'
import { ensurePushAccess } from '../ci'
import { RelizyCancelError } from '../errors'
import { confirmDirtyGitStatus, createCommitAndTags, pushCommitAndTags, rollbackModifiedFiles } from '../git'
import { askConfirm } from '../prompts'
import { getReleaseFiles, resetReleaseFiles, restoreReleaseFiles } from '../release-files'
import { executeHook } from '../utils'

vi.mock('node:fs')
vi.mock('node:path')

vi.mock('../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config')>()
  return {
    ...actual,
    loadRelizyConfig: vi.fn(),
  }
})

vi.mock('@relizy/core', async (importActual) => {
  return {
    ...await importActual<typeof import('@relizy/core')>(),
    getIndependentTag: vi.fn(),
    hasLernaJson: vi.fn(),
  }
})

vi.mock('../repo', () => {
  return {
    readPackageJson: vi.fn(),
  }
})

vi.mock('../utils', () => {
  return {
    executeHook: vi.fn(),
    getHookContext: vi.fn(),
  }
})

vi.mock('../../../../core/src/git-exec', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../core/src/git-exec')>()
  return {
    ...actual,
    runGitSync: vi.fn(),
    runGit: vi.fn(),
    tryGitSync: vi.fn(),
    tryGit: vi.fn(),
  }
})

vi.mock('../../../../core/src/ci-env', () => ({
  isInCI: vi.fn(() => false),
}))

vi.mock('../release-files', () => {
  return {
    getReleaseFiles: vi.fn(() => []),
    resetReleaseFiles: vi.fn(),
    restoreReleaseFiles: vi.fn(),
  }
})

vi.mock('../prompts', () => {
  return {
    askConfirm: vi.fn(),
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

/** The git commands run without shell (`runGit`), as shown in the logs */
function getGitCommands(): string[] {
  return vi.mocked(runGit).mock.calls.map(([args]) => formatGitCommand(args))
}

/** `runGit` rejecting the commands containing `failing.match`, resolving the others */
function mockGitRun(failing?: { match: string, error: Error }) {
  vi.mocked(runGit).mockImplementation((args) => {
    if (failing && formatGitCommand(args).includes(failing.match)) {
      return Promise.reject(failing.error)
    }
    return Promise.resolve('')
  })
}

/** `git status --porcelain` returning `status`, `git add` failing with `addError` when given */
function mockGitStatusAndAdd(status: string, addError?: Error) {
  vi.mocked(runGitSync).mockImplementation((args) => {
    if (args[0] === 'status') {
      return status
    }
    if (args[0] === 'add' && addError) {
      throw addError
    }
    return ''
  })
}

describe('Given createCommitAndTags function', () => {
  let config: ResolvedRelizyConfig
  let bumpedPackages: BumpResultTruthy['bumpedPackages']

  beforeEach(() => {
    vi.clearAllMocks()
    config = createMockConfig({
      bump: { type: 'patch' },
    })
    config.templates = {
      commitMessage: 'chore(release): bump version to {{newVersion}}',
      commitBody: undefined,
      tagBody: 'v{{newVersion}}',
      tagMessage: 'Release {{newVersion}}',
      emptyChangelogContent: 'No relevant changes for this release',
      twitterMessage: '🚀 {{projectName}} {{newVersion}} is out!\n\n{{changelog}}\n\n📦 {{releaseUrl}}',
      slackMessage: undefined,
      changelogTitle: '{{oldVersion}}...{{newVersion}}',
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
      prComment: true,
    }
    config.signTags = false
    bumpedPackages = []

    vi.mocked(executeHook).mockResolvedValue(undefined)
    vi.mocked(hasLernaJson).mockReturnValue(false)
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(join).mockImplementation((...args) => args.join('/'))
    vi.mocked(readPackageJson).mockReturnValue({
      name: 'test',
      version: '1.0.0',
      path: '/project',
      private: false,
    })
    vi.mocked(runGitSync).mockReturnValue('')
    mockGitRun()
  })

  describe('When creating commit in dry-run mode', () => {
    it('Then logs dry-run messages without executing', async () => {
      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: true,
      })

      expect(runGit).not.toHaveBeenCalled()
    })

    it('Then executes before and after hooks', async () => {
      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: true,
      })

      expect(executeHook).toHaveBeenCalledWith('before:commit-and-tag', config, true, anyHookContext)
      expect(executeHook).toHaveBeenCalledWith('success:commit-and-tag', config, true, anyHookContext)
    })

    it('Then logs tag creation in dry-run', async () => {
      const loggerSpy = vi.spyOn(logger, 'info')

      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '2.0.0',
        dryRun: true,
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
      })

      expect(getGitCommands()).toContainEqual(expect.stringContaining('git commit --no-verify'))
    })

    it('Then logs no-verify flag usage', async () => {
      const loggerSpy = vi.spyOn(logger, 'success')

      await createCommitAndTags({
        config,
        noVerify: true,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: false,
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
      })

      const commitCall = getGitCommands().find(command => command.includes('git commit'))
      expect(commitCall).not.toContain('--no-verify')
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
      })

      const tagCall = getGitCommands().find(command => command.includes('git tag'))
      expect(tagCall).toContain('git tag -s')
    })
  })

  describe('When version mode is independent', () => {
    it('Then creates individual tags for each bumped package', async () => {
      config.monorepo = {
        versionMode: 'independent',
        packages: ['packages/*'],
      }
      bumpedPackages = [
        {
          ...createMockPackageInfo(),
          name: 'package-a',
          version: '1.0.0',
          oldVersion: '1.0.0',
          newVersion: '1.1.0',
          path: '/path/a',
        },
        {
          ...createMockPackageInfo(),
          name: 'package-b',
          version: '2.0.0',
          oldVersion: '2.0.0',
          newVersion: '2.1.0',
          path: '/path/b',
        },
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
      })

      expect(result).toEqual(['package-a@1.1.0', 'package-b@2.1.0'])
      expect(getIndependentTag).toHaveBeenCalledWith({ name: 'package-a', version: '1.1.0' })
      expect(getIndependentTag).toHaveBeenCalledWith({ name: 'package-b', version: '2.1.0' })
    })

    it('Then uses independent tags in commit message', async () => {
      config.monorepo = {
        versionMode: 'independent',
        packages: ['packages/*'],
      }
      bumpedPackages = [
        {
          ...createMockPackageInfo(),
          name: 'pkg-a',
          version: '1.0.0',
          oldVersion: '1.0.0',
          newVersion: '1.1.0',
          path: '/path/a',
        },
      ]
      vi.mocked(getIndependentTag).mockReturnValue('pkg-a@1.1.0')

      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        dryRun: false,
      })

      expect(getGitCommands()).toContainEqual(expect.stringContaining('pkg-a@1.1.0'))
    })

    it('Then skips packages without newVersion', async () => {
      config.monorepo = {
        versionMode: 'independent',
        packages: ['packages/*'],
      }
      bumpedPackages = [
        {
          ...createMockPackageInfo(),
          name: 'package-a',
          newVersion: '1.0.0',
          oldVersion: '0.0.9',
          path: '/path/a',
        },
        {
          ...createMockPackageInfo(),
          name: 'package-b',
          newVersion: '2.0.0',
          oldVersion: '1.0.0',
          path: '/path/b',
        },
      ]
      vi.mocked(getIndependentTag).mockImplementation(pkg => `${pkg.name}@${pkg.version}`)

      const result = await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
      })

      expect(result).toHaveLength(2)
      expect(result).toEqual(['package-a@1.0.0', 'package-b@2.0.0'])
    })
  })

  describe('When version mode is not independent', () => {
    it('Then creates single tag with version', async () => {
      config.monorepo = {
        versionMode: 'unified',
        packages: ['packages/*'],
      }

      const result = await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '3.0.0',
        dryRun: false,
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
      })

      const tagCall = getGitCommands().find(command => command.includes('git tag'))
      expect(tagCall).toContain('Version 1.2.3 released')
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
      })

      expect(result).toEqual([])
      const tagCalls = getGitCommands().filter(command => command.includes('git tag'))
      expect(tagCalls).toHaveLength(0)
    })
  })

  describe('When adding files to staging', () => {
    it('Then adds standard file patterns', async () => {
      // Mock git status to return modified release files
      mockGitStatusAndAdd(' M package.json\n M packages/a/CHANGELOG.md\n M packages/a/package.json\n')

      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: false,
      })

      expect(runGitSync).toHaveBeenCalledWith(['add', 'package.json'], { cwd: config.cwd })
      expect(runGitSync).toHaveBeenCalledWith(['add', 'packages/a/CHANGELOG.md'], { cwd: config.cwd })
      expect(runGitSync).toHaveBeenCalledWith(['add', 'packages/a/package.json'], { cwd: config.cwd })
    })

    it('Then only adds the files written by the run, and forgets them once committed', async () => {
      mockGitStatusAndAdd(' M package.json\n M packages/a/package.json\n M packages/b/package.json\n')
      vi.mocked(getReleaseFiles).mockReturnValueOnce(['package.json', 'packages/a/package.json'])

      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: false,
      })

      expect(runGitSync).toHaveBeenCalledWith(['add', 'package.json'], { cwd: config.cwd })
      expect(runGitSync).toHaveBeenCalledWith(['add', 'packages/a/package.json'], { cwd: config.cwd })
      expect(runGitSync).not.toHaveBeenCalledWith(['add', 'packages/b/package.json'], expect.anything())
      expect(resetReleaseFiles).toHaveBeenCalled()
    })

    it('Then skips lerna.json when not present', async () => {
      // Mock git status to return lerna.json as modified
      mockGitStatusAndAdd(' M lerna.json\n')
      vi.mocked(hasLernaJson).mockReturnValue(false)
      const loggerSpy = vi.spyOn(logger, 'verbose')

      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: false,
      })

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping lerna.json'))
    })

    it('Then adds lerna.json when present', async () => {
      // Mock git status to return lerna.json as modified
      mockGitStatusAndAdd(' M lerna.json\n')
      vi.mocked(hasLernaJson).mockReturnValue(true)
      vi.mocked(existsSync).mockReturnValue(true)

      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: false,
      })

      expect(runGitSync).toHaveBeenCalledWith(['add', 'lerna.json'], { cwd: config.cwd })
    })

    it('Then ignores errors when pattern matches no files', async () => {
      mockGitStatusAndAdd(' M packages/a/CHANGELOG.md\n', new Error('No files matched'))

      await expect(createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: false,
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
      })

      expect(getGitCommands()).toContainEqual(expect.stringContaining('release: 5.0.0'))
    })

    it('Then passes the messages to git as they are, without shell', async () => {
      config.templates.commitMessage = 'release: `whoami` $HOME "{{newVersion}}"'
      config.templates.tagMessage = 'Tag \'{{newVersion}}\' $(id)'

      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '5.0.0',
        dryRun: false,
      })

      const gitArgs = vi.mocked(runGit).mock.calls.map(([args]) => args)
      expect(gitArgs).toContainEqual(['commit', '-m', 'release: `whoami` $HOME "5.0.0"'])
      expect(gitArgs).toContainEqual([
        'tag',
        '-a',
        'v5.0.0',
        '-m',
        'Tag \'5.0.0\' $(id)',
      ])
    })

    it('Then uses default message when template is undefined', async () => {
      config.templates.commitMessage = undefined as any

      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: false,
      })

      expect(getGitCommands()).toContainEqual(expect.stringContaining('chore(release): bump version to 1.0.1'))
    })

    it('Then replaces new placeholders {{packageCount}}, {{packageNames}}, {{packageList}}, {{rootVersion}}', async () => {
      vi.mocked(getIndependentTag).mockImplementation(({ name, version }) => `${name}@${version}`)
      config.monorepo = {
        versionMode: 'independent',
        packages: ['packages/*'],
      }
      config.templates.commitMessage = 'chore(release): bump {{packageCount}} packages (root {{rootVersion}}) - {{packageNames}}'
      config.templates.commitBody = 'Packages: {{packageList}}'
      bumpedPackages = [
        createMockPackageInfo({ name: '@scope/a', version: '1.0.0', newVersion: '1.1.0' }),
        createMockPackageInfo({ name: '@scope/b', version: '1.0.0', newVersion: '1.0.1' }),
      ] as unknown as BumpResultTruthy['bumpedPackages']

      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        dryRun: false,
      })

      const cmd = getGitCommands().find(command => command.startsWith('git commit'))
      expect(cmd).toContain('chore(release): bump 2 packages (root 1.0.0) - @scope/a, @scope/b')
      expect(cmd).toContain('Packages: @scope/a@1.1.0, @scope/b@1.0.1')
    })

    it('Then renders the independent-mode resolved templates (title + body) end-to-end', async () => {
      vi.mocked(getIndependentTag).mockImplementation(({ name, version }) => `${name}@${version}`)
      config.monorepo = {
        versionMode: 'independent',
        packages: ['packages/*'],
      }
      // Simulate what loadRelizyConfig produces in independent mode.
      config.templates.commitMessage = 'chore(release): bump {{packageCount}} packages'
      config.templates.commitBody = '{{packageList}}'
      bumpedPackages = [
        createMockPackageInfo({ name: '@scope/a', version: '1.0.0', newVersion: '1.1.0' }),
        createMockPackageInfo({ name: '@scope/b', version: '1.0.0', newVersion: '1.0.1' }),
        createMockPackageInfo({ name: '@scope/c', version: '1.0.0', newVersion: '1.0.1' }),
      ] as unknown as BumpResultTruthy['bumpedPackages']

      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        dryRun: false,
      })

      const cmd = getGitCommands().find(command => command.startsWith('git commit'))
      expect(cmd).toContain('-m "chore(release): bump 3 packages"')
      expect(cmd).toContain('-m "@scope/a@1.1.0, @scope/b@1.0.1, @scope/c@1.0.1"')
    })

    it('Then keeps user-customized commitMessage in independent mode', async () => {
      vi.mocked(getIndependentTag).mockImplementation(({ name, version }) => `${name}@${version}`)
      config.monorepo = {
        versionMode: 'independent',
        packages: ['packages/*'],
      }
      config.templates.commitMessage = 'release: {{packageCount}}'
      bumpedPackages = [
        createMockPackageInfo({ name: '@scope/a', version: '1.0.0', newVersion: '1.1.0' }),
      ] as unknown as BumpResultTruthy['bumpedPackages']

      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        dryRun: false,
      })

      const cmd = getGitCommands().find(command => command.startsWith('git commit'))
      expect(cmd).toContain('release: 1')
      // No auto-body when user customized the title
      expect(cmd).not.toContain('-m "@scope/a@1.1.0"')
    })
  })

  describe('When newVersion is not provided', () => {
    it('Then uses version from root package.json', async () => {
      vi.mocked(readPackageJson).mockReturnValue({
        name: 'test',
        version: '4.5.6',
        path: '/project',
        private: false,
      })

      await createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        dryRun: false,
      })

      expect(getGitCommands()).toContainEqual(expect.stringContaining('4.5.6'))
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
      })).rejects.toThrow('Failed to read root package.json')
    })
  })

  describe('When tag creation fails', () => {
    it('Then logs error and throws', async () => {
      const error = new Error('Tag already exists')
      mockGitRun({ match: 'git tag', error })
      const loggerSpy = vi.spyOn(logger, 'error')

      await expect(createCommitAndTags({
        config,
        noVerify: false,
        bumpedPackages,
        newVersion: '1.0.1',
        dryRun: false,
      })).rejects.toThrow('Tag already exists')

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to create tag'), error)
    })

    it('Then executes error hook', async () => {
      mockGitRun({
        match: 'git tag',
        error: new Error('Failed'),
      })

      try {
        await createCommitAndTags({
          config,
          noVerify: false,
          bumpedPackages,
          newVersion: '1.0.1',
          dryRun: false,
        })
      }
      catch {
        // Expected
      }

      expect(executeHook).toHaveBeenCalledWith('error:commit-and-tag', config, false, anyHookContext)
    })
  })

  describe('When commit fails', () => {
    it('Then executes error hook', async () => {
      mockGitRun({
        match: 'git commit',
        error: new Error('Commit failed'),
      })

      try {
        await createCommitAndTags({
          config,
          noVerify: false,
          bumpedPackages,
          newVersion: '1.0.1',
          dryRun: false,
        })
      }
      catch {
        // Expected
      }

      expect(executeHook).toHaveBeenCalledWith('error:commit-and-tag', config, false, anyHookContext)
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
      })

      expect(loadRelizyConfig).toHaveBeenCalled()
    })
  })
})

describe('Given pushCommitAndTags function', () => {
  let config: ResolvedRelizyConfig

  beforeEach(() => {
    vi.clearAllMocks()
    config = createMockConfig({
      bump: { type: 'patch' },
    })
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
      prComment: true,
    }
    vi.mocked(runGit).mockResolvedValue('')
  })

  describe('When pushing with gitTag enabled', () => {
    it('Then uses git push --follow-tags', async () => {
      await pushCommitAndTags({
        config,
        dryRun: false,
        cwd: '/project',
      })

      expect(runGit).toHaveBeenCalledWith(['push', '--follow-tags'], { cwd: '/project' })
    })

    it('Then makes sure the release can be pushed first (the GitLab token may be needed), not in dry-run', async () => {
      await pushCommitAndTags({ config, dryRun: false, cwd: '/project' })
      expect(ensurePushAccess).toHaveBeenCalledWith({ config })
      expect(vi.mocked(ensurePushAccess).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(runGit).mock.invocationCallOrder[0]!)

      vi.mocked(ensurePushAccess).mockClear()
      await pushCommitAndTags({ config, dryRun: true, cwd: '/project' })
      expect(ensurePushAccess).not.toHaveBeenCalled()
    })

    it('Then logs success message', async () => {
      const loggerSpy = vi.spyOn(logger, 'success')

      await pushCommitAndTags({
        config,
        dryRun: false,
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
        cwd: '/project',
      })

      expect(runGit).toHaveBeenCalledWith(['push'], { cwd: '/project' })
    })
  })

  describe('When pushing in dry-run mode', () => {
    it('Then logs command without executing', async () => {
      const loggerSpy = vi.spyOn(logger, 'info')

      await pushCommitAndTags({
        config,
        dryRun: true,
        cwd: '/project',
      })

      expect(loggerSpy).toHaveBeenCalledWith('[dry-run] git push --follow-tags')
      expect(runGit).not.toHaveBeenCalled()
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
})

describe('Given rollbackModifiedFiles function', () => {
  let config: ResolvedRelizyConfig

  beforeEach(() => {
    vi.clearAllMocks()
    config = createMockConfig({
      monorepo: { versionMode: 'selective' },
    })
    config.cwd = '/project'
  })

  describe('When the run wrote no file', () => {
    it('Then restores nothing and runs no git command', async () => {
      vi.mocked(getReleaseFiles).mockReturnValueOnce([])

      await rollbackModifiedFiles({ config })

      expect(restoreReleaseFiles).not.toHaveBeenCalled()
      expect(runGit).not.toHaveBeenCalled()
      expect(runGitSync).not.toHaveBeenCalled()
    })
  })

  describe('When the run wrote files', () => {
    it('Then restores them from the journal without git checkout nor rm', async () => {
      vi.mocked(getReleaseFiles).mockReturnValueOnce(['package.json', 'packages/a/CHANGELOG.md'])

      await rollbackModifiedFiles({ config })

      expect(restoreReleaseFiles).toHaveBeenCalledWith('/project')
      expect(runGit).not.toHaveBeenCalled()
      expect(runGitSync).not.toHaveBeenCalled()
    })
  })

  describe('When the restoration fails', () => {
    it('Then logs the files to restore and rethrows', async () => {
      vi.mocked(getReleaseFiles).mockReturnValueOnce(['package.json'])
      vi.mocked(restoreReleaseFiles).mockImplementationOnce(() => {
        throw new Error('restore boom')
      })
      const errorSpy = vi.spyOn(logger, 'error')
      const warnSpy = vi.spyOn(logger, 'warn')

      await expect(rollbackModifiedFiles({ config })).rejects.toThrow('restore boom')
      expect(errorSpy).toHaveBeenCalledWith('Failed to rollback modified files automatically')
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('package.json'))
    })
  })
})

describe('Given confirmDirtyGitStatus function', () => {
  let restoreTerminal: () => void

  beforeEach(() => {
    vi.clearAllMocks()
    restoreTerminal = setInteractiveTerminal(true)
    vi.mocked(isInCI).mockReturnValue(false)
  })

  afterEach(() => {
    restoreTerminal()
  })

  function mockGitStatus(status: string) {
    vi.mocked(runGitSync).mockReturnValue(status as any)
  }

  describe('When the working directory is clean', () => {
    it('Then neither warns nor prompts', async () => {
      mockGitStatus('')
      const warnSpy = vi.spyOn(logger, 'warn')

      await confirmDirtyGitStatus({ dryRun: false, cwd: '/repo' })

      expect(warnSpy).not.toHaveBeenCalled()
      expect(askConfirm).not.toHaveBeenCalled()
    })
  })

  describe('When the working directory has uncommitted changes', () => {
    beforeEach(() => {
      mockGitStatus(' M packages/a/package.json')
    })

    it('Then warns with the modified files and continues once confirmed', async () => {
      const warnSpy = vi.spyOn(logger, 'warn')
      vi.mocked(askConfirm).mockResolvedValueOnce(true)
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)

      await confirmDirtyGitStatus({ dryRun: false, cwd: '/repo' })

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('packages/a/package.json'))
      expect(askConfirm).toHaveBeenCalledWith(expect.objectContaining({ initialValue: false }))
      expect(exitSpy).not.toHaveBeenCalled()
      exitSpy.mockRestore()
    })

    it('Then cancels the run when refused', async () => {
      vi.mocked(askConfirm).mockResolvedValueOnce(false)

      await expect(confirmDirtyGitStatus({ dryRun: false, cwd: '/repo' })).rejects.toThrow(RelizyCancelError)
    })

    it('Then cancels the run when the prompt is cancelled (Ctrl+C)', async () => {
      // askConfirm throws its cancel message when the prompt is cancelled (see prompts.spec)
      vi.mocked(askConfirm).mockImplementationOnce(({ cancelMessage }) => Promise.reject(new RelizyCancelError(cancelMessage)))

      await expect(confirmDirtyGitStatus({ dryRun: false, cwd: '/repo' })).rejects.toThrow(new RelizyCancelError('Release cancelled: commit or stash the changes of these files first'))
    })

    it('Then only warns in dry-run, in the CI or without a terminal', async () => {
      const warnSpy = vi.spyOn(logger, 'warn')

      await confirmDirtyGitStatus({ dryRun: true, cwd: '/repo' })
      vi.mocked(isInCI).mockReturnValue(true)
      await confirmDirtyGitStatus({ dryRun: false, cwd: '/repo' })
      vi.mocked(isInCI).mockReturnValue(false)
      // Restored by the afterEach, to the terminal before the beforeEach
      setInteractiveTerminal(false)
      await confirmDirtyGitStatus({ dryRun: false, cwd: '/repo' })

      expect(warnSpy).toHaveBeenCalledTimes(3)
      expect(askConfirm).not.toHaveBeenCalled()
    })

    it('Then names the release files with what changed', async () => {
      mockGitStatus(' M packages/a/package.json\n?? CHANGELOG.md\n M src/index.ts')
      const warnSpy = vi.spyOn(logger, 'warn')
      vi.mocked(askConfirm).mockResolvedValueOnce(true)

      await confirmDirtyGitStatus({ dryRun: false, cwd: '/repo' })

      expect(warnSpy).toHaveBeenCalledWith('Uncommitted changes in files the release commits: packages/a/package.json (modified), CHANGELOG.md (new)')
    })
  })

  describe('When only other files have uncommitted changes', () => {
    it('Then neither warns nor asks: --no-clean keeps them as they are', async () => {
      mockGitStatus(' M plans/v2.md\n?? src/core/release-ui.ts\nR  old.ts -> new.ts')
      const warnSpy = vi.spyOn(logger, 'warn')
      const debugSpy = vi.spyOn(logger, 'debug')

      await confirmDirtyGitStatus({ dryRun: false, cwd: '/repo' })

      expect(warnSpy).not.toHaveBeenCalled()
      expect(askConfirm).not.toHaveBeenCalled()
      expect(debugSpy).toHaveBeenCalledWith('Uncommitted changes kept (--no-clean): plans/v2.md (modified), src/core/release-ui.ts (new), new.ts (renamed)')
    })
  })
})
