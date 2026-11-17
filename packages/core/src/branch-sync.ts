import type { CoreLogger } from './types'
import { isPushRejectedAsBehind } from './ci'
import { clearGitCache } from './git-cache'
import { formatGitCommand, runGit } from './git-exec'
import { isAncestor } from './git-refs'

/**
 * Merge a released branch into other branches (`main` into `develop`) and push
 * them, without checkout: the merge is computed in memory (`git merge-tree`,
 * git 2.38 or later), so the working directory, the current branch and the
 * git hooks are left untouched.
 */

/**
 * What the sync did to a branch: `merged` (a merge commit), `fast-forward`
 * (the branch had nothing of its own), `up-to-date` (it already has the
 * source), `conflict` (nothing pushed: the merge is to be done by hand)
 */
export type BranchSyncStatus = 'merged' | 'fast-forward' | 'up-to-date' | 'conflict'

/** The outcome of `syncGitBranch` */
export interface BranchSyncResult {
  /** The branch merged into */
  target: string
  status: BranchSyncStatus
  /** The commit pushed to the branch (the merge commit, the source for a fast-forward), none when up to date or in conflict, and not pushed in dry-run */
  commit?: string
  /** The files in conflict */
  conflicts?: string[]
  /** The commands doing the merge by hand, for a conflict */
  manualCommands?: string[]
}

/** Attempts of the push when the branch receives commits while it is merged */
const MAX_PUSH_ATTEMPTS = 3

/** The error code of `git merge-tree --write-tree` for a merge in conflict */
const MERGE_TREE_CONFLICT_CODE = 1

/**
 * Whether the branch exists on the remote (`git ls-remote --heads`). Makes a
 * network call.
 *
 * @param options - The options
 * @param options.cwd - Directory of the repository
 * @param options.remote - The remote, `origin` by default
 * @param options.branch - The name of the branch, without `refs/heads/`
 * @returns True when the remote has the branch
 * @throws The git error when the remote cannot be reached
 * @example
 * ```ts
 * await remoteBranchExists({ cwd, branch: 'develop' }) // true
 * ```
 */
export async function remoteBranchExists({ cwd, remote = 'origin', branch }: { cwd: string, remote?: string, branch: string }): Promise<boolean> {
  const output = await runGit([
    'ls-remote',
    '--heads',
    remote,
    `refs/heads/${branch}`,
  ], { cwd })

  return output.length > 0
}

async function fetchBranch({ cwd, remote, branch }: { cwd: string, remote: string, branch: string }): Promise<string> {
  const trackingRef = `refs/remotes/${remote}/${branch}`

  try {
    await runGit([
      'fetch',
      '--quiet',
      remote,
      `+refs/heads/${branch}:${trackingRef}`,
    ], { cwd })
  }
  catch (error) {
    const { stderr } = error as { stderr?: unknown }
    if (typeof stderr === 'string' && stderr.includes('couldn\'t find remote ref')) {
      throw new Error(`The branch "${branch}" does not exist on "${remote}": create it, or remove it from the branches to sync`, { cause: error })
    }
    throw error
  }
  clearGitCache()

  return await runGit(['rev-parse', '--verify', `${trackingRef}^{commit}`], { cwd })
}

/** The tree of the merge, or its conflicts */
async function mergeTree({ cwd, target, source }: { cwd: string, target: string, source: string }): Promise<{ tree: string } | { conflicts: string[] }> {
  try {
    const tree = await runGit([
      'merge-tree',
      '--write-tree',
      '--name-only',
      '--no-messages',
      target,
      source,
    ], { cwd })
    return { tree }
  }
  catch (error) {
    const { code, stdout, stderr } = error as { code?: unknown, stdout?: unknown, stderr?: unknown }

    if (code === MERGE_TREE_CONFLICT_CODE && typeof stdout === 'string' && stdout.trim()) {
      // The tree, then the files in conflict
      const [, ...files] = stdout.trim().split('\n')
      return {
        conflicts: [
          ...new Set(files.filter(Boolean)),
        ],
      }
    }
    if (typeof stderr === 'string' && /write-tree|usage: git merge-tree/.test(stderr)) {
      throw new Error('The sync of the branches needs git 2.38 or later (git merge-tree --write-tree): upgrade git', { cause: error })
    }
    throw error
  }
}

/** The push lost a race: the branch received commits since it was fetched */
function isPushRaced(error: unknown): boolean {
  const { stderr } = (error ?? {}) as { stderr?: unknown }

  return isPushRejectedAsBehind(error) || (typeof stderr === 'string' && stderr.includes('cannot lock ref'))
}

function getManualCommands({ remote, target, sourceName }: { remote: string, target: string, sourceName: string }): string[] {
  return [
    `git fetch ${remote}`,
    `git switch ${target}`,
    `git merge ${remote}/${sourceName}`,
    `git push ${remote} ${target}`,
  ]
}

/**
 * What to push to the branch just fetched: the source, or a merge commit (not
 * created in dry-run), else the outcome when there is nothing to push
 */
