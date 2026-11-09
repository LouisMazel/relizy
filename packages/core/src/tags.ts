import type { CoreLogger, ReadPackage } from './types'
import { readFileSync } from 'node:fs'
import { join, posix, relative, sep } from 'node:path'
import * as semver from 'semver'
import { formatRepoTag } from './format'
import { runGitSync } from './git-exec'
import { getCurrentGitRef, getFirstCommit, listTags, parseNameStatus } from './git-refs'
import { getPackageJsonHistory } from './moved-packages'
import { isPrerelease, isTagVersionCompatibleWithCurrent, shouldFilterPrereleaseTags } from './version'

/**
 * The tag of a package released independently: `name@version`
 *
 * @param options - Package name and version.
 * @param options.version - Version of the release.
 * @param options.name - Package name, scoped names included.
 * @returns The tag.
 * @example
 * ```ts
 * getIndependentTag({ name: '@acme/ui', version: '1.2.0' }) // '@acme/ui@1.2.0'
 * ```
 */
export function getIndependentTag({ version, name }: { version: string, name: string }) {
  return `${name}@${version}`
}

/**
 * The most recent tag of the repository (`--sort=-creatordate`), an empty string
 * without tag. Lists the tags with git: it does not filter by format, so a tag of
 * another package or a prerelease tag can be returned (see `resolveFromTag` for
 * the tag of the previous release of a package).
 *
 * @param options - Repository and logger.
 * @param options.cwd - Directory of the git repository (the current directory by default).
 * @param options.logger - Receives a debug message with the tag found.
 * @returns The tag name, `''` when the repository has no tag.
 * @example
 * ```ts
 * const lastTag = await getLastTag({ cwd: '/repo' }) // 'v1.2.0', or '' without tag
 * ```
 */
export async function getLastTag({ cwd, logger }: { cwd?: string, logger?: CoreLogger }): Promise<string> {
  const [lastTag = ''] = await listTags({ cwd })

  logger?.debug?.('Last tag:', lastTag || 'No tags found')

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
  return /^\d/.test(value)
    ? semver.valid(value)
    : null
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
 *
 * @param tag - Tag name.
 * @param tagBody - Template of the tags with `{{newVersion}}` for the version.
 * @returns The strict semver version (no leading `v` left over), `null` when the template has no `{{newVersion}}`, the tag does not match its prefix and suffix, or the rest is not a version.
 * @example
 * ```ts
 * extractVersionFromRepoTag('v1.2.3', 'v{{newVersion}}') // '1.2.3'
 * extractVersionFromRepoTag('pkg@1.2.3', 'v{{newVersion}}') // null
 * ```
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
  return parseTagVersion(tag.startsWith('v')
    ? tag.slice(1)
    : tag)
}

/**
 * Returns the version of a package tag (`name@1.2.3`, see `getIndependentTag`),
 * or null when the tag belongs to another package.
 */
