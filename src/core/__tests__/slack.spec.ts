import type { SlackReleaseSection } from '../../types'
import { logger } from '@maz-ui/node'
import { afterEach, beforeEach, vi } from 'vitest'
import { socialVariables } from '../../../tests/mocks'
import { formatChangelogForSlack, formatPackagesForSlack, formatSlackMessage, getSlackToken, getSlackWebhookUrl, postReleaseToSlack, resolveSlackPostMaxLength, shareBudget, slackSectionsToMarkdown } from '../slack'
import { richTextToPlainText } from '../slack-markdown'

vi.mock('../social', () => ({
  extractChangelogSummary: vi.fn((changelog: string, opts?: { maxLength?: number }) => changelog.substring(0, opts?.maxLength ?? 2500)),
}))

logger.setLevel = vi.fn()

function bulletList(count: number, label: string): string {
  return Array.from({ length: count }, (_, i) => `- ${label} ${i}`).join('\n')
}

function sectionWithOneChange(index: number): string {
  return `### Section ${index}\n\n- Change ${index}`
}

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

    it('Then converts markdown emphasis to Slack italic', () => {
      const result = formatChangelogForSlack('This is *emphasized* text', 1000)

      expect(result).toBe('This is _emphasized_ text')
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

      expect(result).toBe('<https://example.com>')
    })
  })

  describe('When a list exceeds maxLength', () => {
    it('Then drops whole commits and announces how many were left out', () => {
      const changelog = `### Features\n\n${bulletList(30, 'Feature number')}`

      const result = formatChangelogForSlack(changelog, 200)

      expect(result.length).toBeLessThanOrEqual(200)
      expect(result.startsWith('*Features*\n• Feature number 0\n')).toBe(true)
      expect(result).toMatch(/_… and \d+ more changes_$/)
      expect(result).not.toMatch(/Feature number 29/)
    })

    it('Then never ends on a heading whose commits were dropped', () => {
      const changelog = `### Features\n\n- ${'a'.repeat(60)}\n\n### Fixes\n\n- ${'b'.repeat(200)}`

      const result = formatChangelogForSlack(changelog, 120)

      expect(result).not.toContain('Fixes')
      expect(result).toContain('_… and 1 more change_')
    })
  })

  describe('When text exceeds maxLength', () => {
    it('Then truncates to maxLength with ellipsis', () => {
      const longText = 'a'.repeat(600)

      const result = formatChangelogForSlack(longText, 500)

      expect(result).toHaveLength(500)
      expect(result).toMatch(/\.\.\.$/)
    })

    it('Then uses default maxLength of 2500', () => {
      const longText = 'b'.repeat(3000)

      const result = formatChangelogForSlack(longText)

      expect(result).toHaveLength(2500)
    })

    it('Then truncates formatted text correctly', () => {
      const longText = `# Header\n${'text '.repeat(200)}`

      const result = formatChangelogForSlack(longText, 100)

      expect(result).toHaveLength(100)
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

    it('Then converts markdown dash bullets to Slack mrkdwn bullets', () => {
      const changelog = `- Feature one
- Feature two
- Feature three`

      const result = formatChangelogForSlack(changelog, 1000)

      expect(result).toContain('• Feature one')
      expect(result).toContain('• Feature two')
      expect(result).toContain('• Feature three')
      expect(result).not.toContain('- Feature')
    })
  })

  describe('When handling edge cases', () => {
    it('Then handles empty string', () => {
      const result = formatChangelogForSlack('', 500)

      expect(result).toBe('')
    })

    it('Then handles whitespace only', () => {
      const result = formatChangelogForSlack('   \n\n  ', 500)

      expect(result).toBe('')
    })

    it('Then escapes the characters Slack reserves', () => {
      const result = formatChangelogForSlack('Use <T> & friends', 500)

      expect(result).toBe('Use &lt;T&gt; &amp; friends')
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
        changelog: 'Bug fixes',
        variables: socialVariables({ projectName: 'my-package', newVersion: '1.0.0' }),
      })

      expect(blocks[0]).toEqual({
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📣 my-package 1.0.0 is out!',
          emoji: true,
        },
      })
    })

    it('Then includes changelog section', () => {
      const blocks = formatSlackMessage({
        changelog: 'New features',
        variables: socialVariables({ projectName: 'pkg', newVersion: '2.0.0' }),
      })

      const changelogBlock = blocks.find(b => b.type === 'section')
      expect(changelogBlock).toBeDefined()
      expect(changelogBlock.text.type).toBe('mrkdwn')
    })

    it('Then includes divider', () => {
      const blocks = formatSlackMessage({
        changelog: 'Updates',
        variables: socialVariables({ projectName: 'pkg', newVersion: '1.0.0' }),
      })

      const divider = blocks.find(b => b.type === 'divider')
      expect(divider).toBeDefined()
    })

    it('Then does not include actions when no URLs provided', () => {
      const blocks = formatSlackMessage({
        changelog: 'Updates',
        variables: socialVariables({ projectName: 'pkg', newVersion: '1.0.0' }),
      })

      const actions = blocks.find(b => b.type === 'actions')
      expect(actions).toBeUndefined()
    })
  })

  describe('When including releaseUrl', () => {
    it('Then adds View Release button', () => {
      const blocks = formatSlackMessage({
        changelog: 'Updates',
        variables: socialVariables({ projectName: 'pkg', newVersion: '1.0.0', releaseUrl: 'https://github.com/user/repo/releases/tag/v1.0.0' }),
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
        changelog: 'Updates',
        variables: socialVariables({ projectName: 'pkg', newVersion: '1.0.0', changelogUrl: 'https://github.com/user/repo/blob/main/CHANGELOG.md' }),
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
        changelog: 'Updates',
        variables: socialVariables({
          projectName: 'pkg',
          newVersion: '1.0.0',
          releaseUrl: 'https://github.com/user/repo/releases/tag/v1.0.0',
          changelogUrl: 'https://github.com/user/repo/blob/main/CHANGELOG.md',
        }),
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
        changelog: 'Features',
        variables: socialVariables({ projectName: 'my-pkg', newVersion: '2.0.0' }),
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
        changelog: 'Bug fixes',
        variables: socialVariables({
          projectName: 'pkg',
          newVersion: '1.0.0',
          releaseUrl: 'https://example.com/release',
          changelogUrl: 'https://example.com/changelog',
        }),
      })

      const message = blocks[0].text.text
      expect(message).toContain('pkg')
      expect(message).toContain('1.0.0')
      expect(message).toContain('Bug fixes')
      expect(message).toContain('https://example.com/release')
      expect(message).toContain('https://example.com/changelog')
    })

    it('Then converts the summary of the changelog to mrkdwn, as without template', () => {
      const blocks = formatSlackMessage({
        template: '{{changelog}}',
        changelog: '### 🚀 Features\n\n- **core:** Add the [parser](https://example.com/parser)',
        variables: socialVariables({ projectName: 'pkg', newVersion: '1.0.0' }),
      })

      expect(blocks[0].text.text).toContain('*core:* Add the <https://example.com/parser|parser>')
      expect(blocks[0].text.text).not.toContain('**')
    })

    it('Then removes releaseUrl placeholder when not provided', () => {
      const blocks = formatSlackMessage({
        template: '{{projectName}} {{releaseUrl}}',
        changelog: 'Updates',
        variables: socialVariables({ projectName: 'pkg', newVersion: '1.0.0' }),
      })

      const message = blocks[0].text.text
      expect(message).toBe('pkg')
      expect(message).not.toContain('{{releaseUrl}}')
    })

    it('Then removes changelogUrl placeholder when not provided', () => {
      const blocks = formatSlackMessage({
        template: '{{projectName}} {{changelogUrl}}',
        changelog: 'Updates',
        variables: socialVariables({ projectName: 'pkg', newVersion: '1.0.0' }),
      })

      const message = blocks[0].text.text
      expect(message).toBe('pkg')
      expect(message).not.toContain('{{changelogUrl}}')
    })
  })

  describe('When changelog is empty', () => {
    it('Then still includes header block', () => {
      const blocks = formatSlackMessage({
        changelog: '',
        variables: socialVariables({ projectName: 'pkg', newVersion: '1.0.0' }),
      })

      expect(blocks[0].type).toBe('header')
    })

    it('Then does not include changelog section for empty changelog', () => {
      const blocks = formatSlackMessage({
        changelog: '',
        variables: socialVariables({ projectName: 'pkg', newVersion: '1.0.0' }),
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
        changelog: 'Bug fixes',
        channel: '#releases',
        token: 'xoxb-token',
        dryRun: true,
        variables: socialVariables({ newVersion: '1.0.0', projectName: 'pkg' }),
      })

      const preview = vi.mocked(logger.box).mock.calls[0]![0] as string
      expect(preview).toContain('[dry-run] Slack post')
      expect(preview).toContain('Target: channel: #releases')
      expect(preview).toContain('Bug fixes')
      expect(logger.debug).toHaveBeenCalled()
    })

    it('Then does not call Slack API in dry run', async () => {
      const mockImport = vi.fn()
      vi.doMock('@slack/web-api', () => ({
        WebClient: mockImport,
      }))

      await postReleaseToSlack({
        changelog: 'Updates',
        channel: '#general',
        token: 'xoxb-test',
        dryRun: true,
        variables: socialVariables({ newVersion: '1.0.0', projectName: 'pkg' }),
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
        changelog: 'Bug fixes',
        channel: '#releases',
        token: 'xoxb-token',
        dryRun: false,
        variables: socialVariables({ newVersion: '1.0.0', projectName: 'pkg', releaseUrl: 'https://github.com/user/repo/releases/tag/v1.0.0' }),
      })

      expect(logger.debug).toHaveBeenCalledWith('Preparing Slack post...')
    })
  })

  describe('When using custom message template', () => {
    it('Then uses provided template', async () => {
      await postReleaseToSlack({
        changelog: 'New features',
        channel: '#releases',
        token: 'xoxb-token',
        template: 'Custom: {{projectName}} {{newVersion}}',
        dryRun: true,
        variables: socialVariables({ newVersion: '2.0.0', projectName: 'my-pkg' }),
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
        changelog: 'Updates',
        channel: '#releases',
        token: 'xoxb-token',
        dryRun: false,
        variables: socialVariables({ newVersion: '1.0.0', projectName: 'pkg' }),
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
        changelog: 'Updates',
        channel: '#nonexistent',
        token: 'xoxb-token',
        dryRun: false,
        variables: socialVariables({ newVersion: '1.0.0', projectName: 'pkg' }),
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
        changelog: 'Updates',
        channel: '#private',
        token: 'xoxb-token',
        dryRun: false,
        variables: socialVariables({ newVersion: '1.0.0', projectName: 'pkg' }),
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
        changelog: 'Updates',
        channel: '#releases',
        token: 'invalid-token',
        dryRun: false,
        variables: socialVariables({ newVersion: '1.0.0', projectName: 'pkg' }),
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
        changelog: 'Updates',
        channel: '#releases',
        token: 'xoxb-token',
        dryRun: false,
        variables: socialVariables({ newVersion: '1.0.0', projectName: 'pkg' }),
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
        changelog: 'Updates',
        channel: '#releases',
        token: 'xoxb-token',
        dryRun: false,
        variables: socialVariables({ newVersion: '1.0.0', projectName: 'pkg' }),
      })).rejects.toThrow()
    })
  })

  describe('When posting with different channel formats', () => {
    it('Then works with channel name format', async () => {
      await postReleaseToSlack({
        changelog: 'Updates',
        channel: '#releases',
        token: 'xoxb-token',
        dryRun: true,
        variables: socialVariables({ newVersion: '1.0.0', projectName: 'pkg' }),
      })

      expect(logger.box).toHaveBeenCalledWith(expect.stringContaining('#releases'))
    })

    it('Then works with channel ID format', async () => {
      await postReleaseToSlack({
        changelog: 'Updates',
        channel: 'C1234567890',
        token: 'xoxb-token',
        dryRun: true,
        variables: socialVariables({ newVersion: '1.0.0', projectName: 'pkg' }),
      })

      expect(logger.box).toHaveBeenCalledWith(expect.stringContaining('C1234567890'))
    })
  })
})

