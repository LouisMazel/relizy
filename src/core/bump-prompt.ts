import type { PackageBase } from '../types'

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
  return bumpConfirmation ? bumpConfirmation(packages) : Promise.resolve(undefined)
}
