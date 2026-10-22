import type { SlackChangelogFormat, SlackCredentials, SlackOptions } from '../types'
import type { PackageBumpEntry } from './packages'
import type { SlackRichTextBlock } from './slack-markdown'
import { logger } from '@maz-ui/node'
import { markdownToSlackMrkdwn, markdownToSlackRichText, richTextToPlainText, SLACK_HEADER_MAX_LENGTH, SLACK_MAX_BLOCKS, SLACK_RICH_TEXT_MESSAGE_MAX_LENGTH, SLACK_SECTION_MAX_LENGTH, sliceSlackText } from './slack-markdown'
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

/** Default changelog budget of the `summary` format. */
export const SLACK_SUMMARY_MAX_LENGTH = 2500

/**
 * Resolve the changelog budget of a Slack post: `postMaxLength` when set,
 * otherwise 2500 chars in `summary` format and no limit in `full` format
 * (the message is then only bounded by Slack's 50 blocks).
 */
export function resolveSlackPostMaxLength({ changelogFormat = 'summary', postMaxLength }: {
  changelogFormat?: SlackChangelogFormat
  postMaxLength?: number
}): number | undefined {
  return postMaxLength ?? (changelogFormat === 'full' ? undefined : SLACK_SUMMARY_MAX_LENGTH)
}

/**
 * Format changelog for Slack (convert markdown to Slack's mrkdwn format)
 */
export function formatChangelogForSlack(changelog: string, maxLength: number = SLACK_SUMMARY_MAX_LENGTH): string {
  return markdownToSlackMrkdwn(changelog, { maxLength })
}

/**
 * Render a list of bumped packages as a Slack mrkdwn bullet list.
 * Each entry becomes `• \`name\`: \`old\` → \`new\`` when a transition is detected,
 * otherwise falls back to `• \`name\`: \`version\``.
 */
export function formatPackagesForSlack(packages: PackageBumpEntry[]): string {
  if (packages.length === 0) {
    return ''
  }
  return packages
    .map(pkg => pkg.hasTransition
      ? `• *${pkg.name}* : \`${pkg.oldVersion}\` → \`${pkg.newVersion}\``
      : `• *${pkg.name}* : \`${pkg.version}\``,
    )
    .join('\n')
}

