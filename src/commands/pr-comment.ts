import type { LogLevel } from '@maz-ui/node'
import type { ReleaseOverview, ResolvedRelizyConfig } from '../core'
import type { BumpResultTruthy, PrCommentMode, ReleaseContext } from '../types'
import { logger } from '@maz-ui/node'
import { collectPackageBumps, createCommandUi, detectPullRequest, extractVersionFromTag, filterOutPrivatePackages, filterPrivatePackagesUnlessIncluded, formatReleaseReportMarkdown, getCurrentGitBranch, getMonorepoPackagePatterns, getPrivatePackagesMode, getReleaseOverview, hasRepositoryVersion, loadRelizyConfig, postPrComment, PR_COMMENT_MARKER, readPackageJson, readPackages, withoutPrivatePackages } from '../core'
import { prepareCiRepository } from '../core/ci'
import { formatUtcDate } from '../core/format'
import { withGitCache } from '../core/git-cache'
import { recordLink, showPreview } from '../core/progress'

export interface PrCommentOptions {
  prNumber?: number
  dryRun?: boolean
  logLevel?: LogLevel
  configName?: string
  /** Pre-loaded config to avoid redundant config loading when called from release flow */
  config?: ResolvedRelizyConfig
  /** Release context passed from the release flow. When absent, standalone mode is used. */
  releaseContext?: ReleaseContext
}

interface CommentBodyParams {
  config: ResolvedRelizyConfig
  branch: string
  date: string
  releaseContext?: ReleaseContext
  /** Fallback packages for standalone CLI mode (no releaseContext) */
  packages?: Array<{ name: string, version: string, private: boolean }>
  /** Fallback root version for standalone CLI mode */
  rootVersion?: string
}

function getInstallCommand(packageManager?: string): string {
  switch (packageManager) {
    case 'pnpm': return 'pnpm add'
    case 'yarn': return 'yarn add'
    case 'bun': return 'bun add'
    default: return 'npm install'
  }
}

function formatTagsList(tags: string[]): string {
  return tags.map(t => `\`${t}\``).join(', ')
}

function buildMetadataLines({
  version,
  oldVersion,
  tags,
  distTag,
  date,
  branch,
}: {
  version?: string
  oldVersion?: string
  tags: string[]
  distTag?: string
  date: string
  branch: string
}): string[] {
  const lines: string[] = []

  if (version) {
    const versionChanged = oldVersion && oldVersion !== version
    lines.push(versionChanged
      ? `- **Version**: \`${oldVersion}\` → \`${version}\``
      : `- **Version**: \`${version}\``,
    )
  }

  if (tags.length > 0) {
    lines.push(`- **Tag(s)**: ${formatTagsList(tags)}`)
  }

  if (distTag && distTag !== 'latest') {
    lines.push(`- **Dist-tag**: \`${distTag}\``)
  }

  lines.push(`- **Date**: \`${date}\``)
  lines.push(`- **Branch**: \`${branch}\``)

  return lines
}

function buildPackageTableLines(
  bumpedPackages: BumpResultTruthy['bumpedPackages'],
  packages?: Array<{ name: string, version: string }>,
): string[] {
  const entries = collectPackageBumps({ bumpedPackages, packages })
  if (entries.length === 0) {
    return []
  }

  const lines = ['', '### Packages', '', '| Package | Version |', '| --- | --- |']
  for (const entry of entries) {
    lines.push(entry.hasTransition
      ? `| \`${entry.name}\` | \`${entry.oldVersion}\` → \`${entry.newVersion}\` |`
      : `| \`${entry.name}\` | \`${entry.version}\` |`,
    )
  }
  return lines
}

/**
 * One table per version group (its title, version and version mode), when
 * the release has several groups
 */
