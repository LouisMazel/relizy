import type { ResolvedRelizyConfig } from './config'
import { existsSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { execPromise, logger } from '@maz-ui/node'
import { getErrorMessage } from '@maz-ui/utils/helpers/getErrorMessage'
import { clearGitCache } from './git-cache'
import { getExecCommand } from './npm-registry'
import { reportProgress, reportStepNote } from './progress'

/**
 * Placeholder of `changelog.formatCmd` replaced by the changelogs written
 */
export const FORMAT_FILES_PLACEHOLDER = '{{files}}'

/**
 * The formatters run on the changelogs without `changelog.formatCmd`, by
 * priority (a dedicated formatter before ESLint): the dependency of the root
 * `package.json` and the command, the changelogs appended. A file the tool
 * ignores or does not handle is skipped without error.
 */
const FORMATTERS = [
  { name: 'biome', dependency: '@biomejs/biome', command: 'biome format --write --files-ignore-unknown=true --no-errors-on-unmatched' },
  { name: 'prettier', dependency: 'prettier', command: 'prettier --write --ignore-unknown --no-error-on-unmatched-pattern' },
  { name: 'oxfmt', dependency: 'oxfmt', command: 'oxfmt --no-error-on-unmatched-pattern' },
  { name: 'dprint', dependency: 'dprint', command: 'dprint fmt --allow-no-files' },
  { name: 'eslint', dependency: 'eslint', command: 'eslint --fix --no-warn-ignored' },
] as const

export type ChangelogFormatter = typeof FORMATTERS[number]['name']

export interface FormatCommand {
  command: string
  /**
   * The formatter detected, without `changelog.formatCmd`
   */
  formatter?: ChangelogFormatter
}

/**
 * The formatter of the changelogs, from the dependencies of the root `package.json`
 */
export function findChangelogFormatter(dependencies: Record<string, unknown>): ChangelogFormatter | undefined {
  return FORMATTERS.find(({ dependency }) => dependency in dependencies)?.name
}

function readRootDependencies(cwd: string): Record<string, unknown> {
  const path = join(cwd, 'package.json')

  if (!existsSync(path)) {
    return {}
  }

  try {
    const json = JSON.parse(readFileSync(path, 'utf8'))
    return {
      ...json.dependencies,
      ...json.devDependencies,
    }
  }
  catch {
    return {}
  }
}

/**
 * The changelogs, relative to `cwd` and quoted, for the command line
 */
function quoteFiles(cwd: string, files: string[]): string {
  return files.map(file => `"${relative(cwd, file).split(sep).join('/')}"`).join(' ')
}

/**
 * The command formatting the changelogs written:
 * - `changelog.formatCmd`, its `{{files}}` replaced by the changelogs
 * - without it, the formatter of the project, on the changelogs only
 * - none with `changelog.formatCmd: false`, or without changelog to format
 */
export function resolveFormatCommand({ config, files }: { config: ResolvedRelizyConfig, files: string[] }): FormatCommand | undefined {
  const formatCmd = config.changelog?.formatCmd

  if (formatCmd === false) {
    logger.debug('Changelog formatting disabled (changelog.formatCmd: false)')
    return undefined
  }

  if (formatCmd) {
    if (!formatCmd.includes(FORMAT_FILES_PLACEHOLDER)) {
      return { command: formatCmd }
    }

    return files.length > 0
      ? {
          command: formatCmd.replaceAll(FORMAT_FILES_PLACEHOLDER, quoteFiles(config.cwd, files)),
        }
      : undefined
  }

  if (files.length === 0) {
    return undefined
  }

  const formatter = FORMATTERS.find(({ name }) => name === findChangelogFormatter(readRootDependencies(config.cwd)))

  if (!formatter) {
    logger.debug('No formatter found in the root package.json, the changelogs are not formatted')
    return undefined
  }

  return {
    command: `${getExecCommand(config.publish.packageManager, formatter.command)} ${quoteFiles(config.cwd, files)}`,
    formatter: formatter.name,
  }
}

/**
 * Format the changelogs written (see `resolveFormatCommand()`). The failure of
 * a detected formatter is only a warning: the changelogs are written.
 */
export async function executeFormatCmd({
  config,
  dryRun,
  files = [],
}: {
  config: ResolvedRelizyConfig
  dryRun: boolean
  /**
   * The changelogs written
   */
  files?: string[]
}) {
  const format = resolveFormatCommand({ config, files })

  if (!format) {
    logger.debug('No format command to run')
    return
  }

  if (dryRun) {
    logger.log('[dry-run] exec format command: ', format.command)
    return
  }

  reportProgress(format.formatter
    ? `Formatting the changelogs with ${format.formatter}`
    : 'Formatting the changelogs')
  logger.info('Running format command')
  logger.debug(`Running format command: ${format.command}`)

  try {
    await execPromise(format.command, {
      noStderr: true,
      noStdout: true,
      logLevel: config.logLevel,
      cwd: config.cwd,
    })
    logger.info('Format completed')

    if (format.formatter) {
      reportStepNote(`Changelogs formatted with ${format.formatter}`)
    }
  }
  catch (error) {
    if (!format.formatter) {
      throw new Error(`Format command failed: ${getErrorMessage(error)}`, { cause: error })
    }

    logger.warn(`The changelogs were not formatted, ${format.formatter} failed: set changelog.formatCmd to choose the command, or false to skip the formatting\n${getErrorMessage(error)}`)
  }
  finally {
    clearGitCache()
  }
}
