import { logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig } from '../../../tests/mocks'
import { buildChangelogBody, collectContributorNames, executeHook, getPackagesOrBumpedPackages, getRootPackage, getSlackToken, getSlackWebhookUrl, getTwitterCredentials, isPrerelease, loadRelizyConfig, postReleaseToSlack, postReleaseToTwitter, resolveTags } from '../../core'
import { aiSafetyCheck, generateAISocialChangelog } from '../../core/ai'
import { social, socialSafetyCheck } from '../social'

vi.mock('../../core/ai', () => ({
  aiSafetyCheck: vi.fn(),
  generateAISocialChangelog: vi.fn(),
  applyAIOverride: vi.fn(),
  isAISocialEnabled: vi.fn().mockImplementation((config: any, platform: 'twitter' | 'slack') => !!config.social?.[platform]?.enabled && !!config.ai?.social?.[platform]?.enabled),
}))

vi.mock('../../core', () => ({
  loadRelizyConfig: vi.fn(),
  getPackagesOrBumpedPackages: vi.fn(),
  executeHook: vi.fn(),
  getRootPackage: vi.fn(),
  resolveTags: vi.fn(),
  buildChangelogBody: vi.fn(),
  isPrerelease: vi.fn(),
  getTwitterCredentials: vi.fn(),
  postReleaseToTwitter: vi.fn(),
  getSlackToken: vi.fn(),
  getSlackWebhookUrl: vi.fn(),
  collectContributorNames: vi.fn().mockReturnValue([]),
  collectPackageBumps: vi.fn().mockReturnValue([]),
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
    it('Then exits with error', async () => {
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

      await expect(() => socialSafetyCheck({ config })).rejects.toThrow('Error during social safety check: Twitter credentials not found')

      expect(loggerErrorSpy).toHaveBeenCalledWith('Error during social safety check:', 'Twitter credentials not found')
    })
  })

  describe('When Slack is enabled without token', () => {
    it('Then exits with error', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        social: {
          twitter: { enabled: false, onlyStable: true },
          slack: { enabled: true, onlyStable: true },
        },
      })
      vi.mocked(getSlackToken).mockReturnValue(null)
      vi.mocked(getSlackWebhookUrl).mockReturnValue(null)

      await expect(() => socialSafetyCheck({ config })).rejects.toThrow('Error during social safety check: Slack credentials not found')
    })
  })

  describe('When Slack is enabled in webhook mode', () => {
    it('Then passes without requiring channel or @slack/web-api', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        social: {
          twitter: { enabled: false, onlyStable: true },
          slack: { enabled: true, onlyStable: true, webhookUrl: 'https://hooks.slack.com/a/b/c' },
        },
      })
      vi.mocked(getSlackToken).mockReturnValue(null)
      vi.mocked(getSlackWebhookUrl).mockReturnValue('https://hooks.slack.com/a/b/c')

      await expect(socialSafetyCheck({ config })).resolves.not.toThrow()
    })

    it('Then warns when channel is also configured', async () => {
      const warnSpy = vi.spyOn(logger, 'warn')
      const config = createMockConfig({
        bump: { type: 'patch' },
        social: {
          twitter: { enabled: false, onlyStable: true },
          slack: { enabled: true, onlyStable: true, webhookUrl: 'https://hooks.slack.com/a/b/c', channel: '#releases' },
        },
      })
      vi.mocked(getSlackToken).mockReturnValue(null)
      vi.mocked(getSlackWebhookUrl).mockReturnValue('https://hooks.slack.com/a/b/c')

      await socialSafetyCheck({ config })

      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/channel is ignored.*webhookUrl/))
    })

    it('Then warns when token is also configured', async () => {
      const warnSpy = vi.spyOn(logger, 'warn')
      const config = createMockConfig({
        bump: { type: 'patch' },
        social: {
          twitter: { enabled: false, onlyStable: true },
          slack: { enabled: true, onlyStable: true, webhookUrl: 'https://hooks.slack.com/a/b/c' },
        },
      })
      vi.mocked(getSlackToken).mockReturnValue('xoxb-test')
      vi.mocked(getSlackWebhookUrl).mockReturnValue('https://hooks.slack.com/a/b/c')

      await socialSafetyCheck({ config })

      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/token is ignored.*webhook/))
    })
  })

  describe('When Slack is enabled in token mode without channel', () => {
    it('Then throws with channel-required message', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        social: {
          twitter: { enabled: false, onlyStable: true },
          slack: { enabled: true, onlyStable: true },
        },
      })
      vi.mocked(getSlackToken).mockReturnValue('xoxb-test')
      vi.mocked(getSlackWebhookUrl).mockReturnValue(null)

      await expect(() => socialSafetyCheck({ config })).rejects.toThrow('Error during social safety check: Slack channel not found')
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
    vi.mocked(buildChangelogBody).mockReturnValue('- Feature')
    vi.mocked(isPrerelease).mockReturnValue(false)
    vi.mocked(getTwitterCredentials).mockReturnValue({
      apiKey: 'key',
      apiKeySecret: 'secret',
      accessToken: 'token',
      accessTokenSecret: 'secret',
    })
    vi.mocked(getSlackToken).mockReturnValue('slack-token')
    vi.mocked(getSlackWebhookUrl).mockReturnValue(null)
    vi.mocked(collectContributorNames).mockReturnValue([])
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

  describe('When AI social is enabled for Twitter', () => {
    it('Then passes content through generateAISocialChangelog with maxLength', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        social: {
          twitter: { enabled: true, onlyStable: true, postMaxLength: 280 },
          slack: { enabled: false, onlyStable: true },
        },
        tokens: {
          twitter: { apiKey: 'key', apiKeySecret: 'secret', accessToken: 'token', accessTokenSecret: 'secret' },
        },
        ai: { social: { twitter: { enabled: true } } },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(buildChangelogBody).mockReturnValue('- Feature A\n- Feature B')
      vi.mocked(generateAISocialChangelog).mockResolvedValue('AI rewritten tweet')

      await social({ bumpResult: { bumped: true, bumpedPackages: [] } })

      expect(generateAISocialChangelog).toHaveBeenCalledWith(
        expect.objectContaining({
          config,
          rawBody: '- Feature A\n- Feature B',
          platform: 'twitter',
        }),
      )
      const [[call]] = vi.mocked(generateAISocialChangelog).mock.calls
      expect(call.maxLength).toBeGreaterThan(0)
      expect(call.maxLength).toBeLessThan(280)
      expect(postReleaseToTwitter).toHaveBeenCalledWith(
        expect.objectContaining({ changelog: 'AI rewritten tweet' }),
      )
    })
  })

  describe('When AI social is enabled for Slack', () => {
    it('Then passes content through generateAISocialChangelog without maxLength', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        social: {
          twitter: { enabled: false, onlyStable: true },
          slack: { enabled: true, onlyStable: true, channel: '#releases' },
        },
        tokens: { slack: 'slack-token' },
        ai: { social: { slack: { enabled: true } } },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(buildChangelogBody).mockReturnValue('- Feature A')
      vi.mocked(generateAISocialChangelog).mockResolvedValue('AI rewritten slack message')

      await social({ bumpResult: { bumped: true, bumpedPackages: [] } })

      expect(generateAISocialChangelog).toHaveBeenCalledWith(
        expect.objectContaining({
          config,
          platform: 'slack',
        }),
      )
      expect(postReleaseToSlack).toHaveBeenCalledWith(
        expect.objectContaining({ changelog: 'AI rewritten slack message' }),
      )
    })
  })

  describe('When both Twitter and Slack AI are enabled', () => {
    it('Then each platform triggers its own provider call', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        social: {
          twitter: { enabled: true, onlyStable: true, postMaxLength: 280 },
          slack: { enabled: true, onlyStable: true, channel: '#releases' },
        },
        tokens: {
          twitter: { apiKey: 'key', apiKeySecret: 'secret', accessToken: 'token', accessTokenSecret: 'secret' },
          slack: 'slack-token',
        },
        ai: { social: { twitter: { enabled: true }, slack: { enabled: true } } },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(buildChangelogBody).mockReturnValue('- Feature')
      vi.mocked(generateAISocialChangelog)
        .mockResolvedValueOnce('AI tweet')
        .mockResolvedValueOnce('AI slack')

      await social({ bumpResult: { bumped: true, bumpedPackages: [] } })

      expect(generateAISocialChangelog).toHaveBeenCalledTimes(2)
      expect(generateAISocialChangelog).toHaveBeenCalledWith(
        expect.objectContaining({ platform: 'twitter' }),
      )
      expect(generateAISocialChangelog).toHaveBeenCalledWith(
        expect.objectContaining({ platform: 'slack' }),
      )
    })
  })

  describe('When changelog body is empty', () => {
    it('Then skips AI call entirely', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        social: {
          twitter: { enabled: true, onlyStable: true },
          slack: { enabled: false, onlyStable: true },
        },
        tokens: {
          twitter: { apiKey: 'key', apiKeySecret: 'secret', accessToken: 'token', accessTokenSecret: 'secret' },
        },
        ai: { social: { twitter: { enabled: true } } },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(buildChangelogBody).mockReturnValue('')

      await social({ bumpResult: { bumped: true, bumpedPackages: [] } })

      expect(generateAISocialChangelog).not.toHaveBeenCalled()
    })
  })

  describe('When publishing a prerelease with onlyStable enabled', () => {
    it('Then skips the Twitter AI call', async () => {
      const config = createMockConfig({
        bump: { type: 'prerelease' },
        social: {
          twitter: { enabled: true, onlyStable: true },
          slack: { enabled: false, onlyStable: true },
        },
        tokens: {
          twitter: { apiKey: 'key', apiKeySecret: 'secret', accessToken: 'token', accessTokenSecret: 'secret' },
        },
        ai: { social: { twitter: { enabled: true } } },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(buildChangelogBody).mockReturnValue('- Feature A')
      vi.mocked(isPrerelease).mockReturnValue(true)

      await social({
        bumpResult: {
          bumped: true,
          bumpedPackages: [],
          newVersion: '1.0.0-beta.1',
        },
      })

      expect(generateAISocialChangelog).not.toHaveBeenCalled()
    })

    it('Then skips the Slack AI call (onlyStable defaults to true)', async () => {
      const config = createMockConfig({
        bump: { type: 'prerelease' },
        social: {
          twitter: { enabled: false, onlyStable: true },
          slack: { enabled: true, channel: '#releases' },
        },
        tokens: { slack: 'slack-token' },
        ai: { social: { slack: { enabled: true } } },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(buildChangelogBody).mockReturnValue('- Feature A')
      vi.mocked(isPrerelease).mockReturnValue(true)

      await social({
        bumpResult: {
          bumped: true,
          bumpedPackages: [],
          newVersion: '1.0.0-beta.1',
        },
      })

      expect(generateAISocialChangelog).not.toHaveBeenCalled()
    })

    it('Then still runs the AI call for a platform where onlyStable is false', async () => {
      const config = createMockConfig({
        bump: { type: 'prerelease' },
        social: {
          twitter: { enabled: true, onlyStable: false },
          slack: { enabled: false, onlyStable: true },
        },
        tokens: {
          twitter: { apiKey: 'key', apiKeySecret: 'secret', accessToken: 'token', accessTokenSecret: 'secret' },
        },
        ai: { social: { twitter: { enabled: true } } },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(buildChangelogBody).mockReturnValue('- Feature A')
      vi.mocked(isPrerelease).mockReturnValue(true)
      vi.mocked(generateAISocialChangelog).mockResolvedValue('AI tweet')

      await social({
        bumpResult: {
          bumped: true,
          bumpedPackages: [],
          newVersion: '1.0.0-beta.1',
        },
      })

      expect(generateAISocialChangelog).toHaveBeenCalledWith(
        expect.objectContaining({ platform: 'twitter' }),
      )
    })
  })

  describe('When socialSafetyCheck with AI social enabled', () => {
    it('Then calls aiSafetyCheck', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        social: {
          twitter: { enabled: true, onlyStable: true },
          slack: { enabled: false, onlyStable: true },
        },
        tokens: {
          twitter: { apiKey: 'key', apiKeySecret: 'secret', accessToken: 'token', accessTokenSecret: 'secret' },
        },
        ai: { social: { twitter: { enabled: true } } },
      })
      vi.mocked(getTwitterCredentials).mockReturnValue({
        apiKey: 'key',
        apiKeySecret: 'secret',
        accessToken: 'token',
        accessTokenSecret: 'secret',
      })

      await socialSafetyCheck({ config })

      expect(aiSafetyCheck).toHaveBeenCalledWith({ config })
    })
  })

  describe('When AI social is not enabled', () => {
    it('Then does not call aiSafetyCheck', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        social: {
          twitter: { enabled: true, onlyStable: true },
          slack: { enabled: false, onlyStable: true },
        },
        tokens: {
          twitter: { apiKey: 'key', apiKeySecret: 'secret', accessToken: 'token', accessTokenSecret: 'secret' },
        },
      })
      vi.mocked(getTwitterCredentials).mockReturnValue({
        apiKey: 'key',
        apiKeySecret: 'secret',
        accessToken: 'token',
        accessTokenSecret: 'secret',
      })

      await socialSafetyCheck({ config })

      expect(aiSafetyCheck).not.toHaveBeenCalled()
    })
  })

  describe('When AI social platform is enabled but underlying social platform is disabled', () => {
    it('Then does not call aiSafetyCheck', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        social: {
          twitter: { enabled: false, onlyStable: true },
          slack: { enabled: true, onlyStable: true, webhookUrl: 'https://hooks.slack.com/services/xxx' },
        },
        ai: { social: { twitter: { enabled: true }, slack: { enabled: false } } },
      })
      vi.mocked(getSlackWebhookUrl).mockReturnValue('https://hooks.slack.com/services/xxx')

      await socialSafetyCheck({ config })

      expect(aiSafetyCheck).not.toHaveBeenCalled()
    })
  })
})
