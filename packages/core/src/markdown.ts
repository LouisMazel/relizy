import type { CommitTypes, GitCommit, GitCommitAuthor, Reference, RepoConfig } from './types'
import { upperFirst } from '@maz-ui/utils/helpers/upperFirst'
import { convert } from 'convert-gitmoji'
import { isAIAttributionLine, isAIAuthor } from './ai-attribution'
import { getFirstCommit, stripNameStatus } from './git-refs'
import { formatCompareChanges, formatReference } from './repo-config'

const GITHUB_NOREPLY_EMAIL_REGEX = /^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i

/**
 * Which authors a changelog credits
 */
export interface ChangelogAuthorsOptions {
  /** Credit nobody */
  noAuthors?: boolean
  /** Authors left out: a name or an email containing one of these strings */
  excludeAuthors?: string[]
}

/**
 * How a changelog entry looks: what `buildChangelogBody()` and
 * `renderChangelog()` need from the config of a project
 */
export interface ChangelogBodyOptions {
  /** The commits to list, by type: the title of the section, `false` or a boolean leaves a type out. The order is the order of the sections */
  types: CommitTypes
  /** Repository the references link to */
  repo?: RepoConfig
  /** Add the body of the commits under their line (`false` by default) */
  includeCommitBody?: boolean
}

/**
 * The compare link of a release: `[compare changes](https://github.com/owner/repo/compare/v1.0.0...v1.1.0)`
 *
 * @param options - The repository and the two ends of the link
 * @param options.repo - Repository of the project, without it there is no link
 * @param options.cwd - Directory of the repository, where the first commit is read
 * @param options.from - Tag or commit the link starts from
 * @param options.to - Tag or commit the link ends at
 * @param options.isFirstCommit - `from` is the first commit of the repository, which the link then starts from
 * @returns The markdown link, an empty string when there is no repository, `from` or `to`
 * @example
 * ```ts
 * buildCompareLink({ repo, cwd: '/repo', from: 'v1.0.0', to: 'v1.1.0', isFirstCommit: false })
 * // '[compare changes](https://github.com/owner/repo/compare/v1.0.0...v1.1.0)'
 * ```
 */
export function buildCompareLink({ repo, cwd, from, to, isFirstCommit }: {
  repo?: RepoConfig
  cwd: string
  from: string
  to: string
  isFirstCommit: boolean
}): string {
  if (!repo || !from || !to) {
    return ''
  }

  return formatCompareChanges(to, {
    repo,
    from: isFirstCommit
      ? getFirstCommit(cwd)
      : from,
    to,
  })
}

/**
 * The sections of a changelog: a `###` section per commit type, in the order of
 * `types`, then the breaking changes (`#### Breaking Changes`). Gitmoji codes
 * (`:sparkles:`) are converted to emojis. Pure: no git nor network. Within a
 * section the commits are listed in the reverse of their order in `commits`.
 *
 * @param options - The commits and how the changelog looks
 * @param options.commits - The conventional commits, see `parseCommits()`; those of a type missing from `types` (or set to a boolean) are left out
 * @param options.types - The commit types: the title of their section, in this order
 * @param options.repo - Repository the references link to
 * @param options.includeCommitBody - Add the body of the commits under their line
 * @param options.minify - Only the line of each commit, without references nor body
 * @returns The markdown, an empty string when no commit has a listed type
 *
 * @example
 * ```ts
 * buildChangelogBody({ commits, types: { feat: { title: 'Features' } } })
 * // '### Features\n\n- Add a command'
 * ```
 */
export function buildChangelogBody({ commits, types, repo, includeCommitBody, minify }: ChangelogBodyOptions & {
  commits: GitCommit[]
  minify?: boolean
}): string {
  const typeGroups = groupBy(commits, 'type')

  const markdown: string[] = []
  const breakingChanges: string[] = []

  for (const type in types) {
    const group = typeGroups[type]
    if (!group || group.length === 0) {
      continue
    }

    if (typeof types[type] === 'boolean') {
      continue
    }

    markdown.push('', `### ${types[type]?.title}`, '')
    for (const commit of group.reverse()) {
      const line = formatCommit({
        commit,
        repo,
        includeCommitBody,
        minify,
      })
      markdown.push(line)
      if (commit.isBreaking) {
        breakingChanges.push(line)
      }
    }
  }

  if (breakingChanges.length > 0) {
    markdown.push('', '#### ⚠️ Breaking Changes', '', ...breakingChanges)
  }

  return convert(markdown.join('\n').trim(), true)
}

/**
 * The unique contributors of a set of commits, as plain formatted names (no
 * emails, no GitHub handles): the author and the `Co-authored-by` ones. Bots
 * (`[bot]`), AI tools and `excludeAuthors` are left out.
 *
 * @param options - The commits and the authors to leave out
 * @param options.commits - The conventional commits, see `parseCommits()`
 * @param options.noAuthors - Credit nobody
 * @param options.excludeAuthors - Names or emails containing one of these strings are left out
 * @returns The names, empty when `noAuthors` is set
 *
 * @example
 * ```ts
 * collectContributorNames({ commits, excludeAuthors: ['renovate'] })
 * // ['Jane Doe', 'John Smith']
 * ```
 */
