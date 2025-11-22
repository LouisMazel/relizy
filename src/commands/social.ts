import type { ResolvedRelizyConfig } from '../core'
import type { BumpResultTruthy, PostedRelease, SocialOptions } from '../types'
import { logger } from '@maz-ui/node'
import { extractChangelogSummary, generateChangelog, getIndependentTag, getReleaseUrl, getSlackToken, getTwitterCredentials, isPrerelease, loadRelizyConfig, postReleaseToSlack, postReleaseToTwitter, readPackageJson } from '../core'
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
    const credentials = getTwitterCredentials({
      socialCredentials: twitterConfig.credentials,
      tokenCredentials: config.tokens?.twitter,
    })

    if (!credentials) {
      logger.warn('Twitter is enabled but credentials are missing.')
      logger.log('Set the following environment variables or configure them in social.twitter.credentials or tokens.twitter:')
      logger.log('  - TWITTER_API_KEY or RELIZY_TWITTER_API_KEY')
      logger.log('  - TWITTER_API_SECRET or RELIZY_TWITTER_API_SECRET')
      logger.log('  - TWITTER_ACCESS_TOKEN or RELIZY_TWITTER_ACCESS_TOKEN')
      logger.log('  - TWITTER_ACCESS_TOKEN_SECRET or RELIZY_TWITTER_ACCESS_TOKEN_SECRET')
    }
  }

  // Check Slack configuration
  const slackConfig = config.social?.slack
  if (slackConfig?.enabled) {
    const token = getSlackToken({
      socialCredentials: slackConfig.credentials,
      tokenCredential: config.tokens?.slack,
    })

    if (!token) {
      logger.log('Slack is enabled but credentials are missing.')
      logger.log('Set the following environment variables or configure them in social.slack.credentials or tokens.slack:')
      logger.log('  - SLACK_TOKEN or RELIZY_SLACK_TOKEN')
    }

    if (!slackConfig.channel) {
      logger.warn('Slack is enabled but no channel is configured.')
      logger.log('Set the channel in social.slack.channel (e.g., "#releases" or "C1234567890")')
    }
  }

  // Future: Check other social platforms here
  // if (config.social?.linkedin?.enabled) { ... }
}

/**
 * Build PostedRelease array from BumpResult
 */
