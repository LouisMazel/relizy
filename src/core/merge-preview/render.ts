import type { ReleaseOverviewGroup } from '../release-overview'
import type { CommandNote, CommandOutcome } from '../release-ui'
import type { MergePreviewContext } from './context'
import type { MergePreviewCommit, MergePreviewOutcome, MergePreviewPackage, MergePreviewPlan } from './plan'
import type { MergePreviewChecks } from './problems'
import type { MergePreviewSquashMode } from './squash'
import { MERGE_PREVIEW_MARKER } from '../pr-comment'
import { describeCommitCounts, formatPackageRows } from '../release-ui'

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
  return result.context
    ? `If you merge this ${result.context.pullRequest.kind}`
    : 'The next release'
}

function code(value: string): string {
  return `\`${value}\``
}

/**
 * The commits of a package by type, and in a pull request where they come
 * from: `this PR: 1 feature · main: 1 fix`
 */
function describeCommits({ commits, result, branch }: { commits: MergePreviewCommit[], result: MergePreviewResult, branch: string }): string {
  if (!result.context) {
    return describeCommitCounts(commits)
  }

  const kind = result.context.pullRequest.kind === 'merge request'
    ? 'MR'
    : 'PR'
  const fromPullRequest = commits.filter(commit => commit.fromPullRequest)
  const fromTarget = commits.filter(commit => !commit.fromPullRequest)

  return [
    fromPullRequest.length > 0
      ? `this ${kind}: ${describeCommitCounts(fromPullRequest)}`
      : '',
    fromTarget.length > 0
      ? `${branch}: ${describeCommitCounts(fromTarget)}`
      : '',
  ].filter(Boolean).join(' · ')
}

/** Why a package is released: its commits (from the pull request or the target branch), a dependency, a graduation */
function describeReason({ pkg, group, result }: { pkg: MergePreviewPackage, group: ReleaseOverviewGroup, result: MergePreviewResult }): string {
  if (pkg.reason === 'dependency') {
    return pkg.dependency
      ? `depends on ${code(pkg.dependency)}`
      : 'depends on a released package'
  }
  if (pkg.reason === 'graduation') {
    return 'graduates from its prerelease'
  }
  if (pkg.commits.length === 0) {
    return group.versionMode === 'unified'
      ? 'follows the unified version'
      : 'forced'
  }

  return describeCommits({
    commits: pkg.commits,
    result,
    branch: code(result.branch),
  })
}

