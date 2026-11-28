import type { TrustedPublishingProvider } from './npm-oidc'
import type { CoreLogger } from './types'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { getTrustedPublishingProvider, isNpmjsRegistry } from './npm-oidc'
import { isPackageOnRegistry } from './npm-versions'
import { redactSecrets } from './redact'

type Env = NodeJS.ProcessEnv

/**
 * How a publish to one registry authenticates, read from the environment:
 * - `oidc`: npmjs, no token, the job can get an ID token (trusted publishing)
 * - `token`: a token is set for the registry
 * - `npmrc`: neither, whatever the `.npmrc` files hold (a login session, a token written by the job)
 */
export type PublishAuthMode = 'oidc' | 'token' | 'npmrc'

/** The auth mode of a publish to one registry, see `getPublishAuth` */
export interface PublishAuth {
  mode: PublishAuthMode
  /** The CI provider that can get an ID token: set with `oidc`, and with `token` when `tokenFallback` */
  provider?: TrustedPublishingProvider
  /** A token is set and the job can also get an ID token on npmjs: npm tries trusted publishing first and falls back to the token */
  tokenFallback?: boolean
}

/**
 * How a publish to a registry authenticates, from the environment only: no
 * command runs and no request is sent
 *
 * @param options - Registry, token and environment.
 * @param options.registry - Registry URL to publish to.
 * @param options.token - Token of the registry target, if any (`tokens.registry`, `RELIZY_NPM_TOKEN`, `NPM_TOKEN`, `NODE_AUTH_TOKEN` or the token of the target).
 * @param options.env - Environment to read (`process.env` by default).
 * @returns `{ mode: 'oidc', provider }` on npmjs without token in a job that can get an ID token; `{ mode: 'token' }` with a token, plus `tokenFallback: true` and `provider` when the job can also get an ID token on npmjs; `{ mode: 'npmrc' }` otherwise (another registry without token is always `npmrc`).
 * @example
 * ```ts
 * getPublishAuth({ registry: 'https://registry.npmjs.org/', token: undefined, env: process.env })
 * // { mode: 'oidc', provider: 'GitHub Actions' } in a GitHub job with id-token: write
 * getPublishAuth({ registry: 'https://registry.npmjs.org/', token: 'npm_abc', env: {} })
 * // { mode: 'token' }
 * ```
 */
export function getPublishAuth({ registry, token, env = process.env }: { registry: string, token: string | undefined, env?: Env }): PublishAuth {
  const provider = isNpmjsRegistry(registry)
    ? getTrustedPublishingProvider(env)
    : undefined

  if (token) {
    return provider
      ? { mode: 'token', provider, tokenFallback: true }
      : { mode: 'token' }
  }

  return provider
    ? { mode: 'oidc', provider }
    : { mode: 'npmrc' }
}

/**
 * Why npm does not support trusted publishing on the runner of the job, when
 * it can tell: a GitHub self-hosted runner (`RUNNER_ENVIRONMENT=self-hosted`)
 * or a GitLab instance other than gitlab.com (`CI_SERVER_HOST`). CircleCI
 * exposes no variable telling a self-hosted runner, so it is never reported.
 *
 * @param env - Environment to read (`process.env` by default).
 * @returns A sentence naming the runner, `undefined` when the runner is supported or unknown.
 * @example
 * ```ts
 * getUnsupportedRunnerReason({ GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'self-hosted' })
 * // 'npm does not support trusted publishing from GitHub self-hosted runners'
 * ```
 */
export function getUnsupportedRunnerReason(env: Env = process.env): string | undefined {
  if (env.GITHUB_ACTIONS === 'true' && env.RUNNER_ENVIRONMENT === 'self-hosted') {
    return 'npm does not support trusted publishing from GitHub self-hosted runners'
  }

  if (env.GITLAB_CI === 'true' && env.CI_SERVER_HOST && env.CI_SERVER_HOST !== 'gitlab.com') {
    return `npm does not support trusted publishing from GitLab self-managed instances (${env.CI_SERVER_HOST}), only from gitlab.com`
  }

  return undefined
}

/**
 * The result of a trusted publishing exchange for one package:
 * - `matched`: npm gave a publish token, a trusted publisher configuration matches this job
 * - `no-match`: npm refused the exchange (`httpStatus` and `message` from its answer)
 * - `missing-package`: the package is not on npm yet, and OIDC cannot create a package
 * - `unknown`: no answer could be read (network, timeout, no ID token)
 */
export interface TrustedPublisherCheck {
  status: 'matched' | 'no-match' | 'missing-package' | 'unknown'
  /** HTTP status of the exchange, when npm answered */
  httpStatus?: number
  /** The reason npm or relizy gives */
  message?: string
}

