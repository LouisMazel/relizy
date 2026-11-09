import type { ReleaseUi, ResolvedRelizyConfig } from '../core'
import type { BumpResultTruthy, HookContext, HookStep } from '../types'
import { logger } from '@maz-ui/node'
import { prepareCiRepository } from '@relizy/core'
import { createCommandUi, executeHook, getHookContext, isFancyUi, isRelizyCancelError } from '../core'

export interface CommandContext {
  config: ResolvedRelizyConfig
  dryRun: boolean
  ui: ReleaseUi
  /** The context of the hooks of the command, undefined without bump result */
  hookContext: HookContext | undefined
}

/**
 * The common run of a command (`bump`, `changelog`, `publish`,
 * `provider-release`, `social`, `pr-comment`): its config, its output, the CI
 * clone, then `run`. On an error, a cancelled prompt is rethrown as is; else
 * the error is logged (out of `release` and of the CLI output), its
 * `error:<hook>` hook runs, the output shows it, and it is rethrown, or turned
 * into the result of the command by `recover` (a command reporting its errors
 * in its result).
 */
export async function runCommand<T>({
  name,
  label,
  errorMessage,
  options,
  loadConfig,
  check,
  hook,
  recover,
  run,
}: {
  /** The name of the command, in the title of its output: `relizy <name>` */
  name: string
  /** The name of the step of the command in its error */
  label: string
  /** Logged with the error, out of the CLI output and of `release` */
  errorMessage?: string
  options: { config?: ResolvedRelizyConfig, dryRun?: boolean, bumpResult?: BumpResultTruthy }
  loadConfig: () => Promise<ResolvedRelizyConfig>
  /** A check of the config that fails before preparing the CI clone */
  check?: (config: ResolvedRelizyConfig) => void
  /** The step of the `error:*` hook, none when undefined */
  hook?: HookStep
  recover?: (error: unknown) => T
  run: (context: CommandContext) => Promise<T>
}): Promise<T> {
  const config = await loadConfig()

  const dryRun = options.dryRun ?? false
  logger.debug(`Dry run: ${dryRun}`)

  const hookContext = options.bumpResult
    ? getHookContext(config, options.bumpResult)
    : undefined
  const ui = createCommandUi({
    title: `relizy ${name}`,
    dryRun,
    logLevel: config.logLevel,
    cwd: config.cwd,
  })

  try {
    check?.(config)
    // The CI clone: full history, branch, identity
    prepareCiRepository(config.cwd, { logger })

    return await run({ config, dryRun, ui, hookContext })
  }
  catch (error) {
    // Refused or cancelled prompt: nothing was written, it is not a failure
    if (isRelizyCancelError(error)) {
      ui.fail(error)
      throw error
    }

    if (errorMessage && !options.config && !isFancyUi()) {
      logger.error(`${errorMessage}\n\n`, error)
    }

    if (hook) {
      await executeHook(`error:${hook}`, config, dryRun, hookContext)
    }

    ui.fail(error, label)

    if (recover) {
      return recover(error)
    }

    throw error
  }
}
