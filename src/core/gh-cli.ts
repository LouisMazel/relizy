import { execFileSync } from 'node:child_process'

/**
 * The token of the GitHub CLI (`gh auth login`) for this host, none when `gh`
 * is not installed or not logged in: the GitHub token of a local run without
 * `GITHUB_TOKEN`
 */
export function getGhCliToken(hostname = 'github.com'): string | undefined {
  try {
    const token = execFileSync('gh', [
      'auth',
      'token',
      '--hostname',
      hostname,
    ], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim()
    return token || undefined
  }
  catch {
    return undefined
  }
}
