import type { GitRepository } from '../../../../../tests/git-repository'
import type { LoggedCommit } from '../dataset'
import { runGitSync } from '@relizy/core'
import { createGitRepository } from '../../../../../tests/git-repository'
import { cleanDescription, computeDiffStats, extractExample, findSuspicion, getGitLogArgs, parseCommitLog } from '../dataset'

function logged(subject: string, body = '', files: LoggedCommit['files'] = []): LoggedCommit {
  return {
    hash: 'a'.repeat(40),
    authorName: 'Relizy',
    authorEmail: 'relizy@example.com',
    subject,
    body,
    files,
  }
}

describe('Given parseCommitLog', () => {
  let repository: GitRepository

  beforeEach(() => {
    repository = createGitRepository()
  })

  afterEach(() => {
    repository.remove()
  })

  describe('When the history has a rename, a binary file and a merge', () => {
    it('Then it reads every commit but the merge, with its files and counts', () => {
      repository.commit('feat: init', { 'src/a.ts': 'a\nb\n', 'README.md': 'readme\n' })
      repository.git('checkout', '--quiet', '-b', 'topic')
      repository.git('mv', 'src/a.ts', 'src/b.ts')
      repository.write('logo.png', '\u0000\u0001\u0002')
      repository.commit('refactor(core): move a to b (#3)', { 'README.md': 'readme\nmore\n' })
      repository.git('checkout', '--quiet', 'main')
      repository.git('merge', '--quiet', '--no-ff', '-m', 'Merge branch topic', 'topic')

      const commits = parseCommitLog(runGitSync(getGitLogArgs(), { cwd: repository.cwd, trim: false }))

      expect(commits.map(commit => commit.subject)).toEqual(['refactor(core): move a to b (#3)', 'feat: init'])
      expect(commits[0]!.hash).toMatch(/^[0-9a-f]{40}$/)
      expect(commits[0]!.files).toEqual(expect.arrayContaining([
        { path: 'README.md', insertions: 1, deletions: 0 },
        { path: 'logo.png', insertions: null, deletions: null },
        { path: 'src/b.ts', insertions: 0, deletions: 0 },
      ]))
      expect(commits[0]!.files).toHaveLength(3)
      expect(commits[1]!.files).toHaveLength(2)
    })
  })

  describe('When a commit has a body', () => {
    it('Then the body is kept apart from the subject', () => {
      repository.commit('fix: a bug\n\nThe details.\n\nCo-authored-by: Someone <someone@example.com>', { 'a.ts': 'a\n' })

      const [commit] = parseCommitLog(runGitSync(getGitLogArgs(), { cwd: repository.cwd, trim: false }))

      expect(commit!.subject).toBe('fix: a bug')
      expect(commit!.body).toBe('The details.\n\nCo-authored-by: Someone <someone@example.com>')
    })
  })
})

describe('Given computeDiffStats', () => {
  describe('When the files have line counts and binaries', () => {
    it('Then it sums the lines and counts the binaries apart', () => {
      expect(computeDiffStats([
        { path: 'a', insertions: 3, deletions: 1 },
        { path: 'b', insertions: 2, deletions: 5 },
        { path: 'c.png', insertions: null, deletions: null },
      ])).toEqual({
        filesChanged: 3,
        insertions: 5,
        deletions: 6,
        binaryFiles: 1,
      })
    })
  })
})

describe('Given cleanDescription', () => {
  describe('When the description holds references', () => {
    it.each([
      ['add a button #12', 'add a button'],
      ['add a button (#12, #13)', 'add a button'],
      ['add a button, closes #12', 'add a button'],
      ['fix the input (fixes GH-4)', 'fix the input'],
      ['merge the docs !34', 'merge the docs'],
      ['see https://github.com/acme/app/pull/12 for details', 'see for details'],
      ['handle `#hash` links', 'handle `#hash` links'],
      ['support !important and v2.1', 'support !important and v2.1'],
    ])('Then "%s" becomes "%s"', (description, expected) => {
      expect(cleanDescription(description)).toBe(expected)
    })
  })
})

