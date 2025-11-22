import type { TwitterCredentials, TwitterOptions } from '../types'
import { logger } from '@maz-ui/node'
import { extractChangelogSummary } from './social-utils'

export interface ResolvedTwitterCredentials {
  apiKey: string
  apiSecret: string
  accessToken: string
  accessTokenSecret: string
}

/**
 * Get Twitter credentials from config
 * Priority: social.twitter.credentials > config.tokens.twitter > environment variables (handled in config.ts)
 */
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
    return null
  }

  return {
    apiKey,
    apiSecret,
    accessToken,
    accessTokenSecret,
  }
}

/**
 * Format the tweet message using the template
 */
export function formatTweetMessage(options: {
  template: string
  projectName: string
  version: string
  changelog: string
  releaseUrl?: string
  changelogUrl?: string
}): string {
  const { template, projectName, version, changelog, releaseUrl, changelogUrl } = options

  // Truncate changelog to fit Twitter's character limit (280 chars)
  // Reserve space for template text, project name, version, and URLs
  const reservedChars = template.length + projectName.length + version.length + (releaseUrl?.length || 0) + (changelogUrl?.length || 0) + 30
  const maxChangelogLength = 280 - reservedChars

  let truncatedChangelog = changelog
  if (changelog.length > maxChangelogLength) {
    truncatedChangelog = `${changelog.substring(0, maxChangelogLength - 3)}...`
  }

  let message = template
    .replace('{{projectName}}', projectName)
    .replace('{{version}}', version)
    .replace('{{changelog}}', truncatedChangelog)

  if (releaseUrl) {
    message = message.replace('{{releaseUrl}}', releaseUrl)
  }
  else {
    // Remove the releaseUrl placeholder if no URL is provided
    message = message.replace('{{releaseUrl}}', '').trim()
  }

  if (changelogUrl) {
    message = message.replace('{{changelogUrl}}', changelogUrl)
  }
  else {
    // Remove the changelogUrl placeholder if no URL is provided
    message = message.replace('{{changelogUrl}}', '').trim()
  }

  // Ensure the final message doesn't exceed Twitter's limit
  if (message.length > 280) {
    message = `${message.substring(0, 277)}...`
  }

  return message
}

/**
 * Post a release announcement to Twitter
 */
export async function postReleaseToTwitter(options: TwitterOptions): Promise<void> {
  const { release, projectName, changelog, releaseUrl, changelogUrl, credentials, messageTemplate, dryRun = false } = options

  logger.debug('[social:twitter] Preparing Twitter post...')

  const template = messageTemplate || `🚀 {{projectName}} {{version}} is out!\n\n{{changelog}}\n\n📦 {{releaseUrl}}`

  const changelogSummary = extractChangelogSummary(changelog, 150)

  const message = formatTweetMessage({
    template,
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
