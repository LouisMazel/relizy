import type { ResolvedRelizyConfig } from '../core'
import type { GitProvider, PostedRelease, ProviderReleaseOptions } from '../types'
import { logger } from '@maz-ui/node'
import { detectGitProvider, github, gitlab, loadRelizyConfig } from '../core'
import { executeHook } from '../core/utils'

export function providerReleaseSafetyCheck({ config, provider }: { config: ResolvedRelizyConfig, provider?: GitProvider }) {
  if (!config.safetyCheck || !config.release.providerRelease) {
    return
  }

  let token: string | undefined

  if (provider === 'github') {
    token = config.tokens?.github
  }
  else if (provider === 'gitlab') {
    token = config.tokens?.gitlab
  }
  else {
    logger.error('Unsupported Git provider')
    process.exit(1)
  }

  if (!token) {
    logger.error('No token provided')
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

  try {
    await executeHook('before:provider-release', config)

    const dryRun = options.dryRun ?? false
    logger.debug(`Dry run: ${dryRun}`)

    providerReleaseSafetyCheck({ config, provider: options.provider })

    logger.info(`Version mode: ${config.monorepo?.versionMode || 'standalone'}`)

    const detectedProvider = options.provider || detectGitProvider()

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

    await executeHook('after:provider-release', config)

    return {
      detectedProvider,
      postedReleases,
    }
  }
  catch (error) {
    logger.error('Error publishing releases:', error)

    await executeHook('error:provider-release', config)

    throw error
  }
}
