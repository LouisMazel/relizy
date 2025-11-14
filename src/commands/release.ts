import type { ResolvedRelizyConfig } from '../core'
import type { GitProvider, PostedRelease, PublishResponse, ReleaseOptions } from '../types'
import { logger } from '@maz-ui/node'
import { createCommitAndTags, getRootPackage, isPrerelease, loadRelizyConfig, pushCommitAndTags } from '../core'
import { extractChangelogSummary, getReleaseUrl, getTwitterCredentials, postReleaseToTwitter } from '../core/twitter'
import { executeHook } from '../core/utils'
import { bump } from './bump'
import { changelog } from './changelog'
import { providerRelease, providerReleaseSafetyCheck } from './provider-release'
import { publish } from './publish'

function getReleaseConfig(options: Partial<ReleaseOptions> = {}) {
  return loadRelizyConfig({
    configName: options.configName,
    overrides: {
      logLevel: options.logLevel,
      from: options.from,
      to: options.to,
      tokens: {
        github: options.token,
        gitlab: options.token,
      },
      bump: {
        type: options.type,
        preid: options.preid,
        clean: options.clean,
        yes: options.yes,
      },
      changelog: {
        formatCmd: options.formatCmd,
        rootChangelog: options.rootChangelog,
      },
      publish: {
        access: options.access,
        otp: options.otp,
        registry: options.registry,
        tag: options.tag,
        buildCmd: options.buildCmd,
      },
      release: {
        commit: options.commit,
        changelog: options.changelog,
        push: options.push,
        publish: options.publish,
        noVerify: options.noVerify,
        providerRelease: options.providerRelease,
        clean: options.clean,
        twitter: options.twitter,
        twitterOnlyStable: options.twitterOnlyStable,
      },
      safetyCheck: options.safetyCheck,
    },
  })
}

function releaseSafetyCheck({
  config,
  provider,
}: {
  config: ResolvedRelizyConfig
  provider?: GitProvider
}) {
  if (!config.safetyCheck) {
    return
  }

  providerReleaseSafetyCheck({ config, provider })
}

async function handleTwitterPost({
  config,
  postedReleases,
  bumpResult,
  dryRun,
}: {
  config: ResolvedRelizyConfig
  postedReleases: PostedRelease[]
  bumpResult: any
  dryRun: boolean
}) {
  if (!config.release.twitter) {
    logger.info('Skipping Twitter post (--no-twitter)')
    return
  }

  try {
    const credentials = getTwitterCredentials()

    if (!credentials) {
      logger.warn('Twitter credentials not found. Set TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, and TWITTER_ACCESS_TOKEN_SECRET environment variables.')
      logger.info('Skipping Twitter post')
      return
    }

    const mainRelease = postedReleases[0]

    if (!mainRelease) {
      logger.warn('No release found to tweet about')
      return
    }

    // Check if this is a prerelease and if we should skip it
    if (config.release.twitterOnlyStable && isPrerelease(mainRelease.version)) {
      logger.info(`Skipping Twitter post for prerelease version ${mainRelease.version} (twitterOnlyStable is enabled)`)
      return
    }

    await executeHook('before:twitter', config, dryRun)

    try {
      const rootPackage = getRootPackage(config.cwd)
      const releaseUrl = getReleaseUrl(config, mainRelease.tag)

      // Generate a summary from the latest changelog
      // In production, you might want to read the actual changelog file
      const changelogSummary = extractChangelogSummary(
        `Version ${mainRelease.version} includes ${bumpResult.bumpedPackages.length} updated package(s).`,
        150,
      )

      await postReleaseToTwitter({
        release: mainRelease,
        projectName: rootPackage.name,
        changelog: changelogSummary,
        releaseUrl,
        credentials,
        messageTemplate: config.templates.twitterMessage,
        dryRun,
      })

      await executeHook('success:twitter', config, dryRun)
    }
    catch (error) {
      await executeHook('error:twitter', config, dryRun)
      logger.error('Error posting to Twitter:', error)
      // Don't throw - Twitter posting failure shouldn't fail the release
    }
  }
  catch (error) {
    logger.error('Error during Twitter posting:', error)
    // Don't throw - Twitter posting failure shouldn't fail the release
  }
}

