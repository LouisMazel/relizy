import type { BumpReleaseType, CommitTypes, CoreLogger, GitCommit } from './types'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatJson } from '@maz-ui/utils/helpers/formatJson'
import { getErrorMessage } from '@maz-ui/utils/helpers/getErrorMessage'
import * as semver from 'semver'

/**
 * True when a prerelease graduates to the stable release of the same base
 * version (`1.2.3-beta.1` to `1.2.3`)
 *
 * @param version - Current version.
 * @param newVersion - Next version.
 * @returns `true` when both have the same major, minor and patch, `version` is a prerelease and `newVersion` is not.
 * @example
 * ```ts
 * isGraduatingToStableBetweenVersion('1.2.3-beta.1', '1.2.3') // true
 * isGraduatingToStableBetweenVersion('1.2.3-beta.1', '1.3.0') // false
 * ```
 */
export function isGraduatingToStableBetweenVersion(version: string, newVersion: string): boolean {
  const isSameBase = semver.major(version) === semver.major(newVersion)
    && semver.minor(version) === semver.minor(newVersion)
    && semver.patch(version) === semver.patch(newVersion)

  const fromPrerelease = semver.prerelease(version) !== null
  const toStable = semver.prerelease(newVersion) === null

  return isSameBase && fromPrerelease && toStable
}

type SemverChangeType = 'major' | 'minor' | 'patch' | undefined

/**
 * When the current version is in the `0.x.y` range (initial development per
 * semver §4), breaking changes must not graduate to `1.0.0` automatically.
 * This helper downgrades an auto-detected `major` change to `minor` in that
 * case. Explicit CLI release types (major, premajor, ...) are NOT passed
 * through this function - only commit-based detection is capped.
 *
 * @param currentVersion - Current version, an unparsable one leaves the change as is.
 * @param detected - The change detected from the commits.
 * @returns `'minor'` when `detected` is `'major'` and the major of `currentVersion` is 0, `detected` otherwise.
 * @example
 * ```ts
 * capReleaseTypeForZeroMajor('0.4.2', 'major') // 'minor'
 * capReleaseTypeForZeroMajor('1.4.2', 'major') // 'major'
 * ```
 */
export function capReleaseTypeForZeroMajor(
  currentVersion: string,
  detected: SemverChangeType,
): SemverChangeType {
  if (detected !== 'major')
    return detected

  try {
    if (semver.major(currentVersion) === 0)
      return 'minor'
  }
  catch {
    return detected
  }

  return detected
}

/**
 * The biggest bump the commits trigger according to `types` (a breaking commit
 * is a major), undefined when none does. With `currentVersion`, a major of a
 * `0.x` version is capped to a minor unless `capZeroMajor` is `false`.
 *
 * @param commits - Commits of the release range.
 * @param types - The bump each commit type triggers (`semver` field); commits of an unknown type are ignored.
 * @param currentVersion - Current version, used for the `0.x` cap.
 * @param capZeroMajor - Cap a major of a `0.x` version to a minor (default `true`).
 * @returns `'major'`, `'minor'` or `'patch'`, `undefined` when no commit triggers a bump.
 * @example
 * ```ts
 * determineSemverChange(commits, { feat: { title: 'Features', semver: 'minor' }, fix: { title: 'Fixes', semver: 'patch' } }, '1.0.0')
 * // 'minor' when the commits are a feat and a fix
 * ```
 */
export function determineSemverChange(
  commits: GitCommit[],
  types: CommitTypes,
  currentVersion?: string,
  capZeroMajor = true,
): SemverChangeType {
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

  const detected: SemverChangeType = hasMajor
    ? 'major'
    : hasMinor
      ? 'minor'
      : hasPatch ? 'patch' : undefined

  if (currentVersion && capZeroMajor)
    return capReleaseTypeForZeroMajor(currentVersion, detected)

  return detected
}

