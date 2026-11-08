import type { ReleaseOverviewGroup } from '../release-overview'
import type { MergePreviewContext } from './context'
import type { MergePreviewCommit, MergePreviewOutcome, MergePreviewPackage, MergePreviewPlan } from './plan'
import type { MergePreviewChecks } from './problems'
import type { MergePreviewSquashMode } from './squash'
import { MERGE_PREVIEW_MARKER } from '../pr-comment'

/** What the merge preview found, to render */
export interface MergePreviewResult {
  /** The pull request and its merge, none outside a pull request pipeline */
  context?: MergePreviewContext
  /** None when the release could not be computed (an `error` problem tells why) */
  plan?: MergePreviewPlan
  checks: MergePreviewChecks
  /** The release publishes the packages, with this dist-tag */
  publish: { enabled: boolean, distTag: string }
  /** Branch the release runs on: the target branch, the current one outside a pull request */
  branch: string
}

function getTitle(result: MergePreviewResult): string {
  return result.context ? `If you merge this ${result.context.pullRequest.kind}` : 'The next release'
}

function code(value: string): string {
  return `\`${value}\``
}

function describeCommitTypes(commits: MergePreviewCommit[]): string {
  return [...new Set(commits.map(commit => `${commit.type}${commit.isBreaking ? '!' : ''}`))].join(', ')
}

/** Why a package is released: its commits (from the pull request or the target branch), a dependency, a graduation */
function describeReason({ pkg, group, result }: { pkg: MergePreviewPackage, group: ReleaseOverviewGroup, result: MergePreviewResult }): string {
  if (pkg.reason === 'dependency') {
    return pkg.dependency ? `depends on ${code(pkg.dependency)}` : 'depends on a released package'
  }
  if (pkg.reason === 'graduation') {
    return 'graduates from its prerelease'
  }
  if (pkg.commits.length === 0) {
    return group.versionMode === 'unified' ? 'follows the unified version' : 'forced'
  }
  if (!result.context) {
    return describeCommitTypes(pkg.commits)
  }

  const kind = result.context.pullRequest.kind === 'merge request' ? 'MR' : 'PR'
  const fromPullRequest = pkg.commits.filter(commit => commit.fromPullRequest)
  const fromTarget = pkg.commits.filter(commit => !commit.fromPullRequest)

  return [
    fromPullRequest.length > 0 ? `${describeCommitTypes(fromPullRequest)} (this ${kind}) ⭐` : '',
    fromTarget.length > 0 ? `${describeCommitTypes(fromTarget)} (on ${code(result.branch)})` : '',
  ].filter(Boolean).join(', ')
}

function formatGroupTable(group: ReleaseOverviewGroup, outcome: MergePreviewOutcome, result: MergePreviewResult): string[] {
  const rows = group.packages.map((overviewPackage) => {
    const pkg = outcome.packages.find(candidate => candidate.name === overviewPackage.name)
    const version = `${code(overviewPackage.oldVersion)} → ${code(overviewPackage.newVersion)}`
    const why = pkg ? describeReason({ pkg, group, result }) : ''
    const name = overviewPackage.private ? `${overviewPackage.name} (private)` : overviewPackage.name

    return `| ${name} | ${version} | ${why} |`
  })

  return ['| Package | Version | Why |', '|---|---|---|', ...rows]
}

function formatOutcome(outcome: MergePreviewOutcome, result: MergePreviewResult): string[] {
  const overview = outcome.overview
  if (!overview || overview.groups.length === 0) {
    return ['relizy releases **nothing**: no commit since the last release changes a version.']
  }

  const count = overview.groups.reduce((total, group) => total + group.packages.length, 0)
  const publish = result.publish.enabled ? `, published with the dist-tag ${code(result.publish.distTag)}` : ', not published'
  const lines = [`relizy releases **${count} package${count === 1 ? '' : 's'}** from ${code(result.branch)}${publish}:`]

  for (const group of overview.groups) {
    lines.push('')
    if (overview.groups.length > 1 || group.version) {
      const version = group.version ? `${code(group.oldVersion ?? '')} → ${code(group.version)}` : ''
      const tag = group.tag ? `(tag ${code(group.tag)})` : ''
      lines.push([`**${group.title}**`, version, tag].filter(Boolean).join(' '), '')
    }
    lines.push(...formatGroupTable(group, outcome, result))
  }

  return lines
}

