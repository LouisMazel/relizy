/**
 * Text helpers of the outputs of a release tool (terminal, report, PR comment).
 * Leaf module, without dependency.
 */

/**
 * `1 commit`, `3 commits`, or `2 fixes` with `pluralWord`
 *
 * @param count - The number of items, the singular is used for exactly 1
 * @param word - The singular word
 * @param pluralWord - The plural word, `word` followed by `s` by default
 * @returns The count and the word
 * @example
 * ```ts
 * plural(1, 'commit') // '1 commit'
 * plural(2, 'fix', 'fixes') // '2 fixes'
 * ```
 */
export function plural(count: number, word: string, pluralWord = `${word}s`): string {
  return `${count} ${count === 1
    ? word
    : pluralWord}`
}

/**
 * A duration in milliseconds as shown in the outputs: `850ms`, `2.4s`
 *
 * @param ms - The duration in milliseconds, shown in seconds with one decimal from 1000
 * @returns The formatted duration
 * @example
 * ```ts
 * formatDuration(850) // '850ms'
 * formatDuration(2400) // '2.4s'
 * ```
 */
export function formatDuration(ms: number): string {
  return ms < 1000
    ? `${ms}ms`
    : `${(ms / 1000).toFixed(1)}s`
}

/**
 * A date to the minute, in UTC: `2026-11-06 01:42 UTC`
 *
 * @param date - The date to format
 * @returns The `YYYY-MM-DD HH:mm UTC` string
 * @example
 * ```ts
 * formatUtcDate(new Date('2026-11-06T01:42:30Z')) // '2026-11-06 01:42 UTC'
 * ```
 */
export function formatUtcDate(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

/**
 * The repository tag of a version, from a tag template (`v{{newVersion}}`):
 * every occurrence of the placeholder is replaced, as when the tag is created
 *
 * @param tagBody - The tag template containing `{{newVersion}}`
 * @param version - The version to put in the tag
 * @returns The tag
 * @example
 * ```ts
 * formatRepoTag('v{{newVersion}}', '1.2.0') // 'v1.2.0'
 * ```
 */
export function formatRepoTag(tagBody: string, version: string): string {
  return tagBody.replaceAll('{{newVersion}}', version)
}
