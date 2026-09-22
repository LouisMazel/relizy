import type { BumpResultTruthy } from '../types'
import { extractVersionFromTag } from './version'

/**
 * A package entry as consumed by release-summary renderers (PR comments, Slack messages, etc.).
 * Normalizes the three possible shapes of "which packages shipped and at what version":
 *   - `bumpedPackages` from a monorepo bump (has both `oldVersion` and `newVersion`)
 *   - `packages` in standalone CLI mode (only `version`, no transition)
 *   - a mixed case where a bumped package didn't produce a new version
 */
export interface PackageBumpEntry {
  /** Package name (e.g. `@acme/ui`) */
  name: string
  /** Version before the release — only set when a real transition happened */
  oldVersion?: string
  /** Version after the release — only set when a real transition happened */
  newVersion?: string
  /** Fallback version when there is no old→new transition (standalone mode, graduations) */
  version: string
  /** True when `oldVersion` and `newVersion` are both set AND differ */
  hasTransition: boolean
}

/**
 * Collect package release data in a renderer-agnostic shape.
 * Shared by the PR-comment GFM table and the Slack mrkdwn list.
 */
export function collectPackageBumps({
  bumpedPackages,
  packages,
}: {
  bumpedPackages?: BumpResultTruthy['bumpedPackages']
  packages?: Array<{ name: string, version: string }>
}): PackageBumpEntry[] {
  if (bumpedPackages && bumpedPackages.length > 0) {
    return bumpedPackages.map((pkg) => {
      // `pkg.oldVersion` is the version currently in package.json, which for a
      // graduation (e.g. `6.16.0-beta.5` → `6.16.0`) is the last prerelease.
      // Announcements must instead show the previous *released* version we are
      // comparing against - exactly what `pkg.fromTag` encodes (last stable tag
      // for graduations, last prerelease tag for prerelease-to-prerelease). This
      // mirrors the changelog compare link / title. Fall back to `oldVersion`
      // when `fromTag` is not a version (new package marker, first-commit SHA).
      const displayOldVersion = extractVersionFromTag(pkg.fromTag, pkg.name) || pkg.oldVersion
      const hasTransition = Boolean(pkg.newVersion && displayOldVersion !== pkg.newVersion)
      return {
        name: pkg.name,
        oldVersion: displayOldVersion,
        newVersion: pkg.newVersion,
        version: pkg.newVersion || pkg.version,
        hasTransition,
      }
    })
  }

  if (packages && packages.length > 0) {
    return packages.map(pkg => ({
      name: pkg.name,
      version: pkg.version,
      hasTransition: false,
    }))
  }

  return []
}
