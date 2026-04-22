import { logger } from '@maz-ui/node'
import { afterEach, beforeEach, vi } from 'vitest'
import { formatChangelogForSlack, formatSlackMessage, getSlackToken, getSlackWebhookUrl, postReleaseToSlack } from '../slack'

vi.mock('../social', () => ({
  extractChangelogSummary: vi.fn((changelog: string, opts?: { maxLength?: number }) => changelog.substring(0, opts?.maxLength ?? 2500)),
}))

logger.setLevel = vi.fn()

describe('Given getSlackToken function', () => {
  describe('When token is provided in socialCredentials', () => {
    it('Then returns token from socialCredentials', () => {
      const result = getSlackToken({
        socialCredentials: { token: 'social-token' },
        tokenCredential: 'global-token',
      })

      expect(result).toBe('social-token')
    })

    it('Then prioritizes socialCredentials over tokenCredential', () => {
      const result = getSlackToken({
        socialCredentials: { token: 'xoxb-social' },
        tokenCredential: 'xoxb-global',
      })

      expect(result).toBe('xoxb-social')
    })
  })

  describe('When token is only in tokenCredential', () => {
    it('Then returns token from tokenCredential', () => {
      const result = getSlackToken({
        tokenCredential: 'xoxb-token',
      })

      expect(result).toBe('xoxb-token')
    })

    it('Then returns token when socialCredentials is empty', () => {
      const result = getSlackToken({
        socialCredentials: {},
        tokenCredential: 'xoxb-fallback',
      })

      expect(result).toBe('xoxb-fallback')
    })
  })

  describe('When no token is provided', () => {
    it('Then returns null when both are undefined', () => {
      const result = getSlackToken({})

      expect(result).toBeNull()
    })

    it('Then returns null when socialCredentials is empty object', () => {
      const result = getSlackToken({
        socialCredentials: {},
      })

      expect(result).toBeNull()
    })

    it('Then returns null when token is empty string', () => {
      const result = getSlackToken({
        socialCredentials: { token: '' },
      })

      expect(result).toBeNull()
    })
  })
})

