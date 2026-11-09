import type { CoreLogger, PackageManager } from './types'
import { existsSync, readFileSync } from 'node:fs'
import path, { join } from 'node:path'
import process from 'node:process'

const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun']

function readPackageManagerField(cwd: string, debug: (message: string) => void): PackageManager | undefined {
  const packageJsonPath = join(cwd, 'package.json')

  if (!existsSync(packageJsonPath)) {
    return undefined
  }

  try {
    const pmField = JSON.parse(readFileSync(packageJsonPath, 'utf-8')).packageManager

    if (typeof pmField !== 'string') {
      return undefined
    }

    const pmName = pmField.split('@')[0] as string

    if (PACKAGE_MANAGERS.includes(pmName)) {
      debug(`Detected package manager from package.json: ${pmName}`)
      return pmName as PackageManager
    }
  }
  catch (e) {
    const errorString = e instanceof Error
      ? e.message
      : String(e)
    debug(`Failed to parse package.json: ${errorString}`)
  }

  return undefined
}

const LOCK_FILES: Record<PackageManager, string> = {
  pnpm: 'pnpm-lock.yaml',
  yarn: 'yarn.lock',
  npm: 'package-lock.json',
  bun: 'bun.lockb',
}

function readLockFileManager(cwd: string, debug: (message: string) => void): PackageManager | undefined {
  for (const [manager, file] of Object.entries(LOCK_FILES)) {
    if (existsSync(join(cwd, file))) {
      debug(`Detected package manager from lockfile: ${manager}`)
      return manager as PackageManager
    }
  }

  return undefined
}

/**
 * The package manager a project declares: the `packageManager` field of its
 * `package.json`, else its lockfile (`pnpm-lock.yaml`, `yarn.lock`,
 * `package-lock.json`, `bun.lockb`, checked in that order). Undefined when it
 * has neither, where `detectPackageManager` falls back to the user agent and to `npm`.
 *
 * @param cwd - Directory of the project (default: the current directory)
 * @param logger - Receives debug messages about the source of the detection
 * @returns The package manager, or undefined when the project declares none
 */
export function findPackageManager(cwd: string = process.cwd(), logger?: CoreLogger): PackageManager | undefined {
  const debug = (message: string) => logger?.debug?.(message)

  return readPackageManagerField(cwd, debug) ?? readLockFileManager(cwd, debug)
}

/**
 * The package manager of a project: the `packageManager` field of its
 * `package.json`, else its lockfile, else the user agent of the running
 * command (`npm_config_user_agent`), `npm` by default. Never throws: an error
 * is reported with `logger.fail` and gives `npm`.
 *
 * @param cwd - Directory of the project (default: the current directory)
 * @param logger - Receives debug messages about the source of the detection
 * @returns The package manager, `npm` when nothing is detected
 * @example
 * ```ts
 * detectPackageManager('/repo') // 'pnpm' when /repo/package.json has "packageManager": "pnpm@9.0.0"
 * ```
 */
export function detectPackageManager(cwd: string = process.cwd(), logger?: CoreLogger): PackageManager {
  const debug = (message: string) => logger?.debug?.(message)

  try {
    const found = findPackageManager(cwd, logger)

    if (found) {
      return found
    }

    const match = /(pnpm|yarn|npm|bun)/.exec(process.env.npm_config_user_agent ?? '')
    if (match) {
      debug(`Detected package manager from user agent: ${match[1]}`)
      return match[1] as PackageManager
    }

    debug('No package manager detected, defaulting to npm')
    return 'npm'
  }
  catch (error) {
    logger?.fail?.(`Error detecting package manager: ${error}, defaulting to npm`)
    return 'npm'
  }
}

/**
 * The command line that runs a binary of the dependencies with a package
 * manager: `pnpm exec`, `yarn`, `bunx`, `npx` for npm.
 *
 * @param packageManager - The package manager to use
 * @param command - The binary and its arguments
 * @returns The full command line
 * @example
 * ```ts
 * getExecCommand('pnpm', 'eslint .') // 'pnpm exec eslint .'
 * getExecCommand('npm', 'eslint .') // 'npx eslint .'
 * ```
 */
export function getExecCommand(packageManager: PackageManager, command: string): string {
  switch (packageManager) {
    case 'pnpm':
      return `pnpm exec ${command}`
    case 'yarn':
      return `yarn ${command}`
    case 'bun':
      return `bunx ${command}`
    default:
      return `npx ${command}`
  }
}

/**
 * Whether a project uses Yarn Berry (2+), which reads `.yarnrc.yml`: true when
 * that file exists in `cwd`.
 *
 * @param cwd - Directory of the project
 * @returns True when `.yarnrc.yml` exists
 */
export function isYarnBerry(cwd: string): boolean {
  return existsSync(path.join(cwd, '.yarnrc.yml'))
}
