import type { ResolvedRelizyConfig } from '../core'
import type { PostedRelease, SocialOptions } from '../types'
import { logger } from '@maz-ui/node'
import { generateChangelog, getCurrentGitRef, getFirstCommit, getPackageCommits, getRootPackage, isPrerelease, loadRelizyConfig } from '../core'
import { extractChangelogSummary, getReleaseUrl, getTwitterCredentials, postReleaseToTwitter } from '../core/twitter'
import { executeHook } from '../core/utils'

export function socialSafetyCheck({ config }: { config: ResolvedRelizyConfig }) {
  if (!config.safetyCheck) {
    return
  }

  // Check if social posting is enabled
  if (!config.release.social) {
    logger.debug('Social media posting is disabled in configuration')
    return
  }

  // Check Twitter configuration
  const twitterConfig = config.social?.twitter
  if (twitterConfig?.enabled) {
    const credentials = getTwitterCredentials(twitterConfig.credentials)

    if (!credentials) {
      logger.warn('⚠️  Twitter is enabled but credentials are missing.')
      logger.warn('Set the following environment variables or configure them in social.twitter.credentials:')
      logger.warn('  - TWITTER_API_KEY or RELIZY_TWITTER_API_KEY')
      logger.warn('  - TWITTER_API_SECRET or RELIZY_TWITTER_API_SECRET')
      logger.warn('  - TWITTER_ACCESS_TOKEN or RELIZY_TWITTER_ACCESS_TOKEN')
      logger.warn('  - TWITTER_ACCESS_TOKEN_SECRET or RELIZY_TWITTER_ACCESS_TOKEN_SECRET')
    }
  }

  // Future: Check other social platforms here
  // if (config.social?.linkedin?.enabled) { ... }
  // if (config.social?.slack?.enabled) { ... }
}

async function handleTwitterPost({
  config,
  postedReleases,
  dryRun,
}: {
  config: ResolvedRelizyConfig
  postedReleases: PostedRelease[]
  dryRun: boolean
}) {
  // Check if Twitter is enabled specifically
  const twitterConfig = config.social?.twitter
  if (!twitterConfig?.enabled) {
    logger.debug('Twitter posting is disabled in configuration')
    return
  }

  try {
    const credentials = getTwitterCredentials(twitterConfig.credentials)

    if (!credentials) {
      logger.warn('Twitter credentials not found. Set TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, and TWITTER_ACCESS_TOKEN_SECRET environment variables or configure them in social.twitter.credentials.')
      logger.info('Skipping Twitter post')
      return
    }

    const mainRelease = postedReleases[0]

    if (!mainRelease) {
      logger.warn('No release found to tweet about')
      return
    }

    // Check if this is a prerelease and if we should skip it
    const onlyStable = twitterConfig.onlyStable ?? true
    if (onlyStable && isPrerelease(mainRelease.version)) {
      logger.info(`Skipping Twitter post for prerelease version ${mainRelease.version} (social.twitter.onlyStable is enabled)`)
      return
    }

    await executeHook('before:twitter', config, dryRun)

    try {
      const rootPackage = getRootPackage(config.cwd)
      const releaseUrl = getReleaseUrl(config, mainRelease.tag)

      // Read the actual changelog file if available
      const toTag = dryRun ? getCurrentGitRef(config.cwd) : mainRelease.tag
      const fromTag = config.from || getFirstCommit(config.cwd)

      const commits = await getPackageCommits({
        pkg: rootPackage,
        config,
        from: fromTag,
        to: toTag,
        changelog: true,
      })

      const changelog = await generateChangelog({
        pkg: rootPackage,
        commits,
        config,
        from: fromTag,
        dryRun,
      })

      // Extract summary from the generated changelog
      const changelogSummary = extractChangelogSummary(changelog, 150)

      const messageTemplate = twitterConfig.messageTemplate || config.templates.twitterMessage

      await postReleaseToTwitter({
        release: mainRelease,
        projectName: rootPackage.name,
        changelog: changelogSummary,
        releaseUrl,
        credentials,
        messageTemplate,
        dryRun,
      })

      await executeHook('success:twitter', config, dryRun)
    }
    catch (error) {
      await executeHook('error:twitter', config, dryRun)
      logger.error('Error posting to Twitter:', error)
      // Don't throw - Twitter posting failure shouldn't fail the social command
    }
  }
  catch (error) {
    logger.error('Error during Twitter posting:', error)
    // Don't throw - Twitter posting failure shouldn't fail the social command
  }
}

export async function social(options: Partial<SocialOptions> = {}): Promise<void> {
  try {
    const dryRun = options.dryRun ?? false
    logger.debug(`Dry run: ${dryRun}`)

    const config = await loadRelizyConfig({
      configName: options.configName,
      baseConfig: options.config,
      overrides: {
        from: options.from,
        to: options.to,
        logLevel: options.logLevel,
      },
    })

    // Safety check
    if (options.safetyCheck !== false) {
      socialSafetyCheck({ config })
    }

    // Check if social posting is enabled globally
    if (!config.release.social && !config.social?.twitter?.enabled) {
      logger.warn('Social media posting is disabled in configuration.')
      logger.info('Enable it with release.social: true or social.twitter.enabled: true')
      return
    }

    // Get posted releases from options or use empty array
    const postedReleases = options.postedReleases || []

    if (postedReleases.length === 0) {
      logger.warn('No releases provided. Cannot post to social media without release information.')
      logger.info('Tip: This command is typically called after provider-release or as part of the release workflow.')
      return
    }

    await executeHook('before:social', config, dryRun)

    try {
      // Handle Twitter posting
      await handleTwitterPost({
        config,
        postedReleases,
        dryRun,
      })

      // Future: Add other social platforms here
      // await handleLinkedInPost({ config, postedReleases, bumpResult, dryRun })
      // await handleSlackPost({ config, postedReleases, bumpResult, dryRun })

      logger.success('Social media posts completed!')

      await executeHook('success:social', config, dryRun)
    }
    catch (error) {
      await executeHook('error:social', config, dryRun)
      throw error
    }
  }
  catch (error) {
    logger.error('Error during social media posting:', error)
    throw error
  }
}