function buildGroupTableLines(overview: ReleaseOverview): string[] {
  return overview.groups.flatMap((group) => {
    const version = group.version ? ` \`${group.version}\`` : ''
    const lines = ['', `### ${group.title}${version} (${group.versionMode})`, '', '| Package | Version |', '| --- | --- |']

    for (const pkg of group.packages) {
      lines.push(pkg.oldVersion !== pkg.newVersion
        ? `| \`${pkg.name}\` | \`${pkg.oldVersion}\` → \`${pkg.newVersion}\` |`
        : `| \`${pkg.name}\` | \`${pkg.newVersion}\` |`)
    }

    return group.packages.length > 0 ? lines : lines.slice(0, 2)
  })
}

/**
 * The overview of a release of several version groups, with the packages the
 * comment lists (the private ones with `monorepo.privatePackages: 'release'` only)
 */
function getGroupsOverview(config: ResolvedRelizyConfig, bumpResult?: BumpResultTruthy): ReleaseOverview | undefined {
  if (!bumpResult?.groups || bumpResult.groups.length < 2) {
    return undefined
  }

  const overview = getReleaseOverview({ config, bumpResult })

  return config.monorepo?.privatePackages === 'release' ? overview : withoutPrivatePackages(overview)
}

function resolvePackageNames(
  bumpedPackages: BumpResultTruthy['bumpedPackages'],
  packages?: Array<{ name: string, version: string }>,
  projectName?: string,
): string[] {
  if (bumpedPackages.length > 0) {
    return bumpedPackages.map(p => p.name)
  }
  if (packages && packages.length > 0) {
    return packages.map(p => p.name)
  }
  if (projectName) {
    return [projectName]
  }
  return []
}

function buildInstallPackages({
  bumpedPackages,
  packages,
  version,
  rootPackageName,
}: {
  bumpedPackages: BumpResultTruthy['bumpedPackages']
  packages?: Array<{ name: string, version: string }>
  version?: string
  rootPackageName?: string
}): string[] {
  if (bumpedPackages.length > 0) {
    return bumpedPackages
      .filter(p => p.newVersion)
      .map(p => `${p.name}@${p.newVersion}`)
  }

  if (packages && packages.length > 0) {
    return packages.map(p => `${p.name}@${p.version}`)
  }

  if (rootPackageName && version) {
    return [`${rootPackageName}@${version}`]
  }

  return []
}

function buildInstallLines({
  installCmd,
  installPkgs,
  distTag,
  pkgNames,
}: {
  installCmd: string
  installPkgs: string[]
  distTag?: string
  pkgNames: string[]
}): string[] {
  if (installPkgs.length === 0) {
    return []
  }

  const lines: string[] = [
    '',
    '### Installation',
    '',
    '```bash',
    ...installPkgs.map(pkg => `${installCmd} ${pkg}`),
    '```',
  ]

  if (distTag && distTag !== 'latest' && pkgNames.length > 0) {
    const distTagPkgs = pkgNames.map(n => `${n}@${distTag}`)
    lines.push(
      '',
      `or using the \`${distTag}\` dist-tag:`,
      '',
      '```bash',
      ...distTagPkgs.map(pkg => `${installCmd} ${pkg}`),
      '```',
    )
  }

  return lines
}

/**
 * Install commands for the published packages only: private packages are
 * never published, so they never get one.
 */
function buildPublishedInstallLines({
  config,
  bumpedPackages,
  packages,
  version,
  distTag,
}: {
  config: ResolvedRelizyConfig
  bumpedPackages: BumpResultTruthy['bumpedPackages']
  packages?: Array<{ name: string, version: string, private: boolean }>
  version?: string
  distTag?: string
}): string[] {
  const publishedBumpedPackages = filterOutPrivatePackages(bumpedPackages)
  const publishedPackages = packages && filterOutPrivatePackages(packages)
  // The project name stands for a single-package repository only: never
  // fall back to it when the packages exist but are all private.
  const hasNoPackages = bumpedPackages.length === 0 && !packages?.length
  const rootPackageName = hasNoPackages ? config.projectName : undefined

  const installCmd = getInstallCommand(config.publish?.packageManager)
  const installPkgs = buildInstallPackages({ bumpedPackages: publishedBumpedPackages, packages: publishedPackages, version, rootPackageName })
  const pkgNames = resolvePackageNames(publishedBumpedPackages, publishedPackages, rootPackageName)

  return buildInstallLines({ installCmd, installPkgs, distTag, pkgNames })
}

