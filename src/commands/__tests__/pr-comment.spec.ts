import type { PullRequestInfo } from '../../core/pr-comment'
import { logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig } from '../../../tests/mocks'
import { detectPullRequest, loadRelizyConfig, postPrComment, readPackageJson, readPackages } from '../../core'
import { prComment } from '../pr-comment'

vi.mock('../../core', () => ({
  loadRelizyConfig: vi.fn(),
  detectPullRequest: vi.fn(),
  postPrComment: vi.fn(),
  readPackageJson: vi.fn(),
  readPackages: vi.fn(),
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
        enabled: true,
        mode: 'append',
      },
    })
    vi.mocked(loadRelizyConfig).mockResolvedValue(config)
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

  describe('When command is registered', () => {
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
          enabled: true,
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
    it('Then throws an error', async () => {
      vi.mocked(readPackageJson).mockReturnValue(undefined)

      await expect(prComment({})).rejects.toThrow('Failed to read root package.json')
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
})
