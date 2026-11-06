import type { SlackChangelogFormat, SlackCredentials, SlackOptions, SlackReleaseSection, SocialLink, SocialTemplateVariables } from '../types'
import type { PackageBumpEntry } from './packages'
import type { SlackRichTextBlock } from './slack-markdown'
import { logger } from '@maz-ui/node'
import { showPreview } from './progress'
import { fillSocialTemplate } from './release-overview'
import { markdownToSlackMrkdwn, markdownToSlackRichText, richTextToPlainText, SLACK_HEADER_MAX_LENGTH, SLACK_MAX_BLOCKS, SLACK_RICH_TEXT_MESSAGE_MAX_LENGTH, SLACK_SECTION_MAX_LENGTH, sliceSlackText } from './slack-markdown'

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
const SLACK_SUMMARY_MAX_LENGTH = 2500

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

function renderSlackTemplate({ template, variables, changelog, contributorsLine, packagesLine }: {
  template: string
  variables: SocialTemplateVariables
  changelog: string
  contributorsLine: string
  packagesLine: string
}): string {
  return fillSocialTemplate(template, variables, {
    changelog,
    contributors: contributorsLine,
    packages: packagesLine,
  }).trim()
}

/**
 * Share a budget between demands: each one gets what it asks within an equal
 * share, what the small ones leave goes to the others.
 */
export function shareBudget(budget: number, demands: number[]): number[] {
  const shares = demands.map(() => 0)
  const pending = demands.map((demand, index) => ({ demand, index })).sort((a, b) => a.demand - b.demand)
  let remaining = Math.max(0, budget)

  while (pending.length > 0) {
    const fairShare = Math.floor(remaining / pending.length)

    if (pending[0]!.demand > fairShare) {
      for (const { index } of pending) {
        shares[index] = fairShare
      }
      break
    }

    const { demand, index } = pending.shift()!
    shares[index] = demand
    remaining -= demand
  }

  return shares
}

function formatSlackPackageLine(pkg: NonNullable<SlackReleaseSection['packages']>[number]): string {
  const name = pkg.title ?? pkg.name

  return pkg.oldVersion && pkg.oldVersion !== pkg.newVersion
    ? `*${name}* \`${pkg.oldVersion}\` → \`${pkg.newVersion}\``
    : `*${name}* \`${pkg.newVersion}\``
}

/** Slack accepts 75 characters in the text of a button */
const SLACK_BUTTON_TEXT_MAX_LENGTH = 75

/**
 * The message and the links of an announcement (markdown), the links on one line
 */
function getAnnouncementMarkdown({ message, links = [] }: { message?: string, links?: SocialLink[] }): string {
  const linksLine = links.map(link => `[${link.title}](${link.url})`).join(' · ')

  return [message?.trim(), linksLine].filter(Boolean).join('\n\n')
}

/**
 * The message and the links of an announcement in mrkdwn, `''` without them
 */
function formatSlackAnnouncement(announcement: { message?: string, links?: SocialLink[] }): string {
  const markdown = getAnnouncementMarkdown(announcement)

  return markdown ? formatChangelogForSlack(markdown, SLACK_SECTION_MAX_LENGTH) : ''
}

/**
 * The sections of a release of several versions as a single markdown
 * changelog: the title of each section, then its changelog or its packages.
 */
export function slackSectionsToMarkdown(sections: SlackReleaseSection[]): string {
  return sections.map((section) => {
    const parts = [section.title ? `## ${section.title}` : '', getAnnouncementMarkdown(section), section.changelog?.trim() ?? '']

    for (const pkg of section.packages ?? []) {
      parts.push(formatSlackPackageLine(pkg).replace(/^\*([^*]+)\*/, '**$1**'), getAnnouncementMarkdown(pkg), pkg.changelog.trim())
    }

    return parts.filter(Boolean).join('\n\n')
  }).join('\n\n')
}