function getAudience(registry: string): string {
  return `npm:${new URL(registry).hostname}`
}

function readJwtAudience(idToken: string): string[] | undefined {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as { aud?: string | string[] }
    if (payload.aud === undefined) {
      return undefined
    }
    return Array.isArray(payload.aud)
      ? payload.aud
      : [payload.aud]
  }
  catch {
    return undefined
  }
}

async function getIdToken({ registry, env, timeoutMs }: { registry: string, env: Env, timeoutMs: number }): Promise<string | undefined> {
  // npm reads NPM_ID_TOKEN first, for every provider (lib/utils/oidc.js)
  if (env.NPM_ID_TOKEN) {
    return env.NPM_ID_TOKEN
  }

  if (!env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
    return undefined
  }

  const url = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL)
  url.searchParams.append('audience', getAudience(registry))

  const response = await fetch(url, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    return undefined
  }

  const json = await response.json() as { value?: string }
  return json.value || undefined
}

async function readErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text()
    try {
      const json = JSON.parse(text) as { message?: string, error?: string }
      return redactSecrets(json.message || json.error || text) || undefined
    }
    catch {
      return redactSecrets(text) || undefined
    }
  }
  catch {
    return undefined
  }
}

/**
 * Checks before a publish that npm trusts this CI job to publish a package:
 * does the trusted publishing exchange npm does at publish time (ID token of
 * the job, then `POST <registry>/-/npm/v1/oidc/token/exchange/package/<name>`)
 * and throws the publish token away: it is never logged, returned nor reused.
 * npm itself swallows a failed exchange and then fails with a misleading
 * `ENEEDAUTH`; this check tells it before anything is written.
 *
 * @param options - Registry, package and environment.
 * @param options.registry - Registry URL (npmjs).
 * @param options.packageName - Package to publish, scoped names included.
 * @param options.env - Environment to read the ID token from (`process.env` by default): `NPM_ID_TOKEN` (GitLab, CircleCI, or set by hand), else the GitHub Actions request variables.
 * @param options.timeoutMs - Timeout of each request in milliseconds (15000 by default).
 * @param options.logger - Receives a debug message when no answer could be read.
 * @returns The status of the exchange, see `TrustedPublisherCheck`. Never throws.
 * @example
 * ```ts
 * const check = await checkTrustedPublisher({ registry: 'https://registry.npmjs.org/', packageName: '@scope/pkg' })
 * if (check.status === 'no-match') console.warn(check.httpStatus, check.message)
 * ```
 */
export async function checkTrustedPublisher({
  registry,
  packageName,
  env = process.env,
  timeoutMs = 15000,
  logger,
}: {
  registry: string
  packageName: string
  env?: Env
  timeoutMs?: number
  logger?: CoreLogger
}): Promise<TrustedPublisherCheck> {
  try {
    const idToken = await getIdToken({ registry, env, timeoutMs })
    if (!idToken) {
      logger?.debug?.(`Trusted publishing check of ${packageName}: no ID token in this job`)
      return { status: 'unknown', message: 'no ID token in this job' }
    }

    const audience = getAudience(registry)
    const tokenAudience = readJwtAudience(idToken)
    if (tokenAudience && !tokenAudience.includes(audience)) {
      return { status: 'no-match', message: `the ID token has the audience "${tokenAudience.join(', ')}", npm expects "${audience}"` }
    }

    const base = registry.endsWith('/')
      ? registry
      : `${registry}/`
    const response = await fetch(`${base}-/npm/v1/oidc/token/exchange/package/${packageName.replace('/', '%2f')}`, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${idToken}` },
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (response.ok) {
      // The body holds a publish token: never read beyond the status
      await response.body?.cancel()
      return { status: 'matched', httpStatus: response.status }
    }

    const message = await readErrorMessage(response)
    const exists = await isPackageOnRegistry({
      name: packageName,
      registry,
      timeoutMs,
      logger,
    })
    if (exists === false) {
      return { status: 'missing-package', httpStatus: response.status, message }
    }

    if (response.status >= 500) {
      logger?.debug?.(`Trusted publishing check of ${packageName}: HTTP ${response.status}`)
      return { status: 'unknown', httpStatus: response.status, message }
    }

    return { status: 'no-match', httpStatus: response.status, message }
  }
  catch (error) {
    logger?.debug?.(`Trusted publishing check of ${packageName} failed: ${error instanceof Error
      ? error.message
      : String(error)}`)
    return { status: 'unknown' }
  }
}
