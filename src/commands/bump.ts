import type { ResolvedRelizyConfig } from '../core'
import type { BumpOptions, BumpResult } from '../types'
import { exit } from 'node:process'

import { logger } from '@maz-ui/node'
import { checkGitStatusIfDirty, confirmBump, fetchGitTags, getBumpedIndependentPackages, getPackages, getRootPackage, loadRelizyConfig, readPackageJson, readPackages, resolveTags, updateLernaVersion, writeVersion } from '../core'
import { executeHook } from '../core/utils'

interface BumpStrategyInput {
  config: ResolvedRelizyConfig
  dryRun: boolean
  force: boolean
  suffix: string | undefined
}

async function bumpUnifiedMode({
  config,
  dryRun,
  force,
  suffix,
}: BumpStrategyInput): Promise<BumpResult> {
  logger.debug('Starting bump in unified mode')

  const rootPackageBase = readPackageJson(config.cwd)

  if (!rootPackageBase) {
    throw new Error('Failed to read root package.json')
  }

  const { from, to } = await resolveTags<'bump'>({
    config,
    step: 'bump',
    newVersion: undefined,
    pkg: rootPackageBase,
  })

  const rootPackage = await getRootPackage({
    config,
    force,
    from,
    to,
    suffix,
    changelog: false,
  })

  const currentVersion = rootPackage.version
  const newVersion = rootPackage.newVersion

  if (!newVersion) {
    throw new Error(`Could not determine a new version`)
  }

  logger.debug(`Bump from ${from} to ${to}`)

  logger.debug(`${currentVersion} → ${newVersion} (${config.monorepo?.versionMode || 'standalone'} mode)`)

  const packages = await getPackages({
    config,
    patterns: config.monorepo?.packages,
    suffix,
    force,
  })

  if (packages.length === 0) {
    logger.debug('No packages to bump')
    return { bumped: false }
  }

  if (!config.bump.yes) {
    await confirmBump({
      versionMode: 'unified',
      packages,
      config,
      force,
      currentVersion,
      newVersion,
      dryRun,
    })
  }
  else {
    logger.info(`${packages.length === 1 ? packages[0].name : packages.length} package(s) bumped from ${currentVersion} to ${newVersion} (${config.monorepo?.versionMode || 'standalone'} mode)`)
  }

  for (const pkg of [rootPackage, ...packages]) {
    writeVersion(pkg.path, newVersion, dryRun)
  }

  updateLernaVersion({
    rootDir: config.cwd,
    versionMode: config.monorepo?.versionMode,
    version: newVersion,
    dryRun,
  })

  if (!dryRun) {
    logger.info(`All ${packages.length} package(s) bumped to ${newVersion}`)
  }

  return {
    bumped: true,
    oldVersion: currentVersion,
    fromTag: from,
    newVersion,
    rootPackage,
    bumpedPackages: packages.map(pkg => ({
      ...pkg,
      oldVersion: pkg.version,
      newVersion,
      fromTag: from,
      reason: 'commits',
    })),
  }
}

async function bumpSelectiveMode({
  config,
  dryRun,
  force,
  suffix,
}: BumpStrategyInput): Promise<BumpResult> {
  logger.debug('Starting bump in selective mode')

  const rootPackageBase = readPackageJson(config.cwd)

  if (!rootPackageBase) {
    throw new Error('Failed to read root package.json')
  }

  const { from, to } = await resolveTags<'bump'>({
    config,
    step: 'bump',
    pkg: rootPackageBase,
    newVersion: undefined,
  })

  const rootPackage = await getRootPackage({
    config,
    force,
    from,
    to,
    suffix,
    changelog: false,
  })

  const currentVersion = rootPackage.version
  const newVersion = rootPackage.newVersion

  if (!newVersion) {
    throw new Error('Could not determine a new version')
  }

  logger.debug(`Bump from ${currentVersion} to ${newVersion}`)

  logger.debug('Determining packages to bump...')
  const packages = await getPackages({
    config,
    patterns: config.monorepo?.packages,
    suffix,
    force,
  })

  if (packages.length === 0) {
    logger.debug('No packages to bump')
    return { bumped: false }
  }

  if (!config.bump.yes) {
    await confirmBump({
      versionMode: 'selective',
      config,
      packages,
      force,
      currentVersion,
      newVersion,
      dryRun,
    })
  }
  else {
    if (force) {
      logger.info(`${packages.length} package(s) bumped to ${newVersion} (force)`)
    }
    else {
      const bumpedByCommits = packages.filter(p => 'reason' in p && p.reason === 'commits').length
      const bumpedByDependency = packages.filter(p => 'reason' in p && p.reason === 'dependency').length
      const bumpedByGraduation = packages.filter(p => 'reason' in p && p.reason === 'graduation').length

      logger.info(
        `${currentVersion} → ${newVersion} (selective mode: ${bumpedByCommits} with commits, ${bumpedByDependency} as dependents, ${bumpedByGraduation} from graduation)`,
      )
    }
  }

  logger.debug(`Writing version to ${packages.length} package(s)`)

  for (const pkg of [rootPackage, ...packages]) {
    writeVersion(pkg.path, newVersion, dryRun)
  }

  updateLernaVersion({
    rootDir: config.cwd,
    versionMode: config.monorepo?.versionMode,
    version: newVersion,
    dryRun,
  })

  if (!dryRun) {
    logger.info(
      `${packages.length} package(s) bumped to ${newVersion}`,
    )
  }

  return {
    bumped: true,
    oldVersion: currentVersion,
    rootPackage,
    fromTag: from,
    newVersion,
    bumpedPackages: packages.map(pkg => ({
      ...pkg,
      oldVersion: pkg.version,
      fromTag: from,
      newVersion,
    })),
  }
}

