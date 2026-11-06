import type { SocialAnnouncementContent, SocialAnnouncementVariables, SocialLink, TeamsSocialConfig } from '../types'
import type { AnnouncementVersion } from './announcements'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { setTimeout as wait } from 'node:timers/promises'
import { logger } from '@maz-ui/node'
import { fillAnnouncementText, getAnnouncementLinks, resolveAnnouncement } from './announcements'
import { showPreview } from './progress'
import { isPrerelease } from './version'

/**
 * Microsoft Teams cards, posted to a Teams workflow (Power Automate trigger
 * "When a Teams webhook request is received"): an Adaptive Card per version,
 * or one for the release. The Office 365 connectors are retired.
 * See https://learn.microsoft.com/en-us/connectors/teams/?tabs=text1#microsoft-teams-webhook
 */

/** A workflow refuses a message over 28 KB: a margin for the envelope */
export const TEAMS_MAX_PAYLOAD_BYTES = 27 * 1024

const TEAMS_REQUEST_TIMEOUT = 15_000
/** A workflow accepts about 4 requests per second */
const TEAMS_POST_INTERVAL = 300
const TEAMS_MAX_RETRIES = 2
const TEAMS_MAX_RETRY_DELAY = 10_000

const DEFAULT_TITLE = '{{name}} {{newVersion}}'
const DEFAULT_MESSAGE = 'A new version of **{{name}}** is available.'
const DEFAULT_BADGE = 'New release'
const PRERELEASE_BADGE = 'Prerelease'

/** The URLs of the retired Office 365 connectors */
const CONNECTOR_URL = /^https:\/\/[^/]*(?:webhook\.office\.com|outlook\.office(?:365)?\.com\/webhook)/i

function decodeBase64(value: string | undefined): string | undefined {
  return value ? Buffer.from(value.trim(), 'base64').toString('utf8').trim() : undefined
}

/**
 * The URL of the Teams workflow: `social.teams.webhookUrl`, else
 * `RELIZY_TEAMS_WEBHOOK_URL`, `TEAMS_WEBHOOK_URL`, else the base64 of
 * `RELIZY_TEAMS_WEBHOOK_URL_B64`, `TEAMS_WEBHOOK_URL_B64`
 */
export function getTeamsWebhookUrl({ socialWebhookUrl, env = process.env }: { socialWebhookUrl?: string, env?: NodeJS.ProcessEnv }): string | undefined {
  return socialWebhookUrl
    || env.RELIZY_TEAMS_WEBHOOK_URL
    || env.TEAMS_WEBHOOK_URL
    || decodeBase64(env.RELIZY_TEAMS_WEBHOOK_URL_B64 || env.TEAMS_WEBHOOK_URL_B64)
    || undefined
}

/**
 * Why a URL cannot receive the cards, undefined when it can
 */
export function checkTeamsWebhookUrl(url: string): string | undefined {
  if (CONNECTOR_URL.test(url)) {
    return 'This is the URL of an Office 365 connector: Microsoft retired them. Create a Teams workflow with the "When a Teams webhook request is received" trigger and use its URL.'
  }

  try {
    if (new URL(url).protocol !== 'https:') {
      return 'The URL of the Teams workflow must start with https://'
    }
  }
  catch {
    return 'The URL of the Teams workflow is not a valid URL (a base64 value must be in RELIZY_TEAMS_WEBHOOK_URL_B64)'
  }

  return undefined
}

/**
 * A version that Teams can announce
 */
export interface TeamsVersion extends AnnouncementVersion {
  /**
   * Its changelog in markdown, empty with `changelog: 'none'`
   */
  changelog: string
}

/**
 * A version to announce, with the content of its announcement
 */
export interface TeamsAnnouncedVersion {
  version: TeamsVersion
  content: SocialAnnouncementContent
}

/**
 * The versions Teams announces, with their content over the one of
 * `social.teams` (see `resolveAnnouncement()`)
 */
export function resolveTeamsAnnouncements(teams: TeamsSocialConfig, versions: TeamsVersion[]): TeamsAnnouncedVersion[] {
  return versions.flatMap((version) => {
    const content = resolveAnnouncement(version.line, teams, teams)

    return content ? [{ version, content }] : []
  })
}

/**
 * A version of a card: its title, message, version, changelog and buttons
 */
export interface TeamsCardSection {
  title: string
  message: string
  version: string
  changelog: string
  links: SocialLink[]
  /**
   * Title of its version group, shown above its versions in a release card
   */
  groupTitle?: string
  prerelease: boolean
}