// eslint-disable-next-line sonarjs/cognitive-complexity, complexity
export async function release(options: Partial<ReleaseOptions> = {}): Promise<void> {
  const dryRun = options.dryRun ?? false
  logger.debug(`Dry run: ${dryRun}`)

  const force = options.force ?? false
  logger.debug(`Force bump: ${force}`)

  const config = await getReleaseConfig(options)

  logger.debug(`Version mode: ${config.monorepo?.versionMode || 'standalone'}`)
  logger.debug(`Push: ${config.release.push}, Publish: ${config.release.publish}, Provider Release: ${config.release.providerRelease}`)

  releaseSafetyCheck({ config, provider: options.provider })

  try {
    await executeHook('before:release', config, dryRun)

    logger.box('Step 1/6: Bump versions')

    const bumpResult = await bump({
      type: config.bump.type,
      preid: config.bump.preid,
      dryRun,
      config,
      force,
      clean: config.release.clean,
      configName: options.configName,
    })

    if (!bumpResult.bumped) {
      logger.debug('No packages bumped')
      return
    }

    logger.box('Step 2/6: Generate changelogs')
    if (config.release.changelog) {
      await changelog({
        from: config.from,
        to: config.to,
        dryRun,
        formatCmd: config.changelog.formatCmd,
        rootChangelog: config.changelog.rootChangelog,
        bumpedPackages: bumpResult.bumpedPackages,
        config,
        logLevel: config.logLevel,
        configName: options.configName,
      })
    }
    else {
      logger.info('Skipping changelog generation (--no-changelog)')
    }

    logger.box('Step 3/6: Commit changes and create tag')

    let createdTags: string[] = []
    if (config.release.commit) {
      createdTags = await createCommitAndTags({
        config,
        noVerify: config.release.noVerify,
        bumpedPackages: bumpResult.bumpedPackages,
        newVersion: bumpResult.newVersion,
        dryRun,
        logLevel: config.logLevel,
      })
    }
    else {
      logger.info('Skipping commit and tag (--no-commit)')
    }

    logger.box('Step 4/6: Push changes and tags')
    if (config.release.push && config.release.commit) {
      await executeHook('before:push', config, dryRun)

      try {
        await pushCommitAndTags({ dryRun, logLevel: config.logLevel, cwd: config.cwd })

        await executeHook('success:push', config, dryRun)
      }
      catch (error) {
        await executeHook('error:push', config, dryRun)
        throw error
      }
    }
    else {
      logger.info('Skipping push (--no-push or --no-commit)')
    }

    logger.box('Step 5/6: Publish packages to registry')
    let publishResponse: PublishResponse | undefined

    if (config.release.publish) {
      publishResponse = await publish({
        registry: config.publish.registry,
        tag: config.publish.tag,
        access: config.publish.access,
        otp: config.publish.otp,
        bumpedPackages: bumpResult.bumpedPackages,
        dryRun,
        config,
        configName: options.configName,
      })
    }
    else {
      logger.info('Skipping publish (--no-publish)')
    }

    let provider = config.repo?.provider
    let postedReleases: PostedRelease[] = []

    logger.box('Step 6/7: Publish Git release')
    if (config.release.providerRelease) {
      logger.debug(`Provider from config: ${provider}`)

      try {
        const response = await providerRelease({
          from: config.from,
          to: config.to,
          token: options.token,
          provider,
          dryRun,
          config,
          logLevel: config.logLevel,
          bumpResult,
          configName: options.configName,
        })
        provider = response.detectedProvider
        postedReleases = response.postedReleases
      }
      catch (error) {
        logger.error('Error during release publication:', error)
      }
    }
    else {
      logger.info('Skipping release (--no-provider-release)')
    }

    logger.box('Step 7/7: Post release to Twitter')
    await handleTwitterPost({
      config,
      postedReleases,
      bumpResult,
      dryRun,
    })

    const publishedPackageCount = publishResponse?.publishedPackages.length ?? 0
    const versionDisplay = config.monorepo?.versionMode === 'independent'
      ? `${bumpResult.bumpedPackages.length} packages bumped independently`
      : bumpResult.newVersion || getRootPackage(config.cwd).version

    logger.box('Release workflow completed!\n\n'
      + `Version: ${versionDisplay}\n`
      + `Tag(s): ${createdTags.length ? createdTags.join(', ') : 'No'}\n`
      + `Pushed: ${config.release.push ? 'Yes' : 'Disabled'}\n`
      + `Published packages: ${config.release.publish ? publishedPackageCount : 'Disabled'}\n`
      + `Published release: ${config.release.providerRelease ? postedReleases.length : 'Disabled'}\n`
      + `Twitter post: ${config.release.twitter ? 'Yes' : 'Disabled'}\n`
      + `Git provider: ${provider}`)

    await executeHook('success:release', config, dryRun)
  }
  catch (error) {
    logger.error('Error during release workflow!\n\n', error)

    await executeHook('error:release', config, dryRun)

    throw error
  }
}
