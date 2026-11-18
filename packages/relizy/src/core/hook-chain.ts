import type { HookConfig } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { execPromise } from '@maz-ui/node'

type HookValue = NonNullable<HookConfig[keyof HookConfig]>

/** Hooks that transform a value (the changelog): the last one replaces the others instead of running after them */
const REPLACED_HOOKS = new Set<string>(['generate:changelog'])

async function runHook(hook: HookValue, config: ResolvedRelizyConfig, dryRun: boolean, params: unknown): Promise<unknown> {
  if (typeof hook === 'function') {
    return await (hook as (...args: unknown[]) => unknown)(config, dryRun, params)
  }

  return await execPromise(hook, {
    logLevel: config.logLevel,
    cwd: config.cwd,
    noStderr: true,
    noStdout: true,
  })
}

/**
 * Add the hooks of `overlay` to the ones of `base`: a step with a hook in both
 * runs the hook of `base`, then the one of `overlay` (a command, or a function
 * returning what the last one returns). `generate:changelog` returns the
 * changelog, so the one of `overlay` replaces the one of `base`.
 */
export function chainHooks(base: HookConfig | undefined, overlay: HookConfig | undefined): HookConfig | undefined {
  if (!base || !overlay) {
    return overlay ?? base
  }

  const chained = { ...base } as Record<string, unknown>

  for (const [name, hook] of Object.entries(overlay) as [string, HookValue | undefined][]) {
    const previous = chained[name] as HookValue | undefined

    chained[name] = !hook || !previous || REPLACED_HOOKS.has(name)
      ? hook ?? previous
      : async (config: ResolvedRelizyConfig, dryRun: boolean, params: unknown) => {
        const first = await runHook(previous, config, dryRun, params)
        const second = await runHook(hook, config, dryRun, params)
        return second ?? first
      }
  }

  return chained as HookConfig
}
