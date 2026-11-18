import type { PackageBase } from '../types'
import process from 'node:process'

/**
 * Confirmation of a bump asked by the running output instead of the default
 * prompt (see `release-ui.ts`): undefined when it does not handle it
 */
type BumpConfirmation = (packages: (PackageBase & { oldVersion?: string })[]) => Promise<boolean | undefined>

let bumpConfirmation: BumpConfirmation | undefined

export function setBumpConfirmation(confirmation: BumpConfirmation | undefined): void {
  bumpConfirmation = confirmation
}

export function confirmBumpWithOutput(packages: (PackageBase & { oldVersion?: string })[]): Promise<boolean | undefined> {
  return bumpConfirmation
    ? bumpConfirmation(packages)
    : Promise.resolve(undefined)
}

/**
 * `relizy release` and `relizy bump` ask to confirm the new versions: without
 * an interactive terminal (CI), nobody can, so they fail right away with the
 * fix rather than after computing the versions
 */
export function assertBumpConfirmable({ command, yes, ciName }: {
  command: 'release' | 'bump'
  yes?: boolean
  /**
   * `GitHub Actions`, when known
   */
  ciName?: string | null
}): void {
  if (yes) {
    return
  }

  // Stdout only carries the events: the prompt would write in them
  if (process.env.RELIZY_REPORTER === 'json') {
    throw new Error(`relizy ${command} asks to confirm the new versions, but RELIZY_REPORTER=json keeps stdout for the events: run "relizy ${command} --yes" to confirm them in advance (or answer with onConfirm from the API)`)
  }

  if (process.stdin.isTTY) {
    return
  }

  // `CI=true` alone does not tell which CI
  const where = ciName && ciName !== 'Unknown CI'
    ? ` (${ciName})`
    : ''
  throw new Error(`relizy ${command} asks to confirm the new versions, but the terminal is not interactive${where}: run "relizy ${command} --yes" to confirm them in advance`)
}
