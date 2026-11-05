import type { SocialTemplateVariables, TwitterCredentials, TwitterOptions } from '../types'
import { logger } from '@maz-ui/node'
import { fillSocialTemplate } from './release-overview'
import { extractChangelogSummary } from './social'

export interface ResolvedTwitterCredentials {
  apiKey: string
  apiKeySecret: string
  accessToken: string
  accessTokenSecret: string
}

// eslint-disable-next-line complexity
export function getTwitterCredentials({ socialCredentials, tokenCredentials }: {
  socialCredentials?: TwitterCredentials
  tokenCredentials?: TwitterCredentials
}): ResolvedTwitterCredentials | null {
  const apiKey = socialCredentials?.apiKey
    || tokenCredentials?.apiKey

  const apiKeySecret = socialCredentials?.apiKeySecret
    || tokenCredentials?.apiKeySecret

  const accessToken = socialCredentials?.accessToken
    || tokenCredentials?.accessToken

  const accessTokenSecret = socialCredentials?.accessTokenSecret
    || tokenCredentials?.accessTokenSecret

  if (!apiKey || !apiKeySecret || !accessToken || !accessTokenSecret) {
    logger.error('Twitter is enabled but credentials are missing.')
    logger.log('Set the following environment variables or configure them in social.twitter.credentials or tokens.twitter:')

    if (!apiKey)
      logger.log('  - TWITTER_API_KEY or RELIZY_TWITTER_API_KEY')
    if (!apiKeySecret)
      logger.log('  - TWITTER_API_KEY_SECRET or RELIZY_TWITTER_API_KEY_SECRET')
    if (!accessToken)
      logger.log('  - TWITTER_ACCESS_TOKEN or RELIZY_TWITTER_ACCESS_TOKEN')
    if (!accessTokenSecret)
      logger.log('  - TWITTER_ACCESS_TOKEN_SECRET or RELIZY_TWITTER_ACCESS_TOKEN_SECRET')

    logger.info('Skipping Twitter post')
    return null
  }

  return {
    apiKey,
    apiKeySecret,
    accessToken,
    accessTokenSecret,
  }
}

/**
 * Length of any URL in a post: X shortens them all to t.co links
 */
export const TWEET_URL_LENGTH = 23

const URL_REGEX = /https?:\/\/\S+/g
const EMOJI_REGEX = /\p{Extended_Pictographic}/u

/**
 * Code points counting 1 in a post (Latin, Greek, Cyrillic... and the common
 * punctuation), the others count 2 (twitter-text v3 config)
 */
const LIGHT_CODE_POINT_RANGES: [number, number][] = [
  [0x0000, 0x10FF],
  [0x2000, 0x200D],
  [0x2010, 0x201F],
  [0x2032, 0x2037],
]

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })

function getCodePointLength(codePoint: number): number {
  return LIGHT_CODE_POINT_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end) ? 1 : 2
}

function getTextLength(text: string): number {
  let length = 0

  for (const { segment } of segmenter.segment(text.normalize('NFC'))) {
    // An emoji counts 2, whatever the code points of its sequence (skin tone, ZWJ...)
    length += EMOJI_REGEX.test(segment)
      ? 2
      : [...segment].reduce((sum, char) => sum + getCodePointLength(char.codePointAt(0)!), 0)
  }

  return length
}

/**
 * Length of a post as X counts it: a URL counts 23 characters, an emoji or a
 * CJK character counts 2.
 */
export function getTweetLength(text: string): number {
  const urls = text.match(URL_REGEX) ?? []

  return getTextLength(text.replace(URL_REGEX, '')) + urls.length * TWEET_URL_LENGTH
}

/**
 * Cut a text so that it fits in `maxLength` (as X counts it) with the ellipsis
 */
function truncateTweetText(text: string, maxLength: number, ellipsis: string): string {
  if (getTweetLength(text) <= maxLength) {
    return text
  }

  const segments = [...segmenter.segment(text)].map(({ segment }) => segment)

  while (segments.length > 0 && getTweetLength(`${segments.join('')}${ellipsis}`) > maxLength) {
    segments.pop()
  }

  return `${segments.join('')}${ellipsis}`
}