export function collectContributorNames({ commits, noAuthors, excludeAuthors }: ChangelogAuthorsOptions & {
  commits: GitCommit[]
}): string[] {
  if (noAuthors) {
    return []
  }

  const names = new Set<string>()
  for (const author of commits.flatMap(getCommitAuthors)) {
    const name = formatName(author.name)
    // Bots and AI tools (`Co-authored-by: Claude <noreply@anthropic.com>`) are not contributors
    if (!name || name.includes('[bot]') || isAIAuthor(author)) {
      continue
    }
    if (
      excludeAuthors
      && excludeAuthors.some(
        v => name.includes(v) || author.email?.includes(v),
      )
    ) {
      continue
    }
    names.add(name)
  }
  return Array.from(names)
}

/**
 * Commit author followed by the co-authors parsed by `parseCommits` from the
 * `Co-authored-by:` trailers, so squash-merged contributions are credited.
 */
function getCommitAuthors(commit: GitCommit): GitCommitAuthor[] {
  return [
    commit.author,
    ...(commit.authors ?? []),
  ].filter(Boolean)
}

function getGithubUsernameFromNoreplyEmail(email: string): string | undefined {
  return GITHUB_NOREPLY_EMAIL_REGEX.exec(email)?.[1]
}

/**
 * The `Contributors` section of a changelog. On GitHub, the profile of each
 * contributor is looked up (the username of a noreply email, otherwise
 * `https://ungh.cc` by email then name, a network call whose failures are
 * ignored) and linked; on another provider no request is made. Contributors are
 * those of `collectContributorNames`.
 *
 * @param options - The commits, the repository and the authors to credit
 * @param options.commits - The conventional commits, see `parseCommits()`
 * @param options.repo - Repository of the project, the profiles are only looked up on GitHub
 * @param options.noAuthors - Credit nobody
 * @param options.excludeAuthors - Names or emails containing one of these strings are left out
 * @param options.hideAuthorEmail - Do not show the emails
 * @param options.onProgress - Called before the GitHub lookups, which can take a while
 * @returns The markdown, an empty string when there is no contributor
 *
 * @example
 * ```ts
 * await buildContributors({ commits, repo: { provider: 'github', repo: 'owner/name' } })
 * // '### ❤️ Contributors\n\n- Jane Doe ([@jane](https://github.com/jane))'
 * ```
 */
export async function buildContributors({ commits, repo, noAuthors, excludeAuthors, hideAuthorEmail, onProgress }: ChangelogAuthorsOptions & {
  commits: GitCommit[]
  repo?: RepoConfig
  hideAuthorEmail?: boolean
  onProgress?: (message: string) => void
}): Promise<string> {
  const names = collectContributorNames({ commits, noAuthors, excludeAuthors })
  if (names.length === 0) {
    return ''
  }

  const _authors = new Map<string, { email: Set<string>, github?: string, name?: string }>()
  for (const name of names) {
    _authors.set(name, {
      email: new Set<string>(),
      name,
    })
  }
  for (const author of commits.flatMap(getCommitAuthors)) {
    const name = formatName(author.name)
    const entry = _authors.get(name)
    if (entry && author.email) {
      entry.email.add(author.email)
    }
  }

  if (repo?.provider === 'github') {
    onProgress?.('Finding the GitHub profiles of the contributors')
    await Promise.all(
      Array.from(_authors.keys(), async (authorName) => {
        const meta = _authors.get(authorName)

        if (!meta) {
          return
        }

        // A GitHub noreply email already contains the username, no lookup needed
        const noreplyUsername = [...meta.email].map(getGithubUsernameFromNoreplyEmail).find(Boolean)
        if (noreplyUsername) {
          meta.github = noreplyUsername
          return
        }

        for (const data of [...meta.email, meta.name]) {
          const { user } = await fetch(`https://ungh.cc/users/find/${data}`)
            .then(r => r.json() as Promise<{ user: { username?: string } }>)
            .catch(() => ({ user: null }))

          if (user) {
            meta.github = user.username
            break
          }
        }
      }),
    )
  }

  const authors = Array.from(_authors.entries(), e => ({
    name: e[0],
    ...e[1],
  }))

  if (authors.length === 0) {
    return ''
  }

  const lines = [
    '### ' + '❤️ Contributors',
    '',
    ...authors.map((i) => {
      const _email = [...i.email].find(
        e => !e.includes('noreply.github.com'),
      )
      const email
        = hideAuthorEmail !== true && _email
          ? ` <${_email}>`
          : ''
      const github = i.github
        ? ` ([@${i.github}](https://github.com/${i.github}))`
        : ''
      return `- ${i.name}${github || email || ''}`
    }),
  ]

  return lines.join('\n')
}

