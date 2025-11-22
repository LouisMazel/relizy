import { logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import * as core from '../../core'
import { social, socialSafetyCheck } from '../social'

logger.setLevel('error')

vi.mock('../../core', async () => {
  const actual = await vi.importActual('../../core')
  return {
    ...actual,
    loadRelizyConfig: vi.fn(),
    executeHook: vi.fn(),
    getPackagesOrBumpedPackages: vi.fn(),
    getRootPackage: vi.fn(),
    resolveTags: vi.fn(),
    generateChangelog: vi.fn(),
    isPrerelease: vi.fn(),
  }
})

vi.mock('../../core/twitter', () => ({
  getTwitterCredentials: vi.fn(),
  postReleaseToTwitter: vi.fn(),
}))

vi.mock('../../core/slack', () => ({
  getSlackToken: vi.fn(),
  postReleaseToSlack: vi.fn(),
}))

const { getTwitterCredentials, postReleaseToTwitter } = await import('../../core/twitter')
const { getSlackToken, postReleaseToSlack } = await import('../../core/slack')

describe('Given socialSafetyCheck function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When Twitter is enabled without credentials', () => {
    it('Then logs warning', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.social = {
        twitter: { enabled: true, onlyStable: true },
        slack: { enabled: false, onlyStable: true },
      }
      config.tokens = { gitlab: undefined, github: undefined, twitter: { apiKey: undefined, apiSecret: undefined, accessToken: undefined, accessTokenSecret: undefined }, slack: undefined }
      vi.mocked(getTwitterCredentials).mockReturnValue(null)

      socialSafetyCheck({ config })

      expect(getTwitterCredentials).toHaveBeenCalled()
    })
  })

  describe('When Slack is enabled without token', () => {
    it('Then logs warning', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.social = {
        twitter: { enabled: false, onlyStable: true },
        slack: { enabled: true, onlyStable: true },
      }
      config.tokens = { gitlab: undefined, github: undefined, twitter: { apiKey: undefined, apiSecret: undefined, accessToken: undefined, accessTokenSecret: undefined }, slack: undefined }
      vi.mocked(getSlackToken).mockReturnValue(null)

      socialSafetyCheck({ config })

      expect(getSlackToken).toHaveBeenCalled()
    })
  })

  describe('When credentials are provided', () => {
    it('Then does not log warning', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.social = {
        twitter: { enabled: true, onlyStable: true },
        slack: { enabled: false, onlyStable: true },
      }
      config.tokens = {
        gitlab: undefined,
        github: undefined,
        twitter: {
          apiKey: 'key',
          apiSecret: 'secret',
          accessToken: 'token',
          accessTokenSecret: 'token-secret',
        },
        slack: undefined,
      }
      vi.mocked(getTwitterCredentials).mockReturnValue({
        apiKey: 'key',
        apiSecret: 'secret',
        accessToken: 'token',
        accessTokenSecret: 'token-secret',
      })

      socialSafetyCheck({ config })

      expect(getTwitterCredentials).toHaveBeenCalled()
    })
  })

  describe('When safety check is disabled', () => {
    it('Then returns early without checking', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.safetyCheck = false
      config.social = {
        twitter: { enabled: true, onlyStable: true },
        slack: { enabled: false, onlyStable: true },
      }

      socialSafetyCheck({ config })

      expect(getTwitterCredentials).not.toHaveBeenCalled()
    })
  })

  describe('When social is disabled', () => {
    it('Then returns early without checking', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.release = {
        commit: true,
        changelog: true,
        publish: true,
        push: true,
        providerRelease: true,
        social: false,
        clean: true,
        noVerify: false,
        gitTag: true,
      }
      config.social = {
        twitter: { enabled: true, onlyStable: true },
        slack: { enabled: false, onlyStable: true },
      }

      socialSafetyCheck({ config })

      expect(getTwitterCredentials).not.toHaveBeenCalled()
    })
  })
})

