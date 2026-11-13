import type { DeepPartial } from '@maz-ui/utils/ts-helpers/DeepPartial'
import type { ResolvedRelizyConfig } from '..'
import type { RelizyConfig } from '../../types'

import { AsyncLocalStorage } from 'node:async_hooks'
import { readdirSync } from 'node:fs'
import process from 'node:process'
import { format, stripVTControlCharacters } from 'node:util'
import { logger } from '@maz-ui/node'
import { loadRelizyConfig, mergeConfig, resetRewrittenTagCache, UnknownProfileError } from '..'
import { ToolInputError } from './tools/types'

/**
 * Guarantees of the MCP server: stdout only carries the protocol, the logs of
 * relizy are captured per tool call, no hook nor user command runs, and no
 * prompt is ever shown.
 */

export interface CapturedLog {
  type: string
  message: string
}

/** Types of the logs returned to the agent with the result of a tool */
const REPORTED_LOG_TYPES = new Set([
  'info',
  'warn',
  'error',
  'fail',
  'fatal',
])

const storage = new AsyncLocalStorage<CapturedLog[]>()
let capturing = false

/**
 * Replace the reporters of the relizy logger (consola writes `info` and `log`
 * to stdout) with a reporter that keeps the logs of the running tool call.
 * Out of a tool call, only the warnings and errors are written, to stderr.
 */
export function captureLogs(): void {
  if (capturing) {
    return
  }

  capturing = true
  // Without a reporter, consola removes all of them
  ;(logger.removeReporter as (reporter?: unknown) => unknown)()
  logger.addReporter({
    log: (logObj: { type: string, args: unknown[] }) => {
      const message = stripVTControlCharacters(format(...logObj.args)).trim()
      const logs = storage.getStore()

      if (logs) {
        logs.push({ type: logObj.type, message })
      }
      else if (['warn', 'error', 'fail', 'fatal'].includes(logObj.type)) {
        process.stderr.write(`[relizy] ${message}\n`)
      }
    },
  })
}

/** The `console` methods writing to stdout write to stderr: a dependency logging with `console.log` would corrupt the protocol */
export function redirectConsoleToStderr(): void {
  Object.assign(console, { log: console.error, info: console.error, debug: console.error })
}

export async function withCapturedLogs<T>(run: () => Promise<T>): Promise<{ value: T, logs: CapturedLog[] }> {
  const logs: CapturedLog[] = []
  const value = await storage.run(logs, run)

  return { value, logs }
}

/** The logs worth showing to the agent: warnings, errors and information, without the dry-run traces */
export function formatNotes(logs: CapturedLog[], max = 20): string {
  const notes = [
    ...new Set(logs
      .filter(log => REPORTED_LOG_TYPES.has(log.type) && log.message && !log.message.startsWith('[dry-run]'))
      .map(log => `- ${log.type === 'info'
        ? ''
        : log.type.concat(': ')}${log.message.split('\n')[0]}`)),
  ]

  if (notes.length === 0) {
    return ''
  }

  const shown = notes.slice(0, max)

  return [
    '## Notes',
    '',
    ...shown,
    ...(notes.length > max
      ? [`- ... and ${notes.length - max} more`]
      : []),
  ].join('\n')
}

const CONFIG_FILE = /^(relizy(?:\.[\w-]+)?)\.config\.(?:[cm]?[jt]s|json|ya?ml|toml)$/

/** Names of the relizy configs of a project (`relizy`, `relizy.standalone`...), for `--config` */
export function listConfigNames(cwd: string): string[] {
  return [
    ...new Set(readdirSync(cwd).flatMap(file => CONFIG_FILE.exec(file)?.[1] ?? [])),
  ].sort()
}

/**
 * Load the relizy config of the project without side effects: no prompt (the
 * rewritten tags use the reachable equivalent commit for this run only) and no
 * hook (the hooks are removed from the resolved config).
 */
export async function loadProjectConfig({ config, profile, overrides, cwd = process.cwd() }: {
  config?: string
  /** Profile of `profiles` to apply, as `--profile` */
  profile?: string
  overrides?: DeepPartial<RelizyConfig>
  cwd?: string
} = {}): Promise<ResolvedRelizyConfig> {
  if (config && !listConfigNames(cwd).includes(config)) {
    const names = listConfigNames(cwd)

    const available = names.length > 0
      ? `Available configs: ${names.join(', ')}.`
      : 'This project has no relizy config file: relizy uses its defaults.'

    throw new ToolInputError(`No config "${config}" in ${cwd}. ${available}`)
  }

  const resolved = await loadRelizyConfig({
    configFile: config,
    profile,
    // The logs are captured for the agent whatever the log level of the project (the debug ones are left out)
    overrides: mergeConfig(overrides, {
      cwd,
      logLevel: 'default',
      bump: { yes: true },
      onRewrittenTag: 'ephemeral',
    } satisfies DeepPartial<RelizyConfig>),
  }).catch((error: unknown) => {
    // A profile that is not in the config is a wrong argument of the tool
    throw error instanceof UnknownProfileError
      ? new ToolInputError(error.message)
      : error
  })

  resolved.hooks = {}
  resetRewrittenTagCache()

  return resolved
}
