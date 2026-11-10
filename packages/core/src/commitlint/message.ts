/**
 * A commit message split into its parts, before any conventional parsing.
 */
export interface CommitMessageParts {
  /** Full message, comments removed, trailing blank lines trimmed */
  raw: string
  /** First line of the message */
  header: string
  /** Text between the header and the footer, trimmed */
  body: string
  /** Trailing `Token: value` paragraph, empty when the message has none */
  footer: string
  /** Whether a blank line separates the header from the rest of the message */
  hasLeadingBlank: boolean
}

/** The line `git commit --verbose` adds before the diff */
const SCISSORS_LINE = '------------------------ >8 ------------------------'

/**
 * Remove what git strips from a message edited in the editor: the comment lines
 * and everything after the scissors line of `git commit --verbose`. CRLF line
 * endings are converted to LF.
 * @param message - Content of the message file
 * @param commentChar - Character starting a comment line, see `getCommentChar`
 * @returns The message without comment lines
 * @example
 * ```ts
 * stripGitComments('feat: add it\n# Please enter the message') // 'feat: add it'
 * ```
 */
export function stripGitComments(message: string, commentChar = '#'): string {
  const lines = message.replaceAll('\r\n', '\n').split('\n')
  const scissors = lines.findIndex(line => line.startsWith(commentChar) && line.includes(SCISSORS_LINE))
  return lines
    .slice(0, scissors === -1
      ? lines.length
      : scissors)
    .filter(line => !line.startsWith(commentChar))
    .join('\n')
}

/** `Token: value`, `Token #value` or `BREAKING CHANGE: value` lines, as defined by Conventional Commits */
function isFooterLine(line: string): boolean {
  return /^(?:BREAKING[ -]CHANGE|[\w-]+)(?:: | #)/.test(line)
}

/**
 * Split a message into header, body and footer. The footer is the last
 * paragraph when it starts with a `Token: value` line: as in Conventional
 * Commits, a footer value can continue on the next lines. Trailing blank lines
 * are dropped, but not trailing spaces of the header.
 * @param message - The full commit message
 * @returns The parts of the message
 * @example
 * ```ts
 * splitCommitMessage('feat(core): add it\n\nDetails.\n\nCloses #12')
 * // { raw: '...', header: 'feat(core): add it', body: 'Details.', footer: 'Closes #12', hasLeadingBlank: true }
 * ```
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
  const hasFooter = isFooterLine(last.split('\n')[0] ?? '')

  return {
    raw: lines.join('\n'),
    header,
    body: (hasFooter
      ? paragraphs.slice(0, -1)
      : paragraphs).join('\n\n').trim(),
    footer: hasFooter ? last : '',
    hasLeadingBlank,
  }
}

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Headers of the release commits of a tool, from the templates of their title
 * (the variables, `{{newVersion}}`, match anything).
 */
function getReleaseCommitPatterns(templates: string[]): RegExp[] {
  return templates.map((title) => {
    const pattern = title
      .split(/\{\{\w+\}\}/)
      .map(escapeRegExp)
      .join('.+')
    return new RegExp(`^${pattern}$`)
  })
}

const DEFAULT_IGNORES = [
  /^Merge /,
  /^(?:fixup|squash|amend)! /,
]

/** What `isIgnoredCommitMessage` ignores, besides the merge and autosquash commits */
export interface IgnoredCommitOptions {
  /**
   * Ignore merge commits, `fixup!`, `squash!` and `amend!` commits, and the
   * release commits (`releaseCommitMessages`)
   * @default true
   */
  defaultIgnores?: boolean
  /** Titles of the release commits of the tool, `{{variable}}` placeholders match anything */
  releaseCommitMessages?: string[]
  /** Messages to ignore: a regular expression tested against the header, or a function receiving the raw message */
  ignores?: Array<RegExp | ((message: string) => boolean)>
}

/**
 * Whether a message must not be linted: merge commits, autosquash commits and
 * the release commits (`defaultIgnores`), and the `ignores`.
 * @param message - The full commit message
 * @param options - What to ignore
 * @param options.defaultIgnores - Ignore merge, `fixup!`, `squash!`, `amend!` and release commits, `true` unless set to `false`
 * @param options.releaseCommitMessages - Titles of the release commits, `{{variable}}` placeholders match anything
 * @param options.ignores - Extra ignores: a regular expression tested against the header, or a function receiving the raw message
 * @returns `true` when the message must be skipped
 * @example
 * ```ts
 * isIgnoredCommitMessage('Merge branch "main"') // true
 * isIgnoredCommitMessage('chore(release): v1.2.0', { releaseCommitMessages: ['chore(release): v{{newVersion}}'] }) // true
 * ```
 */
export function isIgnoredCommitMessage(message: string, { defaultIgnores, releaseCommitMessages = [], ignores = [] }: IgnoredCommitOptions = {}): boolean {
  const { header } = splitCommitMessage(message)

  if (defaultIgnores !== false && [
    ...DEFAULT_IGNORES,
    ...getReleaseCommitPatterns(releaseCommitMessages),
  ].some(pattern => pattern.test(header))) {
    return true
  }

  return ignores.some(ignore =>
    typeof ignore === 'function'
      ? ignore(message)
      : ignore.test(header),
  )
}
