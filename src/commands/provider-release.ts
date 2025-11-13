import type { ResolvedRelizyConfig } from '../core'
import type { GitProvider, PostedRelease, ProviderReleaseOptions } from '../types'
import { logger } from '@maz-ui/node'
import { detectGitProvider, github, gitlab, loadRelizyConfig } from '../core'
import { executeHook } from '../core/utils'

export function providerReleaseSafetyCheck({ config, provider }: { config: ResolvedRelizyConfig, provider?: GitProvider | null }) {
  if (!config.safetyCheck || !config.release.providerRelease) {
    return
  }

  const internalProvider = provider || config.repo?.provider || detectGitProvider()

  let token: string | undefined

  if (internalProvider === 'github') {
    token = config.tokens?.github || config.repo?.token
  }
  else if (internalProvider === 'gitlab') {
    token = config.tokens?.gitlab || config.repo?.token
  }
  else {
    logger.error(`Unsupported Git provider: ${internalProvider || 'unknown'}`)
    process.exit(1)
  }

  if (!token) {
    logger.error(`No token provided for ${internalProvider || 'unknown'} - The release will not be published - Please refer to the documentation: https://louismazel.github.io/relizy/guide/installation#environment-setup`)
    process.exit(1)
  }
}

export async function providerRelease(
  options: Partial<ProviderReleaseOptions> = {},
): Promise<{ detectedProvider: GitProvider, postedReleases: PostedRelease[] }> {
  const config = await loadRelizyConfig({
    configName: options.configName,
    baseConfig: options.config,
    overrides: {
      from: options.from || (options.bumpResult?.bumped === true ? options.bumpResult.fromTag : undefined),
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

  try {
    await executeHook('before:provider-release', config, dryRun)

    const detectedProvider = options.provider || detectGitProvider()

    providerReleaseSafetyCheck({ config, provider: detectedProvider })

    logger.start('Start provider release')

    if (!detectedProvider) {
      logger.warn('Unable to detect Git provider. Skipping release publication.')
      throw new Error('Unable to detect Git provider')
    }
    else {
      logger.info(
        options.provider ? `Using Git provider: ${options.provider}` : `Detected Git provider: ${detectedProvider}`,
      )
    }

    let postedReleases: PostedRelease[] = []

    const payload = {
      from: config.from,
      to: config.to,
      dryRun,
      config,
      logLevel: config.logLevel,
      bumpResult: options.bumpResult,
    }

    if (detectedProvider === 'github') {
      postedReleases = await github(payload)
    }
    else if (detectedProvider === 'gitlab') {
      postedReleases = await gitlab(payload)
    }
    else {
      logger.warn(`Unsupported Git provider: ${detectedProvider}`)
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

    throw error
  }
}