async function planSync({ cwd, remote, target, sourceCommit, name, message, dryRun, logger }: {
  cwd: string
  remote: string
  target: string
  sourceCommit: string
  name: string
  message: string
  dryRun: boolean
  logger?: CoreLogger
}): Promise<{ result: BranchSyncResult } | { status: 'merged' | 'fast-forward', commit: string }> {
  const targetCommit = await fetchBranch({ cwd, remote, branch: target })

  if (await isAncestor(sourceCommit, targetCommit, cwd)) {
    logger?.debug?.(`"${target}" already has ${name}`)
    return {
      result: { target, status: 'up-to-date' },
    }
  }

  if (await isAncestor(targetCommit, sourceCommit, cwd)) {
    return { status: 'fast-forward', commit: sourceCommit }
  }

  const merge = await mergeTree({ cwd, target: targetCommit, source: sourceCommit })

  if ('conflicts' in merge) {
    logger?.debug?.(`The merge of ${name} into "${target}" is in conflict: ${merge.conflicts.join(', ')}`)
    return {
      result: {
        target,
        status: 'conflict',
        conflicts: merge.conflicts,
        manualCommands: getManualCommands({ remote, target, sourceName: name }),
      },
    }
  }

  return {
    status: 'merged',
    // The tree of the merge in dry-run: nothing is pushed
    commit: dryRun
      ? merge.tree
      : await runGit([
          'commit-tree',
          merge.tree,
          '-p',
          targetCommit,
          '-p',
          sourceCommit,
          '-m',
          message,
        ], { cwd }),
  }
}

/** Push what `planSync` planned: the outcome, undefined when the push lost a race to retry */
async function pushSync({ cwd, remote, target, name, plan, noVerify, dryRun, retry, logger }: {
  cwd: string
  remote: string
  target: string
  name: string
  plan: { status: 'merged' | 'fast-forward', commit: string }
  noVerify: boolean
  dryRun: boolean
  retry: boolean
  logger?: CoreLogger
}): Promise<BranchSyncResult | undefined> {
  const pushArgs = [
    'push',
    ...(noVerify
      ? ['--no-verify']
      : []),
    remote,
    `${plan.commit}:refs/heads/${target}`,
  ]

  if (dryRun) {
    const merge = plan.status === 'merged'
      ? `merge ${name} into ${target}, then `
      : ''
    logger?.info?.(`[dry-run] ${merge}${formatGitCommand(pushArgs)}`)
    return { target, status: plan.status }
  }

  try {
    logger?.debug?.(`Executing: ${formatGitCommand(pushArgs)}`)
    await runGit(pushArgs, { cwd })
    return { target, status: plan.status, commit: plan.commit }
  }
  catch (error) {
    if (!retry || !isPushRaced(error)) {
      throw error
    }
    // Fetched again by the next attempt, the merge commit is left to the garbage collection
    logger?.debug?.(`"${target}" received new commits during the sync, merging again`)
    return undefined
  }
}

/**
 * Merge `source` into the branch `target` of the remote and push it, without
 * checkout nor git hooks: fetches the branch, then pushes the source as is
 * when the branch has nothing of its own (`fast-forward`), else a merge commit
 * computed by `git merge-tree` (git 2.38 or later). Nothing is pushed when the
 * branch already has the source (`up-to-date`) or when the merge is in
 * conflict (`conflict`, with the files and the commands doing it by hand).
 * When the push is rejected because the branch received commits meanwhile,
 * the merge is computed again (3 attempts). With `dryRun`, the branch is
 * fetched and the merge computed, nothing is pushed. Makes network calls.
 *
 * @param options - The options
 * @param options.cwd - Directory of the repository
 * @param options.target - The branch to merge into, without `refs/heads/`
 * @param options.source - The commit to merge (a ref or a sha), `HEAD` by default
 * @param options.sourceName - The name of the source in the merge message and the manual commands, `source` by default
 * @param options.remote - The remote of the branch, `origin` by default
 * @param options.message - The message of the merge commit, `Merge branch '<sourceName>' into <target>` by default
 * @param options.noVerify - Push with `--no-verify` (no pre-push hook), false by default
 * @param options.dryRun - Compute the merge without pushing, false by default
 * @param options.logger - Receives the debug and info (dry-run) logs
 * @returns What was done to the branch, see `BranchSyncResult`
 * @throws When the branch does not exist on the remote, when git is older than 2.38, and the git error when the push is refused (after 3 rejections as behind for a branch that keeps moving)
 * @example
 * ```ts
 * const result = await syncGitBranch({ cwd, target: 'develop', sourceName: 'main', message: 'chore(release): sync develop with main' })
 * // { target: 'develop', status: 'merged', commit: '3f2a...' }
 * ```
 */
export async function syncGitBranch({
  cwd,
  target,
  source = 'HEAD',
  sourceName,
  remote = 'origin',
  message,
  noVerify = false,
  dryRun = false,
  logger,
}: {
  /** Directory of the repository */
  cwd: string
  /** The branch to merge into */
  target: string
  /** The commit to merge, `HEAD` by default */
  source?: string
  /** The name of the source in the merge message and the manual commands */
  sourceName?: string
  /** The remote of the branch, `origin` by default */
  remote?: string
  /** The message of the merge commit */
  message?: string
  /** Push with `--no-verify` */
  noVerify?: boolean
  /** Compute the merge without pushing */
  dryRun?: boolean
  /** Receives the debug and info (dry-run) logs */
  logger?: CoreLogger
}): Promise<BranchSyncResult> {
  const name = sourceName || source
  const sourceCommit = await runGit(['rev-parse', '--verify', `${source}^{commit}`], { cwd })
  const mergeMessage = message || `Merge branch '${name}' into ${target}`

  for (let attempt = 1; ; attempt++) {
    const plan = await planSync({
      cwd,
      remote,
      target,
      sourceCommit,
      name,
      message: mergeMessage,
      dryRun,
      logger,
    })
    const result = 'result' in plan
      ? plan.result
      : await pushSync({
          cwd,
          remote,
          target,
          name,
          plan,
          noVerify,
          dryRun,
          retry: attempt < MAX_PUSH_ATTEMPTS,
          logger,
        })

    if (result) {
      return result
    }
  }
}