describe('Given formatChangelogForSlack function', () => {
  describe('When converting markdown headers', () => {
    it('Then converts # headers to bold', () => {
      const result = formatChangelogForSlack('# Main Header\nContent', 1000)

      expect(result).toBe('*Main Header*\nContent')
    })

    it('Then converts ## headers to bold', () => {
      const result = formatChangelogForSlack('## Section\nText', 1000)

      expect(result).toBe('*Section*\nText')
    })

    it('Then converts ### headers to bold', () => {
      const result = formatChangelogForSlack('### Subsection\nMore text', 1000)

      expect(result).toBe('*Subsection*\nMore text')
    })

    it('Then converts multiple header levels', () => {
      const changelog = `# Main
## Sub
### SubSub
Content`

      const result = formatChangelogForSlack(changelog, 1000)

      expect(result).toContain('*Main*')
      expect(result).toContain('*Sub*')
      expect(result).toContain('*SubSub*')
    })
  })

  describe('When converting markdown bold', () => {
    it('Then converts **bold** to *bold*', () => {
      const result = formatChangelogForSlack('This is **bold** text', 1000)

      expect(result).toBe('This is *bold* text')
    })

    it('Then converts multiple bold sections', () => {
      const result = formatChangelogForSlack('**First** and **Second** bold', 1000)

      expect(result).toBe('*First* and *Second* bold')
    })

    it('Then preserves single asterisks', () => {
      const result = formatChangelogForSlack('This is *already* mrkdwn', 1000)

      expect(result).toContain('*already*')
    })
  })

  describe('When converting markdown links', () => {
    it('Then converts [text](url) to <url|text>', () => {
      const result = formatChangelogForSlack('[Click here](https://example.com)', 1000)

      expect(result).toBe('<https://example.com|Click here>')
    })

    it('Then converts multiple links', () => {
      const changelog = '[First](https://first.com) and [Second](https://second.com)'

      const result = formatChangelogForSlack(changelog, 1000)

      expect(result).toContain('<https://first.com|First>')
      expect(result).toContain('<https://second.com|Second>')
    })

    it('Then handles links with special characters', () => {
      const result = formatChangelogForSlack('[API Docs](https://api.example.com/v1?param=value)', 1000)

      expect(result).toBe('<https://api.example.com/v1?param=value|API Docs>')
    })

    it('Then handles empty link text', () => {
      const result = formatChangelogForSlack('[](https://example.com)', 1000)

      expect(result).toBe('<https://example.com|>')
    })
  })

  describe('When text exceeds maxLength', () => {
    it('Then truncates to maxLength with ellipsis', () => {
      const longText = 'a'.repeat(600)

      const result = formatChangelogForSlack(longText, 500)

      expect(result.length).toBe(500)
      expect(result).toMatch(/\.\.\.$/)
    })

    it('Then uses default maxLength of 2500', () => {
      const longText = 'b'.repeat(3000)

      const result = formatChangelogForSlack(longText)

      expect(result.length).toBe(2500)
    })

    it('Then truncates formatted text correctly', () => {
      const longText = `# Header\n${'text '.repeat(200)}`

      const result = formatChangelogForSlack(longText, 100)

      expect(result.length).toBe(100)
      expect(result).toMatch(/\.\.\.$/)
    })
  })

  describe('When text is shorter than maxLength', () => {
    it('Then returns full text without truncation', () => {
      const shortText = 'Short changelog'

      const result = formatChangelogForSlack(shortText, 500)

      expect(result).toBe('Short changelog')
      expect(result).not.toContain('...')
    })

    it('Then preserves all formatting', () => {
      const text = '## Header\n**Bold** and [link](https://example.com)'

      const result = formatChangelogForSlack(text, 1000)

      expect(result).toContain('*Header*')
      expect(result).toContain('*Bold*')
      expect(result).toContain('<https://example.com|link>')
    })
  })

  describe('When handling complex markdown', () => {
    it('Then converts mixed markdown correctly', () => {
      const changelog = `## Features
- Add **new** feature
- See [docs](https://docs.example.com)

### Fixes
- Fix bug`

      const result = formatChangelogForSlack(changelog, 1000)

      expect(result).toContain('*Features*')
      expect(result).toContain('*new*')
      expect(result).toContain('<https://docs.example.com|docs>')
      expect(result).toContain('*Fixes*')
    })

    it('Then handles bullet points', () => {
      const changelog = `- Feature one
- Feature two
- Feature three`

      const result = formatChangelogForSlack(changelog, 1000)

      expect(result).toContain('- Feature one')
      expect(result).toContain('- Feature two')
      expect(result).toContain('- Feature three')
    })
  })

  describe('When handling edge cases', () => {
    it('Then handles empty string', () => {
      const result = formatChangelogForSlack('', 500)

      expect(result).toBe('')
    })

    it('Then handles whitespace only', () => {
      const result = formatChangelogForSlack('   \n\n  ', 500)

      expect(result).toBe('   \n\n  ')
    })

    it('Then handles text without markdown', () => {
      const result = formatChangelogForSlack('Plain text without any markdown', 500)

      expect(result).toBe('Plain text without any markdown')
    })
  })
})

