import type { HookConfig } from '../types'
import type { ResolvedRelizyConfig } from './config'
import { execPromise } from '@maz-ui/node'

export async function executeHook(hook: keyof HookConfig, config: ResolvedRelizyConfig, params?: any) {
  const hookInput = config.hooks?.[hook]

  if (!hookInput) {
    return
  }

  if (typeof hookInput === 'function') {
    await hookInput(params)
  }

  if (typeof hookInput === 'string') {
    await execPromise(hookInput, {
      logLevel: config.logLevel,
      cwd: config.cwd,
      noStderr: true,
      noStdout: true,
    })
  }
}