function buildPostedReleasesFromBumpResult(
  bumpResult: BumpResultTruthy,
  config: ResolvedRelizyConfig,
): PostedRelease[] {
  const versionMode = config.monorepo?.versionMode

  // Independent mode: create a release for each bumped package
  if (versionMode === 'independent') {
    logger.debug(`Building posted releases for ${bumpResult.bumpedPackages.length} packages (independent mode)`)

    return bumpResult.bumpedPackages.map((pkg) => {
      const version = pkg.newVersion || pkg.version
      const tag = getIndependentTag({ version, name: pkg.name })

      return {
        name: pkg.name,
        tag,
        version,
        prerelease: isPrerelease(version),
      }
    })
  }

  // Unified or selective mode: create a single release
  logger.debug(`Building posted release for version ${bumpResult.newVersion} (${versionMode || 'unified'} mode)`)

  const version = bumpResult.newVersion || ''
  const tag = config.templates.tagBody.replace('{{newVersion}}', version)

  return [{
    name: tag,
    tag,
    version,
    prerelease: isPrerelease(version),
  }]
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
    logger.debug('[social:twitter] Twitter posting is disabled in configuration')
    return
  }

  logger.debug('[social:twitter] Twitter posting is enabled')

  try {
    const credentials = getTwitterCredentials({
      socialCredentials: twitterConfig.credentials,
      tokenCredentials: config.tokens?.twitter,
    })

    if (!credentials) {
      logger.warn('[social:twitter] Twitter credentials not found. Set TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, and TWITTER_ACCESS_TOKEN_SECRET environment variables or configure them in social.twitter.credentials or tokens.twitter.')
      logger.info('[social:twitter] Skipping Twitter post')
      return
    }

    logger.debug('[social:twitter] Credentials found ✓')

    const mainRelease = postedReleases[0]

    if (!mainRelease) {
      logger.warn('[social:twitter] No release found to tweet about')
      return
    }

    logger.info(`[social:twitter] Preparing tweet for release: ${mainRelease.tag} (${mainRelease.version})`)

    // Check if this is a prerelease and if we should skip it
    const onlyStable = twitterConfig.onlyStable ?? true
    if (onlyStable && isPrerelease(mainRelease.version)) {
      logger.info(`[social:twitter] Skipping Twitter post for prerelease version ${mainRelease.version} (social.twitter.onlyStable is enabled)`)
      return
    }

    await executeHook('before:twitter', config, dryRun)

    try {
      const rootPackageBase = readPackageJson(config.cwd)

      if (!rootPackageBase) {
        throw new Error('Failed to read root package.json')
      }

      logger.debug(`[social:twitter] Project: ${rootPackageBase.name}`)

      const releaseUrl = getReleaseUrl(config, mainRelease.tag)
      logger.debug(`[social:twitter] Release URL: ${releaseUrl || 'none'}`)

      const changelogUrl = config.social?.changelogUrl
      logger.debug(`[social:twitter] Changelog URL: ${changelogUrl || 'none'}`)

      // Use the tag from the posted release
      const changelog = await generateChangelog({
        pkg: {
          ...rootPackageBase,
          fromTag: config.from || '',
          commits: [],
          newVersion: mainRelease.version,
        },
        config,
        dryRun,
        newVersion: mainRelease.version,
      })

      logger.debug(`[social:twitter] Changelog generated (${changelog.length} chars)`)

      // Extract summary from the generated changelog
      const changelogSummary = extractChangelogSummary(changelog, 150)
      logger.debug(`[social:twitter] Changelog summary: ${changelogSummary.substring(0, 50)}...`)

      await postReleaseToTwitter({
        messageTemplate: config.templates.twitterMessage,
        release: mainRelease,
        projectName: rootPackageBase.name,
        changelog: changelogSummary,
        releaseUrl,
        changelogUrl,
        credentials,
        dryRun,
      })

      await executeHook('success:twitter', config, dryRun)
    }
    catch (error) {
      await executeHook('error:twitter', config, dryRun)
      logger.error('[social:twitter] Error posting to Twitter:', error)
      // Don't throw - Twitter posting failure shouldn't fail the social command
    }
  }
  catch (error) {
    logger.error('[social:twitter] Error during Twitter posting:', error)
    // Don't throw - Twitter posting failure shouldn't fail the social command
  }
}

async function handleSlackPost({
  config,
  postedReleases,
  dryRun,
}: {
  config: ResolvedRelizyConfig
  postedReleases: PostedRelease[]
  dryRun: boolean
}) {
  // Check if Slack is enabled specifically
  const slackConfig = config.social?.slack
  if (!slackConfig?.enabled) {
    logger.debug('[social:slack] Slack posting is disabled in configuration')
    return
  }

  logger.debug('[social:slack] Slack posting is enabled')

  try {
    const token = getSlackToken({
      socialCredentials: slackConfig.credentials,
      tokenCredential: config.tokens?.slack,
    })

    if (!token) {
      logger.warn('[social:slack] Slack token not found. Set SLACK_TOKEN or RELIZY_SLACK_TOKEN environment variable or configure it in social.slack.credentials or tokens.slack.')
      logger.info('[social:slack] Skipping Slack post')
      return
    }

    logger.debug('[social:slack] Token found ✓')

    if (!slackConfig.channel) {
      logger.warn('[social:slack] Slack channel not configured. Set it in social.slack.channel.')
      logger.info('[social:slack] Skipping Slack post')
      return
    }

    logger.debug(`[social:slack] Channel configured: ${slackConfig.channel}`)

    const mainRelease = postedReleases[0]

    if (!mainRelease) {
      logger.warn('[social:slack] No release found to post about')
      return
    }

    logger.info(`[social:slack] Preparing Slack message for release: ${mainRelease.tag} (${mainRelease.version})`)

    // Check if this is a prerelease and if we should skip it
    const onlyStable = slackConfig.onlyStable ?? true
    if (onlyStable && isPrerelease(mainRelease.version)) {
      logger.info(`[social:slack] Skipping Slack post for prerelease version ${mainRelease.version} (social.slack.onlyStable is enabled)`)
      return
    }

    await executeHook('before:slack', config, dryRun)

    try {
      const rootPackageBase = readPackageJson(config.cwd)

      if (!rootPackageBase) {
        throw new Error('Failed to read root package.json')
      }

      logger.debug(`[social:slack] Project: ${rootPackageBase.name}`)

      const releaseUrl = getReleaseUrl(config, mainRelease.tag)
      logger.debug(`[social:slack] Release URL: ${releaseUrl || 'none'}`)

      const changelogUrl = config.social?.changelogUrl
      logger.debug(`[social:slack] Changelog URL: ${changelogUrl || 'none'}`)

      // Use the tag from the posted release
      const changelog = await generateChangelog({
        pkg: {
          ...rootPackageBase,
          fromTag: config.from || '',
          commits: [],
          newVersion: mainRelease.version,
        },
        config,
        dryRun,
        newVersion: mainRelease.version,
      })

      logger.debug(`[social:slack] Changelog generated (${changelog.length} chars)`)

      const messageTemplate = slackConfig.messageTemplate || config.templates.slackMessage

      await postReleaseToSlack({
        release: mainRelease,
        projectName: rootPackageBase.name,
        changelog,
        releaseUrl,
        changelogUrl,
        channel: slackConfig.channel,
        token,
        messageTemplate,
        dryRun,
      })

      await executeHook('success:slack', config, dryRun)
    }
    catch (error) {
      await executeHook('error:slack', config, dryRun)
      logger.error('[social:slack] Error posting to Slack:', error)
      // Don't throw - Slack posting failure shouldn't fail the social command
    }
  }
  catch (error) {
    logger.error('[social:slack] Error during Slack posting:', error)
    // Don't throw - Slack posting failure shouldn't fail the social command
  }
}

