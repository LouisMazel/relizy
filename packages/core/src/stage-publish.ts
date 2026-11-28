import micromatch from 'micromatch'

/**
 * npm staged publishing: `npm stage publish` uploads a version to a staging
 * area, a maintainer approves it with 2FA, only then is it installable.
 * See https://docs.npmjs.com/staged-publishing
 */

/** The first npm version with `npm stage` (`'11.15.0'`), the minimum to stage, approve or set up trust */
export const STAGED_PUBLISHING_NPM_VERSION = '11.15.0'

/** The first pnpm version with `pnpm stage publish` (`'11.3.0'`): older ones stage through `pnpm pack` and `npm stage publish` */
export const PNPM_STAGE_VERSION = '11.3.0'

/**
 * Which versions to stage instead of publishing them directly:
 * - `false`: none
 * - `true`: every version, except canaries
 * - `{ tags, packages }`: the versions matching every filter given, `tags` the dist-tags, `packages` names or globs
 */
export type StagedPublishing = boolean | { tags?: string[], packages?: string[] }

/** The stage id of a staged version, when the output of the command carries it */
export interface StageOutput {
  stageId?: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Whether a version is staged or published directly
 *
 * @param options - The setting and the version.
 * @param options.staged - The `publish.staged` setting.
 * @param options.tag - The dist-tag the version is published with.
 * @param options.packageName - Name of the package.
 * @param options.canary - The version is a canary: it has no push and is published again often, an unapproved stage would block its next run (`E409`), so it is staged only when `tags` lists its tag or when `explicit`.
 * @param options.explicit - Staging was asked for this run (`--staged`): canaries are staged too.
 * @returns `true` when the version is staged.
 * @example
 * ```ts
 * resolveStaged({ staged: { tags: ['latest'] }, tag: 'latest', packageName: '@scope/core' }) // true
 * resolveStaged({ staged: { tags: ['latest'] }, tag: 'next', packageName: '@scope/core' }) // false
 * resolveStaged({ staged: true, tag: 'canary', packageName: 'pkg', canary: true }) // false
 * ```
 */
export function resolveStaged({ staged, tag, packageName, canary = false, explicit = false }: {
  staged: StagedPublishing | undefined
  tag: string
  packageName: string
  canary?: boolean
  explicit?: boolean
}): boolean {
  if (!staged) {
    return false
  }

  if (staged === true) {
    return !canary || explicit
  }

  if (staged.tags && !staged.tags.includes(tag)) {
    return false
  }

  if (staged.packages && !micromatch.isMatch(packageName, staged.packages)) {
    return false
  }

  return !canary || explicit || Boolean(staged.tags?.includes(tag))
}

function findStageId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const record = value as Record<string, unknown>
  if (typeof record.stageId === 'string') {
    return record.stageId
  }

  // npm and pnpm key the result by package name
  for (const nested of Object.values(record)) {
    if (typeof nested === 'object' && nested !== null && typeof (nested as Record<string, unknown>).stageId === 'string') {
      return (nested as Record<string, string>).stageId
    }
  }

  return undefined
}

function parseJson(stdout: string): unknown {
  const start = stdout.indexOf('{')
  const end = stdout.lastIndexOf('}')
  if (start === -1 || end <= start) {
    return undefined
  }
  try {
    return JSON.parse(stdout.slice(start, end + 1))
  }
  catch {
    return undefined
  }
}

/**
 * The stage id in the output of `npm stage publish` or `pnpm stage publish`:
 * the `stageId` of the `--json` object (at the top level or under the package
 * name), else the `(staged with id <uuid>)` of the text output. Only a UUID is
 * taken.
 *
 * @param stdout - Output of the stage command.
 * @returns `{ stageId }`, or `{}` when the output carries no id (the version is staged all the same).
 * @example
 * ```ts
 * parseStageOutput('{"pkg":{"name":"pkg","stageId":"2f1c7b8e-1d2a-4c5b-9e8f-0a1b2c3d4e5f"}}')
 * // { stageId: '2f1c7b8e-1d2a-4c5b-9e8f-0a1b2c3d4e5f' }
 * parseStageOutput('+ pkg@1.0.0 (staged with id 2f1c7b8e-1d2a-4c5b-9e8f-0a1b2c3d4e5f)')
 * // { stageId: '2f1c7b8e-1d2a-4c5b-9e8f-0a1b2c3d4e5f' }
 * ```
 */
export function parseStageOutput(stdout: string): StageOutput {
  const fromJson = findStageId(parseJson(stdout))
  if (fromJson && UUID_PATTERN.test(fromJson)) {
    return { stageId: fromJson }
  }

  const fromText = /staged with id ([0-9a-f-]{36})/i.exec(stdout)?.[1]
  if (fromText && UUID_PATTERN.test(fromText)) {
    return { stageId: fromText }
  }

  return {}
}

function getErrorText(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return ''
  }

  const record = error as Record<string, unknown>
  return [
    record.code,
    record.message,
    record.stderr,
    record.stdout,
    String(error),
  ]
    .filter(value => typeof value === 'string')
    .join(' ')
    .toLowerCase()
}

