import { execSync } from 'node:child_process'
import { logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig } from '../../../tests/mocks'
import { detectPullRequest, findGitHubPR, findGitLabMR } from '../pr-comment'

vi.mock('node:child_process')

globalThis.fetch = vi.fn()

describe('Given findGitHubPR function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When an open PR exists for the branch', () => {
    it('Then returns PR number and URL', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { number: 42, html_url: 'https://github.com/user/repo/pull/42' },
        ]),
      } as Response)

      const result = await findGitHubPR({
        token: 'test-token',
        repo: 'user/repo',
        branch: 'feature/my-branch',
      })

      expect(result).toEqual({
        number: 42,
        url: 'https://github.com/user/repo/pull/42',
        provider: 'github',
      })
    })

    it('Then calls GitHub API with correct parameters', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { number: 1, html_url: 'https://github.com/user/repo/pull/1' },
        ]),
      } as Response)

      await findGitHubPR({
        token: 'my-token',
        repo: 'user/repo',
        branch: 'main',
      })

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.github.com/repos/user/repo/pulls'),
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer my-token',
            Accept: 'application/vnd.github.v3+json',
          },
        }),
      )
    })

    it('Then encodes branch name in URL', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response)

      await findGitHubPR({
        token: 'token',
        repo: 'user/repo',
        branch: 'feature/special branch',
      })

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent('user:feature/special branch')),
        expect.anything(),
      )
    })
  })

  describe('When no open PR exists', () => {
    it('Then returns null', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response)

      const result = await findGitHubPR({
        token: 'token',
        repo: 'user/repo',
        branch: 'feature/no-pr',
      })

      expect(result).toBeNull()
    })
  })

  describe('When GitHub API returns an error', () => {
    it('Then returns null', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      } as Response)

      const result = await findGitHubPR({
        token: 'bad-token',
        repo: 'user/repo',
        branch: 'main',
      })

      expect(result).toBeNull()
    })

    it('Then logs warning with status', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve('Forbidden'),
      } as Response)
      const loggerSpy = vi.spyOn(logger, 'warn')

      await findGitHubPR({
        token: 'token',
        repo: 'user/repo',
        branch: 'main',
      })

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('GitHub API error (403)'))
    })
  })

  describe('When using custom domain', () => {
    it('Then uses GitHub Enterprise API base URL', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response)

      await findGitHubPR({
        token: 'token',
        repo: 'user/repo',
        branch: 'main',
        domain: 'github.enterprise.com',
      })

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://github.enterprise.com/api/v3/repos/user/repo/pulls'),
        expect.anything(),
      )
    })

    it('Then uses standard API for github.com domain', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response)

      await findGitHubPR({
        token: 'token',
        repo: 'user/repo',
        branch: 'main',
        domain: 'github.com',
      })

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.github.com/repos/user/repo/pulls'),
        expect.anything(),
      )
    })
  })

  describe('When multiple PRs exist for the branch', () => {
    it('Then returns the first PR', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { number: 10, html_url: 'https://github.com/user/repo/pull/10' },
          { number: 11, html_url: 'https://github.com/user/repo/pull/11' },
        ]),
      } as Response)

      const result = await findGitHubPR({
        token: 'token',
        repo: 'user/repo',
        branch: 'main',
      })

      expect(result?.number).toBe(10)
    })
  })
})