function detectReleaseTypeFromCommits(
  commits: GitCommit[] | undefined,
  types: CommitTypes,
  currentVersion: string,
  capZeroMajor = true,
  breakingPeer = false,
): SemverChangeType {
  if (breakingPeer) {
    return capZeroMajor
      ? capReleaseTypeForZeroMajor(currentVersion, 'major')
      : 'major'
  }

  return determineSemverChange(commits ?? [], types, currentVersion, capZeroMajor)
}

function validatePrereleaseDowngrade(
  currentVersion: string,
  targetPreid: string | undefined,
  configuredType: BumpReleaseType,
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
  currentVersion: string,
  commits: GitCommit[] | undefined,
  types: CommitTypes,
  force: boolean,
  capZeroMajor: boolean,
  breakingPeer: boolean,
  logger?: CoreLogger,
): BumpReleaseType | undefined {
  if (!commits?.length && !breakingPeer && !force) {
    logger?.debug?.('No commits found for stable version with "release" type, skipping bump')
    return undefined
  }

  const detectedType = commits?.length || breakingPeer
    ? detectReleaseTypeFromCommits(commits, types, currentVersion, capZeroMajor, breakingPeer)
    : undefined

  if (!detectedType && !force) {
    logger?.debug?.('No significant commits found, skipping bump')
    return undefined
  }

  logger?.debug?.(`Auto-detected release type from commits: ${detectedType}`)
  return detectedType
}

function handleStableVersionWithPrereleaseType(
  currentVersion: string,
  commits: GitCommit[] | undefined,
  types: CommitTypes,
  force: boolean,
  capZeroMajor: boolean,
  breakingPeer: boolean,
  logger?: CoreLogger,
): BumpReleaseType | undefined {
  if (!commits?.length && !breakingPeer && !force) {
    logger?.debug?.('No commits found for stable version with "prerelease" type, skipping bump')
    return undefined
  }

  const detectedType = commits?.length || breakingPeer
    ? detectReleaseTypeFromCommits(commits, types, currentVersion, capZeroMajor, breakingPeer)
    : undefined

  if (!detectedType) {
    logger?.debug?.('No significant commits found, using prepatch as default')
    return 'prepatch'
  }

  const prereleaseType = `pre${detectedType}` as BumpReleaseType
  logger?.debug?.(`Auto-detected prerelease type from commits: ${prereleaseType}`)
  return prereleaseType
}

function getSemverRank(type: 'major' | 'minor' | 'patch' | undefined): number {
  switch (type) {
    case 'major': return 3
    case 'minor': return 2
    case 'patch': return 1
    default: return 0
  }
}

function getImpliedBumpFromPrerelease(version: string): 'major' | 'minor' | 'patch' {
  const patch = semver.patch(version)
  const minor = semver.minor(version)

  if (patch > 0)
    return 'patch'
  if (minor > 0)
    return 'minor'
  return 'major'
}

/**
 * Stable version of a prerelease (`release` type): its base version
 * (`1.13.1-beta.0` gives `1.13.1`), unless the commits imply a bigger bump
 * than the base: a `feat` on a patch-level base gives `1.14.0`.
 */
function handlePrereleaseVersionToStable(
  { currentVersion, commits, types, capZeroMajor, breakingPeer, logger }: {
    currentVersion: string
    commits: GitCommit[] | undefined
    types: CommitTypes
    capZeroMajor: boolean
    breakingPeer: boolean
    logger?: CoreLogger
  },
): BumpReleaseType {
  const detectedType = detectReleaseTypeFromCommits(commits, types, currentVersion, capZeroMajor, breakingPeer)
  const impliedBump = getImpliedBumpFromPrerelease(currentVersion)

  if (getSemverRank(detectedType) > getSemverRank(impliedBump)) {
    logger?.debug?.(`Graduating from prerelease ${currentVersion}: commits imply ${detectedType} bump, bigger than its ${impliedBump}-level base`)
    return detectedType!
  }

  logger?.debug?.(`Graduating from prerelease ${currentVersion} to stable release`)
  return 'release'
}

