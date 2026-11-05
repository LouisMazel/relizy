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

/**
 * True when an `@inquirer/prompts` prompt was closed by the user (Ctrl+C)
 */
export function isPromptExitError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ExitPromptError'
}