describe('Given findGitLabMR function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When an open MR exists for the branch', () => {
    it('Then returns MR number and URL', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { iid: 7, web_url: 'https://gitlab.com/user/repo/-/merge_requests/7' },
        ]),
      } as Response)

      const result = await findGitLabMR({
        token: 'test-token',
        repo: 'user/repo',
        branch: 'feature/my-branch',
      })

      expect(result).toEqual({
        number: 7,
        url: 'https://gitlab.com/user/repo/-/merge_requests/7',
        provider: 'gitlab',
      })
    })

    it('Then calls GitLab API with correct parameters', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { iid: 1, web_url: 'https://gitlab.com/user/repo/-/merge_requests/1' },
        ]),
      } as Response)

      await findGitLabMR({
        token: 'my-token',
        repo: 'user/repo',
        branch: 'main',
      })

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://gitlab.com/api/v4/projects/user%2Frepo/merge_requests'),
        expect.objectContaining({
          headers: {
            'PRIVATE-TOKEN': 'my-token',
          },
        }),
      )
    })

    it('Then encodes source branch in URL', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response)

      await findGitLabMR({
        token: 'token',
        repo: 'user/repo',
        branch: 'feature/special branch',
      })

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`source_branch=${encodeURIComponent('feature/special branch')}`),
        expect.anything(),
      )
    })
  })

  describe('When no open MR exists', () => {
    it('Then returns null', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response)

      const result = await findGitLabMR({
        token: 'token',
        repo: 'user/repo',
        branch: 'feature/no-mr',
      })

      expect(result).toBeNull()
    })
  })

  describe('When GitLab API returns an error', () => {
    it('Then returns null', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      } as Response)

      const result = await findGitLabMR({
        token: 'bad-token',
        repo: 'user/repo',
        branch: 'main',
      })

      expect(result).toBeNull()
    })

    it('Then logs warning with status', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      } as Response)
      const loggerSpy = vi.spyOn(logger, 'warn')

      await findGitLabMR({
        token: 'token',
        repo: 'user/repo',
        branch: 'main',
      })

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('GitLab API error (500)'))
    })
  })

  describe('When using custom domain', () => {
    it('Then uses custom GitLab domain', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response)

      await findGitLabMR({
        token: 'token',
        repo: 'user/repo',
        branch: 'main',
        domain: 'gitlab.company.com',
      })

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://gitlab.company.com/api/v4/projects/user%2Frepo/merge_requests'),
        expect.anything(),
      )
    })
  })
})

