import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { getGitPath, runGitSync, tryGitSync } from '@relizy/core'

/**
 * The `commit-msg` hook running `relizy commitlint`: where it is written, what
 * it replaces, and whether the project already has it.
 */

export interface InstalledHook {
  path: string
  /** `kept`: another hook exists, left as is without `force`; `added`: `relizy commitlint` added at the end of another hook (`add`) */
  status: 'created' | 'replaced' | 'unchanged' | 'kept' | 'added'
  /** The hook relizy wrote in `.git/hooks` before husky or `core.hooksPath`, removed */
  removed?: string
}

export const COMMIT_MSG_HOOK_COMMAND = 'npx --no -- relizy commitlint --edit "$1"'

/** Command of the `prepare` script writing the hook at each install, when it lives in the hooks directory of git */
export const HOOK_INSTALL_COMMAND = 'relizy commitlint --install'

/**
 * The hook written in the hooks directory of git: it lets the commits through
 * while relizy is not installed, instead of blocking them
 */
const GIT_HOOK_CONTENT = [
  '#!/bin/sh',
  '[ -e node_modules/.bin/relizy ] || { echo "relizy is not installed: commit message not checked" >&2; exit 0; }',
  COMMIT_MSG_HOOK_COMMAND,
  '',
].join('\n')

/** The hooks relizy writes in `.git/hooks`, the current one and the one of the older versions */
const GIT_HOOK_CONTENTS = [GIT_HOOK_CONTENT, `#!/bin/sh\n${COMMIT_MSG_HOOK_COMMAND}\n`]

/**
 * Remove the hook relizy wrote in `.git/hooks` once the hook lives elsewhere
 * (husky, `core.hooksPath`): git no longer runs it, and it would run again
 * without them. An edited hook is left as is.
 */
function removeStaleGitHook(cwd: string, path: string): string | undefined {
  // Not `--git-path hooks`: it follows core.hooksPath, set by husky
  const stale = resolve(cwd, runGitSync(['rev-parse', '--git-common-dir'], { cwd }), 'hooks', 'commit-msg')
  if (stale === path || !existsSync(stale) || !GIT_HOOK_CONTENTS.includes(readFileSync(stale, 'utf8'))) {
    return undefined
  }
  rmSync(stale)
  return stale
}

/**
 * The `commit-msg` hook written by relizy: in `.husky/` when husky is set up,
 * otherwise in the hooks directory of git
 */
function getCommitMsgHookPath(cwd: string): { root: string, path: string, husky: boolean, local: boolean } {
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
        local: false,
      }
    : {
        root,
        path: join(hooksDirectory, 'commit-msg'),
        husky: false,
        local: !hooksPath,
      }
}

/**
 * True when the hook would be written in `.git/hooks`: not versioned, so only
 * on this clone. `false` with husky, `core.hooksPath` or outside a git repository
 */
export function isLocalCommitMsgHook(cwd: string): boolean {
  try {
    return getCommitMsgHookPath(cwd).local
  }
  catch {
    return false
  }
}

/**
 * True when the hook of `.git/hooks` (see `isLocalCommitMsgHook`) runs `relizy commitlint`
 */
