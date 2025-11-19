import type { ResolvedRelizyConfig } from '../core'
import type { BumpResultTruthy, ChangelogConfig, ChangelogOptions, PackageBase } from '../types'
import { logger } from '@maz-ui/node'
import { executeFormatCmd, executeHook, generateChangelog, getPackages, getRootPackage, isBumpedPackage, loadRelizyConfig, readPackageJson, resolveTags, writeChangelogToFile } from '../core'

async function getPackagesToGenerateChangelogFor({
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

async function generateIndependentRootChangelog({
  packages,
  config,
  dryRun,
}: {
  packages: PackageBase[]
  config: ResolvedRelizyConfig
  dryRun: boolean
}) {
  if (!config.changelog?.rootChangelog) {
    logger.debug('Skipping root changelog generation')
    return
  }

  logger.debug('Generating aggregated root changelog for independent mode')

  const packageChangelogs: string[] = []

  for (const pkg of packages) {
    const changelog = await generateChangelog({
      pkg,
      config,
      dryRun,
      newVersion: (isBumpedPackage(pkg) && pkg.newVersion) || pkg.version,
    })

    if (changelog) {
      packageChangelogs.push(changelog)
    }
  }

  if (packageChangelogs.length === 0) {
    logger.debug('No changelogs to aggregate')
    return
  }

  const date = new Date().toISOString().split('T')[0]
  const aggregatedChangelog = `**Multiple Packages Updated** - ${date}\n\n${packageChangelogs.join('\n\n')}`

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

  logger.debug('Aggregated root changelog written')
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
}) {
  if (!config.changelog?.rootChangelog) {
    logger.debug('Skipping root changelog generation')
    return
  }

  logger.debug('Generating simple root changelog')

  const rootPackageRead = readPackageJson(config.cwd)

  if (!rootPackageRead) {
    throw new Error('Failed to read root package.json')
  }

  const { from, to } = await resolveTags<'changelog'>({
    config,
    step: 'changelog',
    newVersion: undefined,
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
  })

  logger.debug(`Generating ${rootPackage.name} changelog (${fromTag}...${to})`)

  const newVersion = bumpResult?.newVersion || rootPackage.version

  const rootChangelog = await generateChangelog({
    pkg: rootPackage,
    config,
    dryRun,
    newVersion,
  })

  if (rootChangelog) {
    writeChangelogToFile({
      cwd: config.cwd,
      changelog: rootChangelog,
      pkg: rootPackage,
      dryRun,
    })
    logger.debug('Root changelog written')
  }
  else {
    logger.debug('No changelog to generate for root package')
  }
}

// eslint-disable-next-line complexity
export async function changelog(options: Partial<ChangelogOptions> = {}): Promise<void> {
  const config = await loadRelizyConfig({
    configName: options.configName,
    baseConfig: options.config,
    overrides: {
      from: options.from,
      to: options.to,
      logLevel: options.logLevel,
      changelog: {
        rootChangelog: options.rootChangelog,
        formatCmd: options.formatCmd,
      } satisfies ChangelogConfig,
    },
  })

  const dryRun = options.dryRun ?? false
  logger.debug(`Dry run: ${dryRun}`)

  logger.info(`Version mode: ${config.monorepo?.versionMode || 'standalone'}`)

  try {
    await executeHook('before:changelog', config, dryRun)

    logger.start('Start generating changelogs')

    if (config.changelog?.rootChangelog && config.monorepo) {
      if (config.monorepo.versionMode === 'independent') {
        const packages = await getPackagesToGenerateChangelogFor({
          config,
          bumpResult: options.bumpResult,
          suffix: options.suffix,
          force: options.force ?? false,
        })

        await generateIndependentRootChangelog({
          packages,
          config,
          dryRun,
        })
      }
      else {
        await generateSimpleRootChangelog({
          config,
          dryRun,
          bumpResult: options.bumpResult,
          suffix: options.suffix,
          force: options.force ?? false,
        })
      }
    }
    else {
      logger.debug('Skipping root changelog generation')
    }

    logger.debug('Generating package changelogs...')

    const packages = options.bumpResult?.bumpedPackages
      ? options.bumpResult.bumpedPackages
      : await getPackages({
          config,
          patterns: config.monorepo?.packages,
          suffix: options.suffix,
          force: options.force ?? false,
        })

    logger.debug(`Processing ${packages.length} package(s)`)

    let generatedCount = 0

    for await (const pkg of packages) {
      const { from, to } = await resolveTags<'changelog'>({
        config,
        step: 'changelog',
        pkg,
        newVersion: undefined,
      })

      logger.debug(`Processing ${pkg.name} (${from}...${to})`)

      const changelog = await generateChangelog({
        pkg,
        config,
        dryRun,
        newVersion: options.bumpResult?.bumpedPackages?.find(p => p.name === pkg.name)?.newVersion,
      })

      if (changelog) {
        writeChangelogToFile({
          cwd: config.cwd,
          pkg,
          changelog,
          dryRun,
        })
        generatedCount++
        logger.debug(`${pkg.name}: changelog written`)
      }
    }

    logger.debug(`Generated ${generatedCount} package changelog(s)`)

    await executeFormatCmd({
      config,
      dryRun,
    })

    logger.success(`${dryRun ? '[dry run] ' : ''}Changelog generation completed!`)

    await executeHook('success:changelog', config, dryRun)
  }
  catch (error) {
    if (!options.config) {
      logger.error('Error generating changelogs!\n\n', error)
    }

    await executeHook('error:changelog', config, dryRun)

    throw error
  }
}
