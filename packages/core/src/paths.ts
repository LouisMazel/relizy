import { relative, sep } from 'node:path'

/**
 * The path of a file or a directory relative to another one, with `/` separators
 * on every platform: what the git commands, the tags and the reports expect
 *
 * @param from - The directory the path is relative to (the root of the project)
 * @param to - The file or directory
 * @returns The relative path with `/` separators, empty when both are the same
 * @example
 * ```ts
 * getPosixRelativePath('/repo', '/repo/packages/core') // 'packages/core'
 * // On Windows: getPosixRelativePath('C:\\repo', 'C:\\repo\\packages\\core') // 'packages/core'
 * ```
 */
export function getPosixRelativePath(from: string, to: string): string {
  return relative(from, to).split(sep).join('/')
}
