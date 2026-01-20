import type { SlackCredentials, SlackOptions } from '../types'
import { logger } from '@maz-ui/node'
import { extractChangelogSummary } from './social'

/**
 * Get Slack token from config
 * Priority: social.slack.credentials > config.tokens.slack > environment variables (handled in config.ts)
 */
export function getSlackToken(options: {
  socialCredentials?: SlackCredentials
  tokenCredential?: string
}): string | null {
  const { socialCredentials, tokenCredential } = options

  // Priority 1: social.slack.credentials (specific config)
  const token = socialCredentials?.token
    || tokenCredential

  if (!token) {
    return null
  }

  return token
}

/**
 * Format changelog for Slack (convert markdown to Slack's mrkdwn format)
 */
export function formatChangelogForSlack(changelog: string, maxLength: number = 500): string {
  // Convert markdown to Slack's mrkdwn format
  let formatted = changelog
    // Convert markdown headers to bold
    .replace(/^### (.+)$/gm, '*$1*')
    .replace(/^## (.+)$/gm, '*$1*')
    .replace(/^# (.+)$/gm, '*$1*')
    // Convert markdown bold
    .replace(/\*\*(.+?)\*\*/g, '*$1*')

  // Convert markdown links [text](url) to <url|text>
  // Use a safer approach without complex regex
  // eslint-disable-next-line sonarjs/slow-regex, regexp/strict
  const linkPattern = /\[([^\]]*)]\(([^)]*)\)/g
  formatted = formatted.replace(linkPattern, (_, text, url) => `<${url}|${text}>`)

  // Truncate if too long
  if (formatted.length > maxLength) {
    formatted = `${formatted.substring(0, maxLength - 3)}...`
  }

  return formatted
}

/**
 * Format the Slack message using blocks
 */
export function formatSlackMessage({ projectName, version, changelog, releaseUrl, changelogUrl, template }: {
  template?: string
  projectName: string
  version: string
  changelog: string
  releaseUrl?: string
  changelogUrl?: string
}): any[] {
  // Use template if provided, otherwise use blocks
  if (template) {
    const summary = extractChangelogSummary(changelog, 500)
    let message = template
      .replace('{{projectName}}', projectName)
      .replace('{{newVersion}}', version)
      .replace('{{changelog}}', summary)

    if (releaseUrl) {
      message = message.replace('{{releaseUrl}}', releaseUrl)
    }
    else {
      message = message.replace('{{releaseUrl}}', '').trim()
    }

    if (changelogUrl) {
      message = message.replace('{{changelogUrl}}', changelogUrl)
    }
    else {
      message = message.replace('{{changelogUrl}}', '').trim()
    }

    // Return simple text blocks if using template
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message,
        },
      },
    ]
  }

  // Default rich blocks format
  const blocks: any[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🚀 ${projectName} ${version} is out!`,
        emoji: true,
      },
    },
  ]

  // Add changelog section
  const formattedChangelog = formatChangelogForSlack(changelog, 500)
  if (formattedChangelog) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: formattedChangelog,
      },
    })
  }

  // Add divider
  blocks.push({
    type: 'divider',
  })

  // Add action buttons
  const elements: any[] = []

  if (releaseUrl) {
    elements.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: '📦 View Release',
        emoji: true,
      },
      url: releaseUrl,
      action_id: 'view_release',
    })
  }

  if (changelogUrl) {
    elements.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: '📋 Full Changelog',
        emoji: true,
      },
      url: changelogUrl,
      action_id: 'view_changelog',
    })
  }

  if (elements.length > 0) {
    blocks.push({
      type: 'actions',
      elements,
    })
  }

  return blocks
}

/**
 * Post a release announcement to Slack
 */
export async function postReleaseToSlack({
  version,
  projectName,
  changelog,
  releaseUrl,
  changelogUrl,
  channel,
  token,
  template,
  dryRun = false,
}: SlackOptions) {
  logger.debug('Preparing Slack post...')

  const blocks = formatSlackMessage({
    template,
    projectName,
    version,
    changelog,
    releaseUrl,
    changelogUrl,
  })

  logger.debug(`Message blocks (${blocks.length} blocks)`)

  if (dryRun) {
    logger.info('[dry-run] Would post to Slack:', JSON.stringify(blocks, null, 2))
    return
  }

  try {
    // Dynamically import @slack/web-api to avoid issues if it's not installed
    const { WebClient } = await import('@slack/web-api')

    const client = new WebClient(token)

    logger.debug(`Posting message to Slack channel: ${channel}`)

    const result = await client.chat.postMessage({
      channel,
      blocks,
      text: `${projectName} ${version} is out!`, // Fallback text for notifications
    })

    logger.success(`Message posted successfully! Channel: ${result.channel}, Timestamp: ${result.ts}`)

    return result
  }
  catch (error: any) {
    // Check if it's a missing dependency error
    if (error.code === 'ERR_MODULE_NOT_FOUND' || error.message?.includes('@slack/web-api')) {
      logger.error('Slack Web API dependency not found. Please install it with: pnpm add @slack/web-api')
      throw new Error('Missing dependency: @slack/web-api. Install it with: pnpm add @slack/web-api')
    }

    logger.error('Failed to post message:', error.message || error)

    // Add more specific error handling for common Slack errors
    if (error.data) {
      logger.error('Slack API error:', error.data.error)

      switch (error.data.error) {
        case 'channel_not_found':
          throw new Error('Slack channel not found. Make sure the channel ID or name is correct.')
        case 'not_in_channel':
          throw new Error('Bot is not in the channel. Invite the bot to the channel first.')
        case 'invalid_auth':
          throw new Error('Invalid Slack token. Check your credentials.')
        case 'missing_scope':
          throw new Error('Missing required OAuth scope. The bot needs "chat:write" permission.')
        default:
          throw error
      }
    }

    throw error
  }
}
