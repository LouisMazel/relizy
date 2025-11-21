import type { ResolvedRelizyConfig } from '../core'
import type { BumpResultTruthy, PostedRelease, SocialOptions } from '../types'
import { logger } from '@maz-ui/node'
import { generateChangelog, getCurrentGitRef, getFirstCommit, getIndependentTag, getPackageCommits, getRootPackage, isPrerelease, loadRelizyConfig, readPackageJson } from '../core'
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
    const credentials = getTwitterCredentials(twitterConfig.credentials)

    if (!credentials) {
      logger.warn('[social:twitter] Twitter credentials not found. Set TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, and TWITTER_ACCESS_TOKEN_SECRET environment variables or configure them in social.twitter.credentials.')
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

      logger.debug(`[social:twitter] Changelog generated (${changelog.length} chars)`)

      // Extract summary from the generated changelog
      const changelogSummary = extractChangelogSummary(changelog, 150)
      logger.debug(`[social:twitter] Changelog summary: ${changelogSummary.substring(0, 50)}...`)

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
      logger.error('[social:twitter] Error posting to Twitter:', error)
      // Don't throw - Twitter posting failure shouldn't fail the social command
    }
  }
  catch (error) {
    logger.error('[social:twitter] Error during Twitter posting:', error)
    // Don't throw - Twitter posting failure shouldn't fail the social command
  }
}

export async function social(options: Partial<SocialOptions> = {}): Promise<void> {
  try {
    const dryRun = options.dryRun ?? false
    logger.debug(`[social] Dry run: ${dryRun}`)

    const config = await loadRelizyConfig({
      configName: options.configName,
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
    if (!config.release.social && !config.social?.twitter?.enabled) {
      logger.warn('[social] Social media posting is disabled in configuration.')
      logger.info('Enable it with release.social: true or social.twitter.enabled: true')
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

      // Future: Add other social platforms here
      // await handleLinkedInPost({ config, postedReleases, dryRun })
      // await handleSlackPost({ config, postedReleases, dryRun })

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
