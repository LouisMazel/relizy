import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import {
  getCommentChar,
  getCommitsInRange,
  getStagedFiles,
  installCommitMsgHook,
  readCommitMessageFile,
  resolveDefaultRangeStart,
} from '../commitlint/git'

// The setup file mocks execPromise: these tests run the real git commands against a temporary repository
vi.mock('@maz-ui/node', importActual => importActual())

describe('Given the commitlint git helpers on a real repository', () => {
  let cwd: string
  let clock = 0

  function git(...args: string[]) {
    clock++
    const date = `${1_700_000_000 + clock} +0000`
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    }).trim()
  }

  function commitFiles(message: string, files: Record<string, string>) {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(join(cwd, path, '..'), { recursive: true })
      writeFileSync(join(cwd, path), content)
    }
    git('add', '--all')
    git('commit', '--no-verify', '-m', message)
    return git('rev-parse', 'HEAD')
  }

  beforeEach(() => {
    // Real path: git resolves the symbolic links of the temporary directory (e.g. /var on macOS)
    cwd = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-commitlint-git-')))
    git('init', '--initial-branch=main')
    git('config', 'user.name', 'Test')
    git('config', 'user.email', 'test@example.com')
    git('config', 'commit.gpgsign', 'false')
    git('config', 'tag.gpgsign', 'false')
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  describe('When reading the commit being created', () => {
    it('Then lists the staged files only', () => {
      commitFiles('chore: init the repository', { 'README.md': 'readme' })
      writeFileSync(join(cwd, 'staged.ts'), 'a')
      writeFileSync(join(cwd, 'unstaged.ts'), 'b')
      git('add', 'staged.ts')

      expect(getStagedFiles(cwd)).toEqual(['staged.ts'])
    })

    it('Then returns no file outside a repository', () => {
      const outside = mkdtempSync(join(tmpdir(), 'relizy-commitlint-outside-'))

      expect(getStagedFiles(outside)).toEqual([])
      rmSync(outside, { recursive: true, force: true })
    })

    it('Then reads .git/COMMIT_EDITMSG by default, or the given file', () => {
      writeFileSync(join(cwd, '.git/COMMIT_EDITMSG'), 'feat: from the git directory')
      writeFileSync(join(cwd, 'message.txt'), 'feat: from a file')

      expect(readCommitMessageFile(undefined, cwd)).toBe('feat: from the git directory')
      expect(readCommitMessageFile('message.txt', cwd)).toBe('feat: from a file')
      expect(readCommitMessageFile(join(cwd, 'message.txt'), cwd)).toBe('feat: from a file')
    })

    it.each([
      [undefined, '#'],
      [';', ';'],
      ['auto', '#'],
    ])('Then reads the comment character %s as %s', (commentChar, expected) => {
      if (commentChar) {
        git('config', 'core.commentChar', commentChar)
      }

      expect(getCommentChar(cwd)).toBe(expected)
    })
  })

  describe('When listing the commits of a range', () => {
    it('Then returns their full message and files, oldest first', () => {
      const first = commitFiles('chore: init the repository', { 'README.md': 'readme' })
      commitFiles('feat(core): add the parser\n\nWith a body | containing ---- separators.\n\nCloses #12', { 'packages/core/index.ts': 'a', 'packages/core/util.ts': 'b' })
      commitFiles('fix: correct the parser', { 'packages/core/index.ts': 'c' })

      expect(getCommitsInRange({ from: first, cwd })).toEqual([
        { hash: expect.stringMatching(/^[0-9a-f]{40}$/), message: 'feat(core): add the parser\n\nWith a body | containing ---- separators.\n\nCloses #12', files: ['packages/core/index.ts', 'packages/core/util.ts'] },
        { hash: expect.stringMatching(/^[0-9a-f]{40}$/), message: 'fix: correct the parser', files: ['packages/core/index.ts'] },
      ])
    })

    it('Then returns the whole history without start, and stops at the given end', () => {
      commitFiles('chore: init the repository', { 'README.md': 'readme' })
      const second = commitFiles('feat: add the parser', { 'index.ts': 'a' })
      commitFiles('fix: correct the parser', { 'index.ts': 'b' })

      expect(getCommitsInRange({ cwd }).map(commit => commit.message)).toEqual(['chore: init the repository', 'feat: add the parser', 'fix: correct the parser'])
      expect(getCommitsInRange({ to: second, cwd }).map(commit => commit.message)).toEqual(['chore: init the repository', 'feat: add the parser'])
    })
  })

  describe('When resolving the default start of the range', () => {
    beforeEach(() => {
      vi.stubEnv('GITHUB_BASE_REF', '')
      vi.stubEnv('CI_MERGE_REQUEST_DIFF_BASE_SHA', '')
    })

    it('Then uses the merge-base with the target branch of a GitHub pull request', async () => {
      const base = commitFiles('chore: init the repository', { 'README.md': 'readme' })
      git('update-ref', 'refs/remotes/origin/main', base)
      git('checkout', '-b', 'feature')
      commitFiles('feat: add the parser', { 'index.ts': 'a' })
      vi.stubEnv('GITHUB_BASE_REF', 'main')

      expect(await resolveDefaultRangeStart({ cwd })).toEqual({ from: base, reason: 'merge-base with origin/main' })
    })

    it('Then explains how to fetch the target branch when it is missing', async () => {
      commitFiles('chore: init the repository', { 'README.md': 'readme' })
      vi.stubEnv('GITHUB_BASE_REF', 'main')

      await expect(resolveDefaultRangeStart({ cwd })).rejects.toThrow('Cannot find the merge-base of HEAD and origin/main: fetch the history of the base branch (e.g. "fetch-depth: 0" on actions/checkout), or pass --from')
    })

    it('Then uses the base of a GitLab merge request', async () => {
      vi.stubEnv('CI_MERGE_REQUEST_DIFF_BASE_SHA', 'abc123')

      expect(await resolveDefaultRangeStart({ cwd })).toEqual({ from: 'abc123', reason: 'base of the merge request' })
    })

    it('Then uses the last tag outside a pull request', async () => {
      commitFiles('chore: init the repository', { 'README.md': 'readme' })
      git('tag', 'v1.0.0')
      commitFiles('feat: add the parser', { 'index.ts': 'a' })
      git('tag', 'v1.1.0')

      expect(await resolveDefaultRangeStart({ cwd })).toEqual({ from: 'v1.1.0', reason: 'last tag v1.1.0' })
    })

    it('Then lints the whole history without tag', async () => {
      commitFiles('chore: init the repository', { 'README.md': 'readme' })

      expect(await resolveDefaultRangeStart({ cwd })).toEqual({ reason: 'whole history, no tag found' })
    })
  })

  describe('When installing the commit-msg hook', () => {
    it('Then writes an executable hook in the git hooks directory', () => {
      const hook = installCommitMsgHook({ cwd })

      expect(hook).toEqual({ path: join(cwd, '.git/hooks/commit-msg'), status: 'created' })
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
