import type { CommitlintResult } from './lint'

const SYMBOLS = {
  valid: '✔',
  error: '✖',
  warn: '⚠',
  ignored: '○',
} as const

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

/**
 * Lines printed for a linted commit: one line when it is valid, its header and
 * its problems otherwise.
 */
export function formatCommitResult(result: CommitlintResult, { showHash = false }: { showHash?: boolean } = {}): string[] {
  const hash = showHash && result.commit.hash ? `${result.commit.hash.slice(0, 7)} ` : ''

  if (result.ignored) {
    return [`${SYMBOLS.ignored} ${hash}${result.commit.header} (ignored)`]
  }

  const lines = result.problems.some(problem => problem.severity === 'error')
    ? [`${SYMBOLS.error} ${hash}${result.commit.header}`]
    : [`${SYMBOLS.valid} ${hash}${formatCommitKind(result)} → ${formatReleaseEffect(result)}`]

  for (const problem of result.problems) {
    lines.push(`  ${SYMBOLS[problem.severity]} ${problem.message} [${problem.rule}]`)
  }

  return lines
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

/** `✖ 2 problems (1 error, 1 warning)`, nothing when there is no problem */
export function formatSummary({ errorCount, warningCount }: CommitlintSummary, helpUrl?: string): string[] {
  const total = errorCount + warningCount
  if (total === 0) {
    return []
  }
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
  const lines = [`${errorCount > 0 ? SYMBOLS.error : SYMBOLS.warn} ${plural(total, 'problem')} (${plural(errorCount, 'error')}, ${plural(warningCount, 'warning')})`]
  if (helpUrl && errorCount > 0) {
    lines.push(`ⓘ Get help: ${helpUrl}`)
  }
  return lines
}
