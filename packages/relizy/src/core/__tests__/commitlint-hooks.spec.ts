import type { GitRepository } from '../../../../../tests/git-repository'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createGitRepository } from '../../../../../tests/git-repository'
import { hasLocalRelizyCommitMsgHook, hasRelizyCommitMsgHook, installCommitMsgHook, isLocalCommitMsgHook } from '../commitlint'

describe('Given the commit-msg hook on a real repository', () => {
  let repository: GitRepository
  let cwd: string

  function git(...args: string[]) {
    return repository.git(...args)
  }

  beforeEach(() => {
    repository = createGitRepository('relizy-commitlint-hooks-')
    cwd = repository.cwd
  })

  afterEach(() => {
    repository.remove()
  })

  describe('When the commit-msg hook is written in .git/hooks', () => {
    it('Then lets the commits through while relizy is not installed', () => {
      installCommitMsgHook({ cwd })
      writeFileSync(join(cwd, 'message'), 'not a conventional commit')

      const output = execFileSync(join(cwd, '.git/hooks/commit-msg'), ['message'], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      expect(output).toBe('')
    })

    it('Then is local, unlike with husky or core.hooksPath', () => {
      expect(isLocalCommitMsgHook(cwd)).toBe(true)
      expect(hasLocalRelizyCommitMsgHook(cwd)).toBe(false)
      installCommitMsgHook({ cwd })
      expect(hasLocalRelizyCommitMsgHook(cwd)).toBe(true)

      git('config', 'core.hooksPath', 'tools/hooks')
      expect(isLocalCommitMsgHook(cwd)).toBe(false)

      git('config', '--unset', 'core.hooksPath')
      mkdirSync(join(cwd, '.husky'))
      expect(isLocalCommitMsgHook(cwd)).toBe(false)
    })
  })

  describe('When installing the commit-msg hook', () => {
    it('Then writes an executable hook in the git hooks directory', () => {
      const hook = installCommitMsgHook({ cwd })

      expect(hook).toEqual({
        path: join(cwd, '.git/hooks/commit-msg'),
        status: 'created',
      })
      expect(readFileSync(hook.path, 'utf8')).toBe([
        '#!/bin/sh',
        '[ -e node_modules/.bin/relizy ] || { echo "relizy is not installed: commit message not checked" >&2; exit 0; }',
        'npx --no -- relizy commitlint --edit "$1"',
        '',
      ].join('\n'))
      expect(statSync(hook.path).mode & 0o111).toBeTruthy()
    })

    it('Then writes the hook in .husky when husky is set up', () => {
      mkdirSync(join(cwd, '.husky'))

      const hook = installCommitMsgHook({ cwd })

      expect(hook.path).toBe(join(cwd, '.husky/commit-msg'))
      expect(readFileSync(hook.path, 'utf8')).toBe('npx --no -- relizy commitlint --edit "$1"\n')
    })

    it('Then removes the hook relizy wrote in .git/hooks once husky is set up, but not an edited one', () => {
      writeFileSync(join(cwd, '.git/hooks/commit-msg'), '#!/bin/sh\nnpx --no -- relizy commitlint --edit "$1"\n')
      // As husky 9 sets it up
      mkdirSync(join(cwd, '.husky/_'), { recursive: true })
      git('config', 'core.hooksPath', '.husky/_')

      expect(hasRelizyCommitMsgHook(cwd)).toBe(false)
      expect(installCommitMsgHook({ cwd })).toEqual({
        path: join(cwd, '.husky/commit-msg'),
        status: 'created',
        removed: join(cwd, '.git/hooks/commit-msg'),
      })
      expect(existsSync(join(cwd, '.git/hooks/commit-msg'))).toBe(false)

      writeFileSync(join(cwd, '.git/hooks/commit-msg'), '#!/bin/sh\nnpx --no -- relizy commitlint --edit "$1"\necho done\n')
      expect(installCommitMsgHook({ cwd })).toEqual({
        path: join(cwd, '.husky/commit-msg'),
        status: 'unchanged',
      })
      expect(existsSync(join(cwd, '.git/hooks/commit-msg'))).toBe(true)
    })

    it('Then follows core.hooksPath', () => {
      git('config', 'core.hooksPath', 'tools/hooks')

      expect(installCommitMsgHook({ cwd }).path).toBe(join(cwd, 'tools/hooks/commit-msg'))
      expect(existsSync(join(cwd, 'tools/hooks/commit-msg'))).toBe(true)
    })

    it('Then keeps a hook already running relizy commitlint', () => {
      mkdirSync(join(cwd, '.husky'))
      writeFileSync(join(cwd, '.husky/commit-msg'), 'pnpm relizy commitlint --edit "$1"\n')

      expect(installCommitMsgHook({ cwd }).status).toBe('unchanged')
      expect(readFileSync(join(cwd, '.husky/commit-msg'), 'utf8')).toBe('pnpm relizy commitlint --edit "$1"\n')
    })

    it('Then keeps another hook without force', () => {
      mkdirSync(join(cwd, '.husky'))
      writeFileSync(join(cwd, '.husky/commit-msg'), 'npx --no-install commitlint --edit "$1"\n')

      expect(installCommitMsgHook({ cwd })).toEqual({
        path: join(cwd, '.husky/commit-msg'),
        status: 'kept',
      })
      expect(readFileSync(join(cwd, '.husky/commit-msg'), 'utf8')).toBe('npx --no-install commitlint --edit "$1"\n')
      expect(installCommitMsgHook({ cwd, force: true }).status).toBe('replaced')
      expect(readFileSync(join(cwd, '.husky/commit-msg'), 'utf8')).toBe('npx --no -- relizy commitlint --edit "$1"\n')
    })
  })
})
