import type { TrustedPublishingProvider } from '@relizy/core'
import type { ResolvedRelizyConfig } from '../core'
import type { BumpResultTruthy, PackageBase, PublishOptions, PublishResponse, RegistryTarget } from '../types'
import { execPromise, logger } from '@maz-ui/node'
import { getErrorMessage } from '@maz-ui/utils/helpers/getErrorMessage'
import { assertPublishNpmVersion, assertTrustedPublishingNpm, filterOutPrivatePackages, getIndependentTag, getPublishRoute, getTrustedPublishing, isInCI, isNpmjsRegistry, sortPackagesForPublish, withGitCache } from '@relizy/core'
import { assertVersionGroupsOption, checkWorkspaceDependencies, executeBuildCmd, getAuthCommand, getMonorepoPackagePatterns, getNpmRegistry, getReleaseTargets, hasVersionGroups, loadRelizyConfig, publishPackage, readPackageJson, readPackages, reportStalePeerDependents, resolveRegistryTargetsForPackages, withRegistryNpmrc } from '../core'
import { runWithEvents } from '../core/events'
import { reportProgress } from '../core/progress'
import { getTargetPublishAuth, reportPublishAuth, runTrustedPublishingPreflight } from '../core/publish-checks'
import { getNpmLinks } from '../core/release-facts'
import { clearPublishedPackages, emitStepItem, recordPublishedPackage, takePublishStepData } from '../core/step-data'
import { executeHook, getPackagesOrBumpedPackages } from '../core/utils'
import { runCommand } from './run-command'

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
    throw new Error(`Failed to authenticate to package registry${registryLabel}${getMissingTokenHint(config, registryTarget)}`, { cause: error })
  }
  finally {
    clearTimeout(patienceTimer)
  }
}

/**
 * Without token in a CI job, the way to publish to npm: trusted publishing
 * first (the job then lacks its OIDC permission), a token second
 */
function getMissingTokenHint(config: ResolvedRelizyConfig, registryTarget: RegistryTarget): string {
  if (registryTarget.token || !isInCI() || !isNpmjsRegistry(registryTarget.registry || getNpmRegistry(config.cwd))) {
    return ''
  }

  return ': no npm token found. Publish with trusted publishing (OIDC), without token: give the job the "id-token: write" permission and run "relizy trust" (https://relizy.dev/guide/trusted-publishing), or set NPM_TOKEN'
}

/**
 * Trusted publishing needs no token, so no `whoami`: the npm of the job must
 * do the OIDC exchange. Whether npm trusts the job for each package (and
 * whether the package exists: OIDC cannot create it) is the pre-flight, on the
 * packages the run publishes only.
 */
function checkTrustedPublishing({
  config,
  registryLabel,
  provider,
}: {
  config: ResolvedRelizyConfig
  registryLabel: string
  provider: TrustedPublishingProvider
}) {
  logger.info(`Trusted publishing (OIDC) from ${provider}${registryLabel}: no npm token needed`)
  assertTrustedPublishingNpm({ packageManager: config.publish.packageManager, cwd: config.cwd, provider })
}

/**
 * The npm that uploads the packed tarball of bun and yarn classic, which
 * cannot do the trusted publishing exchange themselves
 */
