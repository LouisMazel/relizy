import type { LogLevel } from '@maz-ui/node'
import type { ReadPackage, VersionMode } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { execPromise, logger } from '@maz-ui/node'
import { getCurrentGitRef, getFirstCommit } from './git'
import { extractVersionFromTag, isGraduating, isGraduatingToStableBetweenVersion, isPrerelease, isTagVersionCompatibleWithCurrent, shouldFilterPrereleaseTags } from './version'

export function getIndependentTag({ version, name }: { version: string, name: string }) {
  return `${name}@${version}`
}

export async function getLastStableTag({ logLevel, cwd }: { logLevel?: LogLevel, cwd?: string }) {
  const { stdout } = await execPromise(
    `git tag --sort=-creatordate | grep -E '^[^0-9]*[0-9]+\\.[0-9]+\\.[0-9]+$' | head -n 1`,
    {
      logLevel,
      noStderr: true,
      noStdout: true,
      noSuccess: true,
      cwd,
    },
  )

  const lastTag = stdout.trim()

  logger.debug('Last stable tag:', lastTag || 'No stable tags found')

  return lastTag
}

export async function getLastTag({ logLevel, cwd }: { logLevel?: LogLevel, cwd?: string }) {
  const { stdout } = await execPromise(`git tag --sort=-creatordate | head -n 1`, {
    logLevel,
    noStderr: true,
    noStdout: true,
    noSuccess: true,
    cwd,
  })

  const lastTag = stdout.trim()

  logger.debug('Last tag:', lastTag || 'No tags found')

  return lastTag
}

/**
 * Retrieves recent git tags from the repository.
 * Returns up to `limit` tags sorted by creation date (most recent first).
 */
async function getAllRecentRepoTags(options?: {
  limit?: number
  logLevel?: LogLevel
  cwd?: string
}): Promise<string[]> {
  const limit = options?.limit || 50

  try {
    const { stdout } = await execPromise(
      `git tag --sort=-creatordate | head -n ${limit}`,
      {
        logLevel: options?.logLevel,
        noStderr: true,
        noStdout: true,
        noSuccess: true,
        cwd: options?.cwd,
      },
    )

    const tags = stdout.trim().split('\n').filter(tag => tag.length > 0)

    logger.debug(`Retrieved ${tags.length} recent repo tags`)

    return tags
  }
  catch {
    return []
  }
}

/**
 * Retrieves recent git tags for a specific package (independent mode).
 * Returns up to `limit` tags matching the package name pattern.
 */
async function getAllRecentPackageTags({
  packageName,
  limit = 50,
  logLevel,
  cwd,
}: {
  packageName: string
  limit?: number
  logLevel?: LogLevel
  cwd?: string
}): Promise<string[]> {
  try {
    const escapedPackageName = packageName.replace(/[@/]/g, '\\$&')

    const { stdout } = await execPromise(
      `git tag --sort=-creatordate | grep -E '^${escapedPackageName}@' | head -n ${limit}`,
      {
        logLevel,
        noStderr: true,
        noStdout: true,
        noSuccess: true,
        cwd,
      },
    )

    const tags = stdout.trim().split('\n').filter(tag => tag.length > 0)

    logger.debug(`Retrieved ${tags.length} recent tags for package ${packageName}`)

    return tags
  }
  catch {
    return []
  }
}

/**
 * Filters tags based on compatibility criteria:
 * 1. Filters out prerelease tags if onlyStable is true
 * 2. Filters out tags with major version > current version's major
 */
function filterCompatibleTags({
  tags,
  currentVersion,
  onlyStable,
  packageName,
}: {
  tags: string[]
  currentVersion: string
  onlyStable: boolean
  packageName?: string
}): string[] {
  const filtered = tags.filter((tag) => {
    // Extract version from tag
    const tagVersion = extractVersionFromTag(tag, packageName)

    if (!tagVersion) {
      logger.debug(`Skipping tag ${tag}: cannot extract version`)
      return false
    }

    // Filter out prerelease tags if only stable versions are requested
    if (onlyStable && isPrerelease(tagVersion)) {
      logger.debug(`Skipping tag ${tag}: prerelease version ${tagVersion} (onlyStable=${onlyStable})`)
      return false
    }

    // Filter out tags with incompatible major versions (major > current major)
    if (!isTagVersionCompatibleWithCurrent(tagVersion, currentVersion)) {
      logger.debug(`Skipping tag ${tag}: version ${tagVersion} has higher major than current ${currentVersion}`)
      return false
    }

    logger.debug(`Tag ${tag} with version ${tagVersion} is compatible`)
    return true
  })

  logger.debug(`Filtered ${tags.length} tags down to ${filtered.length} compatible tags`)

  return filtered
}

