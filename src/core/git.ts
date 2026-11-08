import type { BumpResultTruthy, GitProvider, GroupBumpResult } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '@maz-ui/node'
import { ensurePushAccess, isPushRejectedAsBehind } from './ci'
import { isInCI } from './ci-env'
import { loadRelizyConfig } from './config'
import { RelizyCancelError } from './errors'
import { DEFAULT_RELEASE_COMMIT_MESSAGES, formatRepoTag, plural } from './format'
import { cachedGitRead, clearGitCache } from './git-cache'
import { formatGitCommand, runGit, runGitSync, tryGit, tryGitSync } from './git-exec'
import { isAncestor, tagExists } from './git-refs'
import { getRootGroupBumpResult } from './groups'
import { askConfirm } from './prompts'
import { getReleaseFiles, resetReleaseFiles, restoreReleaseFiles } from './release-files'
import { hasLernaJson, readPackageJson } from './repo'
import { getIndependentTag } from './tags'
import { executeHook, getHookContext } from './utils'

export function getGitStatus(cwd?: string, trim = true) {
  return runGitSync(['status', '--porcelain'], { cwd, trim })
}

export function checkGitStatusIfDirty(cwd: string) {
  logger.debug('Checking git status')

  // Untrimmed: the first column of the first line is significant
  const changes = parseGitStatus(getGitStatus(cwd, false))

  if (changes.length > 0) {
    const names = changes.map(({ path, change }) => `${path} (${change})`)
    // Every file in the log, the first ones in the error
    logger.debug(`Uncommitted changes: ${names.join(', ')}`)
    const files = names.slice(0, 3).join(', ') + (names.length > 3
      ? `, and ${names.length - 3} more`
      : '')

    throw new Error(`Uncommitted changes: ${files}\nCommit or stash them first, or keep them with --no-clean.`)
  }
}

/**
 * Warn before a run with uncommitted changes (`--no-clean`), and ask for a
 * confirmation in an interactive terminal outside of the CI. Relizy only
 * restores and commits the files it writes, but a file it writes (a
 * `package.json` it bumps, a `CHANGELOG.md`) is committed with the uncommitted
 * changes it contains, and `changelog.formatCmd` runs on the working directory.
 * Nothing to confirm in dry-run, which writes nothing.
 */
const GIT_STATUS_LABELS: Record<string, string> = {
  '?': 'new',
  'A': 'added',
  'M': 'modified',
  'D': 'deleted',
  'R': 'renamed',
  'C': 'copied',
  'U': 'conflict',
}

/**
 * The uncommitted changes of `git status --porcelain`: the path of each file and what changed
 */
function parseGitStatus(status: string): { path: string, change: string }[] {
  return status.split('\n').filter(line => line.trim()).map((line) => {
    const code = line.slice(0, 2).trim()[0] ?? 'M'
    const path = line.slice(3).split(' -> ').at(-1)!.replace(/^"|"$/g, '')

    return { path, change: GIT_STATUS_LABELS[code] ?? 'changed' }
  })
}

/** The files a release writes and commits */
const RELEASE_FILE_NAMES = new Set(['package.json', 'CHANGELOG.md', 'lerna.json'])

