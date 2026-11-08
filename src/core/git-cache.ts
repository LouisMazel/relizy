import { AsyncLocalStorage } from 'node:async_hooks'
import { resolve } from 'node:path'
import process from 'node:process'

/**
 * Cache of the git reads of a command run (`bump`, `release`...): the branch,
 * the tags and the commits of a range are read again for each package and each
 * step. Leaf module (only node built-ins), like `git-refs.ts`.
 *
 * Only active inside `withGitCache()`: outside a command, every read runs git.
 * Cleared by the git writes of relizy changing HEAD, a branch or a tag (commit,
 * tag, fetch, checkout, push) and after the commands of the user (hooks, format
 * and build commands), which can change the repository.
 */
const storage = new AsyncLocalStorage<{ reads: Map<string, unknown>, once: Map<string, unknown> }>()

/**
 * Runs a command with a git cache. A command run by another one (`bump` in
 * `release`) shares the cache of the outer one.
 */
export function withGitCache<T>(run: () => T): T {
  return storage.getStore()
    ? run()
    : storage.run({
        reads: new Map(),
        once: new Map(),
      }, run)
}

/**
 * The value of a git read, from the cache of the running command when it was
 * already read in `cwd` with the same `key`. A promise is cached as is, and
 * dropped when it rejects; a read that throws is not cached.
 */
export function cachedGitRead<T>({ key, cwd, read }: { key: string[], cwd?: string, read: () => T }): T {
  const cache = storage.getStore()?.reads

  if (!cache) {
    return read()
  }

  const id = JSON.stringify([
    resolve(cwd ?? process.cwd()),
    ...key,
  ])

  if (cache.has(id)) {
    return cache.get(id) as T
  }

  const value = read()
  cache.set(id, value)

  if (value instanceof Promise) {
    value.catch(() => {
      if (cache.get(id) === value) {
        cache.delete(id)
      }
    })
  }

  return value
}

/**
 * Forgets the git reads of the running command: to call after a write that
 * changes HEAD, a branch or a tag.
 */
export function clearGitCache(): void {
  storage.getStore()?.reads.clear()
}

/**
 * Runs `run` once per command run for the same `key` and `cwd` (a check or a
 * preparation of the repository), and returns the value of the first call.
 * Kept until the end of the run: the git writes do not clear it. Outside
 * `withGitCache()`, `run` is called each time.
 */
export function oncePerRun<T>({ key, cwd, run }: { key: string, cwd: string, run: () => T }): T {
  const once = storage.getStore()?.once

  if (!once) {
    return run()
  }

  const id = JSON.stringify([
    resolve(cwd),
    key,
  ])

  if (!once.has(id)) {
    once.set(id, run())
  }

  return once.get(id) as T
}