function checkUploadNpm({ config, packages }: { config: ResolvedRelizyConfig, packages: Pick<PackageBase, 'name'>[] }) {
  for (const registryTarget of resolveRegistryTargetsForPackages(packages, config)) {
    const auth = getTargetPublishAuth(config, registryTarget)
    const route = getPublishRoute({
      packageManager: config.publish.packageManager,
      cwd: config.cwd,
      staged: false,
      authMode: auth.mode,
    })
    if (route === 'pack-and-upload') {
      assertPublishNpmVersion({
        packageManager: config.publish.packageManager,
        cwd: config.cwd,
        staged: false,
        route,
      })
    }
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

  // Every package manager: the auth notes, the npm of the routes, the pre-flight
  reportPublishAuth({ config, packages: packagesToCheck })
  checkUploadNpm({ config, packages: packagesToCheck })

  const isPnpmOrNpm = config.publish.packageManager === 'pnpm' || config.publish.packageManager === 'npm'

  if (!isPnpmOrNpm) {
    logger.debug(`Skipping authentication to package registry because "${config.publish.packageManager}" is not supported`)
    if (packages) {
      await runTrustedPublishingPreflight({ config, packages })
    }
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

    const registry = registryTarget.registry || getNpmRegistry(config.cwd)
    const provider = getTrustedPublishing({ registry, token: registryTarget.token })

    if (provider) {
      checkTrustedPublishing({
        config,
        registryLabel,
        provider,
      })
      continue
    }

    await checkRegistryAuth({ config, registryTarget, registryLabel })
  }

  // The packages the run publishes are known (relizy publish): `release`
  // runs the pre-flight itself, once the bump told them
  if (packages) {
    await runTrustedPublishingPreflight({ config, packages })
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
  const sortedPackages = sortPackagesForPublish(packages, logger)

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

  for (const { group, config: groupConfig, bumpResult } of getReleaseTargets({
    config,
    bumpResult: options.bumpResult,
    only: options.groups,
    nothing: 'nothing to publish',
  })) {
    const { publishedPackages: groupPackages } = await getPackagesToPublish({
      config: groupConfig,
      bumpResult,
      suffix: options.suffix ?? groupConfig.bump.suffix,
      force: options.force ?? false,
      dryRun,
    })

    logger.info(`Version group "${group!.name}": ${groupPackages.length} package(s) to publish`)

    publishedPackages.push(...groupPackages)
  }

  return {
    sortedPackages: sortPackagesForPublish(publishedPackages, logger),
    publishedPackages,
  }
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
  return runWithEvents(options.onProgress, () => withGitCache(() => runPublish(options)), { onOtp: options.onOtp })
}

function runPublish(options: Partial<PublishOptions> = {}): Promise<PublishResponse | undefined> {
  return runCommand({
    name: 'publish',
    label: 'Publish',
    errorMessage: 'Error during publishing packages!',
    hook: 'publish',
    options,
    loadConfig: () => loadRelizyConfig({
      configFile: options.configName,
      profile: options.profile,
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
    }),
    run: async ({ config, dryRun, ui, hookContext }) => {
      logger.debug(`Package manager: ${config.publish.packageManager}`)
      logger.debug(`Version mode: ${config.monorepo?.versionMode || 'standalone'}`)

      if (config.publish.registry) {
        logger.debug(`Registry: ${config.publish.registry}`)
      }
      if (config.publish.tag) {
        logger.debug(`Tag: ${config.publish.tag}`)
      }

      await executeHook('before:publish', config, dryRun, hookContext)

      const { toPublish, publishedPackages } = await ui.step({
        name: 'publish',
        running: 'Checking the packages to publish',
        done: ({ toPublish, publishedPackages }) => publishedPackages.length === 0
          ? 'No package to publish'
          : `${describePackages(toPublish)} to publish`,
        run: () => getCheckedPackagesToPublish({ config, options, dryRun }),
      })

      if (publishedPackages.length === 0) {
        logger.fail('No packages need to be published')
        ui.complete({ message: 'No package to publish', nothing: true })
        return
      }

      if (config.publish.buildCmd) {
        await ui.step({
          name: 'publish',
          running: 'Building the packages',
          done: () => 'Packages built',
          run: () => executeBuildCmd({ config, dryRun }),
        })
      }

      const distTag = config.publish.tag
        ? ` (${config.publish.tag})`
        : ''
      await ui.step({
        name: 'publish',
        running: 'Publishing the packages',
        done: () => `Published ${describePackages(toPublish)}${distTag}`,
        data: () => takePublishStepData(config, { dryRun }),
        failedData: () => takePublishStepData(config, { dryRun }),
        run: async () => {
          clearPublishedPackages()

          for await (const [index, pkg] of toPublish.entries()) {
            const tag = getIndependentTag({ name: pkg.name, version: pkg.newVersion || pkg.version })
            const position = toPublish.length > 1
              ? ` (${index + 1}/${toPublish.length})`
              : ''
            logger.debug(`Publishing ${tag}...`)
            reportProgress(`Publishing ${tag}${position}`)
            await publishAndRecord({ pkg, config, dryRun })
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
    },
  })
}

/**
 * Publish a package, followed live (`step:item`) and recorded for the data of the step
 */
async function publishAndRecord({ pkg, config, dryRun }: { pkg: PackageBase, config: ResolvedRelizyConfig, dryRun: boolean }): Promise<void> {
  const version = pkg.newVersion || pkg.version
  const name = getIndependentTag({ name: pkg.name, version })
  emitStepItem('publish', { name, status: 'running' })

  try {
    const statuses = await publishPackage({
      pkg,
      config,
      packageManager: config.publish.packageManager,
      dryRun,
    })
    // Already on every registry
    const skipped = statuses.length > 0 && statuses.every(status => status === 'skipped')
    const url = dryRun || skipped
      ? undefined
      : getNpmLinks({
        config,
        packages: [pkg],
      })[0]?.url
    const reason = 'version already on the registry'

    recordPublishedPackage({
      name: pkg.name,
      version,
      status: skipped ? 'skipped' : 'published',
      ...(url
        ? { url }
        : {}),
      ...(skipped
        ? { reason }
        : {}),
    })
    emitStepItem('publish', {
      name,
      status: skipped ? 'skipped' : 'done',
      ...(url
        ? { url }
        : {}),
      ...(skipped
        ? { detail: reason }
        : {}),
    })
  }
  catch (error) {
    const reason = getErrorMessage(error)
    recordPublishedPackage({
      name: pkg.name,
      version,
      status: 'failed',
      reason,
    })
    emitStepItem('publish', { name, status: 'failed', detail: reason })
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
        suffix: options.suffix ?? config.bump.suffix,
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
    await reportStalePeerDependents({
      config,
      bumpedPackages: options.bumpResult.bumpedPackages,
      publishedPackages,
    })
  }

  return { toPublish, publishedPackages }
}
