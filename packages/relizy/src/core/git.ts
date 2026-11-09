import type { BumpResultTruthy, GroupBumpResult } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '@maz-ui/node'
import { createGitCommit, createGitTags, formatRepoTag, getGitStatus, getIndependentTag, hasLernaJson, isInCI, parseGitStatus, pushGitChanges, runGitSync } from '@relizy/core'
import { ensurePushAccess } from './ci'
import { loadRelizyConfig } from './config'
import { RelizyCancelError } from './errors'
import { DEFAULT_RELEASE_COMMIT_MESSAGES } from './format'
import { getRootGroupBumpResult } from './groups'
import { askConfirm } from './prompts'
import { getReleaseFiles, resetReleaseFiles, restoreReleaseFiles } from './release-files'
import { readPackageJson } from './repo'
import { executeHook, getHookContext } from './utils'

/** The files a release writes and commits */
const RELEASE_FILE_NAMES = new Set(['package.json', 'CHANGELOG.md', 'lerna.json'])

/**
 * With `--no-clean`, the uncommitted changes stay as they are. Relizy only
 * restores and commits the files it writes, but a file it writes (a
 * `package.json` it bumps, a `CHANGELOG.md`) is committed with the uncommitted
 * changes it contains, and `changelog.formatCmd` runs on the working directory.
 * Only the changes of these files are worth a warning: they go in the release
 * commit. They are confirmed in an interactive terminal outside of the CI (not
 * in dry-run, which writes nothing).
 */
export async function confirmDirtyGitStatus({ dryRun, cwd }: { dryRun: boolean, cwd: string }): Promise<void> {
  // Untrimmed: the first column of the first line is significant
  const changes = parseGitStatus(getGitStatus(cwd, false))

  if (changes.length === 0) {
    return
  }

  const describe = (files: typeof changes) => files.map(({ path, change }) => `${path} (${change})`).join(', ')
  const releaseFiles = changes.filter(({ path }) => RELEASE_FILE_NAMES.has(path.split('/').at(-1)!))

  logger.debug(`Uncommitted changes kept (--no-clean): ${describe(changes)}`)

  if (releaseFiles.length === 0) {
    return
  }

  logger.warn(`Uncommitted changes in files the release commits: ${describe(releaseFiles)}`)

  if (dryRun || isInCI() || !process.stdin.isTTY) {
    return
  }

  const cancelMessage = 'Release cancelled: commit or stash the changes of these files first'
  const confirmed = await askConfirm({ message: 'Commit these changes with the release?', initialValue: false, cancelMessage })

  if (!confirmed) {
    throw new RelizyCancelError(cancelMessage)
  }
}

/**
 * Get files modified in git status that are relevant for release
 * Returns only package.json, CHANGELOG.md, and lerna.json files
 */
function getModifiedReleaseFilePatterns({ config }: { config: ResolvedRelizyConfig }): string[] {
  // Get git status --porcelain output WITHOUT trimming to preserve format
  const gitStatusRaw = getGitStatus(config.cwd, false)

  if (!gitStatusRaw) {
    logger.debug('No modified files in git status')
    return []
  }

  // Parse git status output to get list of modified files
  // Format: "XY filename" where X=index status, Y=worktree status
  // We don't trim lines to preserve the 2-character status format
  const modifiedFiles = gitStatusRaw
    .split('\n')
    .filter(line => line.length > 0)
    .map((line) => {
      // Git status porcelain format: 2 status chars + space + filename
      // Example: " M package.json" or "M  file.txt" or "MM file.txt"
      if (line.length < 4)
        return null

      // Extract filename (everything after the 3rd character)
      const filename = line.substring(3).trim()
      return filename || null
    })
    .filter((file): file is string => file !== null)

  // Filter to only keep release-relevant files
  const releaseFiles = modifiedFiles.filter((file) => {
    const isPackageJson = file === 'package.json' || file.endsWith('/package.json')
    const isChangelog = file === 'CHANGELOG.md' || file.endsWith('/CHANGELOG.md')
    const isLerna = file === 'lerna.json'

    return isPackageJson || isChangelog || isLerna
  })

  logger.debug(`Found ${releaseFiles.length} modified release files:`, releaseFiles.join(', '))

  return releaseFiles
}

/**
 * Stage the release files: the files written by this run, or the modified
 * release files when they were written by another process
 */
function stageReleaseFiles({ config, dryRun }: { config: ResolvedRelizyConfig, dryRun?: boolean }): void {
  const releaseFiles = getReleaseFiles(config.cwd)
  const filePatternsToAdd = releaseFiles.length > 0
    ? releaseFiles
    : getModifiedReleaseFilePatterns({ config })

  logger.start('Start commit and tag')

  logger.debug('Adding files to git staging area...')
  for (const pattern of filePatternsToAdd) {
    if (pattern === 'lerna.json' && !hasLernaJson(config.cwd)) {
      logger.verbose(`Skipping lerna.json as it doesn't exist`)
      continue
    }

    if ((pattern === 'lerna.json' || pattern === 'CHANGELOG.md') && !existsSync(join(config.cwd, pattern))) {
      logger.verbose(`Skipping ${pattern} as it doesn't exist`)
      continue
    }

    if (dryRun) {
      logger.info(`[dry-run] git add ${pattern}`)
      continue
    }

    try {
      logger.debug(`git add ${pattern}`)
      runGitSync(['add', pattern], { cwd: config.cwd })
    }
    catch {
      // Ignore errors if pattern doesn't match any files
    }
  }
}

