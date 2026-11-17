import type { ResolvedRelizyConfig, StepCheck, SyncSource } from '../core'
import type { RelizyConfigOverrides } from '../core/config'
import type { RelizyEventListener } from '../core/events'
import type { RelizyLogLevel, SyncMode, SyncResult } from '../types'
import { getErrorMessage } from '@maz-ui/utils/helpers/getErrorMessage'
import { runGit, withGitCache } from '@relizy/core'
import { describeSyncBranch, describeSyncResult, executeHook, getSyncSource, getSyncTargets, hasSyncFailures, loadRelizyConfig, mergeConfig, syncBranches, syncSafetyCheck } from '../core'
import { runWithEvents } from '../core/events'
import { runCommand } from './run-command'

/** The options of `relizy sync` */
export interface SyncOptions {
  /**
   * The branches to merge the released branch into, instead of the rules of `sync`
   */
  branches?: string[]
  /**
   * Override of `sync.mode` and of the modes of its rules for this run
   */
  mode?: SyncMode
  /**
   * The released branch, the current branch by default: its remote branch is merged
   */
  from?: string
  dryRun?: boolean
  logLevel?: RelizyLogLevel
  configName?: string
  /** Profile of `profiles` to apply, as `--profile` */
  profile?: string
  /** Config already resolved by `loadRelizyConfig()`, used instead of loading the config file */
  config?: ResolvedRelizyConfig
  /** Options applied over the config file, under the options of the call */
  overrides?: RelizyConfigOverrides
  /** Run the safety checks before merging: the branches exist, the release can push to them or open the pull requests */
  safetyCheck?: boolean
  /** Called with each event of the run, see `ReleaseOptions.onProgress` */
  onProgress?: RelizyEventListener
}

/** Thrown by `relizy sync` when a branch did not get the release: a conflict, a refused push */
export class SyncError extends Error {
  override name = 'SyncError'

  /** What the sync did to each branch */
  result: SyncResult

  constructor(message: string, result: SyncResult) {
    super(message)
    this.result = result
  }
}

/** The released branch: `from` on the remote of the current branch, else the current branch */
async function resolveSource(config: ResolvedRelizyConfig, from?: string): Promise<SyncSource & { ref: string }> {
  const current = await getSyncSource(config.cwd)

  if (!from) {
    return { ...current, ref: 'HEAD' }
  }

  const ref = `refs/remotes/${current.remote}/${from}`
  await runGit([
    'fetch',
    '--quiet',
    current.remote,
    `+refs/heads/${from}:${ref}`,
  ], { cwd: config.cwd })

  return { remote: current.remote, branch: from, ref }
}

/** The tags on the released commit, for `{{tags}}` and the pull requests */
async function getSourceTags(config: ResolvedRelizyConfig, ref: string): Promise<string[]> {
  const output = await runGit(['tag', '--points-at', ref], { cwd: config.cwd })

  return output.split('\n').filter(Boolean)
}

/**
 * Merge the released branch (the current one, or `from`) into the branches of
 * the rules of `sync` that match it (or `branches`) and push them, or open a
 * pull request into each one, as the `sync` step of `relizy release` does.
 * Throws a `SyncError` when a branch did not get it (a conflict, a refused
 * push), after the others are synced.
 *
 * @example
 * const result = await sync({ branches: ['develop'] })
 * // { source: 'main', dryRun: false, branches: [{ branch: 'develop', mode: 'push', status: 'merged', commit: '...' }] }
 */
export function sync(options: SyncOptions = {}): Promise<SyncResult> {
  // One git cache for the run: the same refs are read for each branch
  return runWithEvents(options.onProgress, () => withGitCache(() => runSync(options)))
}

function runSync(options: SyncOptions): Promise<SyncResult> {
  return runCommand({
    name: 'sync',
    label: 'Branch sync',
    errorMessage: 'Failed to sync the branches',
    hook: 'sync',
    options: { config: options.config, dryRun: options.dryRun },
    loadConfig: () => loadRelizyConfig({
      configFile: options.configName,
      baseConfig: options.config,
      profile: options.profile,
      overrides: mergeConfig({
        logLevel: options.logLevel,
        safetyCheck: options.safetyCheck,
      }, options.overrides),
    }),
    run: async ({ config, dryRun, ui }) => {
      const source = await resolveSource(config, options.from)
      const targets = getSyncTargets(config, source, { branches: options.branches, mode: options.mode })
      const branches = targets.map(target => target.branch)

      if (branches.length === 0) {
        ui.complete({ message: `No branch to sync: no rule of sync matches "${source.branch}", give the branches with --to`, nothing: true })
        return {
          source: source.branch,
          dryRun,
          branches: [],
        }
      }

      if (config.safetyCheck) {
        const checks: StepCheck[] = [
          { name: 'sync', status: 'passed' },
        ]
        await ui.step({
          name: 'checks',
          running: 'Checking the branches',
          done: () => `Ready to sync ${branches.join(', ')}`,
          data: () => ({ checks }),
          failedData: () => ({ checks }),
          run: async () => {
            try {
              await syncSafetyCheck({ config, source, targets })
            }
            catch (error) {
              checks[0] = {
                name: 'sync',
                status: 'failed',
                message: getErrorMessage(error),
              }
              throw error
            }
          },
        })
      }

      await executeHook('before:sync', config, dryRun)

      const result = await ui.step({
        name: 'sync',
        running: `Merging ${source.branch} into ${branches.join(', ')}`,
        done: describeSyncResult,
        failed: hasSyncFailures,
        data: result => result,
        run: async () => syncBranches({
          config,
          source,
          targets,
          sourceRef: source.ref,
          tags: await getSourceTags(config, source.ref),
          dryRun,
        }),
      })

      if (hasSyncFailures(result)) {
        const failures = result.branches.filter(branch => branch.status === 'conflict' || branch.status === 'failed')
        throw new SyncError(failures.map(branch => `${describeSyncBranch(branch)}. ${branch.reason ?? ''}`.trim()).join('\n'), result)
      }

      await executeHook('success:sync', config, dryRun)

      ui.complete({
        message: describeSyncResult(result),
        nothing: result.branches.every(branch => branch.status === 'up-to-date'),
        links: result.branches.flatMap(branch => branch.pullRequest
          ? [
              { label: `#${branch.pullRequest.number}`, url: branch.pullRequest.url },
            ]
          : []),
      })

      return result
    },
  })
}