function getSectionBodies(section: SlackReleaseSection): string[] {
  return section.changelog !== undefined ? [section.changelog] : (section.packages ?? []).map(pkg => pkg.changelog)
}

/**
 * The mrkdwn of a section in `summary` format: its title and its announcement,
 * then its changelog, or each package (always) with its announcement and its
 * changelog, within `maxLength`. `renderedBodies` are the changelogs rendered
 * without limit.
 */
function formatSlackSummarySection(section: SlackReleaseSection, maxLength: number, renderedBodies: string[]): string {
  const lines = [section.title ? `*${section.title}*` : '', formatSlackAnnouncement(section)].filter(Boolean)
  const packages = section.packages ?? []
  const packageHeads = packages.map(pkg => [formatSlackPackageLine(pkg), formatSlackAnnouncement(pkg)].filter(Boolean).join('\n'))
  const bodies = getSectionBodies(section)
  // The lines always shown, and the line break before each changelog
  const fixedLength = [...lines, ...packageHeads].join('\n').length + renderedBodies.filter(Boolean).length
  const shares = shareBudget(maxLength - fixedLength, renderedBodies.map(body => body.length))
  const renderBody = (index: number) => {
    const share = shares[index]!
    return share >= renderedBodies[index]!.length ? renderedBodies[index]! : share > 0 ? formatChangelogForSlack(bodies[index]!, share) : ''
  }

  if (section.changelog !== undefined) {
    lines.push(renderBody(0))
  }

  for (const [index, packageHead] of packageHeads.entries()) {
    lines.push(packageHead, renderBody(index))
  }

  return truncateSlackText(lines.filter(Boolean).join('\n'), SLACK_SECTION_MAX_LENGTH)
}

/**
 * The blocks of the sections of a release of several versions: one per
 * section in `summary` format, its title and rich text blocks in `full`
 * format. The budgets (characters, blocks, payload) are shared between the
 * sections, so that each one keeps at least its title and version lines.
 */
function formatSlackSections({ sections, changelogFormat, maxLength, surroundingBlocks }: {
  sections: SlackReleaseSection[]
  changelogFormat: SlackChangelogFormat
  maxLength?: number
  surroundingBlocks: any[]
}): any[] {
  if (changelogFormat !== 'full') {
    const renderedBodies = sections.map(section => getSectionBodies(section).map(body => formatChangelogForSlack(body, Number.MAX_SAFE_INTEGER)))
    const demands = sections.map((section, index) => formatSlackSummarySection(section, SLACK_SECTION_MAX_LENGTH, renderedBodies[index]!).length)
    const shares = shareBudget(maxLength ?? SLACK_SUMMARY_MAX_LENGTH, demands)

    return sections.map((section, index) => ({
      type: 'section',
      text: { type: 'mrkdwn', text: formatSlackSummarySection(section, Math.min(shares[index]!, SLACK_SECTION_MAX_LENGTH), renderedBodies[index]!) },
    }))
  }

  const titleBlocks = sections.map(section => section.title
    ? { type: 'section', text: { type: 'mrkdwn', text: truncateSlackText(`*${section.title}*`, SLACK_SECTION_MAX_LENGTH) } }
    : undefined)
  const markdowns = sections.map(section => slackSectionsToMarkdown([{ ...section, title: undefined }]))
  const fixedBlocks = [...surroundingBlocks, ...titleBlocks.filter(Boolean)]
  const rendered = markdowns.map(markdown => markdownToSlackRichText(markdown, { maxLength, maxBlocks: SLACK_MAX_BLOCKS, maxPayloadLength: SLACK_RICH_TEXT_MESSAGE_MAX_LENGTH }))
  const blockShares = shareBudget(SLACK_MAX_BLOCKS - fixedBlocks.length, rendered.map(blocks => blocks.length))
  const payloadShares = shareBudget(SLACK_RICH_TEXT_MESSAGE_MAX_LENGTH - JSON.stringify(fixedBlocks).length, rendered.map(blocks => JSON.stringify(blocks).length))
  const lengthShares = maxLength === undefined ? undefined : shareBudget(maxLength, markdowns.map(markdown => markdown.length))

  return sections.flatMap((_section, index) => {
    const blocks = rendered[index]!
    const fits = blocks.length <= blockShares[index]! && JSON.stringify(blocks).length <= payloadShares[index]! && lengthShares === undefined

    return [
      ...(titleBlocks[index] ? [titleBlocks[index]] : []),
      ...(fits
        ? blocks
        : blockShares[index]! > 0
          ? markdownToSlackRichText(markdowns[index]!, { maxLength: lengthShares?.[index], maxBlocks: blockShares[index]!, maxPayloadLength: payloadShares[index]! })
          : []),
    ]
  })
}

