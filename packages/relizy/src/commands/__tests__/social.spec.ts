import type { RelizyEvent } from '../../core/events'
import type { GroupBumpResult } from '../../types'
import { logger } from '@maz-ui/node'
import { collectContributorNames, isPrerelease } from '@relizy/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureCliOutput } from '../../../tests/cli-output'
import { anyHookContext, createMockConfig } from '../../../tests/mocks'
import { executeHook, generateChangelog, getPackageCommits, getPackagesOrBumpedPackages, getReleaseUrl, getRootPackage, getSlackToken, getSlackWebhookUrl, getTwitterCredentials, loadRelizyConfig, postReleaseToSlack, postReleaseToTeams, postReleaseToTwitter, resolveTags } from '../../core'
import { aiSafetyCheck, generateAISocialChangelog, generateAISocialReleases } from '../../core/ai'
import { social, socialSafetyCheck } from '../social'

vi.mock('../../core/ai', async importActual => ({
  isAIRewritingVersion: (await importActual<typeof import('../../core/ai')>()).isAIRewritingVersion,
  isAIRunInRelease: (await importActual<typeof import('../../core/ai')>()).isAIRunInRelease,
  aiSafetyCheck: vi.fn(),
  generateAISocialChangelog: vi.fn(),
  generateAISocialReleases: vi.fn(),
  applyAIOverride: vi.fn(),
  isAISocialEnabled: vi.fn().mockImplementation((config: any, platform: 'twitter' | 'slack' | 'teams') => !!config.social?.[platform]?.enabled && !!config.ai?.social?.[platform]?.enabled),
}))

// The release overview reads the name of the project from the root package.json
vi.mock('../../core/repo', async importActual => ({
  ...await importActual<typeof import('../../core/repo')>(),
  readPackageJson: vi.fn().mockReturnValue({ name: 'test-package', version: '1.0.0' }),
}))

vi.mock('../../core', async () => ({
  ...await vi.importActual<typeof import('../../core/groups')>('../../core/groups'),
  ...await vi.importActual<typeof import('../../core/errors')>('../../core/errors'),
  ...await vi.importActual<typeof import('../../core/release-ui')>('../../core/release-ui'),
  getHookContext: (await vi.importActual<typeof import('../../core/utils')>('../../core/utils')).getHookContext,
  ...await vi.importActual<typeof import('../../core/release-overview')>('../../core/release-overview'),
  loadRelizyConfig: vi.fn(),
  getPackagesOrBumpedPackages: vi.fn(),
  executeHook: vi.fn(),
  getRootPackage: vi.fn(),
  getPackageCommits: vi.fn().mockResolvedValue([]),
  generateChangelog: vi.fn().mockResolvedValue('- Feature'),
  resolveTags: vi.fn(),
  getKnownReleaseVersions: (await vi.importActual<typeof import('../../core/version')>('../../core/version')).getKnownReleaseVersions,
  isPrereleaseOnlyRelease: (await vi.importActual<typeof import('../../core/version')>('../../core/version')).isPrereleaseOnlyRelease,
  getTwitterCredentials: vi.fn(),
  getTweetLength: (await vi.importActual<typeof import('../../core/twitter')>('../../core/twitter')).getTweetLength,
  extractChangelogHighlights: (await vi.importActual<typeof import('../../core/social')>('../../core/social')).extractChangelogHighlights,
  postReleaseToTwitter: vi.fn(),
  getSlackToken: vi.fn(),
  getSlackWebhookUrl: vi.fn(),
  collectPackageBumps: vi.fn().mockReturnValue([]),
  postReleaseToSlack: vi.fn(),
  ...await vi.importActual<typeof import('../../core/announcements')>('../../core/announcements'),
  getSocialChangelog: (await vi.importActual<typeof import('../../core/social')>('../../core/social')).getSocialChangelog,
  ...await vi.importActual<typeof import('../../core/teams')>('../../core/teams'),
  postReleaseToTeams: vi.fn(),
  resolveSlackPostMaxLength: vi.fn(({ changelogFormat, postMaxLength }: { changelogFormat?: string, postMaxLength?: number }) => postMaxLength ?? (changelogFormat === 'full'
    ? undefined
    : 2500)),
  readPackageJson: vi.fn().mockReturnValue({ name: 'test-package' }),
  getReleaseUrl: vi.fn().mockReturnValue('https://example.com/release'),
  extractChangelogSummary: vi.fn().mockReturnValue('Summary of changes'),
}))

