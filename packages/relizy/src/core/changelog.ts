import type { ChangelogInclude } from '@relizy/core'
import type { PackageBase, ReadPackage } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { logger } from '@maz-ui/node'
import { getErrorMessage } from '@maz-ui/utils/helpers/getErrorMessage'
import { renderChangelog, resolveChangelogRange } from '@relizy/core'
import { reportProgress } from './progress'
import { recordReleaseFile } from './release-files'
import { getPackageCommits } from './repo'
import { executeHook } from './utils'

function isFullChangelogOutput(include: ChangelogInclude | undefined, minify?: boolean): boolean {
  return !minify
    && (include?.title ?? true)
    && (include?.compareLink ?? true)
    && (include?.body ?? true)
    && (include?.contributors ?? true)
}

/**
 * Generate the changelog string for a single package.
 *
 * - Fetches commits internally using `changelog: true`, so types that only
 *   declare a `title` (e.g. `docs: { title: '📖 Documentation' }`) are
 *   included even though they don't trigger a version bump. Callers must
 *   provide `pkg.path` - `pkg.commits` is no longer consumed.
 * - `include` toggles which sections appear in the output. `compareLink`
 *   and `contributors` are also skipped when `minify` is true.
 * - `transformBody` is invoked between body rendering and final assembly,
 *   used by provider releases to plug an AI rewrite step on the body only.
 */
export async function generateChangelog(
  {
    pkg,
    config,
    dryRun,
    newVersion,
    minify,
    include,
    transformBody,
  }: {
    pkg: {
      fromTag?: string
      name: string
      path: string
      newVersion?: string
    }
    config: ResolvedRelizyConfig
    dryRun: boolean
    newVersion: string
    minify?: boolean
    include?: ChangelogInclude
    transformBody?: (body: string) => Promise<string> | string
  },
) {
  const { gitFromRef, gitToRef, displayFromTag, displayToTag, compareFromRef, isFirstCommit }
    = resolveChangelogRange({
      pkg,
      cwd: config.cwd,
      newVersion,
      tagBody: config.templates.tagBody,
      independent: config.monorepo?.versionMode === 'independent',
      from: config.from,
      to: config.to,
      movedPackages: config.monorepo?.movedPackages,
      logger,
    })

  logger.debug(`Generating changelog for ${pkg.name} - git ${gitFromRef}..${gitToRef} - display ${displayFromTag}...${displayToTag}`)

  try {
    // `gitFromRef`/`gitToRef` drive `git log` (the release tag does not
    // exist yet). `displayFromTag`/`displayToTag` drive the title and the
    // compare link so users see the new version.
    const commits = await getPackageCommits({
      pkg: pkg as ReadPackage,
      from: gitFromRef,
      to: gitToRef,
      config: { ...config, from: gitFromRef, to: gitToRef },
      changelog: true,
      dryRun,
    })

    const displayConfig = { ...config, from: displayFromTag, to: displayToTag }

    let changelog = await renderChangelog({
      commits,
      from: displayFromTag,
      to: displayToTag,
      compareFrom: compareFromRef,
      isFirstCommit,
      cwd: config.cwd,
      types: config.types,
      repo: config.repo,
      includeCommitBody: config.changelog.includeCommitBody,
      noAuthors: config.noAuthors,
      excludeAuthors: config.excludeAuthors,
      hideAuthorEmail: config.hideAuthorEmail,
      titleTemplate: config.templates?.changelogTitle,
      include,
      minify,
      transformBody,
      onProgress: reportProgress,
    })

    const isFullOutput = isFullChangelogOutput(include, minify)

    // The "no relevant changes" placeholder only belongs in the canonical
    // changelog file. Partial outputs (provider release notes, social
    // posts, body-only probes) must stay literally empty when there are no
    // commits, otherwise:
    //   - GitLab would skip its empty-release guard and publish empty releases
    //   - Social posts would see `hasContent=true` and post the placeholder
    if (commits.length === 0 && (include?.body ?? true) && isFullOutput) {
      changelog = `${changelog}\n\n${displayConfig.templates.emptyChangelogContent}`
    }

    // Only fire the `generate:changelog` hook for "full" outputs (the
    // changelog file). Partial outputs used by provider releases / social
    // posts skip the hook to avoid surprising users with extra firings.
    if (isFullOutput) {
      const changelogResult = await executeHook('generate:changelog', displayConfig, dryRun, {
        commits,
        changelog,
      })
      changelog = changelogResult || changelog
    }

    logger.verbose(`Output changelog for ${pkg.name}:\n${changelog}`)
    logger.debug(`Changelog generated for ${pkg.name} (${commits.length} commits)`)
    logger.verbose(`Final changelog for ${pkg.name}:\n\n${changelog}\n\n`)

    if (dryRun) {
      logger.info(`[dry-run] ${pkg.name} - Generate changelog ${displayFromTag}...${displayToTag}`)
    }

    return changelog
  }
  catch (error) {
    throw new Error(`Error generating changelog for ${pkg.name}: ${getErrorMessage(error)}`, { cause: error })
  }
}

/**
 * Write changelog to file
 * @returns The path of the changelog, also in dry-run
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
}): string {
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
    updatedChangelog = [
      ...beforeTitle,
      '',
      changelog,
      '',
      ...afterTitle,
    ].join('\n')
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
    recordReleaseFile(changelogPath)
    writeFileSync(changelogPath, updatedChangelog, 'utf8')
    logger.info(`Changelog updated for ${pkg.name} (${('newVersion' in pkg && pkg.newVersion) || pkg.version})`)
  }

  return changelogPath
}