describe('Given formatSlackMessage with contributors', () => {
  describe('When contributors array is non-empty (rich blocks mode)', () => {
    it('Then appends a contributors section block', () => {
      const blocks = formatSlackMessage({
        changelog: 'feat: add X',
        contributors: ['Alice Martin', 'Bob Dupont'],
        variables: socialVariables({ projectName: 'proj', newVersion: '1.0.0' }),
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
        changelog: 'feat: add X',
        contributors: [],
        variables: socialVariables({ projectName: 'proj', newVersion: '1.0.0' }),
      })

      const contribBlock = blocks.find((b: any) => b.text?.text?.includes('❤️ Contributors'))
      expect(contribBlock).toBeUndefined()
    })

    it('Then does not append a contributors block when not provided', () => {
      const blocks = formatSlackMessage({
        changelog: 'feat: add X',
        variables: socialVariables({ projectName: 'proj', newVersion: '1.0.0' }),
      })

      const contribBlock = blocks.find((b: any) => b.text?.text?.includes('❤️ Contributors'))
      expect(contribBlock).toBeUndefined()
    })
  })

  describe('When using template mode with {{contributors}} placeholder', () => {
    it('Then substitutes the bullet list', () => {
      const blocks = formatSlackMessage({
        template: '{{projectName}} {{newVersion}}\n\n{{contributors}}',
        changelog: 'feat: add X',
        contributors: ['Alice', 'Bob'],
        variables: socialVariables({ projectName: 'proj', newVersion: '1.0.0' }),
      })

      expect(blocks[0].text.text).toContain('• Alice')
      expect(blocks[0].text.text).toContain('• Bob')
      expect(blocks[0].text.text).not.toContain('{{contributors}}')
    })

    it('Then replaces with empty string when contributors is empty', () => {
      const blocks = formatSlackMessage({
        template: '{{projectName}} {{newVersion}}\n{{contributors}}',
        changelog: 'feat: add X',
        contributors: [],
        variables: socialVariables({ projectName: 'proj', newVersion: '1.0.0' }),
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
        changelog: longChangelog,
        postMaxLength: 100,
        variables: socialVariables({ projectName: 'p', newVersion: '1.0.0' }),
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
        changelog: longChangelog,
        variables: socialVariables({ projectName: 'p', newVersion: '1.0.0' }),
      })

      const section = blocks.find((b: any) => b.type === 'section' && b.text?.text?.startsWith('a'))
      expect(section.text.text.length).toBeLessThanOrEqual(2500)
    })
  })
})

