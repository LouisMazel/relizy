import type { PullRequestTitle } from './git'
import type { CommitlintProblem, CommitlintResult } from './lint'
import process from 'node:process'

export interface ReportEntry {
  result: CommitlintResult
  /** Printed before the header: the short hash, or "MR title" / "PR title" */
  label?: string
  /** Changelog entry of the commit, printed with `--preview` */
  preview?: string
}

export interface CommitlintReport {
  /** `edit`: the commit being created, `message`: a given message, `range`: commits of the history */
  mode: 'edit' | 'message' | 'range'
  entries: ReportEntry[]
  /** Start of the linted range */
  from?: string
  /** Kind of the linted pull/merge request title */
  titleKind?: PullRequestTitle['kind']
  /** File of the message being created, in `edit` mode */
  messageFile?: string
  helpUrl?: string
}

export interface CommitlintSummary {
  errorCount: number
  warningCount: number
}

export function summarizeResults(results: CommitlintResult[]): CommitlintSummary {
  const problems = results.flatMap(result => result.problems)
  return {
    errorCount: problems.filter(problem => problem.severity === 'error').length,
    warningCount: problems.filter(problem => problem.severity === 'warn').length,
  }
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const ANSI = {
  reset: '\x1B[0m',
  bold: '\x1B[1m',
  dim: '\x1B[2m',
  red: '\x1B[31m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  cyan: '\x1B[36m',
} as const

type Style = (text: string) => string

interface Styles {
  bold: Style
  dim: Style
  red: Style
  green: Style
  yellow: Style
  cyan: Style
}

/**
 * Colors in a terminal and in the CI logs, which render them. Never for a
 * program reading the output (e.g. an AI agent), nor with `NO_COLOR`.
 */
export function shouldUseColors(stream: { isTTY?: boolean } = process.stdout): boolean {
  if (process.env.NO_COLOR) {
    return false
  }
  if (process.env.FORCE_COLOR !== undefined) {
    return process.env.FORCE_COLOR !== '0' && process.env.FORCE_COLOR !== 'false'
  }
  return Boolean(stream.isTTY || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI)
}

function createStyles(colors: boolean): Styles {
  const style = (code: string): Style => colors ? text => `${code}${text}${ANSI.reset}` : text => text
  return {
    bold: style(ANSI.bold),
    dim: style(ANSI.dim),
    red: style(ANSI.red),
    green: style(ANSI.green),
    yellow: style(ANSI.yellow),
    cyan: style(ANSI.cyan),
  }
}

// ---------------------------------------------------------------------------
// Text report
// ---------------------------------------------------------------------------

/** Width of the wrapped lines */
function getWidth(): number {
  return Math.min(Math.max(process.stdout.columns ?? 100, 60), 120)
}

/** Wrap a text on words, the first line taking `firstWidth` and the next ones `width` */
function wrap(text: string, firstWidth: number, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const max = lines.length === 0 ? firstWidth : width
    if (line && line.length + word.length + 1 > max) {
      lines.push(line)
      line = word
    }
    else {
      line = line ? `${line} ${word}` : word
    }
  }
  lines.push(line)
  return lines
}

/** `feat(nuxt)!` */
function formatCommitKind(result: CommitlintResult): string {
  const { type, scope, isBreaking } = result.commit
  if (!type) {
    return result.commit.header
  }
  const scopePart = scope ? `(${scope})` : ''
  return `${type}${scopePart}${isBreaking ? '!' : ''}`
}

/** `minor bump, 🚀 Enhancements` */
export function formatReleaseEffect(result: CommitlintResult): string {
  const bump = result.commit.bump ? `${result.commit.bump} bump` : 'no bump'
  const changelog = result.changelogTitle ?? 'not in the changelog'
  return `${bump}, ${changelog}`
}

function formatProblem(problem: CommitlintProblem, column: number, styles: Styles): string[] {
  const symbol = problem.severity === 'error' ? styles.red('✖') : styles.yellow('⚠')
  const indent = ' '.repeat(4 + column)
  const width = getWidth() - indent.length
  const [first = '', ...rest] = wrap(problem.message, width, width)
  const lines = [`  ${symbol} ${styles.cyan(problem.rule.padEnd(column))}${first}`, ...rest.map(line => `${indent}${line}`)]
  if (problem.fix) {
    wrap(problem.fix, width - 2, width - 2).forEach((line, index) => {
      lines.push(`${indent}${index === 0 ? styles.dim('→ ') : '  '}${styles.dim(line)}`)
    })
  }
  return lines
}

/**
 * Lines printed for a linted commit: one line when it is valid without
 * warning, otherwise its header, each problem with how to fix it, and the
 * suggested header.
 */
export function formatCommitResult(result: CommitlintResult, { label, colors = false }: { label?: string, colors?: boolean } = {}): string[] {
  const styles = createStyles(colors)
  const prefix = label ? `${styles.dim(label)} ` : ''

  if (result.ignored) {
    const labelPart = label ? `${label} ` : ''
    return [styles.dim(`○ ${labelPart}${result.commit.header} (ignored)`)]
  }

  const firstLine = result.valid
    ? `${styles.green('✔')} ${prefix}${formatCommitKind(result)} ${styles.dim('→')} ${formatReleaseEffect(result)}`
    : `${styles.red('✖')} ${prefix}${styles.bold(result.commit.header)}`
  if (result.problems.length === 0) {
    return [firstLine]
  }

  const column = Math.max(...result.problems.map(problem => problem.rule.length)) + 2
  const lines = [firstLine, '', ...result.problems.flatMap(problem => formatProblem(problem, column, styles))]

  if (result.suggestion) {
    const remaining = result.suggestion.remainingRules
    lines.push('', `  Suggested header: ${styles.green(result.suggestion.header)}`)
    if (remaining.length > 0) {
      lines.push(styles.dim(`                    still to fix: ${remaining.join(', ')}`))
    }
  }

  lines.push('')
  return lines
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/** `✖ 1 of 3 commits is invalid: 2 errors, 1 warning` */
function formatVerdict(report: CommitlintReport, styles: Styles): string {
  const results = report.entries.map(entry => entry.result)
  const { errorCount, warningCount } = summarizeResults(results)
  const counts = `${plural(errorCount, 'error')}, ${plural(warningCount, 'warning')}`

  if (report.mode !== 'range') {
    return errorCount > 0
      ? `${styles.red('✖')} ${styles.bold('The commit message is invalid')}: ${counts}`
      : `${styles.yellow('⚠')} The commit message is valid, with ${plural(warningCount, 'warning')}`
  }

  const commits = report.entries.filter(entry => entry.result.commit.hash)
  if (errorCount === 0) {
    return `${styles.yellow('⚠')} ${plural(commits.length, 'commit')} checked, all valid, with ${plural(warningCount, 'warning')}`
  }

  const invalidCommits = commits.filter(entry => !entry.result.valid).length
  const invalidTitle = report.entries.some(entry => !entry.result.commit.hash && !entry.result.valid)
  const subjects = [
    ...(invalidCommits > 0 || !invalidTitle ? [`${invalidCommits} of ${plural(commits.length, 'commit')}`] : []),
    ...(invalidTitle ? [`the ${report.titleKind} title`] : []),
  ]
  const verb = subjects.length > 1 || invalidCommits > 1 ? 'are' : 'is'
  const verdict = `${subjects.join(' and ')} ${verb} invalid`
  return `${styles.red('✖')} ${styles.bold(verdict)}: ${counts}`
}

/**
 * How to fix the invalid commits and title, depending on where they were
 * linted. The commands to run start with `$ `, so they are never wrapped.
 */
export function formatHowToFix(report: CommitlintReport): string[] {
  const invalid = report.entries.filter(entry => !entry.result.valid)
  if (invalid.length === 0 || report.mode === 'message') {
    return []
  }

  if (report.mode === 'edit') {
    const file = report.messageFile ?? '.git/COMMIT_EDITMSG'
    return [`edit the message and commit again, it is kept in ${file}:`, `$ git commit --edit --file ${file}`]
  }

  const lines: string[] = []
  const commits = invalid.filter(entry => entry.result.commit.hash)
  if (commits.length > 0) {
    const base = report.from ? (/^[0-9a-f]{40}$/.test(report.from) ? report.from.slice(0, 7) : report.from) : '--root'
    lines.push(
      `reword ${commits.map(entry => entry.label).join(', ')}: mark ${commits.length > 1 ? 'them' : 'it'} as "reword" in the rebase, then force-push:`,
      `$ git rebase -i ${base}`,
      '$ git push --force-with-lease',
    )
  }
  if (invalid.some(entry => !entry.result.commit.hash)) {
    lines.push(`edit the ${report.titleKind} title, then run a new pipeline (a retry keeps the old title)`)
  }
  return lines
}

/** Documentation of the failing built-in rules */
function getRuleLinks(report: CommitlintReport): Array<{ rule: string, url: string }> {
  const links = new Map<string, string>()
  for (const problem of report.entries.flatMap(entry => entry.result.problems)) {
    if (problem.url) {
      links.set(problem.rule, problem.url)
    }
  }
  return [...links].map(([rule, url]) => ({ rule, url }))
}

/**
 * The text report: each commit, then a summary with the verdict, the
 * documentation of the failing rules, the help URL and how to fix.
 */
export function formatTextReport(report: CommitlintReport, { colors = false, quiet = false }: {
  colors?: boolean
  /** Only print the commits with problems, and the summary */
  quiet?: boolean
} = {}): string[] {
  const styles = createStyles(colors)

  if (report.mode === 'range' && report.entries.length === 0) {
    return ['No commit to lint']
  }

  const printed = quiet ? report.entries.filter(entry => entry.result.problems.length > 0) : report.entries
  const lines = printed.flatMap(entry => [
    ...formatCommitResult(entry.result, { label: entry.label, colors }),
    ...(entry.preview ? ['', ...entry.preview.split('\n').map(line => `    ${line}`), ''] : []),
  ])
  const { errorCount, warningCount } = summarizeResults(report.entries.map(entry => entry.result))

  if (errorCount + warningCount === 0) {
    if (report.mode === 'range') {
      const ignored = report.entries.filter(entry => entry.result.ignored).length
      const commits = report.entries.filter(entry => entry.result.commit.hash).length
      const ignoredPart = ignored > 0 ? ` (${ignored} ignored)` : ''
      lines.push(`${styles.green('✔')} ${plural(commits, 'commit')} checked, all valid${ignoredPart}`)
    }
    return lines
  }

  if (lines.at(-1) !== '') {
    lines.push('')
  }
  lines.push(styles.dim('─'.repeat(Math.min(getWidth(), 72))), formatVerdict(report, styles))

  const links = getRuleLinks(report)
  const column = Math.max(0, ...links.map(link => link.rule.length)) + 2
  links.forEach((link, index) => {
    lines.push(`  ${index === 0 ? 'Rules:' : '      '} ${styles.cyan(link.rule.padEnd(column))}${styles.dim(link.url)}`)
  })
  if (report.helpUrl && errorCount > 0) {
    lines.push(`  Help:  ${report.helpUrl}`)
  }
  const indent = ' '.repeat(9)
  formatHowToFix(report).forEach((fix, index) => {
    const label = index === 0 ? '  Fix:   ' : indent
    // A command is printed whole, to be copied and pasted
    if (fix.startsWith('$ ')) {
      lines.push(`${label}  ${styles.green(fix)}`)
      return
    }
    wrap(fix, getWidth() - indent.length, getWidth() - indent.length - 2).forEach((line, lineIndex) => {
      lines.push(`${lineIndex === 0 ? label : indent}${lineIndex > 0 ? '  ' : ''}${line}`)
    })
  })

  return lines
}

// ---------------------------------------------------------------------------
// Machine-readable reports
// ---------------------------------------------------------------------------

function getEntryKind(entry: ReportEntry, report: CommitlintReport): 'commit' | 'title' | 'message' {
  if (entry.result.commit.hash) {
    return 'commit'
  }
  return report.mode === 'range' ? 'title' : 'message'
}

/**
 * The JSON report, stable for programs and AI agents: every commit with its
 * effect on the release, its problems and how to fix them.
 */
export function formatJsonReport(report: CommitlintReport): string {
  const summary = summarizeResults(report.entries.map(entry => entry.result))
  return JSON.stringify({
    valid: summary.errorCount === 0,
    ...summary,
    ...(report.helpUrl && { helpUrl: report.helpUrl }),
    entries: report.entries.map(entry => ({
      kind: getEntryKind(entry, report),
      ...(entry.result.commit.hash && { hash: entry.result.commit.hash }),
      header: entry.result.commit.header,
      ignored: entry.result.ignored,
      valid: entry.result.valid,
      type: entry.result.commit.type || null,
      scope: entry.result.commit.scope || null,
      bump: entry.result.commit.bump ?? null,
      changelogSection: entry.result.changelogTitle ?? null,
      problems: entry.result.problems,
      ...(entry.result.suggestion && { suggestion: entry.result.suggestion }),
      ...(entry.preview && { changelogEntry: entry.preview }),
    })),
    howToFix: formatHowToFix(report),
  }, null, 2)
}

/** Escape a GitHub Actions workflow command */
function escapeAnnotation(text: string, { property = false } = {}): string {
  const escaped = text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
  return property ? escaped.replaceAll(':', '%3A').replaceAll(',', '%2C') : escaped
}

/**
 * GitHub Actions annotations of the problems, displayed on the job summary
 * and the pull request.
 */
export function formatGithubAnnotations(report: CommitlintReport): string[] {
  return report.entries.flatMap(entry => entry.result.problems.map((problem) => {
    const command = problem.severity === 'error' ? 'error' : 'warning'
    const subject = entry.label ? `${entry.label} ` : ''
    const title = escapeAnnotation(`Commit ${subject}(${problem.rule})`, { property: true })
    const message = [entry.result.commit.header, problem.message, ...(problem.fix ? [`→ ${problem.fix}`] : [])].join('\n')
    return `::${command} title=${title}::${escapeAnnotation(message)}`
  }))
}
