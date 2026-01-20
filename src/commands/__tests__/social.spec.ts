import { logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig } from '../../../tests/mocks'
import { executeHook, generateChangelog, getPackagesOrBumpedPackages, getRootPackage, getSlackToken, getTwitterCredentials, isPrerelease, loadRelizyConfig, postReleaseToSlack, postReleaseToTwitter, resolveTags } from '../../core'
import { social, socialSafetyCheck } from '../social'

vi.mock('../../core', () => ({
  loadRelizyConfig: vi.fn(),
  getPackagesOrBumpedPackages: vi.fn(),
  executeHook: vi.fn(),
  getRootPackage: vi.fn(),
  resolveTags: vi.fn(),
  generateChangelog: vi.fn(),
  isPrerelease: vi.fn(),
  getTwitterCredentials: vi.fn(),
  postReleaseToTwitter: vi.fn(),
  getSlackToken: vi.fn(),
  postReleaseToSlack: vi.fn(),
  readPackageJson: vi.fn().mockReturnValue({ name: 'test-package' }),
  getReleaseUrl: vi.fn().mockReturnValue('https://example.com/release'),
  extractChangelogSummary: vi.fn().mockReturnValue('Summary of changes'),
  getIndependentTag: vi.fn(),
}))

describe('Given socialSafetyCheck function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When Twitter is enabled without credentials', () => {
    it('Then exits with error', () => {
      const loggerErrorSpy = vi.spyOn(logger, 'error')
      const config = createMockConfig({
        bump: { type: 'patch' },
        social: {
          twitter: { enabled: true, onlyStable: true },
          slack: { enabled: false, onlyStable: true },
        },
        tokens: {
          gitlab: undefined,
          github: undefined,
          twitter: {
            apiKey: undefined,
            apiKeySecret: undefined,
            accessToken: undefined,
            accessTokenSecret: undefined,
          },
          slack: undefined,
        },
      })
      vi.mocked(getTwitterCredentials).mockReturnValue(null)

      expect(() => socialSafetyCheck({ config })).rejects.toThrowError('Error during social safety check: Twitter credentials not found')

      expect(loggerErrorSpy).toHaveBeenCalledWith('Error during social safety check:', 'Twitter credentials not found')
    })
  })

  describe('When Slack is enabled without token', () => {
    it('Then exits with error', () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        social: {
          twitter: { enabled: false, onlyStable: true },
          slack: { enabled: true, onlyStable: true },
        },
      })
      vi.mocked(getSlackToken).mockReturnValue(null)

      expect(() => socialSafetyCheck({ config })).rejects.toThrowError('Error during social safety check: Slack credentials not found')
    })
  })

  describe('When credentials are provided', () => {
    it('Then does not log warning', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        social: {
          twitter: { enabled: true, onlyStable: true },
          slack: { enabled: false, onlyStable: true },
        },
        tokens: {
          twitter: {
            apiKey: 'key',
            apiKeySecret: 'secret',
            accessToken: 'token',
            accessTokenSecret: 'token-secret',
          },
        },
      })
      vi.mocked(getTwitterCredentials).mockReturnValue({
        apiKey: 'key',
        apiKeySecret: 'secret',
        accessToken: 'token',
        accessTokenSecret: 'token-secret',
      })

      await socialSafetyCheck({ config })

      expect(getTwitterCredentials).toHaveBeenCalled()
    })
  })

  describe('When safety check is disabled', () => {
    it('Then returns early without checking', async () => {
      const config = createMockConfig({ bump: { type: 'patch' }, safetyCheck: false, social: { twitter: { enabled: true }, slack: { enabled: true } } })

      await socialSafetyCheck({ config })

      expect(getTwitterCredentials).not.toHaveBeenCalled()
    })
  })
})

