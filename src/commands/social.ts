import type { ChatPostMessageResponse } from '@slack/web-api'
import type { TweetV2PostTweetResult } from 'twitter-api-v2'
import type { ResolvedRelizyConfig } from '../core'
import type { SocialNetworkResult, SocialOptions, SocialResult } from '../types'
import { logger } from '@maz-ui/node'
import { executeHook, generateChangelog, getReleaseUrl, getRootPackage, getSlackToken, getTwitterCredentials, isPrerelease, loadRelizyConfig, postReleaseToSlack, postReleaseToTwitter, readPackageJson, resolveTags } from '../core'

type SocialNetworkResponse<T> = { success: true, response?: T } | { success: false, error: string }

// eslint-disable-next-line sonarjs/cognitive-complexity
export async function socialSafetyCheck({ config }: { config: ResolvedRelizyConfig }) {
  try {
    const socialMediaDisabled = !config.release.social && !config.social.twitter.enabled && !config.social.slack.enabled
    if (!config.safetyCheck || socialMediaDisabled) {
      logger.debug('Safety check disabled or social disabled')
      return
    }

    logger.debug('Start checking social config')

    // Check Twitter configuration
    const twitterConfig = config.social?.twitter
    if (twitterConfig?.enabled) {
      const credentials = getTwitterCredentials({
        socialCredentials: twitterConfig.credentials,
        tokenCredentials: config.tokens?.twitter,
      })

      if (!credentials) {
        logger.fail('Twitter credentials not found')
        throw new Error('Twitter credentials not found')
      }

      // check if twitter-api-v2 is installed
      try {
        await import('twitter-api-v2')
      }
      catch {
        logger.fail('twitter-api-v2 is not installed, please install it')
        throw new Error('twitter-api-v2 is not installed')
      }
    }

    // Check Slack configuration
    const slackConfig = config.social?.slack
    if (slackConfig?.enabled) {
      const token = getSlackToken({
        socialCredentials: slackConfig.credentials,
        tokenCredential: config.tokens?.slack,
      })

      // check if @slack/web-api is installed
      try {
        await import('@slack/web-api')
      }
      catch {
        logger.fail('@slack/web-api is not installed, please install it')
        throw new Error('@slack/web-api is not installed')
      }

      if (!token) {
        logger.fail('Slack is enabled but credentials are missing.')
        logger.log('Set the following environment variables or configure them in social.slack.credentials or tokens.slack:')
        logger.log('  - SLACK_TOKEN or RELIZY_SLACK_TOKEN')

        throw new Error('Slack credentials not found')
      }

      if (!slackConfig.channel) {
        logger.fail('Slack is enabled but no channel is configured.')
        logger.log('Set the channel in social.slack.channel (e.g., "#releases" or "C1234567890")')

        throw new Error('Slack channel not found')
      }
    }

    logger.info('Social config checked successfully')
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('Error during social safety check:', errorMessage)
    throw new Error(`Error during social safety check: ${errorMessage}`)
  }
}