/**
 * The title and the body of the release commit, from the commit templates
 */
function getReleaseCommitMessage({
  config,
  bumpedPackages,
  newVersion,
  rootVersion,
  groups,
}: {
  config: ResolvedRelizyConfig
  bumpedPackages: BumpResultTruthy['bumpedPackages']
  newVersion?: string
  rootVersion?: string
  groups?: GroupBumpResult[]
}): { message: string, body?: string } {
  // With version groups, the commit is "independent" when no unified/selective group bumped
  const isIndependent = groups
    ? !getRootGroupBumpResult(groups)
    : config.monorepo?.versionMode === 'independent'

  const packageList = bumpedPackages?.map(pkg => getIndependentTag({ name: pkg.name, version: pkg.newVersion || pkg.version })).join(', ') || ''
  const packageNames = bumpedPackages?.map(pkg => pkg.name).join(', ') || ''
  const packageCount = bumpedPackages?.length ?? 0

  const versionForMessage = isIndependent
    ? packageList || 'unknown'
    : newVersion || 'unknown'

  const placeholders: Record<string, string> = {
    newVersion: versionForMessage,
    rootVersion: rootVersion || 'unknown',
    packageCount: String(packageCount),
    packageNames: packageNames || 'unknown',
    packageList: packageList || 'unknown',
  }

  const applyPlaceholders = (template: string): string => {
    let out = template
    for (const [key, value] of Object.entries(placeholders)) {
      out = out.replaceAll(`{{${key}}}`, value)
    }
    return out
  }

  const { title: titleTemplate, body: bodyTemplate } = getCommitTemplates({ config, groups, isIndependent })

  return {
    message: applyPlaceholders(titleTemplate),
    body: bodyTemplate
      ? applyPlaceholders(bodyTemplate)
      : undefined,
  }
}

/**
 * Create the annotated tags of the release, returns their names
 */
function createReleaseTags({ config, releaseTags, dryRun }: {
  config: ResolvedRelizyConfig
  releaseTags: ReleaseTag[]
  dryRun?: boolean
}): Promise<string[]> {
  return createGitTags({
    tags: releaseTags.map(({ name, version }) => ({
      name,
      message: config.templates?.tagMessage?.replaceAll('{{newVersion}}', version) || name,
    })),
    sign: config.signTags,
    dryRun,
    cwd: config.cwd,
    logger,
  })
}

export async function createCommitAndTags({
  config,
  noVerify,
  bumpedPackages,
  newVersion,
  groups,
  dryRun,
}: {
  config: ResolvedRelizyConfig
  noVerify: boolean
  bumpedPackages: BumpResultTruthy['bumpedPackages']
  newVersion?: string
  /**
   * Result of each version group, when `monorepo.groups` is set
   */
  groups?: GroupBumpResult[]
  dryRun?: boolean
}): Promise<string[]> {
  const internalConfig = config || await loadRelizyConfig()
  const hookContext = getHookContext(internalConfig, {
    bumped: true,
    bumpedPackages,
    newVersion,
    groups,
  })

  try {
    await executeHook('before:commit-and-tag', internalConfig, dryRun ?? false, hookContext)

    stageReleaseFiles({ config: internalConfig, dryRun })

    const rootPackage = readPackageJson(internalConfig.cwd)

    if (!rootPackage) {
      throw new Error('Failed to read root package.json')
    }

    newVersion = newVersion || rootPackage.version

    const { message: commitMessage, body: commitBody } = getReleaseCommitMessage({
      config: internalConfig,
      bumpedPackages,
      newVersion,
      rootVersion: rootPackage.version,
      groups,
    })

    await createGitCommit({
      message: commitMessage,
      body: commitBody,
      noVerify,
      dryRun,
      cwd: internalConfig.cwd,
      logger,
    })

    if (!dryRun) {
      resetReleaseFiles()
    }

    const createdTags = await createReleaseTags({
      config: internalConfig,
      releaseTags: getReleaseTags({
        config: internalConfig,
        bumpedPackages,
        newVersion,
        groups,
      }),
      dryRun,
    })

    logger.success('Commit and tag completed!')

    await executeHook('success:commit-and-tag', internalConfig, dryRun ?? false, hookContext)

    return createdTags
  }
  catch (error) {
    logger.error('Error committing and tagging:', error)

    await executeHook('error:commit-and-tag', internalConfig, dryRun ?? false, hookContext)

    throw error
  }
}

