import type { ResolvedRelizyConfig } from '../core'
import type { BumpResultTruthy, PackageBase, PublishOptions, PublishResponse, RegistryTarget } from '../types'
import { execPromise, logger } from '@maz-ui/node'
import { assertVersionGroupsOption, checkWorkspaceDependencies, executeBuildCmd, getAuthCommand, getGroupBumpResult, getIndependentTag, getPackagesToPublishInIndependentMode, getPackagesToPublishInSelectiveMode, hasVersionGroups, loadRelizyConfig, publishPackage, readPackageJson, reportStalePeerDependents, resolveAllConfiguredRegistryTargets, resolveRegistryTargetsForPackages, resolveVersionGroups, sortPackagesForPublish, withRegistryNpmrc } from '../core'
import { executeHook, filterOutPrivatePackages, getPackagesOrBumpedPackages } from '../core/utils'

/**
 * Authenticate against a single registry target, enforcing the configured
 * timeout and surfacing a clear error on timeout or failure.
 */
async function checkRegistryAuth({
  config,
  registryTarget,
  registryLabel,
}: {
  config: ResolvedRelizyConfig
  registryTarget: RegistryTarget
  registryLabel: string
}) {
  const authCommand = getAuthCommand({
    packageManager: config.publish.packageManager,
    config,
    registryTarget,
    otp: registryTarget.otp,
  })
  const timeoutMs = config.publish.safetyCheckTimeout ?? 15000

  // Warn the user if the registry is slow, so a multi-second wait does not look
  // like a freeze. Fires well before the timeout and is always cleared after.
  const patienceDelay = Math.min(5000, Math.floor(timeoutMs / 2))
  const patienceTimer = setTimeout(() => {
    logger.info(`The package registry is taking longer than expected to respond (will time out at ${Math.round(timeoutMs / 1000)}s)...`)
  }, patienceDelay)

  try {
    logger.info(`Authenticating to package registry${registryLabel}...`)
    // execPromise enforces the timeout, masks the token in its logs/errors,
    // and kills the command on timeout (error.killed is then true). The token
    // is provided through a temporary `.npmrc` (restored right after), never as
    // a CLI flag, so `whoami` parses on every package manager and version.
    await withRegistryNpmrc({
      config,
      registryTarget,
      packageManager: config.publish.packageManager,
      fn: () => execPromise(authCommand, {
        cwd: config.cwd,
        timeout: timeoutMs,
        noStdout: true,
        noStderr: true,
        noSuccess: true,
        noError: true,
        logLevel: config.logLevel,
      }),
    })
    logger.info(`Successfully authenticated to package registry${registryLabel}`)
  }
  catch (error) {
    if ((error as { killed?: boolean })?.killed) {
      throw new Error(
        `Authentication to package registry${registryLabel} timed out after ${timeoutMs}ms. `
        + 'The registry did not respond - check your network or registry access, '
        + 'increase publish.safetyCheckTimeout, or skip this check with --no-safety-check.',
        { cause: error },
      )
    }
    throw new Error(`Failed to authenticate to package registry${registryLabel}`, { cause: error })
  }
  finally {
    clearTimeout(patienceTimer)
  }
}

export async function publishSafetyCheck({ config, packages }: { config: ResolvedRelizyConfig, packages?: PackageBase[] }) {
  if (!config.safetyCheck || !config.release.publish || !config.publish.safetyCheck) {
    logger.debug('Safety check disabled or publish disabled')
    return
  }

  logger.debug('Start checking auth config to package registry')

  const isPnpmOrNpm = config.publish.packageManager === 'pnpm' || config.publish.packageManager === 'npm'

  if (!isPnpmOrNpm) {
    logger.debug(`Skipping authentication to package registry because "${config.publish.packageManager}" is not supported`)
    return
  }

  // When the packages to publish are already known, only check the registries
  // they actually need - a registry scoped to packages outside this release
  // should not block it. Otherwise, conservatively check everything configured.
  const registryTargets = packages
    ? resolveRegistryTargetsForPackages(packages, config)
    : resolveAllConfiguredRegistryTargets(config)
  const showRegistryLabel = registryTargets.length > 1

  for (const registryTarget of registryTargets) {
    const registryLabel = showRegistryLabel
      ? ` [${registryTarget.name ?? registryTarget.registry ?? 'default'}]`
      : ''

    await checkRegistryAuth({ config, registryTarget, registryLabel })
  }
}

interface PackagesToPublish {
  /**
   * Packages in publish order (see `sortPackagesForPublish`)
   */
  sortedPackages: PackageBase[]
  publishedPackages: PackageBase[]
}

/**
 * Packages of the config to publish, sorted in publish order.
 */
