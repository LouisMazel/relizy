import type { GitCommit } from 'changelogen'
import type { PackageBase, ReadPackage } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { logger } from '@maz-ui/node'
import { getErrorMessage } from '@maz-ui/utils'
import { getCurrentGitRef, getFirstCommit } from './git'
import { buildChangelogBody, buildCompareLink, buildContributors } from './markdown'
import { getPackageCommits } from './repo'
import { getIndependentTag } from './tags'
import { executeHook } from './utils'

/**
 * Controls which sections of the rendered changelog are produced.
 * Each flag defaults to `true`. `compareLink` and `contributors` are
 * additionally suppressed when `minify: true` (see `generateChangelog`).
 */
export interface ChangelogInclude {
  title?: boolean
  compareLink?: boolean
  body?: boolean
  contributors?: boolean
}

interface ResolvedSections {
  title: boolean
  compareLink: boolean
  body: boolean
  contributors: boolean
}

function resolveSections(include?: ChangelogInclude): ResolvedSections {
  return {
    title: include?.title ?? true,
    compareLink: include?.compareLink ?? true,
    body: include?.body ?? true,
    contributors: include?.contributors ?? true,
  }
}

/**
 * Resolve the two flavours of refs a changelog needs:
 *
 * - `gitFromRef` / `gitToRef`: actual refs passed to `git log`. The release
 *   tag is created AFTER changelog generation, so by default `gitToRef`
 *   falls back to the current HEAD/SHA. `config.to` overrides that (CLI
 *   use case: re-render an old changelog between two existing tags).
 * - `displayFromTag` / `displayToTag`: pretty names rendered in the title
 *   and the compare link. Defaults to the templated future tag (e.g.
 *   `v1.5.0`) so users see the new version they're about to publish.
 *
 * For first-release scenarios (no prior tag), `displayFromTag` is
 * substituted with `v0.0.0` (or its independent-mode equivalent) so the
 * title and compare link still look meaningful.
 */
function resolveChangelogTags({
  pkg,
  config,
  newVersion,
}: {
  pkg: { name: string, fromTag?: string }
  config: ResolvedRelizyConfig
  newVersion: string
}): {
  gitFromRef: string
  gitToRef: string
  displayFromTag: string
  displayToTag: string
  isFirstCommit: boolean
} {
  const isIndependent = config.monorepo?.versionMode === 'independent'

  const gitFromRef = config.from
    || pkg.fromTag
    || getFirstCommit(config.cwd)

  const isFirstCommit = gitFromRef === getFirstCommit(config.cwd)

  const displayFromTag = isFirstCommit
    ? (isIndependent
        ? getIndependentTag({ version: '0.0.0', name: pkg.name })
        : config.templates.tagBody.replace('{{newVersion}}', '0.0.0'))
    : gitFromRef

  // The release tag does not exist yet at changelog time (it is created in
  // the commit & tag step). Use the current git ref for `git log` so the
  // diff resolves, while displaying the future templated tag in the title.
  const gitToRef = config.to || getCurrentGitRef(config.cwd)

  const displayToTag = config.to
    || (isIndependent
      ? getIndependentTag({ version: newVersion, name: pkg.name })
      : config.templates.tagBody.replace('{{newVersion}}', newVersion))

  if (!displayToTag) {
    throw new Error(`No tag found for ${pkg.name}`)
  }

  return { gitFromRef, gitToRef, displayFromTag, displayToTag, isFirstCommit }
}

function renderTitle({
  fromTag,
  toTag,
  config,
}: {
  fromTag: string
  toTag: string
  config: ResolvedRelizyConfig
}): string {
  const template = config.templates?.changelogTitle || '{{oldVersion}}...{{newVersion}}'
  const changelogTitle = template
    .replace('{{oldVersion}}', fromTag)
    .replace('{{newVersion}}', toTag)
    .replace('{{date}}', new Date().toISOString().split('T')[0] as string)
  return `## ${changelogTitle}`
}

async function renderChangelogParts({
  commits,
  config,
  fromTag,
  toTag,
  isFirstCommit,
  sections,
  minify,
  transformBody,
}: {
  commits: GitCommit[]
  config: ResolvedRelizyConfig
  fromTag: string
  toTag: string
  isFirstCommit: boolean
  sections: ResolvedSections
  minify?: boolean
  transformBody?: (body: string) => Promise<string> | string
}): Promise<string[]> {
  const parts: string[] = []

  if (sections.title) {
    parts.push(renderTitle({ fromTag, toTag, config }))
  }

  if (sections.compareLink && !minify) {
    const compareLink = buildCompareLink({ config, from: fromTag, to: toTag, isFirstCommit })
    if (compareLink) {
      parts.push(compareLink)
    }
  }

  if (sections.body) {
    let body = buildChangelogBody({ commits, config, minify })
    if (transformBody && body) {
      body = await transformBody(body)
    }
    if (body) {
      parts.push(body)
    }
  }

  if (sections.contributors && !minify) {
    const contributors = await buildContributors({ commits, config })
    if (contributors) {
      parts.push(contributors)
    }
  }

  return parts
}

function isFullChangelogOutput(sections: ResolvedSections, minify?: boolean): boolean {
  return !minify
    && sections.title
    && sections.compareLink
    && sections.body
    && sections.contributors
}

/**
 * Generate the changelog string for a single package.
 *
 * - Fetches commits internally using `changelog: true`, so types that only
 *   declare a `title` (e.g. `docs: { title: '📖 Documentation' }`) are
 *   included even though they don't trigger a version bump. Callers must
 *   provide `pkg.path` — `pkg.commits` is no longer consumed.
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
  const sections = resolveSections(include)
  const { gitFromRef, gitToRef, displayFromTag, displayToTag, isFirstCommit }
    = resolveChangelogTags({ pkg, config, newVersion })

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

    const parts = await renderChangelogParts({
      commits,
      config: displayConfig,
      fromTag: displayFromTag,
      toTag: displayToTag,
      isFirstCommit,
      sections,
      minify,
      transformBody,
    })

    let changelog = parts.filter(Boolean).join('\n\n').trim()

    const isFullOutput = isFullChangelogOutput(sections, minify)

    // The "no relevant changes" placeholder only belongs in the canonical
    // changelog file. Partial outputs (provider release notes, social
    // posts, body-only probes) must stay literally empty when there are no
    // commits, otherwise:
    //   - GitLab would skip its empty-release guard and publish empty releases
    //   - Social posts would see `hasContent=true` and post the placeholder
    if (commits.length === 0 && sections.body && isFullOutput) {
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
