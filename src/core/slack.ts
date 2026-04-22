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
 * Get Slack Incoming Webhook URL from config or environment variables.
 * Priority: social.slack.webhookUrl > RELIZY_SLACK_WEBHOOK_URL > SLACK_WEBHOOK_URL.
 */
export function getSlackWebhookUrl(options: {
  socialWebhookUrl?: string
}): string | null {
  return (
    options.socialWebhookUrl
    || process.env.RELIZY_SLACK_WEBHOOK_URL
    || process.env.SLACK_WEBHOOK_URL
    || null
  )
}

/**
 * Format changelog for Slack (convert markdown to Slack's mrkdwn format)
 */
export function formatChangelogForSlack(changelog: string, maxLength: number = 2500): string {
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
export function formatSlackMessage({ projectName, version, changelog, releaseUrl, changelogUrl, template, contributors = [], postMaxLength = 2500 }: {
  template?: string
  projectName: string
  version: string
  changelog: string
  releaseUrl?: string
  changelogUrl?: string
  contributors?: string[]
  postMaxLength?: number
}): any[] {
  const contributorsLine = contributors.length > 0
    ? contributors.map(n => `• ${n}`).join('\n')
    : ''

  // Use template if provided, otherwise use blocks
  if (template) {
    const summary = extractChangelogSummary(changelog, { maxLength: postMaxLength })
    let message = template
      .replace('{{projectName}}', projectName)
      .replace('{{newVersion}}', version)
      .replace('{{changelog}}', summary)
      .replace('{{contributors}}', contributorsLine)

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
  const formattedChangelog = formatChangelogForSlack(changelog, postMaxLength)
  if (formattedChangelog) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: formattedChangelog,
      },
    })
  }

  // Add contributors section
  if (contributors.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*❤️ Contributors*\n\n${contributorsLine}`,
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

function mapWebhookError(status: number, body: string): string | null {
  if (status === 404 || body.includes('no_service')) {
    return 'The webhook URL is invalid or has been deactivated. Regenerate it in your Slack app settings.'
  }
  if (body.includes('invalid_payload')) {
    return 'The message payload was rejected by Slack (likely exceeds 3000 chars per block). Lower social.slack.postMaxLength.'
  }
  if (body.includes('channel_not_found')) {
    return 'The channel bound to this webhook was archived or removed. Create a new webhook.'
  }
  if (body.includes('action_prohibited')) {
    return 'Your workspace has blocked the webhook. Check workspace settings.'
  }
  return null
}

async function postViaWebhook({ url, blocks, text }: {
  url: string
  blocks: any[]
  text: string
}): Promise<{ ok: true, transport: 'webhook' }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks, text }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const hint = mapWebhookError(response.status, body)
    const detail = body ? ` - ${body}` : ''
    const hintLine = hint ? `\n  → ${hint}` : ''
    throw new Error(`Slack webhook failed: ${response.status} ${response.statusText}${detail}${hintLine}`)
  }

  logger.success('Message posted successfully via Slack webhook!')
  return { ok: true, transport: 'webhook' }
}

async function postViaWebApi({ token, channel, blocks, text }: {
  token: string
  channel: string
  blocks: any[]
  text: string
}) {
  try {
    // Dynamically import @slack/web-api to avoid issues if it's not installed
    const { WebClient } = await import('@slack/web-api')

    const client = new WebClient(token)

    logger.debug(`Posting message to Slack channel: ${channel}`)

    const result = await client.chat.postMessage({ channel, blocks, text })

    logger.success(`Message posted successfully! Channel: ${result.channel}, Timestamp: ${result.ts}`)

    return result
  }
  catch (error: any) {
    // Check if it's a missing dependency error
    if (error.code === 'ERR_MODULE_NOT_FOUND' || error.message?.includes('@slack/web-api')) {
      logger.error('Slack Web API dependency not found. Please install it with: pnpm add @slack/web-api')
      throw new Error('Missing dependency: @slack/web-api. Install it with: pnpm add @slack/web-api', { cause: error })
    }

    logger.error('Failed to post message:', error.message || error)

    // Add more specific error handling for common Slack errors
    if (error.data) {
      logger.error('Slack API error:', error.data.error)

      switch (error.data.error) {
        case 'channel_not_found':
          throw new Error('Slack channel not found. Make sure the channel ID or name is correct.', { cause: error })
        case 'not_in_channel':
          throw new Error('Bot is not in the channel. Invite the bot to the channel first.', { cause: error })
        case 'invalid_auth':
          throw new Error('Invalid Slack token. Check your credentials.', { cause: error })
        case 'missing_scope':
          throw new Error('Missing required OAuth scope. The bot needs "chat:write" permission.', { cause: error })
        default:
          throw error
      }
    }

    throw error
  }
}

/**
 * Post a release announcement to Slack.
 * Dispatches to Incoming Webhook (if `webhookUrl` is set) or Web API (`token` + `channel`).
 * When both are provided, the webhook takes priority.
 */
export async function postReleaseToSlack({
  version,
  projectName,
  changelog,
  releaseUrl,
  changelogUrl,
  channel,
  token,
  webhookUrl,
  template,
  contributors,
  postMaxLength,
  dryRun = false,
}: SlackOptions) {
  const useWebhook = Boolean(webhookUrl)

  if (!useWebhook && !token) {
    throw new Error('Slack: either webhookUrl or token must be provided')
  }
  if (!useWebhook && !channel) {
    throw new Error('Slack: channel is required when using token-based authentication')
  }

  logger.debug(`Slack transport: ${useWebhook ? 'webhook' : 'web-api'}`)
  logger.debug('Preparing Slack post...')

  const blocks = formatSlackMessage({
    template,
    projectName,
    version,
    changelog,
    releaseUrl,
    changelogUrl,
    contributors,
    postMaxLength,
  })
  const fallbackText = `${projectName} ${version} is out!`

  logger.debug(`Message blocks (${blocks.length} blocks)`)

  if (dryRun) {
    const preview = blocks
      .filter((b: any) => b.type === 'header' || b.type === 'section')
      .map((b: any) => b.text?.text ?? '')
      .filter(Boolean)
      .join('\n\n')
    const target = useWebhook ? 'webhook' : `channel: ${channel}`
    logger.box(`[dry-run] Slack Post Preview (${target})\n\n${preview}`)
    return
  }

  if (useWebhook) {
    return await postViaWebhook({ url: webhookUrl!, blocks, text: fallbackText })
  }
  return await postViaWebApi({ token: token!, channel: channel!, blocks, text: fallbackText })
}
