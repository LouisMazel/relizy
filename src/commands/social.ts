import type { ChatPostMessageResponse } from '@slack/web-api'
import type { GitCommit } from 'changelogen'
import type { TweetV2PostTweetResult } from 'twitter-api-v2'
import type { ResolvedRelizyConfig } from '../core'
import type { SocialNetworkResult, SocialOptions, SocialResult } from '../types'
import { logger } from '@maz-ui/node'
import { getErrorMessage } from '@maz-ui/utils'
import { buildChangelogBody, collectContributorNames, collectPackageBumps, executeHook, getReleaseUrl, getRootPackage, getSlackToken, getSlackWebhookUrl, getTwitterCredentials, isPrerelease, loadRelizyConfig, postReleaseToSlack, postReleaseToTwitter, readPackageJson, resolveTags } from '../core'
import { aiSafetyCheck, applyAIOverride, generateAISocialChangelog, isAISocialEnabled } from '../core/ai'

type SocialNetworkResponse<T> = { success: true, response?: T } | { success: false, error: string }

function computeTwitterChangelogBudget({
  template,
  projectName,
  version,
  releaseUrl,
  changelogUrl,
  postMaxLength,
}: {
  template: string
  projectName: string
  version: string
  releaseUrl?: string
  changelogUrl?: string
  postMaxLength: number
}): number {
  const overhead = template
    .replace('{{projectName}}', projectName)
    .replace('{{newVersion}}', version)
    .replace('{{releaseUrl}}', releaseUrl ?? '')
    .replace('{{changelogUrl}}', changelogUrl ?? '')
    .replace('{{changelog}}', '')
    .length

  return Math.max(0, postMaxLength - overhead)
}

// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
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
      const webhookUrl = getSlackWebhookUrl({ socialWebhookUrl: slackConfig.webhookUrl })
      const token = getSlackToken({
        socialCredentials: slackConfig.credentials,
        tokenCredential: config.tokens?.slack,
      })

      if (webhookUrl) {
        // Webhook mode — priority. @slack/web-api is not required.
        if (slackConfig.channel) {
          logger.warn('social.slack.channel is ignored when webhookUrl is set (channel is baked into the webhook URL).')
        }
        if (token) {
          logger.warn('Slack token is ignored when webhookUrl is set (webhook takes priority).')
        }
      }
      else if (token) {
        // Token mode — check @slack/web-api and require channel
        try {
          await import('@slack/web-api')
        }
        catch {
          logger.fail('@slack/web-api is not installed, please install it')
          throw new Error('@slack/web-api is not installed')
        }

        if (!slackConfig.channel) {
          logger.fail('Slack is enabled but no channel is configured.')
          logger.log('Set the channel in social.slack.channel (e.g., "#releases" or "C1234567890") or switch to webhookUrl for a simpler setup.')

          throw new Error('Slack channel not found')
        }
      }
      else {
        // Neither webhook nor token
        logger.fail('Slack is enabled but no credentials are configured.')
        logger.log('Provide ONE of the following:')
        logger.log('  (a) social.slack.webhookUrl (or SLACK_WEBHOOK_URL / RELIZY_SLACK_WEBHOOK_URL env var) — simpler setup, channel baked in')
        logger.log('  (b) social.slack.credentials.token (or SLACK_TOKEN / RELIZY_SLACK_TOKEN env var) + social.slack.channel — requires bot invite')

        throw new Error('Slack credentials not found')
      }
    }

    if (isAISocialEnabled(config, 'twitter') || isAISocialEnabled(config, 'slack')) {
      await aiSafetyCheck({ config })
    }

    logger.info('Social config checked successfully')
  }
  catch (error) {
    logger.error('Error during social safety check:', getErrorMessage(error))
    throw new Error(`Error during social safety check: ${getErrorMessage(error)}`, { cause: error })
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
        projectName: config.projectName || rootPackageBase.name,
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

// eslint-disable-next-line complexity
async function handleSlackPost({
  config,
  changelog,
  dryRun,
  newVersion,
  tag,
  commits,
  bumpedPackages,
}: {
  config: ResolvedRelizyConfig
  changelog: string
  dryRun: boolean
  newVersion: string
  tag: string
  commits: GitCommit[]
  bumpedPackages?: Array<{ name: string, version: string, oldVersion: string, newVersion?: string }>
}): Promise<SocialNetworkResponse<ChatPostMessageResponse | { ok: true, transport: 'webhook' } | undefined>> {
  // Check if Slack is enabled specifically
  const slackConfig = config.social?.slack
  if (!slackConfig?.enabled) {
    logger.debug('Slack posting is disabled in configuration')
    return { success: true, response: undefined }
  }

  logger.debug('Slack posting is enabled')

  try {
    const webhookUrl = getSlackWebhookUrl({ socialWebhookUrl: slackConfig.webhookUrl })
    const token = getSlackToken({
      socialCredentials: slackConfig.credentials,
      tokenCredential: config.tokens?.slack,
    })

    if (!webhookUrl && !token) {
      logger.warn('Neither Slack webhookUrl nor token is configured. Set SLACK_WEBHOOK_URL / SLACK_TOKEN or configure social.slack.webhookUrl / credentials.token.')
      logger.info('Skipping Slack post')
      return { success: false, error: 'Slack credentials not found' }
    }

    if (!webhookUrl && !slackConfig.channel) {
      logger.warn('Slack channel not configured (required in token mode). Set it in social.slack.channel.')
      logger.info('Skipping Slack post')
      return { success: false, error: 'Slack channel not configured' }
    }

    const slackMode = webhookUrl ? 'webhook mode' : `token mode, channel: ${slackConfig.channel}`
    logger.debug(`Slack: ${slackMode}`)
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

      // Resolve contributors: global noAuthors is the gate, slack-specific can further restrict
      const shouldHideContributors
        = config.noAuthors === true
          || slackConfig.noAuthors === true
      const contributors = shouldHideContributors
        ? []
        : collectContributorNames({ commits, config })
      logger.debug(`Contributors: ${contributors.length}`)

      // Resolve bumped packages (list shown between changelog and contributors)
      const packages = slackConfig.noPackages === true
        ? []
        : collectPackageBumps({ bumpedPackages: bumpedPackages as any })
      logger.debug(`Packages: ${packages.length}`)

      const response = await postReleaseToSlack({
        version: newVersion,
        projectName: config.projectName || rootPackageBase.name,
        changelog,
        releaseUrl,
        changelogUrl,
        channel: slackConfig.channel,
        token: token ?? undefined,
        webhookUrl: webhookUrl ?? undefined,
        template,
        contributors,
        packages,
        postMaxLength: slackConfig.postMaxLength ?? 2500,
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

// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
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

    applyAIOverride(config, options.ai)

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

    const minifiedBody = buildChangelogBody({ commits: rootPackage.commits, config, minify: true })
    const richBody = buildChangelogBody({ commits: rootPackage.commits, config, minify: false })
    const hasContent = !!minifiedBody.trim()

    const twitterReleaseUrl = getReleaseUrl(config, to)
    const twitterChangelogUrl = config.social?.changelogUrl

    const prerelease = isPrerelease(newVersion)
    const twitterWillPost = !!config.social?.twitter?.enabled && !(config.social.twitter.onlyStable && prerelease)
    const slackWillPost = !!config.social?.slack?.enabled && !((config.social.slack.onlyStable ?? true) && prerelease)

    let twitterChangelog = minifiedBody
    if (hasContent && twitterWillPost && isAISocialEnabled(config, 'twitter')) {
      const twitterTemplate = config.social.twitter.template || config.templates.twitterMessage
      const twitterBudget = computeTwitterChangelogBudget({
        template: twitterTemplate,
        projectName: config.projectName || rootPackageRead.name,
        version: newVersion,
        releaseUrl: twitterReleaseUrl,
        changelogUrl: twitterChangelogUrl,
        postMaxLength: config.social.twitter.postMaxLength,
      })

      twitterChangelog = await generateAISocialChangelog({
        config,
        rawBody: richBody,
        fallbackBody: minifiedBody,
        platform: 'twitter',
        maxLength: twitterBudget,
      })
      if (dryRun) {
        logger.box('[dry-run] AI Twitter preview', `\n\n${twitterChangelog}`)
      }
    }

    let slackChangelog = minifiedBody
    if (hasContent && slackWillPost && isAISocialEnabled(config, 'slack')) {
      slackChangelog = await generateAISocialChangelog({
        config,
        rawBody: richBody,
        fallbackBody: minifiedBody,
        platform: 'slack',
      })
      if (dryRun) {
        logger.box('[dry-run] AI Slack preview', slackChangelog)
      }
    }

    const twitterResponse = await handleTwitterPost({
      config,
      changelog: twitterChangelog,
      dryRun,
      newVersion,
      tag: to,
    })

    const slackResponse = await handleSlackPost({
      config,
      changelog: slackChangelog,
      dryRun,
      newVersion,
      tag: to,
      commits: rootPackage.commits,
      bumpedPackages: options.bumpResult?.bumpedPackages,
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
