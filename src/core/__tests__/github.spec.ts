import { createGithubRelease } from 'changelogen'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'

import { generateChangelog, getIndependentTag, getPackagesOrBumpedPackages, getRootPackage, isBumpedPackage, isPrerelease, loadRelizyConfig, readPackageJson, resolveTags } from '../../core'

import { github } from '../github'

vi.mock('changelogen', () => {
  return {
    createGithubRelease: vi.fn(),
  }
})

vi.mock('../repo', () => {
  return {
    getRootPackage: vi.fn(),
    readPackageJson: vi.fn(),
  }
})

vi.mock('../version', () => {
  return {
    isPrerelease: vi.fn(),
  }
})

vi.mock('../tags', () => {
  return {
    resolveTags: vi.fn(),
    getIndependentTag: vi.fn(),
  }
})

vi.mock('../utils', () => {
  return {
    getPackagesOrBumpedPackages: vi.fn(),
    isBumpedPackage: vi.fn(),
  }
})

vi.mock('../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config')>()
  return {
    ...actual,
    loadRelizyConfig: vi.fn(),
  }
})

vi.mock('../changelog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../changelog')>()
  return {
    ...actual,
    generateChangelog: vi.fn(),
  }
})

describe('Given github function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const config = createMockConfig({
      bump: { type: 'patch' },
      monorepo: { versionMode: 'unified' },
      repo: {
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      },
      tokens: {
        github: 'test-token',
      },
    })
    vi.mocked(loadRelizyConfig).mockResolvedValue(config)
    vi.mocked(readPackageJson).mockReturnValue({
      name: 'test',
      version: '1.0.0',
      path: '/root',
      private: false,
    })
    vi.mocked(getRootPackage).mockResolvedValue({
      name: 'test',
      version: '1.0.0',
      path: '/root',
      commits: [],
      fromTag: 'v0.9.0',
      private: false,
    })
    vi.mocked(resolveTags).mockResolvedValue({ from: 'v0.9.0', to: 'v1.0.0' })
    vi.mocked(generateChangelog).mockResolvedValue('## v1.0.0\n\n- Feature')
    vi.mocked(isPrerelease).mockReturnValue(false)
    vi.mocked(createGithubRelease).mockResolvedValue(undefined)
  })

  describe('When in unified mode', () => {
    it('Then creates single GitHub release', async () => {
      // console.log({ getRootPackage })
      await github({ force: false })

      expect(createGithubRelease).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'v0.0.0', to: 'v1.0.0' }),
        {
          tag_name: 'v1.0.0',
          name: 'v1.0.0',
          body: '- Feature',
          prerelease: false,
        },
      )
    })

    it('Then returns posted releases array', async () => {
      const result = await github({ force: false })

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
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

      await github({ bumpResult, force: false })

      expect(resolveTags).toHaveBeenCalledWith(
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

      await github({ bumpResult, force: false })

      expect(getRootPackage).not.toHaveBeenCalled()
    })

    it('Then marks as prerelease when version is prerelease', async () => {
      vi.mocked(isPrerelease).mockReturnValue(true)

      await github({ force: false })

      expect(createGithubRelease).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ prerelease: true }),
      )
    })
  })

  describe('When in dry-run mode', () => {
    it('Then skips actual GitHub release creation', async () => {
      await github({ dryRun: true, force: false })

      expect(createGithubRelease).not.toHaveBeenCalled()
    })

    it('Then returns posted releases array', async () => {
      const result = await github({ dryRun: true, force: false })

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
      const config = createMockConfig({
        bump: { type: 'patch' },
        monorepo: { versionMode: 'independent', packages: ['packages/*'] },
        repo: {
          provider: 'github',
          domain: 'github.com',
          repo: 'user/repo',
        },
        tokens: {
          github: 'test-token',
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([
        { ...createMockPackageInfo(), name: 'pkg-a', version: '1.0.0', path: '/pkg-a', commits: [], fromTag: 'pkg-a@0.9.0' },
        { ...createMockPackageInfo(), name: 'pkg-b', version: '2.0.0', path: '/pkg-b', commits: [], fromTag: 'pkg-b@1.9.0' },
      ])
      vi.mocked(getIndependentTag).mockImplementation(({ name, version }) => {
        return `${name}@${version}`
      })
      vi.mocked(isBumpedPackage).mockReturnValue(false)
    })

    it('Then creates releases for each package', async () => {
      await github({ force: false })

      expect(createGithubRelease).toHaveBeenCalledTimes(2)
    })

    it('Then uses independent tags for each package', async () => {
      await github({ force: false })

      expect(createGithubRelease).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'pkg-a@0.9.0', to: 'pkg-a@1.0.0' }),
        expect.objectContaining({ tag_name: 'pkg-a@1.0.0' }),
      )
      expect(createGithubRelease).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'pkg-b@1.9.0', to: 'pkg-b@2.0.0' }),
        expect.objectContaining({ tag_name: 'pkg-b@2.0.0' }),
      )
    })

    it('Then returns posted releases for all packages', async () => {
      const result = await github({ force: false })

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({ name: 'pkg-a', tag: 'pkg-a@1.0.0' })
      expect(result[1]).toMatchObject({ name: 'pkg-b', tag: 'pkg-b@2.0.0' })
    })

    it('Then uses newVersion from bumped packages', async () => {
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([
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
      vi.mocked(isBumpedPackage).mockReturnValue(true)

      await github({ force: false })

      expect(getIndependentTag).toHaveBeenCalledWith({
        name: 'pkg-a',
        version: '1.1.0',
      })
    })

    it('Then skips packages without from tag', async () => {
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([
        { ...createMockPackageInfo(), name: 'pkg-a', version: '1.0.0', path: '/pkg-a', commits: [], fromTag: '' },
        { ...createMockPackageInfo(), name: 'pkg-b', version: '2.0.0', path: '/pkg-b', commits: [], fromTag: 'pkg-b@1.9.0' },
      ])

      const result = await github({ force: false })

      expect(createGithubRelease).toHaveBeenCalledTimes(1)
      expect(result).toHaveLength(1)
    })

    it('Then uses HEAD as to tag in dry-run mode', async () => {
      await github({ dryRun: true, force: false })

      expect(generateChangelog).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true }),
      )
    })

    it('Then returns empty array when no packages to release', async () => {
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([])

      const result = await github({ force: false })

      expect(result).toHaveLength(0)
    })
  })

  describe('When missing repository config', () => {
    it('Then throws error in unified mode', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = undefined
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await expect(github({ force: false })).rejects.toThrow(
        'No repository configuration found. Please check your changelog config.',
      )
    })

    it('Then throws error in independent mode', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.monorepo = { versionMode: 'independent', packages: ['packages/*'] }
      config.repo = undefined
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await expect(github({ force: false })).rejects.toThrow(
        'No repository configuration found. Please check your changelog config.',
      )
    })
  })

  describe('When missing GitHub token', () => {
    it('Then throws error in unified mode', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        monorepo: { versionMode: 'independent', packages: ['packages/*'] },
        repo: {
          provider: 'github',
          domain: 'github.com',
          repo: 'user/repo',
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await expect(github({ force: false })).rejects.toThrow(
        'No GitHub token specified. Set GITHUB_TOKEN or GH_TOKEN environment variable.',
      )
    })

    it('Then throws error in independent mode', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        monorepo: { versionMode: 'independent', packages: ['packages/*'] },
        repo: {
          provider: 'github',
          domain: 'github.com',
          repo: 'user/repo',
        },
        tokens: {
          github: undefined,
          gitlab: undefined,
          twitter: { apiKey: undefined, apiSecret: undefined, accessToken: undefined, accessTokenSecret: undefined },
          slack: undefined,
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await expect(github({ force: false })).rejects.toThrow(
        'No GitHub token specified. Set GITHUB_TOKEN or GH_TOKEN environment variable.',
      )
    })

    it('Then accepts token from repo config', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        monorepo: { versionMode: 'independent', packages: ['packages/*'] },
        repo: {
          provider: 'github',
          domain: 'github.com',
          repo: 'user/repo',
          token: 'repo-token',
        },
        tokens: {
          github: undefined,
          gitlab: undefined,
          twitter: { apiKey: undefined, apiSecret: undefined, accessToken: undefined, accessTokenSecret: undefined },
          slack: undefined,
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await expect(github({ force: false })).resolves.not.toThrow()
    })
  })

  describe('When using custom from and to tags', () => {
    it('Then uses custom tags from options', async () => {
      await github({ from: 'v0.5.0', to: 'v1.5.0', force: false })

      expect(loadRelizyConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          overrides: expect.objectContaining({
            from: 'v0.5.0',
            to: 'v1.5.0',
          }),
        }),
      )
    })

    it('Then uses custom token from options', async () => {
      await github({ token: 'custom-token', force: false })

      expect(loadRelizyConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          overrides: expect.objectContaining({
            tokens: { github: 'custom-token' },
          }),
        }),
      )
    })
  })

  describe('When GitHub API fails', () => {
    it('Then throws error with details', async () => {
      const error = new Error('GitHub API error')
      vi.mocked(createGithubRelease).mockRejectedValue(error)

      await expect(github({ force: false })).rejects.toThrow('GitHub API error')
    })
  })

  describe('When package.json cannot be read', () => {
    it('Then throws error', async () => {
      vi.mocked(readPackageJson).mockReturnValue(undefined as any)

      await expect(github({ force: false })).rejects.toThrow('Failed to read root package.json')
    })
  })

  describe('When using config name option', () => {
    it('Then passes configName to loadRelizyConfig', async () => {
      await github({ configName: 'custom', force: false })

      expect(loadRelizyConfig).toHaveBeenCalledWith(
        expect.objectContaining({ configFile: 'custom' }),
      )
    })
  })

  describe('When using base config option', () => {
    it('Then passes base config to loadRelizyConfig', async () => {
      const baseConfig = createMockConfig({ bump: { type: 'minor' } })

      await github({ config: baseConfig, force: false })

      expect(loadRelizyConfig).toHaveBeenCalledWith(
        expect.objectContaining({ baseConfig }),
      )
    })
  })

  describe('When using force option', () => {
    it('Then passes force to getPackagesOrBumpedPackages in independent mode', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        monorepo: { versionMode: 'independent', packages: ['packages/*'] },
        repo: {
          provider: 'github',
          domain: 'github.com',
          repo: 'user/repo',
        },
        tokens: {
          github: 'test-token',
          gitlab: undefined,
          twitter: { apiKey: undefined, apiSecret: undefined, accessToken: undefined, accessTokenSecret: undefined },
          slack: undefined,
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([])

      await github({ force: true })

      expect(getPackagesOrBumpedPackages).toHaveBeenCalledWith(
        expect.objectContaining({ force: true }),
      )
    })

    it('Then passes force to getRootPackage in unified mode', async () => {
      await github({ force: true })

      expect(getRootPackage).toHaveBeenCalledWith(
        expect.objectContaining({ force: true }),
      )
    })
  })

  describe('When using suffix option', () => {
    it('Then passes suffix to getPackagesOrBumpedPackages in independent mode', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        monorepo: { versionMode: 'independent', packages: ['packages/*'] },
        repo: {
          provider: 'github',
          domain: 'github.com',
          repo: 'user/repo',
        },
        tokens: {
          github: 'test-token',
          gitlab: undefined,
          twitter: { apiKey: undefined, apiSecret: undefined, accessToken: undefined, accessTokenSecret: undefined },
          slack: undefined,
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([])

      await github({ suffix: 'beta', force: false })

      expect(getPackagesOrBumpedPackages).toHaveBeenCalledWith(
        expect.objectContaining({ suffix: 'beta' }),
      )
    })

    it('Then passes suffix to getRootPackage in unified mode', async () => {
      await github({ suffix: 'beta', force: false })

      expect(getRootPackage).toHaveBeenCalledWith(
        expect.objectContaining({ suffix: 'beta' }),
      )
    })
  })

  describe('When changelog generation succeeds', () => {
    it('Then strips first two lines from changelog for release body', async () => {
      vi.mocked(generateChangelog).mockResolvedValue(
        '## v1.0.0\n\nRelease notes here\n- Feature A\n- Feature B',
      )

      await github({ force: false })

      expect(createGithubRelease).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ body: 'Release notes here\n- Feature A\n- Feature B' }),
      )
    })
  })
})
