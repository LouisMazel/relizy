import type { GitCommit } from 'changelogen'
import type { ReleaseType } from 'semver'
import type { ResolvedRelizyConfig } from '../core'
import type { PackageBase, RelizyConfig, VersionMode } from '../types'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { confirm } from '@inquirer/prompts'
import { logger } from '@maz-ui/node'
import { formatJson } from '@maz-ui/utils'
import * as semver from 'semver'
import { hasLernaJson } from '../core'

export function determineSemverChange(
  commits: GitCommit[],
  types: RelizyConfig['types'],
): 'major' | 'minor' | 'patch' | undefined {
  let [hasMajor, hasMinor, hasPatch] = [false, false, false]
  for (const commit of commits) {
    const commitType = types[commit.type]

    if (!commitType) {
      continue
    }

    const semverType = commitType.semver
    if (semverType === 'major' || commit.isBreaking) {
      hasMajor = true
    }
    else if (semverType === 'minor') {
      hasMinor = true
    }
    else if (semverType === 'patch') {
      hasPatch = true
    }
  }

  // eslint-disable-next-line sonarjs/no-nested-conditional
  return hasMajor ? 'major' : hasMinor ? 'minor' : hasPatch ? 'patch' : undefined
}

function detectReleaseTypeFromCommits(
  commits: GitCommit[],
  types: RelizyConfig['types'],
) {
  return determineSemverChange(commits, types)
}

function validatePrereleaseDowngrade(
  currentVersion: string,
  targetPreid: string | undefined,
  configuredType: ReleaseType,
): void {
  if (configuredType !== 'prerelease' || !targetPreid || !isPrerelease(currentVersion)) {
    return
  }

  const testVersion = semver.inc(currentVersion, 'prerelease', targetPreid)
  const isNotUpgrade = testVersion && !semver.gt(testVersion, currentVersion)

  if (isNotUpgrade) {
    throw new Error(`Unable to graduate from ${currentVersion} to ${testVersion}, it's not a valid prerelease`)
  }
}

function handleStableVersionWithReleaseType(
  commits: GitCommit[] | undefined,
  types: RelizyConfig['types'],
  force: boolean,
): ReleaseType | undefined {
  if (!commits?.length && !force) {
    logger.debug('No commits found for stable version with "release" type, skipping bump')
    return undefined
  }

  const detectedType = commits?.length
    ? detectReleaseTypeFromCommits(commits, types)
    : undefined

  if (!detectedType && !force) {
    logger.debug('No significant commits found, skipping bump')
    return undefined
  }

  logger.debug(`Auto-detected release type from commits: ${detectedType}`)
  return detectedType
}

function handleStableVersionWithPrereleaseType(
  commits: GitCommit[] | undefined,
  types: RelizyConfig['types'],
  force: boolean,
): ReleaseType | undefined {
  if (!commits?.length && !force) {
    logger.debug('No commits found for stable version with "prerelease" type, skipping bump')
    return undefined
  }

  const detectedType = commits?.length
    ? detectReleaseTypeFromCommits(commits, types)
    : undefined

  if (!detectedType) {
    logger.debug('No significant commits found, using prepatch as default')
    return 'prepatch'
  }

  const prereleaseType = `pre${detectedType}` as ReleaseType
  logger.debug(`Auto-detected prerelease type from commits: ${prereleaseType}`)
  return prereleaseType
}

function handlePrereleaseVersionToStable(
  currentVersion: string,
): ReleaseType {
  logger.debug(`Graduating from prerelease ${currentVersion} to stable release`)
  return 'release'
}

function handlePrereleaseVersionWithPrereleaseType(
  { currentVersion, preid, commits, force }: {
    currentVersion: string
    preid: string | undefined
    commits: GitCommit[] | undefined
    force: boolean
  },
): ReleaseType | undefined {
  const currentPreid = getPreid(currentVersion)
  const hasChangedPreid = preid && currentPreid && currentPreid !== preid

  if (hasChangedPreid) {
    const testVersion = semver.inc(currentVersion, 'prerelease', preid)

    if (!testVersion) {
      throw new Error(`Unable to change preid from ${currentPreid} to ${preid} for version ${currentVersion}`)
    }

    const isUpgrade = semver.gt(testVersion, currentVersion)

    if (!isUpgrade) {
      throw new Error(`Unable to change preid from ${currentVersion} to ${testVersion}, it's not a valid upgrade (cannot downgrade from ${currentPreid} to ${preid})`)
    }

    return 'prerelease'
  }

  if (!commits?.length && !force) {
    logger.debug('No commits found for prerelease version, skipping bump')
    return undefined
  }

  logger.debug(`Incrementing prerelease version: ${currentVersion}`)
  return 'prerelease'
}