export function getLastRepoTag(options?: {
  onlyStable?: boolean
  currentVersion?: string
  logLevel?: LogLevel
  cwd?: string
}): Promise<string | null> {
  // If currentVersion is provided, use intelligent filtering
  if (options?.currentVersion) {
    return getLastRepoTagWithFiltering({
      currentVersion: options.currentVersion,
      onlyStable: options.onlyStable ?? false,
      logLevel: options.logLevel,
      cwd: options.cwd,
    })
  }

  // Otherwise, use legacy behavior for backward compatibility
  if (options?.onlyStable) {
    return getLastStableTag({ logLevel: options?.logLevel, cwd: options?.cwd })
  }

  return getLastTag({ logLevel: options?.logLevel, cwd: options?.cwd })
}

/**
 * Gets the last compatible repository tag using intelligent filtering.
 * This function:
 * 1. Retrieves recent tags
 * 2. Filters out prerelease tags if onlyStable is true
 * 3. Filters out tags with major version > current version
 * 4. Returns the most recent compatible tag
 */
async function getLastRepoTagWithFiltering({
  currentVersion,
  onlyStable,
  logLevel,
  cwd,
}: {
  currentVersion: string
  onlyStable: boolean
  logLevel?: LogLevel
  cwd?: string
}): Promise<string | null> {
  const recentTags = await getAllRecentRepoTags({ limit: 50, logLevel, cwd })

  if (recentTags.length === 0) {
    logger.debug('No tags found in repository')
    return null
  }

  const compatibleTags = filterCompatibleTags({
    tags: recentTags,
    currentVersion,
    onlyStable,
  })

  if (compatibleTags.length === 0) {
    logger.debug('No compatible tags found')
    return null
  }

  const lastTag = compatibleTags[0]
  logger.debug(`Last compatible repo tag: ${lastTag}`)

  return lastTag
}

export async function getLastPackageTag({
  packageName,
  onlyStable,
  currentVersion,
  logLevel,
  cwd,
}: {
  packageName: string
  onlyStable?: boolean
  currentVersion?: string
  logLevel?: LogLevel
  cwd?: string
}): Promise<string | null> {
  // If currentVersion is provided, use intelligent filtering
  if (currentVersion) {
    return getLastPackageTagWithFiltering({
      packageName,
      currentVersion,
      onlyStable: onlyStable ?? false,
      logLevel,
      cwd,
    })
  }

  // Otherwise, use legacy behavior for backward compatibility
  try {
    const escapedPackageName = packageName.replace(/[@/]/g, '\\$&')

    let grepPattern: string
    if (onlyStable) {
      grepPattern = `^${escapedPackageName}@[0-9]+\\.[0-9]+\\.[0-9]+$`
    }
    else {
      grepPattern = `^${escapedPackageName}@`
    }

    const { stdout } = await execPromise(
      `git tag --sort=-creatordate | grep -E '${grepPattern}' | sed -n '1p'`,
      {
        logLevel,
        noStderr: true,
        noStdout: true,
        noSuccess: true,
        cwd,
      },
    )

    const tag = stdout.trim()
    return tag || null
  }
  catch {
    return null
  }
}

/**
 * Gets the last compatible package tag using intelligent filtering.
 * This function:
 * 1. Retrieves recent package tags
 * 2. Filters out prerelease tags if onlyStable is true
 * 3. Filters out tags with major version > current version
 * 4. Returns the most recent compatible tag
 */
async function getLastPackageTagWithFiltering({
  packageName,
  currentVersion,
  onlyStable,
  logLevel,
  cwd,
}: {
  packageName: string
  currentVersion: string
  onlyStable: boolean
  logLevel?: LogLevel
  cwd?: string
}): Promise<string | null> {
  const recentTags = await getAllRecentPackageTags({
    packageName,
    limit: 50,
    logLevel,
    cwd,
  })

  if (recentTags.length === 0) {
    logger.debug(`No tags found for package ${packageName}`)
    return null
  }

  const compatibleTags = filterCompatibleTags({
    tags: recentTags,
    currentVersion,
    onlyStable,
    packageName,
  })

  if (compatibleTags.length === 0) {
    logger.debug(`No compatible tags found for package ${packageName}`)
    return null
  }

  const lastTag = compatibleTags[0]
  logger.debug(`Last compatible package tag for ${packageName}: ${lastTag}`)

  return lastTag
}

