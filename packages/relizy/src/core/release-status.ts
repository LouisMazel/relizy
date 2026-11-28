import type { ReleaseStatusUpdate } from '@relizy/core'
import type { ResolvedRelizyConfig } from './config'
import type { RelizyEvent } from './events'
import type { ReleaseReport } from './release-report'
import process from 'node:process'
import { logger } from '@maz-ui/node'
import { formatReleaseStatus, isGitlabJobToken, isPullRequestRun, RELEASE_STATUS_CONTEXT } from '@relizy/core'
import { addGlobalEventListener, getEventContext, getRunState } from './events'
import { getProviderApi } from './merge-preview/api'
import { getJobUrl } from './merge-preview/status'

/** The longest wait for a post: a slow forge never holds the release */
const POST_TIMEOUT_MS = 5000
const SIGNALS = ['SIGINT', 'SIGTERM'] as const

interface ReleaseStatusWriter {
  /** Waits for the posts sent, the final one included, then stops listening */
  close: () => Promise<void>
}

const WRITER_KEY = Symbol('release-status-writer')

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer after ${POST_TIMEOUT_MS / 1000}s`)), POST_TIMEOUT_MS)
    timer.unref()
  })

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** What the release brings, as the status of its end tells it */
function getReleasedUpdate(report: ReleaseReport): ReleaseStatusUpdate {
  if (report.status === 'nothing') {
    return { phase: 'nothing' }
  }
  const packages = report.release?.groups.reduce((count, group) => count + group.packages.length, 0)
  const version = report.version ?? (packages === 1
    ? report.release?.groups.flatMap(group => group.packages)[0]?.newVersion
    : undefined)

  return {
    phase: 'released',
    ...(version
      ? { version }
      : { packages }),
    ...(report.canary
      ? { canary: true }
      : {}),
  }
}

function getFixHint(provider: 'github' | 'gitlab'): string {
  return provider === 'github'
    ? 'grant "statuses: write" to the job (or use a token that can push to the repository)'
    : 'set GITLAB_TOKEN (or RELIZY_GITLAB_TOKEN) to a token with the api scope, the job token cannot set commit statuses'
}

/** Why the status is not posted in this run, none when it is */
function getSkipReason(config: ResolvedRelizyConfig, dryRun: boolean, env: NodeJS.ProcessEnv): string | undefined {
  if (dryRun) {
    return 'dry run: the commit status relizy/release is not posted'
  }
  if (!env.GITHUB_ACTIONS && !env.GITLAB_CI) {
    return 'not in GitHub Actions nor GitLab CI: the commit status relizy/release is not posted'
  }
  if (isPullRequestRun(env)) {
    return 'pull request run: the commit status relizy/release is not posted on its merge commit'
  }

  return undefined
}

/**
 * Posts the commit status `relizy/release` on the commit being released, at
 * each step of the release (`release.report.status`), so that the forge, a
 * program or a teammate follows a CI release while it runs. Only in GitHub
 * Actions and GitLab CI, never in dry-run nor on a pull request run. A post
 * that fails warns once and stops the next ones: it never fails the release.
 * Started before the first event of the release, closed by `closeReleaseStatus()`.
 */
export function startReleaseStatus({ config, dryRun, sha, env = process.env }: {
  config: ResolvedRelizyConfig
  dryRun: boolean
  /** The commit the release started from: all the posts of the run go to it */
  sha: string | undefined
  env?: NodeJS.ProcessEnv
}): void {
  if (!config.release.report?.status) {
    return
  }
  const skipped = getSkipReason(config, dryRun, env)
  const provider = config.repo?.provider
  if (skipped || !sha) {
    logger.debug(skipped ?? 'no commit: the commit status relizy/release is not posted')
    return
  }
  if (provider !== 'github' && provider !== 'gitlab') {
    logger.warn(`The commit status relizy/release needs GitHub or GitLab, not ${provider ?? 'an unknown forge'}: set repo.provider`)
    return
  }

  const token = provider === 'github'
    ? config.tokens.github
    : config.tokens.gitlab
  const api = getProviderApi(config, provider)
  if (!api || (provider === 'gitlab' && isGitlabJobToken(token ?? '', env))) {
    logger.warn(`The commit status relizy/release is not posted: no usable token - ${getFixHint(provider)}`)
    return
  }

  const secrets = Object.values(config.tokens).filter((value): value is string => typeof value === 'string')
  const targetUrl = getJobUrl(env)
  // The posts in order, one at a time
  let chain = Promise.resolve()
  let stopped = false
  let last: { state: string, description: string } | undefined
  let step = 'checks'

  const send = async (body: Record<string, unknown>) => {
    try {
      await withTimeout(api.request('POST', `/statuses/${sha}`, body))
    }
    catch (error) {
      // GitLab: another update of this commit and ref is in progress
      if (provider === 'gitlab' && error instanceof Error && /: 409\b/.test(error.message)) {
        await withTimeout(api.request('POST', `/statuses/${sha}`, body))
        return
      }
      throw error
    }
  }

  const post = (update: ReleaseStatusUpdate): Promise<void> => {
    const { state, description } = formatReleaseStatus(update, { provider, secrets })
    // The same description twice in a row says nothing new. GitLab refuses a status in the state it has
    // ("Cannot transition status via :run from :running"): there, only the first step and the end are posted
    if (stopped || description === last?.description || (provider === 'gitlab' && state === last?.state)) {
      return chain
    }
    last = { state, description }
    const body = provider === 'github'
      ? {
          state,
          context: RELEASE_STATUS_CONTEXT,
          description,
          ...(targetUrl
            ? { target_url: targetUrl }
            : {}),
        }
      : {
          state,
          name: RELEASE_STATUS_CONTEXT,
          description,
          ...(targetUrl
            ? { target_url: targetUrl }
            : {}),
          // The status joins the pipeline of the job, not a new external one
          ...(env.CI_COMMIT_REF_NAME
            ? { ref: env.CI_COMMIT_REF_NAME }
            : {}),
          ...(env.CI_PIPELINE_ID
            ? {
                pipeline_id: Number(env.CI_PIPELINE_ID),
              }
            : {}),
        }

    chain = chain.then(async () => {
      if (stopped) {
        return
      }
      try {
        await send(body)
        logger.debug(`Commit status relizy/release: ${state} "${description}" on ${sha.slice(0, 7)}`)
      }
      catch (error) {
        stopped = true
        logger.warn(`The commit status relizy/release could not be set, the next ones are not posted: ${error instanceof Error
          ? error.message
          : String(error)} - ${getFixHint(provider)}`)
      }
    })

    return chain
  }

  // Only the events of this release: an application may run several commands at once
  const runState = getEventContext()?.state
  const onEvent = (event: RelizyEvent) => {
    if (getEventContext()?.state !== runState) {
      return
    }
    switch (event.type) {
      case 'command:start':
        if (event.command === 'release') {
          void post({ phase: 'running', step })
        }
        break
      case 'step:start':
        if (event.step) {
          step = event.step
          void post({ phase: 'running', step, label: event.label })
        }
        break
      case 'release:finish':
        void post(getReleasedUpdate(event.report))
        break
      case 'command:error':
        void post(event.cancelled
          ? { phase: 'cancelled', step }
          : { phase: 'failed', step, message: event.message })
        break
    }
  }
  const removeListener = addGlobalEventListener(onEvent)

  // A cancelled job: the status says so, then the signal goes on
  const handlers: [NodeJS.Signals, () => void][] = []
  const removeSignals = () => {
    for (const [signal, handler] of handlers) {
      process.off(signal, handler)
    }
  }
  for (const signal of SIGNALS) {
    const handler = () => {
      removeSignals()
      void withTimeout(post({ phase: 'cancelled', step })).catch(() => {}).finally(() => {
        process.kill(process.pid, signal)
      })
    }
    handlers.push([signal, handler])
    process.once(signal, handler)
  }

  getRunState<{ writer?: ReleaseStatusWriter }>(WRITER_KEY, () => ({})).writer = {
    close: async () => {
      removeListener()
      removeSignals()
      await withTimeout(chain).catch(() => {})
    },
  }
}

/** Waits for the last commit status of the release (5 s at most), then stops posting */
export async function closeReleaseStatus(): Promise<void> {
  const state = getRunState<{ writer?: ReleaseStatusWriter }>(WRITER_KEY, () => ({}))
  const { writer } = state
  state.writer = undefined
  await writer?.close()
}
