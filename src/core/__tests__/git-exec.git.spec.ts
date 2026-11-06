import type { GitRepository } from '../../../tests/git-repository'
import { createGitRepository } from '../../../tests/git-repository'
import { formatGitCommand, runGit, runGitSync, runGitSyncBuffer, tryGit, tryGitSync } from '../git-exec'

describe('Given the git execution of relizy', () => {
  let repo: GitRepository

  beforeEach(() => {
    repo = createGitRepository('relizy-git-exec-')
    repo.commit('chore: init', { 'README.md': 'readme\n' })
  })

  afterEach(() => {
    repo.remove()
  })

  describe('When git succeeds', () => {
    it('Then returns the trimmed output', async () => {
      expect(runGitSync(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repo.cwd })).toBe('main')
      await expect(runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repo.cwd })).resolves.toBe('main')
    })

    it('Then keeps the output as is without trim', () => {
      repo.write('README.md', 'changed\n')

      expect(runGitSync(['status', '--porcelain'], { cwd: repo.cwd, trim: false })).toBe(' M README.md\n')
    })

    it('Then passes an argument without a shell: quotes, `$(...)` and backticks are kept', async () => {
      const message = 'feat: it\'s "$(touch pwned)" `id` $HOME'
      repo.commit(message)

      expect(runGitSync(['log', '-1', '--format=%s'], { cwd: repo.cwd })).toBe(message)

      await runGit(['tag', '-a', 'v$(id)', '-m', message], { cwd: repo.cwd })
      expect(runGitSync(['tag', '--list'], { cwd: repo.cwd })).toBe('v$(id)')
    })

    it('Then writes the input to the stdin of git', () => {
      const output = runGitSyncBuffer(['cat-file', '--batch'], { cwd: repo.cwd, input: 'HEAD:README.md\n' }).toString('utf8')

      expect(output).toMatch(/^\S+ blob 7\nreadme\n/)
    })
  })

  describe('When git fails', () => {
    it('Then throws with the stderr of git in the message', async () => {
      expect(() => runGitSync(['show', 'unknown-ref'], { cwd: repo.cwd })).toThrow(/unknown-ref/)
      await expect(runGit(['show', 'unknown-ref'], { cwd: repo.cwd })).rejects.toMatchObject({ stderr: expect.stringContaining('unknown-ref') })
    })

    it('Then gives undefined with the try variants', async () => {
      expect(tryGitSync(['config', 'unknown.key'], { cwd: repo.cwd })).toBeUndefined()
      await expect(tryGit(['config', 'unknown.key'], { cwd: repo.cwd })).resolves.toBeUndefined()
    })
  })

  describe('When a command is shown in the logs', () => {
    it('Then quotes the arguments with spaces or quotes', () => {
      expect(formatGitCommand(['commit', '-m', 'chore: release v1.0.0'])).toBe('git commit -m "chore: release v1.0.0"')
      expect(formatGitCommand(['push', '--follow-tags'])).toBe('git push --follow-tags')
    })
  })
})