/**
 * With `--no-clean`, the uncommitted changes stay as they are. Only the ones of
 * the files a release writes are worth a warning: they go in the release
 * commit. They are confirmed in an interactive terminal (not in dry-run).
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

export async function fetchGitTags(cwd?: string): Promise<void> {
  logger.debug('Fetching git tags from remote')
  try {
    await runGit(['fetch', '--tags'], { cwd })
    logger.debug('Git tags fetched successfully')
  }
  catch (error) {
    logger.fail('Failed to fetch some git tags from remote (tags might already exist locally)', error)
    logger.info('Continuing with local tags')
  }

  clearGitCache()
}

export function detectGitProvider(cwd: string = process.cwd()): GitProvider | null {
  try {
    const remoteUrl = runGitSync(['remote', 'get-url', 'origin'], { cwd })

    if (remoteUrl.includes('github.com')) {
      return 'github'
    }

    if (remoteUrl.includes('gitlab.com') || remoteUrl.includes('gitlab')) {
      return 'gitlab'
    }

    if (remoteUrl.includes('bitbucket.org') || remoteUrl.includes('bitbucket')) {
      return 'bitbucket'
    }

    return null
  }
  catch {
    return null
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
async function createReleaseTags({ config, releaseTags, dryRun }: {
  config: ResolvedRelizyConfig
  releaseTags: ReleaseTag[]
  dryRun?: boolean
}): Promise<string[]> {
  logger.debug(`Sign tags: ${config.signTags}`)
  const createdTags: string[] = []

  logger.debug(`Creating ${releaseTags.length} tag(s)`)

  for (const { name: tagName, version } of releaseTags) {
    const tagMessage = config.templates?.tagMessage
      ?.replaceAll('{{newVersion}}', version)
      || tagName

    const tagArgs = [
      'tag',
      ...(config.signTags
        ? ['-s']
        : []),
      '-a',
      tagName,
      '-m',
      tagMessage,
    ]

    if (dryRun) {
      logger.info(`[dry-run] ${formatGitCommand(tagArgs)}`)
    }
    else {
      logger.debug(`Executing: ${formatGitCommand(tagArgs)}`)
      try {
        await runGit(tagArgs, { cwd: config.cwd })
        clearGitCache()
        logger.debug(`Tag created: ${tagName}`)
      }
      catch (error) {
        logger.error(`Failed to create tag ${tagName}:`, error)
        throw error
      }
    }

    createdTags.push(tagName)
  }

  if (createdTags.length > 1) {
    logger.success(`Created ${createdTags.length} tags, ${createdTags.join(', ')}`)
  }

  logger.debug('Created Tags:', createdTags.join(', '))

  return createdTags
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

    logger.debug(`No verify: ${noVerify}`)

    const commitArgs = [
      'commit',
      ...(noVerify
        ? ['--no-verify']
        : []),
      '-m',
      commitMessage,
      ...(commitBody
        ? ['-m', commitBody]
        : []),
    ]

    if (dryRun) {
      logger.info(`[dry-run] ${formatGitCommand(commitArgs)}`)
    }
    else {
      logger.debug(`Executing: ${formatGitCommand(commitArgs)}`)
      await runGit(commitArgs, { cwd: internalConfig.cwd })
      clearGitCache()
      logger.success(`Committed: ${commitMessage}${noVerify ? ' (--no-verify)' : ''}`)
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

export interface GitUpstream {
  /** Remote name, e.g. `origin` */
  remote: string
  /** Remote branch ref, e.g. `refs/heads/main` */
  mergeRef: string
  /** Remote-tracking ref, e.g. `refs/remotes/origin/main` */
  trackingRef: string
  /** Short remote-tracking name, e.g. `origin/main` */
  name: string
}

/**
 * Resolve the upstream of the current branch. Returns null on a detached HEAD
 * or when the branch has no upstream configured.
 */
