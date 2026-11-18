import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { logger } from '@maz-ui/node'
import { getRunState } from './events'

/**
 * The files written by the current run (versions in `package.json`, changelogs,
 * `lerna.json`), with their content before the first write (`null` when the run
 * created the file). The release only stages and restores these files, so the
 * uncommitted changes of the working directory are never committed nor lost.
 * Each run has its own (`getRunState`): two runs at the same time never restore
 * nor commit the files of the other.
 */
const ORIGINAL_CONTENTS = Symbol('release files')

function getOriginalContents(): Map<string, string | null> {
  return getRunState(ORIGINAL_CONTENTS, () => new Map<string, string | null>())
}

/**
 * Record a file before Relizy writes it. Only the content before the first
 * write of the run is kept.
 */
export function recordReleaseFile(filePath: string): void {
  const absolutePath = resolve(filePath)
  const originalContents = getOriginalContents()

  if (originalContents.has(absolutePath)) {
    return
  }

  originalContents.set(absolutePath, existsSync(absolutePath)
    ? readFileSync(absolutePath, 'utf8')
    : null)
}

/**
 * The files written by the current run, relative to `cwd`.
 */
export function getReleaseFiles(cwd: string): string[] {
  return [
    ...getOriginalContents().keys(),
  ].map(filePath => relative(cwd, filePath))
}

/**
 * Restore the files written by the current run to their content before the run
 * (the files it created are removed), then forget them.
 * @returns The restored files, relative to `cwd`
 */
export function restoreReleaseFiles(cwd: string): string[] {
  const restored = getReleaseFiles(cwd)
  const originalContents = getOriginalContents()

  for (const [filePath, content] of originalContents) {
    if (content === null) {
      rmSync(filePath, { force: true })
    }
    else {
      writeFileSync(filePath, content, 'utf8')
    }

    logger.debug(`Restored ${relative(cwd, filePath)}`)
  }

  originalContents.clear()

  return restored
}

/**
 * Forget the files written so far, without restoring them: at the start of a
 * run, or once they are committed.
 */
export function resetReleaseFiles(): void {
  getOriginalContents().clear()
}
