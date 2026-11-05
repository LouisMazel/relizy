import type { ChatPostMessageResponse } from '@slack/web-api'
import type { TweetV2PostTweetResult } from 'twitter-api-v2'
import type { ResolvedRelizyConfig } from '../core'
import type { BumpResultTruthy, GitCommit, SocialNetworkResult, SocialOptions, SocialResult, SocialTemplateVariables } from '../types'
import { logger } from '@maz-ui/node'
import { getErrorMessage } from '@maz-ui/utils/helpers/getErrorMessage'
import { assertVersionGroupsOption, collectContributorNames, collectPackageBumps, executeHook, fillSocialTemplate, filterOutPrivatePackages, generateChangelog, getGroupBumpResult, getPackageCommits, getPackagesOrBumpedPackages, getReleaseLines, getReleaseOverview, getReleaseUrl, getRootPackage, getSlackToken, getSlackWebhookUrl, getSocialTemplateVariables, getTweetLength, getTwitterCredentials, hasVersionGroups, isBumpedPackage, isPrerelease, isRelizyCancelError, loadRelizyConfig, postReleaseToSlack, postReleaseToTwitter, readPackageJson, resolveSlackPostMaxLength, resolveTags, resolveVersionGroups, withoutPrivatePackages } from '../core'
import { aiSafetyCheck, applyAIOverride, generateAISocialChangelog, isAISocialEnabled } from '../core/ai'

type SocialNetworkResponse<T> = { success: true, response?: T } | { success: false, error: string }

