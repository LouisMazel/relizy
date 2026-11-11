import type { BumpResultTruthy, PackageBase, VersionMode } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '@maz-ui/node'
import { formatJson } from '@maz-ui/utils/helpers/formatJson'
import { writeVersion as coreWriteVersion, hasLernaJson, isPrerelease, isPrereleaseReleaseType } from '@relizy/core'
import { recordReleaseFile } from './release-files'
import { readPackageJson } from './repo'

/**
 * Write a version to the `package.json` of a package, recording the file as
 * written by the release (see `recordReleaseFile`)
 */
export function writeVersion(pkgPath: string, newVersion: string, dryRun = false): void {
  coreWriteVersion(pkgPath, newVersion, { dryRun, beforeWrite: recordReleaseFile, logger })
}

export function updateLernaVersion({
  rootDir,
  versionMode,
  version,
  dryRun = false,
}: {
  rootDir: string
  versionMode?: VersionMode
  version: string
  dryRun?: boolean
}): void {
  const lernaJsonExists = hasLernaJson(rootDir)

  if (!lernaJsonExists) {
    return
  }

  const lernaJsonPath = join(rootDir, 'lerna.json')

  if (!existsSync(lernaJsonPath)) {
    return
  }

  try {
    logger.debug('Updating lerna.json version')

    const content = readFileSync(lernaJsonPath, 'utf8')
    const lernaJson = JSON.parse(content)

    const oldVersion = lernaJson.version

    if (lernaJson.version === 'independent' || versionMode === 'independent') {
      logger.debug('Lerna version is independent or version mode is independent, skipping update')
      return
    }

    lernaJson.version = version

    if (dryRun) {
      logger.info(`[dry-run] update lerna.json: ${oldVersion} → ${version}`)
      return
    }

    recordReleaseFile(lernaJsonPath)
    writeFileSync(lernaJsonPath, `${formatJson(lernaJson)}\n`, 'utf8')
    logger.success(`Updated lerna.json: ${oldVersion} → ${version}`)
  }
  catch (error) {
    logger.fail(`Unable to update lerna.json: ${error}`)
  }
}

/**
 * The versions a command announces when they are known before it runs: those
 * of its bump result, else the version of the root `package.json` (one
 * version, without version groups nor `independent` mode). Undefined when
 * unknown, as in `relizy release` before its bump.
 */
export function getKnownReleaseVersions({ config, bumpResult }: { config: ResolvedRelizyConfig, bumpResult?: BumpResultTruthy }): string[] | undefined {
  if (bumpResult) {
    const versions = [
      bumpResult.newVersion,
      ...(bumpResult.groups ?? []).map(group => group.newVersion),
      ...bumpResult.bumpedPackages.map(pkg => pkg.newVersion),
    ]
    const known = versions.filter((version): version is string => Boolean(version))
    return known.length > 0
      ? known
      : undefined
  }

  if (config.monorepo?.groups?.length || config.monorepo?.versionMode === 'independent') {
    return undefined
  }

  const version = readPackageJson(config.cwd)?.version
  return version
    ? [version]
    : undefined
}

/**
 * True when every version of the release is a prerelease: a prerelease bump
 * (`--prerelease`, `--prepatch`, `--preminor`, `--premajor`), or versions
 * known before the run that are all prereleases. The steps with `onlyStable`
 * then do nothing, and their safety checks are skipped.
 */
export function isPrereleaseOnlyRelease(config: ResolvedRelizyConfig, versions?: string[]): boolean {
  return isPrereleaseReleaseType(config.bump.type) || (versions !== undefined && versions.length > 0 && versions.every(version => isPrerelease(version)))
}

function getBumpedPackageIndependently({
  pkg,
  dryRun,
}: {
  pkg: PackageBase
  dryRun: boolean
}): { bumped: true, newVersion: string, oldVersion: string } | { bumped: false } {
  logger.debug(`Analyzing ${pkg.name}`)

  const currentVersion = pkg.version || '0.0.0'
  const newVersion = pkg.newVersion

  if (!newVersion) {
    return { bumped: false }
  }

  logger.debug(`Bumping ${pkg.name} from ${currentVersion} to ${newVersion}`)

  writeVersion(pkg.path, newVersion, dryRun)
  return { bumped: true, newVersion, oldVersion: currentVersion }
}

export function getBumpedIndependentPackages({
  packages,
  dryRun,
}: {
  packages: PackageBase[]
  dryRun: boolean
}) {
  const bumpedPackages: PackageBase[] = []

  for (const pkgToBump of packages) {
    logger.debug(`Bumping ${pkgToBump.name} from ${pkgToBump.version} to ${pkgToBump.newVersion} (reason: ${pkgToBump.reason})`)

    const result = getBumpedPackageIndependently({
      pkg: pkgToBump,
      dryRun,
    })

    if (result.bumped) {
      bumpedPackages.push({
        ...pkgToBump,
        version: result.oldVersion,
      })
    }
  }

  return bumpedPackages
}
