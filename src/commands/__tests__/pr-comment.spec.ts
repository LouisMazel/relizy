import type { PullRequestInfo } from '../../core/pr-comment'
import { logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig } from '../../../tests/mocks'
import { detectPullRequest, getCurrentGitBranch, loadRelizyConfig, postPrComment, readPackageJson, readPackages } from '../../core'
import { buildCommentBody, prComment } from '../pr-comment'

vi.mock('../../core', () => ({
  loadRelizyConfig: vi.fn(),
  detectPullRequest: vi.fn(),
  postPrComment: vi.fn(),
  readPackageJson: vi.fn(),
  readPackages: vi.fn(),
  getCurrentGitBranch: vi.fn(),
  PR_COMMENT_MARKER: '<!-- relizy-pr-comment -->',
}))

describe('Given prComment command', () => {
  const mockPr: PullRequestInfo = {
    number: 42,
    url: 'https://github.com/user/repo/pull/42',
    provider: 'github',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    const config = createMockConfig({
      repo: {
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      },
      tokens: {
        github: 'test-token',
      },
      prComment: {
        mode: 'append',
      },
    })
    vi.mocked(loadRelizyConfig).mockResolvedValue(config)
    vi.mocked(getCurrentGitBranch).mockReturnValue('feature-branch')
    vi.mocked(readPackageJson).mockReturnValue({
      name: 'test-project',
      version: '1.2.3',
      path: '/root',
      private: false,
    })
    vi.mocked(readPackages).mockReturnValue([
      { name: 'pkg-a', version: '1.2.3', path: '/packages/pkg-a', private: false },
      { name: 'pkg-b', version: '1.2.3', path: '/packages/pkg-b', private: false },
    ])
    vi.mocked(detectPullRequest).mockResolvedValue(mockPr)
    vi.mocked(postPrComment).mockResolvedValue(undefined)
  })

  describe('When running standalone (no releaseContext)', () => {
    it('Then loads config', async () => {
      await prComment({})

      expect(loadRelizyConfig).toHaveBeenCalled()
    })

    it('Then reads root package.json', async () => {
      await prComment({})

      expect(readPackageJson).toHaveBeenCalled()
    })

    it('Then reads workspace packages', async () => {
      await prComment({})

      expect(readPackages).toHaveBeenCalled()
    })

    it('Then does not reload config when config is passed directly', async () => {
      const config = createMockConfig({ prComment: { mode: 'append' } })

      await prComment({ config, releaseContext: { status: 'success', bumpResult: { bumped: true, bumpedPackages: [], newVersion: '1.0.0' } } })

      expect(loadRelizyConfig).not.toHaveBeenCalled()
    })
  })

  describe('When PR is detected and posting', () => {
    it('Then detects PR and posts comment', async () => {
      await prComment({})

      expect(detectPullRequest).toHaveBeenCalled()
      expect(postPrComment).toHaveBeenCalledWith(
        expect.objectContaining({
          pr: mockPr,
          body: expect.stringContaining('relizy-pr-comment'),
        }),
      )
    })

    it('Then includes package information in comment body', async () => {
      await prComment({})

      expect(postPrComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('pkg-a'),
        }),
      )
      expect(postPrComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('pkg-b'),
        }),
      )
    })

    it('Then includes root version in comment body', async () => {
      await prComment({})

      expect(postPrComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('1.2.3'),
        }),
      )
    })

    it('Then includes Release published header', async () => {
      await prComment({})

      expect(postPrComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('Release published'),
        }),
      )
    })
  })

  describe('When --pr-number override is provided', () => {
    it('Then passes prNumber to detectPullRequest', async () => {
      await prComment({ prNumber: 99 })

      expect(detectPullRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          prNumber: 99,
        }),
      )
    })
  })

  describe('When in dry-run mode', () => {
    it('Then displays comment preview without posting', async () => {
      const loggerSpy = vi.spyOn(logger, 'box')

      await prComment({ dryRun: true })

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[dry-run] PR Comment Preview'),
      )
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('#42'),
      )
      expect(postPrComment).not.toHaveBeenCalled()
    })

    it('Then shows detected PR number in preview', async () => {
      const loggerSpy = vi.spyOn(logger, 'box')

      await prComment({ dryRun: true })

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('PR: #42'),
      )
    })

    it('Then shows mode in preview', async () => {
      const loggerSpy = vi.spyOn(logger, 'box')

      await prComment({ dryRun: true })

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Mode: append'),
      )
    })

    it('Then shows status in preview', async () => {
      const loggerSpy = vi.spyOn(logger, 'box')

      await prComment({ dryRun: true })

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Status: success'),
      )
    })

    it('Then shows "Not detected" when no PR is found', async () => {
      vi.mocked(detectPullRequest).mockResolvedValue(null)
      const loggerSpy = vi.spyOn(logger, 'box')

      await prComment({ dryRun: true })

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Not detected'),
      )
    })
  })

  describe('When no PR is detected', () => {
    it('Then logs warning and does not post', async () => {
      vi.mocked(detectPullRequest).mockResolvedValue(null)
      const loggerSpy = vi.spyOn(logger, 'warn')

      await prComment({})

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('No PR/MR detected'),
      )
      expect(postPrComment).not.toHaveBeenCalled()
    })
  })

  describe('When prComment.mode is update', () => {
    it('Then passes config with update mode', async () => {
      const config = createMockConfig({
        repo: {
          provider: 'github',
          domain: 'github.com',
          repo: 'user/repo',
        },
        tokens: {
          github: 'test-token',
        },
        prComment: {
          mode: 'update',
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await prComment({})

      expect(postPrComment).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            prComment: expect.objectContaining({
              mode: 'update',
            }),
          }),
        }),
      )
    })
  })

  describe('When root package.json cannot be read', () => {
    it('Then throws an error in standalone mode', async () => {
      vi.mocked(readPackageJson).mockReturnValue(undefined)

      await expect(prComment({})).rejects.toThrow('Failed to read root package.json')
    })

    it('Then does not throw when releaseContext is provided', async () => {
      vi.mocked(readPackageJson).mockReturnValue(undefined)

      await expect(prComment({
        releaseContext: { status: 'no-release' },
      })).resolves.not.toThrow()
    })
  })

  describe('When no workspace packages exist (standalone)', () => {
    it('Then posts comment with only root version', async () => {
      vi.mocked(readPackages).mockReturnValue([])

      await prComment({})

      expect(postPrComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('1.2.3'),
        }),
      )
    })
  })

  describe('When releaseContext is provided', () => {
    it('Then does not read packages from disk', async () => {
      await prComment({
        releaseContext: {
          status: 'success',
          bumpResult: { bumped: true, bumpedPackages: [], newVersion: '2.0.0' },
        },
      })

      expect(readPackageJson).not.toHaveBeenCalled()
      expect(readPackages).not.toHaveBeenCalled()
    })

    it('Then posts no-release comment', async () => {
      await prComment({
        releaseContext: { status: 'no-release' },
      })

      expect(postPrComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('no new version'),
        }),
      )
    })

    it('Then posts failed comment with error', async () => {
      await prComment({
        releaseContext: { status: 'failed', error: 'Publish timed out' },
      })

      expect(postPrComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('Release failed'),
        }),
      )
      expect(postPrComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('Publish timed out'),
        }),
      )
    })

    it('Then posts success comment with bumpResult', async () => {
      await prComment({
        releaseContext: {
          status: 'success',
          bumpResult: {
            bumped: true,
            newVersion: '2.0.0',
            oldVersion: '1.0.0',
            bumpedPackages: [
              { name: 'pkg-a', oldVersion: '1.0.0', newVersion: '2.0.0', version: '2.0.0', path: '/a', private: false, fromTag: '', commits: [], dependencies: [] },
            ],
          },
          tags: ['v2.0.0'],
        },
      })

      expect(postPrComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('Release published'),
        }),
      )
      expect(postPrComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('v2.0.0'),
        }),
      )
      expect(postPrComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('`1.0.0` → `2.0.0`'),
        }),
      )
    })
  })
})

