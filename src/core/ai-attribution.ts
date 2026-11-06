/**
 * The attributions to an AI coding tool that its commits carry: a co-author,
 * a session trailer, a "Generated with" line
 */

/**
 * Names of the AI coding tools, as they write their co-authors. A first name
 * alone (`Claude`) can be a person: the tools are matched by a full name
 * (`Claude Opus 4.5`) or by their email
 */
const AI_NAME_PATTERNS = [
  /^claude (?:code|opus|sonnet|haiku|fable)\b/i,
  /^(?:github )?copilot\b/i,
  /^cursor(?: agent)?$/i,
  /^chatgpt\b/i,
  /^codex\b/i,
  /^gemini\b/i,
  /^aider \(/i,
  /^windsurf\b/i,
]

/**
 * `Claude <noreply@anthropic.com>`, `Cursor <199161495+cursoragent@users.noreply.github.com>`...
 */
const AI_EMAIL_PATTERNS = [
  /^noreply@anthropic\.com$/i,
  /^noreply@openai\.com$/i,
  /^noreply@aider\.chat$/i,
  /^(?:\d+\+)?(?:cursoragent|copilot|devin-ai-integration\[bot\])@users\.noreply\.github\.com$/i,
]

/**
 * Trailers of the AI coding tools, besides their co-authors
 */
const AI_TRAILERS = ['claude-session', 'generated-by', 'assisted-by']

/**
 * `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
 */
const GENERATED_WITH_REGEX = /^\W*generated (?:with|by) \[?(?:claude code|cursor|copilot|codex|gemini|aider|windsurf|devin)\b/i

const CO_AUTHOR_TRAILER = 'co-authored-by:'

const TRAILER_REGEX = /^(?<token>[\w-]+):/

export interface AIAttributionOptions {
  /**
   * More names or emails of AI authors, matched as substrings
   */
  authors?: string[]
  /**
   * More trailers of AI tools: `Agent-Session`
   */
  trailers?: string[]
}

export function isAIAuthor(author: { name?: string, email?: string }, options?: AIAttributionOptions): boolean {
  const name = author.name?.trim() ?? ''
  const email = author.email?.trim() ?? ''
  const value = `${name} <${email}>`.toLowerCase()

  return AI_NAME_PATTERNS.some(pattern => pattern.test(name))
    || AI_EMAIL_PATTERNS.some(pattern => pattern.test(email))
    || (options?.authors ?? []).some(extra => extra.trim() && value.includes(extra.trim().toLowerCase()))
}

/**
 * `Name <email>` of a `Co-authored-by:` trailer
 */
function parseAuthor(value: string): { name: string, email: string } {
  const start = value.indexOf('<')
  const end = value.indexOf('>', start)

  return start === -1
    ? { name: value, email: '' }
    : { name: value.slice(0, start), email: value.slice(start + 1, end === -1 ? undefined : end) }
}

/**
 * Whether a line of a commit message credits an AI tool
 */
export function isAIAttributionLine(line: string, options?: AIAttributionOptions): boolean {
  const trimmed = line.trim()

  if (trimmed.toLowerCase().startsWith(CO_AUTHOR_TRAILER)) {
    return isAIAuthor(parseAuthor(trimmed.slice(CO_AUTHOR_TRAILER.length)), options)
  }

  const token = TRAILER_REGEX.exec(trimmed)?.groups?.token?.toLowerCase()
  if (token && [...AI_TRAILERS, ...(options?.trailers ?? []).map(trailer => trailer.toLowerCase())].includes(token)) {
    return true
  }

  return GENERATED_WITH_REGEX.test(trimmed)
}

/**
 * The lines of a commit message that credit an AI tool
 */
export function findAIAttributions(message: string, options?: AIAttributionOptions): string[] {
  return message.split('\n').map(line => line.trim()).filter(line => isAIAttributionLine(line, options))
}
