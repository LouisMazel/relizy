import type { LogLevel } from '@maz-ui/node'
import type { ResolvedRelizyConfig } from '../core'
import type { BumpResultTruthy, PrCommentMode, ReleaseContext } from '../types'
import { logger } from '@maz-ui/node'
import { collectPackageBumps, detectPullRequest, extractVersionFromTag, filterOutPrivatePackages, filterPrivatePackagesUnlessIncluded, getCurrentGitBranch, loadRelizyConfig, postPrComment, PR_COMMENT_MARKER, readPackageJson, readPackages } from '../core'

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

function getFormattedDate(): string {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  const hours = String(now.getUTCHours()).padStart(2, '0')
  const minutes = String(now.getUTCMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes} UTC`
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
  const includePrivates = config.monorepo?.includePrivates
  const allBumpedPackages = bumpResult?.bumpedPackages ?? []
  const bumpedPackages = filterPrivatePackagesUnlessIncluded(allBumpedPackages, includePrivates)
  const listedPackages = packages && filterPrivatePackagesUnlessIncluded(packages, includePrivates)
  // Independent mode has no global version: each package has its own,
  // listed in the packages table below.
  const isIndependent = config.monorepo?.versionMode === 'independent'
  const version = isIndependent ? undefined : (bumpResult?.newVersion ?? rootVersion)
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

  lines.push(...buildPackageTableLines(bumpedPackages, listedPackages))

  if (isPublishing) {
    lines.push(...buildPublishedInstallLines({ config, bumpedPackages: allBumpedPackages, packages, version, distTag }))
  }

  return lines.join('\n')
}

function buildNoReleaseComment({ branch, date }: CommentBodyParams): string {
  const lines: string[] = [
    PR_COMMENT_MARKER,
    '',
    '## ℹ️ Release — no new version',
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

export async function prComment(options: PrCommentOptions = {}): Promise<boolean> {
  const dryRun = options.dryRun ?? false
  logger.debug(`Dry run: ${dryRun}`)

  const config = options.config ?? await loadRelizyConfig({
    configFile: options.configName,
    overrides: {
      logLevel: options.logLevel,
    },
  })

  const branch = getCurrentGitBranch(config.cwd) ?? 'unknown'
  const date = getFormattedDate()

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
      patterns: config.monorepo?.packages,
      ignorePackageNames: config.monorepo?.ignorePackageNames,
      ignored: config.monorepo?.ignored,
      includePrivates: config.monorepo?.includePrivates,
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

  if (dryRun) {
    const mode: PrCommentMode = config.prComment?.mode ?? 'append'
    const prDisplay = pr ? `#${pr.number} (${pr.url})` : 'Not detected'
    const statusDisplay = options.releaseContext?.status ?? 'success'
    logger.box(
      `[dry-run] PR Comment Preview\n\nPR: ${prDisplay}\nMode: ${mode}\nStatus: ${statusDisplay}\n\n${body}`,
    )
    return true
  }

  if (!pr) {
    logger.warn('No PR/MR detected. Use --pr-number to specify one manually.')
    return false
  }

  return await postPrComment({ config, pr, body })
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
  logLevel,
  configName,
}: {
  config: ResolvedRelizyConfig
  releaseContext: ReleaseContext
  prNumber?: number
  dryRun: boolean
  logLevel?: string
  configName?: string
}): Promise<boolean> {
  if (!config.release.prComment) {
    logger.info('Skipping PR comment (--no-pr-comment)')
    return false
  }

  try {
    return await prComment({
      prNumber,
      dryRun,
      logLevel: logLevel as any,
      configName,
      config,
      releaseContext,
    })
  }
  catch (error) {
    logger.warn('PR comment posting failed:', error)
    return false
  }
}