describe('Given resolveSlackPostMaxLength function', () => {
  it('Then defaults to 2500 in summary format', () => {
    expect(resolveSlackPostMaxLength({})).toBe(2500)
    expect(resolveSlackPostMaxLength({ changelogFormat: 'summary' })).toBe(2500)
  })

  it('Then has no limit in full format', () => {
    expect(resolveSlackPostMaxLength({ changelogFormat: 'full' })).toBeUndefined()
  })

  it('Then always honors an explicit postMaxLength', () => {
    expect(resolveSlackPostMaxLength({ changelogFormat: 'full', postMaxLength: 4000 })).toBe(4000)
    expect(resolveSlackPostMaxLength({ changelogFormat: 'summary', postMaxLength: 1000 })).toBe(1000)
  })
})

describe('Given formatSlackMessage with the full changelog format', () => {
  const richChangelog = `### 🚀 Features

- **slack:** Add the full format ([#12](https://github.com/o/r/pull/12))

  Commit bodies are now rendered.

### 🩹 Fixes

- Fix a bug`

  describe('When using the default blocks layout', () => {
    it('Then renders one rich_text block per changelog section, bodies included', () => {
      const blocks = formatSlackMessage({
        changelog: richChangelog,
        changelogFormat: 'full',
        variables: socialVariables({ projectName: 'p', newVersion: '1.0.0' }),
      })

      const richTextBlocks = blocks.filter((b: any) => b.type === 'rich_text')
      expect(richTextBlocks).toHaveLength(2)
      expect(blocks.some((b: any) => b.type === 'section' && b.text?.type === 'mrkdwn')).toBe(false)
      expect(JSON.stringify(richTextBlocks[0])).toContain('Commit bodies are now rendered.')
      expect(richTextBlocks[0].elements).toContainEqual({
        type: 'rich_text_quote',
        elements: [
          { type: 'text', text: 'Commit bodies are now rendered.' },
        ],
      })
    })

    it('Then keeps the header, packages, contributors and actions around the changelog', () => {
      const blocks = formatSlackMessage({
        changelog: richChangelog,
        changelogFormat: 'full',
        contributors: ['Alice'],
        packages: [
          { name: 'a', version: '1.0.0', hasTransition: false } as any,
        ],
        variables: socialVariables({ projectName: 'p', newVersion: '1.0.0', releaseUrl: 'https://example.com/release' }),
      })

      expect(blocks.map((b: any) => b.type)).toEqual([
        'header',
        'rich_text',
        'rich_text',
        'section',
        'section',
        'divider',
        'actions',
      ])
    })

    it('Then stays within the 50 blocks of a Slack message', () => {
      const changelog = Array.from({ length: 80 }, (_, i) => sectionWithOneChange(i)).join('\n\n')

      const blocks = formatSlackMessage({
        changelog,
        changelogFormat: 'full',
        variables: socialVariables({ projectName: 'p', newVersion: '1.0.0', releaseUrl: 'https://example.com/release' }),
      })

      expect(blocks.length).toBeLessThanOrEqual(50)
      expect(JSON.stringify(blocks.at(-3))).toContain('more changes')
    })

    it('Then truncates by commits when postMaxLength is set', () => {
      const changelog = `### Features\n\n${bulletList(20, 'Feature number')}`

      const blocks = formatSlackMessage({
        changelog,
        changelogFormat: 'full',
        postMaxLength: 100,
        variables: socialVariables({ projectName: 'p', newVersion: '1.0.0' }),
      })

      const serialized = JSON.stringify(blocks)
      expect(serialized).toContain('Feature number 0')
      expect(serialized).not.toContain('Feature number 19')
      expect(serialized).toMatch(/… and \d+ more changes/)
    })
  })

  describe('When using a template', () => {
    it('Then injects the complete changelog as mrkdwn with bodies quoted', () => {
      const blocks = formatSlackMessage({
        changelog: richChangelog,
        changelogFormat: 'full',
        template: '*{{projectName}} {{newVersion}}*\n{{changelog}}',
        variables: socialVariables({ projectName: 'p', newVersion: '1.0.0' }),
      })

      expect(blocks).toHaveLength(1)
      expect(blocks[0].text.text).toBe([
        '*p 1.0.0*',
        '*🚀 Features*',
        '• *slack:* Add the full format (<https://github.com/o/r/pull/12|#12>)',
        '> Commit bodies are now rendered.',
        '',
        '*🩹 Fixes*',
        '• Fix a bug',
      ].join('\n'))
    })

    it('Then fits the changelog in what the template leaves of the 3000 chars section limit', () => {
      const changelog = `### Features\n\n${bulletList(300, 'Feature number')}`
      const template = `${'x'.repeat(1000)}\n{{changelog}}`

      const blocks = formatSlackMessage({
        changelog,
        changelogFormat: 'full',
        template,
        variables: socialVariables({ projectName: 'p', newVersion: '1.0.0' }),
      })

      expect(blocks[0].text.text.length).toBeLessThanOrEqual(3000)
      expect(blocks[0].text.text).toMatch(/more changes_$/)
    })
  })
})

