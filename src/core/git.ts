import type { LogLevel } from '@maz-ui/node'

import type { BumpResultTruthy, GitProvider } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execPromise, logger } from '@maz-ui/node'
import { loadRelizyConfig } from './config'
import { isAncestor, tagExists } from './git-refs'
import { hasLernaJson, readPackageJson } from './repo'
import { getIndependentTag } from './tags'
import { executeHook } from './utils'

export function getGitStatus(cwd?: string, trim = true) {
  const status = execSync('git status --porcelain', {
    cwd,
    encoding: 'utf8',
  })

  if (trim)
    return status.trim()

  return status
}

export function checkGitStatusIfDirty() {
  logger.debug('Checking git status')

  const dirty = getGitStatus()

  if (dirty) {
    logger.debug('git status:', `\n${dirty.trim().split('\n').map(line => line.trim()).join('\n')}`)

    const error = `Git status is dirty!\n\nPlease commit or stash your changes before bumping or use --no-clean flag. \n\nUnstaged files:\n\n ${dirty.trim()}`

    throw new Error(error)
  }
}

export async function fetchGitTags(cwd?: string): Promise<void> {
  logger.debug('Fetching git tags from remote')
  try {
    await execPromise('git fetch --tags', { cwd, noStderr: true, noStdout: true, noSuccess: true })
    logger.debug('Git tags fetched successfully')
  }
  catch (error) {
    logger.fail('Failed to fetch some git tags from remote (tags might already exist locally)', error)
    logger.info('Continuing with local tags')
  }
}

export function detectGitProvider(cwd: string = process.cwd()): GitProvider | null {
  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd,
      encoding: 'utf8',
    }).trim()

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

export function parseGitRemoteUrl(remoteUrl: string): { owner: string, repo: string } | null {
  const sshRegex = /git@[\w.-]+:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/
  const httpsRegex = /https?:\/\/[\w.-]+\/(.+?)\/([^/]+?)(?:\.git)?$/

  const sshMatch = remoteUrl.match(sshRegex)
  if (sshMatch) {
    return {
      owner: sshMatch[1]!,
      repo: sshMatch[2]!,
    }
  }

  const httpsMatch = remoteUrl.match(httpsRegex)
  if (httpsMatch) {
    return {
      owner: httpsMatch[1]!,
      repo: httpsMatch[2]!,
    }
  }

  return null
}

/**
 * Get files modified in git status that are relevant for release
 * Returns only package.json, CHANGELOG.md, and lerna.json files
 */