function formatGroupTable(group: ReleaseOverviewGroup, outcome: MergePreviewOutcome, result: MergePreviewResult): string[] {
  const rows = group.packages.map((overviewPackage) => {
    const pkg = outcome.packages.find(candidate => candidate.name === overviewPackage.name)
    const version = `${code(overviewPackage.oldVersion)} → ${code(overviewPackage.newVersion)}`
    const why = pkg
      ? describeReason({ pkg, group, result })
      : ''
    const name = overviewPackage.private
      ? `${overviewPackage.name} (private)`
      : overviewPackage.name

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
  const publish = result.publish.enabled
    ? `, published with the dist-tag ${code(result.publish.distTag)}`
    : ', not published'
  const lines = [`relizy releases **${count} package${count === 1
    ? ''
    : 's'}** from ${code(result.branch)}${publish}:`]

  for (const group of overview.groups) {
    lines.push('')
    if (overview.groups.length > 1 || group.version) {
      const version = group.version
        ? `${code(group.oldVersion ?? '')} → ${code(group.version)}`
        : ''
      const tag = group.tag
        ? `(tag ${code(group.tag)})`
        : ''
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
    lines.push(mergeLabel
      ? `${mergeLabel}${outcome[0]!.charAt(0).toLowerCase()}${outcome[0]!.slice(1)}`
      : outcome[0]!, ...outcome.slice(1))

    if (plan.squashOutcome) {
      const squashOutcome = formatOutcome(plan.squashOutcome, result)
      lines.push('', `With a **squash merge**, ${squashOutcome[0]!.charAt(0).toLowerCase()}${squashOutcome[0]!.slice(1)}`, ...squashOutcome.slice(1))
    }
  }

  if (checks.problems.length > 0) {
    const failing = result.context
      ? 'The release of the merge would fail'
      : 'The next release would fail'
    lines.push('', `#### ❌ ${failing}`, '', ...checks.problems.map(problem => `- ${problem.message}`))
  }

  if (checks.warnings.length > 0) {
    lines.push('', ...checks.warnings.map(warning => `> ⚠️ ${warning}`))
  }

  lines.push('', formatFooter(result))

  return lines.join('\n')
}

const FOLLOWS_UNIFIED_VERSION = 'follows the unified version'

/** Why a package is released, in plain words: the output of the terminal */
function describeTerminalReason({ pkg, group, result }: { pkg: MergePreviewPackage, group: ReleaseOverviewGroup, result: MergePreviewResult }): string {
  if (pkg.reason === 'dependency') {
    return `follows ${pkg.dependency ?? 'a dependency'}`
  }
  if (pkg.reason === 'graduation') {
    return 'stable release of the prerelease'
  }
  if (pkg.commits.length === 0) {
    return group.versionMode === 'unified'
      ? FOLLOWS_UNIFIED_VERSION
      : 'forced'
  }

  return describeCommits({ commits: pkg.commits, result, branch: result.branch })
}

/** The packages of a group, aligned; in a unified group, the ones only following the version on one line */
function getGroupLines({ group, outcome, result }: { group: ReleaseOverviewGroup, outcome: MergePreviewOutcome, result: MergePreviewResult }): string[] {
  const rows = group.packages.map((overviewPackage) => {
    const pkg = outcome.packages.find(candidate => candidate.name === overviewPackage.name)

    return {
      name: overviewPackage.private
        ? `${overviewPackage.name} (private)`
        : overviewPackage.name,
      oldVersion: overviewPackage.oldVersion,
      newVersion: overviewPackage.newVersion,
      reason: pkg
        ? describeTerminalReason({ pkg, group, result })
        : '',
    }
  })
  const followers = rows.filter(row => row.reason === FOLLOWS_UNIFIED_VERSION)
  const others = rows.filter(row => row.reason !== FOLLOWS_UNIFIED_VERSION)

  if (followers.length < 2 || others.length === 0) {
    return formatPackageRows(rows)
  }

  return [
    ...formatPackageRows(others),
    `+ ${followers.length} packages on the unified version: ${followers.map(row => row.name).join(', ')}`,
  ]
}

/** The versions a group releases, to compare two outcomes */
function getGroupVersions(group: ReleaseOverviewGroup): string {
  return group.packages.map(pkg => `${pkg.name}@${pkg.newVersion}`).join(',')
}

/** One box per version group of a release (only the groups not in `same`, released the same way by another outcome) */
function getOutcomeNotes({ outcome, result, label, same }: { outcome: MergePreviewOutcome, result: MergePreviewResult, label: string, same?: MergePreviewOutcome }): CommandNote[] {
  const sameVersions = new Set((same?.overview?.groups ?? []).map(group => getGroupVersions(group)))
  const groups = (outcome.overview?.groups ?? []).filter(group => !sameVersions.has(getGroupVersions(group)))
  const publish = result.publish.enabled
    ? `Published with the dist-tag ${result.publish.distTag}`
    : 'Not published'

  return groups.map(group => ({
    title: [
      label,
      group.title,
      group.tag
        ? `tag ${group.tag}`
        : '',
    ].filter(Boolean).join(' · '),
    lines: getGroupLines({ group, outcome, result }),
    footer: hasPublishedPackages(group)
      ? [publish]
      : [],
  }))
}

/** A group of private packages only is never published: no dist-tag to tell */
function hasPublishedPackages(group: ReleaseOverviewGroup): boolean {
  return group.packages.some(pkg => !pkg.private)
}

/** Where the preview was computed, in plain text */
function getTerminalFooter(result: MergePreviewResult): string {
  return formatFooter(result)
    .replace(/<\/?sub>/g, '')
    .replaceAll('`', '')
    .replace(/ (?:· )?by relizy$/, '')
}

/**
 * The merge preview in the terminal: a box per version group (and per merge
 * method when it changes the release), the problems, the warnings, and where it
 * was computed. The markdown is for the pull request and the CI job summary.
 */
export function getMergePreviewTerminalOutput(result: MergePreviewResult): Required<Pick<CommandOutcome, 'notes' | 'warnings' | 'details'>> {
  const { plan, checks } = result
  const notes: CommandNote[] = []

  if (plan) {
    notes.push(...getOutcomeNotes({
      outcome: plan.outcome,
      result,
      label: plan.squashOutcome ? 'With a merge commit or a rebase' : 'Release plan',
    }))

    if (plan.squashOutcome) {
      // Only the groups a squash merge releases otherwise
      const squashNotes = getOutcomeNotes({
        outcome: plan.squashOutcome,
        result,
        label: 'With a squash merge',
        same: plan.outcome,
      })
      notes.push(...(squashNotes.length > 0
        ? squashNotes
        : [
            {
              title: 'With a squash merge',
              lines: ['Nothing is released'],
            },
          ]))
    }
  }

  if (checks.problems.length > 0) {
    notes.push({
      title: result.context
        ? 'The release of the merge would fail'
        : 'The next release would fail',
      lines: checks.problems.map(problem => `✖ ${problem.message}`),
      failed: true,
    })
  }

  return {
    notes,
    warnings: checks.warnings,
    details: [
      getTerminalFooter(result),
    ],
  }
}

/** A text cut to `max` characters, with an ellipsis */
function truncate(text: string, max: number): string {
  return text.length > max
    ? `${text.slice(0, max - 1)}…`
    : text
}

/**
 * The description of the commit status (140 characters at most on GitHub):
 * the first problem, or what the merge releases
 */
export function getMergePreviewStatusDescription(result: MergePreviewResult): string {
  const { checks, plan } = result
  if (checks.problems.length > 0) {
    const more = checks.problems.length > 1
      ? ` (+${checks.problems.length - 1} more)`
      : ''
    return truncate(`${checks.problems[0]!.message}${more}`, 140)
  }

  const packages = plan?.outcome.packages ?? []
  if (packages.length === 0) {
    return 'The merge releases nothing'
  }

  const versions = packages.map(pkg => `${pkg.name}@${pkg.newVersion}`).join(', ')
  return truncate(`Releases ${versions}${plan?.squashOutcome ? ' (other versions with a squash merge)' : ''}`, 140)
}