function extractVersionFromPackageTag(tag: string, packageName: string): string | null {
  const prefix = `${packageName}@`

  return tag.startsWith(prefix)
    ? parseTagVersion(tag.slice(prefix.length))
    : null
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
  cwd,
  logger,
}: {
  tagBody?: string
  cwd?: string
  logger?: CoreLogger
}): Promise<{ tags: VersionedTag[], unrecognizedTags: string[] }> {
  const templateTags: VersionedTag[] = []
  const legacyTags: VersionedTag[] = []
  const unrecognizedTags: string[] = []

  for (const tag of await listTags({ cwd })) {
    const templateVersion = tagBody
      ? extractVersionFromRepoTag(tag, tagBody)
      : null

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

  logger?.debug?.(`Retrieved ${templateTags.length} repo tags following "${tagBody}" and ${legacyTags.length} in the v1.2.3 or 1.2.3 format`)

  return {
    tags: [
      ...templateTags,
      ...legacyTags,
    ],
    unrecognizedTags,
  }
}

/**
 * Returns the tags of a package released independently, with their version.
 */
async function getPackageTags({
  packageName,
  cwd,
  logger,
}: {
  packageName: string
  cwd?: string
  logger?: CoreLogger
}): Promise<VersionedTag[]> {
  const tags: VersionedTag[] = []

  for (const tag of await listTags({ pattern: `${packageName}@*`, cwd })) {
    const version = extractVersionFromPackageTag(tag, packageName)

    if (version) {
      tags.push({ tag, version })
    }
  }

  logger?.debug?.(`Retrieved ${tags.length} tags for package ${packageName}`)

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
  logger,
}: {
  tags: VersionedTag[]
  currentVersion: string
  maxVersion: string
  onlyStable: boolean
  label: string
  logger?: CoreLogger
}): string | null {
  const candidates = tags.filter(({ tag, version }) => {
    if (!isTagVersionCompatibleWithCurrent(version, currentVersion)) {
      logger?.debug?.(`Skipping tag ${tag}: version ${version} has higher major than current ${currentVersion}`)
      return false
    }

    if (semver.valid(maxVersion) && semver.gt(version, maxVersion)) {
      logger?.debug?.(`Skipping tag ${tag}: version ${version} is higher than ${maxVersion}`)
      return false
    }

    return true
  })

  const highest = (list: VersionedTag[]) => list.reduce<VersionedTag | null>(
    (best, candidate) => (!best || semver.gt(candidate.version, best.version)
      ? candidate
      : best),
    null,
  )

  if (onlyStable) {
    const stable = highest(candidates.filter(({ version }) => !isPrerelease(version)))

    if (stable) {
      logger?.debug?.(`Previous ${label} tag: ${stable.tag}`)
      return stable.tag
    }
  }

  const previous = highest(candidates)

  if (previous) {
    if (onlyStable) {
      logger?.info?.(`No stable ${label} tag found for version ${currentVersion}, falling back to last prerelease tag: ${previous.tag}`)
    }
    else {
      logger?.debug?.(`Previous ${label} tag: ${previous.tag}`)
    }

    return previous.tag
  }

  logger?.info?.(`No compatible ${label} tag found for version ${currentVersion}`)
  return null
}

/**
 * Warns once per repository and template about the tags that look like a
 * previous release but follow neither `templates.tagBody` nor `v1.2.3`.
 */
const warnedUnrecognizedTags = new Set<string>()

function warnUnrecognizedTags({ tags, tagBody, cwd, logger }: { tags: string[], tagBody?: string, cwd?: string, logger?: CoreLogger }) {
  const key = `${cwd}:${tagBody}`

  if (tags.length === 0 || warnedUnrecognizedTags.has(key)) {
    return
  }

  warnedUnrecognizedTags.add(key)

  logger?.warn?.(
    `No previous release tag follows templates.tagBody "${tagBody}", but some tags look like one (${tags.slice(0, 3).join(', ')}). `
    + 'If the template was changed, pass the tag of the previous release with --from.',
  )
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
  cwd,
  logger,
}: {
  pkg: ReadPackage
  onlyStable: boolean
  tagBody?: string
  maxVersion: string
  cwd?: string
  logger?: CoreLogger
}): Promise<string | null> {
  const { tags, unrecognizedTags } = await getRepoTags({ tagBody, cwd, logger })

  if (tags.length === 0) {
    logger?.info?.('No release tags found in repository')
    warnUnrecognizedTags({
      tags: unrecognizedTags,
      tagBody,
      cwd,
      logger,
    })
    return null
  }

  return selectPreviousTag({
    tags,
    currentVersion: pkg.version,
    maxVersion,
    onlyStable,
    label: 'repo',
    logger,
  })
}

/**
 * Gets the tag of the previous release of a package released independently:
 * its tags (see `getPackageTags`) are filtered and picked by `selectPreviousTag`.
 */
