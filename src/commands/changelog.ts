import type { ResolvedRelizyConfig } from '../core'
import type { BumpResultTruthy, ChangelogConfig, ChangelogOptions, PackageBase } from '../types'
import { logger } from '@maz-ui/node'
import { aggregateIndependentChangelogs, assertVersionGroupsOption, executeFormatCmd, executeHook, generateChangelog, getPackagesOrBumpedPackages, getReleaseTargets, getRootPackage, loadRelizyConfig, readPackageJson, resolveTags, writeChangelogToFile } from '../core'
import { plural } from '../core/format'
import { withGitCache } from '../core/git-cache'
import { showPreview } from '../core/progress'
import { runCommand } from './run-command'

async function generateIndependentRootChangelog({
  packages,
  config,
  dryRun,
  getPackageChangelog,
}: {
  packages: PackageBase[]
  config: ResolvedRelizyConfig
  dryRun: boolean
  /** The changelog of a package, generated once for its file and the root one */
  getPackageChangelog: (pkg: PackageBase) => Promise<string>
}): Promise<string | undefined> {
  if (!config.changelog?.rootChangelog) {
    logger.debug('Skipping root changelog generation')
    return undefined
  }

  logger.debug('Generating aggregated root changelog for independent mode')

  const packageChangelogs: string[] = []

  for (const pkg of packages) {
    packageChangelogs.push(await getPackageChangelog(pkg))
  }

  const aggregatedChangelog = aggregateIndependentChangelogs(packageChangelogs)

  if (!aggregatedChangelog) {
    logger.debug('No changelogs to aggregate')
    return undefined
  }

  logger.verbose(`Aggregated root changelog: ${aggregatedChangelog}`)

  const rootPackageRead = readPackageJson(config.cwd)

  if (!rootPackageRead) {
    throw new Error('Failed to read root package.json')
  }

  const changelogPath = writeChangelogToFile({
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

  return changelogPath
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
}): Promise<string | undefined> {
  if (!config.changelog?.rootChangelog) {
    logger.debug('Skipping root changelog generation')
    return undefined
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

  const changelogPath = writeChangelogToFile({
    cwd: config.cwd,
    changelog: rootChangelog,
    pkg: rootPackage,
    dryRun,
  })

  if (dryRun) {
    showPreview({
      title: `Root changelog of ${rootPackage.name}`,
      meta: [`${fromTag}...${to}`],
      content: rootChangelog,
    })
  }
  else {
    logger.debug('Root changelog written')
  }

  return changelogPath
}

/**
 * Generate the root and package changelogs of the packages of the config.
 * Returns the paths of the changelogs written, the root one included.
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
}): Promise<string[]> {
  const packages = await getPackagesOrBumpedPackages({
    config,
    bumpResult,
    suffix,
    force,
    dryRun,
  })

  // Generated once per package: the generate:changelog hook (an AI rewrite) runs once
  const changelogs = new Map<string, Promise<string>>()
  const getPackageChangelog = (pkg: PackageBase): Promise<string> => {
    if (!changelogs.has(pkg.name)) {
      const newVersion = bumpResult?.bumpedPackages?.find(p => p.name === pkg.name)?.newVersion || pkg.newVersion || pkg.version
      changelogs.set(pkg.name, generateChangelog({ pkg, config, dryRun, newVersion }))
    }

    return changelogs.get(pkg.name)!
  }

  let rootChangelogPath: string | undefined

  if (config.changelog?.rootChangelog && config.monorepo?.versionMode) {
    rootChangelogPath = config.monorepo.versionMode === 'independent'
      ? await generateIndependentRootChangelog({
          packages,
          config,
          dryRun,
          getPackageChangelog,
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

  const written = rootChangelogPath
    ? [rootChangelogPath]
    : []

  for await (const pkg of packages) {
    logger.debug(`Processing ${pkg.name}`)

    const changelog = await getPackageChangelog(pkg)

    written.push(writeChangelogToFile({
      cwd: config.cwd,
      pkg,
      changelog,
      dryRun,
    }))

    if (dryRun) {
      showPreview({ title: `Changelog of ${pkg.name}`, content: changelog })
    }
    else {
      logger.debug(`${pkg.name}: changelog written`)
    }
  }

  return written
}

export function changelog(options: Partial<ChangelogOptions> = {}): Promise<void> {
  // One git cache for the run: the same refs and ranges are read for each package and each step
  return withGitCache(() => runChangelog(options))
}

function runChangelog(options: Partial<ChangelogOptions> = {}): Promise<void> {
  return runCommand({
    name: 'changelog',
    label: 'Changelog',
    errorMessage: 'Error generating changelogs!',
    hook: 'changelog',
    options,
    loadConfig: () => loadRelizyConfig({
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
          includeCommitBody: options.includeCommitBody,
        } satisfies ChangelogConfig,
      },
    }),
    run: async ({ config, dryRun, ui, hookContext }) => {
      logger.debug(`Version mode: ${config.monorepo?.versionMode || 'standalone'}`)

      await executeHook('before:changelog', config, dryRun, hookContext)

      const generatedCount = await ui.step({
        running: 'Writing the changelogs',
        done: count => count === 0
          ? 'No changelog to write'
          : `${plural(count, 'changelog')} written`,
        run: () => writeChangelogs({ config, options, dryRun }),
      })

      logger.success(`${dryRun ? '[dry run] ' : ''}Changelog generation completed!`)

      await executeHook('success:changelog', config, dryRun, hookContext)

      ui.complete(generatedCount === 0
        ? { message: 'No changelog to write', nothing: true }
        : { message: `${dryRun ? 'Previewed' : 'Wrote'} ${plural(generatedCount, 'changelog')}` })
    },
  })
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

  const written: string[] = []

  for (const target of getReleaseTargets({
    config,
    bumpResult: options.bumpResult,
    only: options.groups,
    nothing: 'no changelog to generate',
  })) {
    if (target.group) {
      logger.debug(`Generating changelogs of version group "${target.group.name}"`)
    }

    written.push(...await generateChangelogs({
      config: target.config,
      bumpResult: target.bumpResult,
      dryRun,
      force: options.force ?? false,
      suffix: options.suffix,
    }))
  }

  logger.debug(`Generated ${written.length} changelog(s)`)

  // The root changelog is written by each version group
  await executeFormatCmd({
    config,
    dryRun,
    files: [
      ...new Set(written),
    ],
  })

  return written.length
}
