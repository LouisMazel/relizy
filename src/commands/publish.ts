import type { PackageBase, PublishOptions, PublishResponse } from '../types'
import { logger } from '@maz-ui/node'
import { detectPackageManager, executeBuildCmd, getIndependentTag, getPackages, getPackagesToPublishInIndependentMode, getPackagesToPublishInSelectiveMode, loadRelizyConfig, publishPackage, readPackageJson, topologicalSort } from '../core'
import { executeHook } from '../core/utils'

// eslint-disable-next-line complexity
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
      },
      logLevel: options.logLevel,
    },
  })

  const dryRun = options.dryRun ?? false
  logger.debug(`Dry run: ${dryRun}`)

  const packageManager = detectPackageManager(process.cwd())
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

    const rootPackage = readPackageJson(config.cwd)

    logger.start('Start publishing packages')

    const packages = options.bumpedPackages || await getPackages({
      config,
      patterns: config.publish.packages ?? config.monorepo?.packages,
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