export function getModifiedReleaseFilePatterns({ config }: { config: ResolvedRelizyConfig }): string[] {
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

// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
export async function createCommitAndTags({
  config,
  noVerify,
  bumpedPackages,
  newVersion,
  dryRun,
  logLevel,
}: {
  config: ResolvedRelizyConfig
  noVerify: boolean
  bumpedPackages: BumpResultTruthy['bumpedPackages']
  newVersion?: string
  dryRun?: boolean
  logLevel: LogLevel
}): Promise<string[]> {
  const internalConfig = config || await loadRelizyConfig()

  try {
    await executeHook('before:commit-and-tag', internalConfig, dryRun ?? false)

    const filePatternsToAdd = getModifiedReleaseFilePatterns({ config: internalConfig })

    logger.start('Start commit and tag')

    logger.debug('Adding files to git staging area...')
    for (const pattern of filePatternsToAdd) {
      if (pattern === 'lerna.json' && !hasLernaJson(internalConfig.cwd)) {
        logger.verbose(`Skipping lerna.json as it doesn't exist`)
        continue
      }

      if ((pattern === 'lerna.json' || pattern === 'CHANGELOG.md') && !existsSync(join(internalConfig.cwd, pattern))) {
        logger.verbose(`Skipping ${pattern} as it doesn't exist`)
        continue
      }

      if (dryRun) {
        logger.info(`[dry-run] git add ${pattern}`)
        continue
      }

      try {
        logger.debug(`git add ${pattern}`)
        execSync(`git add ${pattern}`)
      }
      catch {
        // Ignore errors if pattern doesn't match any files
      }
    }

    const rootPackage = readPackageJson(internalConfig.cwd)

    if (!rootPackage) {
      throw new Error('Failed to read root package.json')
    }

    newVersion = newVersion || rootPackage.version

    const isIndependent = internalConfig.monorepo?.versionMode === 'independent'

    const packageList = bumpedPackages?.map(pkg => getIndependentTag({ name: pkg.name, version: pkg.newVersion || pkg.version })).join(', ') || ''
    const packageNames = bumpedPackages?.map(pkg => pkg.name).join(', ') || ''
    const packageCount = bumpedPackages?.length ?? 0

    const versionForMessage = isIndependent
      ? packageList || 'unknown'
      : newVersion || 'unknown'

    const placeholders: Record<string, string> = {
      newVersion: versionForMessage,
      rootVersion: rootPackage.version || 'unknown',
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

    const titleTemplate = internalConfig.templates.commitMessage ?? 'chore(release): bump version to {{newVersion}}'
    const bodyTemplate = internalConfig.templates.commitBody

    const commitMessage = applyPlaceholders(titleTemplate)
    const commitBody = bodyTemplate ? applyPlaceholders(bodyTemplate) : undefined

    const noVerifyFlag = (noVerify) ? '--no-verify ' : ''
    logger.debug(`No verify: ${noVerify}`)

    const bodyFlag = commitBody ? ` -m "${commitBody.replaceAll('"', '\\"')}"` : ''
    const fullCommitCmd = `git commit ${noVerifyFlag}-m "${commitMessage.replaceAll('"', '\\"')}"${bodyFlag}`

    if (dryRun) {
      logger.info(`[dry-run] ${fullCommitCmd}`)
    }
    else {
      logger.debug(`Executing: ${fullCommitCmd}`)
      await execPromise(fullCommitCmd, {
        logLevel,
        noStderr: true,
        noStdout: true,
        cwd: internalConfig.cwd,
      })
      logger.success(`Committed: ${commitMessage}${noVerify ? ' (--no-verify)' : ''}`)
    }

    const signTags = internalConfig.signTags ? '-s' : ''
    logger.debug(`Sign tags: ${internalConfig.signTags}`)
    const createdTags: string[] = []

    if (internalConfig.monorepo?.versionMode === 'independent' && bumpedPackages && bumpedPackages.length > 0 && internalConfig.release.gitTag) {
      logger.debug(`Creating ${bumpedPackages.length} independent package tags`)

      for (const pkg of bumpedPackages) {
        if (!pkg.newVersion) {
          continue
        }

        const tagName = getIndependentTag({ version: pkg.newVersion, name: pkg.name })
        const tagMessage = internalConfig.templates?.tagMessage
          ?.replaceAll('{{newVersion}}', pkg.newVersion)
          || tagName

        if (dryRun) {
          logger.info(`[dry-run] git tag ${signTags} -a ${tagName} -m "${tagMessage}"`)
        }
        else {
          const cmd = `git tag ${signTags} -a ${tagName} -m "${tagMessage}"`
          logger.debug(`Executing: ${cmd}`)
          // eslint-disable-next-line max-depth
          try {
            await execPromise(cmd, {
              logLevel,
              noStderr: true,
              noStdout: true,
              cwd: internalConfig.cwd,
            })
            logger.debug(`Tag created: ${tagName}`)
          }
          catch (error) {
            logger.error(`Failed to create tag ${tagName}:`, error)
            throw error
          }
        }
        createdTags.push(tagName)
      }

      logger.success(`Created ${createdTags.length} tags for independent packages, ${createdTags.join(', ')}`)
    }
    else if (internalConfig.release.gitTag) {
      const tagName = internalConfig.templates.tagBody
        ?.replaceAll('{{newVersion}}', newVersion)

      const tagMessage = internalConfig.templates?.tagMessage
        ?.replaceAll('{{newVersion}}', newVersion)
        || tagName

      if (dryRun) {
        logger.info(`[dry-run] git tag ${signTags} -a ${tagName} -m "${tagMessage}"`)
      }
      else {
        const cmd = `git tag ${signTags} -a ${tagName} -m "${tagMessage}"`
        logger.debug(`Executing: ${cmd}`)
        try {
          await execPromise(cmd, {
            logLevel,
            noStderr: true,
            noStdout: true,
            cwd: internalConfig.cwd,
          })
          logger.debug(`Tag created: ${tagName}`)
        }
        catch (error) {
          logger.error(`Failed to create tag ${tagName}:`, error)
          throw error
        }
      }

      createdTags.push(tagName)
    }

    logger.debug('Created Tags:', createdTags.join(', '))

    logger.success('Commit and tag completed!')

    await executeHook('success:commit-and-tag', internalConfig, dryRun ?? false)

    return createdTags
  }
  catch (error) {
    logger.error('Error committing and tagging:', error)

    await executeHook('error:commit-and-tag', internalConfig, dryRun ?? false)

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

const quietExec = { noStderr: true, noStdout: true, noSuccess: true, noError: true } as const

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

    const [{ stdout: remote }, { stdout: mergeRef }, { stdout: trackingRef }] = await Promise.all([
      execPromise(`git config --get branch.${branch}.remote`, { cwd, ...quietExec }),
      execPromise(`git config --get branch.${branch}.merge`, { cwd, ...quietExec }),
      execPromise('git rev-parse --symbolic-full-name @{upstream}', { cwd, ...quietExec }),
    ])

    if (!remote.trim() || !mergeRef.trim() || !trackingRef.trim()) {
      return null
    }

    return {
      remote: remote.trim(),
      mergeRef: mergeRef.trim(),
      trackingRef: trackingRef.trim(),
      name: trackingRef.trim().replace(/^refs\/remotes\//, ''),
    }
  }
  catch {
    return null
  }
}

async function fetchUpstream(upstream: GitUpstream, cwd: string): Promise<void> {
  await execPromise(`git fetch ${upstream.remote} +${upstream.mergeRef}:${upstream.trackingRef}`, { cwd, ...quietExec })
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

  const { stdout } = await execPromise(`git rev-list --count HEAD..${upstream.trackingRef}`, { cwd, ...quietExec })
  const missingCommits = Number.parseInt(stdout.trim(), 10) || 0

  if (missingCommits > 0) {
    throw new Error(
      `The current branch is behind "${upstream.name}" by ${missingCommits} commit(s): new commits were pushed while the release was running.\n`
      + 'Releasing now would publish packages whose release commit cannot be pushed.\n'
      + `Re-run the release from the latest commit of "${upstream.name}".`,
    )
  }

  logger.debug(`Branch is up to date with "${upstream.name}"`)
}

function isPushRejectedAsBehind(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const { message, stderr } = error as { message?: unknown, stderr?: unknown }
  const output = `${typeof message === 'string' ? message : ''}\n${typeof stderr === 'string' ? stderr : ''}`

  return output.includes('(non-fast-forward)') || output.includes('(fetch first)')
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
  command,
  tags,
  pushError,
  logLevel,
  cwd,
}: {
  config: ResolvedRelizyConfig
  command: string
  tags: string[]
  pushError: unknown
  logLevel?: LogLevel
  cwd: string
}): Promise<void> {
  const upstream = await getGitUpstream(cwd)

  if (!upstream) {
    throw pushError
  }

  logger.warn(`Push rejected: "${upstream.name}" received new commits during the release. Merging them into the release commit and retrying...`)

  try {
    await fetchUpstream(upstream, cwd)
    const noVerifyFlag = config.release.noVerify ? ' --no-verify' : ''
    await execPromise(`git merge --no-edit${noVerifyFlag} ${upstream.name}`, { cwd, ...quietExec })
  }
  catch (mergeError) {
    await execPromise('git merge --abort', { cwd, ...quietExec }).catch(() => {})

    if (tags.length > 0) {
      const tagRefs = tags.map(tag => `refs/tags/${tag}`).join(' ')
      await execPromise(`git push ${upstream.remote} ${tagRefs}`, { cwd, ...quietExec }).catch(() => {})
    }

    const recoverRef = tags[0] ?? 'HEAD'

    throw new Error(
      `Push rejected: "${upstream.name}" received new commits during the release, and they could not be merged automatically into the release commit.\n`
      + 'The packages are already published, but the release commit is not on the branch.\n'
      + `To recover, merge it manually: git fetch --tags && git merge ${recoverRef} && git push`,
      { cause: mergeError },
    )
  }

  await execPromise(command, { noStderr: true, noStdout: true, logLevel, cwd })

  logger.success(`Merged "${upstream.name}" into the release commit and pushed`)
}

export async function pushCommitAndTags({
  config,
  dryRun,
  logLevel,
  cwd,
  tags = [],
}: {
  config: ResolvedRelizyConfig
  dryRun: boolean
  logLevel?: LogLevel
  cwd: string
  tags?: string[]
}) {
  logger.start('Start push changes and tags')

  const command = config.release.gitTag ? 'git push --follow-tags' : 'git push'

  if (dryRun) {
    logger.info(`[dry-run] ${command}`)
  }
  else {
    logger.debug(`Executing: ${command}`)

    try {
      await execPromise(command, { noStderr: true, noStdout: true, noError: true, logLevel, cwd })
    }
    catch (error) {
      if (!isPushRejectedAsBehind(error)) {
        logger.error(`${command} failed`, error)
        throw error
      }

      await recoverRejectedPush({ config, command, tags, pushError: error, logLevel, cwd })
    }
  }

  logger.success('Pushing changes and tags completed!')
}

/**
 * Compute the git tag names a release will create, mirroring `createCommitAndTags`.
 */
export function getReleaseTagNames({
  config,
  bumpedPackages,
  newVersion,
}: {
  config: ResolvedRelizyConfig
  bumpedPackages?: BumpResultTruthy['bumpedPackages']
  newVersion?: string
}): string[] {
  if (!config.release.gitTag) {
    return []
  }

  if (config.monorepo?.versionMode === 'independent') {
    return (bumpedPackages ?? [])
      .filter(pkg => pkg.newVersion)
      .map(pkg => getIndependentTag({ name: pkg.name, version: pkg.newVersion! }))
  }

  const version = newVersion || readPackageJson(config.cwd)?.version
  const tagName = version ? config.templates.tagBody?.replaceAll('{{newVersion}}', version) : undefined

  return tagName ? [tagName] : []
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
 * Rollback modified files to their last committed state
 * Used when publish fails before commit/tag/push operations
 */
export async function rollbackModifiedFiles({
  config,
}: {
  config: ResolvedRelizyConfig
}): Promise<void> {
  const modifiedFiles = getModifiedReleaseFilePatterns({ config })

  if (modifiedFiles.length === 0) {
    logger.debug('No modified files to rollback')
    return
  }

  logger.debug(`Rolling back ${modifiedFiles.length} modified file(s)...`)
  logger.debug(`Files to rollback: ${modifiedFiles.join(', ')}`)

  try {
    const trackedFiles: string[] = []
    const untrackedFiles: string[] = []

    for (const file of modifiedFiles) {
      const filePath = join(config.cwd, file)
      if (!existsSync(filePath)) {
        continue
      }
      try {
        execSync(`git ls-files --error-unmatch "${file}"`, {
          cwd: config.cwd,
          encoding: 'utf8',
          stdio: 'pipe',
        })
        trackedFiles.push(file)
      }
      catch {
        untrackedFiles.push(file)
      }
    }

    if (trackedFiles.length > 0) {
      const fileList = trackedFiles.join(' ')
      logger.debug(`Restoring tracked files from HEAD: ${fileList}`)
      await execPromise(`git checkout HEAD -- ${fileList}`, {
        cwd: config.cwd,
        logLevel: config.logLevel,
        noStderr: true,
      })
    }

    for (const file of untrackedFiles) {
      logger.debug(`Removing untracked file: ${file}`)
      execSync(`rm "${join(config.cwd, file)}"`, { cwd: config.cwd })
    }

    logger.success(`Successfully rolled back ${trackedFiles.length + untrackedFiles.length} release file(s)`)
  }
  catch (error) {
    logger.error('Failed to rollback modified files automatically')
    logger.warn(`Please manually restore these files: ${modifiedFiles.join(', ')}`)
    throw error
  }
}

export function getFirstCommit(cwd: string): string {
  const result = execSync(
    'git rev-list --max-parents=0 HEAD',
    {
      cwd,
      encoding: 'utf8',
    },
  )
  return result.trim()
}

export function getCurrentGitBranch(cwd: string): string {
  const result = execSync('git rev-parse --abbrev-ref HEAD', {
    cwd,
    encoding: 'utf8',
  })

  return result.trim()
}

export function getCurrentGitRef(cwd: string): string {
  const branch = getCurrentGitBranch(cwd)
  return branch || 'HEAD'
}

export function getShortCommitSha(cwd: string, length = 7): string {
  return execSync(`git rev-parse --short=${length} HEAD`, { cwd, encoding: 'utf8' }).trim()
}