async function handleTwitterPost({
  config,
  changelog,
  dryRun,
  newVersion,
  tag,
}: {
  config: ResolvedRelizyConfig
  changelog: string
  dryRun: boolean
  newVersion: string
  tag: string
}): Promise<SocialNetworkResponse<TweetV2PostTweetResult>> {
  // Check if Twitter is enabled specifically
  const twitterConfig = config.social?.twitter
  if (!twitterConfig?.enabled) {
    logger.debug('Twitter posting is disabled in configuration')
    return { success: true, response: undefined }
  }

  logger.debug('Twitter posting is enabled')

  try {
    const credentials = getTwitterCredentials({
      socialCredentials: twitterConfig.credentials,
      tokenCredentials: config.tokens?.twitter,
    })

    if (!credentials) {
      return { success: false, error: 'Twitter credentials not found' }
    }

    logger.debug('Credentials found ✓')
    logger.debug('Preparing tweet for release')

    // Check if this is a prerelease and if we should skip it
    const onlyStable = twitterConfig.onlyStable
    if (onlyStable && isPrerelease(newVersion)) {
      logger.info(`Skipping Twitter post for prerelease version ${newVersion} (social.twitter.onlyStable is enabled)`)
      return { success: true, response: undefined }
    }

    await executeHook('before:twitter', config, dryRun)

    try {
      const rootPackageBase = readPackageJson(config.cwd)

      if (!rootPackageBase) {
        throw new Error('Failed to read root package.json')
      }

      logger.debug(`Project: ${rootPackageBase.name}`)

      const releaseUrl = getReleaseUrl(config, tag)
      logger.debug(`Release URL: ${releaseUrl || 'none'}`)

      const changelogUrl = config.social?.changelogUrl
      logger.debug(`Changelog URL: ${changelogUrl || 'none'}`)

      logger.debug(`Changelog generated (${changelog.length} chars)`)

      const response = await postReleaseToTwitter({
        template: config.social.twitter.template || config.templates.twitterMessage,
        version: newVersion,
        projectName: rootPackageBase.name,
        changelog,
        releaseUrl,
        changelogUrl,
        credentials,
        dryRun,
        postMaxLength: config.social.twitter.postMaxLength,
      })

      await executeHook('success:twitter', config, dryRun)

      return { success: true, response }
    }
    catch (error) {
      await executeHook('error:twitter', config, dryRun)
      logger.error('Error posting to Twitter:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: `Error posting to Twitter: ${errorMessage}` }
    }
  }
  catch (error) {
    logger.error('Error during Twitter posting:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: `Error during Twitter posting: ${errorMessage}` }
  }
}

async function handleSlackPost({
  config,
  changelog,
  dryRun,
  newVersion,
  tag,
}: {
  config: ResolvedRelizyConfig
  changelog: string
  dryRun: boolean
  newVersion: string
  tag: string
}): Promise<SocialNetworkResponse<ChatPostMessageResponse>> {
  // Check if Slack is enabled specifically
  const slackConfig = config.social?.slack
  if (!slackConfig?.enabled) {
    logger.debug('Slack posting is disabled in configuration')
    return { success: true, response: undefined }
  }

  logger.debug('Slack posting is enabled')

  try {
    const token = getSlackToken({
      socialCredentials: slackConfig.credentials,
      tokenCredential: config.tokens?.slack,
    })

    if (!token) {
      logger.warn('Slack token not found. Set SLACK_TOKEN or RELIZY_SLACK_TOKEN environment variable or configure it in social.slack.credentials or tokens.slack.')
      logger.info('Skipping Slack post')
      return { success: false, error: 'Slack token not found' }
    }

    logger.debug('Token found ✓')

    if (!slackConfig.channel) {
      logger.warn('Slack channel not configured. Set it in social.slack.channel.')
      logger.info('Skipping Slack post')
      return { success: false, error: 'Slack channel not configured' }
    }

    logger.debug(`Channel configured: ${slackConfig.channel}`)
    logger.debug(`Preparing Slack message for release: ${tag} (${newVersion})`)

    // Check if this is a prerelease and if we should skip it
    const onlyStable = slackConfig.onlyStable ?? true
    if (onlyStable && isPrerelease(newVersion)) {
      logger.info(`Skipping Slack post for prerelease version ${newVersion} (social.slack.onlyStable is enabled)`)
      return { success: true, response: undefined }
    }

    try {
      await executeHook('before:slack', config, dryRun)

      const rootPackageBase = readPackageJson(config.cwd)

      if (!rootPackageBase) {
        throw new Error('Failed to read root package.json')
      }

      logger.debug(`Project: ${rootPackageBase.name}`)

      const releaseUrl = getReleaseUrl(config, tag)
      logger.debug(`Release URL: ${releaseUrl || 'none'}`)

      const changelogUrl = config.social?.changelogUrl
      logger.debug(`Changelog URL: ${changelogUrl || 'none'}`)

      logger.debug(`Changelog generated (${changelog.length} chars)`)

      const template = slackConfig.template || config.templates.slackMessage

      const response = await postReleaseToSlack({
        version: newVersion,
        projectName: rootPackageBase.name,
        changelog,
        releaseUrl,
        changelogUrl,
        channel: slackConfig.channel,
        token,
        template,
        dryRun,
      })

      await executeHook('success:slack', config, dryRun)

      return { success: true, response }
    }
    catch (error) {
      await executeHook('error:slack', config, dryRun)
      logger.error('Error posting to Slack:', error)

      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: `Error posting to Slack: ${errorMessage}` }
    }
  }
  catch (error) {
    logger.error('Error during Slack posting:', error)

    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: `Error during Slack posting: ${errorMessage}` }
  }
}

