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

/** Options of the git execution helpers */
export interface GitExecOptions {
  /** Directory git runs in, the current directory of the process by default */
  cwd?: string
  /** The whole environment of git, `process.env` by default */
  env?: NodeJS.ProcessEnv
  /** Written to the stdin of git */
  input?: string
  /** 1 GB by default: a `git log` over the whole history of a large repository */
  maxBuffer?: number
  /** Trims the output, true by default (`git status --porcelain` starts with a space) */
  trim?: boolean
  /** Kills git after this many milliseconds and fails like any other error, no limit by default */
  timeout?: number
}

const DEFAULT_MAX_BUFFER = 1024 ** 3

function getStdio(input: string | undefined): ['ignore' | 'pipe', 'pipe', 'pipe'] {
  return [
    input === undefined
      ? 'ignore'
      : 'pipe',
    'pipe',
    'pipe',
  ]
}

/**
 * A git command as shown in the logs: the arguments with spaces or quotes are
 * JSON-quoted. For display only, the command is never run through a shell.
 *
 * @param args - The arguments given to git, without the leading `git`
 * @returns The command line, e.g. `git commit -m "chore: release"`
 * @example
 * ```ts
 * formatGitCommand(['commit', '-m', 'chore: release v1.0.0'])
 * // 'git commit -m "chore: release v1.0.0"'
 * formatGitCommand(['tag', '-a', 'v1.0.0'])
 * // 'git tag -a v1.0.0'
 * ```
 */
export function formatGitCommand(args: string[]): string {
  return [
    'git',
    ...args.map(arg => /^[\w@./:=+-]+$/.test(arg)
      ? arg
      : JSON.stringify(arg)),
  ].join(' ')
}

function getOutput(stdout: string, trim = true): string {
  return trim
    ? stdout.trim()
    : stdout
}

/**
 * Runs git synchronously, without a shell, and returns its output. Throws when
 * git fails (exit code other than 0) or is killed by the timeout; the error is
 * redacted of secrets and carries the stderr of git.
 *
 * @param args - The arguments given to git, without the leading `git`
 * @param options - See `GitExecOptions`
 * @param options.cwd - Directory git runs in
 * @param options.env - The whole environment of git, `process.env` by default
 * @param options.input - Written to the stdin of git
 * @param options.maxBuffer - Maximum size of the output in bytes, 1 GB by default
 * @param options.trim - Trims the output, true by default
 * @param options.timeout - Kills git after this many milliseconds, no limit by default
 * @returns The stdout of git as a string, trimmed unless `trim` is false
 * @throws The error of `execFileSync` (secrets redacted) when git exits with a non-zero code, cannot be spawned or exceeds `timeout` or `maxBuffer`; its message includes the stderr of git
 * @example
 * ```ts
 * const branch = runGitSync(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: '/path/to/repo' })
 * // 'main'
 * ```
 */
export function runGitSync(args: string[], { cwd, env, input, maxBuffer = DEFAULT_MAX_BUFFER, trim, timeout }: GitExecOptions = {}): string {
  try {
    const stdout = execFileSync('git', args, {
      cwd,
      env,
      input,
      maxBuffer,
      timeout,
      encoding: 'utf8',
      stdio: getStdio(input),
    })
    return getOutput(stdout, trim)
  }
  catch (error) {
    throw redactError(error)
  }
}

/**
 * Like `runGitSync`, but returns undefined instead of throwing when git fails.
 *
 * @param args - The arguments given to git, without the leading `git`
 * @param options - See `GitExecOptions`
 * @returns The stdout of git, or undefined when git fails
 * @example
 * ```ts
 * const head = tryGitSync(['rev-parse', 'HEAD'], { cwd }) // undefined before the first commit
 * ```
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
 * Runs git synchronously and returns its raw stdout, for the outputs read by
 * byte (`git cat-file --batch`). Throws when git fails, like `runGitSync`.
 *
 * @param args - The arguments given to git, without the leading `git`
 * @param options - See `GitExecOptions`, except `trim`
 * @param options.cwd - Directory git runs in
 * @param options.env - The whole environment of git, `process.env` by default
 * @param options.input - Written to the stdin of git
 * @param options.maxBuffer - Maximum size of the output in bytes, 1 GB by default
 * @param options.timeout - Kills git after this many milliseconds, no limit by default
 * @returns The stdout of git as a Buffer, never trimmed
 * @throws The error of `execFileSync` (secrets redacted) when git exits with a non-zero code, cannot be spawned or exceeds `timeout` or `maxBuffer`
 * @example
 * ```ts
 * const out = runGitSyncBuffer(['cat-file', '--batch'], { cwd, input: 'HEAD:package.json\n' })
 * ```
 */
export function runGitSyncBuffer(args: string[], { cwd, env, input, maxBuffer = DEFAULT_MAX_BUFFER, timeout }: Omit<GitExecOptions, 'trim'> = {}): Buffer {
  try {
    return execFileSync('git', args, {
      cwd,
      env,
      input,
      maxBuffer,
      timeout,
      stdio: getStdio(input),
    })
  }
  catch (error) {
    throw redactError(error)
  }
}

/**
 * Runs git without blocking and returns its output. Rejects when git fails,
 * with the `stdout` and `stderr` of git on the error.
 *
 * @param args - The arguments given to git, without the leading `git`
 * @param options - See `GitExecOptions`
 * @param options.cwd - Directory git runs in
 * @param options.env - The whole environment of git, `process.env` by default
 * @param options.input - Written to the stdin of git
 * @param options.maxBuffer - Maximum size of the output in bytes, 1 GB by default
 * @param options.trim - Trims the output, true by default
 * @param options.timeout - Kills git after this many milliseconds, no limit by default
 * @returns The stdout of git, trimmed unless `trim` is false
 * @throws Rejects with the git error (secrets redacted) carrying `stdout` and `stderr` when git exits with a non-zero code, cannot be spawned or exceeds `timeout` or `maxBuffer`
 * @example
 * ```ts
 * const tags = await runGit(['tag', '--list', 'v*'], { cwd })
 * // 'v1.0.0\nv1.1.0'
 * ```
 */
export function runGit(args: string[], { cwd, env, input, maxBuffer = DEFAULT_MAX_BUFFER, trim, timeout }: GitExecOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile('git', args, {
      cwd,
      env,
      maxBuffer,
      timeout,
      encoding: 'utf8',
    }, (error, stdout, stderr) => {
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
 * Like `runGit`, but resolves to undefined instead of rejecting when git fails.
 *
 * @param args - The arguments given to git, without the leading `git`
 * @param options - See `GitExecOptions`
 * @returns The stdout of git, or undefined when git fails
 * @example
 * ```ts
 * await tryGit(['merge', '--abort'], { cwd }) // never throws
 * ```
 */
export async function tryGit(args: string[], options?: GitExecOptions): Promise<string | undefined> {
  try {
    return await runGit(args, options)
  }
  catch {
    return undefined
  }
}