function handlePrereleaseVersionWithPrereleaseType(
  { currentVersion, preid, commits, force, types, capZeroMajor, breakingPeer, logger }: {
    currentVersion: string
    preid: string | undefined
    commits: GitCommit[] | undefined
    force: boolean
    types: CommitTypes
    capZeroMajor: boolean
    breakingPeer: boolean
    logger?: CoreLogger
  },
): BumpReleaseType | undefined {
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

  if (!commits?.length && !breakingPeer && !force) {
    logger?.debug?.('No commits found for prerelease version, skipping bump')
    return undefined
  }

  if (commits?.length || breakingPeer) {
    const detectedType = detectReleaseTypeFromCommits(commits, types, currentVersion, capZeroMajor, breakingPeer)
    const impliedBump = getImpliedBumpFromPrerelease(currentVersion)
    const detectedRank = getSemverRank(detectedType)
    const impliedRank = getSemverRank(impliedBump)

    if (detectedRank > impliedRank) {
      const prereleaseType = `pre${detectedType}` as BumpReleaseType
      logger?.debug?.(`Commits imply ${detectedType} bump, upgrading prerelease base from ${impliedBump}-level to ${prereleaseType}`)
      return prereleaseType
    }
  }

  logger?.debug?.(`Incrementing prerelease version: ${currentVersion}`)
  return 'prerelease'
}

function handleExplicitReleaseType({
  releaseType,
  currentVersion,
  logger,
}: {
  releaseType: BumpReleaseType
  currentVersion: string
  logger?: CoreLogger
}): BumpReleaseType {
  const isCurrentPrerelease = isPrerelease(currentVersion)
  const isGraduatingToStable = isCurrentPrerelease && isStableReleaseType(releaseType)

  if (isGraduatingToStable) {
    logger?.debug?.(`Graduating from prerelease ${currentVersion} to stable with type: ${releaseType}`)
  }
  else {
    logger?.debug?.(`Using explicit release type: ${releaseType}`)
  }

  return releaseType
}

/**
 * The semver release type of a bump. The `releaseType` asked for is used as is
 * (`force`, or an explicit type such as `minor`); `release` and `prerelease` are
 * computed from the commits, the version being a prerelease or not (see
 * `determineSemverChange`). Undefined when nothing requires a bump. Throws for
 * a `release` type with a `preid`, and for a prerelease that cannot be
 * upgraded. Pure: reads no file nor git.
 *
 * Resolution of `release` and `prerelease` (without `force`):
 * - stable version + `release`: the bump the commits trigger (`major`, `minor`, `patch`), `undefined` when there is no commit or none triggers a bump;
 * - stable version + `prerelease`: `pre` + the bump the commits trigger (`preminor`...), `prepatch` when none triggers one, `undefined` without commit;
 * - prerelease version + `release`: `release` (graduates to the base version), or the bigger bump the commits imply than the base of the prerelease (a `feat` on `1.2.1-beta.0` gives `minor`); never `undefined`;
 * - prerelease version + `prerelease`: `prerelease` to increment, or `pre` + the bump when the commits imply a bigger bump than the base, `undefined` without commit; a different `preid` always gives `prerelease`.
 *
 * @param options - Version, commits and release type.
 * @param options.currentVersion - Version before the bump.
 * @param options.commits - Commits of the release range; none and no `breakingPeer` or `force` means no bump (except a prerelease graduating with `release`).
 * @param options.releaseType - Release type asked for: `release` and `prerelease` are resolved from the commits, any other is used as is.
 * @param options.preid - Prerelease identifier (`beta`...), not allowed with a `release` type.
 * @param options.types - The bump each commit type triggers.
 * @param options.force - Use `releaseType` whatever the commits (the `release` with `preid` and prerelease downgrade checks still apply).
 * @param options.capZeroMajor - A breaking change of a `0.x` version bumps the minor, not the major (default `true`).
 * @param options.breakingPeer - A peer dependency makes a breaking change the published range does not accept: bump as for a breaking commit (default `false`).
 * @param options.logger - Receives debug messages about the choice.
 * @returns The release type to apply, `undefined` when nothing requires a bump.
 * @throws When `releaseType` is `release` with a `preid`, when a `prerelease` cannot upgrade the current prerelease (preid change or downgrade).
 * @example
 * ```ts
 * determineReleaseType({
 *   currentVersion: '1.2.0',
 *   commits,
 *   releaseType: 'release',
 *   preid: undefined,
 *   types: { feat: { title: 'Features', semver: 'minor' } },
 *   force: false,
 * })
 * // 'minor' for a feat commit, undefined without commit
 * ```
 */
