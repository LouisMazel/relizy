import type { TwitterCredentials, TwitterOptions } from '../types'
import { logger } from '@maz-ui/node'
import { extractChangelogSummary } from './social'

export interface ResolvedTwitterCredentials {
  apiKey: string
  apiSecret: string
  accessToken: string
  accessTokenSecret: string
}

export function getTwitterCredentials(options: {
  socialCredentials?: TwitterCredentials
  tokenCredentials?: TwitterCredentials
}): ResolvedTwitterCredentials | null {
  const { socialCredentials, tokenCredentials } = options

  // Priority 1: social.twitter.credentials (specific config)
  const apiKey = socialCredentials?.apiKey
    || tokenCredentials?.apiKey

  const apiSecret = socialCredentials?.apiSecret
    || tokenCredentials?.apiSecret

  const accessToken = socialCredentials?.accessToken
    || tokenCredentials?.accessToken

  const accessTokenSecret = socialCredentials?.accessTokenSecret
    || tokenCredentials?.accessTokenSecret

  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    logger.warn('Twitter is enabled but credentials are missing.')
    logger.log('Set the following environment variables or configure them in social.twitter.credentials or tokens.twitter:')
    logger.log('  - TWITTER_API_KEY or RELIZY_TWITTER_API_KEY')
    logger.log('  - TWITTER_API_SECRET or RELIZY_TWITTER_API_SECRET')
    logger.log('  - TWITTER_ACCESS_TOKEN or RELIZY_TWITTER_ACCESS_TOKEN')
    logger.log('  - TWITTER_ACCESS_TOKEN_SECRET or RELIZY_TWITTER_ACCESS_TOKEN_SECRET')

    logger.info('Skipping Twitter post')
    return null
  }

  return {
    apiKey,
    apiSecret,
    accessToken,
    accessTokenSecret,
  }
}

export function formatTweetMessage(options: {
  template: string
  projectName: string
  version: string
  changelog: string
  releaseUrl?: string
  changelogUrl?: string
}): string {
  const { template, projectName, version, changelog, releaseUrl, changelogUrl } = options

  const TWITTER_MAX_LENGTH = 280
  const ELLIPSIS = '...'

  // Step 1: Build template with all placeholders replaced except changelog
  let templateWithValues = template
    .replace('{{projectName}}', projectName)
    .replace('{{version}}', version)

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
  const availableForChangelog = TWITTER_MAX_LENGTH - templateWithoutChangelog.length

  // Step 3: Truncate changelog if needed
  let finalChangelog = changelog
  if (changelog.length > availableForChangelog) {
    const maxLength = Math.max(0, availableForChangelog - ELLIPSIS.length)
    finalChangelog = changelog.substring(0, maxLength) + ELLIPSIS
  }

  // Step 4: Build final message
  let message = templateWithValues.replace('{{changelog}}', finalChangelog).trim()

  // Step 5: Safety check - if message still exceeds limit, truncate entire message
  // This should only happen if the template + URLs alone are > 280 chars
  if (message.length > TWITTER_MAX_LENGTH) {
    message = message.substring(0, TWITTER_MAX_LENGTH - ELLIPSIS.length) + ELLIPSIS
  }

  return message
}

export async function postReleaseToTwitter(options: TwitterOptions) {
  const { release, projectName, changelog, releaseUrl, changelogUrl, credentials, twitterMessage, dryRun = false } = options

  logger.debug('[social:twitter] Preparing Twitter post...')

  const changelogSummary = extractChangelogSummary(changelog, 150)

  const message = formatTweetMessage({
    template: twitterMessage,
    projectName,
    version: release.version,
    changelog: changelogSummary,
    releaseUrl,
    changelogUrl,
  })

  logger.debug(`Tweet message (${message.length} chars):\n${message}`)

  if (dryRun) {
    logger.info('[dry-run] Would post tweet:', message)
    return
  }

  try {
    // Dynamically import twitter-api-v2 to avoid issues if it's not installed
    const { TwitterApi } = await import('twitter-api-v2')

    const client = new TwitterApi({
      appKey: credentials.apiKey,
      appSecret: credentials.apiSecret,
      accessToken: credentials.accessToken,
      accessSecret: credentials.accessTokenSecret,
    })

    const rwClient = client.readWrite

    const tweet = await rwClient.v2.tweet(message)

    logger.success(`Tweet posted successfully! Tweet ID: ${tweet.data.id}`)
    logger.info(`Tweet URL: https://twitter.com/i/web/status/${tweet.data.id}`)

    return tweet
  }
  catch (error: any) {
    // Check if it's a missing dependency error
    if (error.code === 'ERR_MODULE_NOT_FOUND' || error.message?.includes('twitter-api-v2')) {
      logger.error('Twitter API dependency not found. Please install it with: pnpm add twitter-api-v2')
      throw new Error('Missing dependency: twitter-api-v2. Install it with: pnpm add twitter-api-v2')
    }

    logger.error('Failed to post tweet:', error.message || error)
    throw error
  }
}
