import { getGithubApiUrl } from './github-api'
import { getGitlabAuthHeader, isGitlabJobToken } from './gitlab-auth'

/**
 * The commit status of a release in CI: written by `relizy release` with
 * `release.report.status`, read by any program following the release.
 *
 * The contract: the context (GitHub) or name (GitLab) `relizy/release`, and a
 * description whose first word is the phase (`running`, `released`, `canary`,
 * `nothing`, `failed`, `cancelled`). A new step id or a new text after `:` is
 * additive; a new phase is read as `unknown` by older readers; changing the
 * context or the meaning of a first word is a breaking change, shipped as a new
 * context (`relizy/release/v2`) next to the old one for one major.
 */

/**
 * The context (GitHub) or name (GitLab) of the commit status of a release: the
 * key a program reads, and a repository may require in a ruleset.
 *
 * @example
 * ```ts
 * statuses.find(status => status.context === RELEASE_STATUS_CONTEXT)
 * ```
 */
export const RELEASE_STATUS_CONTEXT = 'relizy/release'

/** GitHub does not document the limit of a description, 140 characters is safe on GitHub and GitLab */
const MAX_LENGTH = 140

/** Where a release stands, `unknown` for a status written by something else or by a newer relizy */
export type ReleaseStatusPhase = 'running' | 'released' | 'nothing' | 'failed' | 'cancelled' | 'unknown'

/** A moment of a release, as `formatReleaseStatus()` writes it */
export type ReleaseStatusUpdate
  = | { phase: 'running', step: string, label?: string }
    | { phase: 'released', version?: string, packages?: number, canary?: boolean }
    | { phase: 'nothing' }
    | { phase: 'failed', step: string, message?: string }
    | { phase: 'cancelled', step: string }

/** A commit status as the forge stores it */
export interface ReleaseStatusPost {
  /** GitHub: `pending`, `success`, `failure`, `error`; GitLab: `running`, `success`, `failed`, `canceled` */
  state: string
  description: string
}

/** What a commit status tells about the release */
export interface ParsedReleaseStatus {
  phase: ReleaseStatusPhase
  /** The step running, failed or cancelled: a step of `RELEASE_STEPS` (`publish`, `push`...) */
  step?: string
  /** What the running step does: `Publishing the packages` */
  label?: string
  /** The first line of the error of a failed release */
  message?: string
  /** The released version (unified or standalone release, canary) */
  version?: string
  /** The count of released packages, without a single version */
  packages?: number
  /** A canary release */
  canary?: boolean
}

const STATES: Record<Exclude<ReleaseStatusPhase, 'unknown'>, { github: string, gitlab: string }> = {
  running: { github: 'pending', gitlab: 'running' },
  released: { github: 'success', gitlab: 'success' },
  nothing: { github: 'success', gitlab: 'success' },
  failed: { github: 'failure', gitlab: 'failed' },
  cancelled: { github: 'error', gitlab: 'canceled' },
}

function cut(text: string): string {
  const characters = Array.from(text)
  return characters.length > MAX_LENGTH
    ? `${characters.slice(0, MAX_LENGTH - 3).join('')}...`
    : text
}

function mask(text: string, secrets: string[]): string {
  return secrets.filter(secret => secret.length >= 4).reduce((masked, secret) => masked.replaceAll(secret, '***'), text)
}

function describe(update: ReleaseStatusUpdate, secrets: string[]): string {
  switch (update.phase) {
    case 'running':
      return `running ${update.step}${update.label
        ? `: ${update.label}`
        : ''}`
    case 'released':
      if (update.canary && update.version) {
        return `canary ${update.version}`
      }
      if (update.version) {
        return `released ${update.version}`
      }
      return update.packages === undefined
        ? 'released'
        : `released ${update.packages} ${update.packages === 1
          ? 'package'
          : 'packages'}`
    case 'nothing':
      return 'nothing to release'
    case 'failed': {
      const message = update.message?.split('\n').find(line => line.trim())?.trim()
      return `failed ${update.step}${message
        ? `: ${mask(message, secrets)}`
        : ''}`
    }
    case 'cancelled':
      return `cancelled ${update.step}`
  }
}

