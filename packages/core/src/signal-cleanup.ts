import process from 'node:process'

/**
 * Cleanups that must run when the process stops before the end of a command
 * (Ctrl+C, kill, closed terminal, `process.exit`): the token written to a
 * `.npmrc`, the temporary directory of a packed tarball. One set of listeners
 * for all of them, so a signal runs every pending cleanup and is re-raised
 * once, whatever the nesting.
 */

const CLEANUP_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const

const pending = new Set<() => void>()

function runPending() {
  // The last registered first: an inner cleanup before the outer one
  for (const cleanup of [...pending].reverse()) {
    pending.delete(cleanup)
    try {
      cleanup()
    }
    catch {
      // A failed cleanup must not stop the others
    }
  }
}

function onExit() {
  runPending()
}

function onSignal(signal: NodeJS.Signals) {
  runPending()
  detach()
  process.kill(process.pid, signal)
}

function attach() {
  process.on('exit', onExit)
  for (const signal of CLEANUP_SIGNALS) {
    process.on(signal, onSignal)
  }
}

function detach() {
  process.removeListener('exit', onExit)
  for (const signal of CLEANUP_SIGNALS) {
    process.removeListener(signal, onSignal)
  }
}

/**
 * Run `fn`, then `cleanup` once: after `fn` settles, or when the process
 * stops before (exit or SIGINT, SIGTERM, SIGHUP, the signal being re-raised
 * once all the pending cleanups ran). No listener is left once every call
 * settled. Internal to core, not exported from the package entry.
 *
 * @param cleanup - Synchronous cleanup, run exactly once.
 * @param fn - The work to protect.
 * @returns What `fn` returns; its error is rethrown after the cleanup.
 */
export async function withSignalCleanup<T>(cleanup: () => void, fn: () => Promise<T>): Promise<T> {
  let done = false
  const once = () => {
    if (!done) {
      done = true
      cleanup()
    }
  }

  if (pending.size === 0) {
    attach()
  }
  pending.add(once)

  try {
    return await fn()
  }
  finally {
    pending.delete(once)
    once()
    if (pending.size === 0) {
      detach()
    }
  }
}
