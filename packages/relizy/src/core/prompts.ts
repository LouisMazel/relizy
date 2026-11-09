import process from 'node:process'
import { confirm, isCancel, select, text } from '@clack/prompts'
import { RelizyCancelError } from './errors'

/**
 * The prompts of relizy, with @clack/prompts: a cancelled prompt (Ctrl+C,
 * Escape) throws a `RelizyCancelError` with `cancelMessage`.
 */

/**
 * A prompt needs someone to answer it: without an interactive terminal (CI,
 * piped input), nobody can, and @clack/prompts would take the end of the input
 * for a cancel. Throw what to do instead: no answer is not a refused prompt.
 */
export function assertInteractivePrompt({ message, whenNotInteractive }: {
  message: string
  /**
   * What to do without a terminal: `run with --yes to skip the confirmation`
   */
  whenNotInteractive: string
}): void {
  if (process.stdin.isTTY) {
    return
  }

  throw new Error(`"${message}" needs an answer, but the terminal is not interactive: ${whenNotInteractive}`)
}

/**
 * The confirmation of a bump (`relizy bump`, `relizy release`) without a terminal
 */
export const BUMP_NOT_INTERACTIVE = 'run with --yes to confirm it in advance'

function answerOf<T>(answer: T | symbol, cancelMessage: string): T {
  if (isCancel(answer)) {
    throw new RelizyCancelError(cancelMessage)
  }

  return answer as T
}

export async function askConfirm({ message, initialValue, active, inactive, cancelMessage = 'Cancelled' }: {
  message: string
  initialValue?: boolean
  active?: string
  inactive?: string
  cancelMessage?: string
}): Promise<boolean> {
  return answerOf<boolean>(await confirm({
    message,
    initialValue,
    active,
    inactive,
  }), cancelMessage)
}

export async function askSelect<T extends string>({ message, options, initialValue, cancelMessage = 'Cancelled' }: {
  message: string
  options: { value: T, label: string, hint?: string }[]
  initialValue?: T
  cancelMessage?: string
}): Promise<T> {
  // The options of select are a union type that the generic value does not narrow
  return answerOf<T>(await select({ message, options: options as Parameters<typeof select<T>>[0]['options'], initialValue }), cancelMessage)
}

export async function askText({ message, placeholder, cancelMessage = 'Cancelled' }: {
  message: string
  placeholder?: string
  cancelMessage?: string
}): Promise<string> {
  return answerOf<string>(await text({ message, placeholder }), cancelMessage)
}
