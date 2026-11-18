import type { GitRepository } from '../../../../tests/git-repository'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGitRepository } from '../../../../tests/git-repository'
import { getGitPushTarget } from '../git-refs'
import { getPosixRelativePath } from '../paths'

describe('Given getGitPushTarget', () => {
  let repository: GitRepository
  let remote: string

  beforeEach(() => {
    repository = createGitRepository('relizy-push-target-')
    repository.commit('chore: init')
    remote = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-push-remote-')))
    execFileSync('git', ['init', '--quiet', '--bare', remote])
  })

  afterEach(() => {
    repository.remove()
    rmSync(remote, { recursive: true, force: true })
  })

  describe('When the branch has no upstream', () => {
    it('Then pushes the current branch to origin', async () => {
      expect(await getGitPushTarget(repository.cwd)).toEqual({ remote: 'origin', branch: 'main' })
    })
  })

  describe('When the branch tracks a branch of another name on another remote', () => {
    it('Then pushes to its upstream', async () => {
      repository.git('remote', 'add', 'upstream', remote)
      repository.git('push', '--quiet', 'upstream', 'main:release')
      repository.git('branch', '--set-upstream-to=upstream/release')

      expect(await getGitPushTarget(repository.cwd)).toEqual({ remote: 'upstream', branch: 'release' })
    })
  })
})

describe('Given getPosixRelativePath', () => {
  it('Then gives the path with / separators, empty for the same directory', () => {
    expect(getPosixRelativePath('/repo', '/repo/packages/core')).toBe('packages/core')
    expect(getPosixRelativePath('/repo', '/repo')).toBe('')
  })
})
