import { execFileSync } from 'node:child_process'

/**
 * The token of the GitHub CLI (`gh auth login`) for this host, none when `gh`
 * is not installed or not logged in: the GitHub token of a local run without
 * `GITHUB_TOKEN`. Runs `gh auth token --hostname <hostname>` with a 5 second timeout.
 *
 * @param hostname - The GitHub host to get the token of, `github.com` by default (a GitHub Enterprise Server host otherwise)
 * @returns The token, or undefined when `gh` is missing, not logged in for this host, times out or prints nothing
 * @example
 * ```ts
 * const token = process.env.GITHUB_TOKEN ?? getGhCliToken()
 * ```
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
