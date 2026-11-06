import type { ReleaseReportConfig } from '../types'
import type { ResolvedRelizyConfig } from './config'
import type { ReleaseOverview } from './release-overview'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { logger } from '@maz-ui/node'
import { formatDuration, formatUtcDate, plural } from './format'
import { describeAIUsage } from './progress'
import { getReleaseLines } from './release-overview'

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
  /**
   * What the step created: the provider releases, the npm pages, the tweet, the pull request
   */
  links?: { label: string, url: string }[]
}

/**
 * What the release contains
 */
export interface ReleaseContent {
  commits: number
  features: number
  fixes: number
  breaking: number
  contributors: number
}

export interface ReleaseGit {
  branch: string
  /**
   * Short hash of the release commit (not in dry-run)
   */
  commit?: string
  /**
   * Where the release is pushed: `origin/main`
   */
  remote?: string
}

export interface ReleasePublish {
  /**
   * Dist-tags of the published versions: `latest`
   */
  tags: string[]
  /**
   * Hosts of the registries: `registry.npmjs.org`
   */
  registries: string[]
  /**
   * Command installing the published versions, up to 3 packages
   */
  install?: string
}

export interface ReleaseAI {
  provider: string
  rewrites: number
  /**
   * Not called (dry run without `--ai-preview`)
   */
  simulated: boolean
  durationMs: number
  /**
   * Sums of the calls, when their provider gives them
   */
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
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
  content?: ReleaseContent
  git?: ReleaseGit
  publish?: ReleasePublish
  ai?: ReleaseAI
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
  // A failed step does not stop the release (social posts, provider release)
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

export interface ReleaseSummaryEntry {
  label: string
  value: string
  status?: ReleaseStepReport['status']
  links?: { label: string, url: string }[]
}

/**
 * What the release contains, in words: `6 features · 9 fixes · 3 breaking · 2 contributors`,
 * else its commits
 */
export function describeReleaseContent(content: ReleaseContent): string {
  const changes = content.features + content.fixes + content.breaking

  return [
    changes ? '' : plural(content.commits, 'commit'),
    content.features ? plural(content.features, 'feature') : '',
    content.fixes ? plural(content.fixes, 'fix', 'fixes') : '',
    content.breaking ? `${content.breaking} breaking` : '',
    content.contributors ? plural(content.contributors, 'contributor') : '',
  ].filter(Boolean).join(' · ')
}

/**
 * The AI of the release, in words: `2 rewrites by claude-code in 31.2s · 12.4k tokens · $0.042`
 */
export function describeReleaseAI(ai: ReleaseAI): string {
  if (ai.simulated) {
    return `${plural(ai.rewrites, 'rewrite')} simulated (${ai.provider})`
  }

  return [`${plural(ai.rewrites, 'rewrite')} by ${ai.provider} in ${formatDuration(ai.durationMs)}`, ...describeAIUsage(ai)].join(' · ')
}

/**
 * What a step did, with what the release knows of it
 */
function describeStep(step: ReleaseStepReport, report: ReleaseReport): string {
  if (step.status === 'skipped') {
    return 'skipped'
  }

  if (step.status === 'done' && step.name === 'publish' && report.publish) {
    return [step.detail, ...report.publish.tags, ...report.publish.registries].filter(Boolean).join(' · ')
  }

  if (step.status === 'done' && step.name === 'commit' && report.git?.commit) {
    return [report.git.commit, step.detail].filter(Boolean).join(' · ')
  }

  if (step.status === 'done' && step.name === 'push' && report.git) {
    return report.git.remote ? `${report.git.branch} → ${report.git.remote}` : report.git.branch
  }

  return step.detail ?? (step.status === 'done' ? 'done' : 'failed')
}

/**
 * The report as label and value pairs: the versions and what the release
 * contains, then each step with what it created, then the AI and the install
 */
export function getReleaseSummary(report: ReleaseReport): ReleaseSummaryEntry[] {
  const entries: ReleaseSummaryEntry[] = report.status === 'nothing'
    ? []
    : getVersionLines(report).map(line => ({ label: 'Version', value: line }))

  if (report.tags.length > 0) {
    entries.push({ label: report.tags.length === 1 ? 'Tag' : 'Tags', value: report.tags.join(', ') })
  }

  // A forced release without commit has nothing to tell
  if (report.content?.commits) {
    entries.push({ label: 'Content', value: describeReleaseContent(report.content) })
  }

  entries.push(...report.steps.map(step => ({
    label: STEP_LABELS[step.name],
    value: describeStep(step, report),
    status: step.status,
    ...(step.links?.length ? { links: step.links } : {}),
  })))

  if (report.ai) {
    entries.push({ label: 'AI', value: describeReleaseAI(report.ai) })
  }

  if (report.publish?.install) {
    entries.push({ label: 'Install', value: report.publish.install })
  }

  return entries
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

/** Values shown as code */
const CODE_LABELS = new Set(['Version', 'Tag', 'Tags', 'Install'])

function formatMarkdownLink({ label, url }: { label: string, url: string }): string {
  return `[${label}](${url})`
}

/**
 * The released versions: `relizy 2.0.0, @scope/nav 1.3.0`
 */
export function getReleaseName(report: ReleaseReport): string {
  return getReleaseLines(report.release ?? { projectName: '', groups: [] }).map(line => `${line.name} ${line.version}`).join(', ')
}

function getMarkdownHeadline(report: ReleaseReport): string[] {
  if (report.status === 'failed') {
    return [`## ❌ Release failed${report.dryRun ? ' (dry run)' : ''}`, '', ...(report.error ? [`> ${report.error.split('\n')[0]}`, ''] : [])]
  }

  if (report.status === 'nothing') {
    return ['## ℹ️ Nothing to release', '', 'No commit since the last release triggers a new version.', '']
  }

  return report.dryRun
    ? [`## 🧪 Dry run: ${getReleaseName(report)}`, '', 'Nothing was written nor published.', '']
    : [`## 🚀 Released ${getReleaseName(report)}`, '']
}

/**
 * The packages of the release and their versions, by group
 */
function getMarkdownPackages(report: ReleaseReport): string[] {
  const groups = report.status === 'nothing' ? [] : report.release?.groups ?? []

  return groups.flatMap((group) => {
    const version = group.version ? ` \`${group.version}\`` : ''
    const title = groups.length > 1 || group.name ? [`### ${group.title}${version} (${group.versionMode})`, ''] : ['### Packages', '']

    return [
      ...title,
      '| Package | Version |',
      '| --- | --- |',
      ...group.packages.map(pkg => pkg.oldVersion === pkg.newVersion
        ? `| \`${pkg.name}\` | \`${pkg.newVersion}\` |`
        : `| \`${pkg.name}\` | \`${pkg.oldVersion}\` → \`${pkg.newVersion}\` |`),
      '',
    ]
  })
}

/**
 * The report as markdown, as the summary of the terminal: for the summary of
 * a GitHub Actions run, the comment of the pull request, and `release.report.markdown`
 */
export function formatReleaseReportMarkdown(report: ReleaseReport): string {
  const rows = getReleaseSummary(report).map(({ label, value, status, links = [] }) => {
    const icon = status ? `${STATUS_ICONS[status]} ` : label === 'AI' ? '✨ ' : ''
    let text = CODE_LABELS.has(label) ? `\`${value}\`` : value
    // A link replaces its label in the value, else follows it
    const others = links.filter((link) => {
      if (!CODE_LABELS.has(label) && text.includes(link.label)) {
        text = text.replace(link.label, formatMarkdownLink(link))
        return false
      }
      return true
    })
    const linksText = others.length > 0 ? `<br>${others.map(formatMarkdownLink).join(' · ')}` : ''
    return `| ${icon}**${label}** | ${text}${linksText} |`
  })

  const lines = [
    ...getMarkdownHeadline(report),
    ...(rows.length > 0 ? ['| Step | Result |', '| --- | --- |', ...rows, ''] : []),
    ...getMarkdownPackages(report),
    `<sub>${getMarkdownFooter(report)}</sub>`,
  ]

  return `${lines.join('\n').trim()}\n`
}

function getMarkdownFooter(report: ReleaseReport): string {
  const branch = report.git ? `\`${report.git.branch}\`` : ''
  return [branch, formatUtcDate(new Date()), 'by [relizy](https://relizy.dev)'].filter(Boolean).join(' · ')
}

/**
 * Name of a group or a package in an output: `@acme/ui-kit` gives `acme_ui_kit`
 */
function toOutputName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

/**
 * The outputs of the report: `released`, `status`, `version`, `tags`,
 * `packages` (comma-separated `name@version`), `branch`, `commit`,
 * `dist_tags`, `urls` (what the release created), `install` and
 * `failed_steps` (the steps that failed without stopping it). When the
 * release happened, also `group_<name>_version` for each `unified`/`selective`
 * version group and `package_<name>_version` for each released package
 */
export function getReleaseReportOutputs(report: ReleaseReport): Record<string, string> {
  const groups = report.released ? report.release?.groups ?? [] : []
  const packages = (report.release?.groups ?? []).flatMap(group => group.packages)

  const versions = Object.fromEntries([
    ...groups.flatMap(group => group.name && group.version ? [[`group_${toOutputName(group.name)}_version`, group.version]] : []),
    ...groups.flatMap(group => group.packages).map(pkg => [`package_${toOutputName(pkg.name)}_version`, pkg.newVersion]),
  ])

  return {
    released: String(report.released),
    status: report.status,
    version: report.version ?? '',
    tags: report.tags.join(','),
    packages: packages.map(pkg => `${pkg.name}@${pkg.newVersion}`).join(','),
    branch: report.git?.branch ?? '',
    commit: report.git?.commit ?? '',
    dist_tags: report.publish?.tags.join(',') ?? '',
    urls: report.steps.flatMap(step => step.links ?? []).map(link => link.url).join(','),
    install: report.publish?.install ?? '',
    failed_steps: report.steps.filter(step => step.status === 'failed').map(step => step.name).join(','),
    ...versions,
  }
}

const OUTPUT_DELIMITER = 'RELIZY_SUMMARY_EOF'

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
  const markdown = formatReleaseReportMarkdown(report)

  try {
    if (reportConfig.github !== false && process.env.GITHUB_ACTIONS === 'true') {
      if (process.env.GITHUB_OUTPUT) {
        const lines = [...Object.entries(outputs), ['report', JSON.stringify(report)]].map(([name, value]) => `${name}=${value}`)
        // Multiline: the markdown summary, to reuse in another step (comment, message)
        lines.push(`summary<<${OUTPUT_DELIMITER}`, markdown.trimEnd(), OUTPUT_DELIMITER)
        appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`)
      }

      if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown)
      }

      logger.debug('Release report written to the outputs and the summary of the GitHub Actions run')
    }

    if (reportConfig.json) {
      writeFile(resolve(config.cwd, reportConfig.json), `${JSON.stringify(report, null, 2)}\n`)
      logger.debug(`Release report written to ${reportConfig.json}`)
    }

    if (reportConfig.markdown) {
      writeFile(resolve(config.cwd, reportConfig.markdown), markdown)
      logger.debug(`Release report written to ${reportConfig.markdown}`)
    }

    if (reportConfig.dotenv) {
      // Without `install` (`pnpm add ...`): no value has a space, the file can be sourced
      const lines = Object.entries(outputs).filter(([name]) => name !== 'install').map(([name, value]) => `RELIZY_${name.toUpperCase()}=${value}`)
      writeFile(resolve(config.cwd, reportConfig.dotenv), `${lines.join('\n')}\n`)
      logger.debug(`Release report written to ${reportConfig.dotenv}`)
    }
  }
  catch (error) {
    // The release is done: a report that cannot be written does not fail it
    logger.warn('The release report could not be written:', error)
  }
}
