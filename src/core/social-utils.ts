import type { ResolvedRelizyConfig } from './config'

/**
 * Extract a summary from changelog content
 */
export function extractChangelogSummary(changelog: string, maxLength: number = 150): string {
  // Remove markdown headers
  const cleaned = changelog
    .split('\n')
    .filter(line => !line.startsWith('#'))
    .join('\n')
    .trim()

  // Get first few lines or sentences
  const sentences = cleaned.split(/[.!?]\s+/)
  let summary = ''

  for (const sentence of sentences) {
    if ((summary + sentence).length > maxLength) {
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
