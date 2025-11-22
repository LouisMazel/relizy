import { logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig } from '../../../tests/mocks'
import * as core from '../../core'
import { social, socialSafetyCheck } from '../social'

logger.setLevel('error')

vi.mock('../../core', async () => {
  const actual = await vi.importActual('../../core')
  return {
    ...actual,
    loadRelizyConfig: vi.fn(),
    executeHook: vi.fn(),
    postReleaseToTwitter: vi.fn(),
    postReleaseToSlack: vi.fn(),
    getPackagesOrBumpedPackages: vi.fn(),
    getRootPackage: vi.fn(),
    resolveTags: vi.fn(),
    generateChangelog: vi.fn(),
    getReleaseUrl: vi.fn(),
    extractChangelogSummary: vi.fn(),
    isPrerelease: vi.fn(),
  }
})

describe('Given socialSafetyCheck function', () => {
  describe('When Twitter is enabled without credentials', () => {
    it('Then throws error', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.social = {
        twitter: { enabled: true },
        slack: { enabled: false },
      }
      config.tokens = {}

      expect(() => socialSafetyCheck({ config })).toThrow('Twitter is enabled but no credentials found')
    })
  })

  describe('When Slack is enabled without token', () => {
    it('Then throws error', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.social = {
        twitter: { enabled: false },
        slack: { enabled: true },
      }
      config.tokens = {}

      expect(() => socialSafetyCheck({ config })).toThrow('Slack is enabled but no token found')
    })
  })

  describe('When credentials are provided', () => {
    it('Then does not throw', () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.social = {
        twitter: { enabled: true },
        slack: { enabled: false },
      }
      config.tokens = {
        twitter: {
          apiKey: 'key',
          apiSecret: 'secret',
          accessToken: 'token',
          accessTokenSecret: 'token-secret',
        },
      }

      expect(() => socialSafetyCheck({ config })).not.toThrow()
    })
  })
})

describe('Given social command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const config = createMockConfig({ bump: { type: 'patch' } })
    config.social = {
      twitter: { enabled: false },
      slack: { enabled: false },
    }
    vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)
    vi.mocked(core.executeHook).mockResolvedValue(undefined)
    vi.mocked(core.postReleaseToTwitter).mockResolvedValue(undefined)
    vi.mocked(core.postReleaseToSlack).mockResolvedValue(undefined)
    vi.mocked(core.getPackagesOrBumpedPackages).mockResolvedValue([])
    vi.mocked(core.getRootPackage).mockResolvedValue({
      name: 'test',
      version: '1.0.0',
      path: '/root',
      commits: [],
    })
    vi.mocked(core.resolveTags).mockResolvedValue({ from: 'v0.9.0', to: 'v1.0.0' })
    vi.mocked(core.generateChangelog).mockResolvedValue('## v1.0.0\n\n- Feature')
    vi.mocked(core.getReleaseUrl).mockReturnValue('https://github.com/user/repo/releases/tag/v1.0.0')
    vi.mocked(core.extractChangelogSummary).mockReturnValue('Feature added')
    vi.mocked(core.isPrerelease).mockReturnValue(false)
  })

  describe('When posting to Twitter', () => {
    it('Then loads config and executes hooks', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.social = {
        twitter: { enabled: true },
        slack: { enabled: false },
      }
      config.tokens = {
        twitter: {
          apiKey: 'key',
          apiSecret: 'secret',
          accessToken: 'token',
          accessTokenSecret: 'secret',
        },
      }
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)

      await social({})

      expect(core.loadRelizyConfig).toHaveBeenCalled()
      expect(core.executeHook).toHaveBeenCalledWith('before:social', expect.any(Object), false)
    })

    it('Then posts to Twitter', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.social = {
        twitter: { enabled: true },
        slack: { enabled: false },
      }
      config.tokens = {
        twitter: {
          apiKey: 'key',
          apiSecret: 'secret',
          accessToken: 'token',
          accessTokenSecret: 'secret',
        },
      }
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)

      await social({})

      expect(core.postReleaseToTwitter).toHaveBeenCalled()
    })
  })

  describe('When posting to Slack', () => {
    it('Then posts to Slack', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.social = {
        twitter: { enabled: false },
        slack: { enabled: true, channel: '#releases' },
      }
      config.tokens = { slack: 'slack-token' }
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)

      await social({})

      expect(core.postReleaseToSlack).toHaveBeenCalled()
    })
  })

  describe('When skipping prereleases', () => {
    it('Then skips posting for prerelease when onlyStable is true', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.social = {
        twitter: { enabled: true, onlyStable: true },
        slack: { enabled: false },
      }
      config.tokens = {
        twitter: {
          apiKey: 'key',
          apiSecret: 'secret',
          accessToken: 'token',
          accessTokenSecret: 'secret',
        },
      }
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(core.isPrerelease).mockReturnValue(true)

      await social({})

      expect(core.postReleaseToTwitter).not.toHaveBeenCalled()
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
        twitter: { enabled: true },
        slack: { enabled: false },
      }
      config.tokens = {
        twitter: {
          apiKey: 'key',
          apiSecret: 'secret',
          accessToken: 'token',
          accessTokenSecret: 'secret',
        },
      }
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(core.postReleaseToTwitter).mockRejectedValue(new Error('Twitter API error'))

      await expect(social({})).rejects.toThrow('Twitter API error')

      expect(core.executeHook).toHaveBeenCalledWith('error:social', expect.any(Object), false)
    })
  })

  describe('When in independent mode', () => {
    it('Then posts for each package', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.monorepo = { versionMode: 'independent' }
      config.social = {
        twitter: { enabled: true },
        slack: { enabled: false },
      }
      config.tokens = {
        twitter: {
          apiKey: 'key',
          apiSecret: 'secret',
          accessToken: 'token',
          accessTokenSecret: 'secret',
        },
      }
      vi.mocked(core.loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(core.getPackagesOrBumpedPackages).mockResolvedValue([
        { name: 'pkg-a', version: '1.0.0', path: '/pkg-a', commits: [] },
        { name: 'pkg-b', version: '2.0.0', path: '/pkg-b', commits: [] },
      ])

      await social({})

      expect(core.postReleaseToTwitter).toHaveBeenCalledTimes(2)
    })
  })
})
