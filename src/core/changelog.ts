import type { GitCommit } from 'changelogen'
import type { ResolvedRelizyConfig } from '../core'
import type { PackageBase, ReadPackage } from '../types'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { logger } from '@maz-ui/node'
import { getFirstCommit, getIndependentTag } from '../core'
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
    config,
    dryRun,
    newVersion,
  }: {
    pkg: {
      fromTag?: string
      name: string
      newVersion?: string
      commits: GitCommit[]
    }
    config: ResolvedRelizyConfig
    dryRun: boolean
    newVersion: string
  },
) {
  let fromTag = config.from
    || pkg.fromTag
    || getFirstCommit(config.cwd)

  const isFirstCommit = fromTagIsFirstCommit(fromTag, config.cwd)

  if (isFirstCommit) {
    fromTag = config.monorepo?.versionMode === 'independent' ? getIndependentTag({ version: '0.0.0', name: pkg.name }) : config.templates.tagBody.replace('{{newVersion}}', '0.0.0')
  }

  let toTag = config.to

  if (!toTag) {
    toTag = config.monorepo?.versionMode === 'independent'
      ? getIndependentTag({ version: newVersion, name: pkg.name })
      : config.templates.tagBody.replace('{{newVersion}}', newVersion)
  }

  if (!toTag) {
    throw new Error(`No tag found for ${pkg.name}`)
  }

  logger.debug(`Generating changelog for ${pkg.name} - from ${fromTag} to ${toTag}`)

  try {
    config = {
      ...config,
      from: fromTag,
      to: toTag,
    }

    const generatedChangelog = await generateMarkDown({
      commits: pkg.commits,
      config,
      from: fromTag,
      isFirstCommit,
      to: toTag,
    })

    let changelog = generatedChangelog

    if (pkg.commits.length === 0) {
      changelog = `${changelog}\n\n${config.templates.emptyChangelogContent}`
    }

    const changelogResult = await executeHook('generate:changelog', config, dryRun, {
      commits: pkg.commits,
      changelog,
    })

    changelog = changelogResult || changelog

    logger.verbose(`Output changelog for ${pkg.name}:\n${changelog}`)

    logger.debug(`Changelog generated for ${pkg.name} (${pkg.commits.length} commits)`)

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
  cwd,
  pkg,
  changelog,
  dryRun = false,
}: {
  cwd: string
  pkg: ReadPackage | PackageBase
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
    const relativeChangelogPath = relative(cwd, changelogPath)
    logger.info(`[dry-run] ${pkg.name} - Write changelog to ${relativeChangelogPath}`)
  }
  else {
    logger.debug(`Writing changelog to ${changelogPath}`)
    writeFileSync(changelogPath, updatedChangelog, 'utf8')
    logger.info(`Changelog updated for ${pkg.name} (${('newVersion' in pkg && pkg.newVersion) || pkg.version})`)
  }
}