export function determineReleaseType({
  currentVersion,
  commits,
  releaseType,
  preid,
  types,
  force,
  capZeroMajor = true,
  breakingPeer = false,
  logger,
}: {
  currentVersion: string
  commits?: GitCommit[]
  releaseType: BumpReleaseType
  preid: string | undefined
  /** The bump each commit type triggers */
  types: CommitTypes
  /** Use `releaseType` whatever the commits */
  force: boolean
  /** A breaking change of a `0.x` version bumps the minor, not the major (default `true`) */
  capZeroMajor?: boolean
  /**
   * A peer dependency of the package makes a breaking change its published
   * range does not accept: the package is bumped as for a breaking commit, its
   * consumers having to upgrade that dependency too.
   */
  breakingPeer?: boolean
  logger?: CoreLogger
}): BumpReleaseType | undefined {
  if (releaseType === 'release' && preid) {
    throw new Error('You cannot use a "release" type with a "preid", to use a preid you must use a "prerelease" type')
  }

  validatePrereleaseDowngrade(currentVersion, preid, releaseType)

  if (force) {
    logger?.debug?.(`Force flag enabled, using configured type: ${releaseType}`)
    return releaseType
  }

  const isCurrentPrerelease = isPrerelease(currentVersion)

  /**
   * Stable branch
   */
  if (!isCurrentPrerelease) {
    if (releaseType === 'release') {
      return handleStableVersionWithReleaseType(currentVersion, commits, types, force, capZeroMajor, breakingPeer, logger)
    }

    if (releaseType === 'prerelease') {
      return handleStableVersionWithPrereleaseType(currentVersion, commits, types, force, capZeroMajor, breakingPeer, logger)
    }

    return handleExplicitReleaseType({ releaseType, currentVersion, logger })
  }

  /**
   * Prerelease branch
   */
  if (releaseType === 'release') {
    return handlePrereleaseVersionToStable({
      currentVersion,
      commits,
      types,
      capZeroMajor,
      breakingPeer,
      logger,
    })
  }

  if (releaseType === 'prerelease') {
    return handlePrereleaseVersionWithPrereleaseType({
      currentVersion,
      preid,
      commits,
      force,
      types,
      capZeroMajor,
      breakingPeer,
      logger,
    })
  }

  return handleExplicitReleaseType({ releaseType, currentVersion, logger })
}

/**
 * Write a version to the `package.json` of a package directory (synchronous
 * file write). With `dryRun`, the file is read and validated but nothing is
 * written. Throws when the `package.json` cannot be read, parsed or written.
 *
 * @param pkgPath - Directory of the package, its `package.json` is rewritten with the formatted JSON and a trailing newline.
 * @param newVersion - Version to write, not validated.
 * @param options - Behaviour, optional.
 * @param options.dryRun - Read the file but do not write it (default `false`).
 * @param options.beforeWrite - Called with the path of the `package.json` just before it is written (not in a dry run).
 * @param options.logger - Receives debug messages.
 * @throws When the `package.json` cannot be read, parsed or written, with the original error as `cause`.
 * @example
 * ```ts
 * writeVersion('/repo/packages/my-lib', '1.3.0')
 * ```
 */