/**
 * The section of an announced version: its texts filled, the buttons of its
 * release notes, its changelog and its links
 */
export function getTeamsCardSection({ announced, variables }: {
  announced: TeamsAnnouncedVersion
  variables: SocialAnnouncementVariables
}): TeamsCardSection {
  return {
    title: fillAnnouncementText(announced.content.title ?? DEFAULT_TITLE, variables),
    message: fillAnnouncementText(announced.content.message ?? DEFAULT_MESSAGE, variables),
    version: variables.newVersion,
    changelog: toTeamsMarkdown(announced.version.changelog),
    links: getAnnouncementLinks(announced.content, variables),
    groupTitle: variables.groupTitle || undefined,
    prerelease: isPrerelease(variables.newVersion),
  }
}

/**
 * Markdown that a Teams card renders: the headings become bold lines, the
 * HTML and the code fences are removed
 */
export function toTeamsMarkdown(markdown: string): string {
  return markdown
    .split('\n')
    .filter(line => !line.trim().startsWith('```'))
    .map((line) => {
      const text = line.replaceAll(/<\/?[a-z][^<>]*>/gi, '').trimEnd()
      const heading = /^#{1,6} /.exec(text)

      return heading ? `**${text.slice(heading[0].length).trim()}**` : text
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

type CardElement = Record<string, unknown>

function getBadge(badge: TeamsSocialConfig['badge'], prerelease: boolean): CardElement | undefined {
  if (badge === false) {
    return undefined
  }

  const text = badge ?? (prerelease ? PRERELEASE_BADGE : DEFAULT_BADGE)
  const style = prerelease ? 'Warning' : 'Good'

  return {
    type: 'Badge',
    text,
    style,
    icon: 'Code',
    // The clients without the Badge element (older mobile apps) show a text
    fallback: { type: 'TextBlock', text: `**${text}**`, color: style === 'Good' ? 'Good' : 'Warning', size: 'Small', wrap: true },
  }
}

function getSectionBody(section: TeamsCardSection, { titleSize, facts }: { titleSize: string, facts: { title: string, value: string }[] }): CardElement[] {
  return [
    { type: 'TextBlock', text: section.title, size: titleSize, weight: 'Bolder', color: 'Accent', wrap: true, style: 'heading' },
    ...(section.message ? [{ type: 'TextBlock', text: section.message, wrap: true, spacing: 'Small' }] : []),
    { type: 'FactSet', facts: [{ title: 'Version', value: section.version }, ...facts] },
    ...(section.changelog ? [{ type: 'TextBlock', text: section.changelog, wrap: true }] : []),
    ...(section.links.length > 0
      ? [{
          type: 'ActionSet',
          actions: section.links.map((link, index) => ({ type: 'Action.OpenUrl', title: link.title, url: link.url, ...(index === 0 && { style: 'positive' }) })),
        }]
      : []),
  ]
}

function formatTeamsDate(date: Date, locale: string | undefined): string {
  try {
    return new Intl.DateTimeFormat(locale || 'en-US', { dateStyle: 'long' }).format(date)
  }
  catch {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(date)
  }
}

/**
 * The message posted to the workflow: an Adaptive Card announcing one version
 * (one section), or the release (a section per version under its title)
 */
export function buildTeamsMessage({ sections, title, badge, locale, date = new Date() }: {
  sections: TeamsCardSection[]
  /**
   * Title of a release card (several sections)
   */
  title?: string
  badge?: TeamsSocialConfig['badge']
  locale?: string
  date?: Date
}): Record<string, unknown> {
  const prerelease = sections.every(section => section.prerelease)
  const dateFact = { title: 'Date', value: formatTeamsDate(date, locale) }
  const badgeElement = getBadge(badge, prerelease)
  const body: CardElement[] = badgeElement ? [badgeElement] : []

  if (sections.length === 1) {
    body.push({ type: 'Container', items: getSectionBody(sections[0]!, { titleSize: 'ExtraLarge', facts: [dateFact] }) })
  }
  else {
    body.push(
      { type: 'TextBlock', text: title ?? 'New releases', size: 'ExtraLarge', weight: 'Bolder', color: 'Accent', wrap: true, style: 'heading' },
      { type: 'TextBlock', text: dateFact.value, isSubtle: true, spacing: 'Small', wrap: true },
    )

    sections.forEach((section, index) => {
      const showGroup = section.groupTitle && section.groupTitle !== sections[index - 1]?.groupTitle

      if (showGroup) {
        body.push({ type: 'TextBlock', text: section.groupTitle, size: 'Large', weight: 'Bolder', separator: true, spacing: 'Large', wrap: true })
      }

      body.push({ type: 'Container', separator: !showGroup, spacing: 'Medium', items: getSectionBody(section, { titleSize: 'Medium', facts: [] }) })
    })
  }

  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        $schema: 'https://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.5',
        msteams: { width: 'Full' },
        body,
      },
    }],
  }
}