async function getPackagesToPublish({
  config,
  bumpResult,
  suffix,
  force,
  dryRun,
  rootVersion,
}: {
  config: ResolvedRelizyConfig
  bumpResult: BumpResultTruthy | undefined
  suffix: string | undefined
  force: boolean
  dryRun: boolean
  rootVersion: string
}): Promise<PackagesToPublish> {
  const discoveredPackages = await getPackagesOrBumpedPackages({
    config,
    bumpResult,
    suffix,
    force,
    dryRun,
  })

  const packages = filterOutPrivatePackages(discoveredPackages)

  if (discoveredPackages.length !== packages.length) {
    logger.debug(`Filtered out ${discoveredPackages.length - packages.length} private package(s) from publish`)
  }

  logger.debug(`Found ${packages.length} package(s)`)

  logger.debug('Building dependency graph and sorting...')
  const sortedPackages = sortPackagesForPublish(packages)

  let publishedPackages: PackageBase[] = packages || []

  if (publishedPackages.length === 0 && config.monorepo?.versionMode === 'independent') {
    logger.debug('Determining packages to publish in independent mode...')

    publishedPackages = await getPackagesToPublishInIndependentMode(sortedPackages, config)

    logger.info(`Publishing ${publishedPackages.length} package(s) (independent mode)`)
    logger.debug(`Packages: ${publishedPackages.join(', ')}`)
  }
  else if (publishedPackages.length === 0 && config.monorepo?.versionMode === 'selective') {
    logger.debug('Determining packages to publish in selective mode...')
    publishedPackages = getPackagesToPublishInSelectiveMode(sortedPackages, rootVersion)
    logger.info(`Publishing ${publishedPackages.length} package(s) matching root version (selective mode)`)
    logger.debug(`Packages: ${publishedPackages.join(', ')}`)
  }
  else if (publishedPackages.length === 0) {
    publishedPackages = sortedPackages
    logger.info(`Publishing ${publishedPackages.length} package(s) (unified mode)`)
  }

  return { sortedPackages, publishedPackages }
}

/**
 * Packages to publish of every version group, sorted in a single publish order:
 * a package is published after its internal dependencies, whatever their group.
 */
async function getGroupsPackagesToPublish({
  config,
  options,
  dryRun,
  rootVersion,
}: {
  config: ResolvedRelizyConfig
  options: Partial<PublishOptions>
  dryRun: boolean
  rootVersion: string
}): Promise<PackagesToPublish> {
  const publishedPackages: PackageBase[] = []

  for (const { group, config: groupConfig } of resolveVersionGroups({ config, only: options.groups })) {
    const groupBumpResult = getGroupBumpResult(options.bumpResult, group.name)

    if (groupBumpResult === null) {
      logger.debug(`Version group "${group.name}" did not bump, nothing to publish`)
      continue
    }

    const { publishedPackages: groupPackages } = await getPackagesToPublish({
      config: groupConfig,
      bumpResult: groupBumpResult,
      suffix: options.suffix,
      force: options.force ?? false,
      dryRun,
      rootVersion: groupBumpResult?.newVersion ?? rootVersion,
    })

    logger.info(`Version group "${group.name}": ${groupPackages.length} package(s) to publish`)

    publishedPackages.push(...groupPackages)
  }

  return { sortedPackages: sortPackagesForPublish(publishedPackages), publishedPackages }
}

/**
 * New versions of the packages bumped by the run, by name.
 */
function getPlannedVersions(bumpResult: BumpResultTruthy | undefined): Map<string, string> {
  return new Map((bumpResult?.bumpedPackages ?? [])
    .filter(pkg => pkg.newVersion)
    .map(pkg => [pkg.name, pkg.newVersion!]))
}

export async function publish(options: Partial<PublishOptions> = {}) {
  const config = await loadRelizyConfig({
    configFile: options.configName,
    baseConfig: options.config,
    overrides: {
      publish: {
        access: options.access,
        otp: options.otp,
        registry: options.registry,
        registries: options.registries,
        tag: options.tag,
        buildCmd: options.buildCmd,
        token: options.token,
        skipExistingVersions: options.skipExistingVersions,
        checkWorkspaceDependencies: options.checkWorkspaceDependencies,
      },
      logLevel: options.logLevel,
      safetyCheck: options.safetyCheck,
    },
  })

  const dryRun = options.dryRun ?? false
  logger.debug(`Dry run: ${dryRun}`)

  logger.debug(`Package manager: ${config.publish.packageManager}`)

  logger.debug(`Version mode: ${config.monorepo?.versionMode || 'standalone'}`)

  if (config.publish.registry) {
    logger.debug(`Registry: ${config.publish.registry}`)
  }
  if (config.publish.tag) {
    logger.debug(`Tag: ${config.publish.tag}`)
  }

  try {
    await executeHook('before:publish', config, dryRun)

    const rootPackage = readPackageJson(config.cwd)

    if (!rootPackage) {
      throw new Error('Failed to read root package.json')
    }

    logger.start('Start publishing packages')

    assertVersionGroupsOption({ config, groups: options.groups })

    const { sortedPackages, publishedPackages } = hasVersionGroups(config)
      ? await getGroupsPackagesToPublish({ config, options, dryRun, rootVersion: rootPackage.version })
      : await getPackagesToPublish({
          config,
          bumpResult: options.bumpResult,
          suffix: options.suffix,
          force: options.force ?? false,
          dryRun,
          rootVersion: rootPackage.version,
        })

    if (publishedPackages.length === 0) {
      logger.fail('No packages need to be published')
      return
    }

    // Only check the registries this specific set of packages actually needs -
    // scoped `registries` entries for packages outside this release must not block it.
    await publishSafetyCheck({ config, packages: publishedPackages })

    await checkWorkspaceDependencies({
      config,
      packages: sortedPackages.filter(pkg => publishedPackages.some(p => p.name === pkg.name)),
      plannedVersions: getPlannedVersions(options.bumpResult),
    })

    if (options.bumpResult) {
      reportStalePeerDependents({
        config,
        bumpedPackages: options.bumpResult.bumpedPackages,
        publishedPackages,
      })
    }

    await executeBuildCmd({
      config,
      dryRun,
    })

    for await (const pkg of sortedPackages) {
      if (publishedPackages.some(p => p.name === pkg.name)) {
        logger.debug(`Publishing ${getIndependentTag({ name: pkg.name, version: pkg.newVersion || pkg.version })}...`)
        await publishPackage({
          pkg,
          config,
          packageManager: config.publish.packageManager,
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
