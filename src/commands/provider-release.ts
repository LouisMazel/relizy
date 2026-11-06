import type { ResolvedRelizyConfig } from '../core'
import type { BumpResultTruthy, GitProvider, PostedRelease, ProviderReleaseOptions, ProviderReleaseResult } from '../types'
import { logger } from '@maz-ui/node'
import { assertVersionGroupsOption, createCommandUi, detectGitProvider, executeHook, getGroupBumpResult, getHookContext, github, gitlab, hasVersionGroups, isFancyUi, isRelizyCancelError, loadRelizyConfig, resolveVersionGroups } from '../core'
import { aiSafetyCheck, applyAIOverride, isAIProviderReleaseEnabled } from '../core/ai'
import { prepareCiRepository } from '../core/ci'
import { withGitCache } from '../core/git-cache'
import { reportProgress } from '../core/progress'
import { getProviderReleaseLinks } from '../core/release-facts'

/**
 * True when a provider release of the run uses AI: the `ai` option of the run
 * (`--ai`/`--no-ai`) wins, then the `ai.providerRelease` options of the config
 * and of the version groups.
 */
function usesAIProviderRelease(config: ResolvedRelizyConfig, ai?: boolean): boolean {
  if (ai !== undefined) {
    return ai
  }

  return isAIProviderReleaseEnabled(config)
    || (hasVersionGroups(config) && config.monorepo!.groups!.some(group => group.ai?.providerRelease?.enabled))
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
    token = config.tokens?.github || config.repo?.token
  }
  else if (internalProvider === 'gitlab') {
    token = config.tokens?.gitlab || config.repo?.token
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
 * Post the releases of each version group, with the config of the group
 */
async function postVersionGroupsReleases({
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

  for (const { group, config: groupConfig } of resolveVersionGroups({ config, only: options.groups })) {
    const groupBumpResult = getGroupBumpResult(options.bumpResult, group.name)

    if (groupBumpResult === null) {
      logger.debug(`Version group "${group.name}" did not bump, no release to publish`)
      continue
    }

    if (groupConfig.release.providerRelease === false) {
      logger.info(`Skipping the provider releases of version group "${group.name}" (release.providerRelease: false)`)
      continue
    }

    // The --ai/--no-ai option wins over the ai options of the group
    applyAIOverride(groupConfig, options.ai)

    postedReleases.push(...await postProviderReleases({
      provider,
      config: groupConfig,
      bumpResult: groupBumpResult,
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

async function runProviderRelease(
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
  const hookContext = getHookContext(config, options.bumpResult)
  const ui = createCommandUi({ title: 'relizy provider-release', dryRun, logLevel: config.logLevel, cwd: config.cwd })

  try {
    // The CI clone: full history, branch, identity
    prepareCiRepository(config.cwd)

    const result = await ui.step({
      running: 'Creating the releases',
      done: describeProviderReleaseResult,
      failed: result => Boolean(result.error),
      run: async (): Promise<ProviderReleaseResult> => {
        detectedProvider = options.provider || detectGitProvider(config.cwd)
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
            options.provider ? `Using Git provider: ${options.provider}` : `Detected Git provider: ${detectedProvider}`,
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

        const postedReleases: PostedRelease[] = hasVersionGroups(config)
          ? await postVersionGroupsReleases({ provider: detectedProvider, config, options, dryRun })
          : await postProviderReleases({
              provider: detectedProvider,
              config,
              bumpResult: options.bumpResult,
              options,
              dryRun,
            })

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
  }
  catch (error) {
    // Refused or cancelled prompt: nothing was written, it is not a failure
    if (isRelizyCancelError(error)) {
      ui.fail(error)
      throw error
    }

    if (!options.config && !isFancyUi()) {
      logger.error('Error publishing releases!\n\n', error)
    }

    await executeHook('error:provider-release', config, dryRun, hookContext)

    ui.fail(error, 'Provider release')

    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      detectedProvider: detectedProvider || 'github',
      postedReleases: [],
      error: errorMessage,
    }
  }
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