describe('Given social command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const config = createMockConfig({ bump: { type: 'patch' }, social: { twitter: { enabled: false, onlyStable: true } } })
    vi.mocked(loadRelizyConfig).mockResolvedValue(config)
    vi.mocked(executeHook).mockResolvedValue(undefined)
    vi.mocked(postReleaseToTwitter).mockResolvedValue(undefined)
    vi.mocked(postReleaseToSlack).mockResolvedValue(undefined)
    vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([])
    vi.mocked(getRootPackage).mockResolvedValue({
      name: 'test',
      version: '1.0.0',
      path: '/root',
      private: false,
      fromTag: 'v0.9.0',
      commits: [],
    })
    vi.mocked(resolveTags).mockResolvedValue({ from: 'v0.9.0', to: 'v1.0.0' })
    vi.mocked(generateChangelog).mockResolvedValue('## v1.0.0\n\n- Feature')
    vi.mocked(isPrerelease).mockReturnValue(false)
    vi.mocked(getTwitterCredentials).mockReturnValue({
      apiKey: 'key',
      apiKeySecret: 'secret',
      accessToken: 'token',
      accessTokenSecret: 'secret',
    })
    vi.mocked(getSlackToken).mockReturnValue('slack-token')
  })

  describe('When posting to Twitter', () => {
    it('Then loads config and executes hooks', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        social: {
          twitter: { enabled: true, onlyStable: true },
          slack: { enabled: false, onlyStable: true },
        },
        tokens: {
          gitlab: undefined,
          github: undefined,
          twitter: {
            apiKey: 'key',
            apiKeySecret: 'secret',
            accessToken: 'token',
            accessTokenSecret: 'secret',
          },
          slack: undefined,
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await social({
        bumpResult: {
          bumped: true,
          bumpedPackages: [],
        },
      })

      expect(loadRelizyConfig).toHaveBeenCalled()
      expect(executeHook).toHaveBeenCalledWith('before:social', expect.any(Object), false)
    })

    it('Then posts to Twitter', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        tokens: { github: 'test-token', twitter: {
          apiKey: 'key',
          apiKeySecret: 'secret',
          accessToken: 'token',
          accessTokenSecret: 'secret',
        } },
        social: {
          twitter: { enabled: true, onlyStable: true },
          slack: { enabled: false, onlyStable: true },
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await social({
        bumpResult: {
          bumped: true,
          bumpedPackages: [],
        },
      })

      expect(postReleaseToTwitter).toHaveBeenCalled()
    })
  })

  describe('When posting to Slack', () => {
    it('Then posts to Slack', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        social: {
          twitter: { enabled: false, onlyStable: true },
          slack: { enabled: true, onlyStable: true, channel: '#releases' },
        },
        tokens: {
          gitlab: undefined,
          github: undefined,
          twitter: { apiKey: undefined, apiKeySecret: undefined, accessToken: undefined, accessTokenSecret: undefined },
          slack: 'slack-token',
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await social({
        bumpResult: {
          bumped: true,
          bumpedPackages: [],
        },
      })

      expect(postReleaseToSlack).toHaveBeenCalled()
    })
  })

  describe('When skipping prereleases', () => {
    it('Then skips posting for prerelease when onlyStable is true', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        tokens: {
          gitlab: undefined,
          github: undefined,
          twitter: {
            apiKey: 'key',
            apiKeySecret: 'secret',
            accessToken: 'token',
            accessTokenSecret: 'secret',
          },
          slack: undefined,
        },
        release: {
          social: true,
        },
        social: {
          twitter: { enabled: true, onlyStable: true },
          slack: { enabled: false, onlyStable: true },
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(isPrerelease).mockReturnValue(true)

      await social({})

      expect(postReleaseToTwitter).not.toHaveBeenCalled()
    })
  })

  describe('When in dry-run mode', () => {
    it('Then passes dryRun to hooks', async () => {
      const config = createMockConfig({
        release: { social: true },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      await social({ dryRun: true, bumpResult: { bumped: true, bumpedPackages: [] } })

      expect(executeHook).toHaveBeenCalledWith('before:social', expect.any(Object), true)
    })
  })

  describe('When error occurs', () => {
    it('Then executes error hook', async () => {
      const config = createMockConfig({
        release: { social: true },
        tokens: {
          gitlab: undefined,
          github: undefined,
          twitter: {
            apiKey: 'key',
            apiKeySecret: 'secret',
            accessToken: 'token',
            accessTokenSecret: 'secret',
          },
          slack: undefined,
        },
        social: {
          twitter: { enabled: true, onlyStable: true },
          slack: { enabled: false, onlyStable: true },
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(postReleaseToTwitter).mockRejectedValue(new Error('Twitter API error'))

      const result = await social({
        bumpResult: {
          bumped: true,
          bumpedPackages: [],
        },
      })

      expect(result.hasErrors).toBe(true)
      expect(result.results).toEqual([
        expect.objectContaining({
          platform: 'twitter',
          success: false,
          error: expect.stringContaining('Twitter API error'),
        }),
      ])
      expect(executeHook).toHaveBeenCalledWith('error:social', expect.any(Object), false)
    })
  })

  describe('When in independent mode', () => {
    it('Then create a post for all packages', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        monorepo: { versionMode: 'independent', packages: ['packages/*'] },
        social: {
          twitter: { enabled: true, onlyStable: true },
          slack: { enabled: false, onlyStable: true },
        },
        tokens: {
          gitlab: undefined,
          github: undefined,
          twitter: {
            apiKey: 'key',
            apiKeySecret: 'secret',
            accessToken: 'token',
            accessTokenSecret: 'secret',
          },
          slack: undefined,
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await social({
        bumpResult: {
          bumped: true,
          bumpedPackages: [
            {
              name: 'pkg-a',
              version: '1.0.0',
              path: '/pkg-a',
              commits: [],
              dependencies: [],
              fromTag: 'v1.0.0',
              oldVersion: '1.0.0',
              newVersion: '1.0.1',
              private: false,
            },
            {
              name: 'pkg-b',
              version: '2.0.0',
              path: '/pkg-b',
              commits: [],
              dependencies: [],
              fromTag: 'v2.0.0',
              oldVersion: '2.0.0',
              newVersion: '2.0.1',
              private: false,
            },
          ],
        },
      })

      expect(postReleaseToTwitter).toHaveBeenCalledTimes(1)
    })
  })
})
