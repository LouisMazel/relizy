import type { ResolvedRelizyConfig } from '../config'

/**
 * A commit message split into its parts, before any conventional parsing.
 */
export interface CommitMessageParts {
  /** Full message, comments removed, trailing blank lines trimmed */
  raw: string
  header: string
  body: string
  footer: string
  /** Whether a blank line separates the header from the rest of the message */
  hasLeadingBlank: boolean
}

/** The line `git commit --verbose` adds before the diff */
const SCISSORS_LINE = '------------------------ >8 ------------------------'

/**
 * Remove what git strips from a message edited in the editor: the comment lines
 * and everything after the scissors line of `git commit --verbose`.
 */
export function stripGitComments(message: string, commentChar = '#'): string {
  const lines = message.replaceAll('\r\n', '\n').split('\n')
  const scissors = lines.findIndex(line => line.startsWith(commentChar) && line.includes(SCISSORS_LINE))
  return lines
    .slice(0, scissors === -1 ? lines.length : scissors)
    .filter(line => !line.startsWith(commentChar))
    .join('\n')
}

/** `Token: value`, `Token #value` or `BREAKING CHANGE: value` lines, as defined by Conventional Commits */
function isFooterLine(line: string): boolean {
  return /^(?:BREAKING[ -]CHANGE|[\w-]+)(?:: | #)/.test(line)
}

/**
 * Split a message into header, body and footer. The footer is the last
 * paragraph when it is only made of `Token: value` lines.
 */
export function splitCommitMessage(message: string): CommitMessageParts {
  const lines = message.replaceAll('\r\n', '\n').split('\n')
  // Trailing blank lines only: a space ending the header is a problem to report
  while (lines.length > 1 && lines.at(-1)?.trim() === '') {
    lines.pop()
  }
  const header = lines[0] ?? ''
  const rest = lines.slice(1)
  const hasLeadingBlank = rest.length === 0 || rest[0]?.trim() === ''

  const paragraphs = rest.join('\n').trim().split(/\n[ \t]*\n/)
  const last = paragraphs.at(-1) ?? ''
  const hasFooter = paragraphs.length > 0 && last !== '' && last.split('\n').every(isFooterLine)

  return {
    raw: lines.join('\n'),
    header,
    body: (hasFooter ? paragraphs.slice(0, -1) : paragraphs).join('\n\n').trim(),
    footer: hasFooter ? last : '',
    hasLeadingBlank,
  }
}

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Header of the release commits created by relizy, from `templates.commitMessage`
 * (its variables match anything).
 */
function getReleaseCommitPattern(config: ResolvedRelizyConfig): RegExp | undefined {
  const template = config.templates?.commitMessage
  if (!template) {
    return undefined
  }
  const pattern = template
    .split(/\{\{\w+\}\}/)
    .map(escapeRegExp)
    .join('.+')
  return new RegExp(`^${pattern}$`)
}

const DEFAULT_IGNORES = [
  /^Merge /,
  /^(?:fixup|squash|amend)! /,
]

/**
 * Whether a message must not be linted: merge commits, autosquash commits and
 * the release commits of relizy (`defaultIgnores`), and the `ignores` of the config.
 */
export function isIgnoredCommitMessage(message: string, config: ResolvedRelizyConfig): boolean {
  const { header } = splitCommitMessage(message)
  const commitlint = config.commitlint ?? {}

  if (commitlint.defaultIgnores !== false) {
    const releasePattern = getReleaseCommitPattern(config)
    if (DEFAULT_IGNORES.some(pattern => pattern.test(header)) || releasePattern?.test(header)) {
      return true
    }
  }

  return (commitlint.ignores ?? []).some(ignore =>
    typeof ignore === 'function' ? ignore(message) : ignore.test(header),
  )
}
