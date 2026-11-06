import type { ResolvedRelizyConfig } from '../core'
import type { BumpResultTruthy, GitProvider, PostedRelease, ProviderReleaseOptions, ProviderReleaseResult } from '../types'
import { logger } from '@maz-ui/node'
import { assertVersionGroupsOption, detectGitProvider, executeHook, getReleaseTargets, github, gitlab, hasVersionGroups, loadRelizyConfig } from '../core'
import { aiSafetyCheck, applyAIOverride, isAIProviderReleaseEnabled, isAIRunInRelease } from '../core/ai'
import { withGitCache } from '../core/git-cache'
import { reportProgress } from '../core/progress'
import { getProviderReleaseLinks } from '../core/release-facts'
import { runCommand } from './run-command'

/**
 * True when a provider release of the run uses AI: the `ai` option of the run
 * (`--ai`/`--no-ai`) wins, then the `ai.providerRelease` options of the config
 * and of the version groups. Never for a prerelease bump with `onlyStable`.
 */
function usesAIProviderRelease(config: ResolvedRelizyConfig, ai?: boolean): boolean {
  if (ai !== undefined) {
    return ai && isAIRunInRelease(config, 'providerRelease')
  }

  const usesAI = (targetConfig: ResolvedRelizyConfig) => isAIProviderReleaseEnabled(targetConfig) && isAIRunInRelease(targetConfig, 'providerRelease')

  return usesAI(config)
    || (hasVersionGroups(config) && config.monorepo!.groups!.some(group => usesAI({ ...config, ai: { ...config.ai, ...group.ai } })))
}

export async function providerReleaseSafetyCheck({ config, provider, ai }: {
  config: ResolvedRelizyConfig
  provider?: GitProvider | null
  /**
   * `ai` option of the run, overriding the AI options of the config
   */
  ai?: boolean
}) {
  if (!config.safetyCheck || !config.release.providerRelease) {
    logger.debug('Safety check disabled or provider release disabled')
    return
  }

  logger.debug('Start checking provider release config')

  const internalProvider = provider || config.repo?.provider || detectGitProvider(config.cwd)

  // Bitbucket doesn't support releases via API
  if (internalProvider === 'bitbucket') {
    logger.warn('Bitbucket does not support releases via API')
    logger.info('Relizy will skip the release creation step for Bitbucket')
    return
  }

  let token: string | undefined

  if (internalProvider === 'github') {
    token = config.tokens?.github
  }
  else if (internalProvider === 'gitlab') {
    token = config.tokens?.gitlab
  }
  else {
    throw new Error(`Unsupported Git provider: ${internalProvider || 'unknown'}`)
  }

  if (!token) {
    throw new Error(`No token provided for ${internalProvider} - The release will not be published - Please refer to the documentation: https://relizy.dev/config/overview#tokens`)
  }

  if (usesAIProviderRelease(config, ai)) {
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

/**
 * Post the releases of the config, or of each version group with the config
 * of the group
 */
async function postReleases({
  provider,
  config,
  options,
  dryRun,
}: {
  provider: GitProvider
  config: ResolvedRelizyConfig
  options: Partial<ProviderReleaseOptions>
  dryRun: boolean
}): Promise<PostedRelease[]> {
  const postedReleases: PostedRelease[] = []

  const targets = getReleaseTargets({
    config,
    bumpResult: options.bumpResult,
    only: options.groups,
    nothing: 'no release to publish',
    leftOut: groupConfig => groupConfig.release.providerRelease === false ? 'left out of the provider releases (release.providerRelease: false)' : undefined,
  })

  for (const target of targets) {
    if (target.group) {
      // The --ai/--no-ai option wins over the ai options of the group
      applyAIOverride(target.config, options.ai)
    }

    postedReleases.push(...await postProviderReleases({
      provider,
      config: target.config,
      bumpResult: target.bumpResult,
      options,
      dryRun,
    }))
  }

  return postedReleases
}

export function providerRelease(
  options: Partial<ProviderReleaseOptions> = {},
): Promise<ProviderReleaseResult> {
  // One git cache for the run: the same refs and ranges are read for each package and each step
  return withGitCache(() => runProviderRelease(options))
}

function runProviderRelease(
  options: Partial<ProviderReleaseOptions> = {},
): Promise<ProviderReleaseResult> {
  let detectedProvider: GitProvider | null = null

  return runCommand({
    name: 'provider-release',
    label: 'Provider release',
    errorMessage: 'Error publishing releases!',
    hook: 'provider-release',
    options,
    loadConfig: async () => {
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

      return config
    },
    // The release goes on without its provider releases: the error is in the result
    recover: error => ({
      detectedProvider: detectedProvider || 'github',
      postedReleases: [],
      error: error instanceof Error ? error.message : String(error),
    }),
    run: async ({ config, dryRun, ui, hookContext }) => {
      logger.debug(`Version mode: ${config.monorepo?.versionMode || 'standalone'}`)

      const result = await ui.step({
        running: 'Creating the releases',
        done: describeProviderReleaseResult,
        failed: result => Boolean(result.error),
        run: async (): Promise<ProviderReleaseResult> => {
          detectedProvider = options.provider || config.repo?.provider || detectGitProvider(config.cwd)
          reportProgress('Checking the release')
          await providerReleaseSafetyCheck({ config, provider: detectedProvider, ai: options.ai })

          await executeHook('before:provider-release', config, dryRun, hookContext)

          logger.start('Start provider release')

          if (!detectedProvider) {
            logger.fail('Unable to detect Git provider. Skipping release publication.')
            throw new Error('Unable to detect Git provider')
          }
          else {
            logger.info(
              options.provider || config.repo?.provider ? `Using Git provider: ${detectedProvider}` : `Detected Git provider: ${detectedProvider}`,
            )
          }

          assertVersionGroupsOption({ config, groups: options.groups })

          // Skip Bitbucket as it doesn't support releases
          if (detectedProvider === 'bitbucket') {
            logger.warn('⚠️  Bitbucket does not support releases via API')
            logger.info('Skipping release creation for Bitbucket')
            logger.info('Git tags will still be created during the commit step')

            await executeHook('success:provider-release', config, dryRun, hookContext)

            return {
              detectedProvider,
              postedReleases: [],
            }
          }

          const postedReleases = await postReleases({ provider: detectedProvider, config, options, dryRun })

          await executeHook('success:provider-release', config, dryRun, hookContext)

          return {
            detectedProvider,
            postedReleases,
          }
        },
      })

      const created = result.postedReleases.length
      ui.complete(created === 0
        ? { message: describeProviderReleaseResult(result), nothing: true }
        : {
            message: `${dryRun ? 'Previewed' : 'Created'} ${describeReleaseCount(result)}`,
            links: getProviderReleaseLinks({ config, postedReleases: result.postedReleases }),
          })

      return result
    },
  })
}

function describeReleaseCount({ detectedProvider, postedReleases }: ProviderReleaseResult): string {
  const host = detectedProvider === 'gitlab' ? 'GitLab' : 'GitHub'
  return `${postedReleases.length} ${host} ${postedReleases.length === 1 ? 'release' : 'releases'}`
}

/**
 * What the provider release did: `1 GitHub release created`
 */
export function describeProviderReleaseResult(result: ProviderReleaseResult): string {
  if (result.error) {
    return `${result.detectedProvider === 'gitlab' ? 'GitLab' : 'GitHub'} release failed: ${result.error}`
  }

  if (result.detectedProvider === 'bitbucket') {
    return 'No release on Bitbucket, only the tags'
  }

  return result.postedReleases.length === 0 ? 'No release to create' : `${describeReleaseCount(result)} created`
}
