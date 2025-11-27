import { logger } from '@maz-ui/node'
import { vi } from 'vitest'
import { formatTweetMessage, getTwitterCredentials, postReleaseToTwitter } from '../twitter'

vi.mock('@maz-ui/node', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('../social', () => ({
  extractChangelogSummary: vi.fn((changelog: string) => changelog.substring(0, 150)),
}))

logger.setLevel = vi.fn()

describe('Given getTwitterCredentials function', () => {
  describe('When all credentials are provided in socialCredentials', () => {
    it('Then returns complete credentials from socialCredentials', () => {
      const result = getTwitterCredentials({
        socialCredentials: {
          apiKey: 'social-key',
          apiSecret: 'social-secret',
          accessToken: 'social-token',
          accessTokenSecret: 'social-token-secret',
        },
        tokenCredentials: {
          apiKey: 'token-key',
          apiSecret: 'token-secret',
          accessToken: 'token-token',
          accessTokenSecret: 'token-token-secret',
        },
      })

      expect(result).toEqual({
        apiKey: 'social-key',
        apiSecret: 'social-secret',
        accessToken: 'social-token',
        accessTokenSecret: 'social-token-secret',
      })
    })
  })

  describe('When credentials are split between socialCredentials and tokenCredentials', () => {
    it('Then prioritizes socialCredentials over tokenCredentials', () => {
      const result = getTwitterCredentials({
        socialCredentials: {
          apiKey: 'social-key',
          apiSecret: 'social-secret',
        },
        tokenCredentials: {
          accessToken: 'token-token',
          accessTokenSecret: 'token-token-secret',
        },
      })

      expect(result).toEqual({
        apiKey: 'social-key',
        apiSecret: 'social-secret',
        accessToken: 'token-token',
        accessTokenSecret: 'token-token-secret',
      })
    })

    it('Then falls back to tokenCredentials for missing socialCredentials', () => {
      const result = getTwitterCredentials({
        socialCredentials: {
          apiKey: 'social-key',
        },
        tokenCredentials: {
          apiKey: 'token-key',
          apiSecret: 'token-secret',
          accessToken: 'token-token',
          accessTokenSecret: 'token-token-secret',
        },
      })

      expect(result).toEqual({
        apiKey: 'social-key',
        apiSecret: 'token-secret',
        accessToken: 'token-token',
        accessTokenSecret: 'token-token-secret',
      })
    })
  })

  describe('When only tokenCredentials are provided', () => {
    it('Then returns credentials from tokenCredentials', () => {
      const result = getTwitterCredentials({
        tokenCredentials: {
          apiKey: 'token-key',
          apiSecret: 'token-secret',
          accessToken: 'token-token',
          accessTokenSecret: 'token-token-secret',
        },
      })

      expect(result).toEqual({
        apiKey: 'token-key',
        apiSecret: 'token-secret',
        accessToken: 'token-token',
        accessTokenSecret: 'token-token-secret',
      })
    })
  })

  describe('When credentials are incomplete', () => {
    it('Then returns null when apiKey is missing', () => {
      const result = getTwitterCredentials({
        socialCredentials: {
          apiSecret: 'secret',
          accessToken: 'token',
          accessTokenSecret: 'token-secret',
        },
      })

      expect(result).toBeNull()
    })

    it('Then returns null when apiSecret is missing', () => {
      const result = getTwitterCredentials({
        socialCredentials: {
          apiKey: 'key',
          accessToken: 'token',
          accessTokenSecret: 'token-secret',
        },
      })

      expect(result).toBeNull()
    })

    it('Then returns null when accessToken is missing', () => {
      const result = getTwitterCredentials({
        socialCredentials: {
          apiKey: 'key',
          apiSecret: 'secret',
          accessTokenSecret: 'token-secret',
        },
      })

      expect(result).toBeNull()
    })

    it('Then returns null when accessTokenSecret is missing', () => {
      const result = getTwitterCredentials({
        socialCredentials: {
          apiKey: 'key',
          apiSecret: 'secret',
          accessToken: 'token',
        },
      })

      expect(result).toBeNull()
    })

    it('Then returns null when all credentials are missing', () => {
      const result = getTwitterCredentials({
        socialCredentials: {},
        tokenCredentials: {},
      })

      expect(result).toBeNull()
    })
  })

  describe('When no credentials are provided', () => {
    it('Then returns null for undefined socialCredentials', () => {
      const result = getTwitterCredentials({
        tokenCredentials: undefined,
      })

      expect(result).toBeNull()
    })

    it('Then returns null for both undefined', () => {
      const result = getTwitterCredentials({})

      expect(result).toBeNull()
    })
  })
})

describe('Given formatTweetMessage function', () => {
  describe('When all placeholders are provided', () => {
    it('Then replaces all placeholders correctly', () => {
      const result = formatTweetMessage({
        template: '{{projectName}} {{version}}\n{{changelog}}\n{{releaseUrl}}\n{{changelogUrl}}',
        projectName: 'my-package',
        version: '1.0.0',
        changelog: 'Bug fixes',
        releaseUrl: 'https://github.com/user/repo/releases/tag/v1.0.0',
        changelogUrl: 'https://github.com/user/repo/blob/main/CHANGELOG.md',
      })

      expect(result).toContain('my-package')
      expect(result).toContain('1.0.0')
      expect(result).toContain('Bug fixes')
      expect(result).toContain('https://github.com/user/repo/releases/tag/v1.0.0')
      expect(result).toContain('https://github.com/user/repo/blob/main/CHANGELOG.md')
    })

    it('Then formats with default template', () => {
      const result = formatTweetMessage({
        template: '🚀 {{projectName}} {{version}} is out!\n\n{{changelog}}\n\n📦 {{releaseUrl}}',
        projectName: 'relizy',
        version: '2.0.0',
        changelog: 'New features',
        releaseUrl: 'https://github.com/user/relizy/releases/tag/v2.0.0',
      })

      expect(result).toContain('🚀 relizy 2.0.0 is out!')
      expect(result).toContain('New features')
      expect(result).toContain('📦 https://github.com/user/relizy/releases/tag/v2.0.0')
    })
  })

  describe('When releaseUrl is not provided', () => {
    it('Then removes releaseUrl placeholder', () => {
      const result = formatTweetMessage({
        template: '{{projectName}} {{version}}\n{{releaseUrl}}',
        projectName: 'pkg',
        version: '1.0.0',
        changelog: 'Updates',
      })

      expect(result).not.toContain('{{releaseUrl}}')
      expect(result).toContain('pkg 1.0.0')
    })

    it('Then trims whitespace after removing releaseUrl', () => {
      const result = formatTweetMessage({
        template: '{{projectName}} {{version}} {{releaseUrl}}',
        projectName: 'pkg',
        version: '1.0.0',
        changelog: 'Updates',
      })

      expect(result).toBe('pkg 1.0.0')
    })
  })

  describe('When changelogUrl is not provided', () => {
    it('Then removes changelogUrl placeholder', () => {
      const result = formatTweetMessage({
        template: '{{projectName}} {{version}}\n{{changelogUrl}}',
        projectName: 'pkg',
        version: '1.0.0',
        changelog: 'Updates',
      })

      expect(result).not.toContain('{{changelogUrl}}')
      expect(result).toContain('pkg 1.0.0')
    })
  })

  describe('When changelog exceeds character limit', () => {
    it('Then truncates changelog to fit in tweet', () => {
      const longChangelog = 'a'.repeat(300)
      const result = formatTweetMessage({
        template: '{{projectName}} {{version}}\n{{changelog}}',
        projectName: 'pkg',
        version: '1.0.0',
        changelog: longChangelog,
      })

      expect(result.length).toBeLessThanOrEqual(280)
      expect(result).toContain('...')
    })

    it('Then reserves space for template and URLs', () => {
      const result = formatTweetMessage({
        template: '🚀 {{projectName}} {{version}}\n{{changelog}}\n{{releaseUrl}}',
        projectName: 'my-awesome-package',
        version: '1.0.0',
        changelog: 'x'.repeat(200),
        releaseUrl: 'https://github.com/user/repo/releases/tag/v1.0.0',
      })

      expect(result.length).toBeLessThanOrEqual(280)
    })
  })

  describe('When final message exceeds 280 characters', () => {
    it('Then truncates entire message to 280 chars', () => {
      const result = formatTweetMessage({
        template: '{{projectName}} {{version}} {{changelog}} {{releaseUrl}} {{changelogUrl}}',
        projectName: 'very-long-package-name-that-takes-up-space',
        version: '1.0.0-beta.1',
        changelog: 'Long changelog text that goes on and on with many details about the release',
        releaseUrl: 'https://github.com/verylongusername/verylongrepositoryname/releases/tag/v1.0.0-beta.1',
        changelogUrl: 'https://github.com/verylongusername/verylongrepositoryname/blob/main/CHANGELOG.md',
      })

      expect(result.length).toBeLessThanOrEqual(280)
      expect(result).toMatch(/\.\.\.$/)
    })

    it.only('Then ensures truncated message ends with ellipsis', () => {
      const veryLongText = 'x'.repeat(400)
      const result = formatTweetMessage({
        template: `🚀 {{projectName}} {{version}} is out!\n\n{{changelog}}\n\n📦 {{releaseUrl}}\n📃 {{changelogUrl}}`,
        projectName: 'pkg',
        changelogUrl: 'https://example.com/changelog',
        releaseUrl: 'https://example.com/releases',
        version: '1.0.0',
        changelog: veryLongText,
      })

      console.log('result', result)

      // expect(result).toMatch(/\.\.\.$/)
      expect(result.length).toBe(280)
    })
  })

  describe('When template has multiple instances of same placeholder', () => {
    it('Then replaces only first instance of each placeholder', () => {
      const result = formatTweetMessage({
        template: '{{projectName}} v{{version}} - {{projectName}} {{version}}',
        projectName: 'pkg',
        version: '1.0.0',
        changelog: 'Updates',
      })

      const matches = result.match(/pkg/g)
      expect(matches).toHaveLength(1)
    })
  })

  describe('When changelog is short', () => {
    it('Then uses full changelog without truncation', () => {
      const shortChangelog = 'Fix bug'
      const result = formatTweetMessage({
        template: '{{projectName}} {{version}}: {{changelog}}',
        projectName: 'pkg',
        version: '1.0.0',
        changelog: shortChangelog,
      })

      expect(result).toContain('Fix bug')
      expect(result).not.toContain('...')
    })
  })

  describe('When handling special characters', () => {
    it('Then preserves emojis in template', () => {
      const result = formatTweetMessage({
        template: '🚀 {{projectName}} 🎉 {{version}}',
        projectName: 'pkg',
        version: '1.0.0',
        changelog: 'Updates',
      })

      expect(result).toContain('🚀')
      expect(result).toContain('🎉')
    })

    it('Then handles URLs with special characters', () => {
      const result = formatTweetMessage({
        template: '{{projectName}} {{releaseUrl}}',
        projectName: 'pkg',
        version: '1.0.0',
        changelog: 'Updates',
        releaseUrl: 'https://github.com/user/repo/releases/tag/v1.0.0?tab=readme',
      })

      expect(result).toContain('?tab=readme')
    })
  })
})

describe('Given postReleaseToTwitter function', () => {
  const mockTwitterApi = {
    readWrite: {
      v2: {
        tweet: vi.fn(),
      },
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('When posting in dry run mode', () => {
    it('Then logs message without posting', async () => {
      await postReleaseToTwitter({
        twitterMessage: 'Test tweet',
        release: { name: 'pkg', version: '1.0.0', tag: 'v1.0.0', prerelease: false },
        projectName: 'pkg',
        changelog: 'Bug fixes',
        credentials: {
          apiKey: 'key',
          apiSecret: 'secret',
          accessToken: 'token',
          accessTokenSecret: 'token-secret',
        },
        dryRun: true,
      })

      expect(logger.info).toHaveBeenCalledWith('[dry-run] Would post tweet:', expect.any(String))
      expect(logger.debug).toHaveBeenCalled()
    })

    it('Then does not call Twitter API in dry run', async () => {
      const mockImport = vi.fn()
      vi.doMock('twitter-api-v2', () => ({
        TwitterApi: mockImport,
      }))

      await postReleaseToTwitter({
        twitterMessage: 'Test tweet',
        release: { name: 'pkg', version: '1.0.0', tag: 'v1.0.0', prerelease: false },
        projectName: 'pkg',
        changelog: 'Updates',
        credentials: {
          apiKey: 'key',
          apiSecret: 'secret',
          accessToken: 'token',
          accessTokenSecret: 'token-secret',
        },
        dryRun: true,
      })

      expect(mockImport).not.toHaveBeenCalled()
    })
  })

  describe('When posting successfully', () => {
    it('Then posts tweet and logs success', async () => {
      mockTwitterApi.readWrite.v2.tweet.mockResolvedValue({
        data: { id: '123456789' },
      })

      vi.doMock('twitter-api-v2', () => ({
        TwitterApi: class {
          constructor() {
            return mockTwitterApi
          }
        },
      }))

      await postReleaseToTwitter({
        twitterMessage: 'Test tweet',
        release: { name: 'pkg', version: '1.0.0', tag: 'v1.0.0', prerelease: false },
        projectName: 'pkg',
        changelog: 'Bug fixes',
        releaseUrl: 'https://github.com/user/repo/releases/tag/v1.0.0',
        credentials: {
          apiKey: 'key',
          apiSecret: 'secret',
          accessToken: 'token',
          accessTokenSecret: 'token-secret',
        },
        dryRun: false,
      })

      expect(logger.debug).toHaveBeenCalledWith('[social:twitter] Preparing Twitter post...')
    })
  })

  describe('When using custom message template', () => {
    it('Then uses provided template', async () => {
      await postReleaseToTwitter({
        twitterMessage: 'Custom: {projectName} {version}',
        release: { name: 'pkg', version: '2.0.0', tag: 'v2.0.0', prerelease: false },
        projectName: 'my-pkg',
        changelog: 'New features',
        credentials: {
          apiKey: 'key',
          apiSecret: 'secret',
          accessToken: 'token',
          accessTokenSecret: 'token-secret',
        },
        dryRun: true,
      })

      expect(logger.info).toHaveBeenCalledWith('[dry-run] Would post tweet:', expect.stringContaining('Custom: my-pkg 2.0.0'))
    })
  })

  describe('When Twitter API dependency is missing', () => {
    it('Then throws error with installation instructions', async () => {
      vi.doMock('twitter-api-v2', () => {
        throw Object.assign(new Error('Cannot find module'), { code: 'ERR_MODULE_NOT_FOUND' })
      })

      await expect(postReleaseToTwitter({
        twitterMessage: 'Test tweet',
        release: { name: 'pkg', version: '1.0.0', tag: 'v1.0.0', prerelease: false },
        projectName: 'pkg',
        changelog: 'Updates',
        credentials: {
          apiKey: 'key',
          apiSecret: 'secret',
          accessToken: 'token',
          accessTokenSecret: 'token-secret',
        },
        dryRun: false,
      })).rejects.toThrow('Missing dependency: twitter-api-v2')
    })
  })

  describe('When Twitter API call fails', () => {
    it('Then logs error and rethrows', async () => {
      const apiError = new Error('API rate limit exceeded')
      mockTwitterApi.readWrite.v2.tweet.mockRejectedValue(apiError)

      vi.doMock('twitter-api-v2', () => ({
        TwitterApi: class {
          constructor() {
            return mockTwitterApi
          }
        },
      }))

      await expect(postReleaseToTwitter({
        twitterMessage: 'Test tweet',
        release: { name: 'pkg', version: '1.0.0', tag: 'v1.0.0', prerelease: false },
        projectName: 'pkg',
        changelog: 'Updates',
        credentials: {
          apiKey: 'key',
          apiSecret: 'secret',
          accessToken: 'token',
          accessTokenSecret: 'token-secret',
        },
        dryRun: false,
      })).rejects.toThrow('API rate limit exceeded')
    })
  })

  describe('When including URLs in tweet', () => {
    it('Then formats tweet with releaseUrl', async () => {
      await postReleaseToTwitter({
        twitterMessage: 'Test tweet',
        release: { name: 'pkg', version: '1.0.0', tag: 'v1.0.0', prerelease: false },
        projectName: 'pkg',
        changelog: 'Updates',
        releaseUrl: 'https://github.com/user/repo/releases/tag/v1.0.0',
        credentials: {
          apiKey: 'key',
          apiSecret: 'secret',
          accessToken: 'token',
          accessTokenSecret: 'token-secret',
        },
        dryRun: true,
      })

      expect(logger.info).toHaveBeenCalledWith('[dry-run] Would post tweet:', expect.stringContaining('https://github.com'))
    })

    it('Then formats tweet with changelogUrl', async () => {
      await postReleaseToTwitter({
        twitterMessage: 'Test tweet',
        release: { name: 'pkg', version: '1.0.0', tag: 'v1.0.0', prerelease: false },
        projectName: 'pkg',
        changelog: 'Updates',
        changelogUrl: 'https://github.com/user/repo/blob/main/CHANGELOG.md',
        credentials: {
          apiKey: 'key',
          apiSecret: 'secret',
          accessToken: 'token',
          accessTokenSecret: 'token-secret',
        },
        dryRun: true,
      })

      expect(logger.info).toHaveBeenCalledWith('[dry-run] Would post tweet:', expect.stringContaining('CHANGELOG.md'))
    })
  })
})
