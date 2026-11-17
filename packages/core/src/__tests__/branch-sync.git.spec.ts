import type { GitRepository } from '../../../../tests/git-repository'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGitRepository } from '../../../../tests/git-repository'
import { remoteBranchExists, syncGitBranch } from '../branch-sync'

describe('Given syncGitBranch', () => {
  let repository: GitRepository
  let remote: string
  const remoteGit = (...args: string[]) => execFileSync('git', ['--git-dir', remote, ...args], { encoding: 'utf8' }).trim()

  beforeEach(() => {
    repository = createGitRepository('relizy-branch-sync-')
    remote = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-branch-sync-remote-')))
    execFileSync('git', ['init', '--quiet', '--bare', remote])
    repository.git('remote', 'add', 'origin', remote)
    repository.commit('chore: init', { 'README.md': 'init\n' })
    repository.git('push', '--quiet', 'origin', 'main', 'main:develop')
  })

  afterEach(() => {
    repository.remove()
    rmSync(remote, { recursive: true, force: true })
  })

  /** A commit on develop of the remote, made on another branch of the repository */
  function commitOnDevelop(files: Record<string, string>) {
    repository.git('switch', '--quiet', '-c', 'feature', 'origin/develop')
    repository.commit('feat: develop work', files)
    repository.git('push', '--quiet', 'origin', 'feature:develop')
    repository.git('switch', '--quiet', 'main')
  }

  describe('When develop already has the release', () => {
    it('Then pushes nothing', async () => {
      const develop = remoteGit('rev-parse', 'develop')

      expect(await syncGitBranch({ cwd: repository.cwd, target: 'develop', sourceName: 'main' })).toEqual({ target: 'develop', status: 'up-to-date' })
      expect(remoteGit('rev-parse', 'develop')).toBe(develop)
    })
  })

  describe('When develop has nothing of its own', () => {
    it('Then fast-forwards it to the release commit', async () => {
      repository.commit('chore(release): v1.0.0', { 'package.json': '{"version":"1.0.0"}\n' })
      const head = repository.git('rev-parse', 'HEAD')

      expect(await syncGitBranch({ cwd: repository.cwd, target: 'develop', sourceName: 'main' })).toEqual({ target: 'develop', status: 'fast-forward', commit: head })
      expect(remoteGit('rev-parse', 'develop')).toBe(head)
    })
  })

  describe('When develop has its own commits', () => {
    it('Then pushes a merge commit with the message, without touching the working directory', async () => {
      commitOnDevelop({ 'feature.txt': 'feature\n' })
      repository.commit('chore(release): v1.0.0', { 'package.json': '{"version":"1.0.0"}\n' })
      const head = repository.git('rev-parse', 'HEAD')

      const result = await syncGitBranch({
        cwd: repository.cwd,
        target: 'develop',
        sourceName: 'main',
        message: 'chore(release): sync develop with main',
      })

      expect(result.status).toBe('merged')
      expect(remoteGit('rev-parse', 'develop')).toBe(result.commit)
      expect(remoteGit('log', '-1', '--format=%s', 'develop')).toBe('chore(release): sync develop with main')
      expect(remoteGit('log', '-1', '--format=%P', 'develop').split(' ')).toContain(head)
      expect(remoteGit('show', 'develop:feature.txt')).toBe('feature')
      expect(repository.git('rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
      expect(repository.git('rev-parse', 'HEAD')).toBe(head)
      expect(existsSync(join(repository.cwd, 'feature.txt'))).toBe(false)
    })

    it('Then merges with the default message of git without one', async () => {
      commitOnDevelop({ 'feature.txt': 'feature\n' })
      repository.commit('chore(release): v1.0.0', { 'package.json': '{"version":"1.0.0"}\n' })

      await syncGitBranch({ cwd: repository.cwd, target: 'develop', sourceName: 'main' })

      expect(remoteGit('log', '-1', '--format=%s', 'develop')).toBe('Merge branch \'main\' into develop')
    })
  })

  describe('When the merge is in conflict', () => {
    it('Then pushes nothing and gives the files and the commands of the manual merge', async () => {
      commitOnDevelop({ 'README.md': 'develop\n' })
      repository.commit('chore(release): v1.0.0', { 'README.md': 'main\n' })
      const develop = remoteGit('rev-parse', 'develop')

      expect(await syncGitBranch({ cwd: repository.cwd, target: 'develop', sourceName: 'main' })).toEqual({
        target: 'develop',
        status: 'conflict',
        conflicts: ['README.md'],
        manualCommands: [
          'git fetch origin',
          'git switch develop',
          'git merge origin/main',
          'git push origin develop',
        ],
      })
      expect(remoteGit('rev-parse', 'develop')).toBe(develop)
    })
  })

  describe('When it is a dry run', () => {
    it('Then computes the merge without pushing', async () => {
      commitOnDevelop({ 'feature.txt': 'feature\n' })
      repository.commit('chore(release): v1.0.0', { 'package.json': '{"version":"1.0.0"}\n' })
      const develop = remoteGit('rev-parse', 'develop')
      const info = vi.fn()

      expect(await syncGitBranch({
        cwd: repository.cwd,
        target: 'develop',
        sourceName: 'main',
        dryRun: true,
        logger: { info },
      })).toEqual({ target: 'develop', status: 'merged' })
      expect(remoteGit('rev-parse', 'develop')).toBe(develop)
      expect(info).toHaveBeenCalledWith(expect.stringContaining('[dry-run] merge main into develop, then git push origin'))
    })
  })

  describe('When develop receives a commit while it is merged', () => {
    it('Then merges again and pushes', async () => {
      commitOnDevelop({ 'feature.txt': 'feature\n' })
      // A later commit of develop, pushed by the pre-push hook of the first attempt
      repository.git('switch', '--quiet', 'feature')
      repository.commit('feat: concurrent work', { 'concurrent.txt': 'concurrent\n' })
      repository.git('push', '--quiet', 'origin', 'feature:concurrent')
      const concurrent = repository.git('rev-parse', 'HEAD')
      repository.git('switch', '--quiet', 'main')
      repository.commit('chore(release): v1.0.0', { 'package.json': '{"version":"1.0.0"}\n' })
      const marker = join(repository.cwd, '.git', 'pushed-once')
      const hook = join(repository.cwd, '.git', 'hooks', 'pre-push')
      writeFileSync(hook, `#!/bin/sh\nif [ ! -f "${marker}" ]; then touch "${marker}"; git --git-dir "${remote}" update-ref refs/heads/develop ${concurrent}; fi\n`)
      chmodSync(hook, 0o755)

      const result = await syncGitBranch({ cwd: repository.cwd, target: 'develop', sourceName: 'main' })

      expect(result.status).toBe('merged')
      expect(remoteGit('rev-parse', 'develop')).toBe(result.commit)
      expect(remoteGit('show', 'develop:concurrent.txt')).toBe('concurrent')
    })
  })

  describe('When the branch does not exist on the remote', () => {
    it('Then throws what to do', async () => {
      await expect(syncGitBranch({ cwd: repository.cwd, target: 'next' })).rejects.toThrow('The branch "next" does not exist on "origin"')
    })
  })

  describe('Given remoteBranchExists', () => {
    it('Then tells whether the remote has the branch', async () => {
      expect(await remoteBranchExists({ cwd: repository.cwd, branch: 'develop' })).toBe(true)
      expect(await remoteBranchExists({ cwd: repository.cwd, branch: 'next' })).toBe(false)
    })
  })
})