describe('Given detectPullRequest function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When CLI override --pr-number is provided', () => {
    it('Then returns GitHub PR info with override number', async () => {
      const config = createMockConfig({
        repo: {
          provider: 'github',
          domain: 'github.com',
          repo: 'user/repo',
        },
      })

      const result = await detectPullRequest({ config, prNumber: 99 })

      expect(result).toEqual({
        number: 99,
        url: 'https://github.com/user/repo/pull/99',
        provider: 'github',
      })
    })

    it('Then returns GitLab MR info with override number', async () => {
      const config = createMockConfig({
        repo: {
          provider: 'gitlab',
          domain: 'gitlab.com',
          repo: 'user/repo',
        },
      })

      const result = await detectPullRequest({ config, prNumber: 55 })

      expect(result).toEqual({
        number: 55,
        url: 'https://gitlab.com/user/repo/-/merge_requests/55',
        provider: 'gitlab',
      })
    })

    it('Then does not call any API', async () => {
      const config = createMockConfig({
        repo: {
          provider: 'github',
          domain: 'github.com',
          repo: 'user/repo',
        },
      })

      await detectPullRequest({ config, prNumber: 1 })

      expect(fetch).not.toHaveBeenCalled()
    })
  })

  describe('When detecting GitHub PR automatically', () => {
    it('Then queries GitHub API and returns PR info', async () => {
      const config = createMockConfig({
        repo: {
          provider: 'github',
          domain: 'github.com',
          repo: 'user/repo',
        },
        tokens: {
          github: 'gh-token',
        },
      })
      vi.mocked(execSync).mockReturnValue('feature/my-branch\n')
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { number: 42, html_url: 'https://github.com/user/repo/pull/42' },
        ]),
      } as Response)

      const result = await detectPullRequest({ config })

      expect(result).toEqual({
        number: 42,
        url: 'https://github.com/user/repo/pull/42',
        provider: 'github',
      })
    })

    it('Then returns null when no token is available', async () => {
      const config = createMockConfig({
        repo: {
          provider: 'github',
          domain: 'github.com',
          repo: 'user/repo',
        },
        tokens: {
          github: undefined,
        },
      })
      vi.mocked(execSync).mockReturnValue('main\n')

      const result = await detectPullRequest({ config })

      expect(result).toBeNull()
    })
  })

  describe('When detecting GitLab MR automatically', () => {
    it('Then queries GitLab API and returns MR info', async () => {
      const config = createMockConfig({
        repo: {
          provider: 'gitlab',
          domain: 'gitlab.com',
          repo: 'user/repo',
        },
        tokens: {
          gitlab: 'gl-token',
        },
      })
      vi.mocked(execSync).mockReturnValue('feature/my-branch\n')
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { iid: 7, web_url: 'https://gitlab.com/user/repo/-/merge_requests/7' },
        ]),
      } as Response)

      const result = await detectPullRequest({ config })

      expect(result).toEqual({
        number: 7,
        url: 'https://gitlab.com/user/repo/-/merge_requests/7',
        provider: 'gitlab',
      })
    })

    it('Then returns null when no token is available', async () => {
      const config = createMockConfig({
        repo: {
          provider: 'gitlab',
          domain: 'gitlab.com',
          repo: 'user/repo',
        },
        tokens: {
          gitlab: undefined,
        },
      })
      vi.mocked(execSync).mockReturnValue('main\n')

      const result = await detectPullRequest({ config })

      expect(result).toBeNull()
    })
  })

  describe('When no PR/MR is found', () => {
    it('Then returns null', async () => {
      const config = createMockConfig({
        repo: {
          provider: 'github',
          domain: 'github.com',
          repo: 'user/repo',
        },
        tokens: {
          github: 'token',
        },
      })
      vi.mocked(execSync).mockReturnValue('feature/no-pr\n')
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response)

      const result = await detectPullRequest({ config })

      expect(result).toBeNull()
    })
  })

  describe('When provider cannot be detected', () => {
    it('Then returns null', async () => {
      const config = createMockConfig({
        repo: undefined,
      })
      // Mock detectGitProvider to return null
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('git remote get-url')) {
          throw new Error('Not a git repository')
        }
        return ''
      })

      const result = await detectPullRequest({ config })

      expect(result).toBeNull()
    })
  })

  describe('When in detached HEAD state', () => {
    it('Then returns null', async () => {
      const config = createMockConfig({
        repo: {
          provider: 'github',
          domain: 'github.com',
          repo: 'user/repo',
        },
        tokens: {
          github: 'token',
        },
      })
      vi.mocked(execSync).mockReturnValue('HEAD\n')

      const result = await detectPullRequest({ config })

      expect(result).toBeNull()
      expect(fetch).not.toHaveBeenCalled()
    })
  })

  describe('When no repo config is available', () => {
    it('Then returns null', async () => {
      const config = createMockConfig({
        repo: {
          provider: 'github',
          domain: 'github.com',
        },
      })

      const result = await detectPullRequest({ config })

      expect(result).toBeNull()
    })
  })

  describe('When provider is unsupported for PR detection', () => {
    it('Then returns null for bitbucket', async () => {
      const config = createMockConfig({
        repo: {
          provider: 'bitbucket',
          domain: 'bitbucket.org',
          repo: 'user/repo',
        },
        tokens: {
          github: 'token',
        },
      })
      vi.mocked(execSync).mockReturnValue('main\n')

      const result = await detectPullRequest({ config })

      expect(result).toBeNull()
      expect(fetch).not.toHaveBeenCalled()
    })
  })

  describe('When using token from repo config', () => {
    it('Then falls back to repo token for GitHub', async () => {
      const config = createMockConfig({
        repo: {
          provider: 'github',
          domain: 'github.com',
          repo: 'user/repo',
          token: 'repo-token',
        },
        tokens: {
          github: undefined,
        },
      })
      vi.mocked(execSync).mockReturnValue('main\n')
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response)

      await detectPullRequest({ config })

      expect(fetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer repo-token',
          }),
        }),
      )
    })

    it('Then falls back to repo token for GitLab', async () => {
      const config = createMockConfig({
        repo: {
          provider: 'gitlab',
          domain: 'gitlab.com',
          repo: 'user/repo',
          token: 'repo-token',
        },
        tokens: {
          gitlab: undefined,
        },
      })
      vi.mocked(execSync).mockReturnValue('main\n')
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response)

      await detectPullRequest({ config })

      expect(fetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            'PRIVATE-TOKEN': 'repo-token',
          }),
        }),
      )
    })
  })
})
