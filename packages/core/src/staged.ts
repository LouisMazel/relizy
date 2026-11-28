import type { CoreLogger } from './types'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { isInCI } from './ci-env'
import { getTrustedPublishingProvider, isNpmjsRegistry, readToolVersion } from './npm-oidc'
import { isVersionPublished } from './npm-versions'
import { isOtpError } from './publish'
import { InteractiveAuthRequiredError, STAGED_PUBLISHING_NPM_VERSION, StagingUnavailableError } from './stage-publish'

/**
 * The staged versions of npm: list, view, approve and reject them through the
 * npm CLI (npm 11.15.0+), with the npm login of the person, never a token of
 * the environment. See https://docs.npmjs.com/staged-publishing
 */

type Env = NodeJS.ProcessEnv

/**
 * A version that a run staged, as the release report and the events give it
 *
 * @example
 * ```ts
 * const staged: StagedVersion = { name: '@scope/pkg', version: '1.2.0', tag: 'latest', registry: 'https://registry.npmjs.org/', stageId: '2f1c...' }
 * ```
 */
export interface StagedVersion {
  name: string
  version: string
  /** Dist-tag fixed at staging */
  tag: string
  registry: string
  /** Id of the stage, when the output of npm gave it */
  stageId?: string
  /** Approved later in the same run */
  approved?: boolean
}

/** A version awaiting approval in the staging area of npm, as `npm stage list` gives it */
export interface StagedEntry {
  stageId: string
  name: string
  version: string
  tag: string
  /** `validating` (malware scan), `staged`, `awaiting_approval`, or another status of npm kept as is */
  status: string
  createdAt?: string
  /** Who staged it */
  actor?: string
  actorType?: string
  access?: string
  shasum?: string
}

/**
 * The state of one version, the call an app polls:
 * - `validating`: staged, the malware scan runs, not approvable yet
 * - `staged`: awaiting approval
 * - `installable`: published, in the packument
 * - `rejected-or-gone`: neither staged nor published (rejected, or never staged)
 * - `unknown`: npm could not be asked
 */
export type StagedState = 'validating' | 'staged' | 'installable' | 'rejected-or-gone' | 'unknown'

/** The result of the approval of one version, see `approveStagedVersions` */
export interface ApproveResult {
  name: string
  version: string
  stageId: string
  status: 'approved' | 'skipped' | 'failed'
  /** Why it was skipped or failed: `validating`, `not staged`, `dependency <name> not approved`, `web-auth`, `otp`, `cancelled`, or the error of npm */
  reason?: string
  /** With `web-auth`: where to approve on the web */
  url?: string
}

/**
 * Runs one npm command and gives its output: the default one runs npm without
 * a terminal; relizy injects an interactive one (terminal inherited) for
 * security-key accounts, which need npm's web 2FA flow
 *
 * @example
 * ```ts
 * const runner: NpmCommandRunner = async (args, { env, cwd, timeoutMs }) => myExec('npm', args, { env, cwd, timeoutMs })
 * ```
 */
export type NpmCommandRunner = (args: string[], options: {
  /** A neutral directory: no project `.npmrc` overrides the login */
  cwd: string
  /** Merged over `process.env`, the token variables blanked */
  env: Record<string, string>
  timeoutMs: number
}) => Promise<{ stdout: string }>

/** The common options of the staged version functions */
export interface StagedCallOptions {
  /** Root of the project (the packument check of `getStagedState`) */
  cwd: string
  /** Registry URL (npmjs) */
  registry: string
  /** Runs npm, the default one runs it without a terminal */
  runner?: NpmCommandRunner
  /** Environment to check for a CI or trusted publishing (`process.env` by default) */
  env?: Env
  /** Timeout of each npm call in milliseconds (60000 by default) */
  timeoutMs?: number
  logger?: CoreLogger
  /** Shows the web 2FA page of a security-key account, then the call goes on once validated; without it, such an account gets `web-auth` */
  onWebAuth?: WebAuthHandler
}

