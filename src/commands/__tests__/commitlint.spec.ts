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
        '  ✖ The scope "unknown" is not allowed. Use a workspace package or one of: core, @maz-ui/core, nuxt, @maz-ui/nuxt [scope-enum]',
        '  ✖ The subject must not start with an uppercase letter, relizy capitalizes it in the changelog [subject-case]',
        '  ✖ The subject must not end with a period [subject-full-stop]',
        '✖ 3 problems (3 errors, 0 warnings)',
        'ⓘ Get help: https://example.com/commits',
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
        '  ⚠ The scope "nuxt" designates packages/nuxt, but it touches @maz-ui/core [scope-matches-files]',
        '⚠ 1 problem (0 errors, 1 warning)',
      ])
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
      vi.stubEnv('GITHUB_BASE_REF', '')
      vi.stubEnv('CI_MERGE_REQUEST_DIFF_BASE_SHA', '')

      const result = await commitlint({ config: createConfig() })

      expect(result.results).toHaveLength(4)
      expect(result.errorCount).toBe(2)
      expect(output.map(line => line.replace(/\b[0-9a-f]{7}\b/, '<hash>'))).toEqual([
        '✔ <hash> feat(nuxt) → minor bump, 🚀 Enhancements',
        '○ <hash> Merge branch \'feature\' (ignored)',
        '○ <hash> chore(release): bump version to 1.1.0 (ignored)',
        '✖ <hash> fix: Typo',
        '  ✖ The subject must not start with an uppercase letter, relizy capitalizes it in the changelog [subject-case]',
        '  ✖ The subject "Typo" does not describe the change [subject-meaningful]',
        '✖ 2 problems (2 errors, 0 warnings)',
      ])
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

  it('Then exits with 1 on an invalid message', () => {
    const result = run('--message', 'Added stuff')

    expect(result.status).toBe(1)
    expect(result.stdout).toContain('✖ Added stuff')
  }, 30_000)
})