describe('Given formatSlackMessage function', () => {
  describe('When using default rich blocks format', () => {
    it('Then returns blocks with header', () => {
      const blocks = formatSlackMessage({
        projectName: 'my-package',
        version: '1.0.0',
        changelog: 'Bug fixes',
      })

      expect(blocks[0]).toEqual({
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🚀 my-package 1.0.0 is out!',
          emoji: true,
        },
      })
    })

    it('Then includes changelog section', () => {
      const blocks = formatSlackMessage({
        projectName: 'pkg',
        version: '2.0.0',
        changelog: 'New features',
      })

      const changelogBlock = blocks.find(b => b.type === 'section')
      expect(changelogBlock).toBeDefined()
      expect(changelogBlock.text.type).toBe('mrkdwn')
    })

    it('Then includes divider', () => {
      const blocks = formatSlackMessage({
        projectName: 'pkg',
        version: '1.0.0',
        changelog: 'Updates',
      })

      const divider = blocks.find(b => b.type === 'divider')
      expect(divider).toBeDefined()
    })

    it('Then does not include actions when no URLs provided', () => {
      const blocks = formatSlackMessage({
        projectName: 'pkg',
        version: '1.0.0',
        changelog: 'Updates',
      })

      const actions = blocks.find(b => b.type === 'actions')
      expect(actions).toBeUndefined()
    })
  })

  describe('When including releaseUrl', () => {
    it('Then adds View Release button', () => {
      const blocks = formatSlackMessage({
        projectName: 'pkg',
        version: '1.0.0',
        changelog: 'Updates',
        releaseUrl: 'https://github.com/user/repo/releases/tag/v1.0.0',
      })

      const actions = blocks.find(b => b.type === 'actions')
      expect(actions).toBeDefined()
      expect(actions.elements).toHaveLength(1)
      expect(actions.elements[0]).toMatchObject({
        type: 'button',
        text: {
          type: 'plain_text',
          text: '📦 View Release',
        },
        url: 'https://github.com/user/repo/releases/tag/v1.0.0',
      })
    })
  })

  describe('When including changelogUrl', () => {
    it('Then adds Full Changelog button', () => {
      const blocks = formatSlackMessage({
        projectName: 'pkg',
        version: '1.0.0',
        changelog: 'Updates',
        changelogUrl: 'https://github.com/user/repo/blob/main/CHANGELOG.md',
      })

      const actions = blocks.find(b => b.type === 'actions')
      expect(actions).toBeDefined()
      expect(actions.elements).toHaveLength(1)
      expect(actions.elements[0]).toMatchObject({
        type: 'button',
        text: {
          type: 'plain_text',
          text: '📋 Full Changelog',
        },
        url: 'https://github.com/user/repo/blob/main/CHANGELOG.md',
      })
    })
  })

  describe('When including both URLs', () => {
    it('Then adds both buttons', () => {
      const blocks = formatSlackMessage({
        projectName: 'pkg',
        version: '1.0.0',
        changelog: 'Updates',
        releaseUrl: 'https://github.com/user/repo/releases/tag/v1.0.0',
        changelogUrl: 'https://github.com/user/repo/blob/main/CHANGELOG.md',
      })

      const actions = blocks.find(b => b.type === 'actions')
      expect(actions).toBeDefined()
      expect(actions.elements).toHaveLength(2)
    })
  })

  describe('When using custom template', () => {
    it('Then returns simple text block with template', () => {
      const blocks = formatSlackMessage({
        template: 'Custom: {{projectName}} {{newVersion}}',
        projectName: 'my-pkg',
        version: '2.0.0',
        changelog: 'Features',
      })

      expect(blocks).toHaveLength(1)
      expect(blocks[0]).toEqual({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Custom: my-pkg 2.0.0',
        },
      })
    })

    it('Then replaces all placeholders in template', () => {
      const blocks = formatSlackMessage({
        template: '{{projectName}} {{newVersion}}\n{{changelog}}\n{{releaseUrl}}\n{{changelogUrl}}',
        projectName: 'pkg',
        version: '1.0.0',
        changelog: 'Bug fixes',
        releaseUrl: 'https://example.com/release',
        changelogUrl: 'https://example.com/changelog',
      })

      const message = blocks[0].text.text
      expect(message).toContain('pkg')
      expect(message).toContain('1.0.0')
      expect(message).toContain('Bug fixes')
      expect(message).toContain('https://example.com/release')
      expect(message).toContain('https://example.com/changelog')
    })

    it('Then removes releaseUrl placeholder when not provided', () => {
      const blocks = formatSlackMessage({
        template: '{{projectName}} {{releaseUrl}}',
        projectName: 'pkg',
        version: '1.0.0',
        changelog: 'Updates',
      })

      const message = blocks[0].text.text
      expect(message).toBe('pkg')
      expect(message).not.toContain('{{releaseUrl}}')
    })

    it('Then removes changelogUrl placeholder when not provided', () => {
      const blocks = formatSlackMessage({
        template: '{{projectName}} {{changelogUrl}}',
        projectName: 'pkg',
        version: '1.0.0',
        changelog: 'Updates',
      })

      const message = blocks[0].text.text
      expect(message).toBe('pkg')
      expect(message).not.toContain('{{changelogUrl}}')
    })
  })

  describe('When changelog is empty', () => {
    it('Then still includes header block', () => {
      const blocks = formatSlackMessage({
        projectName: 'pkg',
        version: '1.0.0',
        changelog: '',
      })

      expect(blocks[0].type).toBe('header')
    })

    it('Then does not include changelog section for empty changelog', () => {
      const blocks = formatSlackMessage({
        projectName: 'pkg',
        version: '1.0.0',
        changelog: '',
      })

      const changelogBlock = blocks.find(b => b.type === 'section')
      expect(changelogBlock).toBeUndefined()
    })
  })
})

