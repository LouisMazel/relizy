import { logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig } from '../../../tests/mocks'
import * as core from '../../core'
import { github } from '../github'

logger.setLevel('error')

vi.mock('changelogen', () => ({
  createGithubRelease: vi.fn(),
}))

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

const { createGithubRelease } = await import('changelogen')

describe('Given github function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const config = createMockConfig({ bump: { type: 'patch' } })
    config.repo = {
      provider: 'github',
      domain: 'github.com',
      repo: 'user/repo',
    }
    config.tokens = { github: 'test-token' }
    vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)
    vi.mocked(core.readPackageJson).mockReturnValue({
      name: 'test',
      version: '1.0.0',
      path: '/root',
    })
    vi.mocked(core.getRootPackage).mockResolvedValue({
      name: 'test',
      version: '1.0.0',
      path: '/root',
      commits: [],
    })
    vi.mocked(core.resolveTags).mockResolvedValue({ from: 'v0.9.0', to: 'v1.0.0' })
    vi.mocked(core.generateChangelog).mockResolvedValue('## v1.0.0\n\n- Feature')
    vi.mocked(core.isPrerelease).mockReturnValue(false)
    vi.mocked(createGithubRelease).mockResolvedValue(undefined)
  })

  describe('When in unified mode', () => {
    it('Then creates single GitHub release', async () => {
      await github({})

      expect(createGithubRelease).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'v0.9.0', to: 'v1.0.0' }),
        expect.objectContaining({ tag_name: 'v1.0.0', prerelease: false }),
      )
    })

    it('Then returns posted releases array', async () => {
      const result = await github({})

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
        bumped: true,
        fromTag: 'v1.0.0',
      }

      await github({ bumpResult })

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
      }
      const bumpResult = {
        newVersion: '2.0.0',
        bumpedPackages: [],
        rootPackage,
        bumped: true,
        fromTag: 'v1.0.0',
      }

      await github({ bumpResult })

      expect(core.getRootPackage).not.toHaveBeenCalled()
    })

    it('Then marks as prerelease when version is prerelease', async () => {
      vi.mocked(core.isPrerelease).mockReturnValue(true)

      await github({})

      expect(createGithubRelease).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ prerelease: true }),
      )
    })
  })

  describe('When in dry-run mode', () => {
    it('Then skips actual GitHub release creation', async () => {
      await github({ dryRun: true })

      expect(createGithubRelease).not.toHaveBeenCalled()
    })

    it('Then returns posted releases array', async () => {
      const result = await github({ dryRun: true })

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
      config.monorepo = { versionMode: 'independent' }
      config.repo = {
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      }
      config.tokens = { github: 'test-token' }
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(core.getPackagesOrBumpedPackages).mockResolvedValue([
        { name: 'pkg-a', version: '1.0.0', path: '/pkg-a', commits: [], fromTag: 'pkg-a@0.9.0' },
        { name: 'pkg-b', version: '2.0.0', path: '/pkg-b', commits: [], fromTag: 'pkg-b@1.9.0' },
      ])
      vi.mocked(core.getIndependentTag).mockImplementation(({ name, version }) => {
        return `${name}@${version}`
      })
      vi.mocked(core.isBumpedPackage).mockReturnValue(false)
    })

    it('Then creates releases for each package', async () => {
      await github({})

      expect(createGithubRelease).toHaveBeenCalledTimes(2)
    })

    it('Then uses independent tags for each package', async () => {
      await github({})

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
      const result = await github({})

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({ name: 'pkg-a', tag: 'pkg-a@1.0.0' })
      expect(result[1]).toMatchObject({ name: 'pkg-b', tag: 'pkg-b@2.0.0' })
    })

    it('Then uses newVersion from bumped packages', async () => {
      vi.mocked(core.getPackagesOrBumpedPackages).mockResolvedValue([
        {
          name: 'pkg-a',
          version: '1.0.0',
          newVersion: '1.1.0',
          path: '/pkg-a',
          commits: [],
          fromTag: 'pkg-a@1.0.0',
        },
      ])
      vi.mocked(core.isBumpedPackage).mockReturnValue(true)

      await github({})

      expect(core.getIndependentTag).toHaveBeenCalledWith({
        name: 'pkg-a',
        version: '1.1.0',
      })
    })

    it('Then skips packages without from tag', async () => {
      vi.mocked(core.getPackagesOrBumpedPackages).mockResolvedValue([
        { name: 'pkg-a', version: '1.0.0', path: '/pkg-a', commits: [] },
        { name: 'pkg-b', version: '2.0.0', path: '/pkg-b', commits: [], fromTag: 'pkg-b@1.9.0' },
      ])

      const result = await github({})

      expect(createGithubRelease).toHaveBeenCalledTimes(1)
      expect(result).toHaveLength(1)
    })

    it('Then uses HEAD as to tag in dry-run mode', async () => {
      await github({ dryRun: true })

      expect(core.generateChangelog).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true }),
      )
    })

    it('Then returns empty array when no packages to release', async () => {
      vi.mocked(core.getPackagesOrBumpedPackages).mockResolvedValue([])

      const result = await github({})

      expect(result).toHaveLength(0)
    })
  })

  describe('When missing repository config', () => {
    it('Then throws error in unified mode', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = undefined
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)

      await expect(github({})).rejects.toThrow(
        'No repository configuration found. Please check your changelog config.',
      )
    })

    it('Then throws error in independent mode', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.monorepo = { versionMode: 'independent' }
      config.repo = undefined
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)

      await expect(github({})).rejects.toThrow(
        'No repository configuration found. Please check your changelog config.',
      )
    })
  })

  describe('When missing GitHub token', () => {
    it('Then throws error in unified mode', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      }
      config.tokens = {}
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)

      await expect(github({})).rejects.toThrow(
        'No GitHub token specified. Set GITHUB_TOKEN or GH_TOKEN environment variable.',
      )
    })

    it('Then throws error in independent mode', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.monorepo = { versionMode: 'independent' }
      config.repo = {
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      }
      config.tokens = {}
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)

      await expect(github({})).rejects.toThrow(
        'No GitHub token specified. Set GITHUB_TOKEN or GH_TOKEN environment variable.',
      )
    })

    it('Then accepts token from repo config', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.repo = {
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
        token: 'repo-token',
      }
      config.tokens = {}
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)

      await expect(github({})).resolves.not.toThrow()
    })
  })

  describe('When using custom from and to tags', () => {
    it('Then uses custom tags from options', async () => {
      await github({ from: 'v0.5.0', to: 'v1.5.0' })

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
      await github({ token: 'custom-token' })

      expect(core.loadRelizyConfig).toHaveBeenCalledWith(
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

      await expect(github({})).rejects.toThrow('GitHub API error')
    })
  })

  describe('When package.json cannot be read', () => {
    it('Then throws error', async () => {
      vi.mocked(core.readPackageJson).mockReturnValue(null)

      await expect(github({})).rejects.toThrow('Failed to read root package.json')
    })
  })

  describe('When using config name option', () => {
    it('Then passes configName to loadRelizyConfig', async () => {
      await github({ configName: 'custom' })

      expect(core.loadRelizyConfig).toHaveBeenCalledWith(
        expect.objectContaining({ configName: 'custom' }),
      )
    })
  })

  describe('When using base config option', () => {
    it('Then passes base config to loadRelizyConfig', async () => {
      const baseConfig = createMockConfig({ bump: { type: 'minor' } })

      await github({ config: baseConfig })

      expect(core.loadRelizyConfig).toHaveBeenCalledWith(
        expect.objectContaining({ baseConfig }),
      )
    })
  })

  describe('When using force option', () => {
    it('Then passes force to getPackagesOrBumpedPackages in independent mode', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.monorepo = { versionMode: 'independent' }
      config.repo = {
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      }
      config.tokens = { github: 'test-token' }
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(core.getPackagesOrBumpedPackages).mockResolvedValue([])

      await github({ force: true })

      expect(core.getPackagesOrBumpedPackages).toHaveBeenCalledWith(
        expect.objectContaining({ force: true }),
      )
    })

    it('Then passes force to getRootPackage in unified mode', async () => {
      await github({ force: true })

      expect(core.getRootPackage).toHaveBeenCalledWith(
        expect.objectContaining({ force: true }),
      )
    })
  })

  describe('When using suffix option', () => {
    it('Then passes suffix to getPackagesOrBumpedPackages in independent mode', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.monorepo = { versionMode: 'independent' }
      config.repo = {
        provider: 'github',
        domain: 'github.com',
        repo: 'user/repo',
      }
      config.tokens = { github: 'test-token' }
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(core.getPackagesOrBumpedPackages).mockResolvedValue([])

      await github({ suffix: 'beta' })

      expect(core.getPackagesOrBumpedPackages).toHaveBeenCalledWith(
        expect.objectContaining({ suffix: 'beta' }),
      )
    })

    it('Then passes suffix to getRootPackage in unified mode', async () => {
      await github({ suffix: 'beta' })

      expect(core.getRootPackage).toHaveBeenCalledWith(
        expect.objectContaining({ suffix: 'beta' }),
      )
    })
  })

  describe('When changelog generation succeeds', () => {
    it('Then strips first two lines from changelog for release body', async () => {
      vi.mocked(core.generateChangelog).mockResolvedValue(
        '## v1.0.0\n\nRelease notes here\n- Feature A\n- Feature B',
      )

      await github({})

      expect(createGithubRelease).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ body: 'Release notes here\n- Feature A\n- Feature B' }),
      )
    })
  })
})
