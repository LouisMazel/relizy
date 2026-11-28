import type { ApproveResult, NpmCommandRunner, StagedVersion } from '@relizy/core'
import type { AppPrompt, OtpRequest, PackageBase } from '../types'
import type { ResolvedRelizyConfig } from './config'
import type { ApproveStepData, ApproveStepPackage } from './events'
import type { ReleaseUi } from './release-ui'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { execPromise, logger } from '@maz-ui/node'
import { approveStagedVersions, getTrustedPublishingProvider, isInCI, listStagedVersions } from '@relizy/core'
import { getAppHandlers } from './events'
import { askConfirm, askText } from './prompts'
import { getAlreadyStagedVersions, getStagedVersions, isStagingConfigured, markStagedApproved } from './staging'

/**
 * The approval of the staged versions, with the npm login and the 2FA of the
 * person: the questions (terminal or `onPrompt`), the code (terminal or
 * `onOtp`), and npm run in the terminal for the web 2FA of security keys
 */

/** A person can answer in this terminal: stdin and stdout are TTYs, and stdout does not carry the JSON events */
export function isInteractiveTerminal(): boolean {
  return process.env.RELIZY_REPORTER !== 'json' && Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY)
}

/** The npm subcommands that may need the 2FA of the person */
function needsTerminal(args: string[]): boolean {
  return (args[0] === 'stage' && (args[1] === 'approve' || args[1] === 'reject'))
    || (args[0] === 'trust' && args[1] !== 'list')
}

const SAFE_ARG = /^[\w@./:%+=-]+$/

/**
 * Runs npm for the approval: the calls that may need the 2FA run in the
 * terminal (stdin, stdout and stderr inherited: npm only opens its web 2FA, or
 * asks its code, when both are TTYs), the reads run without it to give their
 * JSON. The result of a call run in the terminal is read back by the caller.
 */
export function createInteractiveNpmRunner(): NpmCommandRunner {
  return async (args, { cwd, env, timeoutMs }) => {
    for (const arg of args) {
      if (!SAFE_ARG.test(arg)) {
        throw new Error(`Unsafe argument for npm: ${arg}`)
      }
    }

    if (!needsTerminal(args)) {
      const result = await execPromise(`npm ${args.join(' ')}`, {
        cwd,
        env,
        timeout: timeoutMs,
        maxBuffer: 64 * 1024 * 1024,
        noStdout: true,
        noStderr: true,
        noSuccess: true,
        noError: true,
      })
      return { stdout: result?.stdout ?? '' }
    }

    await new Promise<void>((resolve, reject) => {
      const child = spawn('npm', args, {
        cwd,
        env: {
          ...process.env,
          ...env,
        },
        stdio: 'inherit',
        shell: process.platform === 'win32',
      })
      const timer = setTimeout(() => {
        child.kill()
        reject(Object.assign(new Error(`npm ${args.slice(0, 2).join(' ')} timed out after ${timeoutMs}ms`), { killed: true }))
      }, timeoutMs)
      child.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.on('exit', (code) => {
        clearTimeout(timer)
        if (code === 0) {
          resolve()
        }
        else {
          reject(new Error(`npm ${args.slice(0, 2).join(' ')} exited with code ${code}`))
        }
      })
    })

    return { stdout: '' }
  }
}

/**
 * Asks an application (`onPrompt`) or the person in the terminal; without
 * either, the safe answer: no
 */
export async function askStagedQuestion({ request, message }: { request: AppPrompt, message: string }): Promise<boolean | 'not interactive'> {
  const { onPrompt } = getAppHandlers()
  if (onPrompt) {
    return Boolean(await onPrompt(request))
  }

  if (!isInteractiveTerminal()) {
    return 'not interactive'
  }

  return askConfirm({ message, initialValue: true })
}

/**
 * Asks the 2FA code of a batch: from `onOtp`, else from the terminal; empty in
 * the terminal lets npm ask itself (or open its web 2FA)
 */
export function createOtpAsker({ registry, purpose, otp }: { registry: string, purpose: NonNullable<OtpRequest['purpose']>, otp?: string }) {
  let given = otp
  return async ({ count }: { count: number }): Promise<string | undefined> => {
    if (given) {
      const code = given
      given = undefined
      return code
    }

    const { onOtp } = getAppHandlers()
    if (onOtp) {
      const code: unknown = await onOtp({ registry, purpose, count })
      return typeof code === 'string' && code.trim()
        ? code.trim()
        : undefined
    }

    if (!isInteractiveTerminal()) {
      return undefined
    }

    const code = await askText({
      message: `2FA code of npm for ${count} version${count > 1
        ? 's'
        : ''} (leave empty to approve in the browser with a security key)`,
    }).catch(() => '')
    return code.trim() || undefined
  }
}

/**
 * The stage ids npm did not print (a version staged by an earlier run and
 * skipped as already staged, an output without id), read from the staging area
 */
async function resolveStageIds({ config, versions, registry, runner }: {
  config: ResolvedRelizyConfig
  versions: StagedVersion[]
  registry: string
  runner?: NpmCommandRunner
}): Promise<StagedVersion[]> {
  const missing = versions.filter(version => !version.stageId)
  if (missing.length === 0) {
    return versions
  }

  const entries = await listStagedVersions({
    cwd: config.cwd,
    registry,
    packageNames: [
      ...new Set(missing.map(version => version.name)),
    ],
    runner,
    logger,
  })
  return versions.map((version) => {
    const stageId = version.stageId ?? entries.find(entry => entry.name === version.name && entry.version === version.version)?.stageId
    return stageId
      ? { ...version, stageId }
      : version
  })
}