async function bumpIndependentMode({
  config,
  dryRun,
  suffix,
  force,
}: BumpStrategyInput): Promise<BumpResult> {
  logger.debug('Starting bump in independent mode')

  const packagesToBump = await getPackages({
    config,
    patterns: config.monorepo?.packages,
    suffix,
    force,
  })

  if (packagesToBump.length === 0) {
    logger.debug('No packages to bump')
    return { bumped: false }
  }

  if (!config.bump.yes) {
    await confirmBump({
      versionMode: 'independent',
      config,
      packages: packagesToBump,
      force,
      dryRun,
    })
  }
  else {
    const bumpedByCommits = packagesToBump.filter(p => p.reason === 'commits').length
    const bumpedByDependency = packagesToBump.filter(p => p.reason === 'dependency').length
    const bumpedByGraduation = packagesToBump.filter(p => p.reason === 'graduation').length

    logger.info(
      `${bumpedByCommits + bumpedByDependency + bumpedByGraduation} package(s) will be bumped independently (${bumpedByCommits} from commits, ${bumpedByDependency} from dependencies, ${bumpedByGraduation} from graduation)`,
    )
  }

  const bumpedPackages = getBumpedIndependentPackages({
    packages: packagesToBump,
    dryRun,
  })

  const bumpedByCommits = bumpedPackages.filter(p =>
    packagesToBump.find(pkg => pkg.name === p.name)?.reason === 'commits',
  ).length
  const bumpedByDependency = bumpedPackages.length - bumpedByCommits

  if (bumpedPackages.length === 0) {
    logger.debug('No packages were bumped')
  }
  else {
    logger.info(
      `${dryRun ? '[dry-run] ' : ''}${bumpedPackages.length} package(s) bumped independently (${bumpedByCommits} from commits, ${bumpedByDependency} from dependencies)`,
    )
  }

  return {
    bumped: bumpedPackages.length > 0,
    bumpedPackages: bumpedPackages.map(pkg => ({
      ...pkg,
      oldVersion: pkg.version,
    })),
  }
}

// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
export async function bump(options: Partial<BumpOptions> = {}): Promise<BumpResult> {
  const config = await loadRelizyConfig({
    configName: options.configName,
    baseConfig: options.config,
    overrides: {
      bump: {
        yes: options.yes,
        type: options.type,
        clean: options.clean,
        preid: options.preid,
      },
      logLevel: options.logLevel,
    },
  })

  const dryRun = options.dryRun ?? false
  logger.debug(`Dry run: ${dryRun}`)

  const force = options.force ?? false
  logger.debug(`Bump forced: ${force}`)

  try {
    await executeHook('before:bump', config, dryRun)

    logger.start('Start bumping versions')

    if (config.bump.clean && config.release.clean) {
      checkGitStatusIfDirty()
    }

    await fetchGitTags(config.cwd)

    logger.info(`Version mode: ${config.monorepo?.versionMode || 'standalone'}`)

    const packages = readPackages({
      cwd: config.cwd,
      patterns: config.monorepo?.packages,
      ignorePackageNames: config.monorepo?.ignorePackageNames,
    })

    logger.debug(`Found ${packages.length} package(s)`)

    let result: BumpResult

    const payload = {
      config,
      dryRun,
      force,
      suffix: options.suffix,
    }

    if (config.monorepo?.versionMode === 'unified' || !config.monorepo) {
      result = await bumpUnifiedMode(payload)
    }
    else if (config.monorepo?.versionMode === 'selective') {
      result = await bumpSelectiveMode(payload)
    }
    else {
      result = await bumpIndependentMode(payload)
    }

    if (result.bumped) {
      const resultLog = result.bumpedPackages.length === 1 ? result.bumpedPackages[0].name : result.bumpedPackages.length
      logger.success(`${dryRun ? '[dry-run] ' : ''}Version bump completed (${resultLog} package${resultLog === 1 || typeof resultLog === 'string' ? '' : 's'} bumped)`)
    }
    else {
      logger.fail('No packages to bump, no relevant commits found')
      exit(1)
    }

    await executeHook('success:bump', config, dryRun)

    return result
  }
  catch (error) {
    if (!options.config) {
      logger.error('Error while bumping version(s)!\n\n', error)
    }

    await executeHook('error:bump', config, dryRun)

    throw error
  }
}