// eslint-disable-next-line complexity
export async function social(options: Partial<SocialOptions> = {}): Promise<SocialResult> {
  try {
    const dryRun = options.dryRun ?? false
    logger.debug(`Dry run: ${dryRun}`)

    const config = await loadRelizyConfig({
      configFile: options.configName,
      baseConfig: options.config,
      overrides: {
        from: options.from,
        to: options.to,
        logLevel: options.logLevel,
      },
    })

    logger.debug(`Version mode: ${config.monorepo?.versionMode || 'standalone'}`)

    // Safety check
    await socialSafetyCheck({ config })

    if (!config.release.social && !config.social?.twitter?.enabled && !config.social?.slack?.enabled) {
      logger.warn('Social media posting is disabled in configuration.')
      logger.info('Enable it with release.social: true or social.twitter.enabled: true or social.slack.enabled: true')
      return { results: [], hasErrors: false }
    }

    await executeHook('before:social', config, dryRun)

    const rootPackageRead = readPackageJson(config.cwd)

    if (!rootPackageRead) {
      throw new Error('Failed to read root package.json')
    }

    const newVersion = options.bumpResult?.newVersion || rootPackageRead.version

    const { from, to } = await resolveTags<'social'>({
      config,
      step: 'social',
      newVersion,
      pkg: rootPackageRead,
    })

    const fromTag = options.bumpResult?.fromTag || from

    const rootPackage = options.bumpResult?.rootPackage || await getRootPackage({
      config,
      force: false,
      suffix: undefined,
      changelog: true,
      from: fromTag,
      to,
    })

    const changelog = await generateChangelog({
      pkg: rootPackage,
      config,
      dryRun,
      newVersion,
      minify: true,
    })

    const twitterResponse = await handleTwitterPost({
      config,
      changelog,
      dryRun,
      newVersion,
      tag: to,
    })

    const slackResponse = await handleSlackPost({
      config,
      changelog,
      dryRun,
      newVersion,
      tag: to,
    })

    // Build results array, filtering out disabled platforms
    const results: SocialNetworkResult[] = []

    // Twitter result
    if (config.social?.twitter?.enabled) {
      results.push({
        platform: 'twitter',
        success: twitterResponse.success,
        error: twitterResponse.success ? undefined : twitterResponse.error,
      })
    }

    // Slack result
    if (config.social?.slack?.enabled) {
      results.push({
        platform: 'slack',
        success: slackResponse.success,
        error: slackResponse.success ? undefined : slackResponse.error,
      })
    }

    const hasErrors = results.some(r => !r.success)

    if (hasErrors) {
      await executeHook('error:social', config, dryRun)
      logger.warn('Some social media posts failed')
    }
    else {
      logger.success('Social media posts completed!')
      await executeHook('success:social', config, dryRun)
    }

    return { results, hasErrors }
  }
  catch (error) {
    logger.error('Error during social media posting:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      results: [{ platform: 'unknown', success: false, error: errorMessage }],
      hasErrors: true,
    }
  }
}