export type Step = 'bump' | 'changelog' | 'publish' | 'provider-release' | 'social'

export interface ResolvedTags {
  from: string
  to: string
}

async function resolveFromTagIndependent({
  cwd,
  packageName,
  currentVersion,
  graduating,
  logLevel,
}: {
  cwd: string
  packageName: string
  currentVersion: string
  graduating: boolean
  logLevel?: LogLevel
}): Promise<string> {
  // Determine if we should filter prerelease tags
  const filterPrereleases = shouldFilterPrereleaseTags(currentVersion, graduating)
  const onlyStable = graduating || filterPrereleases

  const lastPackageTag = await getLastPackageTag({
    packageName,
    currentVersion,
    onlyStable,
    logLevel,
    cwd,
  })

  if (!lastPackageTag) {
    return getFirstCommit(cwd)
  }

  return lastPackageTag
}

async function resolveFromTagUnified({
  config,
  currentVersion,
  graduating,
  logLevel,
}: {
  config: ResolvedRelizyConfig
  currentVersion: string
  graduating: boolean
  logLevel?: LogLevel
}): Promise<string> {
  // Determine if we should filter prerelease tags
  const filterPrereleases = shouldFilterPrereleaseTags(currentVersion, graduating)
  const onlyStable = graduating || filterPrereleases

  const from = await getLastRepoTag({
    currentVersion,
    onlyStable,
    logLevel,
    cwd: config.cwd,
  }) || getFirstCommit(config.cwd)

  return from
}

async function resolveFromTag({
  config,
  versionMode,
  step,
  packageName,
  currentVersion,
  graduating,
  logLevel,
}: {
  config: ResolvedRelizyConfig
  versionMode?: VersionMode | 'standalone'
  step: Step
  packageName?: string
  currentVersion: string
  graduating: boolean
  logLevel?: LogLevel
}) {
  let from: string

  if (versionMode === 'independent') {
    if (!packageName) {
      throw new Error('Package name is required for independent version mode')
    }

    from = await resolveFromTagIndependent({
      cwd: config.cwd,
      packageName,
      currentVersion,
      graduating,
      logLevel,
    })
  }
  else {
    from = await resolveFromTagUnified({
      config,
      currentVersion,
      graduating,
      logLevel,
    })
  }

  logger.debug(`[${versionMode}](${step}) Using from tag: ${from}`)

  return config.from || from
}

function resolveToTag({
  config,
  versionMode,
  newVersion,
  step,
  packageName,
}: {
  config: ResolvedRelizyConfig
  versionMode?: VersionMode | 'standalone'
  newVersion?: string
  step: Step
  packageName?: string
}) {
  const isUntaggedStep = step === 'bump' || step === 'changelog'

  let to: string

  if (isUntaggedStep) {
    to = getCurrentGitRef(config.cwd)
  }

  else if (versionMode === 'independent') {
    if (!packageName) {
      throw new Error('Package name is required for independent version mode')
    }

    if (!newVersion) {
      throw new Error('New version is required for independent version mode')
    }

    to = getIndependentTag({ version: newVersion, name: packageName })
  }
  else {
    to = newVersion ? config.templates.tagBody.replace('{{newVersion}}', newVersion) : getCurrentGitRef(config.cwd)
  }

  logger.debug(`[${versionMode}](${step}) Using to tag: ${to}`)

  return config.to || to
}

export async function resolveTags<S extends Step, NewVersion = S extends 'bump' ? undefined : string>({
  config,
  step,
  pkg,
  newVersion,
}: {
  config: ResolvedRelizyConfig
  step: S
  pkg: ReadPackage
  newVersion: NewVersion
}): Promise<ResolvedTags> {
  const versionMode = config.monorepo?.versionMode || 'standalone'
  const logLevel = config.logLevel

  logger.debug(`[${versionMode}](${step}) Resolving tags`)

  const releaseType = config.bump.type

  const graduating = typeof newVersion === 'string' ? isGraduatingToStableBetweenVersion(pkg.version, newVersion) : isGraduating(pkg.version, releaseType)

  const from = await resolveFromTag({
    config,
    versionMode,
    step,
    packageName: pkg.name,
    currentVersion: pkg.version,
    graduating,
    logLevel,
  })

  const to = resolveToTag({
    config,
    versionMode,
    newVersion: newVersion as string | undefined,
    step,
    packageName: pkg.name,
  })

  logger.debug(`[${versionMode}](${step}) Using tags: ${from} → ${to}`)

  return { from, to }
}