export function formatTweetMessage({ template, variables, changelog, postMaxLength }: {
  template: string
  variables: SocialTemplateVariables
  changelog: string
  postMaxLength: number
}): string {
  const ELLIPSIS = '...'

  const changelogSummary = extractChangelogSummary(changelog, { maxLength: postMaxLength, stripBoldMarkers: true })

  // Every placeholder but the changelog, whose length depends on the space they leave
  const templateWithValues = fillSocialTemplate(template, variables)
  const availableForChangelog = postMaxLength - getTweetLength(templateWithValues.replaceAll('{{changelog}}', ''))

  // Escape @ mentions in changelog to prevent unintended Twitter mentions
  // by inserting a zero-width space after @ (e.g., scoped package names like @scope/pkg)
  const escapedChangelog = changelogSummary.replace(/@\b/g, '@\u200B')

  const finalChangelog = truncateTweetText(escapedChangelog, Math.max(0, availableForChangelog), ELLIPSIS)

  const message = templateWithValues.replaceAll('{{changelog}}', finalChangelog).trim()

  // Only exceeds the limit when the template and its URLs alone do
  return truncateTweetText(message, postMaxLength, ELLIPSIS)
}

export async function postReleaseToTwitter({
  variables,
  changelog,
  credentials,
  template,
  postMaxLength,
  dryRun = false,
}: TwitterOptions) {
  logger.debug('Preparing Twitter post...')

  const message = formatTweetMessage({
    template,
    variables,
    changelog,
    postMaxLength,
  })

  logger.debug(`Tweet message (${getTweetLength(message)} chars):\n${message}`)

  if (dryRun) {
    logger.box(`[dry-run] Twitter Post Preview (${getTweetLength(message)}/${postMaxLength} chars)\n\n${message}`)
    return
  }

  try {
    // Dynamically import twitter-api-v2 to avoid issues if it's not installed
    const { TwitterApi } = await import('twitter-api-v2')

    const client = new TwitterApi({
      appKey: credentials.apiKey,
      appSecret: credentials.apiKeySecret,
      accessToken: credentials.accessToken,
      accessSecret: credentials.accessTokenSecret,
    })

    const rwClient = client.readWrite

    logger.debug(`Posting tweet: ${message}`)

    const tweet = await rwClient.v2.tweet(message)

    logger.info(`Tweet posted successfully! Tweet ID: ${tweet.data.id}`)
    logger.info(`Tweet URL: https://twitter.com/i/web/status/${tweet.data.id}`)

    return tweet
  }
  catch (error: any) {
    // Check if it's a missing dependency error
    if (error.code === 'ERR_MODULE_NOT_FOUND' || error.message?.includes('twitter-api-v2')) {
      logger.error('Twitter API dependency not found. Please install it with: pnpm add twitter-api-v2')
      throw new Error('Missing dependency: twitter-api-v2. Install it with: pnpm add twitter-api-v2', { cause: error })
    }

    const httpCode = error?.code
    const apiData = error?.data
    const apiErrors = error?.errors
    const rateLimit = error?.rateLimit

    logger.error('Failed to post tweet:', error.message || error)
    if (httpCode) {
      logger.error(`HTTP code: ${httpCode}`)
    }
    if (apiData) {
      logger.error('Twitter response body:', JSON.stringify(apiData, null, 2))
    }
    if (apiErrors) {
      logger.error('Twitter errors:', JSON.stringify(apiErrors, null, 2))
    }
    if (rateLimit) {
      logger.error('Rate limit info:', JSON.stringify(rateLimit, null, 2))
    }

    if (httpCode === 402) {
      logger.warn(
        'Twitter/X returned 402 (Payment Required — likely `CreditsDepleted`).\n'
        + 'Since February 2026, the X API runs on a pay-per-use model — there is no free tier anymore.\n'
        + 'Each POST /2/tweets costs $0.010, debited from credits you top up in advance.\n'
        + 'Top up your balance at https://developer.x.com → Billing, then retry.\n'
        + 'Reference: https://docs.x.com/x-api/getting-started/pricing',
      )
    }

    throw error
  }
}