async function getLastPackageTagWithFiltering({
  pkg,
  onlyStable,
  cwd,
  logger,
}: {
  pkg: ReadPackage
  onlyStable: boolean
  cwd?: string
  logger?: CoreLogger
}): Promise<string | null> {
  const tags = await getPackageTags({ packageName: pkg.name, cwd, logger })

  if (tags.length === 0) {
    logger?.info?.(`No tags found for package ${pkg.name}`)
    return null
  }

  return selectPreviousTag({
    tags,
    currentVersion: pkg.version,
    maxVersion: pkg.version,
    onlyStable,
    label: `${pkg.name} package`,
    logger,
  })
}

/**
 * Special marker (`'__NEW_PACKAGE__'`) indicating this is a new package with no previous tags.
 * `resolveFromTag` and `findVersionCommit` return it instead of a ref: it is not
 * a git ref, so compare with it (`from === NEW_PACKAGE_MARKER`) and never pass
 * it to git. When this marker is returned as the "from" tag, getPackageCommits should
 * return an empty array instead of analyzing all commits from the beginning
 * of the repository (which would cause ENOBUFS errors on large repos).
 */
export const NEW_PACKAGE_MARKER = '__NEW_PACKAGE__' as const

function readPackageJsonAt({ ref, file, cwd }: { ref: string, file: string, cwd: string }): { name?: unknown, version?: unknown } | null {
  try {
    return JSON.parse(runGitSync(['show', `${ref}:${file}`], { cwd }))
  }
  catch {
    return null
  }
}

/**
 * Finds the release of the current version of a package that has no tag of
 * this version (released by the unified or selective group before joining an
 * independent one, by a previous config, by hand, or whose tag push failed):
 * the commit that set this version in its `package.json`, walking its history
 * back through the moves (detected by git or declared in `movedPackages`).
 *
 * Returns `NEW_PACKAGE_MARKER` when the package was created with this version
 * (a new `package.json`, or a copy or inexact rename of another package), or
 * null when the history does not tell (including when the version is not
 * committed yet). Runs `git` (`log`, `show`) synchronously and writes nothing.
 *
 * @param options - Package and repository.
 * @param options.name - Package name, the `package.json` must carry it.
 * @param options.version - Version whose release commit is looked for.
 * @param options.path - Directory of the package at `rev`, relative to the repository.
 * @param options.rev - Revision the history is read from (the checked out history by default).
 * @param options.cwd - Root of the repository.
 * @param options.movedPackages - Packages moved from a directory to another, `old path: new path`, for the moves git does not detect.
 * @returns The short hash of the commit that set the version, `NEW_PACKAGE_MARKER`, or `null`.
 * @example
 * ```ts
 * findVersionCommit({ name: 'my-lib', version: '1.2.0', path: 'packages/my-lib', cwd: '/repo' })
 * // 'a1b2c3d', NEW_PACKAGE_MARKER or null
 * ```
 */
export function findVersionCommit({
  name,
  version,
  path,
  rev,
  cwd,
  movedPackages: movedPackagesByPath,
}: {
  name: string
  version: string
  /** Directory of the package at `rev`, relative to the repository */
  path: string
  rev?: string
  /** Root of the repository */
  cwd: string
  /** Packages moved from a directory to another, `old path: new path`, for the moves git does not detect */
  movedPackages?: Record<string, string>
}): string | null {
  const movedPackages = Object.entries(movedPackagesByPath ?? {})

  for (const { shortHash, body } of getPackageJsonHistory(path, cwd, rev)) {
    const entry = parseNameStatus(body).find(({ paths }) => paths.at(-1) === `${path}/package.json`)

    if (!entry) {
      continue
    }

    const current = readPackageJsonAt({ ref: shortHash, file: `${path}/package.json`, cwd })

    // The version is not committed (e.g. written by the bump of the running release): the history does not tell
    if (current?.name !== name || current.version !== version) {
      return null
    }

    // A move git does not detect adds the `package.json` of the new directory
    const movedFrom = entry.status === 'A'
      ? movedPackages.find(([, to]) => to.replace(/\/$/, '') === path)?.[0].replace(/\/$/, '')
      : undefined
    const previousFile = entry.status === 'A'
      ? movedFrom && `${movedFrom}/package.json`
      : entry.paths[0]
    const previous = previousFile
      ? readPackageJsonAt({ ref: `${shortHash}~1`, file: previousFile, cwd })
      : null

    if (!previous || previous.name !== name) {
      return NEW_PACKAGE_MARKER
    }

    if (previous.version !== version) {
      return shortHash
    }

    path = posix.dirname(previousFile!)

    if (movedFrom) {
      return findVersionCommit({
        name,
        version,
        path,
        rev: `${shortHash}~1`,
        cwd,
        movedPackages: movedPackagesByPath,
      })
    }
  }

  return null
}

