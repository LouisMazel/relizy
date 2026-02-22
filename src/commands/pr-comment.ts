import type { LogLevel } from '@maz-ui/node'
import type { ResolvedRelizyConfig } from '../core'
import type { BumpResultTruthy, PrCommentMode, ReleaseContext } from '../types'
import { logger } from '@maz-ui/node'
import { detectPullRequest, getCurrentGitBranch, loadRelizyConfig, postPrComment, PR_COMMENT_MARKER, readPackageJson, readPackages } from '../core'

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
  packages?: Array<{ name: string, version: string }>
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
  version: string
  oldVersion?: string
  tags: string[]
  distTag?: string
  date: string
  branch: string
}): string[] {
  const lines: string[] = []

  const versionChanged = oldVersion && oldVersion !== version
  lines.push(versionChanged
    ? `- **Version**: \`${oldVersion}\` → \`${version}\``
    : `- **Version**: \`${version}\``,
  )

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
  const lines: string[] = []
  const header = ['', '### Packages', '', '| Package | Version |', '| --- | --- |']

  if (bumpedPackages.length > 0) {
    lines.push(...header)
    for (const pkg of bumpedPackages) {
      const hasTransition = pkg.newVersion && pkg.oldVersion !== pkg.newVersion
      lines.push(hasTransition
        ? `| \`${pkg.name}\` | \`${pkg.oldVersion}\` → \`${pkg.newVersion}\` |`
        : `| \`${pkg.name}\` | \`${pkg.version}\` |`,
      )
    }
    return lines
  }

  if (packages && packages.length > 0) {
    lines.push(...header)
    for (const pkg of packages) {
      lines.push(`| \`${pkg.name}\` | \`${pkg.version}\` |`)
    }
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
  version: string
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

  if (rootPackageName) {
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
    `${installCmd} ${installPkgs.join(' ')}`,
    '```',
  ]

  if (distTag && distTag !== 'latest' && pkgNames.length > 0) {
    const distTagArgs = pkgNames.map(n => `${n}@${distTag}`).join(' ')
    lines.push(
      '',
      `or using the \`${distTag}\` dist-tag:`,
      '',
      '```bash',
      `${installCmd} ${distTagArgs}`,
      '```',
    )
  }

  return lines
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
  const bumpedPackages = bumpResult?.bumpedPackages ?? []
  const version = bumpResult?.newVersion ?? rootVersion ?? 'unknown'
  const tags = releaseContext?.tags ?? []
  const distTag = config.publish?.tag
  const installCmd = getInstallCommand(config.publish?.packageManager)

  const lines: string[] = [PR_COMMENT_MARKER, '', '## 🚀 Release published', '']

  lines.push(...buildMetadataLines({
    version,
    oldVersion: bumpResult?.oldVersion,
    tags,
    distTag,
    date,
    branch,
  }))

  lines.push(...buildPackageTableLines(bumpedPackages, packages))

  const installPkgs = buildInstallPackages({ bumpedPackages, packages, version, rootPackageName: config.projectName })
  const pkgNames = resolvePackageNames(bumpedPackages, packages, config.projectName)

  lines.push(...buildInstallLines({ installCmd, installPkgs, distTag, pkgNames }))

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

export async function prComment(options: PrCommentOptions = {}): Promise<void> {
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
  let packages: Array<{ name: string, version: string }> = []
  let rootVersion = 'unknown'

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
    })
    packages = readPkgs.map(pkg => ({ name: pkg.name, version: pkg.version }))
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
    return
  }

  if (!pr) {
    logger.warn('No PR/MR detected. Use --pr-number to specify one manually.')
    return
  }

  await postPrComment({ config, pr, body })
}
