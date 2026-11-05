import type { ResolvedRelizyConfig } from '../core'
import type { BumpResultTruthy, ChangelogConfig, ChangelogOptions, PackageBase } from '../types'
import { logger } from '@maz-ui/node'
import { aggregateIndependentChangelogs, assertVersionGroupsOption, createCommandUi, executeFormatCmd, executeHook, generateChangelog, getGroupBumpResult, getHookContext, getPackagesOrBumpedPackages, getRootPackage, hasVersionGroups, isBumpedPackage, isFancyUi, isRelizyCancelError, loadRelizyConfig, readPackageJson, resolveTags, resolveVersionGroups, writeChangelogToFile } from '../core'
import { prepareCiRepository } from '../core/ci'
import { withGitCache } from '../core/git-cache'
import { reportProgress, showPreview } from '../core/progress'

async function generateIndependentRootChangelog({
  packages,
  config,
  dryRun,
}: {
  packages: PackageBase[]
  config: ResolvedRelizyConfig
  dryRun: boolean
}): Promise<boolean> {
  if (!config.changelog?.rootChangelog) {
    logger.debug('Skipping root changelog generation')
    return false
  }

  logger.debug('Generating aggregated root changelog for independent mode')

  const packageChangelogs: string[] = []

  for (const pkg of packages) {
    const newVersion = (isBumpedPackage(pkg) && pkg.newVersion) || pkg.version

    packageChangelogs.push(await generateChangelog({
      pkg,
      config,
      dryRun,
      newVersion,
    }))
  }

  const aggregatedChangelog = aggregateIndependentChangelogs(packageChangelogs)

  if (!aggregatedChangelog) {
    logger.debug('No changelogs to aggregate')
    return false
  }

  logger.verbose(`Aggregated root changelog: ${aggregatedChangelog}`)

  const rootPackageRead = readPackageJson(config.cwd)

  if (!rootPackageRead) {
    throw new Error('Failed to read root package.json')
  }

  writeChangelogToFile({
    cwd: config.cwd,
    pkg: rootPackageRead,
    changelog: aggregatedChangelog,
    dryRun,
  })

  if (dryRun) {
    showPreview({ title: `Root changelog of ${rootPackageRead.name}`, content: aggregatedChangelog })
  }
  else {
    logger.debug('Aggregated root changelog written')
  }

  return true
}

async function generateSimpleRootChangelog({
  config,
  dryRun,
  force,
  suffix,
  bumpResult,
}: {
  config: ResolvedRelizyConfig
  dryRun: boolean
  force: boolean
  suffix: string | undefined
  bumpResult: BumpResultTruthy | undefined
}): Promise<boolean> {
  if (!config.changelog?.rootChangelog) {
    logger.debug('Skipping root changelog generation')
    return false
  }

  logger.debug('Generating simple root changelog')

  const rootPackageRead = readPackageJson(config.cwd)

  if (!rootPackageRead) {
    throw new Error('Failed to read root package.json')
  }

  const newVersion = bumpResult?.newVersion || rootPackageRead.version

  const { from, to } = await resolveTags<'changelog'>({
    config,
    step: 'changelog',
    newVersion,
    pkg: rootPackageRead,
  })

  const fromTag = bumpResult?.fromTag || from

  const rootPackage = bumpResult?.rootPackage || await getRootPackage({
    config,
    force,
    suffix,
    changelog: true,
    from: fromTag,
    to,
    dryRun,
  })

  logger.debug(`Generating ${rootPackage.name} changelog (${fromTag}...${to})`)

  const rootChangelog = await generateChangelog({
    pkg: rootPackage,
    config,
    dryRun,
    newVersion,
  })

  writeChangelogToFile({
    cwd: config.cwd,
    changelog: rootChangelog,
    pkg: rootPackage,
    dryRun,
  })

  if (dryRun) {
    showPreview({ title: `Root changelog of ${rootPackage.name}`, meta: [`${fromTag}...${to}`], content: rootChangelog })
  }
  else {
    logger.debug('Root changelog written')
  }

  return true
}

/**
 * Generate the root and package changelogs of the packages of the config.
 * Returns the number of changelogs written, the root one included.
 */