export function writeVersion(pkgPath: string, newVersion: string, { dryRun = false, beforeWrite, logger }: {
  dryRun?: boolean
  /** Called with the path of the `package.json` just before it is written (not in a dry run) */
  beforeWrite?: (packageJsonPath: string) => void
  logger?: CoreLogger
} = {}): void {
  const packageJsonPath = join(pkgPath, 'package.json')

  try {
    logger?.debug?.(`Writing ${newVersion} to ${pkgPath}`)

    const content = readFileSync(packageJsonPath, 'utf8')
    const packageJson = JSON.parse(content)

    const oldVersion = packageJson.version
    packageJson.version = newVersion

    if (dryRun) {
      logger?.debug?.(`[dry-run] Updated ${packageJson.name}: ${oldVersion} → ${newVersion}`)
      return
    }

    beforeWrite?.(packageJsonPath)
    writeFileSync(packageJsonPath, `${formatJson(packageJson)}\n`, 'utf8')
    logger?.debug?.(`Updated ${packageJson.name}: ${oldVersion} → ${newVersion}`)
  }
  catch (error) {
    throw new Error(`Unable to write version to ${packageJsonPath}: ${getErrorMessage(error)}`, { cause: error })
  }
}

/**
 * The version of a package after a bump of `releaseType`. With a `suffix`, the
 * last number of a prerelease version is replaced by it. Throws when the type
 * cannot be applied or does not give a greater version.
 *
 * @param options - Package and bump.
 * @param options.name - Package name, used in the messages.
 * @param options.currentVersion - Version before the bump.
 * @param options.releaseType - Release type to apply.
 * @param options.preid - Prerelease identifier for the prerelease types.
 * @param options.suffix - Replaces the last number of a prerelease version (`1.3.0-beta.0` with `suffix: 'abc'` gives `1.3.0-beta.abc`), only for the prerelease release types.
 * @param options.logger - Receives an info message when a prerelease graduates, and a debug one when the preid changes.
 * @returns The new version.
 * @throws When the type cannot be applied to the version, or the result is not greater than the current version.
 * @example
 * ```ts
 * getPackageNewVersion({ name: 'my-lib', currentVersion: '1.2.0', releaseType: 'minor', preid: undefined, suffix: undefined }) // '1.3.0'
 * getPackageNewVersion({ name: 'my-lib', currentVersion: '1.2.0', releaseType: 'preminor', preid: 'beta', suffix: undefined }) // '1.3.0-beta.0'
 * ```
 */
export function getPackageNewVersion({
  name,
  currentVersion,
  releaseType,
  preid,
  suffix,
  logger,
}: {
  name: string
  currentVersion: string
  releaseType: BumpReleaseType
  preid: string | undefined
  suffix: string | undefined
  logger?: CoreLogger
}): string {
  let newVersion = semver.inc(currentVersion, releaseType, preid as string)

  if (!newVersion) {
    throw new Error(`Unable to bump "${name}" version "${currentVersion}" with release type "${releaseType}"\n\nYou should use an explicit release type (use flag: --major, --minor, --patch, --premajor, --preminor, --prepatch, --prerelease)`)
  }

  if (isPrereleaseReleaseType(releaseType) && suffix) {
    // Replaces the last .X with .suffix
    newVersion = newVersion.replace(/\.(\d+)$/, `.${suffix}`)
  }

  const isValidVersion = semver.gt(newVersion, currentVersion)

  if (!isValidVersion) {
    throw new Error(`Unable to bump "${name}" version "${currentVersion}" to "${newVersion}", new version is not greater than current version`)
  }

  if (isGraduating(currentVersion, releaseType)) {
    logger?.info?.(`Graduating "${name}" from prerelease ${currentVersion} to stable ${newVersion}`)
  }

  if (isChangedPreid(currentVersion, preid)) {
    logger?.debug?.(`Graduating "${name}" from ${getPreid(currentVersion)} to ${preid}`)
  }

  return newVersion
}

/**
 * True when the version is a prerelease (`1.2.3-beta.0`)
 *
 * @param version - Version to test.
 * @returns `false` for a stable or an empty version.
 */
export function isPrerelease(version?: string): boolean {
  if (!version)
    return false

  const prerelease = semver.prerelease(version)
  return prerelease
    ? prerelease.length > 0
    : false
}

/**
 * True when the release type gives a stable version (`release`, `major`, `minor`, `patch`)
 *
 * @param releaseType - Release type to test.
 * @returns Whether it is one of the four stable types.
 */
export function isStableReleaseType(releaseType: BumpReleaseType): boolean {
  const stableTypes = ['release', 'major', 'minor', 'patch']
  return stableTypes.includes(releaseType)
}