/**
 * The token variables blanked for the calls that need the login of a person:
 * a token exported in the shell, or a `_authToken=${NPM_TOKEN}` of an `.npmrc`,
 * must not override it. Variables in the `NPM_CONFIG_//<registry>/:_authToken`
 * form are not covered: they are configuration of npm itself.
 */
const BLANKED_TOKENS = { NPM_TOKEN: '', NODE_AUTH_TOKEN: '', RELIZY_NPM_TOKEN: '' }

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const SAFE_ARG = /^[\w@./:%+=-]+$/

/**
 * A neutral working directory: npm reads the `.npmrc` of the nearest
 * directory with a `package.json` upward, and a project `.npmrc` resolving a
 * token variable to an empty value would hide the login of the user config
 */
function getNeutralCwd(): string {
  return tmpdir()
}

/**
 * The error npm gives for a failure: with `--json` it writes it on stdout,
 * after any plain text, and the message of `execFile` lacks it
 */
function getNpmJsonError(stdout: string): { code?: string, summary?: string } | undefined {
  const start = stdout.search(/^\{/m)
  if (start === -1) {
    return undefined
  }
  try {
    return (JSON.parse(stdout.slice(start)) as { error?: { code?: string, summary?: string } }).error
  }
  catch {
    return undefined
  }
}

/**
 * The stage and trust commands are run with the npm CLI, whatever the package
 * manager of the project: an npm without them (or no npm) is told as such
 */
function getOutdatedNpmError(command: string): StagingUnavailableError {
  const found = readToolVersion('npm', tmpdir())
  const state = found
    ? `npm ${found} is installed and has no "npm ${command}" command`
    : 'npm was not found'
  return new StagingUnavailableError(`Relizy runs "npm ${command}" with the npm CLI, whatever the package manager of the project: it needs npm ${STAGED_PUBLISHING_NPM_VERSION} or later, and ${state}.\nUpdate the npm CLI (not pnpm, yarn or bun): npm install -g npm@latest`)
}

/**
 * Runs npm without a terminal and keeps its output on a failure: the `--json`
 * error of npm on stdout holds the web 2FA links, its stderr masks them
 */
export const runNpmCommand: NpmCommandRunner = (args, { cwd, env, timeoutMs }) => {
  for (const arg of args) {
    if (!SAFE_ARG.test(arg)) {
      return Promise.reject(new Error(`Unsafe argument for npm: ${arg}`))
    }
  }

  return new Promise((resolve, reject) => {
    execFile('npm', args, {
      cwd,
      env: {
        ...process.env,
        ...env,
      },
      timeout: timeoutMs,
      // `npm stage list --json` of a big monorepo exceeds the 1 MB default
      maxBuffer: 64 * 1024 * 1024,
      shell: process.platform === 'win32',
    }, (error, stdout, stderr) => {
      if (error) {
        const npmError = getNpmJsonError(String(stdout))
        if (npmError?.code === 'EUNKNOWNCOMMAND' || (error as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(getOutdatedNpmError(args[0] ?? 'stage'))
          return
        }
        const reason = npmError?.summary || npmError?.code
        if (reason) {
          // An expired or missing login: say how to get one
          const login = npmError?.code === 'E401' || npmError?.code === 'ENEEDAUTH' || /unable to authenticate/i.test(reason)
            ? '\nLog in to npm with "npm login", then run the command again'
            : ''
          error.message = `${error.message.split('\n')[0]}\n${reason}${login}`
        }
        reject(Object.assign(error, {
          stdout: String(stdout),
          stderr: String(stderr),
        }))
        return
      }
      resolve({
        stdout: String(stdout),
      })
    })
  })
}

/**
 * Throws when the action needs the npm login of a person and cannot have it:
 * in a CI, or in a job that can get an OIDC token (trusted publishing). npm
 * refuses the stage subcommands and trust with OIDC tokens, and approval needs
 * an interactive 2FA.
 *
 * @param env - Environment to read (`process.env` by default).
 * @throws `InteractiveAuthRequiredError` in a CI or under trusted publishing.
 * @example
 * ```ts
 * assertInteractiveNpmAuth() // throws in GitHub Actions
 * ```
 */
export function assertInteractiveNpmAuth(env: Env = process.env): void {
  if (isInCI(env) || getTrustedPublishingProvider(env)) {
    throw new InteractiveAuthRequiredError('Staged versions can only be listed and approved from your npm login (npm login), not from a CI')
  }
}

function getErrorText(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return String(error)
  }
  const record = error as Record<string, unknown>
  return [record.message, record.stdout, record.stderr]
    .filter(value => typeof value === 'string')
    .join('\n')
}

function isNotFoundError(error: unknown): boolean {
  return /\bE404\b|404 Not Found/i.test(getErrorText(error))
}

/**
 * The web 2FA page npm gives a security-key account instead of asking for a
 * code, when there is no terminal (`authUrl` of its EOTP error)
 */
function getWebAuthUrl(error: unknown): string | undefined {
  return getWebAuth(error)?.authUrl
}

/** What the web 2FA of npm needs: the page the person opens, and the address relizy polls */
export interface WebAuthRequest {
  /** The page of npmjs.com where the person validates with their security key */
  url: string
  /** What the 2FA is for */
  purpose: 'approve' | 'reject' | 'trust' | 'publish'
}

/**
 * Called when npm asks a security-key account for its web 2FA: show `url`
 * to the person. Checking "skip 2FA for the next 5 minutes" on the page lets
 * the next calls of the batch run without asking again
 */
export type WebAuthHandler = (request: WebAuthRequest) => void | Promise<void>

/**
 * The web 2FA links of an `EOTP` error of npm (`authUrl`, `doneUrl` of its
 * `--json` output), `undefined` for another error
 *
 * @param error - The error of an npm command run with `--json`.
 * @returns `{ authUrl, doneUrl }`, or `undefined`.
 * @example
 * ```ts
 * getWebAuth(error)?.authUrl // 'https://www.npmjs.com/auth/cli/f807c3a4-...'
 * ```
 */
export function getWebAuth(error: unknown): { authUrl: string, doneUrl: string } | undefined {
  const text = getErrorText(error)
  const authUrl = /"authUrl"\s*:\s*"([^"]+)"/.exec(text)?.[1]
  const doneUrl = /"doneUrl"\s*:\s*"([^"]+)"/.exec(text)?.[1]
  return authUrl && doneUrl && !authUrl.includes('***')
    ? { authUrl, doneUrl }
    : undefined
}

