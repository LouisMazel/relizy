import type { GitCommit } from 'changelogen'
import type { ResolvedRelizyConfig } from '../core'
import type { PackageInfo } from '../types'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '@maz-ui/node'
import { getFirstCommit } from '../core'
import { generateMarkDown } from './markdown'
import { executeHook } from './utils'

/**
 * Check if a tag is the first commit in the repository
 */
function fromTagIsFirstCommit(fromTag: string, cwd: string) {
  return fromTag === getFirstCommit(cwd)
}

/**
 * Generate changelog for a specific package
 */
export async function generateChangelog(
  {
    pkg,
    commits,
    config,
    from,
    dryRun,
  }: {
    pkg: PackageInfo
    commits: GitCommit[]
    config: ResolvedRelizyConfig
    from: string
    dryRun: boolean
  },
) {
  let fromTag = config.from || (config.monorepo?.versionMode === 'independent' ? `${pkg.name}@${pkg.currentVersion}` : config.templates.tagBody.replace('{{newVersion}}', pkg.currentVersion)) || from

  const isFirstCommit = fromTagIsFirstCommit(fromTag, config.cwd)

  if (isFirstCommit) {
    fromTag = config.monorepo?.versionMode === 'independent' ? `${pkg.name}@0.0.0` : config.templates.tagBody.replace('{{newVersion}}', '0.0.0')
  }

  const toTag = config.to || (config.monorepo?.versionMode === 'independent' ? `${pkg.name}@${pkg.version}` : config.templates.tagBody.replace('{{newVersion}}', pkg.version))

  logger.debug(`Generating changelog for ${pkg.name} - from ${fromTag} to ${toTag}`)

  try {
    config = {
      ...config,
      from: fromTag,
      to: toTag,
    }

    const generatedChangelog = await generateMarkDown({
      commits,
      config,
      from: fromTag,
      to: toTag,
    })

    let changelog = generatedChangelog

    if (commits.length === 0) {
      changelog = `${changelog}\n\n${config.templates.emptyChangelogContent}`
    }

    const changelogResult = await executeHook('generate:changelog', config, dryRun, {
      commits,
      changelog,
    })

    changelog = changelogResult || changelog

    logger.verbose(`Output changelog for ${pkg.name}:\n${changelog}`)

    logger.debug(`Changelog generated for ${pkg.name} (${commits.length} commits)`)

    logger.verbose(`Final changelog for ${pkg.name}:\n\n${changelog}\n\n`)

    if (dryRun) {
      logger.info(`[dry-run] ${pkg.name} - Generate changelog ${fromTag}...${toTag}`)
    }

    return changelog
  }
  catch (error) {
    throw new Error(`Error generating changelog for ${pkg.name} (${fromTag}...${toTag}): ${error}`)
  }
}

/**
 * Write changelog to file
 */
export function writeChangelogToFile({
  pkg,
  changelog,
  dryRun = false,
}: {
  pkg: PackageInfo
  changelog: string
  dryRun: boolean
}) {
  const changelogPath = join(pkg.path, 'CHANGELOG.md')

  let existingChangelog = ''
  if (existsSync(changelogPath)) {
    existingChangelog = readFileSync(changelogPath, 'utf8')
  }

  const lines = existingChangelog.split('\n')
  const titleIndex = lines.findIndex(line => line.startsWith('# '))

  let updatedChangelog: string
  if (titleIndex !== -1) {
    const beforeTitle = lines.slice(0, titleIndex + 1)
    const afterTitle = lines.slice(titleIndex + 1)
    updatedChangelog = [...beforeTitle, '', changelog, '', ...afterTitle].join('\n')
  }
  else {
    const title = '# Changelog\n'
    updatedChangelog = `${title}\n${changelog}\n${existingChangelog}`
  }

  if (dryRun) {
    logger.info(`[dry-run] ${pkg.name} - Write changelog to ${changelogPath}`)
  }
  else {
    logger.debug(`Writing changelog to ${changelogPath}`)
    writeFileSync(changelogPath, updatedChangelog, 'utf8')
    logger.info(`Changelog updated for ${pkg.name}`)
  }
}
