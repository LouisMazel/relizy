import type { ResolvedRelizyConfig } from '../core'
import type { BumpResultTruthy, PackageBase, PublishOptions, PublishResponse, RegistryTarget } from '../types'
import { execPromise, logger } from '@maz-ui/node'
import { assertVersionGroupsOption, checkWorkspaceDependencies, createCommandUi, executeBuildCmd, getAuthCommand, getHookContext, getIndependentTag, getMonorepoPackagePatterns, getReleaseTargets, hasVersionGroups, isFancyUi, isRelizyCancelError, loadRelizyConfig, publishPackage, readPackageJson, readPackages, reportStalePeerDependents, resolveRegistryTargetsForPackages, sortPackagesForPublish, withRegistryNpmrc } from '../core'
import { prepareCiRepository } from '../core/ci'
import { withGitCache } from '../core/git-cache'
import { reportProgress } from '../core/progress'
import { getNpmLinks } from '../core/release-facts'
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

/**
 * The packages of the workspace that can be published, before the bump tells
 * which ones the release publishes
 */
function readPublishablePackages(config: ResolvedRelizyConfig): Pick<PackageBase, 'name'>[] {
  return filterOutPrivatePackages(readPackages({
    cwd: config.cwd,
    patterns: getMonorepoPackagePatterns(config),
    ignored: config.monorepo?.ignored,
  }))
}

export async function publishSafetyCheck({ config, packages }: { config: ResolvedRelizyConfig, packages?: PackageBase[] }) {
  if (!config.safetyCheck || !config.publish.safetyCheck) {
    logger.debug('Safety check of the publication disabled')
    return
  }

  // Before the bump, every package that can be published: a package that no
  // `registries` entry covers needs the .npmrc registry. A project whose
  // packages are all private (a private app) publishes nothing
  const packagesToCheck: Pick<PackageBase, 'name'>[] = packages ?? readPublishablePackages(config)
  if (packagesToCheck.length === 0) {
    logger.debug('No publishable package (all private), skipping the registry check')
    return
  }

  logger.debug('Start checking auth config to package registry')

  const isPnpmOrNpm = config.publish.packageManager === 'pnpm' || config.publish.packageManager === 'npm'

  if (!isPnpmOrNpm) {
    logger.debug(`Skipping authentication to package registry because "${config.publish.packageManager}" is not supported`)
    return
  }

  // Only the registries the packages need: a registry scoped to other
  // packages should not block the release
  const registryTargets = resolveRegistryTargetsForPackages(packagesToCheck, config)
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
}: {
  config: ResolvedRelizyConfig
  bumpResult: BumpResultTruthy | undefined
  suffix: string | undefined
  force: boolean
  dryRun: boolean
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

  return { sortedPackages, publishedPackages: packages }
}

/**
 * Packages to publish of every version group, sorted in a single publish order:
 * a package is published after its internal dependencies, whatever their group.
 */