/**
 * Waits for the person to validate the web 2FA of npm: polls `doneUrl`
 * (202 while pending) until it gives the one-time token npm accepts as
 * `--otp` once
 *
 * @param options - The address and the waits.
 * @param options.doneUrl - The `doneUrl` of the `EOTP` error of npm.
 * @param options.timeoutMs - Longest wait (300000 by default).
 * @param options.pollMs - Interval between two polls (2000 by default).
 * @returns The token, `undefined` when the page expired or the wait timed out.
 * @example
 * ```ts
 * const token = await waitForWebAuth({ doneUrl })
 * ```
 */
export async function waitForWebAuth({ doneUrl, timeoutMs = 300_000, pollMs = 2000 }: { doneUrl: string, timeoutMs?: number, pollMs?: number }): Promise<string | undefined> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    try {
      const response = await fetch(doneUrl, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      })
      if (response.status === 200) {
        const { token } = await response.json() as { token?: string }
        return token || undefined
      }
      if (response.status !== 202) {
        return undefined
      }
    }
    catch {
      // A network hiccup: polled again
    }
    await sleep(pollMs)
  }
  return undefined
}

/**
 * Runs an npm call that may need the 2FA of the person: on the web 2FA of a
 * security-key account, `onWebAuth` shows the page, the token npm gives once
 * validated is passed as `--otp`, and the call runs again (the page shown again, three times at most, when npm asks again)
 */