/** What a card shows, in text, for the dry-run preview */
export function renderTeamsMessagePreview({ sections, title }: { sections: TeamsCardSection[], title?: string }): string {
  const renderSection = (section: TeamsCardSection) => [
    section.title,
    section.message,
    `Version: ${section.version}`,
    section.changelog,
    ...section.links.map(link => `[${link.title}] ${link.url}`),
  ].filter(Boolean).join('\n')

  if (sections.length === 1) {
    return renderSection(sections[0]!)
  }

  return [title ?? 'New releases', ...sections.map(renderSection)].join('\n\n')
}

/** The hint of an HTTP error of a workflow */
function getTeamsErrorHint(status: number): string | undefined {
  if (status === 401 || status === 403) {
    return 'The workflow refused the request: its trigger must allow "Anyone" to trigger the flow, and the URL must keep its sig parameter.'
  }
  if (status === 404) {
    return 'The workflow is not found: it was deleted, turned off, or its owner left the organization (add co-owners). Create it again and update the URL.'
  }
  if (status === 400 || status === 413) {
    return `The workflow refused the card: a card is limited to 28 KB. Use social.teams.cards: 'version' or social.teams.changelog: 'none'.`
  }
  return undefined
}

function getRetryDelay(response: Response): number {
  const seconds = Number(response.headers.get('retry-after'))

  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, TEAMS_MAX_RETRY_DELAY) : 2000
}

async function postTeamsMessage(url: string, body: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(TEAMS_REQUEST_TIMEOUT),
    })

    if (response.ok) {
      return
    }

    // Throttled: the workflow tells when to try again
    if (response.status === 429 && attempt < TEAMS_MAX_RETRIES) {
      await wait(getRetryDelay(response))
      continue
    }

    const detail = await response.text().catch(() => '')
    const hint = getTeamsErrorHint(response.status)

    const message = [`Teams workflow failed: ${response.status} ${response.statusText}`, detail && ` - ${detail.slice(0, 300)}`, hint && `\n  → ${hint}`]

    throw new Error(message.filter(Boolean).join(''))
  }
}

/**
 * A card ready to post: its sections and its title (release card)
 */
export interface TeamsCard {
  sections: TeamsCardSection[]
  title?: string
}

/**
 * Post the cards to the Teams workflow, one after the other. In dry-run,
 * shows them instead. Throws at the first card refused.
 */
export async function postReleaseToTeams({ cards, webhookUrl, badge, locale, date, dryRun = false }: {
  cards: TeamsCard[]
  webhookUrl: string
  badge?: TeamsSocialConfig['badge']
  locale?: string
  date?: Date
  dryRun?: boolean
}): Promise<{ posted: number }> {
  const messages = cards.map(card => ({ card, body: JSON.stringify(buildTeamsMessage({ ...card, badge, locale, date })) }))

  for (const [index, { card, body }] of messages.entries()) {
    const size = Buffer.byteLength(body)

    if (size > TEAMS_MAX_PAYLOAD_BYTES) {
      throw new Error(`The Teams card of ${card.title ?? card.sections[0]?.title} is ${Math.ceil(size / 1024)} KB, over the 28 KB of a workflow.\n  → Use social.teams.cards: 'version' or social.teams.changelog: 'none'.`)
    }

    logger.verbose(`Teams card ${index + 1}/${messages.length}:`, body)

    if (dryRun) {
      showPreview({ title: 'Teams card', meta: messages.length > 1 ? [`${index + 1} of ${messages.length}`] : [], content: renderTeamsMessagePreview(card) })
      continue
    }

    if (index > 0) {
      await wait(TEAMS_POST_INTERVAL)
    }

    await postTeamsMessage(webhookUrl, body)
  }

  if (!dryRun) {
    logger.success(`${messages.length} Teams card(s) posted`)
  }

  return { posted: messages.length }
}