/**
 * True when npm refused a direct publish because this version may only be
 * staged: a stage-only token, or a trusted publisher configuration that only
 * allows staging (`E_STAGE_REQUIRED`). Checked before `isOtpError`, whose
 * patterns could match the message.
 *
 * @param error - The error thrown by the publish command (any value).
 * @returns `true` when the code, message or output of the error holds `E_STAGE_REQUIRED`.
 * @example
 * ```ts
 * isStageRequiredError(new Error('npm error 403 Forbidden - E_STAGE_REQUIRED')) // true
 * ```
 */
export function isStageRequiredError(error: unknown): boolean {
  return getErrorText(error).includes('e_stage_required')
}

/**
 * True when npm refused a publish because this version is already staged,
 * awaiting approval: staged and published versions share one index of
 * versions. A direct publish says `previously staged`; a stage says `Cannot
 * stage previously published version` (observed on npmjs, 2026-11-28), for a
 * version already staged as for one already published: check the packument
 * (`isVersionPublished`) to tell them apart.
 *
 * @param error - The error thrown by the publish command (any value).
 * @returns `true` when the message or output of the error holds `previously staged` or `cannot stage previously published`.
 * @example
 * ```ts
 * isVersionAlreadyStagedError(new Error('409 Conflict - Cannot stage previously published version "1.0.0".')) // true
 * ```
 */
export function isVersionAlreadyStagedError(error: unknown): boolean {
  const text = getErrorText(error)
  return text.includes('previously staged') || text.includes('cannot stage previously published')
}

/**
 * The errors of staged publishing, approval and trusted publishing, each with
 * a stable `code` to switch on instead of parsing messages
 */
abstract class CodedError extends Error {
  abstract readonly code: string
}

/**
 * npm refused a direct publish: this version may only be staged (a stage-only
 * token, or a trusted publisher configuration that only allows staging)
 *
 * @example
 * ```ts
 * try { await publish() }
 * catch (error) { if (error instanceof StageRequiredError) console.log(error.packageName, error.tag) }
 * ```
 */
export class StageRequiredError extends CodedError {
  readonly code = 'E_STAGE_REQUIRED'
  readonly packageName: string
  readonly tag: string

  /**
   * @param options - What was refused.
   * @param options.packageName - Package of the refused publish.
   * @param options.tag - Dist-tag of the refused publish.
   * @param options.message - Message of the error.
   * @param options.cause - The error of the publish command.
   */
  constructor({ packageName, tag, message, cause }: { packageName: string, tag: string, message: string, cause?: unknown }) {
    super(message, { cause })
    this.name = 'StageRequiredError'
    this.packageName = packageName
    this.tag = tag
  }
}

/**
 * The version is already staged, awaiting approval: approve or reject it
 *
 * @example
 * ```ts
 * if (error instanceof VersionAlreadyStagedError) console.log(`${error.packageName}@${error.version} awaits approval`)
 * ```
 */
export class VersionAlreadyStagedError extends CodedError {
  readonly code = 'E_ALREADY_STAGED'
  readonly packageName: string
  readonly version: string

  /**
   * @param options - The staged version.
   * @param options.packageName - Package of the version.
   * @param options.version - The version already staged.
   * @param options.message - Message of the error.
   * @param options.cause - The error of the publish command.
   */
  constructor({ packageName, version, message, cause }: { packageName: string, version: string, message: string, cause?: unknown }) {
    super(message, { cause })
    this.name = 'VersionAlreadyStagedError'
    this.packageName = packageName
    this.version = version
  }
}

/**
 * Staging cannot run here: npm too old, a registry other than npmjs, a
 * package manager that cannot run the command
 *
 * @example
 * ```ts
 * if (error instanceof StagingUnavailableError) console.log(error.message)
 * ```
 */
export class StagingUnavailableError extends CodedError {
  readonly code = 'E_STAGING_UNAVAILABLE'

  /**
   * @param message - What is missing and how to fix it.
   */
  constructor(message: string) {
    super(message)
    this.name = 'StagingUnavailableError'
  }
}

/**
 * The action needs the interactive npm login of a person (2FA): it cannot
 * run in a CI, under trusted publishing (OIDC), or without `npm login`
 *
 * @example
 * ```ts
 * if (error instanceof InteractiveAuthRequiredError) console.log('Run it locally after npm login')
 * ```
 */
export class InteractiveAuthRequiredError extends CodedError {
  readonly code = 'E_INTERACTIVE_AUTH'

  /**
   * @param message - Why the action cannot run and where to run it.
   */
  constructor(message: string) {
    super(message)
    this.name = 'InteractiveAuthRequiredError'
  }
}

/**
 * npm refused to list, create or revoke a trusted publisher configuration
 *
 * @example
 * ```ts
 * if (error instanceof TrustedPublisherError) console.log(error.status, error.message)
 * ```
 */
export class TrustedPublisherError extends CodedError {
  readonly code = 'E_TRUST'
  /** The status npm answered, when known */
  readonly status?: number

  /**
   * @param message - What npm refused and how to fix it.
   * @param options - Details.
   * @param options.status - The status npm answered.
   * @param options.cause - The error of the npm command.
   */
  constructor(message: string, { status, cause }: { status?: number, cause?: unknown } = {}) {
    super(message, { cause })
    this.name = 'TrustedPublisherError'
    this.status = status
  }
}