export async function withWebAuth<T>(run: (otp: string | undefined) => Promise<T>, { otp, onWebAuth, purpose }: { otp?: string, onWebAuth?: WebAuthHandler, purpose: WebAuthRequest['purpose'] }): Promise<T> {
  let code = otp
  // npm can ask again right after a validation: the page is shown again, three times at most
  for (let attempt = 0; ; attempt++) {
    try {
      return await run(code)
    }
    catch (error) {
      const auth = getWebAuth(error)
      // A token of the page refused: once validated (and "skip 2FA for 5 minutes" checked), the call can pass without code, else npm gives a new page
      if (!auth && onWebAuth && code !== undefined && code !== otp && isOtpError(error) && attempt < 3) {
        code = undefined
        continue
      }
      if (!auth || !onWebAuth || attempt === 3) {
        throw error
      }
      await onWebAuth({ url: auth.authUrl, purpose })
      const token = await waitForWebAuth({ doneUrl: auth.doneUrl })
      if (!token) {
        throw error
      }
      code = token
    }
  }
}

function parseJsonOutput(stdout: string): unknown {
  const trimmed = stdout.trim()
  if (!trimmed) {
    return undefined
  }
  try {
    return JSON.parse(trimmed)
  }
  catch {
    const start = trimmed.search(/[[{]/)
    return start === -1
      ? undefined
      : JSON.parse(trimmed.slice(start))
  }
}

function toEntry(item: Record<string, unknown>): StagedEntry | undefined {
  const stageId = item.id ?? item.stageId
  const name = item.packageName ?? item.name
  if (typeof stageId !== 'string' || typeof name !== 'string' || typeof item.version !== 'string') {
    return undefined
  }

  const optional = (key: string) => typeof item[key] === 'string'
    ? item[key] as string
    : undefined

  return {
    stageId,
    name,
    version: item.version,
    tag: optional('tag') ?? 'latest',
    status: optional('status') ?? 'staged',
    createdAt: optional('createdAt'),
    actor: optional('actor'),
    actorType: optional('actorType'),
    access: optional('access'),
    shasum: optional('shasum'),
  }
}

/**
 * The entries of the JSON of `npm stage list` (a bare array, or the
 * `{ items }` envelope of the registry) or `npm stage view` (one object)
 *
 * @param stdout - Output of the npm command.
 * @returns The staged versions; what is not an entry is dropped, an unknown status is kept as is.
 * @example
 * ```ts
 * parseStagedEntries('[{"id":"2f1c...","packageName":"pkg","version":"1.0.0","tag":"latest","status":"staged"}]')
 * // [{ stageId: '2f1c...', name: 'pkg', version: '1.0.0', tag: 'latest', status: 'staged' }]
 * ```
 */
export function parseStagedEntries(stdout: string): StagedEntry[] {
  const json = parseJsonOutput(stdout)
  const items = Array.isArray(json)
    ? json
    : typeof json === 'object' && json !== null && Array.isArray((json as { items?: unknown }).items)
      ? (json as { items: unknown[] }).items
      : json
        ? [json]
        : []

  return items
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map(toEntry)
    .filter((entry): entry is StagedEntry => entry !== undefined)
}

function getRunner(options: StagedCallOptions) {
  const runner = options.runner ?? runNpmCommand
  const timeoutMs = options.timeoutMs ?? 60_000
  return (args: string[]) => runner([...args, '--registry', options.registry], {
    cwd: getNeutralCwd(),
    env: BLANKED_TOKENS,
    timeoutMs,
  })
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length })
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index]!)
    }
  }
  await Promise.all(Array.from({
    length: Math.min(concurrency, items.length),
  }, worker))
  return results
}