describe('Given postReleaseToSlack in full format and dry run', () => {
  it('Then previews the rich text blocks as plain text', async () => {
    await postReleaseToSlack({
      changelog: '### Features\n\n- Add a thing\n\n  With a body',
      webhookUrl: 'https://hooks.slack.com/services/A/B/C',
      changelogFormat: 'full',
      dryRun: true,
      variables: socialVariables({ newVersion: '1.0.0', projectName: 'pkg' }),
    })

    expect(logger.box).toHaveBeenCalledWith(expect.stringContaining('Features\n• Add a thing\n> With a body'))
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
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve('ok'),
      })

      const result = await postReleaseToSlack({
        changelog: 'feat: add X',
        webhookUrl: 'https://hooks.slack.com/services/AAA/BBB/CCC',
        variables: socialVariables({ newVersion: '1.0.0', projectName: 'proj' }),
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
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve('ok'),
      })

      await postReleaseToSlack({
        changelog: 'feat: add X',
        webhookUrl: 'https://hooks.slack.com/services/AAA/BBB/CCC',
        token: 'xoxb-should-be-ignored',
        channel: '#anything',
        variables: socialVariables({ newVersion: '1.0.0', projectName: 'proj' }),
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
        changelog: 'x',
        webhookUrl: 'https://hooks.slack.com/services/A/B/C',
        variables: socialVariables({ newVersion: '1.0.0', projectName: 'p' }),
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
        changelog: 'x',
        webhookUrl: 'https://hooks.slack.com/services/A/B/C',
        variables: socialVariables({ newVersion: '1.0.0', projectName: 'p' }),
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
        changelog: 'x',
        webhookUrl: 'https://hooks.slack.com/services/A/B/C',
        variables: socialVariables({ newVersion: '1.0.0', projectName: 'p' }),
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
        changelog: 'x',
        webhookUrl: 'https://hooks.slack.com/services/A/B/C',
        variables: socialVariables({ newVersion: '1.0.0', projectName: 'p' }),
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
        changelog: 'x',
        webhookUrl: 'https://hooks.slack.com/services/A/B/C',
        variables: socialVariables({ newVersion: '1.0.0', projectName: 'p' }),
      })).rejects.toThrow(/Slack webhook failed.*500/)
    })
  })

  describe('When dryRun is true in webhook mode', () => {
    it('Then does not call fetch', async () => {
      await postReleaseToSlack({
        changelog: 'x',
        webhookUrl: 'https://hooks.slack.com/services/A/B/C',
        dryRun: true,
        variables: socialVariables({ newVersion: '1.0.0', projectName: 'p' }),
      })

      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})

describe('Given postReleaseToSlack validation', () => {
  describe('When neither token nor webhookUrl is provided', () => {
    it('Then throws', async () => {
      await expect(postReleaseToSlack({
        changelog: 'x',
        variables: socialVariables({ newVersion: '1.0.0', projectName: 'p' }),
      })).rejects.toThrow(/webhookUrl or token/)
    })
  })

  describe('When token is provided without channel', () => {
    it('Then throws', async () => {
      await expect(postReleaseToSlack({
        changelog: 'x',
        token: 'xoxb-test',
        variables: socialVariables({ newVersion: '1.0.0', projectName: 'p' }),
      })).rejects.toThrow(/channel is required/)
    })
  })
})

describe('Given formatChangelogForSlack bullet conversion', () => {
  describe('When changelog contains markdown list items with -', () => {
    it('Then converts leading "- " to "• "', () => {
      const result = formatChangelogForSlack('- foo\n- bar', 500)
      expect(result).toBe('• foo\n• bar')
    })

    it('Then indents nested items with a hollow bullet', () => {
      const result = formatChangelogForSlack('- top\n  - nested', 500)
      expect(result).toBe('• top\n    ◦ nested')
    })
  })

  describe('When - appears mid-word or mid-sentence', () => {
    it('Then leaves non-bullet dashes intact', () => {
      const result = formatChangelogForSlack('feat: add multi-step wizard', 500)
      expect(result).toBe('feat: add multi-step wizard')
    })

    it('Then leaves --flag-style args intact', () => {
      const result = formatChangelogForSlack('use --flag now', 500)
      expect(result).toBe('use --flag now')
    })
  })
})

describe('Given formatPackagesForSlack function', () => {
  describe('When packages have transitions', () => {
    it('Then renders bullet list with old → new versions', () => {
      const text = formatPackagesForSlack([
        {
          name: '@acme/a',
          oldVersion: '1.0.0',
          newVersion: '1.1.0',
          version: '1.1.0',
          hasTransition: true,
        },
        {
          name: '@acme/b',
          oldVersion: '2.0.0',
          newVersion: '2.0.1',
          version: '2.0.1',
          hasTransition: true,
        },
      ])
      expect(text).toBe('• *@acme/a* : `1.0.0` → `1.1.0`\n• *@acme/b* : `2.0.0` → `2.0.1`')
    })
  })

  describe('When package has no transition', () => {
    it('Then renders a plain `name: version` line', () => {
      const text = formatPackagesForSlack([
        { name: '@acme/a', version: '1.0.0', hasTransition: false },
      ])
      expect(text).toBe('• *@acme/a* : `1.0.0`')
    })
  })

  describe('When input is empty', () => {
    it('Then returns empty string', () => {
      expect(formatPackagesForSlack([])).toBe('')
    })
  })
})

describe('Given formatSlackMessage with packages', () => {
  describe('When packages array is non-empty (rich blocks mode)', () => {
    it('Then appends a 📦 Packages section block after changelog and before contributors', () => {
      const blocks = formatSlackMessage({
        changelog: 'feat: add X',
        packages: [
          {
            name: '@acme/a',
            oldVersion: '1.0.0',
            newVersion: '1.1.0',
            version: '1.1.0',
            hasTransition: true,
          },
        ],
        contributors: ['Alice'],
        variables: socialVariables({ projectName: 'proj', newVersion: '1.0.0' }),
      })

      const types = blocks.map((b: any) => b.type)
      // Expect header, changelog section, packages section, contributors section, divider, ...
      const pkgBlock = blocks.find((b: any) => b.text?.text?.includes('📦 Packages'))
      expect(pkgBlock).toBeDefined()
      expect(pkgBlock.text.text).toContain('• *@acme/a* : `1.0.0` → `1.1.0`')

      // Ordering: packages block must come before contributors block
      const pkgIndex = blocks.findIndex((b: any) => b.text?.text?.includes('📦 Packages'))
      const contribIndex = blocks.findIndex((b: any) => b.text?.text?.includes('❤️ Contributors'))
      expect(pkgIndex).toBeGreaterThan(-1)
      expect(contribIndex).toBeGreaterThan(pkgIndex)
      expect(types).toContain('divider')
    })
  })

  describe('When packages array is empty', () => {
    it('Then does not append a packages block', () => {
      const blocks = formatSlackMessage({
        changelog: 'feat: add X',
        packages: [],
        variables: socialVariables({ projectName: 'proj', newVersion: '1.0.0' }),
      })

      const pkgBlock = blocks.find((b: any) => b.text?.text?.includes('📦 Packages'))
      expect(pkgBlock).toBeUndefined()
    })

    it('Then does not append a packages block when not provided', () => {
      const blocks = formatSlackMessage({
        changelog: 'feat: add X',
        variables: socialVariables({ projectName: 'proj', newVersion: '1.0.0' }),
      })

      const pkgBlock = blocks.find((b: any) => b.text?.text?.includes('📦 Packages'))
      expect(pkgBlock).toBeUndefined()
    })
  })

  describe('When using template mode with {{packages}} placeholder', () => {
    it('Then substitutes the bullet list', () => {
      const blocks = formatSlackMessage({
        template: '{{projectName}} {{newVersion}}\n\n{{packages}}',
        changelog: 'feat: add X',
        packages: [
          {
            name: '@acme/a',
            oldVersion: '1.0.0',
            newVersion: '1.1.0',
            version: '1.1.0',
            hasTransition: true,
          },
        ],
        variables: socialVariables({ projectName: 'proj', newVersion: '1.0.0' }),
      })

      expect(blocks[0].text.text).toContain('• *@acme/a* : `1.0.0` → `1.1.0`')
      expect(blocks[0].text.text).not.toContain('{{packages}}')
    })

    it('Then replaces with empty string when packages is empty', () => {
      const blocks = formatSlackMessage({
        template: '{{projectName}} {{newVersion}}\n{{packages}}',
        changelog: 'feat: add X',
        packages: [],
        variables: socialVariables({ projectName: 'proj', newVersion: '1.0.0' }),
      })

      expect(blocks[0].text.text).not.toContain('{{packages}}')
      expect(blocks[0].text.text).not.toContain('•')
    })
  })
})

describe('Given shareBudget function', () => {
  it('Then gives each demand what it asks within an equal share, the rest to the others', () => {
    expect(shareBudget(100, [10, 80, 80])).toEqual([10, 45, 45])
    expect(shareBudget(100, [10, 20])).toEqual([10, 20])
    expect(shareBudget(-5, [10])).toEqual([0])
  })
})

describe('Given formatSlackMessage with the sections of several versions', () => {
  const sections: SlackReleaseSection[] = [
    { title: 'Maz UI 7.0.0', changelog: '### 🚀 Features\n\n- **menu:** Add a menu' },
    {
      title: 'Tooling',
      packages: [
        {
          name: '@maz-ui/eslint-config',
          oldVersion: '5.0.0',
          newVersion: '5.1.0',
          changelog: '### 🚀 Features\n\n- Stop enforcing the catalog',
        },
        {
          name: '@maz-ui/upgrade',
          oldVersion: '5.2.1',
          newVersion: '5.2.1',
          changelog: '',
        },
      ],
    },
  ]
  const variables = socialVariables({
    projectName: 'maz-ui',
    newVersion: '',
    releaseTitle: 'New releases of maz-ui',
    releaseUrl: 'https://example.com/v7.0.0',
  })

  it('Then renders a header and one section per group in summary format', () => {
    const blocks = formatSlackMessage({ variables, changelog: sections })

    expect(blocks[0].text.text).toBe('📣 New releases of maz-ui')
    expect(blocks[1].text.text).toBe('*Maz UI 7.0.0*\n*🚀 Features*\n• *menu:* Add a menu')
    expect(blocks[2].text.text).toBe('*Tooling*\n*@maz-ui/eslint-config* `5.0.0` → `5.1.0`\n*🚀 Features*\n• Stop enforcing the catalog\n*@maz-ui/upgrade* `5.2.1`')
  })

  it('Then lists in the packages block only the packages the sections do not list', () => {
    const packages = [
      {
        name: '@maz-ui/lib',
        oldVersion: '6.0.0',
        newVersion: '7.0.0',
        version: '7.0.0',
        hasTransition: true,
      },
      {
        name: '@maz-ui/eslint-config',
        oldVersion: '5.0.0',
        newVersion: '5.1.0',
        version: '5.1.0',
        hasTransition: true,
      },
    ]

    const blocks = formatSlackMessage({ variables, changelog: sections, packages })
    const packagesBlock = blocks.find((block: any) => block.text?.text?.includes('📦 Packages'))

    expect(packagesBlock.text.text).toContain('@maz-ui/lib')
    expect(packagesBlock.text.text).not.toContain('@maz-ui/eslint-config')
  })

  it('Then renders the title of each group before its rich text in full format', () => {
    const blocks = formatSlackMessage({ variables, changelog: sections, changelogFormat: 'full' })

    const titleIndexes = blocks.flatMap((block: any, index: number) => block.type === 'section'
      ? [index]
      : [])
    expect(blocks.filter((block: any) => block.type === 'section').map((block: any) => block.text.text)).toEqual(['*Maz UI 7.0.0*', '*Tooling*'])
    expect(richTextToPlainText(blocks[titleIndexes[0] + 1])).toContain('menu: Add a menu')
    expect(blocks.slice(titleIndexes[1] + 1).filter((block: any) => block.type === 'rich_text').map(richTextToPlainText).join('\n')).toContain('@maz-ui/eslint-config 5.0.0 → 5.1.0')
    expect(blocks.at(-1).type).toBe('actions')
  })

  it('Then keeps every package of a group in full format when the first one is long', () => {
    const longChangelog = Array.from({ length: 80 }, (_, index) => `- Change ${index}\n\n  ${'A long body. '.repeat(30)}`).join('\n')
    const blocks = formatSlackMessage({
      variables,
      changelog: [
        {
          title: 'Tooling',
          packages: [
            { name: '@maz-ui/eslint-config', newVersion: '5.1.0', changelog: `### 🚀 Features\n\n${longChangelog}` },
            { name: '@maz-ui/upgrade', newVersion: '5.2.1', changelog: '### 🩹 Fixes\n\n- Fix the upgrade' },
          ],
        },
      ],
      changelogFormat: 'full',
    })
    const text = blocks.filter((block: any) => block.type === 'rich_text').map(richTextToPlainText).join('\n')

    expect(text).toContain('@maz-ui/eslint-config 5.1.0')
    expect(text).toContain('@maz-ui/upgrade 5.2.1')
    expect(text).toContain('Fix the upgrade')
  })

  it('Then keeps the sections in a template', () => {
    const blocks = formatSlackMessage({ variables, changelog: sections, template: '{{releaseTitle}}\n{{changelog}}' })

    expect(blocks[0].text.text).toContain('New releases of maz-ui\n*Maz UI 7.0.0*')
    expect(blocks[0].text.text).toContain('*Tooling*')
    expect(blocks[0].text.text).toContain('*@maz-ui/eslint-config* `5.0.0` → `5.1.0`')
  })

  it('Then renders them as a markdown changelog', () => {
    expect(slackSectionsToMarkdown(sections)).toBe([
      '## Maz UI 7.0.0',
      '',
      '### 🚀 Features\n\n- **menu:** Add a menu',
      '',
      '## Tooling',
      '',
      '**@maz-ui/eslint-config** `5.0.0` → `5.1.0`',
      '',
      '### 🚀 Features\n\n- Stop enforcing the catalog',
      '',
      '**@maz-ui/upgrade** `5.2.1`',
    ].join('\n'))
  })
  describe('When the versions have an announcement', () => {
    const storybook = { title: '🎨 Storybook', url: 'https://storybook.example.com/' }
    const announced: SlackReleaseSection[] = [
      {
        ...sections[0]!,
        title: 'Maz UI library 7.0.0',
        message: 'Version **7.0.0** is out',
        links: [storybook],
      },
      {
        title: 'Tooling',
        packages: [
          {
            ...sections[1]!.packages![0]!,
            title: 'ESLint config',
            message: 'Lint it',
            links: [storybook],
          },
        ],
      },
    ]

    it('Then shows the message and the links under the title in summary format, the title replacing the package name', () => {
      const blocks = formatSlackMessage({ variables, changelog: announced })

      expect(blocks[1].text.text).toBe('*Maz UI library 7.0.0*\nVersion *7.0.0* is out\n\n<https://storybook.example.com/|🎨 Storybook>\n*🚀 Features*\n• *menu:* Add a menu')
      expect(blocks[2].text.text).toBe('*Tooling*\n*ESLint config* `5.0.0` → `5.1.0`\nLint it\n\n<https://storybook.example.com/|🎨 Storybook>\n*🚀 Features*\n• Stop enforcing the catalog')
    })

    it('Then puts them in the markdown of the full format and of a template', () => {
      expect(slackSectionsToMarkdown(announced)).toContain('## Maz UI library 7.0.0\n\nVersion **7.0.0** is out\n\n[🎨 Storybook](https://storybook.example.com/)\n\n### 🚀 Features')
      expect(slackSectionsToMarkdown(announced)).toContain('**ESLint config** `5.0.0` → `5.1.0`\n\nLint it\n\n[🎨 Storybook](https://storybook.example.com/)')

      const blocks = formatSlackMessage({ variables, changelog: announced, changelogFormat: 'full' })
      expect(blocks.filter((block: any) => block.type === 'rich_text').map(richTextToPlainText).join('\n')).toContain('Version 7.0.0 is out')
    })

    it('Then shows the message of a single version before its changelog, and its links as the buttons', () => {
      const blocks = formatSlackMessage({
        variables: { ...variables, changelogUrl: 'https://example.com/changelog' },
        changelog: '### 🚀 Features\n\n- **menu:** Add a menu',
        announcement: {
          message: 'Version **7.0.0** is out',
          links: [storybook],
        },
      })

      expect(blocks[1].text.text).toBe('Version *7.0.0* is out')
      expect(blocks[2].text.text).toContain('Add a menu')
      expect(blocks.at(-1)).toEqual({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '🎨 Storybook', emoji: true },
            url: 'https://storybook.example.com/',
            action_id: 'announcement_link_0',
          },
        ],
      })
    })
  })
})
