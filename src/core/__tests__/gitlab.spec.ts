import { execPromise, logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import * as core from '../../core'
import { createGitlabRelease, gitlab } from '../gitlab'

logger.setLevel('error')

vi.mock('@maz-ui/node', async () => {
  const actual = await vi.importActual('@maz-ui/node')
  return {
    ...actual,
    execPromise: vi.fn(),
  }
})

vi.mock('../../core', async () => {
  const actual = await vi.importActual('../../core')
  return {
    ...actual,
    loadRelizyConfig: vi.fn(),
    readPackageJson: vi.fn(),
    getRootPackage: vi.fn(),
    resolveTags: vi.fn(),
    getPackagesOrBumpedPackages: vi.fn(),
    generateChangelog: vi.fn(),
    isPrerelease: vi.fn(),
    getIndependentTag: vi.fn(),
    isBumpedPackage: vi.fn(),
  }
})

globalThis.fetch = vi.fn()

describe('Given createGitlabRelease function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        tag_name: 'v1.0.0',
        name: 'v1.0.0',
        description: 'Release notes',
        created_at: '2024-01-01T00:00:00Z',
        released_at: '2024-01-01T00:00:00Z',
        _links: { self: 'https://gitlab.com/api/v4/projects/user%2Frepo/releases/v1.0.0' },
      }),
    } as Response)
  })

  describe('When creating release with valid config', () => {
    it('Then posts to GitLab API', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.tokens = {
        gitlab: 'test-token',
        github: undefined,
        twitter: { apiKey: undefined, apiSecret: undefined, accessToken: undefined, accessTokenSecret: undefined },
        slack: undefined,
      }
      config.repo = {
        provider: 'gitlab',
        domain: 'gitlab.com',
        repo: 'user/repo',
      }

      await createGitlabRelease({
        config,
        release: {
          tag_name: 'v1.0.0',
          name: 'v1.0.0',
          description: 'Release notes',
        },
      })

      expect(fetch).toHaveBeenCalledWith(
        'https://gitlab.com/api/v4/projects/user%2Frepo/releases',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'PRIVATE-TOKEN': 'test-token',
          },
        }),
      )
    })

    it('Then returns release response', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.tokens = {
        gitlab: 'test-token',
        github: undefined,
        twitter: { apiKey: undefined, apiSecret: undefined, accessToken: undefined, accessTokenSecret: undefined },
        slack: undefined,
      }
      config.repo = {
        provider: 'gitlab',
        domain: 'gitlab.com',
        repo: 'user/repo',
      }

      const result = await createGitlabRelease({
        config,
        release: {
          tag_name: 'v1.0.0',
          name: 'v1.0.0',
          description: 'Release notes',
        },
      })

      expect(result).toMatchObject({
        tag_name: 'v1.0.0',
        name: 'v1.0.0',
        _links: expect.any(Object),
      })
    })

    it('Then uses custom domain when provided', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.tokens = {
        gitlab: 'test-token',
        github: undefined,
        twitter: { apiKey: undefined, apiSecret: undefined, accessToken: undefined, accessTokenSecret: undefined },
        slack: undefined,
      }
      config.repo = {
        provider: 'gitlab',
        domain: 'gitlab.example.com',
        repo: 'user/repo',
      }

      await createGitlabRelease({
        config,
        release: {
          tag_name: 'v1.0.0',
          name: 'v1.0.0',
          description: 'Release notes',
        },
      })

      expect(fetch).toHaveBeenCalledWith(
        'https://gitlab.example.com/api/v4/projects/user%2Frepo/releases',
        expect.anything(),
      )
    })

    it('Then defaults domain to gitlab.com', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.tokens = {
        gitlab: 'test-token',
        github: undefined,
        twitter: { apiKey: undefined, apiSecret: undefined, accessToken: undefined, accessTokenSecret: undefined },
        slack: undefined,
      }
      config.repo = {
        provider: 'gitlab',
        repo: 'user/repo',
      }

      await createGitlabRelease({
        config,
        release: {
          tag_name: 'v1.0.0',
          name: 'v1.0.0',
          description: 'Release notes',
        },
      })

      expect(fetch).toHaveBeenCalledWith(
        'https://gitlab.com/api/v4/projects/user%2Frepo/releases',
        expect.anything(),
      )
    })

    it('Then uses token from repo config when tokens.gitlab not set', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.tokens = {
        gitlab: undefined,
        github: undefined,
        twitter: { apiKey: undefined, apiSecret: undefined, accessToken: undefined, accessTokenSecret: undefined },
        slack: undefined,
      }
      config.repo = {
        provider: 'gitlab',
        domain: 'gitlab.com',
        repo: 'user/repo',
        token: 'repo-token',
      }

      await createGitlabRelease({
        config,
        release: {
          tag_name: 'v1.0.0',
          name: 'v1.0.0',
          description: 'Release notes',
        },
      })

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

  describe('When in dry-run mode', () => {
    it('Then skips API call and returns mock response', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.tokens = {
        gitlab: 'test-token',
        github: undefined,
        twitter: { apiKey: undefined, apiSecret: undefined, accessToken: undefined, accessTokenSecret: undefined },
        slack: undefined,
      }
      config.repo = {
        provider: 'gitlab',
        domain: 'gitlab.com',
        repo: 'user/repo',
      }

      const result = await createGitlabRelease({
        config,
        release: {
          tag_name: 'v1.0.0',
          name: 'v1.0.0',
          description: 'Release notes',
        },
        dryRun: true,
      })

      expect(fetch).not.toHaveBeenCalled()
      expect(result).toMatchObject({
        tag_name: 'v1.0.0',
        name: 'v1.0.0',
        description: 'Release notes',
        _links: expect.any(Object),
      })
    })
  })

  describe('When missing token', () => {
    it('Then throws error', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.tokens = {
        gitlab: undefined,
        github: undefined,
        twitter: { apiKey: undefined, apiSecret: undefined, accessToken: undefined, accessTokenSecret: undefined },
        slack: undefined,
      }
      config.repo = {
        provider: 'gitlab',
        domain: 'gitlab.com',
        repo: 'user/repo',
      }

      await expect(
        createGitlabRelease({
          config,
          release: {
            tag_name: 'v1.0.0',
            name: 'v1.0.0',
            description: 'Release notes',
          },
        }),
      ).rejects.toThrow(
        'No GitLab token found. Set GITLAB_TOKEN or CI_JOB_TOKEN environment variable',
      )
    })

    it('Then allows missing token in dry-run mode', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.tokens = {
        gitlab: undefined,
        github: undefined,
        twitter: { apiKey: undefined, apiSecret: undefined, accessToken: undefined, accessTokenSecret: undefined },
        slack: undefined,
      }
      config.repo = {
        provider: 'gitlab',
        domain: 'gitlab.com',
        repo: 'user/repo',
      }

      await expect(
        createGitlabRelease({
          config,
          release: {
            tag_name: 'v1.0.0',
            name: 'v1.0.0',
            description: 'Release notes',
          },
          dryRun: true,
        }),
      ).resolves.toBeDefined()
    })
  })

  describe('When missing repository config', () => {
    it('Then throws error', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.tokens = {
        gitlab: 'test-token',
        github: undefined,
        twitter: { apiKey: undefined, apiSecret: undefined, accessToken: undefined, accessTokenSecret: undefined },
        slack: undefined,
      }
      config.repo = {
        provider: 'gitlab',
        domain: 'gitlab.com',
      }

      await expect(
        createGitlabRelease({
          config,
          release: {
            tag_name: 'v1.0.0',
            name: 'v1.0.0',
            description: 'Release notes',
          },
        }),
      ).rejects.toThrow('No repository URL found in config')
    })
  })

  describe('When GitLab API fails', () => {
    it('Then throws error with API response', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.tokens = {
        gitlab: 'test-token',
        github: undefined,
        twitter: { apiKey: undefined, apiSecret: undefined, accessToken: undefined, accessTokenSecret: undefined },
        slack: undefined,
      }
      config.repo = {
        provider: 'gitlab',
        domain: 'gitlab.com',
        repo: 'user/repo',
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      } as Response)

      await expect(
        createGitlabRelease({
          config,
          release: {
            tag_name: 'v1.0.0',
            name: 'v1.0.0',
            description: 'Release notes',
          },
        }),
      ).rejects.toThrow('GitLab API error (401): Unauthorized')
    })
  })

  describe('When release has optional fields', () => {
    it('Then includes ref in payload', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.tokens = {
        gitlab: 'test-token',
        github: undefined,
        twitter: { apiKey: undefined, apiSecret: undefined, accessToken: undefined, accessTokenSecret: undefined },
        slack: undefined,
      }
      config.repo = {
        provider: 'gitlab',
        domain: 'gitlab.com',
        repo: 'user/repo',
      }

      await createGitlabRelease({
        config,
        release: {
          tag_name: 'v1.0.0',
          name: 'v1.0.0',
          description: 'Release notes',
          ref: 'main',
        },
      })

      expect(fetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.stringContaining('"ref":"main"'),
        }),
      )
    })

    it('Then defaults ref to main when not provided', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.tokens = {
        gitlab: 'test-token',
        github: undefined,
        twitter: { apiKey: undefined, apiSecret: undefined, accessToken: undefined, accessTokenSecret: undefined },
        slack: undefined,
      }
      config.repo = {
        provider: 'gitlab',
        domain: 'gitlab.com',
        repo: 'user/repo',
      }

      await createGitlabRelease({
        config,
        release: {
          tag_name: 'v1.0.0',
          name: 'v1.0.0',
          description: 'Release notes',
        },
      })

      expect(fetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.stringContaining('"ref":"main"'),
        }),
      )
    })
  })
})

