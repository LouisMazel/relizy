import type { TwitterCredentials, TwitterOptions } from '../types'
import type { ResolvedRelizyConfig } from './config'
import process from 'node:process'
import { logger } from '@maz-ui/node'

/**
 * Get Twitter credentials from environment variables
 */
export function getTwitterCredentials(): TwitterCredentials | null {
  const apiKey = process.env.RELIZY_TWITTER_API_KEY || process.env.TWITTER_API_KEY
  const apiSecret = process.env.RELIZY_TWITTER_API_SECRET || process.env.TWITTER_API_SECRET
  const accessToken = process.env.RELIZY_TWITTER_ACCESS_TOKEN || process.env.TWITTER_ACCESS_TOKEN
  const accessTokenSecret = process.env.RELIZY_TWITTER_ACCESS_TOKEN_SECRET || process.env.TWITTER_ACCESS_TOKEN_SECRET

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
}): string {
  const { template, projectName, version, changelog, releaseUrl } = options

  // Truncate changelog to fit Twitter's character limit (280 chars)
  // Reserve space for template text, project name, version, and URL
  const reservedChars = template.length + projectName.length + version.length + (releaseUrl?.length || 0) + 20
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

  // Ensure the final message doesn't exceed Twitter's limit
  if (message.length > 280) {
    message = `${message.substring(0, 277)}...`
  }

  return message
}

/**
 * Get the release URL from repo config and release tag
 */
export function getReleaseUrl(config: ResolvedRelizyConfig, tag: string): string | undefined {
  const repo = config.repo
  if (!repo?.domain || !repo?.repo) {
    return undefined
  }

  const provider = repo.provider || 'github'
  const baseUrl = provider === 'github'
    ? `https://${repo.domain}/${repo.repo}/releases/tag`
    : `https://${repo.domain}/${repo.repo}/-/releases`

  return `${baseUrl}/${tag}`
}

/**
 * Extract a summary from changelog content
 */
export function extractChangelogSummary(changelog: string, maxLength: number = 150): string {
  // Remove markdown headers
  const cleaned = changelog
    .split('\n')
    .filter(line => !line.startsWith('#'))
    .join('\n')
    .trim()

  // Get first few lines or sentences
  const sentences = cleaned.split(/[.!?]\s+/)
  let summary = ''

  for (const sentence of sentences) {
    if ((summary + sentence).length > maxLength) {
      break
    }
    summary += `${sentence}. `
  }

  return summary.trim() || cleaned.substring(0, maxLength)
}

/**
 * Post a release announcement to Twitter
 */
export async function postReleaseToTwitter(options: TwitterOptions): Promise<void> {
  const { release, projectName, changelog, releaseUrl, credentials, messageTemplate, dryRun = false } = options

  logger.debug('Preparing Twitter post...')

  const template = messageTemplate || `🚀 {{projectName}} {{version}} is out!\n\n{{changelog}}\n\n📦 {{releaseUrl}}`

  const changelogSummary = extractChangelogSummary(changelog, 150)

  const message = formatTweetMessage({
    template,
    projectName,
    version: release.version,
    changelog: changelogSummary,
    releaseUrl,
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
