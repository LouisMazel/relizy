import type { LogLevel } from '@maz-ui/node'
import type { ResolvedRelizyConfig } from '../core'
import type { PrCommentMode } from '../types'
import { logger } from '@maz-ui/node'
import { detectPullRequest, loadRelizyConfig, postPrComment, PR_COMMENT_MARKER, readPackageJson, readPackages } from '../core'

export interface PrCommentOptions {
  prNumber?: number
  dryRun?: boolean
  logLevel?: LogLevel
  configName?: string
}

function buildCommentBody({
  config,
  packages,
  rootVersion,
}: {
  config: ResolvedRelizyConfig
  packages: Array<{ name: string, version: string }>
  rootVersion: string
}): string {
  const lines: string[] = [
    PR_COMMENT_MARKER,
    `## 📦 Relizy Release`,
    '',
  ]

  if (packages.length > 0) {
    lines.push(`**Root version:** \`${rootVersion}\``, '')
    lines.push('| Package | Version |')
    lines.push('| --- | --- |')

    for (const pkg of packages) {
      lines.push(`| \`${pkg.name}\` | \`${pkg.version}\` |`)
    }
  }
  else {
    lines.push(`**Version:** \`${rootVersion}\``)
  }

  lines.push('')
  lines.push(`_Mode: ${config.prComment?.mode ?? 'append'}_`)

  return lines.join('\n')
}

export async function prComment(options: PrCommentOptions = {}): Promise<void> {
  const dryRun = options.dryRun ?? false
  logger.debug(`Dry run: ${dryRun}`)

  const config = await loadRelizyConfig({
    configFile: options.configName,
    overrides: {
      logLevel: options.logLevel,
    },
  })

  const rootPackage = readPackageJson(config.cwd)

  if (!rootPackage) {
    throw new Error('Failed to read root package.json')
  }

  const rootVersion = rootPackage.version

  const packages = readPackages({
    cwd: config.cwd,
    patterns: config.monorepo?.packages,
    ignorePackageNames: config.monorepo?.ignorePackageNames,
  })

  const body = buildCommentBody({
    config,
    packages: packages.map(pkg => ({ name: pkg.name, version: pkg.version })),
    rootVersion,
  })

  const pr = await detectPullRequest({
    config,
    prNumber: options.prNumber,
  })

  if (dryRun) {
    const mode: PrCommentMode = config.prComment?.mode ?? 'append'
    const prDisplay = pr ? `#${pr.number} (${pr.url})` : 'Not detected'
    logger.box(
      `[dry-run] PR Comment Preview\n\nPR: ${prDisplay}\nMode: ${mode}\n\n${body}`,
    )
    return
  }

  if (!pr) {
    logger.warn('No PR/MR detected. Use --pr-number to specify one manually.')
    return
  }

  await postPrComment({ config, pr, body })
}
