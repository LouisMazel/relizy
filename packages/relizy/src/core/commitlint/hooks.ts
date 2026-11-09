import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { getGitPath, runGitSync, tryGitSync } from '@relizy/core'

/**
 * The `commit-msg` hook running `relizy commitlint`: where it is written, what
 * it replaces, and whether the project already has it.
 */

export interface InstalledHook {
  path: string
  status: 'created' | 'replaced' | 'unchanged'
}

export const COMMIT_MSG_HOOK_COMMAND = 'npx --no -- relizy commitlint --edit "$1"'

/**
 * The `commit-msg` hook written by relizy: in `.husky/` when husky is set up,
 * otherwise in the hooks directory of git
 */
function getCommitMsgHookPath(cwd: string): { root: string, path: string, husky: boolean } {
  const root = runGitSync(['rev-parse', '--show-toplevel'], { cwd })
  const husky = join(root, '.husky')
  const hooksPath = tryGitSync(['config', 'core.hooksPath'], { cwd })
  const hooksDirectory = hooksPath
    ? (isAbsolute(hooksPath)
        ? hooksPath
        : join(root, hooksPath))
    : getGitPath('hooks', cwd)
  return existsSync(husky)
    ? {
        root,
        path: join(husky, 'commit-msg'),
        husky: true,
      }
    : {
        root,
        path: join(hooksDirectory, 'commit-msg'),
        husky: false,
      }
}

/**
 * The `commit-msg` hook that relizy would replace, relative to the root of the
 * repository: `undefined` without hook, outside a git repository, or when the
 * hook already runs `relizy commitlint`
 */
export function findOtherCommitMsgHook(cwd: string): string | undefined {
  try {
    const { root, path } = getCommitMsgHookPath(cwd)
    return existsSync(path) && !readFileSync(path, 'utf8').includes('relizy commitlint')
      ? relative(root, path)
      : undefined
  }
  catch {
    return undefined
  }
}

/**
 * Write the `commit-msg` hook running `relizy commitlint`: in `.husky/` when
 * husky is set up, otherwise in the hooks directory of git. An existing hook is
 * only replaced with `force`.
 */
export function installCommitMsgHook({ cwd, force = false }: { cwd: string, force?: boolean }): InstalledHook {
  const { root, path, husky } = getCommitMsgHookPath(cwd)
  const content = husky
    ? `${COMMIT_MSG_HOOK_COMMAND}\n`
    : `#!/bin/sh\n${COMMIT_MSG_HOOK_COMMAND}\n`

  let status: InstalledHook['status'] = 'created'
  if (existsSync(path)) {
    const existing = readFileSync(path, 'utf8')
    if (existing.includes('relizy commitlint')) {
      return { path, status: 'unchanged' }
    }
    if (!force) {
      throw new Error(`A commit-msg hook already exists (${relative(root, path)}). Add "${COMMIT_MSG_HOOK_COMMAND}" to it, or run with --force to replace it`)
    }
    status = 'replaced'
  }

  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  chmodSync(path, 0o755)
  return { path, status }
}

/**
 * True when a `commit-msg` hook runs `relizy commitlint`: husky, the hooks
 * directory of git, lefthook or simple-git-hooks
 */
export function hasRelizyCommitMsgHook(cwd: string): boolean {
  const gitRoot = tryGitSync(['rev-parse', '--show-toplevel'], { cwd })
  const root = gitRoot ?? cwd
  const hooksPath = tryGitSync(['config', 'core.hooksPath'], { cwd })
  const files = [
    join(root, '.husky', 'commit-msg'),
    ...(hooksPath
      ? [
          join(isAbsolute(hooksPath)
            ? hooksPath
            : join(root, hooksPath), 'commit-msg'),
        ]
      : []),
    // Outside a git repository, no hooks directory
    ...(!hooksPath && gitRoot
      ? [
          getGitPath(join('hooks', 'commit-msg'), cwd),
        ]
      : []),
    ...[
      'lefthook.yml',
      'lefthook.yaml',
      '.lefthook.yml',
      '.lefthook.yaml',
      'lefthook.json',
    ].map(name => join(root, name)),
  ]

  if (files.some(file => existsSync(file) && readFileSync(file, 'utf8').includes('relizy commitlint'))) {
    return true
  }

  try {
    const hook = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))?.['simple-git-hooks']?.['commit-msg']
    return typeof hook === 'string' && hook.includes('relizy commitlint')
  }
  catch {
    return false
  }
}