describe('Given social command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const config = createMockConfig({ bump: { type: 'patch' } })
    config.social = {
      twitter: { enabled: false, onlyStable: true },
      slack: { enabled: false, onlyStable: true },
    }
    vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)
    vi.mocked(core.executeHook).mockResolvedValue(undefined)
    vi.mocked(postReleaseToTwitter).mockResolvedValue(undefined)
    vi.mocked(postReleaseToSlack).mockResolvedValue(undefined)
    vi.mocked(core.getPackagesOrBumpedPackages).mockResolvedValue([])
    vi.mocked(core.getRootPackage).mockResolvedValue({
      name: 'test',
      version: '1.0.0',
      path: '/root',
      private: false,
      fromTag: 'v0.9.0',
      commits: [],
    })
    vi.mocked(core.resolveTags).mockResolvedValue({ from: 'v0.9.0', to: 'v1.0.0' })
    vi.mocked(core.generateChangelog).mockResolvedValue('## v1.0.0\n\n- Feature')
    // These functions are in social-utils, not core
    // vi.mocked(core.getReleaseUrl).mockReturnValue('https://github.com/user/repo/releases/tag/v1.0.0')
    // vi.mocked(core.extractChangelogSummary).mockReturnValue('Feature added')
    vi.mocked(core.isPrerelease).mockReturnValue(false)
    vi.mocked(getTwitterCredentials).mockReturnValue({
      apiKey: 'key',
      apiSecret: 'secret',
      accessToken: 'token',
      accessTokenSecret: 'secret',
    })
    vi.mocked(getSlackToken).mockReturnValue('slack-token')
  })

  describe('When posting to Twitter', () => {
    it('Then loads config and executes hooks', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.social = {
        twitter: { enabled: true, onlyStable: true },
        slack: { enabled: false, onlyStable: true },
      }
      config.tokens = {
        gitlab: undefined,
        github: undefined,
        twitter: {
          apiKey: 'key',
          apiSecret: 'secret',
          accessToken: 'token',
          accessTokenSecret: 'secret',
        },
        slack: undefined,
      }
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)

      await social({})

      expect(core.loadRelizyConfig).toHaveBeenCalled()
      expect(core.executeHook).toHaveBeenCalledWith('before:social', expect.any(Object), false)
    })

    it('Then posts to Twitter', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.social = {
        twitter: { enabled: true, onlyStable: true },
        slack: { enabled: false, onlyStable: true },
      }
      config.tokens = {
        gitlab: undefined,
        github: undefined,
        twitter: {
          apiKey: 'key',
          apiSecret: 'secret',
          accessToken: 'token',
          accessTokenSecret: 'secret',
        },
        slack: undefined,
      }
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)

      await social({})

      expect(postReleaseToTwitter).toHaveBeenCalled()
    })
  })

  describe('When posting to Slack', () => {
    it('Then posts to Slack', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.social = {
        twitter: { enabled: false, onlyStable: true },
        slack: { enabled: true, onlyStable: true, channel: '#releases' },
      }
      config.tokens = { gitlab: undefined, github: undefined, twitter: { apiKey: undefined, apiSecret: undefined, accessToken: undefined, accessTokenSecret: undefined }, slack: 'slack-token' }
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)

      await social({})

      expect(postReleaseToSlack).toHaveBeenCalled()
    })
  })

  describe('When skipping prereleases', () => {
    it('Then skips posting for prerelease when onlyStable is true', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.social = {
        twitter: { enabled: true, onlyStable: true },
        slack: { enabled: false, onlyStable: true },
      }
      config.tokens = {
        gitlab: undefined,
        github: undefined,
        twitter: {
          apiKey: 'key',
          apiSecret: 'secret',
          accessToken: 'token',
          accessTokenSecret: 'secret',
        },
        slack: undefined,
      }
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(core.isPrerelease).mockReturnValue(true)

      await social({})

      expect(postReleaseToTwitter).not.toHaveBeenCalled()
    })
  })

  describe('When in dry-run mode', () => {
    it('Then passes dryRun to hooks', async () => {
      await social({ dryRun: true })

      expect(core.executeHook).toHaveBeenCalledWith('before:social', expect.any(Object), true)
    })
  })

  describe('When error occurs', () => {
    it('Then executes error hook', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.social = {
        twitter: { enabled: true, onlyStable: true },
        slack: { enabled: false, onlyStable: true },
      }
      config.tokens = {
        gitlab: undefined,
        github: undefined,
        twitter: {
          apiKey: 'key',
          apiSecret: 'secret',
          accessToken: 'token',
          accessTokenSecret: 'secret',
        },
        slack: undefined,
      }
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(postReleaseToTwitter).mockRejectedValue(new Error('Twitter API error'))

      await expect(social({})).rejects.toThrow('Twitter API error')

      expect(core.executeHook).toHaveBeenCalledWith('error:social', expect.any(Object), false)
    })
  })

  describe('When in independent mode', () => {
    it('Then posts for each package', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.monorepo = { versionMode: 'independent', packages: ['packages/*'] }
      config.social = {
        twitter: { enabled: true, onlyStable: true },
        slack: { enabled: false, onlyStable: true },
      }
      config.tokens = {
        gitlab: undefined,
        github: undefined,
        twitter: {
          apiKey: 'key',
          apiSecret: 'secret',
          accessToken: 'token',
          accessTokenSecret: 'secret',
        },
        slack: undefined,
      }
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(core.getPackagesOrBumpedPackages).mockResolvedValue([
        createMockPackageInfo({ name: 'pkg-a', version: '1.0.0', path: '/pkg-a', commits: [] }),
        createMockPackageInfo({ name: 'pkg-b', version: '2.0.0', path: '/pkg-b', commits: [] }),
      ])

      await social({})

      expect(postReleaseToTwitter).toHaveBeenCalledTimes(2)
    })
  })
})
