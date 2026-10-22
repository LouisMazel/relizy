import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { createMockConfig } from '../../../tests/mocks'
import { commitlint } from '../commitlint'

// The setup file mocks execPromise: these tests run the real git commands against a temporary repository
vi.mock('@maz-ui/node', importActual => importActual())

describe('Given commitlint command', () => {
  let cwd: string
  let output: string[]

  function git(...args: string[]) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  }

  function write(path: string, content: string) {
    mkdirSync(join(cwd, path, '..'), { recursive: true })
    writeFileSync(join(cwd, path), content)
  }

  function commitFiles(message: string, files: Record<string, string>) {
    Object.entries(files).forEach(([path, content]) => write(path, content))
    git('add', '--all')
    git('commit', '--no-verify', '-m', message)
  }

  function createConfig(overrides: Parameters<typeof createMockConfig>[0] = {}) {
    return createMockConfig({
      cwd,
      monorepo: { versionMode: 'selective', packages: ['packages/*'] },
      templates: { commitMessage: 'chore(release): bump version to {{newVersion}}' },
      ...overrides,
    })
  }

  beforeEach(() => {
    cwd = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-commitlint-command-')))
    git('init', '--initial-branch=main')
    git('config', 'user.name', 'Test')
    git('config', 'user.email', 'test@example.com')
    git('config', 'commit.gpgsign', 'false')
    git('config', 'tag.gpgsign', 'false')
    write('package.json', '{ "name": "root", "version": "1.0.0", "private": true }')
    write('packages/nuxt/package.json', '{ "name": "@maz-ui/nuxt", "version": "1.0.0" }')
    write('packages/core/package.json', '{ "name": "@maz-ui/core", "version": "1.0.0" }')
    commitFiles('chore: init the repository', {})

    // The CI running these tests may itself be a pull request
    for (const name of ['GITHUB_BASE_REF', 'GITHUB_EVENT_PATH', 'GITHUB_ACTIONS', 'GITLAB_CI', 'CI_MERGE_REQUEST_TITLE', 'CI_MERGE_REQUEST_DIFF_BASE_SHA']) {
      vi.stubEnv(name, '')
    }

    output = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output.push(...String(chunk).replace(/\n$/, '').split('\n'))
      return true
    })
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe('When linting a message', () => {
    it('Then prints one line for a valid message', async () => {
      const result = await commitlint({ message: 'feat(nuxt): add the module options', config: createConfig() })

      expect(result).toEqual(expect.objectContaining({ errorCount: 0, warningCount: 0 }))
      expect(output).toEqual(['✔ feat(nuxt) → minor bump, 🚀 Enhancements'])
    })

    it('Then prints the problems, the summary and the help url of an invalid message', async () => {
      const config = createConfig({ commitlint: { helpUrl: 'https://example.com/commits' } })
      const result = await commitlint({ message: 'feat(unknown): Add the module options.', config })

      expect(result).toEqual(expect.objectContaining({ errorCount: 3, warningCount: 0 }))
      expect(output).toEqual([
        '✖ feat(unknown): Add the module options.',
        '',
        '  ✖ scope-enum         The scope "unknown" is not allowed',
        '                       → use a workspace package or one of: core, @maz-ui/core, nuxt, @maz-ui/nuxt',
        '  ✖ subject-case       The subject starts with an uppercase letter',
        '                       → start it lowercase, relizy capitalizes it in the changelog',
        '  ✖ subject-full-stop  The subject ends with a period',
        '                       → remove the final period',
        '',
        '  Suggested header: feat(unknown): add the module options',
        '                    still to fix: scope-enum',
        '',
        '─'.repeat(72),
        '✖ The commit message is invalid: 3 errors, 0 warnings',
        '  Rules: scope-enum         https://relizy.dev/commitlint/rules#scope-enum',
        '         subject-case       https://relizy.dev/commitlint/rules#subject-case',
        '         subject-full-stop  https://relizy.dev/commitlint/rules#subject-full-stop',
        '  Help:  https://example.com/commits',
      ])
    })

    it('Then prints the changelog entry with --preview', async () => {
      await commitlint({ message: 'feat(nuxt): add the module options\n\nUse `modules: [\'@maz-ui/nuxt\']`.', preview: true, config: createConfig() })

      expect(output).toEqual([
        '✔ feat(nuxt) → minor bump, 🚀 Enhancements',
        '',
        '    ### 🚀 Enhancements',
        '    ',
        '    - **nuxt:** Add the module options',
        '    ',
        '      Use `modules: [\'@maz-ui/nuxt\']`.',
        '',
      ])
    })
  })

  describe('When previewing a commit absent from the changelog', () => {
    it('Then only prints its line', async () => {
      await commitlint({ message: 'chore: tidy the scripts up', preview: true, config: createConfig({ types: { chore: false } }) })

      expect(output).toEqual(['✔ chore → no bump, not in the changelog'])
    })
  })

  describe('When linting the commit being created with --edit', () => {
    it('Then reads the message file without the git comments and checks the staged files', async () => {
      write('packages/core/index.ts', 'export {}')
      git('add', 'packages/core/index.ts')
      write('.git/COMMIT_EDITMSG', 'fix(nuxt): correct the module options\n# Please enter the commit message\n# ------------------------ >8 ------------------------\ndiff --git a/file b/file\n')

      const result = await commitlint({ edit: true, config: createConfig() })

      expect(result).toEqual(expect.objectContaining({ errorCount: 0, warningCount: 1 }))
      expect(output).toEqual([
        '✔ fix(nuxt) → patch bump, 🩹 Fixes',
        '',
        '  ⚠ scope-matches-files  The scope "nuxt" designates packages/nuxt, but it touches @maz-ui/core',
        '                         → use the scope of the touched package, or split the commit per package',
        '',
        '─'.repeat(72),
        '⚠ The commit message is valid, with 1 warning',
        '  Rules: scope-matches-files  https://relizy.dev/commitlint/rules#scope-matches-files',
      ])
    })

    it('Then explains how to commit again with the kept message', async () => {
      write('.git/COMMIT_EDITMSG', 'fix: Typo')

      expect((await commitlint({ edit: true, config: createConfig() })).errorCount).toBe(2)
      expect(output.slice(-2)).toEqual([
        '  Fix:   edit the message and commit again, it is kept in .git/COMMIT_EDITMSG:',
        '           $ git commit --edit --file .git/COMMIT_EDITMSG',
      ])
    })

    it('Then prints the absolute path of a message file outside the repository', async () => {
      const outside = join(realpathSync(tmpdir()), `relizy-message-${Date.now()}.txt`)
      writeFileSync(outside, 'wip')

      try {
        await commitlint({ edit: outside, config: createConfig() })

        expect(output.at(-1)).toBe(`           $ git commit --edit --file ${outside}`)
      }
      finally {
        rmSync(outside, { force: true })
      }
    })

    it('Then reads the file given by the hook', async () => {
      write('message.txt', 'wip')

      const result = await commitlint({ edit: 'message.txt', config: createConfig() })

      expect(result.errorCount).toBe(1)
      expect(result.results[0]?.commit.header).toBe('wip')
    })
  })

  describe('When linting a range of commits', () => {
    it('Then lints the commits after the last tag by default, with their hash', async () => {
      git('tag', 'v1.0.0')
      commitFiles('feat(nuxt): add the module options', { 'packages/nuxt/module.ts': 'a' })
      commitFiles('Merge branch \'feature\'', { 'packages/nuxt/other.ts': 'b' })
      commitFiles('chore(release): bump version to 1.1.0', { 'package.json': '{ "name": "root", "version": "1.1.0", "private": true }' })
      commitFiles('fix: Typo', { 'packages/core/index.ts': 'c' })

      const result = await commitlint({ config: createConfig() })

      expect(result.results).toHaveLength(4)
      expect(result.errorCount).toBe(2)
      expect(output.map(line => line.replace(/\b[0-9a-f]{7}\b/, '<hash>'))).toEqual([
        '✔ <hash> feat(nuxt) → minor bump, 🚀 Enhancements',
        '○ <hash> Merge branch \'feature\' (ignored)',
        '○ <hash> chore(release): bump version to 1.1.0 (ignored)',
        '✖ <hash> fix: Typo',
        '',
        '  ✖ subject-case        The subject starts with an uppercase letter',
        '                        → start it lowercase, relizy capitalizes it in the changelog',
        '  ✖ subject-meaningful  The subject "Typo" does not describe the change',
        '                        → describe what changed, in at least 2 words or 15 characters',
        '',
        '  Suggested header: fix: typo',
        '                    still to fix: subject-meaningful',
        '',
        '─'.repeat(72),
        '✖ 1 of 4 commits is invalid: 2 errors, 0 warnings',
        '  Rules: subject-case        https://relizy.dev/commitlint/rules#subject-case',
        '         subject-meaningful  https://relizy.dev/commitlint/rules#subject-meaningful',
        '  Fix:   reword <hash>: mark it as "reword" in the rebase, then force-push:',
        '           $ git rebase -i v1.0.0',
        '           $ git push --force-with-lease',
      ])
    })

    it('Then lints the title of the merge request first, with every file of the range', async () => {
      git('tag', 'v1.0.0')
      commitFiles('feat(nuxt): add the module options', { 'packages/nuxt/module.ts': 'a' })
      commitFiles('fix(core): correct the helper', { 'packages/core/helper.ts': 'b' })
      vi.stubEnv('CI_MERGE_REQUEST_TITLE', 'Draft: feat(nuxt): Add the module options')

      const result = await commitlint({ from: 'v1.0.0', config: createConfig() })

      expect(result.results[0]?.commit).toEqual(expect.objectContaining({
        header: 'feat(nuxt): Add the module options',
        files: ['packages/nuxt/module.ts', 'packages/core/helper.ts'],
      }))
      expect(output.map(line => line.replace(/\b[0-9a-f]{7}\b/g, '<hash>'))).toEqual([
        '✖ MR title feat(nuxt): Add the module options',
        '',
        '  ✖ subject-case  The subject starts with an uppercase letter',
        '                  → start it lowercase, relizy capitalizes it in the changelog',
        '',
        '  Suggested header: feat(nuxt): add the module options',
        '',
        '✔ <hash> feat(nuxt) → minor bump, 🚀 Enhancements',
        '✔ <hash> fix(core) → patch bump, 🩹 Fixes',
        '',
        '─'.repeat(72),
        '✖ the merge request title is invalid: 1 error, 0 warnings',
        '  Rules: subject-case  https://relizy.dev/commitlint/rules#subject-case',
        '  Fix:   edit the merge request title, then run a new pipeline (a retry keeps the old title)',
      ])
    })

    it('Then does not lint the title with title: false', async () => {
      git('tag', 'v1.0.0')
      commitFiles('feat(nuxt): add the module options', { 'packages/nuxt/module.ts': 'a' })
      vi.stubEnv('CI_MERGE_REQUEST_TITLE', 'wip')

      expect((await commitlint({ from: 'v1.0.0', title: false, config: createConfig() })).results).toHaveLength(1)
    })

    it('Then lints the whole history without tag and explains how to fix it', async () => {
      commitFiles('wip', { 'README.md': 'readme' })

      const result = await commitlint({ config: createConfig() })

      expect(result.results.map(entry => entry.commit.header)).toEqual(['chore: init the repository', 'wip'])
      expect(result.errorCount).toBe(1)
      expect(output.slice(-3).map(line => line.replace(/\b[0-9a-f]{7}\b/g, '<hash>'))).toEqual([
        '  Fix:   reword <hash>: mark it as "reword" in the rebase, then force-push:',
        '           $ git rebase -i --root',
        '           $ git push --force-with-lease',
      ])
    })

    it('Then rejects a start missing from the history', async () => {
      await expect(commitlint({ from: 'origin/unknown', config: createConfig() })).rejects.toThrow('Cannot find "origin/unknown": fetch it before linting')
    })

    it('Then checks the scope against the files of each commit', async () => {
      git('tag', 'v1.0.0')
      commitFiles('fix(nuxt): correct the core helper', { 'packages/core/helper.ts': 'a' })

      const result = await commitlint({ from: 'v1.0.0', config: createConfig() })

      expect(result.warningCount).toBe(1)
      expect(result.results[0]?.commit.packages).toEqual(['@maz-ui/core'])
    })

    it('Then reports a range without commit', async () => {
      git('tag', 'v1.0.0')

      expect((await commitlint({ from: 'v1.0.0', config: createConfig() })).results).toEqual([])
      expect(output).toEqual(['No commit to lint'])
    })
  })

  describe('When choosing the output', () => {
    beforeEach(() => {
      git('tag', 'v1.0.0')
      commitFiles('feat(nuxt): add the module options', { 'packages/nuxt/module.ts': 'a' })
      commitFiles('fix: Typo', { 'packages/core/index.ts': 'b' })
    })

    it('Then prints a JSON report for programs and AI agents', async () => {
      const result = await commitlint({ from: 'v1.0.0', format: 'json', config: createConfig() })
      const report = JSON.parse(output.join('\n'))

      expect(result.errorCount).toBe(2)
      expect(report).toEqual(expect.objectContaining({ valid: false, errorCount: 2, warningCount: 0 }))
      expect(report.entries.map((entry: { header: string, valid: boolean }) => [entry.header, entry.valid])).toEqual([
        ['feat(nuxt): add the module options', true],
        ['fix: Typo', false],
      ])
      expect(report.entries[1].problems[0]).toEqual(expect.objectContaining({ rule: 'subject-case', fix: 'start it lowercase, relizy capitalizes it in the changelog' }))
      expect(report.howToFix).toEqual([
        expect.stringMatching(/^reword [0-9a-f]{7}: mark it as "reword" in the rebase, then force-push:$/),
        '$ git rebase -i v1.0.0',
        '$ git push --force-with-lease',
      ])
    })

    it('Then includes the changelog entries in the JSON report with --preview', async () => {
      await commitlint({ from: 'v1.0.0', format: 'json', preview: true, config: createConfig() })

      expect(JSON.parse(output.join('\n')).entries[0].changelogEntry).toMatch(/^### 🚀 Enhancements\n\n- \*\*nuxt:\*\* Add the module options \([0-9a-f]{7}\)$/)
    })

    it('Then only prints the commits with problems with --quiet', async () => {
      await commitlint({ from: 'v1.0.0', quiet: true, config: createConfig() })

      expect(output[0]).toMatch(/^✖ [0-9a-f]{7} fix: Typo$/)
      expect(output.some(line => line.includes('feat(nuxt)'))).toBe(false)
    })

    it('Then adds the GitHub Actions annotations', async () => {
      vi.stubEnv('GITHUB_ACTIONS', 'true')
      vi.stubEnv('NO_COLOR', '1')

      await commitlint({ from: 'v1.0.0', config: createConfig() })

      expect(output.filter(line => line.startsWith('::'))).toEqual([
        expect.stringMatching(/^::error title=Commit [0-9a-f]{7} \(subject-case\)::fix: Typo%0AThe subject starts with an uppercase letter%0A→ /),
        expect.stringMatching(/^::error title=Commit [0-9a-f]{7} \(subject-meaningful\)::/),
      ])
    })
  })

  describe('When installing the hook', () => {
    it('Then writes the hook and lints nothing', async () => {
      const result = await commitlint({ install: true, config: createConfig() })

      expect(result).toEqual(expect.objectContaining({ results: [], errorCount: 0, hook: { path: join(cwd, '.git/hooks/commit-msg'), status: 'created' } }))
      expect(readFileSync(join(cwd, '.git/hooks/commit-msg'), 'utf8')).toContain('relizy commitlint --edit "$1"')
      expect(output).toEqual([`✔ commit-msg hook created: ${join(cwd, '.git/hooks/commit-msg')}`])
    })

    it('Then replaces another hook with --force', async () => {
      mkdirSync(join(cwd, '.husky'))
      write('.husky/commit-msg', 'npx --no-install commitlint --edit "$1"\n')

      await expect(commitlint({ install: true, config: createConfig() })).rejects.toThrow('A commit-msg hook already exists')
      expect((await commitlint({ install: true, force: true, config: createConfig() })).hook?.status).toBe('replaced')
    })

    it('Then says when the hook is already installed', async () => {
      await commitlint({ install: true, config: createConfig() })
      output = []

      await commitlint({ install: true, config: createConfig() })

      expect(output).toEqual([`The commit-msg hook already runs relizy commitlint (${join(cwd, '.git/hooks/commit-msg')})`])
    })
  })

  describe('When loading the config from the project', () => {
    it('Then applies its scopes, rules and custom rules', async () => {
      write('relizy.config.mjs', `export default {
  monorepo: { versionMode: 'selective', packages: ['packages/*'] },
  commitlint: {
    scopes: ['ci'],
    rules: { 'header-max-length': ['error', 60], 'ticket': 'warn' },
    customRules: {
      ticket: commit => /\\[[A-Z]+-\\d+\\]/.test(commit.subject) || 'Mention the ticket, e.g. [ABC-123]',
    },
  },
}
`)
      const previousCwd = process.cwd()
      process.chdir(cwd)
      try {
        const result = await commitlint({ message: 'fix(ci): correct the workflow of the release', logLevel: 'silent' })

        expect(result.errorCount).toBe(0)
        expect(result.results[0]?.problems).toEqual([{ rule: 'ticket', severity: 'warn', message: 'Mention the ticket, e.g. [ABC-123]' }])
      }
      finally {
        process.chdir(previousCwd)
      }
    })
  })
})

describe('Given the commitlint CLI', () => {
  function run(...args: string[]) {
    return spawnSync(join(process.cwd(), 'node_modules/.bin/tsx'), [join(process.cwd(), 'src/cli.ts'), 'commitlint', ...args], { cwd: process.cwd(), encoding: 'utf8' })
  }

  it('Then exits with 0 on a valid message, without the banner', () => {
    const result = run('--message', 'feat: add the commitlint command')

    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('✔ feat → minor bump, 🚀 Features')
  }, 30_000)

  it('Then prints an expected error without stack trace', () => {
    const result = run('--from', 'origin/unknown-ref')
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('Cannot find "origin/unknown-ref"')
    expect(output).not.toContain('at assertRefAvailable')
  }, 30_000)

  it('Then exits with 1 on an invalid message', () => {
    const result = run('--message', 'Added stuff')

    expect(result.status).toBe(1)
    expect(result.stdout).toContain('✖ Added stuff')
  }, 30_000)
})