/** Why the approval cannot run here, `undefined` when it can */
export function getApprovalBlocker(): 'ci' | 'oidc' | undefined {
  if (isInCI()) {
    return 'ci'
  }
  return getTrustedPublishingProvider()
    ? 'oidc'
    : undefined
}

/** Every version skipped with the same reason */
function skipAll(versions: StagedVersion[], reason: string): ApproveStepData {
  return {
    packages: versions.map(version => ({
      name: version.name,
      version: version.version,
      ...(version.stageId
        ? { stageId: version.stageId }
        : {}),
      status: 'skipped',
      reason,
    })),
  }
}

function toStepPackage(result: ApproveResult): ApproveStepPackage {
  return {
    name: result.name,
    version: result.version,
    stageId: result.stageId,
    status: result.status,
    ...(result.reason
      ? { reason: result.reason }
      : {}),
    ...(result.url
      ? { url: result.url }
      : {}),
  }
}

/**
 * The approval step of a release (and of `relizy publish` run alone): the
 * versions this run staged, approved with one 2FA when `publish.approve`
 * allows it, here. Never throws: what is not approved stays awaiting.
 */
export async function approveRunVersions({ config, versions, dependencies, approve, dryRun }: {
  config: ResolvedRelizyConfig
  versions: StagedVersion[]
  /** The workspace dependencies of each package, by name: dependencies are approved first */
  dependencies: Map<string, string[]>
  approve: 'prompt' | boolean
  dryRun: boolean
}): Promise<ApproveStepData> {
  if (approve === false) {
    return skipAll(versions, 'disabled')
  }

  const blocker = getApprovalBlocker()
  if (blocker) {
    return skipAll(versions, blocker)
  }

  if (dryRun) {
    return skipAll(versions, 'dry run')
  }

  if (approve === 'prompt') {
    const answer = await askStagedQuestion({
      request: {
        kind: 'approve-staged',
        items: versions.map(version => ({ name: version.name, version: version.version, stageId: version.stageId })),
      },
      message: `Approve the ${versions.length} staged version${versions.length > 1
        ? 's'
        : ''} now? (one 2FA)`,
    }).catch(() => false)
    if (answer !== true) {
      return skipAll(versions, answer === 'not interactive'
        ? 'not interactive'
        : 'declined')
    }
  }
  else if (!getAppHandlers().onOtp && !isInteractiveTerminal()) {
    return skipAll(versions, 'not interactive')
  }

  const registry = versions[0]?.registry ?? ''
  const runner = isInteractiveTerminal()
    ? createInteractiveNpmRunner()
    : undefined

  try {
    const resolved = await resolveStageIds({ config, versions, registry, runner })
    const withId = resolved.filter(version => version.stageId)
    const withoutId = resolved.filter(version => !version.stageId)

    const results = await approveStagedVersions({
      cwd: config.cwd,
      registry,
      versions: withId.map(version => ({
        name: version.name,
        version: version.version,
        stageId: version.stageId!,
        dependencies: dependencies.get(version.name) ?? [],
      })),
      getOtp: createOtpAsker({ registry, purpose: 'approve' }),
      runner,
      logger,
    })

    return {
      packages: [
        ...results.map(toStepPackage),
        ...skipAll(withoutId, 'no stage id').packages,
      ],
    }
  }
  catch (error) {
    logger.warn(`The staged versions could not be approved: ${error instanceof Error
      ? error.message
      : String(error)}`)
    return skipAll(versions, 'failed')
  }
}

/** What the approval step tells: `Approved 2 versions`, or why nothing was */
export function describeApproval(data: ApproveStepData): string {
  const approved = data.packages.filter(pkg => pkg.status === 'approved').length
  const total = data.packages.length
  if (approved === total) {
    return `Approved ${total} staged version${total > 1
      ? 's'
      : ''}`
  }
  if (approved > 0) {
    return `Approved ${approved} of ${total} staged versions, the others await approval`
  }
  const reasons = [
    ...new Set(data.packages.map(pkg => pkg.reason)),
  ]
  return `Not approved (${reasons.join(', ')}): run "relizy stage approve --all", or approve on npmjs.com`
}

/**
 * The `approve` step, with `publish.staged` only: skipped when the run staged
 * nothing, else the approval of what it staged (and of the versions it found
 * already staged). The approved versions are marked in the state of the run,
 * for the report, the links and the posts that follow.
 */
export async function runApprovalStep({ ui, config, dryRun, packages }: {
  ui: ReleaseUi
  config: ResolvedRelizyConfig
  dryRun: boolean
  /** The packages of the run, for their workspace dependencies */
  packages: Pick<PackageBase, 'name' | 'dependencies'>[]
}): Promise<ApproveStepData | undefined> {
  if (!isStagingConfigured(config)) {
    return undefined
  }

  const versions: StagedVersion[] = [
    ...getStagedVersions(),
    ...getAlreadyStagedVersions(),
  ]
  if (versions.length === 0) {
    ui.skip({
      name: 'approve',
      title: 'Approve the staged versions',
      label: 'Approval',
      reason: 'nothing staged',
    })
    return undefined
  }

  const data = await ui.step({
    name: 'approve',
    title: 'Approve the staged versions',
    running: 'Approving the staged versions',
    done: describeApproval,
    failed: result => result.packages.some(pkg => pkg.status === 'failed'),
    data: result => result,
    run: () => approveRunVersions({
      config,
      versions,
      dependencies: new Map(packages.map(pkg => [pkg.name, pkg.dependencies ?? []])),
      approve: config.publish.approve ?? 'prompt',
      dryRun,
    }),
  })

  markStagedApproved(data.packages.filter(pkg => pkg.status === 'approved'))
  return data
}