/**
 * The packages of the 📦 Packages block: the ones the sections do not already
 * list (the packages of an `independent` group)
 */
function getUnlistedPackages(packages: PackageBumpEntry[], changelog: string | SlackReleaseSection[]): PackageBumpEntry[] {
  if (typeof changelog === 'string') {
    return packages
  }

  const listed = new Set(changelog.flatMap(section => section.packages?.map(pkg => pkg.name) ?? []))

  return packages.filter(pkg => !listed.has(pkg.name))
}

/**
 * The section of the message of an announcement, none without message
 */
function getSlackAnnouncementBlocks(announcement: SlackOptions['announcement']): any[] {
  const text = announcement?.message ? formatSlackAnnouncement({ message: announcement.message }) : ''

  return text ? [{ type: 'section', text: { type: 'mrkdwn', text } }] : []
}

/**
 * The buttons of the message: the links of the announcement of a single
 * version, else its release and its changelog
 */
function getSlackButtons(variables: SocialTemplateVariables, announcement: SlackOptions['announcement']): any[] {
  const button = (text: string, url: string, actionId: string) => ({
    type: 'button',
    text: { type: 'plain_text', text: truncateSlackText(text, SLACK_BUTTON_TEXT_MAX_LENGTH), emoji: true },
    url,
    action_id: actionId,
  })

  if (announcement) {
    return announcement.links.map((link, index) => button(link.title, link.url, `announcement_link_${index}`))
  }

  return [
    ...(variables.releaseUrl ? [button('📦 View Release', variables.releaseUrl, 'view_release')] : []),
    ...(variables.changelogUrl ? [button('📋 Full Changelog', variables.changelogUrl, 'view_changelog')] : []),
  ]
}

/**
 * Format the Slack message using blocks.
 * - `summary` format: the changelog is a single mrkdwn section (2500 chars by default).
 * - `full` format: the changelog is rendered as rich_text blocks, commit bodies
 *   included, split per section. It is bounded by `postMaxLength` when set and
 *   always by Slack's limits (50 blocks, ~13,200 chars for rich text messages).
 * Every block is kept within Slack's limits so the post is never rejected.
 */
