import type { LogLevel } from '@maz-ui/node'
import { AsyncLocalStorage } from 'node:async_hooks'
import { format, stripVTControlCharacters } from 'node:util'
import { logger } from '@maz-ui/node'

/**
 * Where the logs of relizy go: the logger gets one reporter, which gives each
 * log to the capture of the call it comes from (`withLogCapture`), else to the
 * reporters of the process (`setLogReporters`: the output of the CLI, stderr
 * for the MCP server and `RELIZY_REPORTER=json`). Two calls capturing at the
 * same time (two previews of an application) each get their own logs.
 */

export interface LogObject {
  type: string
  args: unknown[]
  [key: string]: unknown
}

export interface LogReporter {
  log: (logObj: LogObject, context?: unknown) => void
}

/** What a capture keeps of a log */
export type LogSink = (log: { type: string, message: string, logObj: LogObject }) => void

const captures = new AsyncLocalStorage<LogSink>()
let reporters: LogReporter[] | undefined

/** The reporters of the consola instance behind the logger */
function getConsolaReporters(): LogReporter[] {
  // Removing a reporter that is not registered returns the consola instance, and its reporters
  const instance = (logger.removeReporter as unknown as (reporter: unknown) => { options?: { reporters?: LogReporter[] } } | undefined)({})

  // A logger without consola behind it (a mock) has none to route
  return instance?.options?.reporters ?? []
}

function install(): LogReporter[] {
  if (reporters) {
    return reporters
  }

  const consolaReporters = getConsolaReporters()
  reporters = consolaReporters.splice(0)
  consolaReporters.push({
    log: (logObj, context) => {
      const sink = captures.getStore()

      if (sink) {
        sink({
          type: logObj.type,
          message: stripVTControlCharacters(format(...logObj.args)).trim(),
          logObj,
        })
        return
      }

      for (const reporter of reporters ?? []) {
        reporter.log(logObj, context)
      }
    },
  })

  return reporters
}

/**
 * Run a function keeping its logs (and the ones of what it calls) instead of
 * printing them. A capture inside another one gives its logs to both.
 */
export function withLogCapture<T>(sink: LogSink, run: () => T): T {
  install()
  const parent = captures.getStore()

  return captures.run(parent
    ? (log) => {
        sink(log)
        parent(log)
      }
    : sink, run)
}

/**
 * Replace where the logs go out of a capture. Returns the function putting the
 * previous reporters back.
 */
export function setLogReporters(next: LogReporter[]): () => void {
  const previous = install()
  reporters = next

  return () => {
    reporters = previous
  }
}

const LEVEL_NAMES: [number, LogLevel][] = [
  [Number.NEGATIVE_INFINITY, 'silent'],
  [0, 'error'],
  [1, 'warning'],
  [2, 'normal'],
  [3, 'default'],
  [4, 'debug'],
  [5, 'trace'],
  [Number.POSITIVE_INFINITY, 'verbose'],
]

/** The calls in `keepLogLevel`, and the level from before the first one */
let keeping = 0
let keptLevel: number | undefined

/**
 * Run a function that sets the level of the logger (loading a config sets its
 * `logLevel`), then put the level of before back: a preview called by an
 * application does not change the level of its next calls. The level is global:
 * with calls running at the same time, it is put back when the last one ends,
 * so none loses its logs while another one ends.
 */
export async function keepLogLevel<T>(run: () => Promise<T>): Promise<T> {
  if (keeping === 0) {
    keptLevel = logger.getLevel()
  }
  keeping++

  try {
    return await run()
  }
  finally {
    keeping--

    if (keeping === 0) {
      const name = LEVEL_NAMES.find(([value]) => value === keptLevel)?.[1]

      if (name) {
        logger.setLevel(name)
      }
    }
  }
}