function handleExplicitReleaseType({
  releaseType,
  currentVersion,
}: {
  releaseType: ReleaseType
  currentVersion: string
}): ReleaseType {
  const isCurrentPrerelease = isPrerelease(currentVersion)
  const isGraduatingToStable = isCurrentPrerelease && isStableReleaseType(releaseType)

  if (isGraduatingToStable) {
    logger.debug(`Graduating from prerelease ${currentVersion} to stable with type: ${releaseType}`)
  }
  else {
    logger.debug(`Using explicit release type: ${releaseType}`)
  }

  return releaseType
}

export function determineReleaseType({
  currentVersion,
  commits,
  releaseType,
  preid,
  types,
  force,
}: {
  currentVersion: string
  commits?: GitCommit[]
  releaseType: ReleaseType
  preid: string | undefined
  types: ResolvedRelizyConfig['types']
  force: boolean
}): ReleaseType | undefined {
  if (releaseType === 'release' && preid) {
    throw new Error('You cannot use a "release" type with a "preid", to use a preid you must use a "prerelease" type')
  }

  validatePrereleaseDowngrade(currentVersion, preid, releaseType)

  if (force) {
    logger.debug(`Force flag enabled, using configured type: ${releaseType}`)
    return releaseType
  }

  const isCurrentPrerelease = isPrerelease(currentVersion)

  /**
   * Stable branch
   */
  if (!isCurrentPrerelease) {
    if (releaseType === 'release') {
      return handleStableVersionWithReleaseType(commits, types, force)
    }

    if (releaseType === 'prerelease') {
      return handleStableVersionWithPrereleaseType(commits, types, force)
    }

    return handleExplicitReleaseType({ releaseType, currentVersion })
  }

  /**
   * Prerelease branch
   */
  if (releaseType === 'release') {
    return handlePrereleaseVersionToStable(currentVersion)
  }

  if (releaseType === 'prerelease') {
    return handlePrereleaseVersionWithPrereleaseType({ currentVersion, preid, commits, force })
  }

  return handleExplicitReleaseType({ releaseType, currentVersion })
}

export function writeVersion(pkgPath: string, version: string, dryRun = false): void {
  const packageJsonPath = join(pkgPath, 'package.json')

  try {
    logger.debug(`Writing ${version} to ${pkgPath}`)

    const content = readFileSync(packageJsonPath, 'utf8')
    const packageJson = JSON.parse(content)

    const oldVersion = packageJson.version
    packageJson.version = version

    if (dryRun) {
      logger.info(`[dry-run] Updated ${packageJson.name}: ${oldVersion} → ${version}`)
      return
    }

    writeFileSync(packageJsonPath, `${formatJson(packageJson)}\n`, 'utf8')
    logger.info(`Updated ${packageJson.name}: ${oldVersion} → ${version}`)
  }
  catch (error) {
    throw new Error(`Unable to write version to ${packageJsonPath}: ${error}`)
  }
}

export function getPackageNewVersion({
  currentVersion,
  releaseType,
  preid,
  suffix,
}: {
  currentVersion: string
  releaseType: ReleaseType
  preid: string | undefined
  suffix: string | undefined
}): string {
  let newVersion = semver.inc(currentVersion, releaseType, preid as string)

  if (!newVersion) {
    throw new Error(`Unable to bump version "${currentVersion}" with release type "${releaseType}"\n\nYou should use an explicit release type (use flag: --major, --minor, --patch, --premajor, --preminor, --prepatch, --prerelease)`)
  }

  if (isPrereleaseReleaseType(releaseType) && suffix) {
    // Remplace le dernier .X par .suffix
    newVersion = newVersion.replace(/\.(\d+)$/, `.${suffix}`)
  }

  const isValidVersion = semver.gt(newVersion, currentVersion)

  if (!isValidVersion) {
    throw new Error(`Unable to bump version "${currentVersion}" to "${newVersion}", new version is not greater than current version`)
  }

  if (isGraduating(currentVersion, releaseType)) {
    logger.info(`Graduating from prerelease ${currentVersion} to stable ${newVersion}`)
  }

  if (isChangedPreid(currentVersion, preid)) {
    logger.debug(`Graduating from ${getPreid(currentVersion)} to ${preid}`)
  }

  return newVersion
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

    writeFileSync(lernaJsonPath, `${formatJson(lernaJson)}\n`, 'utf8')
    logger.success(`Updated lerna.json: ${oldVersion} → ${version}`)
  }
  catch (error) {
    logger.fail(`Unable to update lerna.json: ${error}`)
  }
}