/**
 * The versions awaiting approval (`npm stage list --json`), with the npm login
 * of the person: the token variables of the environment are blanked and npm
 * runs from a neutral directory, so no project `.npmrc` hides the login
 *
 * @param options - Registry, packages and runner.
 * @param options.cwd - Root of the project.
 * @param options.registry - Registry URL (npmjs).
 * @param options.packageNames - Only these packages (one call each, four at a time); every staged version of the login otherwise.
 * @param options.runner - Runs npm (the default one without a terminal).
 * @param options.env - Environment to check (`process.env` by default).
 * @param options.timeoutMs - Timeout of each npm call (60000 by default).
 * @param options.logger - Receives debug messages.
 * @returns The staged versions; a package npm answers 404 for has none.
 * @throws `InteractiveAuthRequiredError` in a CI or under trusted publishing; the error of npm otherwise (not logged in, npm too old).
 * @example
 * ```ts
 * const staged = await listStagedVersions({ cwd: '/repo', registry: 'https://registry.npmjs.org/', packageNames: ['@scope/core'] })
 * // [{ stageId: '2f1c...', name: '@scope/core', version: '1.2.0', tag: 'latest', status: 'staged', ... }]
 * ```
 */
export async function listStagedVersions(options: StagedCallOptions & {
  /** Only these packages */
  packageNames?: string[]
}): Promise<StagedEntry[]> {
  assertInteractiveNpmAuth(options.env)
  const run = getRunner(options)

  if (!options.packageNames) {
    return parseStagedEntries((await run(['stage', 'list', '--json'])).stdout)
  }

  const lists = await mapWithConcurrency(options.packageNames, 4, async (name) => {
    try {
      return parseStagedEntries((await run(['stage', 'list', name, '--json'])).stdout)
    }
    catch (error) {
      if (isNotFoundError(error)) {
        options.logger?.debug?.(`No staged version of ${name}`)
        return []
      }
      throw error
    }
  })

  return lists.flat()
}

/**
 * One staged version (`npm stage view <id> --json`), with the npm login of
 * the person (see `listStagedVersions`)
 *
 * @param options - Registry, stage id and runner.
 * @param options.cwd - Root of the project.
 * @param options.registry - Registry URL (npmjs).
 * @param options.stageId - Id of the stage.
 * @param options.runner - Runs npm.
 * @param options.env - Environment to check.
 * @param options.timeoutMs - Timeout of the npm call.
 * @param options.logger - Receives debug messages.
 * @returns The staged version, `undefined` once it was approved or rejected (npm answers 404).
 * @throws `InteractiveAuthRequiredError` in a CI or under trusted publishing; the error of npm otherwise.
 * @example
 * ```ts
 * const entry = await getStagedVersion({ cwd: '/repo', registry: 'https://registry.npmjs.org/', stageId: '2f1c...' })
 * entry?.status // 'validating'
 * ```
 */
export async function getStagedVersion(options: StagedCallOptions & { stageId: string }): Promise<StagedEntry | undefined> {
  assertInteractiveNpmAuth(options.env)

  try {
    return parseStagedEntries((await getRunner(options)([
      'stage',
      'view',
      options.stageId,
      '--json',
    ])).stdout)[0]
  }
  catch (error) {
    if (isNotFoundError(error)) {
      return undefined
    }
    throw error
  }
}

async function decideStaged(action: 'approve' | 'reject', options: StagedCallOptions & { stageId: string, otp?: string }): Promise<void> {
  assertInteractiveNpmAuth(options.env)
  await withWebAuth(otp => getRunner(options)([
    'stage',
    action,
    options.stageId,
    '--json',
    ...(otp
      // `npm trust` takes `--otp <code>` for a positional argument: one form for every command
      ? [`--otp=${otp}`]
      : []),
  ]), { otp: options.otp, onWebAuth: options.onWebAuth, purpose: action })
}