describe('Given gitlab function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const config = createMockConfig({ bump: { type: 'patch' } })
    config.repo = {
      provider: 'gitlab',
      domain: 'gitlab.com',
      repo: 'user/repo',
    }
    config.tokens = {
      gitlab: 'test-token',
      github: undefined,
      twitter: { apiKey: undefined, apiSecret: undefined, accessToken: undefined, accessTokenSecret: undefined },
      slack: undefined,
    }
    vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)
    vi.mocked(core.readPackageJson).mockReturnValue({
      name: 'test',
      version: '1.0.0',
      path: '/root',
      private: false,
    })
    vi.mocked(core.getRootPackage).mockResolvedValue({
      name: 'test',
      version: '1.0.0',
      path: '/root',
      commits: [],
      fromTag: 'v0.9.0',
      private: false,
    })
    vi.mocked(core.resolveTags).mockResolvedValue({ from: 'v0.9.0', to: 'v1.0.0' })
    vi.mocked(core.generateChangelog).mockResolvedValue('## v1.0.0\n\n- Feature')
    vi.mocked(core.isPrerelease).mockReturnValue(false)
    vi.mocked(execPromise).mockResolvedValue({ stdout: 'main', stderr: '' })
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        tag_name: 'v1.0.0',
        name: 'v1.0.0',
        description: 'Release notes',
        created_at: '2024-01-01T00:00:00Z',
        released_at: '2024-01-01T00:00:00Z',
        _links: { self: 'https://gitlab.com/api/v4/projects/user%2Frepo/releases/v1.0.0' },
      }),
    } as Response)
  })

  describe('When in unified mode', () => {
    it('Then creates single GitLab release', async () => {
      await gitlab({ force: false })

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v4/projects/user%2Frepo/releases'),
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('Then gets current branch for ref', async () => {
      await gitlab({ force: false })

      expect(execPromise).toHaveBeenCalledWith(
        'git rev-parse --abbrev-ref HEAD',
        expect.any(Object),
      )
    })

    it('Then returns posted releases array', async () => {
      const result = await gitlab({ force: false })

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        name: 'v1.0.0',
        tag: 'v1.0.0',
        version: 'v1.0.0',
        prerelease: false,
      })
    })

    it('Then uses bumpResult version when provided', async () => {
      const bumpResult = {
        newVersion: '2.0.0',
        bumpedPackages: [],
        bumped: true as const,
        fromTag: 'v1.0.0',
      }

      await gitlab({ bumpResult, force: false })

      expect(core.resolveTags).toHaveBeenCalledWith(
        expect.objectContaining({ newVersion: '2.0.0' }),
      )
    })

    it('Then uses rootPackage from bumpResult when provided', async () => {
      const rootPackage = {
        name: 'test',
        version: '2.0.0',
        path: '/root',
        commits: [],
        fromTag: 'v1.0.0',
        private: false,
      }
      const bumpResult = {
        newVersion: '2.0.0',
        bumpedPackages: [],
        rootPackage,
        bumped: true as const,
        fromTag: 'v1.0.0',
      }

      await gitlab({ bumpResult, force: false })

      expect(core.getRootPackage).not.toHaveBeenCalled()
    })

    it('Then uses newVersion from rootPackage when no bumpResult', async () => {
      vi.mocked(core.getRootPackage).mockResolvedValue({
        name: 'test',
        version: '1.0.0',
        newVersion: '1.1.0',
        path: '/root',
        commits: [],
        fromTag: 'v1.0.0',
        private: false,
      })

      await gitlab({ force: false })

      expect(core.generateChangelog).toHaveBeenCalledWith(
        expect.objectContaining({ newVersion: '1.1.0' }),
      )
    })

    it('Then marks as prerelease when version is prerelease', async () => {
      vi.mocked(core.isPrerelease).mockReturnValue(true)

      const result = await gitlab({ force: false })

      expect(result[0].prerelease).toBe(true)
    })
  })

  describe('When in dry-run mode', () => {
    it('Then skips actual GitLab release creation', async () => {
      vi.mocked(fetch).mockClear()

      await gitlab({ dryRun: true })

      expect(fetch).not.toHaveBeenCalled()
    })

    it('Then returns posted releases array', async () => {
      const result = await gitlab({ dryRun: true, force: false })

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        name: 'v1.0.0',
        tag: 'v1.0.0',
        version: 'v1.0.0',
      })
    })
  })

  describe('When in independent mode', () => {
    beforeEach(() => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.monorepo = { versionMode: 'independent', packages: ['packages/*'] }
      config.repo = {
        provider: 'gitlab',
        domain: 'gitlab.com',
        repo: 'user/repo',
      }
      config.tokens = {
        gitlab: 'test-token',
        github: undefined,
        twitter: { apiKey: undefined, apiSecret: undefined, accessToken: undefined, accessTokenSecret: undefined },
        slack: undefined,
      }
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(core.getPackagesOrBumpedPackages).mockResolvedValue([
        { ...createMockPackageInfo(), name: 'pkg-a', version: '1.0.0', path: '/pkg-a', commits: [], fromTag: 'pkg-a@0.9.0' },
        { ...createMockPackageInfo(), name: 'pkg-b', version: '2.0.0', path: '/pkg-b', commits: [], fromTag: 'pkg-b@1.9.0' },
      ])
      vi.mocked(core.getIndependentTag).mockImplementation(({ name, version }) => {
        return `${name}@${version}`
      })
      vi.mocked(core.isBumpedPackage).mockReturnValue(false)
    })

    it('Then creates releases for each package', async () => {
      await gitlab({ force: false })

      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it('Then uses independent tags for each package', async () => {
      await gitlab({ force: false })

      const calls = vi.mocked(fetch).mock.calls
      expect(calls[0][1]?.body).toContain('"tag_name":"pkg-a@1.0.0"')
      expect(calls[1][1]?.body).toContain('"tag_name":"pkg-b@2.0.0"')
    })

    it('Then returns posted releases for all packages', async () => {
      const result = await gitlab({ force: false })

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({ name: 'pkg-a', tag: 'pkg-a@1.0.0' })
      expect(result[1]).toMatchObject({ name: 'pkg-b', tag: 'pkg-b@2.0.0' })
    })

    it('Then uses newVersion from bumped packages', async () => {
      vi.mocked(core.getPackagesOrBumpedPackages).mockResolvedValue([
        {
          ...createMockPackageInfo(),
          name: 'pkg-a',
          version: '1.0.0',
          newVersion: '1.1.0',
          path: '/pkg-a',
          commits: [],
          fromTag: 'pkg-a@1.0.0',
        },
      ])
      vi.mocked(core.isBumpedPackage).mockReturnValue(true)

      await gitlab({ force: false })

      expect(core.getIndependentTag).toHaveBeenCalledWith({
        name: 'pkg-a',
        version: '1.1.0',
      })
    })

    it('Then skips packages without from tag', async () => {
      vi.mocked(core.getPackagesOrBumpedPackages).mockResolvedValue([
        { ...createMockPackageInfo(), name: 'pkg-a', version: '1.0.0', path: '/pkg-a', commits: [], fromTag: '' },
        { ...createMockPackageInfo(), name: 'pkg-b', version: '2.0.0', path: '/pkg-b', commits: [], fromTag: 'pkg-b@1.9.0' },
      ])

      const result = await gitlab({ force: false })

      expect(fetch).toHaveBeenCalledTimes(1)
      expect(result).toHaveLength(1)
    })

    it('Then skips packages with empty changelog', async () => {
      vi.mocked(core.getPackagesOrBumpedPackages).mockResolvedValue([
        { ...createMockPackageInfo(), name: 'pkg-a', version: '1.0.0', path: '/pkg-a', commits: [], fromTag: 'pkg-a@0.9.0' },
        { ...createMockPackageInfo(), name: 'pkg-b', version: '2.0.0', path: '/pkg-b', commits: [], fromTag: 'pkg-b@1.9.0' },
      ])
      vi.mocked(core.generateChangelog).mockResolvedValueOnce(null as any)
      vi.mocked(core.generateChangelog).mockResolvedValueOnce('## v2.0.0\n\n- Feature')

      const result = await gitlab({ force: false })

      expect(fetch).toHaveBeenCalledTimes(1)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('pkg-b')
    })

    it('Then returns empty array when no packages to release', async () => {
      vi.mocked(core.getPackagesOrBumpedPackages).mockResolvedValue([])

      const result = await gitlab({ force: false })

      expect(result).toHaveLength(0)
    })

    it('Then gets current branch for each release', async () => {
      await gitlab({ force: false })

      expect(execPromise).toHaveBeenCalledWith(
        'git rev-parse --abbrev-ref HEAD',
        expect.any(Object),
      )
    })
  })

  describe('When package.json cannot be read', () => {
    it('Then throws error', async () => {
      vi.mocked(core.readPackageJson).mockReturnValue(undefined as any)

      await expect(gitlab({})).rejects.toThrow('Failed to read root package.json')
    })
  })

  describe('When using config name option', () => {
    it('Then passes configName to loadRelizyConfig', async () => {
      await gitlab({ configName: 'custom', force: false })

      expect(core.loadRelizyConfig).toHaveBeenCalledWith(
        expect.objectContaining({ configName: 'custom' }),
      )
    })
  })

  describe('When using base config option', () => {
    it('Then passes base config to loadRelizyConfig', async () => {
      const baseConfig = createMockConfig({ bump: { type: 'minor' } })

      await gitlab({ config: baseConfig, force: false })

      expect(core.loadRelizyConfig).toHaveBeenCalledWith(
        expect.objectContaining({ baseConfig }),
      )
    })
  })

  describe('When using force option', () => {
    it('Then passes force to getPackagesOrBumpedPackages in independent mode', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.monorepo = { versionMode: 'independent', packages: ['packages/*'] }
      config.repo = {
        provider: 'gitlab',
        domain: 'gitlab.com',
        repo: 'user/repo',
      }
      config.tokens = {
        gitlab: 'test-token',
        github: undefined,
        twitter: { apiKey: undefined, apiSecret: undefined, accessToken: undefined, accessTokenSecret: undefined },
        slack: undefined,
      }
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(core.getPackagesOrBumpedPackages).mockResolvedValue([])

      await gitlab({ force: true })

      expect(core.getPackagesOrBumpedPackages).toHaveBeenCalledWith(
        expect.objectContaining({ force: true }),
      )
    })

    it('Then passes force to getRootPackage in unified mode', async () => {
      await gitlab({ force: true })

      expect(core.getRootPackage).toHaveBeenCalledWith(
        expect.objectContaining({ force: true }),
      )
    })
  })

  describe('When using suffix option', () => {
    it('Then passes suffix to getPackagesOrBumpedPackages in independent mode', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.monorepo = { versionMode: 'independent', packages: ['packages/*'] }
      config.repo = {
        provider: 'gitlab',
        domain: 'gitlab.com',
        repo: 'user/repo',
      }
      config.tokens = {
        gitlab: 'test-token',
        github: undefined,
        twitter: { apiKey: undefined, apiSecret: undefined, accessToken: undefined, accessTokenSecret: undefined },
        slack: undefined,
      }
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(core.getPackagesOrBumpedPackages).mockResolvedValue([])

      await gitlab({ suffix: 'beta', force: false })

      expect(core.getPackagesOrBumpedPackages).toHaveBeenCalledWith(
        expect.objectContaining({ suffix: 'beta' }),
      )
    })

    it('Then passes suffix to getRootPackage in unified mode', async () => {
      await gitlab({ suffix: 'beta', force: false })

      expect(core.getRootPackage).toHaveBeenCalledWith(
        expect.objectContaining({ suffix: 'beta' }),
      )
    })
  })

  describe('When using custom from and to tags', () => {
    it('Then uses custom tags from options', async () => {
      await gitlab({ from: 'v0.5.0', to: 'v1.5.0' })

      expect(core.loadRelizyConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          overrides: expect.objectContaining({
            from: 'v0.5.0',
            to: 'v1.5.0',
          }),
        }),
      )
    })

    it('Then uses custom token from options', async () => {
      await gitlab({ token: 'custom-token' })

      expect(core.loadRelizyConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          overrides: expect.objectContaining({
            tokens: { gitlab: 'custom-token' },
          }),
        }),
      )
    })
  })

  describe('When GitLab API fails', () => {
    it('Then throws error with details', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      } as Response)

      await expect(gitlab({})).rejects.toThrow()
    })
  })

  describe('When changelog generation succeeds', () => {
    it('Then strips first two lines from changelog for release description', async () => {
      vi.mocked(core.generateChangelog).mockResolvedValue(
        '## v1.0.0\n\nRelease notes here\n- Feature A\n- Feature B',
      )

      await gitlab({ force: false })

      const call = vi.mocked(fetch).mock.calls[0]
      const body = JSON.parse(call[1]?.body as string)
      expect(body.description).toBe('Release notes here\n- Feature A\n- Feature B')
    })
  })

  describe('When log level is set', () => {
    it('Then passes log level to loadRelizyConfig', async () => {
      await gitlab({ logLevel: 'debug' })

      expect(core.loadRelizyConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          overrides: expect.objectContaining({
            logLevel: 'debug',
          }),
        }),
      )
    })
  })
})
