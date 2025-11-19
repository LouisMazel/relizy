import type { LogLevel } from '@maz-ui/node'

import type { ResolvedRelizyConfig } from '../core'
import type { BumpResultTruthy, GitProvider } from '../types'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execPromise, logger } from '@maz-ui/node'
import { getIndependentTag, hasLernaJson, loadRelizyConfig, readPackageJson } from '../core'
import { executeHook } from './utils'

export function getGitStatus(cwd?: string) {
  return execSync('git status --porcelain', {
    cwd,
    encoding: 'utf8',
  }).trim()
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

    return null
  }
  catch {
    return null
  }
}

export function parseGitRemoteUrl(remoteUrl: string): { owner: string, repo: string } | null {
  const sshRegex = /git@[\w.-]+:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/
  const httpsRegex = /https?:\/\/[\w.-]+\/([\w.-]+)\/([\w.-]+?)(?:\.git)?$/

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

    const filePatternsToAdd = [
      'package.json',
      'lerna.json',
      'CHANGELOG.md',
      '**/CHANGELOG.md',
      '**/package.json',
    ]

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

    const versionForMessage = internalConfig.monorepo?.versionMode === 'independent'
      ? bumpedPackages?.map(pkg => getIndependentTag({ name: pkg.name, version: pkg.newVersion || pkg.version })).join(', ') || 'unknown'
      : newVersion || 'unknown'

    const commitMessage = internalConfig.templates.commitMessage
      ?.replaceAll('{{newVersion}}', versionForMessage)
      || `chore(release): bump version to ${versionForMessage}`

    const noVerifyFlag = (noVerify) ? '--no-verify ' : ''
    logger.debug(`No verify: ${noVerify}`)

    if (dryRun) {
      logger.info(`[dry-run] git commit ${noVerifyFlag}-m "${commitMessage}"`)
    }
    else {
      logger.debug(`Executing: git commit ${noVerifyFlag}-m "${commitMessage}"`)
      await execPromise(`git commit ${noVerifyFlag}-m "${commitMessage}"`, {
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

export async function pushCommitAndTags({ config, dryRun, logLevel, cwd }: { config: ResolvedRelizyConfig, dryRun: boolean, logLevel?: LogLevel, cwd: string }) {
  logger.start('Start push changes and tags')

  const command = config.release.gitTag ? 'git push --follow-tags' : 'git push'

  if (dryRun) {
    logger.info(`[dry-run] ${command}`)
  }
  else {
    logger.debug(`Executing: ${command}`)

    await execPromise(command, { noStderr: true, noStdout: true, logLevel, cwd })
  }

  logger.success('Pushing changes and tags completed!')
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