/**
 * Approve one staged version with 2FA (`npm stage approve <id>`): it becomes
 * installable. Run with the npm login of the person (see `listStagedVersions`).
 *
 * @param options - Registry, stage id, code and runner.
 * @param options.cwd - Root of the project.
 * @param options.registry - Registry URL (npmjs).
 * @param options.stageId - Id of the stage.
 * @param options.otp - The 2FA code, passed as `--otp`.
 * @param options.runner - Runs npm; an interactive one lets npm ask for the code or open its web 2FA page.
 * @param options.env - Environment to check.
 * @param options.timeoutMs - Timeout of the npm call.
 * @param options.logger - Receives debug messages.
 * @returns Resolves once npm approved it.
 * @throws `InteractiveAuthRequiredError` in a CI or under trusted publishing; the error of npm otherwise (see `isOtpError`).
 * @example
 * ```ts
 * await approveStagedVersion({ cwd: '/repo', registry: 'https://registry.npmjs.org/', stageId: '2f1c...', otp: '123456' })
 * ```
 */
export async function approveStagedVersion(options: StagedCallOptions & { stageId: string, otp?: string }): Promise<void> {
  await decideStaged('approve', options)
}

/**
 * Reject one staged version with 2FA (`npm stage reject <id>`): final, the
 * version number stays taken. Run with the npm login of the person.
 *
 * @param options - Registry, stage id, code and runner.
 * @param options.cwd - Root of the project.
 * @param options.registry - Registry URL (npmjs).
 * @param options.stageId - Id of the stage.
 * @param options.otp - The 2FA code, passed as `--otp`.
 * @param options.runner - Runs npm.
 * @param options.env - Environment to check.
 * @param options.timeoutMs - Timeout of the npm call.
 * @param options.logger - Receives debug messages.
 * @returns Resolves once npm rejected it.
 * @throws `InteractiveAuthRequiredError` in a CI or under trusted publishing; the error of npm otherwise.
 * @example
 * ```ts
 * await rejectStagedVersion({ cwd: '/repo', registry: 'https://registry.npmjs.org/', stageId: '2f1c...', otp: '123456' })
 * ```
 */
export async function rejectStagedVersion(options: StagedCallOptions & { stageId: string, otp?: string }): Promise<void> {
  await decideStaged('reject', options)
}

/**
 * Where to approve staged versions on the web, with the 2FA of the account
 * (the "Staged Packages" tab of the account settings of npmjs.com, which
 * approves up to 100 versions at once)
 *
 * @param options - The registry.
 * @param options.registry - Registry URL.
 * @returns The npmjs.com URL, `undefined` for another registry.
 * @example
 * ```ts
 * getStagedApprovalUrl({ registry: 'https://registry.npmjs.org/' }) // 'https://www.npmjs.com/settings'
 * ```
 */
export function getStagedApprovalUrl({ registry }: { registry: string }): string | undefined {
  // The docs only say "in your account settings": the exact URL of the tab
  // is read during the real validation
  return isNpmjsRegistry(registry)
    ? 'https://www.npmjs.com/settings'
    : undefined
}

function sortByDependencies<T extends { name: string, dependencies?: string[] }>(versions: T[]): T[] {
  // Several versions of one package can await approval: each one is kept
  const byName = new Map<string, T[]>()
  for (const version of versions) {
    byName.set(version.name, [
      ...byName.get(version.name) ?? [],
      version,
    ])
  }
  const sorted: T[] = []
  const visited = new Set<T>()

  function visit(version: T, path: Set<string>) {
    if (visited.has(version) || path.has(version.name)) {
      return
    }
    path.add(version.name)
    for (const dependency of version.dependencies ?? []) {
      for (const staged of byName.get(dependency) ?? []) {
        visit(staged, path)
      }
    }
    path.delete(version.name)
    visited.add(version)
    sorted.push(version)
  }

  for (const version of versions) {
    visit(version, new Set())
  }
  return sorted
}

type ApproveOptions = StagedCallOptions & {
  versions: { name: string, version: string, stageId: string, dependencies?: string[] }[]
  getOtp: (request: { purpose: 'approve', count: number }) => string | undefined | Promise<string | undefined>
  /** A code to try first, before `getOtp` */
  otp?: string
  onItem?: (result: ApproveResult) => void
  /** Called once per version npm is still scanning, before waiting for it */
  onValidating?: (version: { name: string, version: string }) => void
  waitMs?: number
  maxWaitMs?: number
}

