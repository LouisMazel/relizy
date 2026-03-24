import type { TwitterCredentials, TwitterOptions } from '../types'
import { logger } from '@maz-ui/node'
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

export function formatTweetMessage({ template, projectName, version, changelog, releaseUrl, changelogUrl, postMaxLength }: {
  template: string
  projectName: string
  version: string
  changelog: string
  releaseUrl?: string
  changelogUrl?: string
  postMaxLength: number
}): string {
  const MAX_LENGTH = postMaxLength
  const ELLIPSIS = '...'

  const changelogSummary = extractChangelogSummary(changelog, { maxLength: MAX_LENGTH, stripBoldMarkers: true })

  // Step 1: Build template with all placeholders replaced except changelog
  let templateWithValues = template
    .replace('{{projectName}}', projectName)
    .replace('{{newVersion}}', version)

  if (releaseUrl) {
    templateWithValues = templateWithValues.replace('{{releaseUrl}}', releaseUrl)
  }
  else {
    // Remove the releaseUrl placeholder if no URL is provided
    templateWithValues = templateWithValues.replace('{{releaseUrl}}', '')
  }

  if (changelogUrl) {
    templateWithValues = templateWithValues.replace('{{changelogUrl}}', changelogUrl)
  }
  else {
    // Remove the changelogUrl placeholder if no URL is provided
    templateWithValues = templateWithValues.replace('{{changelogUrl}}', '')
  }

  // Step 2: Calculate how much space is available for the changelog
  const templateWithoutChangelog = templateWithValues.replace('{{changelog}}', '')
  const availableForChangelog = MAX_LENGTH - templateWithoutChangelog.length

  // Step 3: Escape @ mentions in changelog to prevent unintended Twitter mentions
  // by inserting a zero-width space after @ (e.g., scoped package names like @scope/pkg)
  const escapedChangelog = changelogSummary.replace(/@\b/g, '@\u200B')

  // Step 4: Truncate changelog if needed
  let finalChangelog = escapedChangelog
  if (escapedChangelog.length > availableForChangelog) {
    const maxLength = Math.max(0, availableForChangelog - ELLIPSIS.length)
    finalChangelog = escapedChangelog.substring(0, maxLength) + ELLIPSIS
  }

  // Step 5: Build final message
  let message = templateWithValues.replace('{{changelog}}', finalChangelog).trim()

  // Step 6: Safety check - if message still exceeds limit, truncate entire message
  // This should only happen if the template + URLs alone are > 280 chars
  if (message.length > MAX_LENGTH) {
    message = message.substring(0, MAX_LENGTH - ELLIPSIS.length) + ELLIPSIS
  }

  return message
}

export async function postReleaseToTwitter({
  version,
  projectName,
  changelog,
  releaseUrl,
  changelogUrl,
  credentials,
  template,
  postMaxLength,
  dryRun = false,
}: TwitterOptions) {
  logger.debug('Preparing Twitter post...')

  const message = formatTweetMessage({
    template,
    projectName,
    version,
    changelog,
    releaseUrl,
    changelogUrl,
    postMaxLength,
  })

  logger.debug(`Tweet message (${message.length} chars):\n${message}`)

  if (dryRun) {
    logger.box(`[dry-run] Twitter Post Preview (${message.length}/${postMaxLength} chars)\n\n${message}`)
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

    logger.error('Failed to post tweet:', error.message || error)
    throw error
  }
}