export async function getGitUpstream(cwd: string): Promise<GitUpstream | null> {
  try {
    const branch = getCurrentGitBranch(cwd)

    if (!branch || branch === 'HEAD') {
      return null
    }

    const [remote, mergeRef, trackingRef] = await Promise.all([
      runGit(['config', '--get', `branch.${branch}.remote`], { cwd }),
      runGit(['config', '--get', `branch.${branch}.merge`], { cwd }),
      runGit(['rev-parse', '--symbolic-full-name', '@{upstream}'], { cwd }),
    ])

    if (!remote || !mergeRef || !trackingRef) {
      return null
    }

    return {
      remote,
      mergeRef,
      trackingRef,
      name: trackingRef.replace(/^refs\/remotes\//, ''),
    }
  }
  catch {
    return null
  }
}

async function fetchUpstream(upstream: GitUpstream, cwd: string): Promise<void> {
  await runGit(['fetch', upstream.remote, `+${upstream.mergeRef}:${upstream.trackingRef}`], { cwd })
  clearGitCache()
}

/**
 * The current branch misses commits of its upstream branch, pushed after the
 * run started
 */
export class BranchBehindRemoteError extends Error {
  override name = 'BranchBehindRemoteError'

  constructor(readonly upstream: string, readonly missingCommits: number, inCI = isInCI()) {
    const commits = plural(missingCommits, 'commit')
    super(inCI
      ? `The current branch is behind "${upstream}" by ${commits}, pushed after this job checked out the branch: the release commit would not be pushed.\n`
      + `Fix: run the job again on the latest commit of "${upstream}".`
      : `The current branch is behind "${upstream}" by ${commits} that this checkout does not have: the release commit would not be pushed.\n`
        + 'Fix: get them with "git pull --rebase", then run the release again.')
  }
}

/**
 * Ensure the current branch contains every commit of its remote counterpart.
 *
 * A release commit created on a branch that is behind its remote can never be
 * pushed. Since packages are published before the push, running this check
 * right before publishing prevents shipping a version whose release commit is
 * then rejected (leaving an orphan tag and the repository stuck on the
 * previous version).
 *
 * Skipped (no error) on a detached HEAD, without upstream, or when the remote
 * cannot be fetched.
 */
export async function assertBranchUpToDateWithRemote({ cwd }: { cwd: string }): Promise<void> {
  const upstream = await getGitUpstream(cwd)

  if (!upstream) {
    logger.debug('No upstream branch configured, skipping remote sync check')
    return
  }

  try {
    await fetchUpstream(upstream, cwd)
  }
  catch (error) {
    logger.warn(`Could not fetch "${upstream.name}", skipping remote sync check`)
    logger.debug('Fetch error:', error)
    return
  }

  const count = await runGit(['rev-list', '--count', `HEAD..${upstream.trackingRef}`], { cwd })
  const missingCommits = Number.parseInt(count, 10) || 0

  if (missingCommits > 0) {
    throw new BranchBehindRemoteError(upstream.name, missingCommits)
  }

  logger.debug(`Branch is up to date with "${upstream.name}"`)
}

/**
 * Recover from a push rejected because the remote branch received new commits
 * after the release started: merge the remote branch into the release commit
 * and push again. A merge (not a rebase) keeps the tags on the exact commit
 * that was published, and keeps the concurrent commits out of the released
 * range so they show up in the next changelog.
 */
async function recoverRejectedPush({
  config,
  pushArgs,
  tags,
  pushError,
  cwd,
}: {
  config: ResolvedRelizyConfig
  pushArgs: string[]
  tags: string[]
  pushError: unknown
  cwd: string
}): Promise<void> {
  const upstream = await getGitUpstream(cwd)

  if (!upstream) {
    throw pushError
  }

  logger.warn(`Push rejected: "${upstream.name}" received new commits during the release. Merging them into the release commit and retrying...`)

  try {
    await fetchUpstream(upstream, cwd)
    await runGit([
      'merge',
      '--no-edit',
      ...(config.release.noVerify
        ? ['--no-verify']
        : []),
      upstream.name,
    ], { cwd })
    clearGitCache()
  }
  catch (mergeError) {
    await tryGit(['merge', '--abort'], { cwd })

    if (tags.length > 0) {
      await tryGit([
        'push',
        upstream.remote,
        ...tags.map(tag => `refs/tags/${tag}`),
      ], { cwd })
    }

    const recoverRef = tags[0] ?? 'HEAD'

    throw new Error(
      `Push rejected: "${upstream.name}" received new commits during the release, and they could not be merged automatically into the release commit.\n`
      + 'The packages are already published, but the release commit is not on the branch.\n'
      + `To recover, merge it manually: git fetch --tags && git merge ${recoverRef} && git push`,
      { cause: mergeError },
    )
  }

  await runGit(pushArgs, { cwd })

  logger.success(`Merged "${upstream.name}" into the release commit and pushed`)
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

  const pushArgs = config.release.gitTag
    ? ['push', '--follow-tags']
    : ['push']
  const command = formatGitCommand(pushArgs)

  if (dryRun) {
    logger.info(`[dry-run] ${command}`)
  }
  else {
    logger.debug(`Executing: ${command}`)

    // Checked before publishing by the safety checks, unless disabled: the GitLab token may be needed to push
    await ensurePushAccess({ config })

    try {
      await runGit(pushArgs, { cwd })
    }
    catch (error) {
      if (!isPushRejectedAsBehind(error)) {
        logger.error(`${command} failed`, error)
        throw error
      }

      await recoverRejectedPush({
        config,
        pushArgs,
        tags,
        pushError: error,
        cwd,
      })
    }
  }

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
 * Fail early when a tag the release is about to create already exists.
 *
 * This typically happens after a release that published its packages and
 * pushed its tag, but whose release commit was rejected: the branch is still
 * on the previous version, so the next run computes the same version again.
 */
export async function assertReleaseTagsAvailable({ tags, cwd }: { tags: string[], cwd: string }): Promise<void> {
  for (const tag of tags) {
    if (!(await tagExists(tag, cwd))) {
      continue
    }

    if (await isAncestor(tag, 'HEAD', cwd)) {
      throw new Error(`Tag "${tag}" already exists. Check the versions in your package.json files, they are behind the latest release.`)
    }

    throw new Error(
      `Tag "${tag}" already exists but is not part of the current branch history.\n`
      + 'A previous release most likely published this version and pushed its tag, but its release commit was never pushed to the branch.\n'
      + `To recover, merge the release commit, then re-run the release: git fetch --tags && git merge ${tag} && git push`,
    )
  }
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

export function getFirstCommit(cwd: string): string {
  return cachedGitRead({
    key: ['first-commit'],
    cwd,
    read: () => {
      return runGitSync(['rev-list', '--max-parents=0', 'HEAD'], { cwd })
    },
  })
}

export function getCurrentGitBranch(cwd: string): string {
  return cachedGitRead({
    key: ['current-branch'],
    cwd,
    read: () => {
      return runGitSync(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd })
    },
  })
}

export function getCurrentGitRef(cwd: string): string {
  const branch = getCurrentGitBranch(cwd)
  return branch || 'HEAD'
}

/**
 * The full hash of HEAD, undefined outside a git repository or before the first commit
 */
export function getHeadCommit(cwd: string): string | undefined {
  return tryGitSync(['rev-parse', 'HEAD'], { cwd }) || undefined
}

export function getShortCommitSha(cwd: string, length = 7): string {
  return runGitSync(['rev-parse', `--short=${length}`, 'HEAD'], { cwd })
}