/** The staged version once its malware scan is over, or at the end of the wait */
async function waitWhileValidating(options: ApproveOptions, version: { name: string, version: string, stageId: string }): Promise<StagedEntry | undefined> {
  const { waitMs = 20_000, maxWaitMs = 300_000, logger } = options
  let entry = await getStagedVersion({ ...options, stageId: version.stageId })
  const waitUntil = Date.now() + maxWaitMs

  if (entry?.status === 'validating') {
    options.onValidating?.({ name: version.name, version: version.version })
  }
  while (entry?.status === 'validating' && Date.now() < waitUntil) {
    logger?.debug?.(`${version.name}@${version.version} is still validating, next check in ${waitMs / 1000}s`)
    await sleep(waitMs)
    entry = await getStagedVersion({ ...options, stageId: version.stageId })
  }

  return entry
}

/**
 * Approve staged versions with one 2FA: the heart of the approval, for the
 * `stage` command, the approval step of a release and apps.
 *
 * - only the versions given, never every version of the account;
 * - dependencies first (`dependencies` names the other given versions a version depends on);
 * - each version is tried first without code (or with `otp`): npm then offers its web 2FA page, given to `onWebAuth`, and the approval goes on once validated (a security key or a passkey has no code to type);
 * - `getOtp()` only when npm needs a code it cannot get on the web (no `onWebAuth`, or the page expired), the code reused for every version, asked again only when npm refuses it, then the version retried;
 * - a version still `validating` (malware scan) is waited for (`waitMs` interval, `maxWaitMs` at most), then skipped;
 * - a version whose dependency was not approved is skipped;
 * - without `onWebAuth` and without code from `getOtp`, a version npm gives its web 2FA page for fails with reason `web-auth` and `url`.
 *
 * @param options - Registry, versions, code and runner.
 * @param options.cwd - Root of the project.
 * @param options.registry - Registry URL (npmjs).
 * @param options.versions - The versions to approve, with their stage id and the given versions they depend on.
 * @param options.getOtp - Gives the 2FA code when npm needs one (`purpose` approve, `count` versions it covers); `undefined` or an empty string: cancelled.
 * @param options.otp - A code to try first, before `getOtp`.
 * @param options.onWebAuth - Shows the web 2FA page of npm, see `withWebAuth`.
 * @param options.onItem - Called with the result of each version, as it is known.
 * @param options.onValidating - Called once per version npm is still scanning (`validating`), before waiting for it.
 * @param options.runner - Runs npm.
 * @param options.waitMs - Interval between two checks of a `validating` version (20000 by default).
 * @param options.maxWaitMs - Longest wait for a `validating` version (300000 by default).
 * @param options.env - Environment to check.
 * @param options.timeoutMs - Timeout of each npm call.
 * @param options.logger - Receives debug messages.
 * @returns One result per version, in the order they were tried.
 * @throws `InteractiveAuthRequiredError` in a CI or under trusted publishing (nothing could be tried).
 * @example
 * ```ts
 * const results = await approveStagedVersions({
 *   cwd: '/repo',
 *   registry: 'https://registry.npmjs.org/',
 *   versions: [{ name: '@scope/core', version: '1.2.0', stageId: 'a...' }, { name: '@scope/cli', version: '1.2.0', stageId: 'b...', dependencies: ['@scope/core'] }],
 *   getOtp: () => askTheUser(),
 * })
 * ```
 */
