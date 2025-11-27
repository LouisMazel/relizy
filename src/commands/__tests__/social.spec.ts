import { logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import { executeHook, generateChangelog, getPackagesOrBumpedPackages, getRootPackage, getSlackToken, getTwitterCredentials, isPrerelease, loadRelizyConfig, postReleaseToSlack, postReleaseToTwitter, resolveTags } from '../../core'
import { social, socialSafetyCheck } from '../social'

logger.setLevel('silent')

vi.mock('../../core/config', async () => {
  const actual = await vi.importActual('../../core/config')
  return {
    ...actual,
    loadRelizyConfig: vi.fn(),
  }
})
vi.mock('../../core/utils', () => {
  return {
    getPackagesOrBumpedPackages: vi.fn(),
    executeHook: vi.fn(),
  }
})
vi.mock('../../core/repo', () => {
  return {
    getRootPackage: vi.fn(),
  }
})
vi.mock('../../core/git', () => {
  return {
    resolveTags: vi.fn(),
  }
})
vi.mock('../../core/changelog', () => {
  return {
    generateChangelog: vi.fn(),
  }
})
vi.mock('../../core/version', () => {
  return {
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
    // These functions are in social, not core
    // vi.mocked(getReleaseUrl).mockReturnValue('https://github.com/user/repo/releases/tag/v1.0.0')
    // vi.mocked(extractChangelogSummary).mockReturnValue('Feature added')
    vi.mocked(isPrerelease).mockReturnValue(false)
    vi.mocked(getTwitterCredentials).mockReturnValue({
      apiKey: 'key',
      apiSecret: 'secret',
      accessToken: 'token',
      accessTokenSecret: 'secret',
    })
    vi.mocked(getSlackToken).mockReturnValue('slack-token')
  })

  describe('When posting to Twitter', () => {
    it.only('Then loads config and executes hooks', async () => {
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
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

      await social({})

      expect(loadRelizyConfig).toHaveBeenCalled()
      expect(executeHook).toHaveBeenCalledWith('before:social', expect.any(Object), false)
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
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

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
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)

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
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(isPrerelease).mockReturnValue(true)

      await social({})

      expect(postReleaseToTwitter).not.toHaveBeenCalled()
    })
  })

  describe('When in dry-run mode', () => {
    it('Then passes dryRun to hooks', async () => {
      await social({ dryRun: true })

      expect(executeHook).toHaveBeenCalledWith('before:social', expect.any(Object), true)
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
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(postReleaseToTwitter).mockRejectedValue(new Error('Twitter API error'))

      await expect(social({})).rejects.toThrow('Twitter API error')

      expect(executeHook).toHaveBeenCalledWith('error:social', expect.any(Object), false)
    })
  })

  describe('When in independent mode', () => {
    it('Then posts for each package', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        monorepo: { versionMode: 'independent', packages: ['packages/*'] },
      })
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
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([
        createMockPackageInfo({ name: 'pkg-a', version: '1.0.0', path: '/pkg-a', commits: [] }),
        createMockPackageInfo({ name: 'pkg-b', version: '2.0.0', path: '/pkg-b', commits: [] }),
      ])

      await social({})

      expect(postReleaseToTwitter).toHaveBeenCalledTimes(2)
    })
  })
})
