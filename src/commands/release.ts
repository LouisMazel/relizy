import type { ResolvedRelizyConfig } from '../core'
import type { BumpResultTruthy, GitProvider, PostedRelease, PublishResponse, ReleaseOptions, SocialResult } from '../types'
import { logger } from '@maz-ui/node'
import { createCommitAndTags, executeHook, loadRelizyConfig, pushCommitAndTags, readPackageJson, rollbackModifiedFiles } from '../core'
import { applyAIOverride } from '../core/ai'
import { bump } from './bump'
import { changelog } from './changelog'
import { tryPostPrComment } from './pr-comment'
import { providerRelease, providerReleaseSafetyCheck } from './provider-release'
import { publish, publishSafetyCheck } from './publish'

import { social, socialSafetyCheck } from './social'

function getReleaseConfig(options: Partial<ReleaseOptions> = {}) {
  return loadRelizyConfig({
    configFile: options.configName,
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
        registries: options.registries,
        tag: options.tag,
        buildCmd: options.buildCmd,
        token: options.publishToken,
        skipExistingVersions: options.skipExistingVersions,
      },
      release: {
        commit: options.commit,
        changelog: options.changelog,
        push: options.push,
        publish: options.publish,
        noVerify: options.noVerify,
        providerRelease: options.providerRelease,
        clean: options.clean,
        gitTag: options.gitTag,
        social: options.social,
        prComment: options.prComment,
      },
      monorepo: options.includePrivates !== undefined
        ? { includePrivates: options.includePrivates }
        : undefined,
      safetyCheck: options.safetyCheck,
    },
  })
}

async function releaseSafetyCheck({
  config,
  provider,
}: {
  config: ResolvedRelizyConfig
  provider?: GitProvider
}) {
  if (!config.safetyCheck) {
    return
  }

  logger.box('Safety checks')
  logger.start('Start safety checks')

  try {
    await Promise.all([
      providerReleaseSafetyCheck({ config, provider }),
      publishSafetyCheck({ config }),
      socialSafetyCheck({ config }),
    ])

    logger.success('Safety checks passed')
  }
  catch (error) {
    logger.error('Safety checks failed')
    throw error
  }
}

/**
 * Build the final "Release workflow completed!" summary box from the outcome of
 * each release step. Pure formatting - no side effects - so it stays easy to read
 * and to test in isolation, and keeps the `release()` orchestration lean.
 */
export function buildReleaseSummary({
  config,
  bumpResult,
  publishResponse,
  createdTags,
  provider,
  postedReleases,
  providerError,
  socialResults,
  prCommentPosted,
}: {
  config: ResolvedRelizyConfig
  bumpResult: BumpResultTruthy
  publishResponse?: PublishResponse
  createdTags: string[]
  provider?: GitProvider
  postedReleases: PostedRelease[]
  providerError?: string
  socialResults?: SocialResult
  prCommentPosted: boolean
}): string {
  const publishedPackageCount = publishResponse?.publishedPackages.length ?? 0
  const versionDisplay = config.monorepo?.versionMode === 'independent'
    ? `${bumpResult.bumpedPackages.length} packages bumped independently`
    : bumpResult.newVersion || readPackageJson(config.cwd)?.version

  // Format provider-release display
  let providerDisplay = 'Disabled'
  if (config.release.providerRelease) {
    if (providerError) {
      providerDisplay = `Failed: ${providerError}`
    }
    else {
      providerDisplay = `${postedReleases.length} release${postedReleases.length !== 1 ? 's' : ''}`
    }
  }

  // Format social media display
  let socialDisplay = 'Disabled'

  if (config.release.social && socialResults) {
    if (socialResults.hasErrors) {
      const failed = socialResults.results.filter(r => !r.success).map(r => r.platform)
      const succeeded = socialResults.results.filter(r => r.success).map(r => r.platform)
      socialDisplay = `${succeeded.length} succeeded, ${failed.length} failed (${failed.join(', ')})`
    }
    else {
      socialDisplay = `${socialResults.results.length} succeeded`
    }
  }

  // Format PR comment display
  let prCommentDisplay = 'Disabled'
  if (config.release.prComment) {
    prCommentDisplay = prCommentPosted ? 'Posted' : 'Failed'
  }

  return 'Release workflow completed!\n\n'
    + `Version: ${versionDisplay ?? 'Unknown'}\n`
    + `Tag(s): ${createdTags?.length ? createdTags.join(', ') : 'None'}\n`
    + `Pushed: ${config.release.push ? 'Yes' : 'Disabled'}\n`
    + `Published packages: ${config.release.publish ? publishedPackageCount : 'Disabled'}\n`
    + `Provider release: ${providerDisplay}\n`
    + `Social media: ${socialDisplay}\n`
    + `PR comment: ${prCommentDisplay}\n`
    + `Git provider: ${provider}`
}