describe('Given extractExample', () => {
  describe('When the commit is conventional', () => {
    it('Then the message loses its type, scope, emoji and pull request, and the label comes from the type', () => {
      const result = extractExample(logged('✨ feat(ui): add a button (#12)', '', [
        { path: 'src/button.vue', insertions: 10, deletions: 0 },
      ]), 'maz-ui')

      expect(result).toEqual({
        kind: 'example',
        example: {
          repo: 'maz-ui',
          source: 'git',
          hash: 'a'.repeat(40),
          message: 'add a button',
          files: ['src/button.vue'],
          stats: {
            filesChanged: 1,
            insertions: 10,
            deletions: 0,
            binaryFiles: 0,
          },
          label: 'feature',
          type: 'feat',
          breaking: false,
        },
      })
    })

    it.each([
      ['fix: a bug', 'fix'],
      ['refactor: split a module', 'refacto'],
      ['docs: a page', 'doc'],
      ['perf: faster', 'perf'],
      ['test: a case', 'test'],
      ['build: target node 22', 'build'],
      ['ci: cache pnpm', 'ci'],
      ['chore(deps): bump vite from 7.0.0 to 7.1.0', 'chore'],
      ['style: format', 'chore'],
      ['Fix: an uppercase type', 'fix'],
    ])('Then "%s" is labelled %s', (subject, label) => {
      const result = extractExample(logged(subject), 'repo')

      expect(result.kind === 'example' && result.example.label).toBe(label)
    })
  })

  describe('When the commit is breaking', () => {
    it.each([
      ['feat!: drop node 18', '', 'feature'],
      ['fix(core): rename an option', 'BREAKING CHANGE: the option is renamed', 'fix'],
    ])('Then "%s" keeps the label %s of its type and is flagged breaking', (subject, body, label) => {
      const result = extractExample(logged(subject, body), 'repo')

      expect(result).toMatchObject({
        kind: 'example',
        example: { label, breaking: true },
      })
    })
  })

  describe('When the commit gives no example', () => {
    it.each([
      ['Update README.md', 'not-conventional'],
      ['chore(release): bump version to 2.4.0', 'release'],
      ['chore: release v1.2.0', 'release'],
      ['release: 3.0.0', 'release'],
      ['revert: feat: add a button', 'unknown-type'],
      ['fix: (#12)', 'empty-message'],
    ])('Then "%s" is skipped as %s', (subject, reason) => {
      expect(extractExample(logged(subject), 'repo')).toMatchObject({ kind: 'skipped', reason })
    })

    it.each([
      ['renovate[bot]', 'bot@renovateapp.com'],
      ['dependabot[bot]', '49699333+dependabot[bot]@users.noreply.github.com'],
      ['github-actions', 'actions@github.com'],
    ])('Then a commit of %s is skipped as bot', (authorName, authorEmail) => {
      const commit = {
        ...logged('chore(deps): update vite to v7'),
        authorName,
        authorEmail,
      }

      expect(extractExample(commit, 'repo')).toEqual({ kind: 'skipped', reason: 'bot' })
    })

    it('Then a commit about releasing that is not a release commit is kept', () => {
      expect(extractExample(logged('ci: release with the relizy GitHub Action'), 'repo').kind).toBe('example')
    })

    it('Then a commit above maxFiles is skipped as a mass change', () => {
      const files = Array.from({ length: 3 }, (_, index) => ({ path: `src/${index}.ts`, insertions: 1, deletions: 1 }))

      expect(extractExample(logged('refactor: format', '', files), 'repo', { maxFiles: 2 })).toMatchObject({ kind: 'skipped', reason: 'too-many-files' })
      expect(extractExample(logged('refactor: format', '', files), 'repo', { maxFiles: 3 }).kind).toBe('example')
    })
  })

  describe('When the label contradicts the files', () => {
    it('Then the example is kept with its suspicion', () => {
      const result = extractExample(logged('feat(docs): document MazTable', '', [
        { path: 'apps/docs/src/components/maz-table.md', insertions: 40, deletions: 2 },
      ]), 'repo')

      expect(result).toMatchObject({
        kind: 'example',
        example: { label: 'feature', suspect: 'code-label-on-docs-only' },
      })
    })
  })
})

describe('Given getGitLogArgs', () => {
  describe('When a date is given', () => {
    it('Then git log only reads the commits after it', () => {
      expect(getGitLogArgs({ since: '2022-01-01' })).toContain('--since=2022-01-01')
      expect(getGitLogArgs().some(arg => arg.startsWith('--since'))).toBe(false)
    })
  })
})

describe('Given findSuspicion', () => {
  describe('When the files contradict the label', () => {
    it.each([
      [
        'feature',
        ['README.md', 'docs/guide.md'],
        'code-label-on-docs-only',
      ],
      [
        'fix',
        ['package.json', 'pnpm-lock.yaml'],
        'code-label-on-dependencies-only',
      ],
      [
        'doc',
        ['package.json'],
        'code-label-on-dependencies-only',
      ],
      [
        'test',
        ['src/button.ts'],
        'test-without-test-files',
      ],
      [
        'ci',
        ['src/button.ts'],
        'ci-without-ci-files',
      ],
    ] as const)('Then %s on %j is %s', (label, files, suspicion) => {
      expect(findSuspicion(label, [...files])).toBe(suspicion)
    })
  })

  describe('When the files fit the label', () => {
    it.each([
      [
        'doc',
        ['src/router.ts'],
      ],
      [
        'doc',
        ['docs/.vitepress/config.mts'],
      ],
      [
        'chore',
        ['package.json', 'pnpm-lock.yaml'],
      ],
      [
        'build',
        ['package.json'],
      ],
      [
        'test',
        ['src/__tests__/button.spec.ts'],
      ],
      [
        'test',
        ['packages/core/vitest.config.ts'],
      ],
      [
        'ci',
        ['.github/workflows/release.yml'],
      ],
      [
        'ci',
        ['codecov.yml'],
      ],
      [
        'feature',
        ['src/button.vue', 'README.md'],
      ],
      ['feature', []],
    ] as const)('Then %s on %j is not suspect', (label, files) => {
      expect(findSuspicion(label, [...files])).toBeUndefined()
    })
  })
})