/**
 * Names a release commit found by `findVersionCommit` with its tag: the tag of
 * the package, or the repository tag of the version (`tagBody`, `v1.2.3` or
 * `1.2.3`), so the changelog title and the compare link show a version.
 * Falls back to the commit.
 */
function getVersionCommitRef({ hash, pkg, cwd, tagBody }: { hash: string, pkg: ReadPackage, cwd: string, tagBody?: string }): string {
  let tags: string[] = []

  try {
    tags = runGitSync(['tag', '--points-at', hash], { cwd }).split('\n').map(tag => tag.trim()).filter(Boolean)
  }
  catch {}

  const packageTag = getIndependentTag({ name: pkg.name, version: pkg.version })
  const repoTags = tags.filter(tag => ((tagBody && extractVersionFromRepoTag(tag, tagBody)) || extractVersionFromLegacyRepoTag(tag)) === pkg.version)

  return tags.find(tag => tag === packageTag)
    ?? repoTags.find(tag => tagBody && extractVersionFromRepoTag(tag, tagBody))
    ?? repoTags[0]
    ?? hash
}

async function resolveFromTagIndependent({
  cwd,
  pkg,
  graduating,
  movedPackages,
  tagBody,
  logger,
}: {
  cwd: string
  pkg: ReadPackage
  graduating: boolean
  movedPackages?: Record<string, string>
  tagBody?: string
  logger?: CoreLogger
}): Promise<string> {
  // Determine if we should filter prerelease tags
  const filterPrereleases = shouldFilterPrereleaseTags(pkg.version, graduating)
  const onlyStable = graduating || filterPrereleases

  const lastPackageTag = await getLastPackageTagWithFiltering({
    pkg,
    onlyStable,
    cwd,
    logger,
  })

  // A graduation starts at the last stable release, never at the prerelease of the current version
  const startsAtCurrentVersion = !(onlyStable && isPrerelease(pkg.version))

  if (startsAtCurrentVersion && lastPackageTag !== getIndependentTag({ name: pkg.name, version: pkg.version })) {
    const packagePath = relative(cwd, pkg.path).split(sep).join('/')
    const versionCommit = packagePath
      ? findVersionCommit({
          name: pkg.name,
          version: pkg.version,
          path: packagePath,
          cwd,
          movedPackages,
        })
      : null

    if (versionCommit === NEW_PACKAGE_MARKER) {
      logger?.debug?.(`${pkg.name} was created at ${pkg.version} and never tagged, marking as new package`)
      return NEW_PACKAGE_MARKER
    }

    if (versionCommit) {
      const ref = getVersionCommitRef({
        hash: versionCommit,
        pkg,
        cwd,
        tagBody,
      })
      logger?.debug?.(`No ${getIndependentTag({ name: pkg.name, version: pkg.version })} tag, ${pkg.name} starts at the release of its version: ${ref}`)
      return ref
    }
  }

  if (!lastPackageTag) {
    // For new packages without any tags, return a marker instead of the first commit.
    // This prevents ENOBUFS errors when getGitDiff tries to analyze all commits
    // from the beginning of a large repository.
    logger?.debug?.(`No tag found for package ${pkg.name}, marking as new package`)
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
function getRepoCurrentVersion({ cwd, pkg, logger }: { cwd: string, pkg: ReadPackage, logger?: CoreLogger }): string {
  let rootVersion: string | null = null

  try {
    rootVersion = semver.valid((JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as { version?: string }).version)
  }
  catch {
    logger?.debug?.(`Cannot read the root version in ${cwd}, using the version of ${pkg.name}`)
  }

  if (!rootVersion || !semver.valid(pkg.version)) {
    return rootVersion || pkg.version
  }

  return semver.gt(rootVersion, pkg.version)
    ? rootVersion
    : pkg.version
}

async function resolveFromTagUnified({
  cwd,
  pkg,
  graduating,
  tagBody,
  logger,
}: {
  cwd: string
  pkg: ReadPackage
  graduating: boolean
  tagBody?: string
  logger?: CoreLogger
}): Promise<string> {
  // Determine if we should filter prerelease tags
  const filterPrereleases = shouldFilterPrereleaseTags(pkg.version, graduating)
  const onlyStable = graduating || filterPrereleases

  const lastRepoTag = await getLastRepoTagWithFiltering({
    pkg,
    onlyStable,
    tagBody,
    // Version before the bump, when higher than `pkg.version` (e.g. the root version for a sub-package)
    maxVersion: getRepoCurrentVersion({ cwd, pkg, logger }),
    cwd,
    logger,
  })

  if (lastRepoTag) {
    return lastRepoTag
  }

  // For new sub-packages without compatible tags (e.g. a fresh package at 0.0.0
  // added to a repo whose existing tags are at higher majors), return the marker
  // so getPackageCommits can scope the diff to the package's own first commit.
  // Without this, getFirstCommit(repo) would make getGitDiff span the entire
  // repo history and overflow execSync's buffer (ENOBUFS) on large repos.
  const isRootPackage = pkg.path === cwd
  if (!isRootPackage) {
    logger?.debug?.(`No compatible repo tag for new sub-package ${pkg.name}, marking as new package`)
    return NEW_PACKAGE_MARKER
  }

  return getFirstCommit(cwd)
}

/**
 * The ref the commits of a package are read from: the tag of its previous
 * release.
 *
 * - With `independent`, the packages are tagged one by one (`name@1.2.3`): the
 *   last tag of the package, else the commit that set its current version, else
 *   `NEW_PACKAGE_MARKER` for a package never released.
 * - Otherwise the repository is tagged (`tagBody`, `v1.2.3`, `1.2.3`): the last
 *   repository tag, else `NEW_PACKAGE_MARKER` for a package that is not the root,
 *   else the first commit.
 *
 * Prerelease tags are skipped unless the version is a prerelease or is
 * `graduating` to a stable one.
 *
 * Reads git (tags, `package.json` history) and, without `independent`, the root
 * `package.json` version; writes nothing. Logs through `logger`, and warns once
 * per repository and template when no tag follows `tagBody` but some look like
 * a release.
 *
 * Throws when `independent` is set and the package has no name.
 *
 * @param options - Package and tagging mode.
 * @param options.cwd - Root of the repository.
 * @param options.pkg - The package, its current version is the upper bound of the tags considered.
 * @param options.independent - The packages are tagged independently, not the repository.
 * @param options.graduating - The package graduates from a prerelease to a stable version.
 * @param options.tagBody - Template of the tags of the repository, with `{{newVersion}}` for the version.
 * @param options.movedPackages - Packages moved from a directory to another, `old path: new path`.
 * @param options.logger - Receives debug and info messages about the tag choice.
 * @returns A tag, a commit, or `NEW_PACKAGE_MARKER` when there is no previous release to start from.
 * @throws When `independent` is set and the package has no name.
 * @example
 * ```ts
 * const from = await resolveFromTag({
 *   cwd: '/repo',
 *   pkg,
 *   independent: true,
 *   graduating: false,
 * })
 * // 'my-lib@1.1.0', a short hash, or NEW_PACKAGE_MARKER
 * ```
 */
// Stays async so that a missing package name rejects instead of throwing synchronously
// eslint-disable-next-line require-await
export async function resolveFromTag({
  cwd,
  pkg,
  independent,
  graduating,
  tagBody,
  movedPackages,
  logger,
}: {
  /** Root of the repository */
  cwd: string
  pkg: ReadPackage
  /** The packages are tagged independently, not the repository */
  independent: boolean
  /** The package graduates from a prerelease to a stable version */
  graduating: boolean
  /** Template of the tags of the repository, with `{{newVersion}}` for the version (`v{{newVersion}}`) */
  tagBody?: string
  /** Packages moved from a directory to another, `old path: new path`, for the moves git does not detect */
  movedPackages?: Record<string, string>
  logger?: CoreLogger
}): Promise<string> {
  if (independent) {
    if (!pkg.name) {
      throw new Error('Package name is required for independent version mode')
    }

    return resolveFromTagIndependent({
      cwd,
      pkg,
      graduating,
      movedPackages,
      tagBody,
      logger,
    })
  }

  return resolveFromTagUnified({
    cwd,
    pkg,
    graduating,
    tagBody,
    logger,
  })
}

/**
 * The ref the commits of a release end at. With `untagged`, or when the new
 * version is not known for a repository tag, the current ref: the release is
 * not tagged yet. Otherwise the tag of the new version: `name@version` with
 * `independent`, `tagBody` with the version else. With `independent`, throws
 * when the package name or the new version is missing.
 *
 * @param options - Release and tagging mode.
 * @param options.cwd - Root of the repository.
 * @param options.independent - The packages are tagged independently, not the repository.
 * @param options.untagged - The release is not tagged yet.
 * @param options.newVersion - Version of the release, required to name the tag of an independent package.
 * @param options.packageName - Name of the package, required to name its tag with `independent`.
 * @param options.tagBody - Template of the tags of the repository, with `{{newVersion}}` for the version.
 * @returns The current git ref or the tag name.
 * @throws When `independent` is set (and not `untagged`) without `packageName` or `newVersion`.
 * @example
 * ```ts
 * resolveToTag({ cwd: '/repo', independent: false, untagged: false, newVersion: '1.2.0', tagBody: 'v{{newVersion}}' }) // 'v1.2.0'
 * resolveToTag({ cwd: '/repo', independent: true, untagged: false, newVersion: '1.2.0', packageName: 'my-lib', tagBody: 'v{{newVersion}}' }) // 'my-lib@1.2.0'
 * ```
 */
export function resolveToTag({
  cwd,
  independent,
  untagged,
  newVersion,
  packageName,
  tagBody,
}: {
  /** Root of the repository */
  cwd: string
  /** The packages are tagged independently, not the repository */
  independent: boolean
  /** The release is not tagged yet */
  untagged: boolean
  /** Version of the release, required to name the tag of an independent package */
  newVersion?: string
  /** Name of the package, required to name its tag with `independent` */
  packageName?: string
  /** Template of the tags of the repository, with `{{newVersion}}` for the version */
  tagBody: string
}): string {
  if (untagged) {
    return getCurrentGitRef(cwd)
  }

  if (independent) {
    if (!packageName) {
      throw new Error('Package name is required for independent version mode')
    }

    if (!newVersion) {
      throw new Error('New version is required for independent version mode')
    }

    return getIndependentTag({ version: newVersion, name: packageName })
  }

  return newVersion
    ? formatRepoTag(tagBody, newVersion)
    : getCurrentGitRef(cwd)
}