function buildSuccessComment({
  config,
  branch,
  date,
  releaseContext,
  packages,
  rootVersion,
}: CommentBodyParams): string {
  const bumpResult = releaseContext?.bumpResult
  const privatePackages = getPrivatePackagesMode(config)
  const allBumpedPackages = bumpResult?.bumpedPackages ?? []
  const bumpedPackages = filterPrivatePackagesUnlessIncluded(allBumpedPackages, privatePackages)
  const listedPackages = packages && filterPrivatePackagesUnlessIncluded(packages, privatePackages)
  // Independent mode has no global version: each package has its own,
  // listed in the packages table below. Same with version groups when the
  // unified/selective group is not released.
  const version = hasRepositoryVersion(config, bumpResult) ? (bumpResult?.newVersion ?? rootVersion) : undefined
  const tags = releaseContext?.tags ?? []
  const isPublishing = config.release.publish !== false
  const distTag = isPublishing ? config.publish?.tag : undefined

  const lines: string[] = [PR_COMMENT_MARKER, '', '## 🚀 Release published', '']

  // Prefer the previous *released* version (from the resolved `fromTag`) over
  // the raw package.json version so a graduation shows `6.15.0 → 6.16.0` rather
  // than `6.16.0-beta.5 → 6.16.0`, consistent with the changelog and the
  // per-package table below.
  const previousVersion = extractVersionFromTag(bumpResult?.fromTag ?? '') || bumpResult?.oldVersion

  lines.push(...buildMetadataLines({
    version,
    oldVersion: previousVersion,
    tags,
    distTag,
    date,
    branch,
  }))

  const groupsOverview = getGroupsOverview(config, bumpResult)
  lines.push(...(groupsOverview ? buildGroupTableLines(groupsOverview) : buildPackageTableLines(bumpedPackages, listedPackages)))

  if (isPublishing) {
    lines.push(...buildPublishedInstallLines({ config, bumpedPackages: allBumpedPackages, packages, version, distTag }))
  }

  return lines.join('\n')
}

function buildNoReleaseComment({ branch, date }: CommentBodyParams): string {
  const lines: string[] = [
    PR_COMMENT_MARKER,
    '',
    '## ℹ️ Release: no new version',
    '',
    'No new version was published. There are no qualifying commits since the last release.',
    '',
    `- **Date**: \`${date}\``,
    `- **Branch**: \`${branch}\``,
  ]
  return lines.join('\n')
}

function buildFailedComment({ branch, date, releaseContext }: CommentBodyParams): string {
  const errorMsg = releaseContext?.error
  const lines: string[] = [
    PR_COMMENT_MARKER,
    '',
    '## ❌ Release failed',
    '',
    'The release process encountered an error.',
  ]

  if (errorMsg) {
    lines.push('', `**Error**: \`${errorMsg}\``)
  }

  lines.push(
    '',
    `- **Date**: \`${date}\``,
    `- **Branch**: \`${branch}\``,
  )
  return lines.join('\n')
}

export function buildCommentBody(params: CommentBodyParams): string {
  const report = params.releaseContext?.report
  if (report) {
    return `${PR_COMMENT_MARKER}\n\n${formatReleaseReportMarkdown(report)}`
  }

  const status = params.releaseContext?.status ?? 'success'
  switch (status) {
    case 'no-release':
      return buildNoReleaseComment(params)
    case 'failed':
      return buildFailedComment(params)
    default:
      return buildSuccessComment(params)
  }
}

export function prComment(options: PrCommentOptions = {}): Promise<boolean> {
  // One git cache for the run: the same refs and ranges are read for each package and each step
  return withGitCache(() => runPrComment(options))
}