// eslint-disable-next-line sonarjs/cognitive-complexity, complexity
export async function release(options: Partial<ReleaseOptions> = {}): Promise<void> {
  const isCanary = options.canary ?? false

  if (isCanary) {
    logger.info('Canary mode enabled')
    options.commit = false
    options.push = false
    options.changelog = false
    options.providerRelease = false
    options.social = false
    options.gitTag = false

    options.type = 'prerelease'
    options.preid = options.preid || 'canary'
    options.tag = options.tag || 'canary'
  }

  const dryRun = options.dryRun ?? false
  logger.debug(`Dry run: ${dryRun}`)

  const force = options.force ?? false
  logger.debug(`Force bump: ${force}`)

  const config = await getReleaseConfig(options)

  applyAIOverride(config, options.ai)

  logger.debug(`Version mode: ${config.monorepo?.versionMode || 'standalone'}`)
  logger.debug(`Push: ${config.release.push}, Publish: ${config.release.publish}, Provider Release: ${config.release.providerRelease}`)

  await releaseSafetyCheck({ config, provider: options.provider })

  try {
    await executeHook('before:release', config, dryRun)

    logger.box(
      'Bump versions',
      `- type: ${config.bump.type}`,
      ...(config.bump.preid ? [`- preid: ${config.bump.preid}`] : []),
    )

    const bumpResult = await bump({
      type: config.bump.type,
      preid: config.bump.preid,
      dryRun,
      config,
      force,
      clean: config.release.clean,
      configName: options.configName,
      suffix: options.suffix,
      canary: isCanary,
      includePrivates: options.includePrivates,
    })

    if (!bumpResult.bumped) {
      logger.debug('No packages bumped')

      logger.box('Post PR comment')
      await tryPostPrComment({
        config,
        releaseContext: { status: 'no-release' },
        prNumber: options.prNumber,
        dryRun,
        logLevel: config.logLevel,
        configName: options.configName,
      })

      return
    }

    logger.box('Generate changelogs')
    if (config.release.changelog) {
      await changelog({
        from: config.from,
        to: config.to,
        dryRun,
        formatCmd: config.changelog.formatCmd,
        rootChangelog: config.changelog.rootChangelog,
        bumpResult,
        config,
        logLevel: config.logLevel,
        configName: options.configName,
        force,
        suffix: options.suffix,
        includePrivates: options.includePrivates,
      })
    }
    else {
      logger.info('Skipping changelog generation (--no-changelog)')
    }

    logger.box('Publish packages to registry')
    let publishResponse: PublishResponse | undefined

    if (config.release.publish) {
      try {
        publishResponse = await publish({
          registry: config.publish.registry,
          tag: config.publish.tag,
          access: config.publish.access,
          otp: config.publish.otp,
          bumpResult,
          dryRun,
          config,
          configName: options.configName,
          suffix: options.suffix,
          force,
          safetyCheck: false,
        })
      }
      catch (error) {
        logger.fail('Publish failed, rolling back modified files...')
        await rollbackModifiedFiles({ config })
        throw error
      }

      if (isCanary) {
        logger.debug('Canary publish done, rolling back modified files...')
        await rollbackModifiedFiles({ config })
      }
    }
    else {
      logger.info('Skipping publish (--no-publish)')
    }

    logger.box('Commit changes and create tag')

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

    logger.box('Push changes and tags')
    if (config.release.push && config.release.commit) {
      await executeHook('before:push', config, dryRun)

      try {
        await pushCommitAndTags({
          config,
          dryRun,
          logLevel: config.logLevel,
          cwd: config.cwd,
        })

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

    let provider = config.repo?.provider
    let postedReleases: PostedRelease[] = []
    let providerError: string | undefined

    logger.box('Publish Git release')

    if (config.release.providerRelease) {
      logger.debug(`Provider from config: ${provider}`)

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
        force,
        suffix: options.suffix,
        safetyCheck: false,
      })
      provider = response.detectedProvider
      postedReleases = response.postedReleases
      providerError = response.error
    }
    else {
      logger.info('Skipping release (--no-provider-release)')
    }

    logger.box('Post release to social media')
    let socialResults: SocialResult | undefined

    if (config.release.social && (config.social?.twitter?.enabled || config.social?.slack?.enabled)) {
      socialResults = await social({
        from: config.from,
        to: config.to,
        config,
        configName: options.configName,
        bumpResult,
        dryRun,
        logLevel: config.logLevel,
        safetyCheck: false, // Already checked in releaseSafetyCheck
      })
    }
    else {
      logger.info('Skipping social media posts (--no-social or no social media enabled)')
    }

    logger.box('Post PR comment')
    const prCommentPosted = await tryPostPrComment({
      config,
      releaseContext: { status: 'success', bumpResult, tags: createdTags },
      prNumber: options.prNumber,
      dryRun,
      logLevel: config.logLevel,
      configName: options.configName,
    })

    logger.box(buildReleaseSummary({
      config,
      bumpResult,
      publishResponse,
      createdTags,
      provider,
      postedReleases,
      providerError,
      socialResults,
      prCommentPosted,
    }))

    await executeHook('success:release', config, dryRun)
  }
  catch (error) {
    logger.error('Error during release workflow!\n\n', error)

    logger.box('Post PR comment')
    await tryPostPrComment({
      config,
      releaseContext: {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      },
      prNumber: options.prNumber,
      dryRun,
      logLevel: config.logLevel,
      configName: options.configName,
    })

    await executeHook('error:release', config, dryRun)

    throw error
  }
}
