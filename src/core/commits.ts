import type { GitCommit, GitCommitAuthor, RawGitCommit, Reference } from '../types'

/**
 * Conventional commit parsing, ported from changelogen 0.6.2 without behavior
 * change: https://github.com/unjs/changelogen/blob/v0.6.2/src/git.ts
 *
 * MIT License - Copyright (c) Pooya Parsa <pooya@pi0.io>
 */

export interface ParseCommitsConfig {
  /** Renames the scopes of the commits (`{ ui: 'components' }`) */
  scopeMap?: Record<string, string>
}

// https://www.conventionalcommits.org/en/v1.0.0/
// https://regex101.com/r/FSfNvA/1
// eslint-disable-next-line sonarjs/super-linear-regex, sonarjs/regex-complexity, sonarjs/empty-string-repetition, regexp/no-useless-quantifier
const CONVENTIONAL_COMMIT_REGEX = /(?<emoji>:.+:|(\uD83C[\uDF00-\uDFFF])|(\uD83D[\uDC00-\uDE4F\uDE80-\uDEFF])|[\u2600-\u2B55])?( *)?(?<type>[a-z]+)(\((?<scope>.+)\))?(?<breaking>!)?: (?<description>.+)/i
// eslint-disable-next-line sonarjs/super-linear-regex, regexp/no-super-linear-backtracking, regexp/no-misleading-capturing-group
const CO_AUTHORED_BY_REGEX = /co-authored-by:\s*(?<name>.+)(<(?<email>.+)>)/gi
const PULL_REQUEST_REGEX = /\([ a-z]*(#\d+)\s*\)/g
const ISSUE_REGEX = /(#\d+)/g
const BREAKING_BODY_REGEX = /breaking change:/i

/**
 * Parse the commits following the conventional commits, the others are left out
 */
export function parseCommits(commits: RawGitCommit[], config: ParseCommitsConfig): GitCommit[] {
  return commits
    .map(commit => parseGitCommit(commit, config))
    .filter((commit): commit is GitCommit => Boolean(commit))
}

export function parseGitCommit(commit: RawGitCommit, config: ParseCommitsConfig): GitCommit | null {
  const match = commit.message.match(CONVENTIONAL_COMMIT_REGEX)
  if (!match?.groups) {
    return null
  }

  const type = match.groups.type!
  const hasBreakingBody = BREAKING_BODY_REGEX.test(commit.body)

  let scope = match.groups.scope || ''
  scope = config.scopeMap?.[scope] || scope

  const isBreaking = Boolean(match.groups.breaking || hasBreakingBody)
  let description = match.groups.description!

  // Extract references from message
  const references: Reference[] = []
  for (const m of description.matchAll(PULL_REQUEST_REGEX)) {
    references.push({ type: 'pull-request', value: m[1]! })
  }
  for (const m of description.matchAll(ISSUE_REGEX)) {
    if (!references.some(reference => reference.value === m[1])) {
      references.push({ type: 'issue', value: m[1]! })
    }
  }
  references.push({ value: commit.shortHash, type: 'hash' })

  // Remove references and normalize
  description = description.replace(PULL_REQUEST_REGEX, '').trim()

  // Find all authors
  const authors: GitCommitAuthor[] = [commit.author]
  for (const coAuthor of commit.body.matchAll(CO_AUTHORED_BY_REGEX)) {
    authors.push({
      name: (coAuthor.groups?.name || '').trim(),
      email: (coAuthor.groups?.email || '').trim(),
    })
  }

  return {
    ...commit,
    authors,
    description,
    type,
    scope,
    references,
    isBreaking,
  }
}
