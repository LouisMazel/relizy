import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { cancel, confirm, log, multiselect, note, select, text } from '@clack/prompts'
import { logger } from '@maz-ui/node'
import { setInteractiveTerminal } from '../../../tests/mocks'
import { getDefaultConfig } from '../../core'
import { init } from '../init'

const CANCEL = Symbol('cancel')

/**
 * The notes shown by init, without their colors (on in CI)
 */
function notes() {
  return vi.mocked(note).mock.calls.map(([text, title]) => [stripVTControlCharacters(String(text)), title])
}

vi.mock('@clack/prompts', () => ({
  cancel: vi.fn(),
  confirm: vi.fn(),
  intro: vi.fn(),
  isCancel: (value: unknown) => value === CANCEL,
  log: { info: vi.fn(), message: vi.fn(), step: vi.fn(), success: vi.fn(), warn: vi.fn() },
  multiselect: vi.fn(),
  note: vi.fn(),
  outro: vi.fn(),
  select: vi.fn(),
  text: vi.fn(),
}))

/** Every commit type but these ones, as selected in the changelog question */
function typesExcept(...hidden: string[]) {
  return Object.keys(getDefaultConfig().types).filter(type => !hidden.includes(type))
}

// The CI running these tests must not switch the command to the non-interactive mode
vi.mock('../../core/ci-env', async importActual => ({
  ...await importActual<typeof import('../../core/ci-env')>(),
  isInCI: () => false,
}))