async function runPrComment(options: PrCommentOptions = {}): Promise<boolean> {
  const dryRun = options.dryRun ?? false
  logger.debug(`Dry run: ${dryRun}`)

  const config = options.config ?? await loadRelizyConfig({
    configFile: options.configName,
    overrides: {
      logLevel: options.logLevel,
    },
  })

  const ui = createCommandUi({ title: 'relizy pr-comment', dryRun, logLevel: config.logLevel, cwd: config.cwd })

  try {
    // The CI clone: full history, branch, identity
    prepareCiRepository(config.cwd)

    const { posted, pr } = await ui.step({
      running: 'Commenting the pull request',
      done: ({ posted, pr }) => posted ? `Pull request${formatPrNumber(pr)} commented` : 'No pull request to comment',
      run: () => commentPullRequest({ config, options, dryRun }),
    })

    const number = formatPrNumber(pr)
    ui.complete(posted
      ? { message: `${dryRun ? 'Simulated comment on' : 'Commented'} the pull request${number}`, links: pr ? [{ label: number.trim(), url: pr.url }] : [] }
      : { message: 'No pull request to comment', nothing: true })

    return posted
  }
  catch (error) {
    ui.fail(error, 'PR comment')
    throw error
  }
}

function formatPrNumber(pr: { number: number } | undefined): string {
  return pr ? ` #${pr.number}` : ''
}

/**
 * Build the comment and post it on the pull request of the branch
 */
async function commentPullRequest({ config, options, dryRun }: {
  config: ResolvedRelizyConfig
  options: PrCommentOptions
  dryRun: boolean
}): Promise<{ posted: boolean, pr?: { number: number, url: string } }> {
  const branch = getCurrentGitBranch(config.cwd) ?? 'unknown'
  const date = formatUtcDate(new Date())

  // For standalone CLI (no releaseContext), read packages from disk as fallback
  let packages: Array<{ name: string, version: string, private: boolean }> = []
  let rootVersion: string | undefined

  if (!options.releaseContext) {
    const rootPackage = readPackageJson(config.cwd)
    if (!rootPackage) {
      throw new Error('Failed to read root package.json')
    }
    rootVersion = rootPackage.version

    const readPkgs = readPackages({
      cwd: config.cwd,
      patterns: getMonorepoPackagePatterns(config),
      ignored: config.monorepo?.ignored,
      privatePackages: config.monorepo?.privatePackages,
    })
    packages = readPkgs.map(pkg => ({ name: pkg.name, version: pkg.version, private: pkg.private }))
  }

  const body = buildCommentBody({
    config,
    branch,
    date,
    releaseContext: options.releaseContext,
    packages,
    rootVersion,
  })

  const pr = await detectPullRequest({
    config,
    prNumber: options.prNumber,
  })

  if (pr) {
    recordLink({ step: 'prComment', label: `#${pr.number}`, url: pr.url })
  }

  if (dryRun) {
    const mode: PrCommentMode = config.prComment.mode
    const prDisplay = pr ? `#${pr.number} (${pr.url})` : 'Not detected'
    const statusDisplay = options.releaseContext?.status ?? 'success'
    showPreview({ title: 'PR comment', meta: [`PR: ${prDisplay}`, `Mode: ${mode}`, `Status: ${statusDisplay}`], content: body })
    return { posted: true, ...(pr ? { pr } : {}) }
  }

  if (!pr) {
    logger.warn('No PR/MR detected. Use --pr-number to specify one manually.')
    return { posted: false }
  }

  return { posted: await postPrComment({ config, pr, body }), pr }
}

/**
 * Best-effort wrapper around {@link prComment} for the release flow: honours the
 * `--no-pr-comment` gate and swallows errors so a failed PR comment never aborts
 * an otherwise successful release.
 */
export async function tryPostPrComment({
  config,
  releaseContext,
  prNumber,
  dryRun,
}: {
  config: ResolvedRelizyConfig
  releaseContext: ReleaseContext
  prNumber?: number
  dryRun: boolean
}): Promise<boolean> {
  if (!config.release.prComment) {
    logger.info('Skipping PR comment (--no-pr-comment)')
    return false
  }

  try {
    return await prComment({
      prNumber,
      dryRun,
      config,
      releaseContext,
    })
  }
  catch (error) {
    logger.warn('PR comment posting failed:', error)
    return false
  }
}
