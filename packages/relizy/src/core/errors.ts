/**
 * Thrown when the user refuses or cancels a prompt (bump confirmation,
 * uncommitted changes, rewritten tag): the run stops before writing anything.
 * The commands rethrow it without running their `error:*` hooks, and the CLI
 * exits with code 0.
 */
export class RelizyCancelError extends Error {
  override name = 'RelizyCancelError'
}

export function isRelizyCancelError(error: unknown): error is RelizyCancelError {
  return error instanceof RelizyCancelError
}

const REPORTED = Symbol.for('relizy.errorReported')

/**
 * Mark an error as already shown to the user (by the release output), so
 * that the CLI does not print it a second time
 */
export function markErrorReported(error: unknown): void {
  if (error && typeof error === 'object') {
    Object.defineProperty(error, REPORTED, { value: true })
  }
}

export function isErrorReported(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as Record<symbol, unknown>)[REPORTED])
}
