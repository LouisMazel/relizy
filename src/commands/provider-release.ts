import type { ResolvedRelizyConfig } from '../core'
import type { BumpResultTruthy, GitProvider, PostedRelease, ProviderReleaseOptions, ProviderReleaseResult } from '../types'
import { logger } from '@maz-ui/node'
import { assertVersionGroupsOption, detectGitProvider, executeHook, getGroupBumpResult, github, gitlab, hasVersionGroups, loadRelizyConfig, resolveVersionGroups } from '../core'
import { aiSafetyCheck, applyAIOverride, isAIProviderReleaseEnabled } from '../core/ai'

export async function providerReleaseSafetyCheck({ config, provider }: { config: ResolvedRelizyConfig, provider?: GitProvider | null }) {
  if (!config.safetyCheck || !config.release.providerRelease) {
    logger.debug('Safety check disabled or provider release disabled')
    return
  }

  logger.debug('Start checking provider release config')

  const internalProvider = provider || config.repo?.provider || detectGitProvider()

  // Bitbucket doesn't support releases via API
  if (internalProvider === 'bitbucket') {
    logger.warn('Bitbucket does not support releases via API')
    logger.info('Relizy will skip the release creation step for Bitbucket')
    return
  }

  let token: string | undefined

  if (internalProvider === 'github') {
    token = config.tokens?.github || config.repo?.token
  }
  else if (internalProvider === 'gitlab') {
    token = config.tokens?.gitlab || config.repo?.token
  }
  else {
    throw new Error(`Unsupported Git provider: ${internalProvider || 'unknown'}`)
  }

  if (!token) {
    throw new Error(`No token provided for ${internalProvider} - The release will not be published - Please refer to the documentation: https://relizy.dev/guide/installation#environment-setup`)
  }

  if (isAIProviderReleaseEnabled(config)) {
    await aiSafetyCheck({ config })
  }

  logger.info('provider release config checked successfully')
}

function postProviderReleases({
  provider,
  config,
  bumpResult,
  options,
  dryRun,
}: {
  provider: GitProvider
  config: ResolvedRelizyConfig
  bumpResult: BumpResultTruthy | undefined
  options: Partial<ProviderReleaseOptions>
  dryRun: boolean
}): Promise<PostedRelease[]> {
  const payload = {
    from: config.from || bumpResult?.fromTag,
    to: config.to,
    dryRun,
    config,
    logLevel: config.logLevel,
    bumpResult,
    force: options.force ?? false,
    suffix: options.suffix,
  }

  if (provider === 'github') {
    return github(payload)
  }

  if (provider === 'gitlab') {
    return gitlab(payload)
  }

  logger.error(`Unsupported Git provider: ${provider}`)
  return Promise.resolve([])
}

export async function providerRelease(
  options: Partial<ProviderReleaseOptions> = {},
): Promise<ProviderReleaseResult> {
  const config = await loadRelizyConfig({
    configFile: options.configName,
    baseConfig: options.config,
    overrides: {
      from: options.from,
      to: options.to,
      tokens: {
        github: options.token,
        gitlab: options.token,
      },
      logLevel: options.logLevel,
      safetyCheck: options.safetyCheck,
    },
  })

  applyAIOverride(config, options.ai)

  const dryRun = options.dryRun ?? false
  logger.debug(`Dry run: ${dryRun}`)

  logger.debug(`Version mode: ${config.monorepo?.versionMode || 'standalone'}`)

  let detectedProvider: GitProvider | null = null

  try {
    detectedProvider = options.provider || detectGitProvider()
    await providerReleaseSafetyCheck({ config, provider: detectedProvider })

    await executeHook('before:provider-release', config, dryRun)

    logger.start('Start provider release')

    if (!detectedProvider) {
      logger.fail('Unable to detect Git provider. Skipping release publication.')
      throw new Error('Unable to detect Git provider')
    }
    else {
      logger.info(
        options.provider ? `Using Git provider: ${options.provider}` : `Detected Git provider: ${detectedProvider}`,
      )
    }

    assertVersionGroupsOption({ config, groups: options.groups })

    let postedReleases: PostedRelease[] = []

    // Skip Bitbucket as it doesn't support releases
    if (detectedProvider === 'bitbucket') {
      logger.warn('⚠️  Bitbucket does not support releases via API')
      logger.info('Skipping release creation for Bitbucket')
      logger.info('Git tags will still be created during the commit step')

      await executeHook('success:provider-release', config, dryRun)

      return {
        detectedProvider,
        postedReleases: [],
      }
    }

    if (hasVersionGroups(config)) {
      for (const { group, config: groupConfig } of resolveVersionGroups({ config, only: options.groups })) {
        const groupBumpResult = getGroupBumpResult(options.bumpResult, group.name)

        if (groupBumpResult === null) {
          logger.debug(`Version group "${group.name}" did not bump, no release to publish`)
          continue
        }

        postedReleases.push(...await postProviderReleases({
          provider: detectedProvider,
          config: groupConfig,
          bumpResult: groupBumpResult,
          options,
          dryRun,
        }))
      }
    }
    else {
      postedReleases = await postProviderReleases({
        provider: detectedProvider,
        config,
        bumpResult: options.bumpResult,
        options,
        dryRun,
      })
    }

    await executeHook('success:provider-release', config, dryRun)

    return {
      detectedProvider,
      postedReleases,
    }
  }
  catch (error) {
    if (!options.config) {
      logger.error('Error publishing releases!\n\n', error)
    }

    await executeHook('error:provider-release', config, dryRun)

    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      detectedProvider: detectedProvider || 'github',
      postedReleases: [],
      error: errorMessage,
    }
  }
}