describe('Given init command', () => {
  let cwd: string

  function write(path: string, content: string) {
    mkdirSync(join(cwd, path, '..'), { recursive: true })
    writeFileSync(join(cwd, path), content)
  }

  function writePackage(path: string, content: Record<string, unknown>) {
    write(join(path, 'package.json'), `${JSON.stringify(content, null, 2)}\n`)
  }

  function read(path: string) {
    return readFileSync(join(cwd, path), 'utf8')
  }

  function readJson(path: string) {
    return JSON.parse(read(path))
  }

  function answer(prompt: unknown, values: unknown[]) {
    for (const value of values) {
      vi.mocked(prompt as (...args: any[]) => Promise<unknown>).mockResolvedValueOnce(value)
    }
  }

  beforeEach(() => {
    cwd = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-init-command-')))
    execFileSync('git', ['init', '--initial-branch=main'], { cwd })
    execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:acme/mono.git'], { cwd })
    writePackage('.', { name: 'mono', private: true, packageManager: 'pnpm@9.0.0', scripts: { build: 'turbo build' } })
    write('pnpm-workspace.yaml', 'packages:\n  - packages/*\n  - tools/*\n')
    writePackage('packages/core', { name: '@acme/core', version: '1.0.0' })
    writePackage('packages/ui', { name: '@acme/ui', version: '0.2.0' })
    writePackage('tools/cfg', { name: '@acme/cfg', version: '0.1.0', private: true })
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  describe('When accepting the detected values', () => {
    it('Then writes the config, completes the package.json and installs the hook without asking', async () => {
      const result = await init({ cwd, yes: true })

      expect(result).toEqual(expect.objectContaining({ written: true, scripts: ['release'], configFile: join(cwd, 'relizy.config.ts') }))
      expect(read('relizy.config.ts')).toBe([
        `import { defineConfig } from 'relizy'`,
        '',
        '// All the options: https://relizy.dev/config/overview',
        'export default defineConfig({',
        '  monorepo: {',
        '    versionMode: \'independent\',',
        '    packages: [\'packages/*\'],',
        '  },',
        '  publish: {',
        '    buildCmd: \'pnpm run build\',',
        '  },',
        '})',
        '',
      ].join('\n'))
      expect(readJson('package.json')).toEqual(expect.objectContaining({ version: '0.0.0', scripts: { build: 'turbo build', release: 'relizy release' } }))
      expect(read('.git/hooks/commit-msg')).toContain('relizy commitlint --edit')
      expect(result.hook?.status).toBe('created')
      expect(vi.mocked(confirm)).not.toHaveBeenCalled()
      expect(vi.mocked(note)).toHaveBeenCalledWith(expect.stringContaining('pnpm add -D -w relizy'), 'Next steps')
    })

    it('Then sets up the AI agents the project already uses', async () => {
      write('CLAUDE.md', '# mono')

      const result = await init({ cwd, yes: true })

      expect(result.agents?.targets).toEqual(['claude'])
      expect(read('.claude/rules/relizy.md')).toContain('Managed by relizy')
      expect(readJson('.mcp.json').mcpServers.relizy.args).toContain('mcp')
      expect(vi.mocked(note)).toHaveBeenCalledWith(expect.stringContaining('AI agents (claude)'), 'Changes')
      expect(vi.mocked(log.success)).toHaveBeenCalledWith('Set up the AI agents (.claude/rules/relizy.md, .mcp.json)')
    })

    it('Then reports the AI agents already set up, and does not set up a project without agent', async () => {
      write('CLAUDE.md', '# mono')
      await init({ cwd, yes: true })

      await init({ cwd, yes: true, force: true })

      expect(vi.mocked(log.success)).toHaveBeenCalledWith('The AI agents are already set up for relizy')

      rmSync(join(cwd, 'CLAUDE.md'))
      rmSync(join(cwd, '.claude'), { recursive: true })
      rmSync(join(cwd, '.mcp.json'))

      const result = await init({ cwd, yes: true, force: true })

      expect(result.agents).toBeUndefined()
      expect(existsSync(join(cwd, '.mcp.json'))).toBe(false)
    })

    it('Then warns when the AI agents cannot be set up', async () => {
      write('CLAUDE.md', '# mono')
      vi.stubEnv('RELIZY_AGENT_DOCS_DIR', join(cwd, 'missing'))

      const result = await init({ cwd, yes: true })

      expect(result.written).toBe(true)
      expect(result.agents).toBeUndefined()
      expect(vi.mocked(log.warn)).toHaveBeenCalledWith(expect.stringContaining('AI agents not set up - The rules of relizy for the agents are missing'))
      vi.unstubAllEnvs()
    })

    it('Then keeps an existing config without --force, and sets up the rest from it', async () => {
      const config = 'export default { release: { publish: false }, social: { slack: { enabled: true } } }'
      write('relizy.config.mjs', config)

      const result = await init({ cwd, yes: true })

      expect(result).toEqual(expect.objectContaining({ kept: true, written: false, configFile: join(cwd, 'relizy.config.mjs'), scripts: ['release'] }))
      expect(read('relizy.config.mjs')).toBe(config)
      expect(existsSync(join(cwd, 'relizy.config.ts'))).toBe(false)
      expect(vi.mocked(log.info)).toHaveBeenCalledWith('A relizy config already exists (relizy.config.mjs): kept, run with --force to replace it')
      expect(read('.git/hooks/commit-msg')).toContain('relizy commitlint --edit')
      // The secrets follow the kept config: Slack, nothing published
      const workflow = read('.github/workflows/release.yml')
      expect(workflow).toContain('slack-token')
      expect(workflow).not.toContain('npm-token')
      expect(readJson('package.json').version).toBeUndefined()
    })

    it('Then replaces an existing config of another format with --force', async () => {
      write('relizy.config.mjs', 'export default {}')

      await init({ cwd, yes: true, force: true })

      expect(existsSync(join(cwd, 'relizy.config.mjs'))).toBe(false)
      expect(existsSync(join(cwd, 'relizy.config.ts'))).toBe(true)
    })

    it('Then keeps an existing commit-msg hook', async () => {
      write('.git/hooks/commit-msg', '#!/bin/sh\nnpx commitlint --edit "$1"\n')

      const result = await init({ cwd, yes: true })

      expect(result.hook).toBeUndefined()
      expect(read('.git/hooks/commit-msg')).toBe('#!/bin/sh\nnpx commitlint --edit "$1"\n')
      expect(vi.mocked(log.warn)).toHaveBeenCalledWith(expect.stringContaining('A commit-msg hook already exists'))
    })

    it('Then writes nothing in dry run', async () => {
      const result = await init({ cwd, yes: true, dryRun: true })

      expect(result.written).toBe(false)
      expect(result.content).toContain('defineConfig')
      expect(existsSync(join(cwd, 'relizy.config.ts'))).toBe(false)
      expect(readJson('package.json').scripts.release).toBeUndefined()
    })

    it('Then names the file after the config name', async () => {
      const result = await init({ cwd, yes: true, configName: 'relizy.standalone' })

      expect(result.configFile).toBe(join(cwd, 'relizy.standalone.config.ts'))
    })
  })

  describe('When answering the questions', () => {
    let restoreTerminal: () => void

    beforeEach(() => {
      restoreTerminal = setInteractiveTerminal(true)
    })

    afterEach(() => {
      restoreTerminal()
    })

    it('Then keeps the existing config and asks the other steps only', async () => {
      write('relizy.config.ts', 'export default {}')
      answer(select, ['keep', 'manual'])
      answer(confirm, [true, true, true, true])

      const result = await init({ cwd })

      expect(result).toEqual(expect.objectContaining({ kept: true, written: false, workflow: { file: '.github/workflows/release.yml' } }))
      expect(read('relizy.config.ts')).toBe('export default {}')
      expect(notes()).toContainEqual([expect.stringContaining('keep     relizy.config.ts'), 'Changes'])
      expect(readJson('package.json').scripts.release).toBe('relizy release')
    })

    it('Then cancels from the existing config, nothing written', async () => {
      write('relizy.config.ts', 'export default {}')
      answer(select, ['cancel'])

      const result = await init({ cwd })

      expect(result.written).toBe(false)
      expect(vi.mocked(cancel)).toHaveBeenCalledWith('Init cancelled, nothing written')
      expect(existsSync(join(cwd, '.github/workflows/release.yml'))).toBe(false)
    })

    it('Then stops without writing when a question is cancelled', async () => {
      answer(select, [CANCEL])

      const result = await init({ cwd })

      expect(result.written).toBe(false)
      expect(vi.mocked(cancel)).toHaveBeenCalledWith('Init cancelled')
      expect(existsSync(join(cwd, 'relizy.config.ts'))).toBe(false)
    })

    it('Then writes nothing when the changes are not applied', async () => {
      answer(select, ['publish', 'independent'])
      answer(multiselect, [['packages/*']])
      answer(confirm, [false, true, true, false])

      const result = await init({ cwd })

      expect(result.written).toBe(false)
      expect(vi.mocked(note)).toHaveBeenCalledWith(expect.stringContaining('(required, never bumped in independent mode)'), 'Changes')
      expect(vi.mocked(cancel)).toHaveBeenCalledWith('Init cancelled, nothing written')
      expect(existsSync(join(cwd, 'relizy.config.ts'))).toBe(false)
      expect(readJson('package.json').version).toBeUndefined()
    })

    it('Then writes the basic and advanced answers', async () => {
      answer(select, ['publish', 'selective', 'restricted', 'append'])
      answer(multiselect, [['packages/*'], ['dependencies', 'devDependencies'], typesExcept('chore'), ['slack'], ['providerRelease']])
      // advanced, capZeroMajor, rootChangelog, hook, script, workflow, apply
      answer(confirm, [true, false, false, true, false, false, true])
      answer(text, ['', 'https://npm.acme.dev', 'pnpm build', '#releases', 'https://acme.dev/changelog', 'fr'])

      const result = await init({ cwd })

      expect(result.config).toEqual({
        monorepo: { versionMode: 'selective', packages: ['packages/*'] },
        types: { chore: false },
        bump: { dependencyTypes: ['dependencies', 'devDependencies'], capZeroMajor: false },
        changelog: { rootChangelog: false },
        publish: { access: 'restricted', registry: 'https://npm.acme.dev', buildCmd: 'pnpm build' },
        social: { slack: { enabled: true, channel: '#releases' }, changelogUrl: 'https://acme.dev/changelog' },
        prComment: { mode: 'append' },
        ai: { language: 'fr', providerRelease: { enabled: true } },
      })
      // The root takes the highest package version in selective mode
      expect(readJson('package.json')).toEqual(expect.objectContaining({ version: '1.0.0' }))
      expect(readJson('package.json').scripts.release).toBeUndefined()
      expect(result.scripts).toEqual([])
      expect(vi.mocked(note)).toHaveBeenCalledWith(expect.stringContaining('SLACK_TOKEN'), 'Next steps')
    })

    it('Then replaces an existing commit-msg hook when confirmed', async () => {
      write('.git/hooks/commit-msg', '#!/bin/sh\nnpx commitlint --edit "$1"\n')
      answer(select, ['version', 'selective'])
      answer(multiselect, [['packages/*', 'tools/*']])
      // advanced, hook, script, workflow, apply, replace the hook
      answer(confirm, [false, true, true, false, true, true])

      const result = await init({ cwd })

      expect(result.config).toEqual({
        monorepo: { versionMode: 'selective', packages: ['packages/*', 'tools/*'], privatePackages: 'release' },
        release: { publish: false },
      })
      expect(result.hook?.status).toBe('replaced')
      expect(read('.git/hooks/commit-msg')).toContain('relizy commitlint')
    })
  })

  describe('When generating the release workflow of the CI', () => {
    it('Then writes the GitHub Actions workflow without asking, released on demand, with the secrets of the config', async () => {
      const result = await init({ cwd, yes: true })

      expect(result.workflow).toEqual({ file: '.github/workflows/release.yml' })
      const workflow = read('.github/workflows/release.yml')
      expect(workflow).toContain('  workflow_dispatch:\n')
      // eslint-disable-next-line no-template-curly-in-string -- an expression of GitHub Actions
      expect(workflow).toContain('        uses: relizy/action@v2\n        with:\n          release-type: ${{ inputs.release }}\n')
      // eslint-disable-next-line no-template-curly-in-string -- an expression of GitHub Actions
      expect(workflow).toContain('          npm-token: ${{ secrets.NPM_TOKEN }}\n')
      expect(workflow).toContain('      pull-requests: write\n')
      expect(vi.mocked(note)).toHaveBeenCalledWith(expect.stringContaining('.github/workflows/release.yml'), 'Changes')
      expect(notes()).toContainEqual([expect.stringMatching(/Add the secrets +NPM_TOKEN/), 'Next steps'])
    })

    it('Then keeps an existing workflow without asking', async () => {
      write('.github/workflows/release.yml', 'name: Mine\n')

      const result = await init({ cwd, yes: true })

      expect(result.workflow).toBeUndefined()
      expect(read('.github/workflows/release.yml')).toBe('name: Mine\n')
      expect(vi.mocked(log.warn)).toHaveBeenCalledWith('.github/workflows/release.yml already exists: the release workflow is not generated')
    })

    it('Then writes nothing with --no-workflow, nor in dry run where it shows it', async () => {
      await init({ cwd, yes: true, workflow: false })
      expect(existsSync(join(cwd, '.github/workflows/release.yml'))).toBe(false)

      rmSync(join(cwd, 'relizy.config.ts'))
      vi.mocked(note).mockClear()
      await init({ cwd, yes: true, dryRun: true })
      expect(existsSync(join(cwd, '.github/workflows/release.yml'))).toBe(false)
      expect(vi.mocked(note)).toHaveBeenCalledWith(expect.stringContaining('name: Release'), '.github/workflows/release.yml')
    })

    it('Then puts the GitLab CI job aside an existing .gitlab-ci.yml, released at each push, with the include to add', async () => {
      execFileSync('git', ['remote', 'set-url', 'origin', 'git@gitlab.com:acme/mono.git'], { cwd })
      write('.gitlab-ci.yml', 'test:\n  script: [pnpm test]\n')
      write('.nvmrc', 'v24.11.0\n')
      answer(select, ['publish', 'selective', 'push'])
      answer(multiselect, [['packages/*']])
      // advanced, hook, script, workflow, apply
      answer(confirm, [false, false, false, true, true])

      const restoreTerminal = setInteractiveTerminal(true)
      const result = await init({ cwd }).finally(restoreTerminal)

      expect(result.workflow).toEqual({ file: '.gitlab/ci/relizy.yml', include: 'include:\n  - local: .gitlab/ci/relizy.yml' })
      expect(read('.gitlab-ci.yml')).toBe('test:\n  script: [pnpm test]\n')
      const job = read('.gitlab/ci/relizy.yml')
      // On gitlab.com: the component of the CI/CD catalog, at each push, with the Node version of the project
      expect(job).toContain('  - component: gitlab.com/relizy/relizy/release@2\n    inputs:\n      when: on_success\n      image: node:24\n')
      expect(job).not.toContain('RELEASE_TYPE')
      expect(notes()).toContainEqual([expect.stringMatching(/Add the CI\/CD variables GITLAB_TOKEN, NPM_TOKEN/), 'Next steps'])
    })
  })

  describe('When initializing a standalone package', () => {
    beforeEach(() => {
      rmSync(join(cwd, 'pnpm-workspace.yaml'))
      execFileSync('git', ['remote', 'remove', 'origin'], { cwd })
      writePackage('.', {
        name: 'lib',
        version: '0.4.0',
        publishConfig: { access: 'restricted' },
        scripts: { format: 'prettier -w .', release: 'relizy release --yes' },
        devDependencies: { relizy: '^1.0.0' },
      })
    })

    it('Then keeps an existing release script and does not ask to install relizy', async () => {
      const result = await init({ cwd, yes: true, logLevel: 'debug' })

      expect(result.config).toEqual({ release: { providerRelease: false, prComment: false } })
      expect(result.scripts).toEqual([])
      expect(readJson('package.json').scripts.release).toBe('relizy release --yes')
      expect(vi.mocked(logger.setLevel)).toHaveBeenCalledWith('debug')
      expect(vi.mocked(note)).not.toHaveBeenCalledWith(expect.stringContaining('Install relizy'), 'Next steps')
    })

    it('Then warns when the hook cannot be installed outside a git repository', async () => {
      rmSync(join(cwd, '.git'), { recursive: true, force: true })

      const result = await init({ cwd, yes: true })

      expect(result.written).toBe(true)
      expect(result.hook).toBeUndefined()
      expect(vi.mocked(log.warn)).toHaveBeenCalledWith(expect.stringContaining('commit-msg hook not installed'))
    })

    it('Then warns to remove the relizy key of the package.json it replaces', async () => {
      writePackage('.', { name: 'lib', version: '1.0.0', relizy: { types: {} } })

      await init({ cwd, yes: true, force: true })

      expect(existsSync(join(cwd, 'package.json'))).toBe(true)
      expect(vi.mocked(log.warn)).toHaveBeenCalledWith(expect.stringContaining('"relizy" key of the package.json'))
    })

    describe('And answering the questions', () => {
      let restoreTerminal: () => void

      beforeEach(() => {
        restoreTerminal = setInteractiveTerminal(true)
      })

      afterEach(() => {
        restoreTerminal()
      })

      it('Then only asks the questions relevant to a standalone package', async () => {
        answer(select, ['publish', 'restricted'])
        answer(confirm, [true, true, false, true])
        answer(multiselect, [typesExcept(), ['twitter'], ['twitter']])
        answer(text, ['prettier -w CHANGELOG.md', '', '', '', ''])

        const result = await init({ cwd })

        expect(result.config).toEqual({
          changelog: { formatCmd: 'prettier -w CHANGELOG.md' },
          publish: { access: 'restricted' },
          release: { providerRelease: false, prComment: false },
          social: { twitter: { enabled: true } },
          ai: { social: { twitter: { enabled: true } } },
        })
        expect(vi.mocked(select)).toHaveBeenCalledWith(expect.objectContaining({ message: 'Access of the published packages:', initialValue: 'restricted' }))
        expect(vi.mocked(text)).toHaveBeenCalledWith(expect.objectContaining({ initialValue: expect.stringContaining('run format') }))
        expect(result.hook).toBeUndefined()
      })

      it('Then leaves the formatting of the changelogs to the formatter detected', async () => {
        writePackage('.', { name: 'lib', version: '0.4.0', scripts: { format: 'prettier -w .' }, devDependencies: { prettier: '^3.0.0' } })
        answer(select, ['publish', 'public'])
        answer(confirm, [true, true, false, true])
        answer(multiselect, [typesExcept(), ['twitter'], ['twitter']])
        answer(text, ['', '', '', '', ''])

        const result = await init({ cwd })

        expect(result.config.changelog).toBeUndefined()
        expect(vi.mocked(text)).toHaveBeenCalledWith(expect.objectContaining({
          message: 'Command formatting the changelogs once written (leave empty to use prettier, detected):',
          initialValue: undefined,
        }))
      })

      it('Then keeps an existing commit-msg hook when the replacement is declined', async () => {
        write('.git/hooks/commit-msg', '#!/bin/sh\nnpx commitlint --edit "$1"\n')
        answer(select, ['version'])
        answer(confirm, [false, true, true, false])

        const result = await init({ cwd })

        expect(result.config).toEqual({ release: { publish: false, providerRelease: false, prComment: false } })
        expect(result.hook).toBeUndefined()
        expect(read('.git/hooks/commit-msg')).toBe('#!/bin/sh\nnpx commitlint --edit "$1"\n')
      })
    })
  })
})
