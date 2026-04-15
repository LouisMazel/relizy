import type { GitCommit, ResolvedChangelogConfig } from 'changelogen'
import type { ResolvedRelizyConfig } from './config'
import { upperFirst } from '@maz-ui/utils'
import { formatCompareChanges, formatReference } from 'changelogen'
import { convert } from 'convert-gitmoji'
import { fetch } from 'node-fetch-native'
import { getFirstCommit } from './git'

export interface Reference {
  type: 'hash' | 'issue' | 'pull-request'
  value: string
}

const CHANGELOG_RELEASE_HEAD_REGEX
  // eslint-disable-next-line sonarjs/slow-regex, regexp/no-super-linear-backtracking, regexp/optimal-quantifier-concatenation, regexp/no-misleading-capturing-group
  = /^#{2,}\s+(?:\S.*)?(v?(\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?)).*$/gm

const VERSION_REGEX = /^v?(\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?)$/

export function buildCompareLink({ config, from, to, isFirstCommit }: {
  config: ResolvedRelizyConfig
  from: string
  to: string
  isFirstCommit: boolean
}): string {
  if (!config.repo || !from || !to) {
    return ''
  }

  return formatCompareChanges(to, {
    ...config,
    from: isFirstCommit ? getFirstCommit(config.cwd) : from,
    to,
  } as ResolvedChangelogConfig)
}

export function buildChangelogBody({ commits, config, minify }: {
  commits: GitCommit[]
  config: ResolvedRelizyConfig
  minify?: boolean
}): string {
  const typeGroups = groupBy(commits, 'type')

  const markdown: string[] = []
  const breakingChanges: string[] = []

  for (const type in config.types) {
    const group = typeGroups[type]
    if (!group || group.length === 0) {
      continue
    }

    if (typeof config.types[type] === 'boolean') {
      continue
    }

    markdown.push('', `### ${config.types[type]?.title}`, '')
    for (const commit of group.reverse()) {
      const line = formatCommit({
        commit,
        config,
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

export async function buildContributors({ commits, config }: {
  commits: GitCommit[]
  config: ResolvedRelizyConfig
}): Promise<string> {
  if (config.noAuthors) {
    return ''
  }

  const _authors = new Map<string, { email: Set<string>, github?: string, name?: string }>()

  for (const commit of commits) {
    if (!commit.author) {
      continue
    }

    const name = formatName(commit.author.name)
    if (!name || name.includes('[bot]')) {
      continue
    }

    if (
      config.excludeAuthors
      && config.excludeAuthors.some(
        v => name.includes(v) || commit.author.email?.includes(v),
      )
    ) {
      continue
    }

    if (_authors.has(name)) {
      const entry = _authors.get(name)
      entry?.email.add(commit.author.email)
    }
    else {
      _authors.set(name, { email: new Set([commit.author.email]), name })
    }
  }

  if (config.repo?.provider === 'github') {
    await Promise.all(
      Array.from(_authors.keys(), async (authorName) => {
        const meta = _authors.get(authorName)

        if (!meta) {
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
        = config.hideAuthorEmail !== true && _email ? ` <${_email}>` : ''
      const github = i.github
        ? ` ([@${i.github}](https://github.com/${i.github}))`
        : ''
      return `- ${i.name}${github || email || ''}`
    }),
  ]

  return lines.join('\n')
}

export async function generateMarkDown({
  commits,
  config,
  from,
  to,
  isFirstCommit,
  minify,
}: {
  commits: GitCommit[]
  config: ResolvedRelizyConfig
  from: string
  to: string
  isFirstCommit: boolean
  minify?: boolean
}) {
  const updatedConfig = {
    ...config,
    from,
    to,
  }

  const changelogTitle = (updatedConfig.templates?.changelogTitle || '{{oldVersion}}...{{newVersion}}')
    .replace('{{oldVersion}}', updatedConfig.from)
    .replace('{{newVersion}}', updatedConfig.to)
    .replace('{{date}}', new Date().toISOString().split('T')[0] as string)
  const title = `## ${changelogTitle}`

  const compareLink = minify ? '' : buildCompareLink({ config: updatedConfig, from, to, isFirstCommit })

  const body = buildChangelogBody({ commits, config: updatedConfig, minify })

  const contributors = minify ? '' : await buildContributors({ commits, config: updatedConfig })

  return [title, compareLink, body, contributors].filter(Boolean).join('\n\n').trim()
}

export function parseChangelogMarkdown(contents: string) {
  const headings = [...contents.matchAll(CHANGELOG_RELEASE_HEAD_REGEX)]
  const releases: { version?: string, body: string }[] = []

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i]
    const nextHeading = headings[i + 1]
    const [, title] = heading as RegExpExecArray
    const version = title?.match(VERSION_REGEX)
    const release = {
      version: version ? version[1] : undefined,
      body: contents
        .slice(
          heading?.index as number + (heading?.[0]?.length || 0),
          nextHeading?.index as number ?? contents.length,
        )
        .trim(),
    }
    releases.push(release)
  }

  return {
    releases,
  }
}

// --- Internal utils ---

function getCommitBody(commit: GitCommit) {
  if (!commit.body) {
    return ''
  }

  const lines = commit.body.split('\n')

  const contentLines = lines.filter((line) => {
    const trimmedLine = line.trim()

    if (!trimmedLine) {
      return false
    }

    /**
     * Git diff status codes that appear in commit bodies:
     * - A: Added
     * - M: Modified (can include M000-M100 with break pairing)
     * - D: Deleted
     * - R: Renamed (R000-R100 with similarity score)
     * - C: Copied (C000-C100 with similarity score)
     * - T: Type changed
     * - U: Unmerged
     * - X: Unknown
     * - B: Broken pairing
     *
     * Pattern: Status code followed by whitespace and file path(s)
     */

    // Matches: [A|M|D|T|U|X|B] or [R|C|M][0-9]{3} followed by whitespace
    const isFileLine = /^[AMDTUXB](?:\d{3})?\s+/.test(trimmedLine) || /^[RCM]\d{3}\s+/.test(trimmedLine)

    return !isFileLine
  })

  if (contentLines.length === 0) {
    return ''
  }

  const indentedBody = contentLines
    .map(line => `  ${line}`)
    .join('\n')

  return `\n\n${indentedBody}\n`
}

function formatCommit({ commit, config, minify }: {
  commit: GitCommit
  config: ResolvedRelizyConfig
  minify?: boolean
}) {
  const body = config.changelog.includeCommitBody && !minify ? getCommitBody(commit) : ''

  return (
    `- ${
      commit.scope ? `**${commit.scope.trim()}:** ` : ''
    }${commit.isBreaking ? '⚠️  ' : ''
    }${upperFirst(commit.description)
    }${minify ? '' : formatReferences(commit.references, config)}${body}`
  )
}

function formatReferences(
  references: Reference[],
  config: ResolvedRelizyConfig,
) {
  const pr = references.filter(ref => ref.type === 'pull-request')
  const issue = references.filter(ref => ref.type === 'issue')
  if (pr.length > 0 || issue.length > 0) {
    return (
      ` (${
        [...pr, ...issue]
          .map(ref => formatReference(ref, config.repo))
          .join(', ')
      })`
    )
  }
  if (references.length > 0) {
    return ` (${formatReference(references[0] as Reference, config.repo)})`
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