export async function approveStagedVersions(options: ApproveOptions): Promise<ApproveResult[]> {
  assertInteractiveNpmAuth(options.env)

  const { versions, getOtp, onItem } = options
  const results: ApproveResult[] = []
  const notApproved = new Set<string>()
  let otp = options.otp
  let cancelled = false

  const record = (result: ApproveResult) => {
    results.push(result)
    if (result.status !== 'approved') {
      notApproved.add(result.name)
    }
    onItem?.(result)
  }

  const askOtp = async (remaining: number) => {
    otp = await getOtp({ purpose: 'approve', count: remaining }) || undefined
    return otp
  }

  /**
   * Approves one version: without code first (the web 2FA of npm), the code
   * asked when npm needs one, and asked again once when npm refuses it
   */
  const approve = async (stageId: string, remaining: number): Promise<Pick<ApproveResult, 'status' | 'reason' | 'url'>> => {
    let url: string | undefined
    try {
      await approveStagedVersion({ ...options, stageId, otp })
      return { status: 'approved' }
    }
    catch (error) {
      url = getWebAuthUrl(error)
      if (!url && !isOtpError(error)) {
        throw error
      }
    }

    if (!await askOtp(remaining)) {
      if (url) {
        return { status: 'failed', reason: 'web-auth', url: getStagedApprovalUrl(options) ?? url }
      }
      cancelled = true
      return { status: 'skipped', reason: 'cancelled' }
    }
    await approveStagedVersion({ ...options, stageId, otp })
    return { status: 'approved' }
  }

  for (const [index, version] of sortByDependencies(versions).entries()) {
    const base = { name: version.name, version: version.version, stageId: version.stageId }
    const blocking = version.dependencies?.find(dependency => notApproved.has(dependency))

    if (cancelled) {
      record({ ...base, status: 'skipped', reason: 'cancelled' })
      continue
    }
    if (blocking) {
      record({ ...base, status: 'skipped', reason: `dependency ${blocking} not approved` })
      continue
    }

    try {
      const entry = await waitWhileValidating(options, version)
      if (!entry || entry.status === 'validating') {
        record({
          ...base,
          status: 'skipped',
          reason: entry
            ? 'validating'
            : 'not staged',
        })
        continue
      }

      record({
        ...base,
        ...await approve(version.stageId, versions.length - index),
      })
    }
    catch (error) {
      record({
        ...base,
        status: 'failed',
        reason: isOtpError(error)
          ? 'otp'
          : getErrorText(error).split('\n')[0] || 'failed',
      })
    }
  }

  return results
}

/**
 * The state of one version, combining the staging area (with the npm login of
 * the person) and the packument: the call an app polls until `installable`,
 * the moment it may say the version is out
 *
 * @param options - Registry, version and runner.
 * @param options.cwd - Root of the project.
 * @param options.registry - Registry URL (npmjs).
 * @param options.name - Package name.
 * @param options.version - Version.
 * @param options.stageId - Id of the stage, when known (else found by name and version).
 * @param options.runner - Runs npm.
 * @param options.env - Environment to check (in a CI only the packument is read).
 * @param options.timeoutMs - Timeout of each call.
 * @param options.logger - Receives debug messages.
 * @returns See `StagedState`. Never throws.
 * @example
 * ```ts
 * await getStagedState({ cwd: '/repo', registry: 'https://registry.npmjs.org/', name: '@scope/core', version: '1.2.0' }) // 'staged'
 * ```
 */
export async function getStagedState(options: StagedCallOptions & { name: string, version: string, stageId?: string }): Promise<StagedState> {
  const { name, version, stageId, logger } = options
  let stageReadable = true

  try {
    const entries = await listStagedVersions({
      ...options,
      packageNames: [name],
    })
    const entry = entries.find(item => (stageId && item.stageId === stageId) || item.version === version)
    if (entry) {
      return entry.status === 'validating'
        ? 'validating'
        : 'staged'
    }
  }
  catch (error) {
    stageReadable = false
    logger?.debug?.(`Staged versions of ${name} not readable: ${getErrorText(error).split('\n')[0]}`)
  }

  const published = await isVersionPublished({
    packageManager: 'npm',
    pkg: { name, path: options.cwd },
    version,
    cwd: options.cwd,
    registryTarget: { registry: options.registry },
    timeoutMs: options.timeoutMs,
    logger,
  }).catch(() => null)

  if (published === true) {
    return 'installable'
  }
  return published === false && stageReadable
    ? 'rejected-or-gone'
    : 'unknown'
}