export function extractVersionFromPackageTag(tag: string): string | null {
  const atIndex = tag.lastIndexOf('@')
  if (atIndex === -1) {
    return null
  }
  return tag.slice(atIndex + 1)
}

export function isPrerelease(version?: string): boolean {
  if (!version)
    return false

  const prerelease = semver.prerelease(version)
  return prerelease ? prerelease.length > 0 : false
}

export function isStableReleaseType(releaseType: ReleaseType): boolean {
  const stableTypes = ['release', 'major', 'minor', 'patch']
  return stableTypes.includes(releaseType)
}

export function isPrereleaseReleaseType(releaseType: ReleaseType): boolean {
  const prereleaseTypes = ['prerelease', 'premajor', 'preminor', 'prepatch']
  return prereleaseTypes.includes(releaseType)
}

export function isGraduating(currentVersion: string, releaseType: ReleaseType): boolean {
  return isPrerelease(currentVersion) && isStableReleaseType(releaseType)
}

export function getPreid(version: string): string | null {
  if (!version)
    return null

  const prerelease = semver.prerelease(version)
  if (!prerelease || prerelease.length === 0) {
    return null
  }

  return prerelease[0] as string
}

export function isChangedPreid(
  currentVersion: string,
  targetPreid?: string,
): boolean {
  if (!targetPreid || !isPrerelease(currentVersion)) {
    return false
  }

  const currentPreid = getPreid(currentVersion)

  if (!currentPreid) {
    return false
  }

  return currentPreid !== targetPreid
}

