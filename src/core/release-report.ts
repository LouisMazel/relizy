import type { ReleaseReportConfig } from '../types'
import type { ResolvedRelizyConfig } from './config'
import type { ReleaseOverview } from './release-overview'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { logger } from '@maz-ui/node'

export type ReleaseStepName = 'changelog' | 'publish' | 'commit' | 'push' | 'providerRelease' | 'social' | 'prComment'

export interface ReleaseStepReport {
  name: ReleaseStepName
  /**
   * `skipped` when the step is disabled (`release.<step>: false`, `--no-<step>`)
   */
  status: 'done' | 'skipped' | 'failed'
  /**
   * What the step did, or why it failed
   */
  detail?: string
}

/**
 * The outcome of `relizy release`, rendered in the terminal, in the outputs
 * and the summary of GitHub Actions, and in the files of `release.report`.
 */
export interface ReleaseReport {
  /**
   * `released`: the packages were released, `nothing`: no commit triggers a
   * bump, `failed`: the release stopped on an error
   */
  status: 'released' | 'nothing' | 'failed'
  /**
   * True when the release happened: never in dry-run
   */
  released: boolean
  dryRun: boolean
  canary: boolean
  /**
   * The packages and versions of the release, by version group
   */
  release?: ReleaseOverview
  /**
   * The repository version (`unified`/`selective`)
   */
  version?: string
  tags: string[]
  /**
   * The steps run after the bump, in order
   */
  steps: ReleaseStepReport[]
  error?: string
}

const STEP_LABELS: Record<ReleaseStepName, string> = {
  changelog: 'Changelog',
  publish: 'Publish',
  commit: 'Commit and tags',
  push: 'Push',
  providerRelease: 'Provider release',
  social: 'Social media',
  prComment: 'PR comment',
}

const STATUS_ICONS: Record<ReleaseStepReport['status'], string> = {
  done: '✅',
  skipped: '⏭️',
  failed: '⚠️',
}

function getVersionLines(report: ReleaseReport): string[] {
  return (report.release?.groups ?? []).map((group) => {
    const versions = group.version ?? group.packages.map(pkg => `${pkg.name}@${pkg.newVersion}`).join(', ')
    return report.release!.groups.length > 1 || group.name ? `${group.title}: ${versions}` : versions
  })
}

function getHeadline(report: ReleaseReport): string {
  const dryRun = report.dryRun ? ' (dry run)' : ''

  if (report.status === 'failed') {
    return `Release failed${dryRun}`
  }

  return report.status === 'nothing' ? `Nothing to release${dryRun}` : `Release completed${dryRun}`
}

/**
 * The report as plain text, for the terminal
 */
export function formatReleaseReportText(report: ReleaseReport): string {
  const lines = [getHeadline(report), '']

  if (report.error) {
    lines.push(`Error: ${report.error}`)
  }

  if (report.status !== 'nothing') {
    lines.push(...getVersionLines(report).map(line => `Version: ${line}`))
  }

  if (report.status === 'released' || report.tags.length > 0) {
    lines.push(`Tag(s): ${report.tags.length > 0 ? report.tags.join(', ') : 'None'}`)
  }

  lines.push(...report.steps.map(step => `${STEP_LABELS[step.name]}: ${step.status === 'skipped' ? 'Skipped' : step.detail ?? (step.status === 'done' ? 'Done' : 'Failed')}`))

  return lines.join('\n').trim()
}

/**
 * The report as markdown, for the summary of a GitHub Actions run
 */
export function formatReleaseReportMarkdown(report: ReleaseReport): string {
  const icon = { released: '🚀', nothing: 'ℹ️', failed: '❌' }[report.status]
  const lines = [`## ${icon} Relizy: ${getHeadline(report).toLowerCase()}`, '']

  if (report.error) {
    lines.push(`**Error:** \`${report.error}\``, '')
  }

  for (const group of report.status === 'nothing' ? [] : report.release?.groups ?? []) {
    if (report.release!.groups.length > 1 || group.name) {
      const version = group.version ? ` \`${group.version}\`` : ''
      lines.push(`### ${group.title}${version} (${group.versionMode})`, '')
    }

    lines.push('| Package | Version |', '| --- | --- |')
    lines.push(...group.packages.map(pkg => pkg.oldVersion === pkg.newVersion
      ? `| \`${pkg.name}\` | \`${pkg.newVersion}\` |`
      : `| \`${pkg.name}\` | \`${pkg.oldVersion}\` → \`${pkg.newVersion}\` |`))
    lines.push('')
  }

  if (report.tags.length > 0) {
    const tags = report.tags.map(tag => `\`${tag}\``).join(', ')
    lines.push(`**Tags:** ${tags}`, '')
  }

  if (report.steps.length > 0) {
    lines.push('| Step | Status |', '| --- | --- |')
    lines.push(...report.steps.map(step => `| ${STEP_LABELS[step.name]} | ${STATUS_ICONS[step.status]} ${step.status === 'skipped' ? 'skipped' : step.detail ?? step.status} |`))
  }

  return `${lines.join('\n').trim()}\n`
}

/**
 * The outputs of the report: `released`, `status`, `version`, `tags` and
 * `packages` (comma-separated `name@version`)
 */
export function getReleaseReportOutputs(report: ReleaseReport): Record<string, string> {
  const packages = (report.release?.groups ?? []).flatMap(group => group.packages)

  return {
    released: String(report.released),
    status: report.status,
    version: report.version ?? '',
    tags: report.tags.join(','),
    packages: packages.map(pkg => `${pkg.name}@${pkg.newVersion}`).join(','),
  }
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

/**
 * Write the report where it is expected: the outputs and the summary of the
 * GitHub Actions run (`release.report.github`), and the files of
 * `release.report.json` and `release.report.dotenv`. Written in dry-run too,
 * where `released` is `false`.
 */
export function writeReleaseReport({ config, report }: { config: ResolvedRelizyConfig, report: ReleaseReport }): void {
  const reportConfig: ReleaseReportConfig = config.release.report ?? {}
  const outputs = getReleaseReportOutputs(report)

  try {
    if (reportConfig.github !== false && process.env.GITHUB_ACTIONS === 'true') {
      if (process.env.GITHUB_OUTPUT) {
        const lines = [...Object.entries(outputs), ['report', JSON.stringify(report)]].map(([name, value]) => `${name}=${value}`)
        appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`)
      }

      if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, formatReleaseReportMarkdown(report))
      }

      logger.debug('Release report written to the outputs and the summary of the GitHub Actions run')
    }

    if (reportConfig.json) {
      writeFile(resolve(config.cwd, reportConfig.json), `${JSON.stringify(report, null, 2)}\n`)
      logger.debug(`Release report written to ${reportConfig.json}`)
    }

    if (reportConfig.dotenv) {
      const lines = Object.entries(outputs).map(([name, value]) => `RELIZY_${name.toUpperCase()}=${value}`)
      writeFile(resolve(config.cwd, reportConfig.dotenv), `${lines.join('\n')}\n`)
      logger.debug(`Release report written to ${reportConfig.dotenv}`)
    }
  }
  catch (error) {
    // The release is done: a report that cannot be written does not fail it
    logger.warn('The release report could not be written:', error)
  }
}