function truncateSlackText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${sliceSlackText(text, maxLength - 1)}…` : text
}

/**
 * Render a titled list as a section text within Slack's 3000 chars limit,
 * replacing the overflowing lines with an "… and N more" line.
 */
function formatListSection(title: string, lines: string[], noun: string): string {
  const render = (count: number) => {
    const omitted = lines.length - count
    const kept = lines.slice(0, count)
    if (omitted > 0) {
      kept.push(`_… and ${omitted} more ${noun}_`)
    }
    return `${title}\n\n${kept.join('\n')}`
  }

  for (let count = lines.length; count > 0; count--) {
    const text = render(count)
    if (text.length <= SLACK_SECTION_MAX_LENGTH) {
      return text
    }
  }
  return truncateSlackText(render(0), SLACK_SECTION_MAX_LENGTH)
}

function renderSlackTemplate({ template, projectName, version, changelog, contributorsLine, packagesLine, releaseUrl, changelogUrl }: {
  template: string
  projectName: string
  version: string
  changelog: string
  contributorsLine: string
  packagesLine: string
  releaseUrl?: string
  changelogUrl?: string
}): string {
  let message = template
    .replace('{{projectName}}', projectName)
    .replace('{{newVersion}}', version)
    .replace('{{changelog}}', changelog)
    .replace('{{contributors}}', contributorsLine)
    .replace('{{packages}}', packagesLine)

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

  return message
}

/**
 * Format the Slack message using blocks.
 * - `summary` format: the changelog is a single mrkdwn section (2500 chars by default).
 * - `full` format: the changelog is rendered as rich_text blocks, commit bodies
 *   included, split per section. It is bounded by `postMaxLength` when set and
 *   always by Slack's limits (50 blocks, ~13,200 chars for rich text messages).
 * Every block is kept within Slack's limits so the post is never rejected.
 */
export function formatSlackMessage({ projectName, version, changelog, releaseUrl, changelogUrl, template, contributors = [], packages = [], postMaxLength, changelogFormat = 'summary' }: {
  template?: string
  projectName: string
  version: string
  changelog: string
  releaseUrl?: string
  changelogUrl?: string
  contributors?: string[]
  packages?: PackageBumpEntry[]
  postMaxLength?: number
  changelogFormat?: SlackChangelogFormat
}): any[] {
  const contributorsLine = contributors.length > 0
    ? contributors.map(n => `• ${n}`).join('\n')
    : ''
  const packagesLine = formatPackagesForSlack(packages)
  const maxLength = resolveSlackPostMaxLength({ changelogFormat, postMaxLength })

  // Use template if provided, otherwise use blocks
  if (template) {
    const templateContext = { template, projectName, version, contributorsLine, packagesLine, releaseUrl, changelogUrl }
    let changelogText: string
    if (changelogFormat === 'full') {
      // A template is a single section: the changelog gets what the template leaves of its limit.
      const overhead = renderSlackTemplate({ ...templateContext, changelog: '' }).length
      changelogText = formatChangelogForSlack(changelog, maxLength ?? Math.max(0, SLACK_SECTION_MAX_LENGTH - overhead))
    }
    else {
      changelogText = extractChangelogSummary(changelog, { maxLength })
    }

    // Return simple text blocks if using template
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: truncateSlackText(renderSlackTemplate({ ...templateContext, changelog: changelogText }), SLACK_SECTION_MAX_LENGTH),
        },
      },
    ]
  }

  // Default rich blocks format
  const headerBlock = {
    type: 'header',
    text: {
      type: 'plain_text',
      text: truncateSlackText(`📣 ${projectName} ${version} is out!`, SLACK_HEADER_MAX_LENGTH),
      emoji: true,
    },
  }

  const trailingBlocks: any[] = []

  // Add packages section
  if (packages.length > 0) {
    trailingBlocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: formatListSection('*📦 Packages*', packagesLine.split('\n'), 'packages'),
      },
    })
  }

  // Add contributors section
  if (contributors.length > 0) {
    trailingBlocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: formatListSection('*❤️ Contributors*', contributorsLine.split('\n'), 'contributors'),
      },
    })
  }

  // Add divider
  trailingBlocks.push({
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
    trailingBlocks.push({
      type: 'actions',
      elements,
    })
  }

  // Add changelog blocks
  const changelogBlocks: any[] = []
  if (changelogFormat === 'full') {
    // Messages with rich_text blocks are capped by Slack: the changelog gets what the other blocks leave.
    const surroundingBlocks = [headerBlock, ...trailingBlocks]
    changelogBlocks.push(...markdownToSlackRichText(changelog, {
      maxLength,
      maxBlocks: SLACK_MAX_BLOCKS - surroundingBlocks.length,
      maxPayloadLength: SLACK_RICH_TEXT_MESSAGE_MAX_LENGTH - JSON.stringify(surroundingBlocks).length,
    }))
  }
  else {
    const formattedChangelog = formatChangelogForSlack(changelog, Math.min(postMaxLength ?? SLACK_SUMMARY_MAX_LENGTH, SLACK_SECTION_MAX_LENGTH))
    if (formattedChangelog) {
      changelogBlocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: formattedChangelog,
        },
      })
    }
  }

  return [headerBlock, ...changelogBlocks, ...trailingBlocks]
}

function mapWebhookError(status: number, body: string): string | null {
  if (status === 404 || body.includes('no_service')) {
    return 'The webhook URL is invalid or has been deactivated. Regenerate it in your Slack app settings.'
  }
  if (body.includes('invalid_payload')) {
    return 'The message payload was rejected by Slack (likely exceeds its block limits). Lower social.slack.postMaxLength or switch social.slack.changelogFormat to "summary".'
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
  packages,
  postMaxLength,
  changelogFormat,
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
    packages,
    postMaxLength,
    changelogFormat,
  })
  const fallbackText = `${projectName} ${version} is out!`

  logger.debug(`Message blocks (${blocks.length} blocks)`)

  if (dryRun) {
    const preview = blocks
      .map((b: any) => b.type === 'rich_text' ? richTextToPlainText(b as SlackRichTextBlock) : b.text?.text ?? '')
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
