import type { LogLevel } from '@maz-ui/node'
import type { ReadPackage, VersionMode } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execPromise, logger } from '@maz-ui/node'
import * as semver from 'semver'
import { getCurrentGitRef, getFirstCommit } from './git'
import { listTags } from './git-refs'
import { isGraduating, isGraduatingToStableBetweenVersion, isPrerelease, isTagVersionCompatibleWithCurrent, shouldFilterPrereleaseTags } from './version'

export function getIndependentTag({ version, name }: { version: string, name: string }) {
  return `${name}@${version}`
}

export async function getLastStableTag({ logLevel, cwd }: { logLevel?: LogLevel, cwd?: string }) {
  const { stdout } = await execPromise(
    `git tag --sort=-creatordate | grep -E '^[^0-9@]*[0-9]+\\.[0-9]+\\.[0-9]+$' | head -n 1`,
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

const NEW_VERSION_PLACEHOLDER = '{{newVersion}}'

/**
 * A tag and the version it was released at.
 */
interface VersionedTag {
  tag: string
  version: string
}

/**
 * Returns the version written in a tag, or null when it is not a strict semver
 * version. `semver.valid` also accepts a leading `v` or `=`, which a version
 * written by relizy never has.
 */
function parseTagVersion(value: string): string | null {
  return /^\d/.test(value) ? semver.valid(value) : null
}

/**
 * Splits `templates.tagBody` around its `{{newVersion}}` placeholder, or returns
 * null when the template has no placeholder.
 */
function splitTagBody(tagBody: string): { prefix: string, suffix: string } | null {
  const index = tagBody.indexOf(NEW_VERSION_PLACEHOLDER)

  if (index === -1) {
    return null
  }

  return {
    prefix: tagBody.slice(0, index),
    suffix: tagBody.slice(index + NEW_VERSION_PLACEHOLDER.length),
  }
}

/**
 * Returns the version of a repository tag built from `templates.tagBody` (e.g. `v{{newVersion}}`),
 * or null when the tag does not follow the template. This keeps the tags of other packages
 * (e.g. `@scope/pkg@1.2.3` or `vue-utils@1.2.3` from an independent release in the same
 * repository) out of the repository range.
 */
export function extractVersionFromRepoTag(tag: string, tagBody: string): string | null {
  const parts = splitTagBody(tagBody)

  if (!parts || !tag.startsWith(parts.prefix) || !tag.endsWith(parts.suffix)) {
    return null
  }

  return parseTagVersion(tag.slice(parts.prefix.length, tag.length - parts.suffix.length))
}

/**
 * Returns the version of a tag in the historical repository formats (`v1.2.3`,
 * `1.2.3`), or null. A package tag (`name@1.2.3`) never matches.
 */
function extractVersionFromLegacyRepoTag(tag: string): string | null {
  return parseTagVersion(tag.startsWith('v') ? tag.slice(1) : tag)
}

/**
 * Returns the version of a package tag (`name@1.2.3`, see `getIndependentTag`),
 * or null when the tag belongs to another package.
 */
function extractVersionFromPackageTag(tag: string, packageName: string): string | null {
  const prefix = `${packageName}@`

  return tag.startsWith(prefix) ? parseTagVersion(tag.slice(prefix.length)) : null
}

/**
 * Returns the repository tags with their version.
 *
 * A repository tag follows `templates.tagBody`, or one of the historical
 * formats `v1.2.3` and `1.2.3` (so the previous tags stay recognized when the
 * template is changed). The tags of the packages released independently in the
 * same repository (`@scope/pkg@1.2.3`, `vue-utils@1.2.3`) never match. For the
 * same version, the tag following the template comes first.
 *
 * Also returns the other tags that look like a release (they contain a version
 * but are neither repository nor package tags), to warn about them.
 */
async function getRepoTags({
  tagBody,
  logLevel,
  cwd,
}: {
  tagBody?: string
  logLevel?: LogLevel
  cwd?: string
}): Promise<{ tags: VersionedTag[], unrecognizedTags: string[] }> {
  const templateTags: VersionedTag[] = []
  const legacyTags: VersionedTag[] = []
  const unrecognizedTags: string[] = []

  for (const tag of await listTags({ logLevel, cwd })) {
    const templateVersion = tagBody ? extractVersionFromRepoTag(tag, tagBody) : null

    if (templateVersion) {
      templateTags.push({ tag, version: templateVersion })
      continue
    }

    const legacyVersion = extractVersionFromLegacyRepoTag(tag)

    if (legacyVersion) {
      legacyTags.push({ tag, version: legacyVersion })
    }
    else if (!tag.includes('@') && tag.split(/[^\d.]/).some(part => semver.valid(part))) {
      unrecognizedTags.push(tag)
    }
  }

  logger.debug(`Retrieved ${templateTags.length} repo tags following "${tagBody}" and ${legacyTags.length} in the v1.2.3 or 1.2.3 format`)

  return { tags: [...templateTags, ...legacyTags], unrecognizedTags }
}

/**
 * Returns the tags of a package released independently, with their version.
 */
async function getPackageTags({
  packageName,
  logLevel,
  cwd,
}: {
  packageName: string
  logLevel?: LogLevel
  cwd?: string
}): Promise<VersionedTag[]> {
  const tags: VersionedTag[] = []

  for (const tag of await listTags({ pattern: `${packageName}@*`, logLevel, cwd })) {
    const version = extractVersionFromPackageTag(tag, packageName)

    if (version) {
      tags.push({ tag, version })
    }
  }

  logger.debug(`Retrieved ${tags.length} tags for package ${packageName}`)

  return tags
}

/**
 * Picks the tag of the previous release, deterministically: the highest version
 * that is not above `maxVersion` (the version before the bump) nor above the
 * major of the current version. It does not depend on the creation date of the
 * tags, so a tag created later on another branch (a hotfix of an older version,
 * a release of a branch not merged yet) is never picked over the actual
 * previous release.
 *
 * With onlyStable, prereleases are skipped. If that removes every candidate but
 * prerelease tags exist (e.g. a previous `git push --follow-tags` failed and only
 * beta tags remain while package.json was bumped manually to a stable version),
 * falls back to the highest prerelease rather than treating the history as new.
 *
 * For equal versions, the first tag of the list is picked.
 */
function selectPreviousTag({
  tags,
  currentVersion,
  maxVersion,
  onlyStable,
  label,
}: {
  tags: VersionedTag[]
  currentVersion: string
  maxVersion: string
  onlyStable: boolean
  label: string
}): string | null {
  const candidates = tags.filter(({ tag, version }) => {
    if (!isTagVersionCompatibleWithCurrent(version, currentVersion)) {
      logger.debug(`Skipping tag ${tag}: version ${version} has higher major than current ${currentVersion}`)
      return false
    }

    if (semver.valid(maxVersion) && semver.gt(version, maxVersion)) {
      logger.debug(`Skipping tag ${tag}: version ${version} is higher than ${maxVersion}`)
      return false
    }

    return true
  })

  const highest = (list: VersionedTag[]) => list.reduce<VersionedTag | null>(
    (best, candidate) => (!best || semver.gt(candidate.version, best.version) ? candidate : best),
    null,
  )

  if (onlyStable) {
    const stable = highest(candidates.filter(({ version }) => !isPrerelease(version)))

    if (stable) {
      logger.debug(`Previous ${label} tag: ${stable.tag}`)
      return stable.tag
    }
  }

  const previous = highest(candidates)

  if (previous) {
    if (onlyStable) {
      logger.info(`No stable ${label} tag found for version ${currentVersion}, falling back to last prerelease tag: ${previous.tag}`)
    }
    else {
      logger.debug(`Previous ${label} tag: ${previous.tag}`)
    }

    return previous.tag
  }

  logger.info(`No compatible ${label} tag found for version ${currentVersion}`)
  return null
}

/**
 * Warns once per repository and template about the tags that look like a
 * previous release but follow neither `templates.tagBody` nor `v1.2.3`.
 */
const warnedUnrecognizedTags = new Set<string>()

function warnUnrecognizedTags({ tags, tagBody, cwd }: { tags: string[], tagBody?: string, cwd?: string }) {
  const key = `${cwd}:${tagBody}`

  if (tags.length === 0 || warnedUnrecognizedTags.has(key)) {
    return
  }

  warnedUnrecognizedTags.add(key)

  logger.warn(
    `No previous release tag follows templates.tagBody "${tagBody}", but some tags look like one (${tags.slice(0, 3).join(', ')}). `
    + 'If the template was changed, pass the tag of the previous release with --from.',
  )
}

export function getLastRepoTag(options?: {
  onlyStable?: boolean
  pkg?: ReadPackage
  /** Template of the repository tags (`templates.tagBody`) */
  tagBody?: string
  /** Version before the bump, when higher than `pkg.version` (e.g. the root version for a sub-package) */
  currentVersion?: string
  logLevel?: LogLevel
  cwd?: string
}): Promise<string | null> {
  // If currentVersion is provided, use intelligent filtering
  if (options?.pkg) {
    return getLastRepoTagWithFiltering({
      pkg: options.pkg,
      onlyStable: options.onlyStable ?? false,
      tagBody: options.tagBody,
      maxVersion: options.currentVersion ?? options.pkg.version,
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
 * Gets the tag of the previous repository release: the repository tags (see
 * `getRepoTags`) are filtered and picked by `selectPreviousTag`.
 */
async function getLastRepoTagWithFiltering({
  pkg,
  onlyStable,
  tagBody,
  maxVersion,
  logLevel,
  cwd,
}: {
  pkg: ReadPackage
  onlyStable: boolean
  tagBody?: string
  maxVersion: string
  logLevel?: LogLevel
  cwd?: string
}): Promise<string | null> {
  const { tags, unrecognizedTags } = await getRepoTags({ tagBody, logLevel, cwd })

  if (tags.length === 0) {
    logger.info('No release tags found in repository')
    warnUnrecognizedTags({ tags: unrecognizedTags, tagBody, cwd })
    return null
  }

  return selectPreviousTag({
    tags,
    currentVersion: pkg.version,
    maxVersion,
    onlyStable,
    label: 'repo',
  })
}

export async function getLastPackageTag({
  pkg,
  onlyStable,
  logLevel,
  cwd,
}: {
  pkg: ReadPackage
  onlyStable?: boolean
  logLevel?: LogLevel
  cwd?: string
}): Promise<string | null> {
  // If currentVersion is provided, use intelligent filtering
  if (pkg.version) {
    return getLastPackageTagWithFiltering({
      pkg,
      onlyStable: onlyStable ?? false,
      logLevel,
      cwd,
    })
  }

  // Otherwise, use legacy behavior for backward compatibility
  try {
    const escapedPackageName = pkg.name.replace(/[@/]/g, '\\$&')

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
 * Gets the tag of the previous release of a package released independently:
 * its tags (see `getPackageTags`) are filtered and picked by `selectPreviousTag`.
 */
async function getLastPackageTagWithFiltering({
  pkg,
  onlyStable,
  logLevel,
  cwd,
}: {
  pkg: ReadPackage
  onlyStable: boolean
  logLevel?: LogLevel
  cwd?: string
}): Promise<string | null> {
  const tags = await getPackageTags({ packageName: pkg.name, logLevel, cwd })

  if (tags.length === 0) {
    logger.info(`No tags found for package ${pkg.name}`)
    return null
  }

  return selectPreviousTag({
    tags,
    currentVersion: pkg.version,
    maxVersion: pkg.version,
    onlyStable,
    label: `${pkg.name} package`,
  })
}

export type Step = 'bump' | 'changelog' | 'publish' | 'provider-release' | 'social'

export interface ResolvedTags {
  from: string
  to: string
}

/**
 * Special marker indicating this is a new package with no previous tags.
 * When this marker is returned as the "from" tag, getPackageCommits should
 * return an empty array instead of analyzing all commits from the beginning
 * of the repository (which would cause ENOBUFS errors on large repos).
 */
export const NEW_PACKAGE_MARKER = '__NEW_PACKAGE__' as const

async function resolveFromTagIndependent({
  cwd,
  pkg,
  graduating,
  logLevel,
}: {
  cwd: string
  pkg: ReadPackage
  graduating: boolean
  logLevel?: LogLevel
}): Promise<string> {
  // Determine if we should filter prerelease tags
  const filterPrereleases = shouldFilterPrereleaseTags(pkg.version, graduating)
  const onlyStable = graduating || filterPrereleases

  const lastPackageTag = await getLastPackageTag({
    pkg,
    onlyStable,
    logLevel,
    cwd,
  })

  if (!lastPackageTag) {
    // For new packages without any tags, return a marker instead of the first commit.
    // This prevents ENOBUFS errors when getGitDiff tries to analyze all commits
    // from the beginning of a large repository.
    logger.debug(`No tag found for package ${pkg.name}, marking as new package`)
    return NEW_PACKAGE_MARKER
  }

  return lastPackageTag
}

/**
 * Returns the version of the repository before the bump: the root version, or
 * the version of the package when higher. In unified and selective modes, a
 * sub-package that was not bumped by the last releases keeps an older version
 * but its range still starts at the last repository release.
 */
function getRepoCurrentVersion({ cwd, pkg }: { cwd: string, pkg: ReadPackage }): string {
  let rootVersion: string | null = null

  try {
    rootVersion = semver.valid((JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as { version?: string }).version)
  }
  catch {
    logger.debug(`Cannot read the root version in ${cwd}, using the version of ${pkg.name}`)
  }

  if (!rootVersion || !semver.valid(pkg.version)) {
    return rootVersion || pkg.version
  }

  return semver.gt(rootVersion, pkg.version) ? rootVersion : pkg.version
}

async function resolveFromTagUnified({
  config,
  pkg,
  graduating,
  logLevel,
}: {
  config: ResolvedRelizyConfig
  pkg: ReadPackage
  graduating: boolean
  logLevel?: LogLevel
}): Promise<string> {
  // Determine if we should filter prerelease tags
  const filterPrereleases = shouldFilterPrereleaseTags(pkg.version, graduating)
  const onlyStable = graduating || filterPrereleases

  const lastRepoTag = await getLastRepoTag({
    pkg,
    onlyStable,
    tagBody: config.templates.tagBody,
    currentVersion: getRepoCurrentVersion({ cwd: config.cwd, pkg }),
    logLevel,
    cwd: config.cwd,
  })

  if (lastRepoTag) {
    return lastRepoTag
  }

  // For new sub-packages without compatible tags (e.g. a fresh package at 0.0.0
  // added to a repo whose existing tags are at higher majors), return the marker
  // so getPackageCommits can scope the diff to the package's own first commit.
  // Without this, getFirstCommit(repo) would make getGitDiff span the entire
  // repo history and overflow execSync's buffer (ENOBUFS) on large repos.
  const isRootPackage = pkg.path === config.cwd
  if (!isRootPackage) {
    logger.debug(`No compatible repo tag for new sub-package ${pkg.name}, marking as new package`)
    return NEW_PACKAGE_MARKER
  }

  return getFirstCommit(config.cwd)
}

async function resolveFromTag({
  config,
  versionMode,
  step,
  pkg,
  graduating,
  logLevel,
}: {
  config: ResolvedRelizyConfig
  versionMode?: VersionMode | 'standalone'
  step: Step
  pkg: ReadPackage
  graduating: boolean
  logLevel?: LogLevel
}) {
  let from: string

  if (versionMode === 'independent') {
    if (!pkg.name) {
      throw new Error('Package name is required for independent version mode')
    }

    from = await resolveFromTagIndependent({
      cwd: config.cwd,
      pkg,
      graduating,
      logLevel,
    })
  }
  else {
    from = await resolveFromTagUnified({
      config,
      pkg,
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
    pkg,
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