// --- Internal utils ---

/**
 * Trailers without a hyphen, which reference an issue: `Closes #12`, `Fixes: #12`
 */
const REFERENCE_TRAILERS = new Set([
  'close',
  'closes',
  'closed',
  'fix',
  'fixes',
  'fixed',
  'resolve',
  'resolves',
  'resolved',
  'ref',
  'refs',
  'see',
  'cc',
  'link',
])

const BREAKING_TRAILER_REGEX = /^BREAKING[ -]CHANGE: /

/**
 * `Co-authored-by: ...`, `Signed-off-by: ...`, `Closes #12`: a plain word
 * (`Note: ...`) is text, not a trailer
 */
function isTrailerLine(line: string): boolean {
  const token = /^(?<token>[\w-]+)(?:: | #)/.exec(line)?.groups?.token
  return BREAKING_TRAILER_REGEX.test(line) || (!!token && (token.includes('-') || REFERENCE_TRAILERS.has(token.toLowerCase())))
}

/**
 * The body without its git trailers (its last paragraph, when made of
 * `Token: value` lines) and without the lines crediting an AI tool. A
 * `BREAKING CHANGE:` footer is kept: it tells how to migrate.
 */
function stripTrailers(body: string): string {
  const paragraphs = body
    .split('\n')
    .filter(line => !isAIAttributionLine(line))
    .join('\n')
    .split(/\n[ \t]*\n/)
    // A removed line can leave an empty paragraph
    .map(paragraph => paragraph.replace(/^\n+/, '').trimEnd())
    .filter(Boolean)

  const trailers = paragraphs.at(-1)?.split('\n') ?? []
  // A trailer value can continue on the next lines, indented
  if (!isTrailerLine(trailers[0] ?? '') || !trailers.every(line => isTrailerLine(line) || /^\s+\S/.test(line))) {
    return paragraphs.join('\n\n')
  }

  const breakingChanges = trailers.filter((line, index) => {
    const start = trailers.findLastIndex((candidate, candidateIndex) => candidateIndex <= index && !/^\s/.test(candidate))
    return BREAKING_TRAILER_REGEX.test(trailers[start] ?? '')
  })
  const content = paragraphs.slice(0, -1)
  // The separator GitHub writes before the trailers of a squash merge
  if (/^-{3,}$/.test(content.at(-1)?.trim() ?? '')) {
    content.pop()
  }

  return [
    ...content,
    ...(breakingChanges.length > 0
      ? [
          breakingChanges.join('\n'),
        ]
      : []),
  ].join('\n\n')
}

function getCommitBody(commit: GitCommit) {
  if (!commit.body) {
    return ''
  }

  // `getGitDiff` appends the `--name-status` list of the commit after its body
  const contentLines = stripTrailers(stripNameStatus(commit.body)).split('\n')

  // Keep a single blank line between paragraphs, none around the body
  // (a blank line is only kept after a content line, so none can lead)
  const paragraphLines = contentLines
    .filter((line, index) => line.trim() || contentLines[index - 1]?.trim())
  while (paragraphLines.length > 0 && !paragraphLines.at(-1)?.trim()) {
    paragraphLines.pop()
  }

  if (paragraphLines.length === 0) {
    return ''
  }

  const indentedBody = paragraphLines
    .map(line => line.trim()
      ? `  ${line}`
      : '')
    .join('\n')

  return `\n\n${indentedBody}\n`
}

function formatCommit({ commit, repo, includeCommitBody, minify }: {
  commit: GitCommit
  repo?: RepoConfig
  includeCommitBody?: boolean
  minify?: boolean
}) {
  const body = includeCommitBody && !minify
    ? getCommitBody(commit)
    : ''

  return (
    `- ${
      commit.scope
        ? `**${commit.scope.trim()}:** `
        : ''
    }${commit.isBreaking ? '⚠️  ' : ''
    }${upperFirst(commit.description)
    }${minify
      ? ''
      : formatReferences(commit.references, repo)}${body}`
  )
}

function formatReferences(
  references: Reference[],
  repo?: RepoConfig,
) {
  const pr = references.filter(ref => ref.type === 'pull-request')
  const issue = references.filter(ref => ref.type === 'issue')
  if (pr.length > 0 || issue.length > 0) {
    return (
      ` (${
        [
          ...pr,
          ...issue,
        ]
          .map(ref => formatReference(ref, repo))
          .join(', ')
      })`
    )
  }
  if (references.length > 0) {
    return ` (${formatReference(references[0]!, repo)})`
  }
  return ''
}

function formatName(name = '') {
  return name
    .split(' ')
    .map(p => upperFirst(p.trim()))
    .join(' ')
}

function groupBy(items: any[], key: string) {
  const groups: Record<string, any[]> = {}
  for (const item of items) {
    groups[item[key]] = groups[item[key]] || []
    groups[item[key]]?.push(item)
  }
  return groups
}