/**
 * The commit status of a moment of a release: its state on the forge and its
 * description, at most 140 characters (cut with `...`). The secrets given are
 * masked in the error message of a failed release.
 *
 * @param update - The moment of the release: running a step, released, nothing to release, failed, cancelled
 * @param options - The forge, and the secrets to mask in an error message
 * @param options.provider - `github` or `gitlab`: the states differ (`pending` and `running`, `failure` and `failed`...)
 * @param options.secrets - Values masked as `***` in the error message (the tokens of the run)
 * @returns The `state` and the `description` to post
 * @example
 * ```ts
 * formatReleaseStatus({ phase: 'running', step: 'publish', label: 'Publishing the packages' }, { provider: 'github' })
 * // { state: 'pending', description: 'running publish: Publishing the packages' }
 * formatReleaseStatus({ phase: 'released', version: '1.2.0' }, { provider: 'gitlab' })
 * // { state: 'success', description: 'released 1.2.0' }
 * ```
 */
export function formatReleaseStatus(update: ReleaseStatusUpdate, { provider, secrets = [] }: { provider: 'github' | 'gitlab', secrets?: string[] }): ReleaseStatusPost {
  return {
    state: STATES[update.phase][provider],
    description: cut(describe(update, secrets)),
  }
}

function hasState(phase: Exclude<ReleaseStatusPhase, 'unknown'>, state: string): boolean {
  return state === STATES[phase].github || state === STATES[phase].gitlab
}

/** The text after `<word> <step>: `, split in the step and its text */
function parseStep(rest: string): { step: string, text?: string } | undefined {
  const match = /^([a-z][a-z-]*)(?:: (.*))?$/s.exec(rest)
  return match
    ? {
        step: match[1]!,
        ...(match[2]
          ? { text: match[2] }
          : {}),
      }
    : undefined
}

/** The phase of a description whose first word is a step phase (`running publish: ...`) */
function parseStepPhase(phase: 'running' | 'failed' | 'cancelled', text: 'label' | 'message' | undefined, rest: string, state: string): ParsedReleaseStatus | undefined {
  const step = parseStep(rest)
  if (!step || !hasState(phase, state) || (!text && step.text)) {
    return undefined
  }

  return {
    phase,
    step: step.step,
    ...(text && step.text
      ? { [text]: step.text }
      : {}),
  }
}

function parseReleased(rest: string, state: string): ParsedReleaseStatus | undefined {
  if (!hasState('released', state)) {
    return undefined
  }
  const packages = /^(\d+) packages?$/.exec(rest)
  if (packages) {
    return {
      phase: 'released',
      packages: Number(packages[1]),
    }
  }

  return rest
    ? { phase: 'released', version: rest }
    : { phase: 'released' }
}

/** The parser of each first word, from the text after it and the state */
const PARSERS: Record<string, (rest: string, state: string, description: string) => ParsedReleaseStatus | undefined> = {
  running: (rest, state) => parseStepPhase('running', 'label', rest, state),
  failed: (rest, state) => parseStepPhase('failed', 'message', rest, state),
  cancelled: (rest, state) => parseStepPhase('cancelled', undefined, rest, state),
  released: parseReleased,
  canary: (rest, state) => rest && hasState('released', state)
    ? { phase: 'released', version: rest, canary: true }
    : undefined,
  nothing: (_rest, state, description) => description === 'nothing to release' && hasState('nothing', state)
    ? { phase: 'nothing' }
    : undefined,
}

function parseKnown(state: string, description: string): ParsedReleaseStatus | undefined {
  const space = description.indexOf(' ')
  const word = space === -1
    ? description
    : description.slice(0, space)
  const rest = space === -1
    ? ''
    : description.slice(space + 1)

  return Object.hasOwn(PARSERS, word)
    ? PARSERS[word]!(rest, state, description)
    : undefined
}

/**
 * What a commit status `relizy/release` tells about the release. A description
 * it does not know, or one that does not match its state (`released` on a
 * `pending` status), is `unknown`: something happened, read the run page,
 * never an error.
 *
 * @param status - The commit status, as the forge returns it
 * @param status.state - The state on the forge (`pending`, `running`, `success`, `failure`, `failed`, `error`, `canceled`)
 * @param status.description - The description written by `formatReleaseStatus()`
 * @returns The phase of the release, with the step, label, message, version or packages it carries
 * @example
 * ```ts
 * parseReleaseStatus({ state: 'failure', description: 'failed push: rejected' })
 * // { phase: 'failed', step: 'push', message: 'rejected' }
 * ```
 */
export function parseReleaseStatus({ state, description }: { state: string, description: string }): ParsedReleaseStatus {
  return parseKnown(state, description ?? '') ?? { phase: 'unknown' }
}

