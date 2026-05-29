import type { ResolvedRelizyConfig } from './config'

/**
 * Extract a summary from changelog content
 */
export function extractChangelogSummary(changelog: string, { stripBoldMarkers = false, maxLength }: { stripBoldMarkers?: boolean, maxLength?: number } = {}): string {
  if (changelog.trim() === '') {
    return ''
  }

  // Drop markdown headers AND the blank lines around them — otherwise the
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

  // remove trailing punctuation
  let cleanedResult = cleaned
  if (cleanedResult.endsWith('?') || cleanedResult.endsWith('!') || cleanedResult.endsWith('.')) {
    cleanedResult = cleanedResult.slice(0, -1)
  }

  // Get first few lines or sentences
  const sentences = cleanedResult.split(/[.!?]\s+/)

  let summary = ''

  for (const sentence of sentences) {
    if ((maxLength && (summary + sentence).length > maxLength) || sentence.trim() === '') {
      break
    }
    summary += `${sentence}. `
  }

  return summary.trim() || cleaned.substring(0, maxLength)
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

  if (provider === 'github') {
    return `https://${repo.domain}/${repo.repo}/releases/tag/${tag}`
  }
  else if (provider === 'gitlab') {
    return `https://${repo.domain}/${repo.repo}/-/releases/${tag}`
  }
  else if (provider === 'bitbucket') {
    // Bitbucket doesn't have releases, link to the tag instead
    return `https://${repo.domain}/${repo.repo}/commits/tag/${tag}`
  }

  return undefined
}