export async function pushCommitAndTags({
  config,
  dryRun,
  cwd,
  tags = [],
}: {
  config: ResolvedRelizyConfig
  dryRun: boolean
  cwd: string
  tags?: string[]
}) {
  logger.start('Start push changes and tags')

  await pushGitChanges({
    cwd,
    followTags: config.release.gitTag,
    noVerify: config.release.noVerify,
    dryRun,
    tags,
    // Checked before publishing by the safety checks, unless disabled: the GitLab token may be needed to push
    beforePush: () => ensurePushAccess({ config }),
    logger,
  })

  logger.success('Pushing changes and tags completed!')
}

/**
 * Default commit templates of the release commit. With version groups, they
 * depend on the groups that bumped: the title of the unified/selective mode
 * when its group bumped, the one of the independent mode otherwise, and the
 * list of the bumped packages as body when an independent group bumped.
 * Templates set by the user are kept.
 */
function getCommitTemplates({
  config,
  groups,
  isIndependent,
}: {
  config: ResolvedRelizyConfig
  groups?: GroupBumpResult[]
  isIndependent: boolean
}): { title: string, body?: string } {
  const { commitMessage, commitBody } = config.templates

  if (!groups || commitMessage !== undefined) {
    return {
      title: commitMessage ?? DEFAULT_RELEASE_COMMIT_MESSAGES.version,
      body: commitBody,
    }
  }

  const hasIndependentGroup = groups.some(group => group.versionMode === 'independent')

  return {
    title: isIndependent ? DEFAULT_RELEASE_COMMIT_MESSAGES.packages : DEFAULT_RELEASE_COMMIT_MESSAGES.version,
    body: commitBody ?? (hasIndependentGroup ? '{{packageList}}' : undefined),
  }
}

function getRepoTag({ config, version }: { config: ResolvedRelizyConfig, version?: string }): ReleaseTag[] {
  const tagName = version
    ? formatRepoTag(config.templates.tagBody, version)
    : undefined

  return tagName && version
    ? [
        { name: tagName, version },
      ]
    : []
}

function getPackageTags(bumpedPackages?: BumpResultTruthy['bumpedPackages']): ReleaseTag[] {
  return (bumpedPackages ?? [])
    .filter(pkg => pkg.newVersion)
    .map(pkg => ({
      name: getIndependentTag({ name: pkg.name, version: pkg.newVersion! }),
      version: pkg.newVersion!,
    }))
}

export interface ReleaseTag {
  name: string
  version: string
}

/**
 * Compute the git tags a release creates: one tag per package in independent
 * mode, the repository tag (`templates.tagBody`) otherwise. With version groups,
 * the tags of every group that bumped.
 */
export function getReleaseTags({
  config,
  bumpedPackages,
  newVersion,
  groups,
}: {
  config: ResolvedRelizyConfig
  bumpedPackages?: BumpResultTruthy['bumpedPackages']
  newVersion?: string
  groups?: GroupBumpResult[]
}): ReleaseTag[] {
  if (!config.release.gitTag) {
    return []
  }

  if (groups) {
    return groups.flatMap(group => group.versionMode === 'independent'
      ? getPackageTags(group.bumpedPackages)
      : getRepoTag({ config, version: group.newVersion }))
  }

  if (config.monorepo?.versionMode === 'independent') {
    return getPackageTags(bumpedPackages)
  }

  return getRepoTag({ config, version: newVersion || readPackageJson(config.cwd)?.version })
}

/**
 * Compute the git tag names a release will create, mirroring `createCommitAndTags`.
 */
export function getReleaseTagNames(options: Parameters<typeof getReleaseTags>[0]): string[] {
  return getReleaseTags(options).map(tag => tag.name)
}

/**
 * Restore the files written by the run (versions, changelogs, `lerna.json`) to
 * their content before the run, and remove the ones it created. The other files
 * of the working directory, and the uncommitted changes of the restored ones,
 * are left untouched. Used once a canary is published, or when the release
 * fails before its commit. Nothing to restore in dry-run, which writes nothing.
 */
// Async for the callers of the public API
// eslint-disable-next-line require-await
export async function rollbackModifiedFiles({
  config,
}: {
  config: ResolvedRelizyConfig
}): Promise<void> {
  const releaseFiles = getReleaseFiles(config.cwd)

  if (releaseFiles.length === 0) {
    logger.debug('No modified files to rollback')
    return
  }

  logger.debug(`Rolling back ${releaseFiles.length} file(s): ${releaseFiles.join(', ')}`)

  try {
    restoreReleaseFiles(config.cwd)
    logger.success(`Successfully rolled back ${releaseFiles.length} release file(s)`)
  }
  catch (error) {
    logger.error('Failed to rollback modified files automatically')
    logger.warn(`Please manually restore these files: ${releaseFiles.join(', ')}`)
    throw error
  }
}
