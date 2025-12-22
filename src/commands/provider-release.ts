import type { ResolvedRelizyConfig } from '../core'
import type { GitProvider, PostedRelease, ProviderReleaseOptions, ProviderReleaseResult } from '../types'
import { logger } from '@maz-ui/node'
import { detectGitProvider, executeHook, github, gitlab, loadRelizyConfig } from '../core'

export function providerReleaseSafetyCheck({ config, provider }: { config: ResolvedRelizyConfig, provider?: GitProvider | null }) {
  logger.start('Start checking provider release config')

  if (!config.safetyCheck || !config.release.providerRelease) {
    return
  }

  const internalProvider = provider || config.repo?.provider || detectGitProvider()

  // Bitbucket doesn't support releases via API
  if (internalProvider === 'bitbucket') {
    logger.warn('[provider-release-safety-check] Bitbucket does not support releases via API')
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
    logger.error(`[provider-release-safety-check] Unsupported Git provider: ${internalProvider || 'unknown'}`)
    process.exit(1)
  }

  if (!token) {
    logger.error(`[provider-release-safety-check] No token provided for ${internalProvider || 'unknown'} - The release will not be published - Please refer to the documentation: https://louismazel.github.io/relizy/guide/installation#environment-setup`)
    process.exit(1)
  }

  logger.success('provider release config checked successfully')
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

  const dryRun = options.dryRun ?? false
  logger.debug(`Dry run: ${dryRun}`)

  logger.info(`Version mode: ${config.monorepo?.versionMode || 'standalone'}`)

  let detectedProvider: GitProvider | null = null

  try {
    detectedProvider = options.provider || detectGitProvider()
    providerReleaseSafetyCheck({ config, provider: detectedProvider })

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

    const payload = {
      from: config.from || options.bumpResult?.fromTag,
      to: config.to,
      dryRun,
      config,
      logLevel: config.logLevel,
      bumpResult: options.bumpResult,
      force: options.force ?? false,
      suffix: options.suffix,
    }

    if (detectedProvider === 'github') {
      postedReleases = await github(payload)
    }
    else if (detectedProvider === 'gitlab') {
      postedReleases = await gitlab(payload)
    }
    else {
      logger.error(`Unsupported Git provider: ${detectedProvider}`)
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