function computeTwitterChangelogBudget({
  template,
  variables,
  postMaxLength,
}: {
  template: string
  variables: SocialTemplateVariables
  postMaxLength: number
}): number {
  const overhead = fillSocialTemplate(template, variables, { changelog: '' })

  return Math.max(0, postMaxLength - getTweetLength(overhead))
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
  variables,
  prerelease,
}: {
  config: ResolvedRelizyConfig
  changelog: string
  dryRun: boolean
  variables: SocialTemplateVariables
  /**
   * True when every version of the release is a prerelease
   */
  prerelease: boolean
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
    if (twitterConfig.onlyStable && prerelease) {
      logger.info(`Skipping Twitter post for prerelease ${variables.newVersion || variables.packageList} (social.twitter.onlyStable is enabled)`)
      return { success: true, response: undefined }
    }

    await executeHook('before:twitter', config, dryRun)

    try {
      logger.debug(`Release URL: ${variables.releaseUrl || 'none'}`)
      logger.debug(`Changelog URL: ${variables.changelogUrl || 'none'}`)
      logger.debug(`Changelog generated (${changelog.length} chars)`)

      const response = await postReleaseToTwitter({
        template: config.social.twitter.template || config.templates.twitterMessage,
        variables,
        changelog,
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
  variables,
  commits,
  bumpedPackages,
  prerelease,
}: {
  config: ResolvedRelizyConfig
  changelog: string
  dryRun: boolean
  variables: SocialTemplateVariables
  commits: GitCommit[]
  bumpedPackages?: Array<{ name: string, version: string, oldVersion: string, newVersion?: string }>
  /**
   * True when every version of the release is a prerelease
   */
  prerelease: boolean
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
    logger.debug(`Preparing Slack message for release: ${variables.releaseTitle}`)

    // Check if this is a prerelease and if we should skip it
    if ((slackConfig.onlyStable ?? true) && prerelease) {
      logger.info(`Skipping Slack post for prerelease ${variables.newVersion || variables.packageList} (social.slack.onlyStable is enabled)`)
      return { success: true, response: undefined }
    }

    try {
      await executeHook('before:slack', config, dryRun)

      logger.debug(`Release URL: ${variables.releaseUrl || 'none'}`)
      logger.debug(`Changelog URL: ${variables.changelogUrl || 'none'}`)
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
        variables,
        changelog,
        channel: slackConfig.channel,
        token: token ?? undefined,
        webhookUrl: webhookUrl ?? undefined,
        template,
        contributors,
        packages,
        postMaxLength: slackConfig.postMaxLength,
        changelogFormat: slackConfig.changelogFormat ?? 'summary',
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

/**
 * Post the release of each version group, with the config of the group.
 */
async function socialForVersionGroups({
  config,
  options,
}: {
  config: ResolvedRelizyConfig
  options: Partial<SocialOptions>
}): Promise<SocialResult> {
  const results: SocialResult['results'] = []

  for (const { group, config: groupConfig } of resolveVersionGroups({ config, only: options.groups })) {
    const groupBumpResult = getGroupBumpResult(options.bumpResult, group.name)

    if (groupBumpResult === null) {
      logger.debug(`Version group "${group.name}" did not bump, nothing to post`)
      continue
    }

    if (groupConfig.release.social === false) {
      logger.info(`Version group "${group.name}" is left out of the social posts (release.social: false)`)
      continue
    }

    const groupResult = await social({ ...options, config: groupConfig, bumpResult: groupBumpResult })
    results.push(...groupResult.results)
  }

  return { results, hasErrors: results.some(result => !result.success) }
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
        safetyCheck: options.safetyCheck,
      },
    })

    assertVersionGroupsOption({ config, groups: options.groups })

    if (hasVersionGroups(config)) {
      return await socialForVersionGroups({ config, options })
    }

    applyAIOverride(config, options.ai)

    if (options.slackFormat) {
      config.social.slack = { ...config.social.slack, changelogFormat: options.slackFormat }
    }

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

    const isIndependent = config.monorepo?.versionMode === 'independent'

    let minifiedBody: string
    let richBody: string
    let changelogCommits: GitCommit[]
    // What the post announces: the packages and their versions
    let released: BumpResultTruthy
    // Tag of the release URL, when the post announces a single version
    let tag: string | undefined

    if (isIndependent) {
      // Independent mode: aggregate one changelog section per bumped package,
      // each resolved against its own `packagename@version` tags. The root
      // package is never tagged in this mode, so it must never be used here
      // (doing so is what produced the `git log <root@x>...<root@y>` crash).
      const packages = filterOutPrivatePackages(await getPackagesOrBumpedPackages({
        config,
        bumpResult: options.bumpResult,
        suffix: options.suffix,
        force: options.force ?? false,
        dryRun,
      }))

      const minifiedSections: string[] = []
      const richSections: string[] = []
      const commitsByHash = new Map<string, GitCommit>()

      for (const pkg of packages) {
        const pkgVersion = (isBumpedPackage(pkg) && pkg.newVersion) || pkg.version
        // `pkg.fromTag` is the previous `packagename@x` tag resolved at bump time
        // (or the NEW_PACKAGE_MARKER for a brand-new package).
        const from = config.from || pkg.fromTag

        if (!from) {
          logger.warn(`No from tag found for ${pkg.name}, skipping its changelog section`)
          continue
        }

        const minSection = await generateChangelog({
          pkg: { ...pkg, fromTag: from },
          config,
          dryRun,
          newVersion: pkgVersion,
          include: { title: true, compareLink: false, body: true, contributors: false },
          minify: true,
        })
        const richSection = await generateChangelog({
          pkg: { ...pkg, fromTag: from },
          config,
          dryRun,
          newVersion: pkgVersion,
          include: { title: true, compareLink: false, body: true, contributors: false },
          minify: false,
        })

        if (minSection.trim()) {
          minifiedSections.push(minSection)
        }
        if (richSection.trim()) {
          richSections.push(richSection)
        }

        // Collect contributors across all packages. `to` is HEAD because the
        // release tags do not exist yet at this stage of the release flow.
        const pkgCommits = await getPackageCommits({
          pkg,
          from,
          to: 'HEAD',
          config,
          changelog: true,
          dryRun,
        })
        for (const commit of pkgCommits) {
          commitsByHash.set(commit.shortHash || commit.message, commit)
        }
      }

      minifiedBody = minifiedSections.join('\n\n')
      richBody = richSections.join('\n\n')
      changelogCommits = [...commitsByHash.values()]

      released = {
        bumped: true,
        bumpedPackages: packages.map(pkg => ({
          ...pkg,
          oldVersion: (isBumpedPackage(pkg) && pkg.oldVersion) || pkg.version,
          newVersion: (isBumpedPackage(pkg) && pkg.newVersion) || pkg.version,
        })),
      }
    }
    else {
      const resolvedNewVersion = options.bumpResult?.newVersion || rootPackageRead.version

      const { from, to } = await resolveTags<'social'>({
        config,
        step: 'social',
        newVersion: resolvedNewVersion,
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
        dryRun,
      })

      minifiedBody = await generateChangelog({
        pkg: { ...rootPackage, fromTag },
        config,
        dryRun,
        newVersion: resolvedNewVersion,
        include: { title: false, compareLink: false, body: true, contributors: false },
        minify: true,
      })
      richBody = await generateChangelog({
        pkg: { ...rootPackage, fromTag },
        config,
        dryRun,
        newVersion: resolvedNewVersion,
        include: { title: false, compareLink: false, body: true, contributors: false },
        minify: false,
      })

      released = {
        bumped: true,
        newVersion: resolvedNewVersion,
        fromTag,
        bumpedPackages: options.bumpResult?.bumpedPackages ?? [],
      }
      tag = to
      // Fetch commits with `changelog: true` so contributors who only authored
      // title-only commits (e.g. `docs:`) still appear in Slack notifications.
      // `to` resolves to the future release tag (created later in the release
      // flow), so `git log` must use HEAD instead.
      changelogCommits = await getPackageCommits({
        pkg: rootPackage,
        from: fromTag,
        to: 'HEAD',
        config,
        changelog: true,
        dryRun,
      })
    }

    const overview = withoutPrivatePackages(getReleaseOverview({ config, bumpResult: released }))
    const lines = getReleaseLines(overview)
    tag ??= lines.length === 1 ? lines[0]!.tag : undefined

    const variables = getSocialTemplateVariables({
      overview,
      releaseUrl: tag ? getReleaseUrl(config, tag) : undefined,
      changelogUrl: config.social?.changelogUrl,
    })

    // The release is a prerelease only if every version is a prerelease, so an
    // onlyStable post is skipped only when there is nothing stable to announce
    const prerelease = lines.length > 0 && lines.every(line => isPrerelease(line.version))

    const hasContent = !!minifiedBody.trim()

    const twitterWillPost = !!config.social?.twitter?.enabled && !(config.social.twitter.onlyStable && prerelease)
    const slackWillPost = !!config.social?.slack?.enabled && !((config.social.slack.onlyStable ?? true) && prerelease)

    let twitterChangelog = minifiedBody
    if (hasContent && twitterWillPost && isAISocialEnabled(config, 'twitter')) {
      const twitterTemplate = config.social.twitter.template || config.templates.twitterMessage
      const twitterBudget = computeTwitterChangelogBudget({
        template: twitterTemplate,
        variables,
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

    const slackChangelogFormat = config.social?.slack?.changelogFormat ?? 'summary'
    const slackBody = slackChangelogFormat === 'full' ? richBody : minifiedBody
    let slackChangelog = slackBody
    if (hasContent && slackWillPost && isAISocialEnabled(config, 'slack')) {
      slackChangelog = await generateAISocialChangelog({
        config,
        rawBody: richBody,
        fallbackBody: slackBody,
        platform: 'slack',
        maxLength: resolveSlackPostMaxLength({ changelogFormat: slackChangelogFormat, postMaxLength: config.social.slack.postMaxLength }),
      })
      if (dryRun) {
        logger.box('[dry-run] AI Slack preview', slackChangelog)
      }
    }

    const twitterResponse = await handleTwitterPost({
      config,
      changelog: twitterChangelog,
      dryRun,
      variables,
      prerelease,
    })

    const slackResponse = await handleSlackPost({
      config,
      changelog: slackChangelog,
      dryRun,
      variables,
      commits: changelogCommits,
      bumpedPackages: options.bumpResult?.bumpedPackages,
      prerelease,
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
    // Refused or cancelled prompt: nothing was written, it is not a failure
    if (isRelizyCancelError(error)) {
      throw error
    }

    logger.error('Error during social media posting:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      results: [{ platform: 'unknown', success: false, error: errorMessage }],
      hasErrors: true,
    }
  }
}