/**
 * True when the release type gives a prerelease version (`prerelease`, `premajor`, `preminor`, `prepatch`)
 *
 * @param releaseType - Release type to test.
 * @returns Whether it is one of the four prerelease types.
 */
export function isPrereleaseReleaseType(releaseType: BumpReleaseType): boolean {
  const prereleaseTypes = [
    'prerelease',
    'premajor',
    'preminor',
    'prepatch',
  ]
  return prereleaseTypes.includes(releaseType)
}

/**
 * True when the release type graduates a prerelease version to a stable one
 *
 * @param currentVersion - Version before the bump.
 * @param releaseType - Release type to apply.
 * @returns `true` when the version is a prerelease and the type is stable.
 */
export function isGraduating(currentVersion: string, releaseType: BumpReleaseType): boolean {
  return isPrerelease(currentVersion) && isStableReleaseType(releaseType)
}

function getPreid(version: string): string | null {
  if (!version)
    return null

  const prerelease = semver.prerelease(version)
  if (!prerelease || prerelease.length === 0) {
    return null
  }

  return prerelease[0] as string
}

/**
 * True when the bump changes the prerelease identifier of a prerelease version (`beta` to `rc`)
 *
 * @param currentVersion - Version before the bump.
 * @param targetPreid - Prerelease identifier asked for.
 * @returns `false` without a target preid, for a stable version, or when the preid is the same.
 */
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

/**
 * Determines if prerelease tags should be filtered out when searching for tags.
 * Returns true when the current version is stable AND we're not graduating to stable.
 *
 * This prevents beta/prerelease tags from being used as the base for stable version bumps.
 *
 * @param currentVersion - Version before the bump.
 * @param graduating - The bump graduates a prerelease to a stable version.
 * @returns `true` when the prerelease tags must be ignored.
 *
 * @example
 * ```ts
 * shouldFilterPrereleaseTags('4.1.1', false) // true - stable version, not graduating
 * shouldFilterPrereleaseTags('4.1.1-beta.0', true) // false - graduating to stable
 * shouldFilterPrereleaseTags('4.1.1-beta.0', false) // false - prerelease version
 * ```
 */
export function shouldFilterPrereleaseTags(currentVersion: string, graduating: boolean): boolean {
  return !isPrerelease(currentVersion) && !graduating
}

/**
 * Extracts a semantic version from a git tag.
 * Supports multiple tag formats:
 * - `v1.2.3` gives `1.2.3`
 * - `1.2.3` gives `1.2.3`
 * - `package-name@1.2.3` gives `1.2.3`
 * - `v1.2.3-beta.0` gives `1.2.3-beta.0`
 *
 * The extracted text is not validated as semver when it follows an `@`.
 *
 * @param tag - The git tag to extract version from
 * @param packageName - Optional package name for independent mode tags (e.g., "pkg-name@1.2.3")
 * @returns The extracted version string or null if invalid
 *
 * @example
 * ```ts
 * extractVersionFromTag('v1.2.3') // '1.2.3'
 * extractVersionFromTag('@acme/ui@2.0.0') // '2.0.0'
 * extractVersionFromTag('release') // null
 * ```
 */
export function extractVersionFromTag(tag: string, packageName?: string): string | null {
  if (!tag) {
    return null
  }

  // For independent mode tags like "pkg-name@1.2.3"
  if (packageName) {
    const prefix = `${packageName}@`
    if (tag.startsWith(prefix)) {
      return tag.slice(prefix.length)
    }
  }

  // For tags with @ separator (e.g., "pkg@1.2.3")
  const atIndex = tag.lastIndexOf('@')
  if (atIndex !== -1) {
    return tag.slice(atIndex + 1)
  }

  // For tags with v prefix (e.g., "v1.2.3")
  if (tag.startsWith('v') && /^v\d/.test(tag)) {
    return tag.slice(1)
  }

  // For plain version tags (e.g., "1.2.3")
  if (/^\d+\.\d+\.\d+/.test(tag)) {
    return tag
  }

  return null
}