export function getBumpedPackageIndependently({
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

function displayRootAndLernaUpdates({
  versionMode,
  currentVersion,
  newVersion,
  dryRun,
  lernaJsonExists,
}: {
  versionMode: VersionMode
  currentVersion?: string
  newVersion?: string
  dryRun: boolean
  lernaJsonExists: boolean
}) {
  if (versionMode !== 'independent' && currentVersion && newVersion) {
    logger.log(`${dryRun ? '[dry-run] ' : ''}Root package.json: ${currentVersion} → ${newVersion}`)
    logger.log('')

    if (lernaJsonExists) {
      logger.log(`${dryRun ? '[dry-run] ' : ''}lerna.json: ${currentVersion} → ${newVersion}`)
      logger.log('')
    }
  }
}

function displayUnifiedModePackages({
  packages,
  newVersion,
  force,
}: {
  packages: PackageBase[]
  newVersion: string
  force: boolean
}) {
  logger.log(`${packages.length} package(s):`)
  packages.forEach((pkg) => {
    logger.log(`  • ${pkg.name}: ${pkg.version} → ${newVersion} ${force ? '(force)' : ''}`)
  })
  logger.log('')
}

function displaySelectiveModePackages({
  packages,
  newVersion,
  force,
}: {
  packages: PackageBase[]
  newVersion: string
  force: boolean
}) {
  if (force) {
    logger.log(`${packages.length} package(s):`)
    packages.forEach((pkg) => {
      logger.log(`  • ${pkg.name}: ${pkg.version} → ${newVersion} (force)`)
    })
    logger.log('')
  }
  else {
    const packagesWithCommits = packages.filter(p => 'reason' in p && p.reason === 'commits')
    const packagesAsDependents = packages.filter(p => 'reason' in p && p.reason === 'dependency')
    const packagesAsGraduation = packages.filter(p => 'reason' in p && p.reason === 'graduation')

    if (packagesWithCommits.length > 0) {
      logger.log(`${packagesWithCommits.length} package(s) with commits:`)
      packagesWithCommits.forEach((pkg) => {
        logger.log(`  • ${pkg.name}: ${pkg.version} → ${newVersion} (${pkg.commits.length} commits) ${force ? '(force)' : ''}`)
      })
      logger.log('')
    }

    if (packagesAsDependents.length > 0) {
      logger.log(`${packagesAsDependents.length} dependent package(s):`)
      packagesAsDependents.forEach((pkg) => {
        logger.log(`  • ${pkg.name}: ${pkg.version} → ${newVersion} ${force ? '(force)' : ''}`)
      })
      logger.log('')
    }

    if (packagesAsGraduation.length > 0) {
      logger.log(`${packagesAsGraduation.length} graduation package(s):`)
      packagesAsGraduation.forEach((pkg) => {
        logger.log(`  • ${pkg.name}: ${pkg.version} → ${newVersion} ${force ? '(force)' : ''}`)
      })
      logger.log('')
    }
  }
}

function displayIndependentModePackages({
  packages,
  force,
}: {
  packages: PackageBase[]
  force: boolean
}) {
  if (force) {
    logger.log(`${packages.length} package(s):`)
    packages.forEach((pkg) => {
      logger.log(`  • ${pkg.name}: ${pkg.version} → ${pkg.newVersion} (force)`)
    })
    logger.log('')
  }
  else {
    const packagesWithCommits = packages.filter(p => 'reason' in p && p.reason === 'commits')
    const packagesAsDependents = packages.filter(p => 'reason' in p && p.reason === 'dependency')
    const packagesAsGraduation = packages.filter(p => 'reason' in p && p.reason === 'graduation')

    if (packagesWithCommits.length > 0) {
      logger.log(`${packagesWithCommits.length} package(s) with commits:`)
      packagesWithCommits.forEach((pkg) => {
        pkg.newVersion && logger.log(`  • ${pkg.name}: ${pkg.version} → ${pkg.newVersion} (${pkg.commits.length} commits) ${force ? '(force)' : ''}`)
      })
      logger.log('')
    }

    if (packagesAsDependents.length > 0) {
      logger.log(`${packagesAsDependents.length} dependent package(s):`)
      packagesAsDependents.forEach((pkg) => {
        pkg.newVersion && logger.log(`  • ${pkg.name}: ${pkg.version} → ${pkg.newVersion} ${force ? '(force)' : ''}`)
      })
      logger.log('')
    }

    if (packagesAsGraduation.length > 0) {
      logger.log(`${packagesAsGraduation.length} graduation package(s):`)
      packagesAsGraduation.forEach((pkg) => {
        pkg.newVersion && logger.log(`  • ${pkg.name}: ${pkg.version} → ${pkg.newVersion} ${force ? '(force)' : ''}`)
      })
      logger.log('')
    }
  }
}

export async function confirmBump({
  versionMode,
  config,
  packages,
  force,
  currentVersion,
  newVersion,
  dryRun,
}: {
  versionMode: VersionMode
  config: ResolvedRelizyConfig
  packages: PackageBase[]
  force: boolean
  currentVersion?: string
  newVersion?: string
  dryRun: boolean
}) {
  if (packages.length === 0) {
    logger.debug('No packages to bump')
    return
  }

  const lernaJsonExists = hasLernaJson(config.cwd)

  logger.log('')
  logger.info(`${dryRun ? '[dry-run] ' : ''}The following packages will be updated:\n`)

  displayRootAndLernaUpdates({
    versionMode,
    currentVersion,
    newVersion,
    lernaJsonExists,
    dryRun,
  })

  if (versionMode === 'unified') {
    if (!newVersion) {
      logger.error('Cannot confirm bump in unified mode without a new version')
      process.exit(1)
    }

    displayUnifiedModePackages({ packages, newVersion, force })
  }
  else if (versionMode === 'selective') {
    if (!newVersion) {
      logger.error('Cannot confirm bump in selective mode without a new version')
      process.exit(1)
    }

    displaySelectiveModePackages({ packages, newVersion, force })
  }
  else if (versionMode === 'independent') {
    displayIndependentModePackages({ packages, force })
  }

  try {
    const confirmed = await confirm({
      message: `${dryRun ? '[dry-run] ' : ''}Do you want to proceed with these version updates?`,
      default: true,
    })

    if (!confirmed) {
      logger.log('')
      logger.fail('Bump refused')
      process.exit(0)
    }
  }
  catch (error) {
    const userHasExited = error instanceof Error && error.name === 'ExitPromptError'

    if (userHasExited) {
      logger.log('')
      logger.fail('Bump cancelled')
      process.exit(0)
    }

    logger.fail('Error while confirming bump')
    process.exit(1)
  }

  logger.log('')
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