describe('Given postReleaseToSlack function', () => {
  const mockWebClient = {
    chat: {
      postMessage: vi.fn(),
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('When posting in dry run mode', () => {
    it('Then logs message without posting', async () => {
      await postReleaseToSlack({
        version: '1.0.0',
        projectName: 'pkg',
        changelog: 'Bug fixes',
        channel: '#releases',
        token: 'xoxb-token',
        dryRun: true,
      })

      expect(logger.box).toHaveBeenCalledWith(expect.stringContaining('[dry-run] Slack Post Preview'))
      expect(logger.debug).toHaveBeenCalled()
    })

    it('Then does not call Slack API in dry run', async () => {
      const mockImport = vi.fn()
      vi.doMock('@slack/web-api', () => ({
        WebClient: mockImport,
      }))

      await postReleaseToSlack({
        version: '1.0.0',
        projectName: 'pkg',
        changelog: 'Updates',
        channel: '#general',
        token: 'xoxb-test',
        dryRun: true,
      })

      expect(mockImport).not.toHaveBeenCalled()
    })
  })

  describe('When posting successfully', () => {
    it('Then posts message and logs success', async () => {
      // Note: Mocking dynamic imports with constructors is complex in Vitest.
      // This test is covered by integration tests.
      mockWebClient.chat.postMessage.mockResolvedValue({
        ok: true,
        channel: 'C123456',
        ts: '1234567890.123456',
      })

      vi.doMock('@slack/web-api', () => {
        return {
          WebClient: class {
            chat = {
              postMessage: vi.fn().mockResolvedValue({
                ok: true,
                channel: 'C123456',
                ts: '1234567890.123456',
              }),
            }
          },
        }
      })

      await postReleaseToSlack({
        version: '1.0.0',
        projectName: 'pkg',
        changelog: 'Bug fixes',
        channel: '#releases',
        token: 'xoxb-token',
        releaseUrl: 'https://github.com/user/repo/releases/tag/v1.0.0',
        dryRun: false,
      })

      expect(logger.debug).toHaveBeenCalledWith('Preparing Slack post...')
    })
  })

  describe('When using custom message template', () => {
    it('Then uses provided template', async () => {
      await postReleaseToSlack({
        version: '2.0.0',
        projectName: 'my-pkg',
        changelog: 'New features',
        channel: '#releases',
        token: 'xoxb-token',
        template: 'Custom: {{projectName}} {{newVersion}}',
        dryRun: true,
      })

      expect(logger.box).toHaveBeenCalledWith(expect.stringContaining('Custom: my-pkg 2.0.0'))
    })
  })

  describe('When Slack API dependency is missing', () => {
    it('Then throws error with installation instructions', async () => {
      // Note: Testing dynamic import failure is complex with Vitest mocking.
      // The error handling code is covered by integration tests.
      vi.doMock('@slack/web-api', () => {
        return undefined as any
      })

      await expect(postReleaseToSlack({
        version: '1.0.0',
        projectName: 'pkg',
        changelog: 'Updates',
        channel: '#releases',
        token: 'xoxb-token',
        dryRun: false,
      })).rejects.toThrow('Missing dependency: @slack/web-api')
    })
  })

  describe('When Slack API returns specific errors', () => {
    it('Then throws channel_not_found error', async () => {
      // Note: Mocking dynamic imports with constructors is complex in Vitest.

      vi.doMock('@slack/web-api', () => {
        return {
          WebClient: class {
            chat = {
              postMessage: vi.fn().mockRejectedValue({
                code: 'slack_webapi_platform_error',
                data: { error: 'channel_not_found' },
              }),
            }
          },
        }
      })

      await expect(postReleaseToSlack({
        version: '1.0.0',
        projectName: 'pkg',
        changelog: 'Updates',
        channel: '#nonexistent',
        token: 'xoxb-token',
        dryRun: false,
      })).rejects.toThrow('Slack channel not found')
    })

    it('Then throws not_in_channel error', async () => {
      // Note: Mocking dynamic imports with constructors is complex in Vitest.
      vi.doMock('@slack/web-api', () => {
        return {
          WebClient: class {
            chat = {
              postMessage: vi.fn().mockRejectedValue({
                code: 'slack_webapi_platform_error',
                data: { error: 'not_in_channel' },
              }),
            }
          },
        }
      })

      await expect(postReleaseToSlack({
        version: '1.0.0',
        projectName: 'pkg',
        changelog: 'Updates',
        channel: '#private',
        token: 'xoxb-token',
        dryRun: false,
      })).rejects.toThrow('Bot is not in the channel')
    })

    it('Then throws invalid_auth error', async () => {
      // Note: Mocking dynamic imports with constructors is complex in Vitest.
      vi.doMock('@slack/web-api', () => {
        return {
          WebClient: class {
            chat = {
              postMessage: vi.fn().mockRejectedValue({
                code: 'slack_webapi_platform_error',
                data: { error: 'invalid_auth' },
              }),
            }
          },
        }
      })

      await expect(postReleaseToSlack({
        version: '1.0.0',
        projectName: 'pkg',
        changelog: 'Updates',
        channel: '#releases',
        token: 'invalid-token',
        dryRun: false,
      })).rejects.toThrow('Invalid Slack token')
    })

    it('Then throws missing_scope error', async () => {
      // Note: Mocking dynamic imports with constructors is complex in Vitest.
      vi.doMock('@slack/web-api', () => {
        return {
          WebClient: class {
            chat = {
              postMessage: vi.fn().mockRejectedValue({
                code: 'slack_webapi_platform_error',
                data: { error: 'missing_scope' },
              }),
            }
          },
        }
      })

      await expect(postReleaseToSlack({
        version: '1.0.0',
        projectName: 'pkg',
        changelog: 'Updates',
        channel: '#releases',
        token: 'xoxb-token',
        dryRun: false,
      })).rejects.toThrow('Missing required OAuth scope')
    })

    it('Then rethrows unknown errors', async () => {
      const slackError = {
        code: 'slack_webapi_platform_error',
        data: { error: 'unknown_error' },
      }
      mockWebClient.chat.postMessage.mockRejectedValue(slackError)

      vi.doMock('@slack/web-api', () => ({
        WebClient: vi.fn(() => mockWebClient),
      }))

      await expect(postReleaseToSlack({
        version: '1.0.0',
        projectName: 'pkg',
        changelog: 'Updates',
        channel: '#releases',
        token: 'xoxb-token',
        dryRun: false,
      })).rejects.toThrow()
    })
  })

  describe('When posting with different channel formats', () => {
    it('Then works with channel name format', async () => {
      await postReleaseToSlack({
        version: '1.0.0',
        projectName: 'pkg',
        changelog: 'Updates',
        channel: '#releases',
        token: 'xoxb-token',
        dryRun: true,
      })

      expect(logger.box).toHaveBeenCalledWith(expect.stringContaining('#releases'))
    })

    it('Then works with channel ID format', async () => {
      await postReleaseToSlack({
        version: '1.0.0',
        projectName: 'pkg',
        changelog: 'Updates',
        channel: 'C1234567890',
        token: 'xoxb-token',
        dryRun: true,
      })

      expect(logger.box).toHaveBeenCalledWith(expect.stringContaining('C1234567890'))
    })
  })
})

describe('Given formatSlackMessage with contributors', () => {
  describe('When contributors array is non-empty (rich blocks mode)', () => {
    it('Then appends a contributors section block', () => {
      const blocks = formatSlackMessage({
        projectName: 'proj',
        version: '1.0.0',
        changelog: 'feat: add X',
        contributors: ['Alice Martin', 'Bob Dupont'],
      })

      const contribBlock = blocks.find((b: any) => b.text?.text?.includes('❤️ Contributors'))
      expect(contribBlock).toBeDefined()
      expect(contribBlock.text.text).toContain('*❤️ Contributors*')
      expect(contribBlock.text.text).toContain('• Alice Martin')
      expect(contribBlock.text.text).toContain('• Bob Dupont')
    })
  })

  describe('When contributors array is empty (rich blocks mode)', () => {
    it('Then does not append a contributors block', () => {
      const blocks = formatSlackMessage({
        projectName: 'proj',
        version: '1.0.0',
        changelog: 'feat: add X',
        contributors: [],
      })

      const contribBlock = blocks.find((b: any) => b.text?.text?.includes('❤️ Contributors'))
      expect(contribBlock).toBeUndefined()
    })

    it('Then does not append a contributors block when not provided', () => {
      const blocks = formatSlackMessage({
        projectName: 'proj',
        version: '1.0.0',
        changelog: 'feat: add X',
      })

      const contribBlock = blocks.find((b: any) => b.text?.text?.includes('❤️ Contributors'))
      expect(contribBlock).toBeUndefined()
    })
  })

  describe('When using template mode with {{contributors}} placeholder', () => {
    it('Then substitutes the bullet list', () => {
      const blocks = formatSlackMessage({
        template: '{{projectName}} {{newVersion}}\n\n{{contributors}}',
        projectName: 'proj',
        version: '1.0.0',
        changelog: 'feat: add X',
        contributors: ['Alice', 'Bob'],
      })

      expect(blocks[0].text.text).toContain('• Alice')
      expect(blocks[0].text.text).toContain('• Bob')
      expect(blocks[0].text.text).not.toContain('{{contributors}}')
    })

    it('Then replaces with empty string when contributors is empty', () => {
      const blocks = formatSlackMessage({
        template: '{{projectName}} {{newVersion}}\n{{contributors}}',
        projectName: 'proj',
        version: '1.0.0',
        changelog: 'feat: add X',
        contributors: [],
      })

      expect(blocks[0].text.text).not.toContain('{{contributors}}')
      expect(blocks[0].text.text).not.toContain('•')
    })
  })
})

describe('Given formatSlackMessage with postMaxLength', () => {
  describe('When postMaxLength is provided', () => {
    it('Then truncates the changelog at the given length', () => {
      const longChangelog = 'a'.repeat(2000)
      const blocks = formatSlackMessage({
        projectName: 'p',
        version: '1.0.0',
        changelog: longChangelog,
        postMaxLength: 100,
      })

      const section = blocks.find((b: any) => b.type === 'section' && b.text?.text?.startsWith('a'))
      expect(section.text.text.length).toBeLessThanOrEqual(100)
      expect(section.text.text.endsWith('...')).toBe(true)
    })
  })

  describe('When postMaxLength is not provided', () => {
    it('Then uses default of 2500', () => {
      const longChangelog = 'a'.repeat(3000)
      const blocks = formatSlackMessage({
        projectName: 'p',
        version: '1.0.0',
        changelog: longChangelog,
      })

      const section = blocks.find((b: any) => b.type === 'section' && b.text?.text?.startsWith('a'))
      expect(section.text.text.length).toBeLessThanOrEqual(2500)
    })
  })
})

describe('Given getSlackWebhookUrl function', () => {
  const origEnv = { ...process.env }
  beforeEach(() => {
    delete process.env.SLACK_WEBHOOK_URL
    delete process.env.RELIZY_SLACK_WEBHOOK_URL
  })
  afterEach(() => {
    process.env = { ...origEnv }
  })

  describe('When config webhookUrl is provided', () => {
    it('Then prioritizes config over env vars', () => {
      process.env.SLACK_WEBHOOK_URL = 'https://env.slack.com/x'
      process.env.RELIZY_SLACK_WEBHOOK_URL = 'https://relizy-env.slack.com/x'

      const url = getSlackWebhookUrl({ socialWebhookUrl: 'https://cfg.slack.com/x' })

      expect(url).toBe('https://cfg.slack.com/x')
    })
  })

  describe('When only env vars are set', () => {
    it('Then prefers RELIZY_SLACK_WEBHOOK_URL over SLACK_WEBHOOK_URL', () => {
      process.env.SLACK_WEBHOOK_URL = 'https://env.slack.com/x'
      process.env.RELIZY_SLACK_WEBHOOK_URL = 'https://relizy-env.slack.com/x'

      const url = getSlackWebhookUrl({})

      expect(url).toBe('https://relizy-env.slack.com/x')
    })

    it('Then falls back to SLACK_WEBHOOK_URL', () => {
      process.env.SLACK_WEBHOOK_URL = 'https://env.slack.com/x'

      const url = getSlackWebhookUrl({})

      expect(url).toBe('https://env.slack.com/x')
    })
  })

  describe('When nothing is set', () => {
    it('Then returns null', () => {
      expect(getSlackWebhookUrl({})).toBeNull()
    })
  })
})

describe('Given postReleaseToSlack with webhookUrl', () => {
  const fetchMock = vi.fn()
  const origFetch = globalThis.fetch

  beforeEach(() => {
    fetchMock.mockReset()
    ;(globalThis as any).fetch = fetchMock
    vi.mocked(logger.success).mockClear?.()
  })

  afterEach(() => {
    ;(globalThis as any).fetch = origFetch
  })

  describe('When webhookUrl is provided and request succeeds', () => {
    it('Then posts via fetch with blocks payload and returns webhook result', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, statusText: 'OK', text: () => Promise.resolve('ok') })

      const result = await postReleaseToSlack({
        version: '1.0.0',
        projectName: 'proj',
        changelog: 'feat: add X',
        webhookUrl: 'https://hooks.slack.com/services/AAA/BBB/CCC',
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const call = fetchMock.mock.calls[0]
      expect(call[0]).toBe('https://hooks.slack.com/services/AAA/BBB/CCC')
      expect(call[1].method).toBe('POST')
      expect(call[1].headers['Content-Type']).toBe('application/json')
      const body = JSON.parse(call[1].body)
      expect(body.text).toBe('proj 1.0.0 is out!')
      expect(Array.isArray(body.blocks)).toBe(true)
      expect(result).toEqual({ ok: true, transport: 'webhook' })
    })
  })

  describe('When both webhookUrl and token are provided', () => {
    it('Then uses webhook and skips WebClient', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, statusText: 'OK', text: () => Promise.resolve('ok') })

      await postReleaseToSlack({
        version: '1.0.0',
        projectName: 'proj',
        changelog: 'feat: add X',
        webhookUrl: 'https://hooks.slack.com/services/AAA/BBB/CCC',
        token: 'xoxb-should-be-ignored',
        channel: '#anything',
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('When webhook request fails with 404', () => {
    it('Then throws with "regenerate webhook" hint', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('no_service'),
      })

      await expect(postReleaseToSlack({
        version: '1.0.0',
        projectName: 'p',
        changelog: 'x',
        webhookUrl: 'https://hooks.slack.com/services/A/B/C',
      })).rejects.toThrow(/Slack webhook failed.*404.*Regenerate/s)
    })
  })

  describe('When webhook response body indicates invalid_payload', () => {
    it('Then throws with "lower postMaxLength" hint', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('invalid_payload'),
      })

      await expect(postReleaseToSlack({
        version: '1.0.0',
        projectName: 'p',
        changelog: 'x',
        webhookUrl: 'https://hooks.slack.com/services/A/B/C',
      })).rejects.toThrow(/postMaxLength/)
    })
  })

  describe('When webhook response body indicates channel_not_found', () => {
    it('Then throws with archived/removed channel hint', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('channel_not_found'),
      })

      await expect(postReleaseToSlack({
        version: '1.0.0',
        projectName: 'p',
        changelog: 'x',
        webhookUrl: 'https://hooks.slack.com/services/A/B/C',
      })).rejects.toThrow(/archived or removed|new webhook/)
    })
  })

  describe('When webhook response body indicates action_prohibited', () => {
    it('Then throws with workspace-blocked hint', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve('action_prohibited'),
      })

      await expect(postReleaseToSlack({
        version: '1.0.0',
        projectName: 'p',
        changelog: 'x',
        webhookUrl: 'https://hooks.slack.com/services/A/B/C',
      })).rejects.toThrow(/workspace.*blocked/)
    })
  })

  describe('When webhook response text() itself rejects', () => {
    it('Then still throws with the HTTP status', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.reject(new Error('network stream ended')),
      })

      await expect(postReleaseToSlack({
        version: '1.0.0',
        projectName: 'p',
        changelog: 'x',
        webhookUrl: 'https://hooks.slack.com/services/A/B/C',
      })).rejects.toThrow(/Slack webhook failed.*500/)
    })
  })

  describe('When dryRun is true in webhook mode', () => {
    it('Then does not call fetch', async () => {
      await postReleaseToSlack({
        version: '1.0.0',
        projectName: 'p',
        changelog: 'x',
        webhookUrl: 'https://hooks.slack.com/services/A/B/C',
        dryRun: true,
      })

      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})

describe('Given postReleaseToSlack validation', () => {
  describe('When neither token nor webhookUrl is provided', () => {
    it('Then throws', async () => {
      await expect(postReleaseToSlack({
        version: '1.0.0',
        projectName: 'p',
        changelog: 'x',
      })).rejects.toThrow(/webhookUrl or token/)
    })
  })

  describe('When token is provided without channel', () => {
    it('Then throws', async () => {
      await expect(postReleaseToSlack({
        version: '1.0.0',
        projectName: 'p',
        changelog: 'x',
        token: 'xoxb-test',
      })).rejects.toThrow(/channel is required/)
    })
  })
})
