/** Edit distance between two words, to recognize typos */
export function getEditDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1)
      current.push(Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, substitution))
    }
    previous = current
  }
  return previous[b.length] ?? 0
}

/**
 * The candidate closest to a misspelled word, when the typo is small enough
 * to be confident (at most 2 edits, and less than half of the word).
 */
export function findClosest(word: string, candidates: string[]): string | undefined {
  const lower = word.toLowerCase()
  let best: { candidate: string, distance: number } | undefined
  for (const candidate of candidates) {
    const distance = getEditDistance(lower, candidate.toLowerCase())
    if (distance <= Math.min(2, Math.floor(word.length / 2)) && (!best || distance < best.distance)) {
      best = { candidate, distance }
    }
  }
  return best?.candidate
}

/** Types written in other conventions */
const TYPE_ALIASES: Record<string, string> = {
  feature: 'feat',
  features: 'feat',
  bugfix: 'fix',
  hotfix: 'fix',
  doc: 'docs',
  tests: 'test',
  performance: 'perf',
}

/** A header with spacing and case mistakes: `Feat (core) :Add thing.` */
const LOOSE_HEADER_PATTERN = /^(?<type>[a-z]+) ?(?:\((?<scope>[^()]*)\))? ?(?<breaking>!)? ?: ?(?<subject>\S.*)$/i

function suggestType(type: string, types: string[]): string {
  const lower = type.toLowerCase()
  if (types.includes(lower)) {
    return lower
  }
  const alias = TYPE_ALIASES[lower]
  if (alias && types.includes(alias)) {
    return alias
  }
  return findClosest(lower, types) ?? lower
}

function suggestScope(scope: string, allowedScopes: string[] | undefined): string {
  const cleaned = scope.trim().replaceAll(/\s+/g, '-')
  if (!allowedScopes || allowedScopes.includes(cleaned)) {
    return cleaned
  }
  return findClosest(cleaned, allowedScopes) ?? cleaned
}

function suggestSubject(subject: string, lowercase: boolean): string {
  let suggested = subject.trim()
  if (suggested.endsWith('.') && !suggested.endsWith('...')) {
    suggested = suggested.slice(0, -1)
  }
  // An uppercase first letter followed by a lowercase one: acronyms are kept
  return lowercase && /^[A-Z][^A-Z]/.test(suggested) ? `${suggested[0]!.toLowerCase()}${suggested.slice(1)}` : suggested
}

/**
 * The header with the mistakes that can be fixed safely: case and spacing of
 * the type, the scope and the colon, typos in the type and the scope, final
 * period of the subject (and its case with `lowercaseSubject`, for `subject-case`),
 * and the default revert message of git. `undefined` when nothing can be fixed.
 */
export function suggestHeader(header: string, { types, allowedScopes, lowercaseSubject = false }: { types: string[], allowedScopes?: string[], lowercaseSubject?: boolean }): string | undefined {
  const trimmed = header.trim()

  const revert = /^Revert "(?<reverted>.+)"$/.exec(trimmed)?.groups?.reverted
  if (revert) {
    return types.includes('revert') ? `revert: ${revert}` : undefined
  }

  const groups = LOOSE_HEADER_PATTERN.exec(trimmed)?.groups
  if (!groups) {
    return undefined
  }

  const type = suggestType(groups.type!, types)
  const scope = groups.scope === undefined || groups.scope.trim() === '' ? '' : `(${suggestScope(groups.scope, allowedScopes)})`
  const suggested = `${type}${scope}${groups.breaking ?? ''}: ${suggestSubject(groups.subject!, lowercaseSubject)}`
  return suggested === header ? undefined : suggested
}
