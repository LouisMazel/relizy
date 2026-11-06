import type { Buffer } from 'node:buffer'
import { execFile, execFileSync } from 'node:child_process'
import { redactError } from '@maz-ui/node'

/**
 * The single way relizy runs git. Without a shell: the arguments are passed as
 * they are, so a branch, a tag, a path or a commit message can contain quotes,
 * `$` or backticks, on every platform, without escaping. Leaf module (node
 * built-ins and `@maz-ui/node`), like `git-cache.ts`: the cached reads wrap
 * these calls in `cachedGitRead()`.
 *
 * The stderr of git is captured, never written to the terminal of the user:
 * it is in the message of the error when git fails.
 */

export interface GitExecOptions {
  cwd?: string
  /** The whole environment of git, `process.env` by default */
  env?: NodeJS.ProcessEnv
  /** Written to the stdin of git */
  input?: string
  /** 1 GB by default: a `git log` over the whole history of a large repository */
  maxBuffer?: number
  /** Trims the output, true by default (`git status --porcelain` starts with a space) */
  trim?: boolean
}

const DEFAULT_MAX_BUFFER = 1024 ** 3

function getStdio(input: string | undefined): ['ignore' | 'pipe', 'pipe', 'pipe'] {
  return [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe']
}

/**
 * A git command as shown in the logs: the arguments with spaces or quotes are quoted
 */
export function formatGitCommand(args: string[]): string {
  return ['git', ...args.map(arg => /^[\w@./:=+-]+$/.test(arg) ? arg : JSON.stringify(arg))].join(' ')
}

function getOutput(stdout: string, trim = true): string {
  return trim ? stdout.trim() : stdout
}

/**
 * Runs git and returns its output. Throws when git fails (exit code other than 0).
 */
export function runGitSync(args: string[], { cwd, env, input, maxBuffer = DEFAULT_MAX_BUFFER, trim }: GitExecOptions = {}): string {
  try {
    const stdout = execFileSync('git', args, { cwd, env, input, maxBuffer, encoding: 'utf8', stdio: getStdio(input) })
    return getOutput(stdout, trim)
  }
  catch (error) {
    throw redactError(error)
  }
}

/**
 * The output of git, undefined when git fails
 */
export function tryGitSync(args: string[], options?: GitExecOptions): string | undefined {
  try {
    return runGitSync(args, options)
  }
  catch {
    return undefined
  }
}

/**
 * The raw output of git, for the outputs read by byte (`git cat-file --batch`)
 */
export function runGitSyncBuffer(args: string[], { cwd, env, input, maxBuffer = DEFAULT_MAX_BUFFER }: Omit<GitExecOptions, 'trim'> = {}): Buffer {
  try {
    return execFileSync('git', args, { cwd, env, input, maxBuffer, stdio: getStdio(input) })
  }
  catch (error) {
    throw redactError(error)
  }
}

/**
 * Runs git without blocking and returns its output. Rejects when git fails,
 * with the `stdout` and `stderr` of git on the error.
 */
export function runGit(args: string[], { cwd, env, input, maxBuffer = DEFAULT_MAX_BUFFER, trim }: GitExecOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile('git', args, { cwd, env, maxBuffer, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        reject(redactError(Object.assign(error, { stdout, stderr })))
        return
      }

      resolve(getOutput(stdout, trim))
    })

    if (input !== undefined) {
      child.stdin?.end(input)
    }
  })
}

/**
 * The output of git, undefined when git fails
 */
export async function tryGit(args: string[], options?: GitExecOptions): Promise<string | undefined> {
  try {
    return await runGit(args, options)
  }
  catch {
    return undefined
  }
}