export async function social(options: Partial<SocialOptions> = {}): Promise<void> {
  try {
    const dryRun = options.dryRun ?? false
    logger.debug(`[social] Dry run: ${dryRun}`)

    const config = await loadRelizyConfig({
      configFile: options.configName,
      baseConfig: options.config,
      overrides: {
        from: options.from,
        to: options.to,
        logLevel: options.logLevel,
      },
    })

    logger.debug(`[social] Version mode: ${config.monorepo?.versionMode || 'standalone'}`)

    // Safety check
    if (options.safetyCheck !== false) {
      socialSafetyCheck({ config })
    }

    // Check if social posting is enabled globally
    if (!config.release.social && !config.social?.twitter?.enabled && !config.social?.slack?.enabled) {
      logger.warn('[social] Social media posting is disabled in configuration.')
      logger.info('Enable it with release.social: true or social.twitter.enabled: true or social.slack.enabled: true')
      return
    }

    let postedReleases: PostedRelease[] = []

    // Priority 1: Use postedReleases if provided (from provider-release step)
    if (options.postedReleases && options.postedReleases.length > 0) {
      logger.debug(`[social] Using ${options.postedReleases.length} posted release(s) from provider-release`)
      postedReleases = options.postedReleases
    }
    // Priority 2: Build from bumpResult if available
    else if (options.bumpResult?.bumped) {
      logger.debug('[social] Building posted releases from bumpResult')
      postedReleases = buildPostedReleasesFromBumpResult(options.bumpResult, config)
    }
    // No release information available
    else {
      logger.warn('[social] No release information available (no bumpResult or postedReleases provided).')
      logger.info('Tip: This command should be called after bumping versions or creating a provider release.')
      logger.info('You can use it standalone with: relizy social --from <tag> --to <tag>')
      return
    }

    logger.info(`[social] Processing ${postedReleases.length} release(s) for social media posting`)

    await executeHook('before:social', config, dryRun)

    try {
      // Handle Twitter posting
      await handleTwitterPost({
        config,
        postedReleases,
        dryRun,
      })

      // Handle Slack posting
      await handleSlackPost({
        config,
        postedReleases,
        dryRun,
      })

      // Future: Add other social platforms here
      // await handleLinkedInPost({ config, postedReleases, dryRun })

      logger.success('[social] Social media posts completed!')

      await executeHook('success:social', config, dryRun)
    }
    catch (error) {
      await executeHook('error:social', config, dryRun)
      throw error
    }
  }
  catch (error) {
    logger.error('[social] Error during social media posting:', error)
    throw error
  }
}