async function getGroupsPackagesToPublish({
  config,
  options,
  dryRun,
}: {
  config: ResolvedRelizyConfig
  options: Partial<PublishOptions>
  dryRun: boolean
}): Promise<PackagesToPublish> {
  const publishedPackages: PackageBase[] = []

  for (const { group, config: groupConfig, bumpResult } of getReleaseTargets({ config, bumpResult: options.bumpResult, only: options.groups, nothing: 'nothing to publish' })) {
    const { publishedPackages: groupPackages } = await getPackagesToPublish({
      config: groupConfig,
      bumpResult,
      suffix: options.suffix,
      force: options.force ?? false,
      dryRun,
    })

    logger.info(`Version group "${group!.name}": ${groupPackages.length} package(s) to publish`)

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

export function publish(options: Partial<PublishOptions> = {}) {
  // One git cache for the run: the same refs and ranges are read for each package and each step
  return withGitCache(() => runPublish(options))
}

async function runPublish(options: Partial<PublishOptions> = {}) {
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
        skipExistingVersions: options.skipExistingVersions,
        checkWorkspaceDependencies: options.checkWorkspaceDependencies,
        args: options.args,
        packageManager: options.packageManager,
        safetyCheckTimeout: options.safetyCheckTimeout,
      },
      tokens: { registry: options.token },
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

  const hookContext = getHookContext(config, options.bumpResult)
  const ui = createCommandUi({ title: 'relizy publish', dryRun, logLevel: config.logLevel, cwd: config.cwd })

  try {
    // The CI clone: full history, branch, identity
    prepareCiRepository(config.cwd)

    await executeHook('before:publish', config, dryRun, hookContext)

    const { toPublish, publishedPackages } = await ui.step({
      running: 'Checking the packages to publish',
      done: ({ toPublish, publishedPackages }) => publishedPackages.length === 0 ? 'No package to publish' : `${describePackages(toPublish)} to publish`,
      run: () => getCheckedPackagesToPublish({ config, options, dryRun }),
    })

    if (publishedPackages.length === 0) {
      logger.fail('No packages need to be published')
      ui.complete({ message: 'No package to publish', nothing: true })
      return
    }

    if (config.publish.buildCmd) {
      await ui.step({
        running: 'Building the packages',
        done: () => 'Packages built',
        run: () => executeBuildCmd({ config, dryRun }),
      })
    }

    const distTag = config.publish.tag ? ` (${config.publish.tag})` : ''
    await ui.step({
      running: 'Publishing the packages',
      done: () => `Published ${describePackages(toPublish)}${distTag}`,
      run: async () => {
        for await (const [index, pkg] of toPublish.entries()) {
          const tag = getIndependentTag({ name: pkg.name, version: pkg.newVersion || pkg.version })
          const position = toPublish.length > 1 ? ` (${index + 1}/${toPublish.length})` : ''
          logger.debug(`Publishing ${tag}...`)
          reportProgress(`Publishing ${tag}${position}`)
          await publishPackage({
            pkg,
            config,
            packageManager: config.publish.packageManager,
            dryRun,
          })
        }
      },
    })

    if (!dryRun) {
      logger.info('Package(s) have been published to npm registry')
    }

    logger.success('Publishing packages completed!')

    await executeHook('success:publish', config, dryRun, hookContext)

    ui.complete({
      message: `${dryRun ? 'Simulated publication of' : 'Published'} ${describePackages(toPublish)}${distTag}`,
      links: getNpmLinks({ config, packages: toPublish }),
    })

    return {
      publishedPackages,
    } satisfies PublishResponse
  }
  catch (error) {
    // Refused or cancelled prompt: nothing was written, it is not a failure
    if (isRelizyCancelError(error)) {
      ui.fail(error)
      throw error
    }

    if (!options.config && !isFancyUi()) {
      logger.error('Error during publishing packages!\n\n', error)
    }

    await executeHook('error:publish', config, dryRun, hookContext)

    ui.fail(error, 'Publish')
    throw error
  }
}

/** The published versions: `relizy@2.0.0`, up to 3, else their count */
function describePackages(packages: PackageBase[]): string {
  return packages.length <= 3
    ? packages.map(pkg => `${pkg.name}@${pkg.newVersion || pkg.version}`).join(', ')
    : `${packages.length} packages`
}

/**
 * The packages to publish, in publish order, once the registries and the
 * workspace dependencies are checked
 */
async function getCheckedPackagesToPublish({ config, options, dryRun }: {
  config: ResolvedRelizyConfig
  options: Partial<PublishOptions>
  dryRun: boolean
}): Promise<{ toPublish: PackageBase[], publishedPackages: PackageBase[] }> {
  if (!readPackageJson(config.cwd)) {
    throw new Error('Failed to read root package.json')
  }

  logger.start('Start publishing packages')

  assertVersionGroupsOption({ config, groups: options.groups })

  const { sortedPackages, publishedPackages } = hasVersionGroups(config)
    ? await getGroupsPackagesToPublish({ config, options, dryRun })
    : await getPackagesToPublish({
        config,
        bumpResult: options.bumpResult,
        suffix: options.suffix,
        force: options.force ?? false,
        dryRun,
      })

  if (publishedPackages.length === 0) {
    return { toPublish: [], publishedPackages }
  }

  // Only check the registries this specific set of packages actually needs -
  // scoped `registries` entries for packages outside this release must not block it.
  await publishSafetyCheck({ config, packages: publishedPackages })

  const toPublish = sortedPackages.filter(pkg => publishedPackages.some(p => p.name === pkg.name))

  await checkWorkspaceDependencies({
    config,
    packages: toPublish,
    plannedVersions: getPlannedVersions(options.bumpResult),
  })

  if (options.bumpResult) {
    reportStalePeerDependents({
      config,
      bumpedPackages: options.bumpResult.bumpedPackages,
      publishedPackages,
    })
  }

  return { toPublish, publishedPackages }
}
