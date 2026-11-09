/**
 * Defaults of the release commit written by relizy.
 */

/**
 * The default title of the release commit (`templates.commitMessage`): one
 * version (`unified`, `selective`), or the packages of the `independent` mode
 */
export const DEFAULT_RELEASE_COMMIT_MESSAGES = {
  version: 'chore(release): bump version to {{newVersion}}',
  packages: 'chore(release): bump {{packageCount}} packages',
} as const