describe('Given buildCommentBody', () => {
  const baseParams = {
    config: createMockConfig({ prComment: { mode: 'append' } }),
    branch: 'main',
    date: '2026-02-22 14:30 UTC',
  }

  describe('When status is success', () => {
    it('Then generates success header', () => {
      const body = buildCommentBody({
        ...baseParams,
        rootVersion: '1.0.0',
      })

      expect(body).toContain('Release published')
      expect(body).toContain('1.0.0')
      expect(body).toContain('relizy-pr-comment')
    })

    it('Then includes install commands with packageManager', () => {
      const config = createMockConfig({
        prComment: { mode: 'append' },
        publish: { packageManager: 'pnpm' },
        projectName: 'my-lib',
      })
      const body = buildCommentBody({
        ...baseParams,
        config,
        rootVersion: '1.0.0',
      })

      expect(body).toContain('pnpm add my-lib@1.0.0')
    })

    it('Then includes dist-tag install variant', () => {
      const config = createMockConfig({
        prComment: { mode: 'append' },
        publish: { packageManager: 'pnpm', tag: 'beta' },
        projectName: 'my-lib',
      })
      const body = buildCommentBody({
        ...baseParams,
        config,
        rootVersion: '1.0.0',
      })

      expect(body).toContain('pnpm add my-lib@1.0.0')
      expect(body).toContain('pnpm add my-lib@beta')
      expect(body).toContain('`beta` dist-tag')
    })

    it('Then includes bumped packages table with old→new', () => {
      const body = buildCommentBody({
        ...baseParams,
        releaseContext: {
          status: 'success',
          bumpResult: {
            bumped: true,
            newVersion: '2.0.0',
            oldVersion: '1.0.0',
            bumpedPackages: [
              { name: 'pkg-a', oldVersion: '1.0.0', newVersion: '2.0.0', version: '2.0.0', path: '/a', private: false, fromTag: '', commits: [], dependencies: [] },
            ],
          },
          tags: ['v2.0.0'],
        },
      })

      expect(body).toContain('`1.0.0` → `2.0.0`')
      expect(body).toContain('pkg-a')
      expect(body).toContain('v2.0.0')
    })
  })

  describe('When status is no-release', () => {
    it('Then generates no-release comment', () => {
      const body = buildCommentBody({
        ...baseParams,
        releaseContext: { status: 'no-release' },
      })

      expect(body).toContain('no new version')
      expect(body).toContain('main')
      expect(body).toContain('2026-02-22 14:30 UTC')
      expect(body).toContain('relizy-pr-comment')
    })

    it('Then does not include packages or install commands', () => {
      const body = buildCommentBody({
        ...baseParams,
        releaseContext: { status: 'no-release' },
      })

      expect(body).not.toContain('Installation')
      expect(body).not.toContain('Packages')
    })
  })

  describe('When status is failed', () => {
    it('Then generates failed comment with error', () => {
      const body = buildCommentBody({
        ...baseParams,
        releaseContext: { status: 'failed', error: 'npm publish failed' },
      })

      expect(body).toContain('Release failed')
      expect(body).toContain('npm publish failed')
      expect(body).toContain('relizy-pr-comment')
    })

    it('Then includes date and branch', () => {
      const body = buildCommentBody({
        ...baseParams,
        releaseContext: { status: 'failed', error: 'error' },
      })

      expect(body).toContain('main')
      expect(body).toContain('2026-02-22 14:30 UTC')
    })
  })
})
