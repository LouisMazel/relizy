import type { RawGitCommit } from './types'
import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * The squash merge of a pull request, simulated on the commits `getGitDiff`
 * reads: the commits of the pull request become the single commit the merge
 * creates. Leaf module (only node built-ins), imported by `git-refs.ts`.
 */
export interface SimulatedSquash {
  /** Full hashes of the commits of the pull request; a commit read is replaced when its short hash is a prefix of one of them */
  hashes: string[]
  /** The commit of the squash merge, its body ending with the `--name-status` list of the pull request */
  commit: RawGitCommit
}

const storage = new AsyncLocalStorage<SimulatedSquash>()

/**
 * Runs `run` with the commits of the pull request squashed into one, as the
 * squash merge will: every read of `getGitDiff` inside sees the squash commit.
 *
 * @param squash - The commits to replace and the commit that replaces them
 * @param run - The code to run, sync or async; its return value is returned as is
 * @returns What `run` returns
 * @example
 * ```ts
 * const commits = withSimulatedSquash({ hashes, commit: squashCommit }, () => getGitDiff(from, 'HEAD', cwd))
 * // the commits of the pull request are replaced by squashCommit
 * ```
 */
export function withSimulatedSquash<T>(squash: SimulatedSquash, run: () => T): T {
  return storage.run(squash, run)
}

/**
 * The commits of a range with the ones of the simulated squash replaced by its
 * commit, at the place of the newest one. As is outside `withSimulatedSquash`.
 */
export function applySimulatedSquash(commits: RawGitCommit[]): RawGitCommit[] {
  const squash = storage.getStore()
  if (!squash) {
    return commits
  }

  const isSquashed = (commit: RawGitCommit) => Boolean(commit.shortHash) && squash.hashes.some(hash => hash.startsWith(commit.shortHash))
  const index = commits.findIndex(isSquashed)
  if (index === -1) {
    return commits
  }

  const rest = commits.filter(commit => !isSquashed(commit))
  rest.splice(index, 0, {
    ...squash.commit,
    author: { ...squash.commit.author },
  })

  return rest
}
