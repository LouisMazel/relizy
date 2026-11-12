import type { BumpResultTruthy, HookConfig, HookContext, PackageBase } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { execPromise, logger } from '@maz-ui/node'
import { clearGitCache } from '@relizy/core'
import { isRelizyCancelError } from './errors'
import { reportProgress } from './progress'
import { getReleaseOverview } from './release-overview'
import { getPackages } from './repo'

/**
 * Context of the hooks of the steps of a release, undefined without bump result
 */
export function getHookContext(config: ResolvedRelizyConfig, bumpResult: BumpResultTruthy | undefined): HookContext | undefined {
  return bumpResult
    ? {
        bumpResult,
        release: getReleaseOverview({ config, bumpResult }),
      }
    : undefined
}

/**
 * The error of a hook, with the hook it comes from: `before:publish hook failed: ...`
 */
function getHookError(hook: keyof HookConfig, error: unknown): unknown {
  if (isRelizyCancelError(error)) {
    return error
  }

  const message = error instanceof Error
    ? error.message
    : String(error)
  return new Error(`${hook} hook failed: ${message}`, { cause: error })
}

/**
 * Execute a hook
 */
export async function executeHook(hook: keyof HookConfig, config: ResolvedRelizyConfig, dryRun: boolean, params?: any) {
  const hookInput = config.hooks?.[hook]

  if (!hookInput) {
    logger.debug(`Hook ${hook} not found`)
    return
  }

  if (typeof hookInput === 'function') {
    logger.info(`Executing hook ${hook}`)
    let result
    try {
      result = await hookInput(config, dryRun, params)
    }
    catch (error) {
      throw getHookError(hook, error)
    }
    // A hook can commit, tag or check out
    clearGitCache()

    if (result) {
      logger.debug(`Hook ${hook} returned: ${typeof result === 'object'
        ? JSON.stringify(result)
        : result}`)
    }

    logger.info(`Hook ${hook} executed`)

    return result
  }

  if (typeof hookInput === 'string') {
    logger.info(`Executing hook ${hook}`)
    const result = await execPromise(hookInput, {
      logLevel: config.logLevel,
      cwd: config.cwd,
      noStderr: true,
      noStdout: true,
    }).catch((error) => {
      throw getHookError(hook, error)
    })
    clearGitCache()

    if (result) {
      logger.debug(`Hook ${hook} returned: ${typeof result === 'object'
        ? JSON.stringify(result)
        : result}`)
    }

    logger.info(`Hook ${hook} executed`)

    return result
  }
}

/**
 * Execute build command
 */
export async function executeBuildCmd({
  config,
  dryRun,
}: {
  config: ResolvedRelizyConfig
  dryRun: boolean
}) {
  if (config.publish?.buildCmd) {
    logger.info('Running build command')
    reportProgress(`Building the packages (${config.publish.buildCmd})`)

    logger.debug(`Running build command: ${config.publish.buildCmd}`)

    if (!dryRun) {
      await execPromise(config.publish.buildCmd, {
        noStderr: true,
        noStdout: true,
        logLevel: config.logLevel,
        cwd: config.cwd,
      })
      clearGitCache()
      logger.info('Build completed')
    }
    else {
      logger.info('[dry-run] exec build command: ', config.publish.buildCmd)
    }
  }
  else {
    logger.debug('No build command specified')
  }
}

export async function getPackagesOrBumpedPackages({
  config,
  bumpResult,
  suffix,
  force,
  dryRun = false,
}: {
  config: ResolvedRelizyConfig
  bumpResult: BumpResultTruthy | undefined
  suffix: string | undefined
  force: boolean
  dryRun?: boolean
}): Promise<PackageBase[]> {
  if (bumpResult?.bumpedPackages && bumpResult.bumpedPackages.length > 0) {
    return bumpResult.bumpedPackages
  }

  return await getPackages({
    config,
    suffix,
    force,
    dryRun,
  })
}