export function formatSlackMessage({ variables, changelog, template, contributors = [], packages = [], postMaxLength, changelogFormat = 'summary', announcement }: {
  template?: string
  variables: SocialTemplateVariables
  /**
   * Changelog of a single version (markdown), or the sections of a release of several versions
   */
  changelog: string | SlackReleaseSection[]
  contributors?: string[]
  packages?: PackageBumpEntry[]
  postMaxLength?: number
  changelogFormat?: SlackChangelogFormat
  /**
   * Announcement of a single version: its message and its links (the buttons)
   */
  announcement?: SlackOptions['announcement']
}): any[] {
  const contributorsLine = contributors.length > 0
    ? contributors.map(n => `• ${n}`).join('\n')
    : ''
  const packagesLine = formatPackagesForSlack(packages)
  const maxLength = resolveSlackPostMaxLength({ changelogFormat, postMaxLength })

  // Use template if provided, otherwise use blocks
  if (template) {
    const templateContext = { template, variables, contributorsLine, packagesLine }
    let changelogText: string
    if (typeof changelog !== 'string') {
      // The sections of several versions are kept: they are fitted as a whole, not summarized
      const overhead = renderSlackTemplate({ ...templateContext, changelog: '\u0000' }).length - 1
      changelogText = markdownToSlackMrkdwn(slackSectionsToMarkdown(changelog), {
        maxLength: Math.max(0, Math.min(maxLength ?? Infinity, SLACK_SECTION_MAX_LENGTH - overhead)),
        cutCommits: true,
      })
    }
    else if (changelogFormat === 'full') {
      // A template is a single section: the changelog gets what the template leaves of its limit.
      // Measured with a 1 char placeholder the template trimming cannot remove
      const overhead = renderSlackTemplate({ ...templateContext, changelog: '\u0000' }).length - 1
      changelogText = markdownToSlackMrkdwn(changelog, {
        maxLength: Math.max(0, Math.min(maxLength ?? Infinity, SLACK_SECTION_MAX_LENGTH - overhead)),
        cutCommits: true,
      })
    }
    else {
      // As without template: the changelog in mrkdwn, within what the template leaves of its section
      const overhead = renderSlackTemplate({ ...templateContext, changelog: '\u0000' }).length - 1
      changelogText = formatChangelogForSlack(changelog, Math.max(0, Math.min(maxLength ?? SLACK_SUMMARY_MAX_LENGTH, SLACK_SECTION_MAX_LENGTH - overhead)))
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
      text: truncateSlackText(`📣 ${variables.releaseTitle}`, SLACK_HEADER_MAX_LENGTH),
      emoji: true,
    },
  }

  // The announcement of a single version: its message before its changelog, its links as buttons
  const singleAnnouncement = typeof changelog === 'string' ? announcement : undefined
  const leadingBlocks = getSlackAnnouncementBlocks(singleAnnouncement)
  const trailingBlocks: any[] = []

  // Add packages section
  const unlistedPackages = getUnlistedPackages(packages, changelog)

  if (unlistedPackages.length > 0) {
    trailingBlocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: formatListSection('*📦 Packages*', formatPackagesForSlack(unlistedPackages).split('\n'), 'packages'),
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
  const elements = getSlackButtons(variables, singleAnnouncement)

  if (elements.length > 0) {
    trailingBlocks.push({
      type: 'actions',
      elements,
    })
  }

  // Add changelog blocks
  const changelogBlocks: any[] = []
  if (typeof changelog !== 'string') {
    changelogBlocks.push(...formatSlackSections({
      sections: changelog,
      changelogFormat,
      maxLength,
      surroundingBlocks: [headerBlock, ...trailingBlocks],
    }))
  }
  else if (changelogFormat === 'full') {
    // Messages with rich_text blocks are capped by Slack: the changelog gets what the other blocks leave.
    const surroundingBlocks = [headerBlock, ...leadingBlocks, ...trailingBlocks]
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

  return [headerBlock, ...leadingBlocks, ...changelogBlocks, ...trailingBlocks]
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
  variables,
  changelog,
  channel,
  token,
  webhookUrl,
  template,
  contributors,
  packages,
  postMaxLength,
  changelogFormat,
  announcement,
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
    variables,
    changelog,
    contributors,
    packages,
    postMaxLength,
    changelogFormat,
    announcement,
  })
  const fallbackText = variables.releaseTitle

  logger.debug(`Message blocks (${blocks.length} blocks)`)

  if (dryRun) {
    const preview = blocks
      .map((b: any) => b.type === 'rich_text' ? richTextToPlainText(b as SlackRichTextBlock) : b.text?.text ?? '')
      .filter(Boolean)
      .join('\n\n')
    const target = useWebhook ? 'webhook' : `channel: ${channel}`
    showPreview({ title: 'Slack post', meta: [`Target: ${target}`], content: preview })
    return
  }

  if (useWebhook) {
    return await postViaWebhook({ url: webhookUrl!, blocks, text: fallbackText })
  }
  return await postViaWebApi({ token: token!, channel: channel!, blocks, text: fallbackText })
}