vi.mock('@relizy/core', async importActual => ({
  ...await importActual<typeof import('@relizy/core')>(),
  isPrerelease: vi.fn(),
  collectContributorNames: vi.fn().mockReturnValue([]),
  getIndependentTag: vi.fn(({ name, version }: { name: string, version: string }) => `${name}@${version}`),
  filterOutPrivatePackages: vi.fn((packages: Array<{ private?: boolean }>) => packages.filter(pkg => !pkg.private)),
  isBumpedPackage: vi.fn((pkg: Record<string, unknown>) => 'oldVersion' in pkg),
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

  describe('When every version is a prerelease', () => {
    beforeEach(() => {
      vi.mocked(getTwitterCredentials).mockReturnValue(null)
      vi.mocked(getSlackToken).mockReturnValue(null)
      vi.mocked(getSlackWebhookUrl).mockReturnValue(null)
    })

    it('Then does not check the platforms that leave the prereleases out (onlyStable)', async () => {
      const config = createMockConfig({
        bump: { type: 'prerelease' },
        // Slack and Teams leave out the prereleases by default
        social: {
          twitter: { enabled: true, onlyStable: true },
          slack: { enabled: true },
          teams: { enabled: true },
        },
        ai: {
          onlyStable: false,
          social: {
            slack: { enabled: true },
          },
        },
      })

      await expect(socialSafetyCheck({ config })).resolves.toBeUndefined()
      // The AI of a platform that posts nothing is not checked either
      expect(aiSafetyCheck).not.toHaveBeenCalled()
    })

    it('Then knows them from the versions announced, in a command run alone', async () => {
      vi.mocked(isPrerelease).mockImplementation((version?: string) => (version ?? '').includes('-'))
      const config = createMockConfig({
        bump: { type: 'release' },
        social: {
          slack: { enabled: true },
        },
      })

      await expect(socialSafetyCheck({
        config,
        versions: ['2.0.0-beta.0', '1.3.0-beta.1'],
      })).resolves.toBeUndefined()
      await expect(socialSafetyCheck({
        config,
        versions: ['2.0.0-beta.0', '1.3.0'],
      })).rejects.toThrow('Slack credentials not found')
    })

    it('Then still checks a platform that announces the prereleases', async () => {
      const config = createMockConfig({
        bump: { type: 'prerelease' },
        social: {
          twitter: { enabled: true, onlyStable: false },
        },
      })

      await expect(socialSafetyCheck({ config })).rejects.toThrow('Twitter credentials not found')
    })
  })

  describe('When every version group is left out of the posts', () => {
    it('Then checks nothing', async () => {
      vi.mocked(getSlackToken).mockReturnValue(null)
      vi.mocked(getSlackWebhookUrl).mockReturnValue(null)
      const config = createMockConfig({
        bump: { type: 'patch' },
        social: {
          slack: { enabled: true },
        },
      })
      config.monorepo = {
        groups: [
          {
            name: 'main',
            versionMode: 'selective',
            packages: ['packages/*'],
            release: { social: false },
          },
          {
            name: 'tooling',
            versionMode: 'independent',
            packages: ['tooling/*'],
            release: { social: false },
          },
        ],
      }

      await expect(socialSafetyCheck({ config })).resolves.toBeUndefined()

      config.monorepo.groups![1]!.release = undefined
      await expect(socialSafetyCheck({ config })).rejects.toThrow('Slack credentials not found')
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
          slack: {
            enabled: true,
            onlyStable: true,
            webhookUrl: 'https://hooks.slack.com/a/b/c',
            channel: '#releases',
          },
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

  describe('When Teams is enabled', () => {
    const teamsConfig = (webhookUrl?: string) => createMockConfig({
      bump: { type: 'patch' },
      social: {
        twitter: { enabled: false },
        slack: { enabled: false },
        teams: { enabled: true, webhookUrl },
      },
    })

    it('Then throws without the URL of its workflow', async () => {
      await expect(socialSafetyCheck({
        config: teamsConfig(),
      })).rejects.toThrow('Teams webhook URL not found')
    })

    it('Then throws with the URL of a retired Office 365 connector', async () => {
      await expect(socialSafetyCheck({
        config: teamsConfig('https://contoso.webhook.office.com/webhookb2/abc'),
      })).rejects.toThrow(/Office 365 connector/)
    })

    it('Then passes with the URL of a workflow', async () => {
      await expect(socialSafetyCheck({
        config: teamsConfig('https://example.logic.azure.com/workflows/1?sig=secret'),
      })).resolves.toBeUndefined()
    })
  })

  describe('When safety check is disabled', () => {
    it('Then returns early without checking', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        safetyCheck: false,
        social: {
          twitter: { enabled: true },
          slack: { enabled: true },
        },
      })

      await socialSafetyCheck({ config })

      expect(getTwitterCredentials).not.toHaveBeenCalled()
    })
  })
})

describe('Given social command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const config = createMockConfig({
      bump: { type: 'patch' },
      social: {
        twitter: { enabled: false, onlyStable: true },
      },
    })
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
    vi.mocked(generateChangelog).mockResolvedValue('- Feature')
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
      expect(executeHook).toHaveBeenCalledWith('before:social', expect.any(Object), false, anyHookContext)
    })

    it('Then applies the safetyCheck option to the config', async () => {
      vi.mocked(loadRelizyConfig).mockResolvedValue(createMockConfig({
        bump: { type: 'patch' },
      }))

      await social({
        safetyCheck: false,
        bumpResult: { bumped: true, bumpedPackages: [] },
      })

      expect(loadRelizyConfig).toHaveBeenCalledWith(expect.objectContaining({
        overrides: expect.objectContaining({ safetyCheck: false }),
      }))
    })

    it('Then posts to Twitter', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        tokens: {
          github: 'test-token',
          twitter: {
            apiKey: 'key',
            apiKeySecret: 'secret',
            accessToken: 'token',
            accessTokenSecret: 'secret',
          },
        },
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

  describe('When an application follows the posts', () => {
    it('Then follows each platform live and gives the posts as the data of the step', async () => {
      vi.mocked(loadRelizyConfig).mockResolvedValue(createMockConfig({
        bump: { type: 'patch' },
        social: {
          twitter: { enabled: true, onlyStable: true },
          slack: { enabled: true, onlyStable: true, channel: '#releases' },
        },
      }))
      vi.mocked(postReleaseToTwitter).mockResolvedValue({
        data: { id: '42', text: 'v1.0.0' },
      } as any)
      vi.mocked(postReleaseToSlack).mockRejectedValue(new Error('channel_not_found'))
      const events: RelizyEvent[] = []

      await social({
        bumpResult: { bumped: true, bumpedPackages: [] },
        onProgress: event => events.push(event),
      })

      expect(events.filter(event => event.type === 'step:item').map(event => event.item)).toEqual([
        { name: 'twitter', status: 'running' },
        { name: 'twitter', status: 'done', url: 'https://x.com/i/web/status/42' },
        { name: 'slack', status: 'running' },
        {
          name: 'slack',
          status: 'failed',
          detail: expect.stringContaining('channel_not_found'),
        },
      ])
      expect(events.find(event => event.type === 'step:failed' && event.step === 'social')).toMatchObject({
        fatal: false,
        data: {
          posts: [
            { platform: 'twitter', status: 'posted', url: 'https://x.com/i/web/status/42' },
            {
              platform: 'slack',
              status: 'failed',
              reason: expect.stringContaining('channel_not_found'),
            },
          ],
        },
      })
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
          twitter: {
            apiKey: undefined,
            apiKeySecret: undefined,
            accessToken: undefined,
            accessTokenSecret: undefined,
          },
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

      const result = await social({})

      expect(postReleaseToTwitter).not.toHaveBeenCalled()
      // Nothing posted: the summary of the release says why
      expect(result).toEqual({
        results: [
          { platform: 'twitter', success: true, skipped: 'prerelease' },
        ],
        hasErrors: false,
      })
    })
  })

  describe('When in dry-run mode', () => {
    it('Then passes dryRun to hooks', async () => {
      const config = createMockConfig({
        release: { social: true },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      await social({
        dryRun: true,
        bumpResult: { bumped: true, bumpedPackages: [] },
      })

      expect(executeHook).toHaveBeenCalledWith('before:social', expect.any(Object), true, anyHookContext)
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
      expect(executeHook).toHaveBeenCalledWith('error:social', expect.any(Object), false, anyHookContext)
    })

    it('Then runs the error:social hook on an unexpected error, and reports it in the result', async () => {
      vi.mocked(loadRelizyConfig).mockResolvedValue(createMockConfig({
        release: { social: true },
        social: {
          twitter: { enabled: true },
          slack: { enabled: false },
        },
      }))
      vi.mocked(getRootPackage).mockRejectedValue(new Error('Cannot read the root package'))

      const result = await social({
        bumpResult: { bumped: true, bumpedPackages: [] },
      })

      expect(result).toEqual({
        results: [
          { platform: 'unknown', success: false, error: 'Cannot read the root package' },
        ],
        hasErrors: true,
      })
      expect(executeHook).toHaveBeenCalledWith('error:social', expect.any(Object), false, anyHookContext)
    })

    it('Then runs the error:twitter hook when the before:twitter hook fails', async () => {
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
      vi.mocked(executeHook).mockImplementation(hook => hook === 'before:twitter'
        ? Promise.reject(new Error('hook failed'))
        : Promise.resolve(undefined))

      const result = await social({
        bumpResult: { bumped: true, bumpedPackages: [] },
      })

      expect(postReleaseToTwitter).not.toHaveBeenCalled()
      expect(result.results).toEqual([
        expect.objectContaining({
          platform: 'twitter',
          success: false,
          error: expect.stringContaining('hook failed'),
        }),
      ])
      expect(executeHook).toHaveBeenCalledWith('error:twitter', expect.any(Object), false, anyHookContext)
    })
  })

  describe('When in independent mode', () => {
    const independentConfig = () => createMockConfig({
      bump: { type: 'patch' },
      monorepo: {
        versionMode: 'independent',
        packages: ['packages/*'],
      },
      social: {
        twitter: { enabled: true, onlyStable: true },
        slack: { enabled: true, onlyStable: true, channel: '#releases' },
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
        slack: 'slack-token',
      },
    })

    const makePkg = (over: Record<string, unknown>) => ({
      version: '1.0.0',
      path: '/pkg',
      commits: [],
      dependencies: [],
      fromTag: 'pkg@1.0.0',
      private: false,
      ...over,
    })

    it('Then aggregates a single post covering all packages without touching the root', async () => {
      vi.mocked(loadRelizyConfig).mockResolvedValue(independentConfig())
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([
        makePkg({
          name: 'pkg-a',
          version: '1.0.0',
          oldVersion: '1.0.0',
          newVersion: '1.0.1',
          fromTag: 'pkg-a@1.0.0',
        }),
        makePkg({
          name: 'pkg-b',
          version: '2.0.0',
          oldVersion: '2.0.0',
          newVersion: '2.0.1',
          fromTag: 'pkg-b@2.0.0',
        }),
      ] as any)

      await social({
        bumpResult: { bumped: true, bumpedPackages: [] as any },
      })

      // The root package must never be used to resolve tags/changelog here.
      expect(getRootPackage).not.toHaveBeenCalled()
      expect(resolveTags).not.toHaveBeenCalled()
      // One changelog section per package, per pass (minified + rich) => 2 * 2.
      expect(generateChangelog).toHaveBeenCalledTimes(4)
      // Contributors are collected per package.
      expect(getPackageCommits).toHaveBeenCalledTimes(2)
      // Single aggregated post per platform.
      expect(postReleaseToTwitter).toHaveBeenCalledTimes(1)
      expect(postReleaseToSlack).toHaveBeenCalledTimes(1)
    })

    it('Then uses the package tag and release URL for a single-package release', async () => {
      vi.mocked(loadRelizyConfig).mockResolvedValue(independentConfig())
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([
        makePkg({
          name: 'pkg-a',
          version: '1.0.0',
          oldVersion: '1.0.0',
          newVersion: '1.0.1',
          fromTag: 'pkg-a@1.0.0',
        }),
      ] as any)

      await social({
        bumpResult: { bumped: true, bumpedPackages: [] as any },
      })

      expect(getReleaseUrl).toHaveBeenCalledWith(expect.anything(), 'pkg-a@1.0.1')
      expect(postReleaseToTwitter).toHaveBeenCalledWith(expect.objectContaining({
        variables: expect.objectContaining({ releaseTitle: 'pkg-a 1.0.1 is out!', newVersion: '1.0.1', releaseUrl: 'https://example.com/release' }),
      }))
    })

    it('Then announces several packages under the project name, without version nor release URL', async () => {
      vi.mocked(loadRelizyConfig).mockResolvedValue(independentConfig())
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([
        makePkg({
          name: 'pkg-b',
          oldVersion: '2.0.0',
          newVersion: '2.1.0',
          fromTag: 'pkg-b@2.0.0',
        }),
        makePkg({
          name: 'pkg-a',
          oldVersion: '1.0.0',
          newVersion: '1.0.1',
          fromTag: 'pkg-a@1.0.0',
        }),
      ] as any)

      await social({
        bumpResult: { bumped: true, bumpedPackages: [] as any },
      })

      expect(getReleaseUrl).not.toHaveBeenCalled()
      expect(postReleaseToTwitter).toHaveBeenCalledWith(expect.objectContaining({
        variables: {
          projectName: 'test-package',
          releaseTitle: 'New releases of test-package',
          newVersion: '',
          packageList: 'pkg-a@1.0.1, pkg-b@2.1.0',
          packageCount: '2',
          releaseUrl: undefined,
          changelogUrl: undefined,
        },
      }))
    })

    it('Then skips onlyStable posts when every package is a prerelease', async () => {
      vi.mocked(isPrerelease).mockReturnValue(true)
      vi.mocked(loadRelizyConfig).mockResolvedValue(independentConfig())
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([
        makePkg({
          name: 'pkg-a',
          oldVersion: '1.0.0',
          newVersion: '1.0.1-beta.0',
          fromTag: 'pkg-a@1.0.0',
        }),
        makePkg({
          name: 'pkg-b',
          oldVersion: '2.0.0',
          newVersion: '2.0.1-beta.0',
          fromTag: 'pkg-b@2.0.0',
        }),
      ] as any)

      await social({
        bumpResult: { bumped: true, bumpedPackages: [] as any },
      })

      expect(postReleaseToTwitter).not.toHaveBeenCalled()
      expect(postReleaseToSlack).not.toHaveBeenCalled()
    })

    it('Then posts when at least one package is stable (mixed batch)', async () => {
      vi.mocked(isPrerelease).mockImplementation((v?: string) => (v ?? '').includes('-'))
      vi.mocked(loadRelizyConfig).mockResolvedValue(independentConfig())
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([
        makePkg({
          name: 'pkg-a',
          oldVersion: '1.0.0',
          newVersion: '1.0.1',
          fromTag: 'pkg-a@1.0.0',
        }),
        makePkg({
          name: 'pkg-b',
          oldVersion: '2.0.0',
          newVersion: '2.0.1-beta.0',
          fromTag: 'pkg-b@2.0.0',
        }),
      ] as any)

      await social({
        bumpResult: { bumped: true, bumpedPackages: [] as any },
      })

      expect(postReleaseToTwitter).toHaveBeenCalledTimes(1)
      expect(postReleaseToSlack).toHaveBeenCalledTimes(1)
    })

    it('Then skips a package whose from tag cannot be resolved', async () => {
      const warnSpy = vi.spyOn(logger, 'warn')
      vi.mocked(loadRelizyConfig).mockResolvedValue(independentConfig())
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([
        makePkg({
          name: 'pkg-a',
          oldVersion: '1.0.0',
          newVersion: '1.0.1',
          fromTag: 'pkg-a@1.0.0',
        }),
        makePkg({
          name: 'pkg-b',
          oldVersion: '2.0.0',
          newVersion: '2.0.1',
          fromTag: undefined,
        }),
      ] as any)

      await social({
        bumpResult: { bumped: true, bumpedPackages: [] as any },
      })

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('pkg-b'))
      // Only the resolvable package yields changelog sections (2 passes) and commits.
      expect(generateChangelog).toHaveBeenCalledTimes(2)
      expect(getPackageCommits).toHaveBeenCalledTimes(1)
    })

    it('Then ignores empty changelog sections', async () => {
      vi.mocked(generateChangelog).mockResolvedValue('   ')
      vi.mocked(loadRelizyConfig).mockResolvedValue(independentConfig())
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([
        makePkg({
          name: 'pkg-a',
          oldVersion: '1.0.0',
          newVersion: '1.0.1',
          fromTag: 'pkg-a@1.0.0',
        }),
      ] as any)

      await social({
        bumpResult: { bumped: true, bumpedPackages: [] as any },
      })

      // Whitespace-only sections are dropped, leaving an empty aggregated body.
      expect(postReleaseToTwitter).toHaveBeenCalledWith(expect.objectContaining({ changelog: '' }))
    })

    it('Then honors config.from and falls back to the commit message when shortHash is absent', async () => {
      const config = independentConfig()
      config.from = 'custom-base'
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(getPackageCommits).mockResolvedValue([
        { message: 'feat: no hash commit' } as any,
      ])
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([
        makePkg({
          name: 'pkg-a',
          oldVersion: '1.0.0',
          newVersion: '1.0.1',
          fromTag: undefined,
        }),
      ] as any)

      await social({
        bumpResult: { bumped: true, bumpedPackages: [] as any },
      })

      // config.from resolves the range even though the package has no fromTag.
      expect(getPackageCommits).toHaveBeenCalledWith(expect.objectContaining({ from: 'custom-base' }))
      expect(postReleaseToSlack).toHaveBeenCalledTimes(1)
    })
  })

  describe('When choosing the Slack changelog format', () => {
    const slackConfig = (changelogFormat?: 'summary' | 'full' | 'none' | false) => createMockConfig({
      bump: { type: 'patch' },
      social: {
        twitter: { enabled: false, onlyStable: true },
        slack: {
          enabled: true,
          onlyStable: true,
          channel: '#releases',
          changelog: changelogFormat,
        },
      },
      tokens: { slack: 'slack-token' },
    })

    beforeEach(() => {
      vi.mocked(getSlackToken).mockReturnValue('slack-token')
      vi.mocked(generateChangelog).mockImplementation(({ minify }) => Promise.resolve(minify ? '- Feature A' : '- Feature A ([#1](https://x/1))\n\n  Body'))
    })

    it('Then posts the minified changelog in summary format (default)', async () => {
      vi.mocked(loadRelizyConfig).mockResolvedValue(slackConfig())

      await social({
        bumpResult: { bumped: true, bumpedPackages: [] },
      })

      expect(postReleaseToSlack).toHaveBeenCalledWith(expect.objectContaining({
        changelog: '- Feature A',
        changelogFormat: 'summary',
        postMaxLength: undefined,
      }))
    })

    it('Then posts the rich changelog in full format', async () => {
      vi.mocked(loadRelizyConfig).mockResolvedValue(slackConfig('full'))

      await social({
        bumpResult: { bumped: true, bumpedPackages: [] },
      })

      expect(postReleaseToSlack).toHaveBeenCalledWith(expect.objectContaining({
        changelog: '- Feature A ([#1](https://x/1))\n\n  Body',
        changelogFormat: 'full',
      }))
    })

    it.each(['none', false] as const)('Then posts no changelog with %s', async (changelog) => {
      vi.mocked(loadRelizyConfig).mockResolvedValue(slackConfig(changelog))

      await social({
        bumpResult: { bumped: true, bumpedPackages: [] },
      })

      expect(postReleaseToSlack).toHaveBeenCalledWith(expect.objectContaining({ changelog: '', changelogFormat: 'summary' }))
    })

    it('Then lets the slackFormat option override the config', async () => {
      vi.mocked(loadRelizyConfig).mockResolvedValue(slackConfig('summary'))

      await social({
        bumpResult: { bumped: true, bumpedPackages: [] },
        slackFormat: 'full',
      })

      expect(postReleaseToSlack).toHaveBeenCalledWith(expect.objectContaining({
        changelog: '- Feature A ([#1](https://x/1))\n\n  Body',
        changelogFormat: 'full',
      }))
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
          twitter: {
            apiKey: 'key',
            apiKeySecret: 'secret',
            accessToken: 'token',
            accessTokenSecret: 'secret',
          },
        },
        ai: {
          social: {
            twitter: { enabled: true },
          },
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(generateChangelog).mockResolvedValue('- Feature A\n- Feature B')
      vi.mocked(generateAISocialChangelog).mockResolvedValue('AI rewritten tweet')

      await social({
        bumpResult: { bumped: true, bumpedPackages: [] },
      })

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
    it('Then passes content through generateAISocialChangelog with the summary budget', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        social: {
          twitter: { enabled: false, onlyStable: true },
          slack: { enabled: true, onlyStable: true, channel: '#releases' },
        },
        tokens: { slack: 'slack-token' },
        ai: {
          social: {
            slack: { enabled: true },
          },
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(generateChangelog).mockResolvedValue('- Feature A')
      vi.mocked(generateAISocialChangelog).mockResolvedValue('AI rewritten slack message')

      await social({
        bumpResult: { bumped: true, bumpedPackages: [] },
      })

      expect(generateAISocialChangelog).toHaveBeenCalledWith(
        expect.objectContaining({
          config,
          platform: 'slack',
          maxLength: 2500,
        }),
      )
      expect(postReleaseToSlack).toHaveBeenCalledWith(
        expect.objectContaining({ changelog: 'AI rewritten slack message' }),
      )
    })

    it('Then falls back to the rich body without budget in full format', async () => {
      const config = createMockConfig({
        bump: { type: 'patch' },
        social: {
          twitter: { enabled: false, onlyStable: true },
          slack: {
            enabled: true,
            onlyStable: true,
            channel: '#releases',
            changelog: 'full',
          },
        },
        tokens: { slack: 'slack-token' },
        ai: {
          social: {
            slack: { enabled: true },
          },
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(generateChangelog).mockImplementation(({ minify }) => Promise.resolve(minify ? '- Feature A' : '- Feature A ([#1](https://x/1))\n\n  Body'))
      vi.mocked(generateAISocialChangelog).mockResolvedValue('AI rewritten slack message')

      await social({
        bumpResult: { bumped: true, bumpedPackages: [] },
      })

      expect(generateAISocialChangelog).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'slack',
          rawBody: '- Feature A ([#1](https://x/1))\n\n  Body',
          fallbackBody: '- Feature A ([#1](https://x/1))\n\n  Body',
          maxLength: undefined,
        }),
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
          twitter: {
            apiKey: 'key',
            apiKeySecret: 'secret',
            accessToken: 'token',
            accessTokenSecret: 'secret',
          },
          slack: 'slack-token',
        },
        ai: {
          social: {
            twitter: { enabled: true },
            slack: { enabled: true },
          },
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(generateChangelog).mockResolvedValue('- Feature')
      vi.mocked(generateAISocialChangelog)
        .mockResolvedValueOnce('AI tweet')
        .mockResolvedValueOnce('AI slack')

      await social({
        bumpResult: { bumped: true, bumpedPackages: [] },
      })

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
          twitter: {
            apiKey: 'key',
            apiKeySecret: 'secret',
            accessToken: 'token',
            accessTokenSecret: 'secret',
          },
        },
        ai: {
          social: {
            twitter: { enabled: true },
          },
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(generateChangelog).mockResolvedValue('')

      await social({
        bumpResult: { bumped: true, bumpedPackages: [] },
      })

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
          twitter: {
            apiKey: 'key',
            apiKeySecret: 'secret',
            accessToken: 'token',
            accessTokenSecret: 'secret',
          },
        },
        ai: {
          social: {
            twitter: { enabled: true },
          },
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(generateChangelog).mockResolvedValue('- Feature A')
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
        ai: {
          social: {
            slack: { enabled: true },
          },
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(generateChangelog).mockResolvedValue('- Feature A')
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

    it('Then posts the raw changelog of a prerelease, without AI, with ai.onlyStable', async () => {
      const config = createMockConfig({
        bump: { type: 'prerelease' },
        social: {
          twitter: { enabled: true, onlyStable: false },
          slack: { enabled: false, onlyStable: true },
        },
        tokens: {
          twitter: {
            apiKey: 'key',
            apiKeySecret: 'secret',
            accessToken: 'token',
            accessTokenSecret: 'secret',
          },
        },
        ai: {
          social: {
            twitter: { enabled: true },
          },
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(generateChangelog).mockResolvedValue('- Feature A')
      vi.mocked(isPrerelease).mockReturnValue(true)

      await social({
        bumpResult: { bumped: true, bumpedPackages: [], newVersion: '1.0.0-beta.1' },
      })

      expect(generateAISocialChangelog).not.toHaveBeenCalled()
      expect(postReleaseToTwitter).toHaveBeenCalledWith(expect.objectContaining({ changelog: '- Feature A' }))
    })

    it('Then still runs the AI call for a platform where the onlyStable of the AI is false', async () => {
      const config = createMockConfig({
        bump: { type: 'prerelease' },
        social: {
          twitter: { enabled: true, onlyStable: false },
          slack: { enabled: false, onlyStable: true },
        },
        tokens: {
          twitter: {
            apiKey: 'key',
            apiKeySecret: 'secret',
            accessToken: 'token',
            accessTokenSecret: 'secret',
          },
        },
        ai: {
          social: {
            twitter: { enabled: true, onlyStable: false },
          },
        },
      })
      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(generateChangelog).mockResolvedValue('- Feature A')
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
          twitter: {
            apiKey: 'key',
            apiKeySecret: 'secret',
            accessToken: 'token',
            accessTokenSecret: 'secret',
          },
        },
        ai: {
          social: {
            twitter: { enabled: true },
          },
        },
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

    it('Then does not check the AI provider for a prerelease bump with onlyStable', async () => {
      const config = createMockConfig({
        bump: { type: 'prerelease' },
        social: {
          twitter: { enabled: true, onlyStable: true },
        },
        tokens: {
          twitter: {
            apiKey: 'key',
            apiKeySecret: 'secret',
            accessToken: 'token',
            accessTokenSecret: 'secret',
          },
        },
        ai: {
          social: {
            twitter: { enabled: true },
          },
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

  describe('When AI social is not enabled', () => {
    it('Then does not call aiSafetyCheck', async () => {
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
            accessTokenSecret: 'secret',
          },
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
        ai: {
          social: {
            twitter: { enabled: true },
            slack: { enabled: false },
          },
        },
      })
      vi.mocked(getSlackWebhookUrl).mockReturnValue('https://hooks.slack.com/services/xxx')

      await socialSafetyCheck({ config })

      expect(aiSafetyCheck).not.toHaveBeenCalled()
    })
  })
})

describe('Given social command with version groups', () => {
  const mainGroup: GroupBumpResult = {
    name: 'main',
    title: 'Maz UI',
    versionMode: 'selective',
    bumped: true,
    newVersion: '7.0.0',
    fromTag: 'v6.19.1',
    bumpedPackages: [],
  }
  const headerGroup: GroupBumpResult = {
    name: 'header',
    title: 'Header',
    versionMode: 'independent',
    bumped: true,
    bumpedPackages: [],
  }
  const nav = {
    name: '@scope/nav',
    version: '1.2.0',
    oldVersion: '1.2.0',
    newVersion: '1.3.0',
    path: '/nav',
    private: false,
    fromTag: '@scope/nav@1.2.0',
    commits: [],
    dependencies: [],
  }
  let config: ReturnType<typeof createMockConfig>

  beforeEach(() => {
    vi.clearAllMocks()
    config = createMockConfig({
      bump: { type: 'patch' },
      social: {
        twitter: { enabled: true, onlyStable: true },
        slack: { enabled: true, onlyStable: true, channel: '#releases' },
      },
    })
    config.monorepo = {
      groups: [
        {
          name: 'main',
          title: 'Maz UI',
          versionMode: 'selective',
          packages: ['packages/*'],
        },
        {
          name: 'header',
          title: 'Header',
          versionMode: 'independent',
          packages: ['shared/*'],
        },
      ],
    }
    vi.mocked(loadRelizyConfig).mockImplementation(options => Promise.resolve(options?.baseConfig ?? config))
    vi.mocked(executeHook).mockResolvedValue(undefined)
    vi.mocked(getTwitterCredentials).mockReturnValue({
      apiKey: 'key',
      apiKeySecret: 'secret',
      accessToken: 'token',
      accessTokenSecret: 'secret',
    })
    vi.mocked(getSlackToken).mockReturnValue('slack-token')
    vi.mocked(getSlackWebhookUrl).mockReturnValue(null)
    // The packages of the independent group
    vi.mocked(getPackagesOrBumpedPackages).mockImplementation(({ config: groupConfig }) => Promise.resolve(groupConfig.monorepo?.versionMode === 'independent'
      ? [nav]
      : []) as any)
    vi.mocked(resolveTags).mockResolvedValue({ from: 'v6.19.1', to: 'v7.0.0' })
    vi.mocked(getRootPackage).mockResolvedValue({
      name: 'root',
      version: '7.0.0',
      path: '/root',
      private: false,
      fromTag: 'v6.19.1',
      commits: [],
    })
    vi.mocked(generateChangelog).mockResolvedValue('### 🚀 Features\n\n- **menu:** Add a menu')
    vi.mocked(isPrerelease).mockImplementation((version?: string) => (version ?? '').includes('-'))
    vi.mocked(postReleaseToTwitter).mockResolvedValue(undefined)
    vi.mocked(postReleaseToSlack).mockResolvedValue(undefined)
  })

  it('Then posts once per platform, with a section per group, and runs the hooks once', async () => {
    const result = await social({
      bumpResult: {
        bumped: true,
        bumpedPackages: [nav],
        groups: [headerGroup, mainGroup],
      },
    })

    const variables = expect.objectContaining({
      releaseTitle: 'New releases of test-package',
      newVersion: '',
      packageList: '@scope/nav@1.3.0',
      releaseUrl: 'https://example.com/release',
    })
    expect(postReleaseToTwitter).toHaveBeenCalledTimes(1)
    expect(postReleaseToTwitter).toHaveBeenCalledWith(expect.objectContaining({
      variables,
      changelog: [
        {
          title: 'Maz UI 7.0.0',
          highlights: ['menu: Add a menu'],
        },
        {
          title: 'Header',
          packages: [
            {
              label: '@scope/nav 1.3.0',
              highlights: ['menu: Add a menu'],
            },
          ],
        },
      ],
    }))
    expect(postReleaseToSlack).toHaveBeenCalledTimes(1)
    expect(postReleaseToSlack).toHaveBeenCalledWith(expect.objectContaining({
      variables,
      changelog: [
        { title: 'Maz UI 7.0.0', changelog: '### 🚀 Features\n\n- **menu:** Add a menu' },
        {
          title: 'Header',
          packages: [
            {
              name: '@scope/nav',
              oldVersion: '1.2.0',
              newVersion: '1.3.0',
              changelog: '### 🚀 Features\n\n- **menu:** Add a menu',
            },
          ],
        },
      ],
      packages: [
        {
          name: '@scope/nav',
          oldVersion: '1.2.0',
          newVersion: '1.3.0',
          version: '1.3.0',
          hasTransition: true,
        },
      ],
    }))
    // The release URL links to the release of the unified/selective group
    expect(getReleaseUrl).toHaveBeenCalledWith(expect.anything(), 'v7.0.0')
    // The hooks of a platform get what it posts
    expect(executeHook).toHaveBeenCalledWith('before:twitter', expect.any(Object), false, {
      bumpResult: expect.objectContaining({
        groups: [headerGroup, mainGroup],
      }),
      release: expect.objectContaining({
        groups: [
          expect.objectContaining({ title: 'Maz UI' }),
          expect.objectContaining({ title: 'Header' }),
        ],
      }),
    })
    for (const hook of [
      'before:social',
      'before:twitter',
      'before:slack',
      'success:social',
    ]) {
      expect(vi.mocked(executeHook).mock.calls.filter(([name]) => name === hook)).toHaveLength(1)
    }
    expect(result).toEqual({
      results: [
        { platform: 'twitter', success: true },
        { platform: 'slack', success: true },
      ],
      hasErrors: false,
    })
  })

  it('Then announces a single group as a single version', async () => {
    await social({
      bumpResult: {
        bumped: true,
        bumpedPackages: [],
        groups: [mainGroup],
      },
    })

    expect(postReleaseToSlack).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({ releaseTitle: 'test-package 7.0.0 is out!', newVersion: '7.0.0' }),
      changelog: '### 🚀 Features\n\n- **menu:** Add a menu',
    }))
  })

  it('Then leaves out the groups with release.social disabled', async () => {
    config.monorepo!.groups![1] = {
      ...config.monorepo!.groups![1]!,
      release: { social: false },
    }

    await social({
      bumpResult: {
        bumped: true,
        bumpedPackages: [nav],
        groups: [mainGroup, headerGroup],
      },
    })

    expect(getPackagesOrBumpedPackages).not.toHaveBeenCalled()
    expect(postReleaseToSlack).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({ releaseTitle: 'test-package 7.0.0 is out!' }),
    }))
  })

  it('Then posts nothing when every group is left out', async () => {
    config.monorepo!.groups = config.monorepo!.groups!.map(group => ({
      ...group,
      release: { social: false },
    }))

    const result = await social({
      bumpResult: {
        bumped: true,
        bumpedPackages: [nav],
        groups: [mainGroup, headerGroup],
      },
    })

    expect(postReleaseToTwitter).not.toHaveBeenCalled()
    expect(postReleaseToSlack).not.toHaveBeenCalled()
    expect(result).toEqual({ results: [], hasErrors: false })
  })

  it('Then leaves the prereleases out of the posts with onlyStable', async () => {
    const beta = { ...nav, newVersion: '1.3.0-beta.0' }
    vi.mocked(getPackagesOrBumpedPackages).mockImplementation(({ config: groupConfig }) => Promise.resolve(groupConfig.monorepo?.versionMode === 'independent'
      ? [beta]
      : []) as any)

    await social({
      bumpResult: {
        bumped: true,
        bumpedPackages: [beta],
        groups: [mainGroup, headerGroup],
      },
    })

    expect(postReleaseToTwitter).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({ releaseTitle: 'test-package 7.0.0 is out!', packageList: '' }),
      changelog: '### 🚀 Features\n\n- **menu:** Add a menu',
    }))
  })

  it('Then rewrites the changelogs of every group in one AI call per platform', async () => {
    config.ai = {
      ...config.ai,
      social: {
        twitter: { enabled: true },
        slack: { enabled: true },
      },
    }
    vi.mocked(generateAISocialReleases).mockResolvedValue(new Map([
      ['1', 'A brand new menu'],
      ['2', 'Menus everywhere'],
    ]))

    await social({
      bumpResult: {
        bumped: true,
        bumpedPackages: [nav],
        groups: [mainGroup, headerGroup],
      },
    })

    expect(generateAISocialReleases).toHaveBeenCalledTimes(2)
    expect(generateAISocialReleases).toHaveBeenCalledWith(expect.objectContaining({
      platform: 'twitter',
      releases: [
        {
          id: '1',
          title: 'Maz UI 7.0.0',
          body: '### 🚀 Features\n\n- **menu:** Add a menu',
          highlights: 3,
        },
        {
          id: '2',
          title: '@scope/nav 1.3.0',
          body: '### 🚀 Features\n\n- **menu:** Add a menu',
          highlights: 1,
        },
      ],
    }))
    expect(postReleaseToTwitter).toHaveBeenCalledWith(expect.objectContaining({
      changelog: [
        {
          title: 'Maz UI 7.0.0',
          highlights: ['A brand new menu'],
        },
        {
          title: 'Header',
          packages: [
            {
              label: '@scope/nav 1.3.0',
              highlights: ['Menus everywhere'],
            },
          ],
        },
      ],
    }))
    expect(postReleaseToSlack).toHaveBeenCalledWith(expect.objectContaining({
      changelog: [
        { title: 'Maz UI 7.0.0', changelog: 'A brand new menu' },
        {
          title: 'Header',
          packages: [
            expect.objectContaining({ changelog: 'Menus everywhere' }),
          ],
        },
      ],
    }))
    expect(generateAISocialChangelog).not.toHaveBeenCalled()
  })

  it('Then sends only the stable versions of a post to the AI, the prereleases keep their raw changelog', async () => {
    const beta = { ...nav, newVersion: '1.3.0-beta.0' }
    vi.mocked(getPackagesOrBumpedPackages).mockImplementation(({ config: groupConfig }) => Promise.resolve(groupConfig.monorepo?.versionMode === 'independent'
      ? [beta]
      : []) as any)
    config.social.twitter.enabled = false
    config.social.slack.onlyStable = false
    config.ai = {
      ...config.ai,
      social: {
        slack: { enabled: true },
      },
    }
    vi.mocked(generateAISocialReleases).mockResolvedValue(new Map([
      ['1', 'A brand new menu'],
    ]))

    await social({
      bumpResult: {
        bumped: true,
        bumpedPackages: [beta],
        groups: [mainGroup, headerGroup],
      },
    })

    expect(generateAISocialReleases).toHaveBeenCalledWith(expect.objectContaining({
      platform: 'slack',
      releases: [
        { id: '1', title: 'Maz UI 7.0.0', body: '### 🚀 Features\n\n- **menu:** Add a menu' },
      ],
    }))
    expect(postReleaseToSlack).toHaveBeenCalledWith(expect.objectContaining({
      changelog: [
        { title: 'Maz UI 7.0.0', changelog: 'A brand new menu' },
        {
          title: 'Header',
          packages: [
            expect.objectContaining({
              changelog: expect.stringContaining('Add a menu'),
            }),
          ],
        },
      ],
    }))
  })

  it('Then reports the errors of a platform', async () => {
    vi.mocked(postReleaseToSlack).mockRejectedValueOnce(new Error('Slack is down'))

    const result = await social({
      bumpResult: {
        bumped: true,
        bumpedPackages: [nav],
        groups: [mainGroup, headerGroup],
      },
    })

    expect(result.hasErrors).toBe(true)
    expect(executeHook).toHaveBeenCalledWith('error:social', expect.any(Object), false, anyHookContext)
  })

  describe('When Teams is enabled', () => {
    const releaseNotes = { title: '📖 Release notes', url: 'https://example.com/release' }
    const rootChangelog = { title: '📝 Changelog', url: 'https://github.com/owner/repo/blob/v7.0.0/CHANGELOG.md' }
    const navChangelog = { title: '📝 Changelog', url: 'https://github.com/owner/repo/blob/%40scope/nav%401.3.0/shared/nav/CHANGELOG.md' }
    const bumpResult = {
      bumped: true as const,
      bumpedPackages: [
        { ...nav, path: '/repo/shared/nav' },
      ],
      groups: [mainGroup, headerGroup],
    }

    beforeEach(() => {
      config.cwd = '/repo'
      config.repo = { provider: 'github', domain: 'github.com', repo: 'owner/repo' }
      config.social = {
        twitter: { enabled: false },
        slack: { enabled: false },
        teams: {
          enabled: true,
          webhookUrl: 'https://example.logic.azure.com/workflows/1?sig=secret',
          onlyStable: true,
          cards: 'version',
          changelog: 'none',
        },
      } as unknown as typeof config.social
      vi.mocked(getPackagesOrBumpedPackages).mockImplementation(({ config: groupConfig }) => Promise.resolve(groupConfig.monorepo?.versionMode === 'independent'
        ? [
            { ...nav, path: '/repo/shared/nav' },
          ]
        : []) as any)
      vi.mocked(postReleaseToTeams).mockResolvedValue({ posted: 1 })
    })

    it('Then posts a card per version, with its release notes and its changelog', async () => {
      const result = await social({ bumpResult })

      expect(postReleaseToTeams).toHaveBeenCalledWith(expect.objectContaining({
        webhookUrl: 'https://example.logic.azure.com/workflows/1?sig=secret',
        cards: [
          {
            sections: [
              {
                title: 'Maz UI 7.0.0',
                message: 'A new version of **Maz UI** is available.',
                version: '7.0.0',
                changelog: '',
                links: [releaseNotes, rootChangelog],
                groupTitle: 'Maz UI',
                prerelease: false,
              },
            ],
          },
          {
            sections: [
              {
                title: '@scope/nav 1.3.0',
                message: 'A new version of **@scope/nav** is available.',
                version: '1.3.0',
                changelog: '',
                links: [releaseNotes, navChangelog],
                groupTitle: 'Header',
                prerelease: false,
              },
            ],
          },
        ],
      }))
      for (const hook of ['before:teams', 'success:teams']) {
        expect(vi.mocked(executeHook).mock.calls.filter(([name]) => name === hook)).toHaveLength(1)
      }
      expect(result).toEqual({
        results: [
          { platform: 'teams', success: true },
        ],
        hasErrors: false,
      })
    })

    it('Then announces only the versions of the announcements, a package entry over its group entry', async () => {
      config.social.teams = {
        ...config.social.teams,
        title: '{{name}} v{{newVersion}}',
        announcements: [
          {
            group: 'header',
            message: 'Shared component of {{groupTitle}}',
            links: [
              { title: '🎨 Storybook', url: 'https://{{shortName}}.example.com/' },
            ],
          },
          { package: '@scope/nav', title: '🧭 Navigation {{newVersion}}', changelogUrl: false },
        ],
      }

      await social({ bumpResult })

      expect(postReleaseToTeams).toHaveBeenCalledWith(expect.objectContaining({
        cards: [
          {
            sections: [
              expect.objectContaining({
                title: '🧭 Navigation 1.3.0',
                message: 'Shared component of Header',
                links: [
                  releaseNotes,
                  { title: '🎨 Storybook', url: 'https://nav.example.com/' },
                ],
              }),
            ],
          },
        ],
      }))
    })

    it('Then never announces the excluded versions, and posts nothing when none is left', async () => {
      config.social.teams = {
        ...config.social.teams,
        exclude: {
          groups: ['main'],
          packages: ['@scope/*'],
        },
      }

      const result = await social({ bumpResult })

      expect(postReleaseToTeams).not.toHaveBeenCalled()
      expect(result).toEqual({
        results: [
          { platform: 'teams', success: true, skipped: 'nothing to announce' },
        ],
        hasErrors: false,
      })
    })

    it('Then posts one card for the release with cards: release, with the summary of each changelog', async () => {
      config.social.teams = { ...config.social.teams, cards: 'release', changelog: 'summary' }

      await social({ bumpResult })

      expect(postReleaseToTeams).toHaveBeenCalledWith(expect.objectContaining({
        cards: [
          {
            title: 'New releases of test-package',
            sections: [
              expect.objectContaining({ title: 'Maz UI 7.0.0', changelog: '**🚀 Features**\n\n- **menu:** Add a menu' }),
              expect.objectContaining({ title: '@scope/nav 1.3.0', changelog: '**🚀 Features**\n\n- **menu:** Add a menu' }),
            ],
          },
        ],
      }))
    })

    it('Then puts the full changelog of each version in its card with changelog: full', async () => {
      config.social.teams = { ...config.social.teams, changelog: 'full' }
      vi.mocked(generateChangelog).mockImplementation(({ minify }) => Promise.resolve(minify ? '- Add a menu' : '### 🚀 Features\n\n- Add a menu\n\n  With its body'))

      await social({ bumpResult })

      expect(postReleaseToTeams).toHaveBeenCalledWith(expect.objectContaining({
        cards: [
          {
            sections: [
              expect.objectContaining({ title: 'Maz UI 7.0.0', changelog: '**🚀 Features**\n\n- Add a menu\n\n  With its body' }),
            ],
          },
          {
            sections: [
              expect.objectContaining({ title: '@scope/nav 1.3.0', changelog: '**🚀 Features**\n\n- Add a menu\n\n  With its body' }),
            ],
          },
        ],
      }))
    })

    it('Then rewrites the changelogs with the AI in a single call', async () => {
      config.social.teams = { ...config.social.teams, changelog: 'summary' }
      config.ai = {
        ...config.ai,
        social: {
          teams: { enabled: true },
        },
      }
      vi.mocked(generateAISocialReleases).mockResolvedValue(new Map([
        ['1', '- A brand new menu'],
        ['2', '- Menus everywhere'],
      ]))

      await social({ bumpResult })

      expect(generateAISocialReleases).toHaveBeenCalledWith(expect.objectContaining({ platform: 'teams' }))
      expect(postReleaseToTeams).toHaveBeenCalledWith(expect.objectContaining({
        cards: [
          {
            sections: [
              expect.objectContaining({ changelog: '- A brand new menu' }),
            ],
          },
          {
            sections: [
              expect.objectContaining({ changelog: '- Menus everywhere' }),
            ],
          },
        ],
      }))
    })

    it('Then reports a refused card without failing the command', async () => {
      vi.mocked(postReleaseToTeams).mockRejectedValue(new Error('Teams workflow failed: 404 Not Found'))

      const result = await social({ bumpResult })

      expect(result).toEqual({
        results: [
          { platform: 'teams', success: false, error: 'Error posting to Teams: Teams workflow failed: 404 Not Found' },
        ],
        hasErrors: true,
      })
      expect(executeHook).toHaveBeenCalledWith('error:teams', expect.any(Object), false, anyHookContext)
      expect(executeHook).toHaveBeenCalledWith('error:social', expect.any(Object), false, anyHookContext)
    })

    it('Then leaves out the prereleases with onlyStable', async () => {
      await social({
        bumpResult: {
          ...bumpResult,
          groups: [
            { ...mainGroup, newVersion: '7.0.0-beta.0' },
            headerGroup,
          ],
        },
      })

      expect(postReleaseToTeams).toHaveBeenCalledWith(expect.objectContaining({
        cards: [
          {
            sections: [
              expect.objectContaining({ title: '@scope/nav 1.3.0' }),
            ],
          },
        ],
      }))
    })
  })

  describe('When Slack and Twitter choose the versions they announce', () => {
    const bumpResult = {
      bumped: true as const,
      bumpedPackages: [
        { ...nav, path: '/repo/shared/nav' },
      ],
      groups: [mainGroup, headerGroup],
    }
    const changelog = '### 🚀 Features\n\n- **menu:** Add a menu'

    beforeEach(() => {
      config.cwd = '/repo'
      config.repo = { provider: 'github', domain: 'github.com', repo: 'owner/repo' }
      vi.mocked(getPackagesOrBumpedPackages).mockImplementation(({ config: groupConfig }) => Promise.resolve(groupConfig.monorepo?.versionMode === 'independent'
        ? [
            { ...nav, path: '/repo/shared/nav' },
          ]
        : []) as any)
    })

    it('Then posts on Slack the versions of the announcements, with their title, message and links', async () => {
      config.social.slack = {
        ...config.social.slack,
        announcements: [
          {
            group: 'main',
            title: 'Maz UI library',
            message: 'Version **{{newVersion}}** of {{name}}',
            changelogUrl: false,
            links: [
              { title: '🎨 Storybook', url: 'https://storybook.example.com/' },
            ],
          },
          { package: '@scope/nav', title: 'Navigation' },
        ],
      }

      await social({ bumpResult })

      expect(postReleaseToSlack).toHaveBeenCalledWith(expect.objectContaining({
        changelog: [
          {
            title: 'Maz UI library 7.0.0',
            message: 'Version **7.0.0** of Maz UI',
            links: [
              { title: '📖 Release notes', url: 'https://example.com/release' },
              { title: '🎨 Storybook', url: 'https://storybook.example.com/' },
            ],
            changelog,
          },
          {
            title: 'Header',
            packages: [
              {
                name: '@scope/nav',
                title: 'Navigation',
                message: undefined,
                links: [
                  { title: '📖 Release notes', url: 'https://example.com/release' },
                  { title: '📝 Changelog', url: 'https://github.com/owner/repo/blob/%40scope/nav%401.3.0/shared/nav/CHANGELOG.md' },
                ],
                oldVersion: '1.2.0',
                newVersion: '1.3.0',
                changelog,
              },
            ],
          },
        ],
      }))
    })

    it('Then announces a single version on Slack with its title in the header, its message and its links', async () => {
      config.social.slack = {
        ...config.social.slack,
        announcements: [
          {
            group: 'main',
            title: 'Maz UI library',
            message: 'Out now',
            changelogUrl: false,
          },
        ],
      }

      await social({ bumpResult })

      expect(postReleaseToSlack).toHaveBeenCalledWith(expect.objectContaining({
        variables: expect.objectContaining({ releaseTitle: 'Maz UI library 7.0.0 is out!', newVersion: '7.0.0' }),
        changelog,
        packages: [],
        announcement: {
          message: 'Out now',
          links: [
            { title: '📖 Release notes', url: 'https://example.com/release' },
          ],
        },
      }))
      // Twitter announces every version
      expect(postReleaseToTwitter).toHaveBeenCalledWith(expect.objectContaining({
        changelog: expect.any(Array),
      }))
    })

    it('Then leaves out the versions of exclude on Slack and Twitter, and skips a platform with none left', async () => {
      config.social.slack = {
        ...config.social.slack,
        exclude: {
          groups: ['main'],
          packages: ['@scope/*'],
        },
      }
      config.social.twitter = {
        ...config.social.twitter,
        exclude: {
          packages: ['@scope/nav'],
        },
      }

      const result = await social({ bumpResult })

      expect(postReleaseToSlack).not.toHaveBeenCalled()
      expect(postReleaseToTwitter).toHaveBeenCalledWith(expect.objectContaining({
        variables: expect.objectContaining({ releaseTitle: 'test-package 7.0.0 is out!', packageList: '' }),
        changelog,
      }))
      expect(result).toEqual({
        results: [
          { platform: 'twitter', success: true },
          { platform: 'slack', success: true, skipped: 'nothing to announce' },
        ],
        hasErrors: false,
      })
    })
  })
})

describe('Given the output of social in CI', () => {
  const twitter = {
    apiKey: 'key',
    apiKeySecret: 'secret',
    accessToken: 'token',
    accessTokenSecret: 'secret',
  }
  let output: ReturnType<typeof captureCliOutput>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadRelizyConfig).mockResolvedValue(createMockConfig({
      bump: { type: 'patch' },
      safetyCheck: false,
      tokens: { twitter, slack: 'slack-token' },
      social: {
        twitter: { enabled: true, onlyStable: true },
        slack: { enabled: true, onlyStable: true, channel: '#releases' },
      },
    }))
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
    vi.mocked(generateChangelog).mockResolvedValue('- Feature')
    vi.mocked(isPrerelease).mockReturnValue(false)
    vi.mocked(getTwitterCredentials).mockReturnValue(twitter)
    vi.mocked(getSlackToken).mockReturnValue('slack-token')
    vi.mocked(getSlackWebhookUrl).mockReturnValue(null)
    vi.mocked(collectContributorNames).mockReturnValue([])
    vi.mocked(postReleaseToTwitter).mockResolvedValue({
      data: { id: '123', text: 'tweet' },
    } as never)
    vi.mocked(postReleaseToSlack).mockResolvedValue(undefined)
    output = captureCliOutput()
  })

  afterEach(() => {
    output.restore()
  })

  it('Then tells the platforms it posted on, with the link of the tweet', async () => {
    const result = await social({
      bumpResult: { bumped: true, bumpedPackages: [] },
    })

    expect(result.results).toEqual([
      { platform: 'twitter', success: true, url: 'https://x.com/i/web/status/123' },
      { platform: 'slack', success: true },
    ])
    expect(output.lines()).toEqual(expect.arrayContaining([
      'relizy social · ci',
      expect.stringMatching(/^✔ Posted on twitter, slack {2}\d+ms$/),
      '  https://x.com/i/web/status/123',
      expect.stringMatching(/^✔ Posted on twitter, slack {2}\d+ms$/),
    ]))
  })

  it('Then marks a failed post without failing the command', async () => {
    vi.mocked(postReleaseToSlack).mockRejectedValue(new Error('channel_not_found'))

    const result = await social({
      bumpResult: { bumped: true, bumpedPackages: [] },
    })

    expect(result.hasErrors).toBe(true)
    expect(output.lines()).toEqual(expect.arrayContaining([
      expect.stringMatching(/^▲ Posted on twitter, slack failed {2}\d+ms$/),
      expect.stringMatching(/^✔ Posted on twitter {2}\d+ms$/),
    ]))
  })

  it('Then ends as failed when every post failed', async () => {
    vi.mocked(postReleaseToTwitter).mockRejectedValue(new Error('down'))
    vi.mocked(postReleaseToSlack).mockRejectedValue(new Error('down'))

    await social({
      bumpResult: { bumped: true, bumpedPackages: [] },
    })

    expect(output.lines().at(-1)).toMatch(/^▲ twitter, slack failed {2}\d+ms$/)
  })
})
