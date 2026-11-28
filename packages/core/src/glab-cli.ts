import { execFileSync } from 'node:child_process'

/** The output of a glab command, none when it fails, times out or prints nothing */
function runGlab(args: string[], timeout = 5000): string | undefined {
  try {
    return execFileSync('glab', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout,
    }).trim() || undefined
  }
  catch {
    return undefined
  }
}

/** Whether the OAuth token of glab for this host expires within the minute (false for a personal access token) */
function isGlabOAuthTokenExpired(hostname: string): boolean {
  const expiry = Date.parse(runGlab([
    'config',
    'get',
    'oauth2_expiry_date',
    '--host',
    hostname,
  ]) ?? '')
  return !Number.isNaN(expiry) && expiry <= Date.now() + 60_000
}

/**
 * The token of the GitLab CLI (`glab auth login`) for this host, none when
 * `glab` is not installed or not logged in: the GitLab token of a local run
 * without `GITLAB_TOKEN`. Runs `glab config get token --host <hostname>` with a 5 second timeout.
 * An OAuth token (`glab auth login` in the browser) expires after two hours
 * and glab only refreshes it on an API call: when it is expired, runs
 * `glab api user` first, then reads the refreshed token.
 *
 * @param hostname - The GitLab host to get the token of, `gitlab.com` by default (a self-managed host otherwise)
 * @returns The token, or undefined when `glab` is missing, not logged in for this host, times out or prints nothing
 * @example
 * ```ts
 * const token = process.env.GITLAB_TOKEN ?? getGlabCliToken('gitlab.acme.com')
 * ```
 */
export function getGlabCliToken(hostname = 'gitlab.com'): string | undefined {
  const readToken = () => runGlab([
    'config',
    'get',
    'token',
    '--host',
    hostname,
  ])
  const token = readToken()
  if (!token || !isGlabOAuthTokenExpired(hostname)) {
    return token
  }

  runGlab([
    'api',
    'user',
    '--hostname',
    hostname,
    '--silent',
  ], 10_000)
  return readToken() ?? token
}