/**
 * Computes a canary version with format `{nextVersion}-0.{preid}-{sha}`. Throws when the next version cannot be computed.
 *
 * The leading numeric `0` prerelease identifier makes the canary sort below
 * every named prerelease (alpha, beta, rc...) and the stable release of the
 * same version, so it never matches a range like `^5.0.0-beta.0` and is never
 * suggested by update tools. Keeping preid and sha in a single identifier also
 * keeps the version valid when the sha is all digits with a leading zero.
 *
 * @param payload - The payload to compute the canary version from
 * @param payload.currentVersion - The current package version
 * @param payload.releaseType - The release type detected from commits (defaults to patch)
 * @param payload.preid - The pre-release identifier (default `canary`)
 * @param payload.sha - The short sha of the commit, appended as is
 * @returns The canary version
 * @throws When the next version cannot be computed from `currentVersion`
 *
 * @example
 * ```ts
 * getCanaryVersion({ currentVersion: '1.2.3', releaseType: 'minor', sha: 'a3f4b2c' }) // '1.3.0-0.canary-a3f4b2c'
 * getCanaryVersion({ currentVersion: '5.0.0-beta.44', releaseType: 'patch', sha: 'a3f4b2c' }) // '5.0.0-0.canary-a3f4b2c'
 * ```
 */
export function getCanaryVersion({
  currentVersion,
  releaseType,
  preid = 'canary',
  sha,
}: {
  currentVersion: string
  releaseType: 'major' | 'minor' | 'patch' | undefined
  preid?: string
  sha: string
}): string {
  const effectiveType = releaseType ?? 'patch'
  const nextStable = semver.inc(currentVersion, effectiveType)

  if (!nextStable) {
    throw new Error(`Unable to compute canary version from "${currentVersion}" with release type "${effectiveType}"`)
  }

  return `${nextStable}-0.${preid}-${sha}`
}

/**
 * Checks if a tag's version is compatible with the current version.
 * A tag is compatible if its major version is less than or equal to the current major version.
 *
 * This prevents accidentally using tags from future major versions (e.g., v5.0.0-beta.0)
 * when bumping a current stable version (e.g., 4.1.1 → 4.1.2).
 *
 * @param tagVersion - The version extracted from the tag
 * @param currentVersion - The current package version
 * @returns true if the tag version's major is <= current major version, false when a version cannot be parsed
 *
 * @example
 * ```ts
 * isTagVersionCompatibleWithCurrent('4.1.1', '4.1.0') // true - same major
 * isTagVersionCompatibleWithCurrent('5.0.0-beta.0', '4.1.1') // false - newer major
 * isTagVersionCompatibleWithCurrent('3.9.9', '4.1.1') // true - older major
 * ```
 */
export function isTagVersionCompatibleWithCurrent(tagVersion: string, currentVersion: string): boolean {
  try {
    const tagMajor = semver.major(tagVersion)
    const currentMajor = semver.major(currentVersion)

    return tagMajor <= currentMajor
  }
  catch {
    // If we can't parse the version, consider it incompatible
    return false
  }
}

/**
 * Release type of a package bumped only because one of its dependencies is
 * bumped: a patch (or the matching prerelease).
 *
 * @param currentVersion - Version of the dependent package before the bump.
 * @param releaseType - Release type of the dependency.
 * @returns `'patch'` for a stable dependency release, else `'prerelease'` when the package is a prerelease, `'prepatch'` otherwise.
 * @example
 * ```ts
 * getDependencyReleaseType('1.2.0', 'minor') // 'patch'
 * getDependencyReleaseType('1.2.0-beta.0', 'prerelease') // 'prerelease'
 * getDependencyReleaseType('1.2.0', 'preminor') // 'prepatch'
 * ```
 */
export function getDependencyReleaseType(currentVersion: string, releaseType: BumpReleaseType): BumpReleaseType {
  if (isStableReleaseType(releaseType))
    return 'patch'
  if (isPrerelease(currentVersion))
    return 'prerelease'
  return 'prepatch'
}