/** A release status read from the forge */
export interface ReleaseStatus extends ParsedReleaseStatus {
  /** The state on the forge */
  state: string
  description: string
  /** The page of the CI run that wrote it */
  url?: string
  /** When it was last written (ISO 8601) */
  updatedAt?: string
}

interface GithubCommitStatus {
  state: string
  context: string
  description: string | null
  target_url: string | null
  updated_at?: string
}

interface GitlabCommitStatus {
  status: string
  name: string
  description: string | null
  target_url: string | null
  created_at?: string
  started_at?: string | null
  finished_at?: string | null
}

async function getJson<T>(url: string, headers: Record<string, string>, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { accept: 'application/json', ...headers },
  })
  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    const message = `[GET] "${url}": ${response.status} ${response.statusText}`
    throw new Error(errorText
      ? `${message} ${errorText}`
      : message)
  }
  return await response.json() as T
}

function toStatus(state: string, description: string | null, url: string | null, updatedAt: string | null | undefined): ReleaseStatus {
  const text = description ?? ''
  return {
    ...parseReleaseStatus({ state, description: text }),
    state,
    description: text,
    ...(url
      ? { url }
      : {}),
    ...(updatedAt
      ? { updatedAt }
      : {}),
  }
}

/**
 * Reads the last commit status `relizy/release` of a commit from the forge, to
 * follow a release in CI while it runs. A status still `pending` or `running`
 * after its run ended is stale (the job was killed): check the run of `url`.
 * The GitLab job token cannot read commit statuses. Makes a network call.
 *
 * @param options - The forge, the repository, the token and the commit
 * @param options.provider - `github` or `gitlab`
 * @param options.repo - The `owner/name` of the repository (GitHub) or the path of the project (GitLab)
 * @param options.domain - The host of the forge, `github.com` or `gitlab.com` by default
 * @param options.token - A token that can read the repository (GitHub), with the `read_api` or `api` scope (GitLab)
 * @param options.sha - The commit the release started from (the push of the CI run)
 * @param options.ref - GitLab: the branch or tag of the pipeline (its API reads the default branch without it)
 * @param options.fetch - The `fetch` to use, the global one by default
 * @returns The status with what it tells (`phase`, `step`, `version`...), `undefined` when the commit has none
 * @throws When the forge answers with an error: `[GET] "<url>": <status> <statusText>` followed by its response, or for the GitLab job token
 * @example
 * ```ts
 * const status = await readReleaseStatus({ provider: 'github', repo: 'acme/app', token, sha })
 * if (status?.phase === 'running') console.log(`relizy runs ${status.step}`)
 * ```
 */
export async function readReleaseStatus({ provider, repo, domain, token, sha, ref, fetch: fetchImpl = fetch }: {
  provider: 'github' | 'gitlab'
  repo: string
  domain?: string
  token: string
  sha: string
  ref?: string
  fetch?: typeof fetch
}): Promise<ReleaseStatus | undefined> {
  if (provider === 'github') {
    const url = `${getGithubApiUrl(domain || 'github.com')}/repos/${repo}/commits/${sha}/statuses?per_page=100`
    // Newest first: the first one is the last written
    const statuses = await getJson<GithubCommitStatus[]>(url, { 'authorization': `Bearer ${token}`, 'x-github-api-version': '2022-11-28' }, fetchImpl)
    const status = statuses.find(candidate => candidate.context.toLowerCase() === RELEASE_STATUS_CONTEXT)
    return status && toStatus(status.state, status.description, status.target_url, status.updated_at)
  }

  if (isGitlabJobToken(token)) {
    throw new Error('The CI_JOB_TOKEN of GitLab cannot read commit statuses: use a project, group or personal access token with the read_api scope')
  }
  const query = new URLSearchParams({
    name: RELEASE_STATUS_CONTEXT,
    all: 'true',
    order_by: 'id',
    sort: 'desc',
    ...(ref
      ? { ref }
      : {}),
  })
  const url = `https://${domain || 'gitlab.com'}/api/v4/projects/${encodeURIComponent(repo)}/repository/commits/${sha}/statuses?${query}`
  const statuses = await getJson<GitlabCommitStatus[]>(url, getGitlabAuthHeader(token), fetchImpl)
  const status = statuses.find(candidate => candidate.name === RELEASE_STATUS_CONTEXT)
  return status && toStatus(status.status, status.description, status.target_url, status.finished_at ?? status.started_at ?? status.created_at)
}
