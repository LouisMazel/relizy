/**
 * Text helpers of the outputs (terminal, report, PR comment). Leaf module,
 * without dependency.
 */

/**
 * `1 commit`, `3 commits`, or `2 fixes` with `pluralWord`
 */
export function plural(count: number, word: string, pluralWord = `${word}s`): string {
  return `${count} ${count === 1
    ? word
    : pluralWord}`
}

/**
 * A duration in milliseconds as shown in the outputs: `850ms`, `2.4s`
 */
export function formatDuration(ms: number): string {
  return ms < 1000
    ? `${ms}ms`
    : `${(ms / 1000).toFixed(1)}s`
}

/**
 * A date to the minute, in UTC: `2026-11-06 01:42 UTC`
 */
export function formatUtcDate(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

/**
 * The repository tag of a version, from `templates.tagBody` (`v{{newVersion}}`):
 * every occurrence of the placeholder is replaced, as when the tag is created
 */
export function formatRepoTag(tagBody: string, version: string): string {
  return tagBody.replaceAll('{{newVersion}}', version)
}

/**
 * The default title of the release commit (`templates.commitMessage`): one
 * version (`unified`, `selective`), or the packages of the `independent` mode
 */
export const DEFAULT_RELEASE_COMMIT_MESSAGES = {
  version: 'chore(release): bump version to {{newVersion}}',
  packages: 'chore(release): bump {{packageCount}} packages',
} as const
