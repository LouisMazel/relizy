import type { ResolvedRelizyConfig } from '../core'
import type { PackageBase, PublishOptions, PublishResponse } from '../types'
import { execPromise, logger } from '@maz-ui/node'
import { detectPackageManager, executeBuildCmd, getAuthCommand, getIndependentTag, getPackagesToPublishInIndependentMode, getPackagesToPublishInSelectiveMode, loadRelizyConfig, publishPackage, readPackageJson, topologicalSort } from '../core'
import { executeHook, getPackagesOrBumpedPackages } from '../core/utils'

export async function publishSafetyCheck({ config }: { config: ResolvedRelizyConfig }) {
  logger.debug('[publish-safety-check] Running publish safety check')

  if (!config.safetyCheck || !config.release.publish || !config.publish.safetyCheck) {
    logger.debug('[publish-safety-check] Safety check disabled or publish disabled')
    return
  }

  const packageManager = config.publish.packageManager || detectPackageManager(config.cwd)

  if (!packageManager) {
    logger.error('[publish-safety-check] Unable to detect package manager')
    process.exit(1)
  }

  const isPnpmOrNpm = packageManager === 'pnpm' || packageManager === 'npm'

  if (isPnpmOrNpm) {
    const authCommand = getAuthCommand({
      packageManager,
      config,
      otp: config.publish.otp,
    })

    try {
      logger.debug('[publish-safety-check] Authenticating to package registry...')
      await execPromise(authCommand, {
        cwd: config.cwd,
        noStderr: true,
        noStdout: true,
        logLevel: config.logLevel,
        noSuccess: true,
      })
      logger.info('[publish-safety-check] Successfully authenticated to package registry')
    }
    catch (error) {
      logger.error('[publish-safety-check] Failed to authenticate to package registry:', error)
      process.exit(1)
    }
  }
}

// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
export async function publish(options: Partial<PublishOptions> = {}) {
  const config = await loadRelizyConfig({
    configName: options.configName,
    baseConfig: options.config,
    overrides: {
      publish: {
        access: options.access,
        otp: options.otp,
        registry: options.registry,
        tag: options.tag,
        buildCmd: options.buildCmd,
        token: options.token,
      },
      logLevel: options.logLevel,
      safetyCheck: options.safetyCheck,
    },
  })

  const dryRun = options.dryRun ?? false
  logger.debug(`Dry run: ${dryRun}`)

  const packageManager = config.publish.packageManager || detectPackageManager(config.cwd)

  logger.debug(`Package manager: ${packageManager}`)

  logger.info(`Version mode: ${config.monorepo?.versionMode || 'standalone'}`)

  if (config.publish.registry) {
    logger.debug(`Registry: ${config.publish.registry}`)
  }
  if (config.publish.tag) {
    logger.debug(`Tag: ${config.publish.tag}`)
  }

  try {
    await executeHook('before:publish', config, dryRun)

    await publishSafetyCheck({ config })

    const rootPackage = readPackageJson(config.cwd)

    if (!rootPackage) {
      throw new Error('Failed to read root package.json')
    }

    logger.start('Start publishing packages')

    const packages = await getPackagesOrBumpedPackages({
      config,
      bumpResult: options.bumpResult,
      suffix: options.suffix,
      force: options.force ?? false,
    })

    logger.debug(`Found ${packages.length} package(s)`)

    logger.debug('Building dependency graph and sorting...')
    const sortedPackages = topologicalSort(packages)

    let publishedPackages: PackageBase[] = packages || []

    if (publishedPackages.length === 0 && config.monorepo?.versionMode === 'independent') {
      logger.debug('Determining packages to publish in independent mode...')

      publishedPackages = await getPackagesToPublishInIndependentMode(sortedPackages, config)

      logger.info(`Publishing ${publishedPackages.length} package(s) (independent mode)`)
      logger.debug(`Packages: ${publishedPackages.join(', ')}`)
    }
    else if (publishedPackages.length === 0 && config.monorepo?.versionMode === 'selective') {
      logger.debug('Determining packages to publish in selective mode...')
      publishedPackages = getPackagesToPublishInSelectiveMode(sortedPackages, rootPackage.version)
      logger.info(`Publishing ${publishedPackages.length} package(s) matching root version (selective mode)`)
      logger.debug(`Packages: ${publishedPackages.join(', ')}`)
    }
    else if (publishedPackages.length === 0) {
      publishedPackages = sortedPackages
      logger.info(`Publishing ${publishedPackages.length} package(s) (unified mode)`)
    }

    if (publishedPackages.length === 0) {
      logger.fail('No packages need to be published')
      return
    }

    await executeBuildCmd({
      config,
      dryRun,
    })

    for (const pkg of sortedPackages) {
      if (publishedPackages.some(p => p.name === pkg.name)) {
        logger.debug(`Publishing ${getIndependentTag({ name: pkg.name, version: pkg.newVersion || pkg.version })}...`)
        await publishPackage({
          pkg,
          config,
          packageManager,
          dryRun,
        })
      }
    }

    if (!dryRun) {
      logger.info('Package(s) have been published to npm registry')
    }

    logger.success('Publishing packages completed!')

    await executeHook('success:publish', config, dryRun)

    return {
      publishedPackages,
    } satisfies PublishResponse
  }
  catch (error) {
    if (!options.config) {
      logger.error('Error during publishing packages!\n\n', error)
    }

    await executeHook('error:publish', config, dryRun)

    throw error
  }
}
