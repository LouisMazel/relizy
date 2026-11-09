import type { GitRepository } from '../../../../../tests/git-repository'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createGitRepository } from '../../../../../tests/git-repository'
import { installCommitMsgHook } from '../commitlint'

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

  describe('When installing the commit-msg hook', () => {
    it('Then writes an executable hook in the git hooks directory', () => {
      const hook = installCommitMsgHook({ cwd })

      expect(hook).toEqual({
        path: join(cwd, '.git/hooks/commit-msg'),
        status: 'created',
      })
      expect(readFileSync(hook.path, 'utf8')).toBe('#!/bin/sh\nnpx --no -- relizy commitlint --edit "$1"\n')
      expect(statSync(hook.path).mode & 0o111).toBeTruthy()
    })

    it('Then writes the hook in .husky when husky is set up', () => {
      mkdirSync(join(cwd, '.husky'))

      const hook = installCommitMsgHook({ cwd })

      expect(hook.path).toBe(join(cwd, '.husky/commit-msg'))
      expect(readFileSync(hook.path, 'utf8')).toBe('npx --no -- relizy commitlint --edit "$1"\n')
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

    it('Then refuses to replace another hook without force', () => {
      mkdirSync(join(cwd, '.husky'))
      writeFileSync(join(cwd, '.husky/commit-msg'), 'npx --no-install commitlint --edit "$1"\n')

      expect(() => installCommitMsgHook({ cwd })).toThrow('A commit-msg hook already exists (.husky/commit-msg). Add "npx --no -- relizy commitlint --edit "$1"" to it, or run with --force to replace it')
      expect(installCommitMsgHook({ cwd, force: true }).status).toBe('replaced')
      expect(readFileSync(join(cwd, '.husky/commit-msg'), 'utf8')).toBe('npx --no -- relizy commitlint --edit "$1"\n')
    })
  })
})