export function hasLocalRelizyCommitMsgHook(cwd: string): boolean {
  try {
    const { path, local } = getCommitMsgHookPath(cwd)
    return local && existsSync(path) && readFileSync(path, 'utf8').includes('relizy commitlint')
  }
  catch {
    return false
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

/** Another linter of the commit messages: relizy commitlint is not added next to it */
const OTHER_COMMIT_LINTERS = /\b(?:commitlint|commitizen|git-cz|cz|validate-commit-msg|commit-msg-linter|gitlint|conventional-pre-commit|cocogitto|cog|gitmoji)\b/

/**
 * True when `relizy commitlint` can be added at the end of this hook: a plain
 * shell script (husky hooks have no shebang), that neither runs another linter
 * of the commit messages nor ends before its last line (`exec`, `exit`)
 */
export function canAddToCommitMsgHook(content: string): boolean {
  const [first = ''] = content.split('\n')
  if (first.startsWith('#!') && !/^#!\s*(?:\/usr\/bin\/env\s+|\/(?:usr\/)?bin\/)(?:sh|bash|zsh|dash)\b/.test(first)) {
    return false
  }

  const commands = content.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'))
  if (commands.some(line => /(?:^|[;&|({]\s*|\b(?:then|do|else)\s+)(?:exec|exit)\b/.test(line))) {
    return false
  }

  return !OTHER_COMMIT_LINTERS.test(commands.join('\n'))
}

/**
 * The other `commit-msg` hook (see `findOtherCommitMsgHook`) when `relizy
 * commitlint` can be added to it (see `canAddToCommitMsgHook`), relative to the
 * root of the repository
 */
export function findExtensibleCommitMsgHook(cwd: string): string | undefined {
  const other = findOtherCommitMsgHook(cwd)
  if (!other) {
    return undefined
  }

  try {
    const { path } = getCommitMsgHookPath(cwd)
    return canAddToCommitMsgHook(readFileSync(path, 'utf8'))
      ? other
      : undefined
  }
  catch {
    return undefined
  }
}

/**
 * Write the `commit-msg` hook running `relizy commitlint`: in `.husky/` when
 * husky is set up, otherwise in the hooks directory of git. Another hook is
 * only replaced with `force`, completed with `add` when it can be (`added`, see
 * `canAddToCommitMsgHook`), else kept (`kept`).
 */
export function installCommitMsgHook({ cwd, force = false, add = false }: { cwd: string, force?: boolean, add?: boolean }): InstalledHook {
  const { path, husky } = getCommitMsgHookPath(cwd)
  const content = husky
    ? `${COMMIT_MSG_HOOK_COMMAND}\n`
    : GIT_HOOK_CONTENT

  let status: InstalledHook['status'] = 'created'
  if (existsSync(path)) {
    const existing = readFileSync(path, 'utf8')
    if (existing.includes('relizy commitlint')) {
      const removed = removeStaleGitHook(cwd, path)
      return {
        path,
        status: 'unchanged',
        ...(removed && { removed }),
      }
    }
    if (add && !force && canAddToCommitMsgHook(existing)) {
      // A hook of git, not versioned: the commits pass while relizy is not installed, as the hook relizy writes there
      const line = husky
        ? COMMIT_MSG_HOOK_COMMAND
        : `if [ -e node_modules/.bin/relizy ]; then ${COMMIT_MSG_HOOK_COMMAND}; fi`
      writeFileSync(path, `${existing}${existing.endsWith('\n') || !existing
        ? ''
        : '\n'}${line}\n`)
      const removed = removeStaleGitHook(cwd, path)
      return {
        path,
        status: 'added',
        ...(removed && { removed }),
      }
    }
    if (!force) {
      return { path, status: 'kept' }
    }
    status = 'replaced'
  }

  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  chmodSync(path, 0o755)
  const removed = removeStaleGitHook(cwd, path)
  return {
    path,
    status,
    ...(removed && { removed }),
  }
}

/**
 * True when a `commit-msg` hook runs `relizy commitlint`: husky, the hooks
 * directory of git, lefthook or simple-git-hooks. Once husky is set up, only
 * its hook counts: the one of `.git/hooks` is no longer run
 */
export function hasRelizyCommitMsgHook(cwd: string): boolean {
  const gitRoot = tryGitSync(['rev-parse', '--show-toplevel'], { cwd })
  const root = gitRoot ?? cwd
  const hooksPath = tryGitSync(['config', 'core.hooksPath'], { cwd })
  const husky = existsSync(join(root, '.husky'))
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
    ...(!hooksPath && !husky && gitRoot
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
