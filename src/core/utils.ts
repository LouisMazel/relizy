import type { BumpResultTruthy, HookConfig, PackageBase } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { execPromise, logger } from '@maz-ui/node'
import { getPackages } from './repo'

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
    const result = await hookInput(config, dryRun, params)

    if (result)
      logger.debug(`Hook ${hook} returned: ${result}`)

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
    })

    if (result)
      logger.debug(`Hook ${hook} returned: ${result}`)

    logger.info(`Hook ${hook} executed`)

    return result
  }
}

/**
 * Check if we are in a CI environment
 */
// eslint-disable-next-line complexity
export function isInCI(): boolean {
  return Boolean(
    process.env.CI === 'true'
    || process.env.CONTINUOUS_INTEGRATION === 'true'
    || process.env.GITHUB_ACTIONS === 'true'
    || process.env.GITHUB_WORKFLOW
    || process.env.GITLAB_CI === 'true'
    || process.env.CIRCLECI === 'true'
    || process.env.TRAVIS === 'true'
    || process.env.JENKINS_HOME
    || process.env.JENKINS_URL
    || process.env.BUILD_ID
    || process.env.TF_BUILD === 'True'
    || process.env.AZURE_PIPELINES === 'true'
    || process.env.TEAMCITY_VERSION
    || process.env.BITBUCKET_BUILD_NUMBER
    || process.env.DRONE === 'true'
    || process.env.APPVEYOR === 'True'
    || process.env.APPVEYOR === 'true'
    || process.env.BUILDKITE === 'true'
    || process.env.CODEBUILD_BUILD_ID
    || process.env.NETLIFY === 'true'
    || process.env.VERCEL === '1'
    || process.env.HEROKU_TEST_RUN_ID
    || process.env.BUDDY === 'true'
    || process.env.SEMAPHORE === 'true'
    || process.env.CF_BUILD_ID
    || process.env.bamboo_buildKey
    || (process.env.BUILD_ID && process.env.PROJECT_ID)
    || process.env.SCREWDRIVER === 'true'
    || process.env.STRIDER === 'true',
  )
}

/**
 * Get CI name
 */
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
export function getCIName(): string | null {
  if (process.env.GITHUB_ACTIONS === 'true')
    return 'GitHub Actions'
  if (process.env.GITLAB_CI === 'true')
    return 'GitLab CI'
  if (process.env.CIRCLECI === 'true')
    return 'CircleCI'
  if (process.env.TRAVIS === 'true')
    return 'Travis CI'
  if (process.env.JENKINS_HOME || process.env.JENKINS_URL)
    return 'Jenkins'
  if (process.env.TF_BUILD === 'True')
    return 'Azure Pipelines'
  if (process.env.TEAMCITY_VERSION)
    return 'TeamCity'
  if (process.env.BITBUCKET_BUILD_NUMBER)
    return 'Bitbucket Pipelines'
  if (process.env.DRONE === 'true')
    return 'Drone'
  if (process.env.APPVEYOR)
    return 'AppVeyor'
  if (process.env.BUILDKITE === 'true')
    return 'Buildkite'
  if (process.env.CODEBUILD_BUILD_ID)
    return 'AWS CodeBuild'
  if (process.env.NETLIFY === 'true')
    return 'Netlify'
  if (process.env.VERCEL === '1')
    return 'Vercel'
  if (process.env.HEROKU_TEST_RUN_ID)
    return 'Heroku CI'
  if (process.env.BUDDY === 'true')
    return 'Buddy'
  if (process.env.SEMAPHORE === 'true')
    return 'Semaphore'
  if (process.env.CF_BUILD_ID)
    return 'Codefresh'
  if (process.env.bamboo_buildKey)
    return 'Bamboo'
  if (process.env.BUILD_ID && process.env.PROJECT_ID)
    return 'Google Cloud Build'
  if (process.env.SCREWDRIVER === 'true')
    return 'Screwdriver'
  if (process.env.STRIDER === 'true')
    return 'Strider'
  if (process.env.CI === 'true')
    return 'Unknown CI'

  return null
}

/**
 * Execute format command
 */
export async function executeFormatCmd({
  config,
  dryRun,
}: {
  config: ResolvedRelizyConfig
  dryRun: boolean
}) {
  if (config.changelog?.formatCmd) {
    logger.info('Running format command')

    logger.debug(`Running format command: ${config.changelog.formatCmd}`)
    try {
      if (!dryRun) {
        await execPromise(config.changelog.formatCmd, {
          noStderr: true,
          noStdout: true,
          logLevel: config.logLevel,
          cwd: config.cwd,
        })
        logger.info('Format completed')
      }
      else {
        logger.log('[dry-run] exec format command: ', config.changelog.formatCmd)
      }
    }
    catch (error) {
      throw new Error(`Format command failed: ${error}`)
    }
  }
  else {
    logger.debug('No format command specified')
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

    logger.debug(`Running build command: ${config.publish.buildCmd}`)
    if (!dryRun) {
      await execPromise(config.publish.buildCmd, {
        noStderr: true,
        noStdout: true,
        logLevel: config.logLevel,
        cwd: config.cwd,
      })
      logger.info('Build completed')
    }
    else {
      logger.log('[dry-run] exec build command: ', config.publish.buildCmd)
    }
  }
  else {
    logger.debug('No build command specified')
  }
}

export function isBumpedPackage(pkg: PackageBase): pkg is PackageBase & { oldVersion: string } {
  return 'oldVersion' in pkg && !!pkg.oldVersion
}

export async function getPackagesOrBumpedPackages({
  config,
  bumpResult,
  suffix,
  force,
}: {
  config: ResolvedRelizyConfig
  bumpResult: BumpResultTruthy | undefined
  suffix: string | undefined
  force: boolean
}): Promise<PackageBase[]> {
  if (bumpResult?.bumpedPackages && bumpResult.bumpedPackages.length > 0) {
    return bumpResult.bumpedPackages
  }

  return await getPackages({
    config,
    patterns: config.monorepo?.packages,
    suffix,
    force,
  })
}