const SQUASH_LABELS: Record<MergePreviewSquashMode, string> = {
  squash: 'squash merge',
  commits: 'commits kept',
  both: 'merge method unknown',
}

function formatFooter(result: MergePreviewResult): string {
  const { context, plan } = result
  if (!context) {
    return `<sub>Computed on ${code(result.branch)} by relizy</sub>`
  }

  const target = code(`${context.pullRequest.targetBranch}@${context.targetSha.slice(0, 7)}`)
  const head = code(`@${context.headSha.slice(0, 7)}`)
  const parts = [`Computed on ${target} + this ${context.pullRequest.kind} ${head}`]
  if (plan) {
    parts.push(`${SQUASH_LABELS[plan.squash.mode]}: ${plan.squash.reason}`)
  }
  parts.push('by relizy')

  return `<sub>${parts.join(' · ')}</sub>`
}

/**
 * The merge preview in markdown: the comment of the pull request, the summary
 * of the CI job
 */
export function formatMergePreviewMarkdown(result: MergePreviewResult): string {
  const { plan, checks } = result
  const lines = [MERGE_PREVIEW_MARKER, `### 🔮 ${getTitle(result)}`, '']

  if (plan) {
    const mergeLabel = plan.squashOutcome ? 'With a merge commit or a rebase, ' : ''
    const outcome = formatOutcome(plan.outcome, result)
    lines.push(mergeLabel ? `${mergeLabel}${outcome[0]!.charAt(0).toLowerCase()}${outcome[0]!.slice(1)}` : outcome[0]!, ...outcome.slice(1))

    if (plan.squashOutcome) {
      const squashOutcome = formatOutcome(plan.squashOutcome, result)
      lines.push('', `With a **squash merge**, ${squashOutcome[0]!.charAt(0).toLowerCase()}${squashOutcome[0]!.slice(1)}`, ...squashOutcome.slice(1))
    }
  }

  if (checks.problems.length > 0) {
    lines.push('', '#### ❌ The release of the merge would fail', '', ...checks.problems.map(problem => `- ${problem.message}`))
  }

  if (checks.warnings.length > 0) {
    lines.push('', ...checks.warnings.map(warning => `> ⚠️ ${warning}`))
  }

  lines.push('', formatFooter(result))

  return lines.join('\n')
}

/**
 * The merge preview in plain text: the output of the terminal
 */
export function formatMergePreviewText(result: MergePreviewResult): string {
  return formatMergePreviewMarkdown(result)
    .replace(`${MERGE_PREVIEW_MARKER}\n`, '')
    .replace(/<\/?sub>/g, '')
    .replace(/\*\*/g, '')
    .replace(/^#+ /gm, '')
}

/** A text cut to `max` characters, with an ellipsis */
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/**
 * The description of the commit status (140 characters at most on GitHub):
 * the first problem, or what the merge releases
 */
export function getMergePreviewStatusDescription(result: MergePreviewResult): string {
  const { checks, plan } = result
  if (checks.problems.length > 0) {
    const more = checks.problems.length > 1 ? ` (+${checks.problems.length - 1} more)` : ''
    return truncate(`${checks.problems[0]!.message}${more}`, 140)
  }

  const packages = plan?.outcome.packages ?? []
  if (packages.length === 0) {
    return 'The merge releases nothing'
  }

  const versions = packages.map(pkg => `${pkg.name}@${pkg.newVersion}`).join(', ')
  return truncate(`Releases ${versions}${plan?.squashOutcome ? ' (other versions with a squash merge)' : ''}`, 140)
}
