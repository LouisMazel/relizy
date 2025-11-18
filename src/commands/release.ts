import type { ResolvedRelizyConfig } from '../core'
import type { GitProvider, PostedRelease, PublishResponse, ReleaseOptions } from '../types'
import { logger } from '@maz-ui/node'
import { createCommitAndTags, loadRelizyConfig, pushCommitAndTags, readPackageJson } from '../core'
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
        gitTag: options.gitTag,
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
      suffix: options.suffix,
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
        bumpResult,
        config,
        logLevel: config.logLevel,
        configName: options.configName,
        force,
        suffix: options.suffix,
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
        suffix: options.suffix,
        force,
      })
    }
    else {
      logger.info('Skipping publish (--no-publish)')
    }

    let provider = config.repo?.provider
    let postedReleases: PostedRelease[] = []

    logger.box('Step 6/6: Publish Git release')
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
          force,
          suffix: options.suffix,
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

    const publishedPackageCount = publishResponse?.publishedPackages.length ?? 0
    const versionDisplay = config.monorepo?.versionMode === 'independent'
      ? `${bumpResult.bumpedPackages.length} packages bumped independently`
      : bumpResult.newVersion || readPackageJson(config.cwd).version

    logger.box('Release workflow completed!\n\n'
      + `Version: ${versionDisplay}\n`
      + `Tag(s): ${createdTags.length ? createdTags.join(', ') : 'No'}\n`
      + `Pushed: ${config.release.push ? 'Yes' : 'Disabled'}\n`
      + `Published packages: ${config.release.publish ? publishedPackageCount : 'Disabled'}\n`
      + `Published release: ${config.release.providerRelease ? postedReleases.length : 'Disabled'}\n`
      + `Git provider: ${provider}`)

    await executeHook('success:release', config, dryRun)
  }
  catch (error) {
    logger.error('Error during release workflow!\n\n', error)

    await executeHook('error:release', config, dryRun)

    throw error
  }
}