async function generateChangelogs({
  config,
  bumpResult,
  dryRun,
  force,
  suffix,
}: {
  config: ResolvedRelizyConfig
  bumpResult: BumpResultTruthy | undefined
  dryRun: boolean
  force: boolean
  suffix: string | undefined
}): Promise<number> {
  const packages = await getPackagesOrBumpedPackages({
    config,
    bumpResult,
    suffix,
    force,
    dryRun,
  })

  let rootWritten = false

  if (config.changelog?.rootChangelog && config.monorepo?.versionMode) {
    rootWritten = config.monorepo.versionMode === 'independent'
      ? await generateIndependentRootChangelog({
          packages,
          config,
          dryRun,
        })
      : await generateSimpleRootChangelog({
          config,
          dryRun,
          bumpResult,
          suffix,
          force,
        })
  }
  else {
    logger.debug('Skipping root changelog generation')
  }

  logger.debug('Generating package changelogs...')

  logger.debug(`Processing ${packages.length} package(s)`)

  let generatedCount = rootWritten ? 1 : 0

  for await (const pkg of packages) {
    const newVersion = bumpResult?.bumpedPackages?.find(p => p.name === pkg.name)?.newVersion || pkg.newVersion || pkg.version

    logger.debug(`Processing ${pkg.name}`)

    const changelog = await generateChangelog({
      pkg,
      config,
      dryRun,
      newVersion,
    })

    writeChangelogToFile({
      cwd: config.cwd,
      pkg,
      changelog,
      dryRun,
    })
    generatedCount++

    if (dryRun) {
      showPreview({ title: `Changelog of ${pkg.name}`, content: changelog })
    }
    else {
      logger.debug(`${pkg.name}: changelog written`)
    }
  }

  return generatedCount
}

export function changelog(options: Partial<ChangelogOptions> = {}): Promise<void> {
  // One git cache for the run: the same refs and ranges are read for each package and each step
  return withGitCache(() => runChangelog(options))
}

async function runChangelog(options: Partial<ChangelogOptions> = {}): Promise<void> {
  const config = await loadRelizyConfig({
    configFile: options.configName,
    baseConfig: options.config,
    overrides: {
      from: options.from,
      to: options.to,
      logLevel: options.logLevel,
      monorepo: options.privatePackages !== undefined
        ? { privatePackages: options.privatePackages }
        : undefined,
      changelog: {
        rootChangelog: options.rootChangelog,
        formatCmd: options.formatCmd,
      } satisfies ChangelogConfig,
    },
  })

  const dryRun = options.dryRun ?? false
  logger.debug(`Dry run: ${dryRun}`)

  logger.debug(`Version mode: ${config.monorepo?.versionMode || 'standalone'}`)

  const hookContext = getHookContext(config, options.bumpResult)
  const ui = createCommandUi({ title: 'relizy changelog', dryRun, logLevel: config.logLevel, cwd: config.cwd })

  try {
    // The CI clone: full history, branch, identity
    prepareCiRepository(config.cwd)

    await executeHook('before:changelog', config, dryRun, hookContext)

    const generatedCount = await ui.step({
      running: 'Writing the changelogs',
      done: count => count === 0 ? 'No changelog to write' : `${count} ${count === 1 ? 'changelog' : 'changelogs'} written`,
      run: () => writeChangelogs({ config, options, dryRun }),
    })

    logger.success(`${dryRun ? '[dry run] ' : ''}Changelog generation completed!`)

    await executeHook('success:changelog', config, dryRun, hookContext)

    ui.complete(generatedCount === 0
      ? { message: 'No changelog to write', nothing: true }
      : { message: `${dryRun ? 'Previewed' : 'Wrote'} ${generatedCount} ${generatedCount === 1 ? 'changelog' : 'changelogs'}` })
  }
  catch (error) {
    // Refused or cancelled prompt: nothing was written, it is not a failure
    if (isRelizyCancelError(error)) {
      ui.fail(error)
      throw error
    }

    if (!options.config && !isFancyUi()) {
      logger.error('Error generating changelogs!\n\n', error)
    }

    await executeHook('error:changelog', config, dryRun, hookContext)

    ui.fail(error, 'Changelog')
    throw error
  }
}

/**
 * The changelogs of the release, by version group, then formatted: the number
 * of changelogs written
 */
async function writeChangelogs({ config, options, dryRun }: {
  config: ResolvedRelizyConfig
  options: Partial<ChangelogOptions>
  dryRun: boolean
}): Promise<number> {
  logger.start('Start generating changelogs')

  assertVersionGroupsOption({ config, groups: options.groups })

  let generatedCount = 0

  if (hasVersionGroups(config)) {
    for (const { group, config: groupConfig } of resolveVersionGroups({ config, only: options.groups })) {
      const groupBumpResult = getGroupBumpResult(options.bumpResult, group.name)

      if (groupBumpResult === null) {
        logger.debug(`Version group "${group.name}" did not bump, no changelog to generate`)
        continue
      }

      logger.debug(`Generating changelogs of version group "${group.name}"`)

      generatedCount += await generateChangelogs({
        config: groupConfig,
        bumpResult: groupBumpResult,
        dryRun,
        force: options.force ?? false,
        suffix: options.suffix,
      })
    }
  }
  else {
    generatedCount = await generateChangelogs({
      config,
      bumpResult: options.bumpResult,
      dryRun,
      force: options.force ?? false,
      suffix: options.suffix,
    })
  }

  logger.debug(`Generated ${generatedCount} changelog(s)`)

  if (config.changelog.formatCmd) {
    reportProgress('Formatting the changelogs')
  }

  await executeFormatCmd({
    config,
    dryRun,
  })

  return generatedCount
}
