import type { SocialChangelog } from '../types'
import type { ResolvedRelizyConfig } from './config'

/**
 * The changelog of a post, `false` being `none`
 */
export function getSocialChangelog(changelog: SocialChangelog | undefined, defaultChangelog: Exclude<SocialChangelog, false>): Exclude<SocialChangelog, false> {
  return changelog === false ? 'none' : changelog ?? defaultChangelog
}

/**
 * Extract a summary from changelog content
 */
export function extractChangelogSummary(changelog: string, { stripBoldMarkers = false, maxLength }: { stripBoldMarkers?: boolean, maxLength?: number } = {}): string {
  if (changelog.trim() === '') {
    return ''
  }

  // Drop markdown headers AND the blank lines around them - otherwise the
  // section spacing from the source changelog leaves runs of consecutive
  // newlines (e.g. `- Item A\n\n\n- Item B`) in the social post output.
  let cleaned = changelog
    .split('\n')
    .filter(line => !line.startsWith('#') && line.trim() !== '')
    .join('\n')

  if (stripBoldMarkers) {
    cleaned = cleaned.replace(/\*\*([^*]+):\*\*/g, '$1:')
  }

  cleaned = cleaned.trim()

  // The first lines (the commits) that fit, never a part of a line: a commit
  // ending with a period is not merged with the next one
  let summary = ''

  for (const line of cleaned.split('\n')) {
    const next = summary ? `${summary}\n${line}` : line

    if (maxLength && next.length > maxLength) {
      break
    }

    summary = next
  }

  return summary || cleaned.substring(0, maxLength)
}

/**
 * Get the release URL from repo config and release tag
 */
export function getReleaseUrl(config: ResolvedRelizyConfig, tag: string): string | undefined {
  const repo = config.repo
  if (!repo?.domain || !repo?.repo) {
    return undefined
  }

  const provider = repo.provider || 'github'
  // A package tag (`@scope/name@1.0.0`) is a single segment of the URL: GitLab answers 404 to its raw `/`.
  // `@` is valid in a path, kept readable
  const encodedTag = encodeURIComponent(tag).replaceAll('%40', '@')

  if (provider === 'github') {
    return `https://${repo.domain}/${repo.repo}/releases/tag/${encodedTag}`
  }
  else if (provider === 'gitlab') {
    return `https://${repo.domain}/${repo.repo}/-/releases/${encodedTag}`
  }
  else if (provider === 'bitbucket') {
    // Bitbucket doesn't have releases, link to the tag instead
    return `https://${repo.domain}/${repo.repo}/commits/tag/${encodedTag}`
  }

  return undefined
}

/**
 * The entries of a changelog, one per change: its bullets without the
 * markdown of the scope, the breaking changes first, without duplicates.
 */
export function extractChangelogHighlights(changelog: string): string[] {
  const highlights = changelog
    .split('\n')
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2).replace(/\*\*([^*]+):\*\*/g, '$1:').replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean)

  const unique = [...new Set(highlights)]

  return [...unique.filter(highlight => highlight.includes('⚠️')), ...unique.filter(highlight => !highlight.includes('⚠️'))]
}
