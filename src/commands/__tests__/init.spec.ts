import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { cancel, confirm, log, multiselect, note, select, text } from '@clack/prompts'
import { logger } from '@maz-ui/node'
import { getDefaultConfig } from '../../core'
import { init } from '../init'

const CANCEL = Symbol('cancel')

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
vi.mock('../../core/utils', async importActual => ({
  ...await importActual<typeof import('../../core/utils')>(),
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

    it('Then refuses to replace an existing config without --force', async () => {
      write('relizy.config.mjs', 'export default {}')

      await expect(init({ cwd, yes: true })).rejects.toThrow('A relizy config already exists (relizy.config.mjs), run with --force to replace it')
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
    let ttyDescriptor: PropertyDescriptor | undefined

    beforeEach(() => {
      ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
    })

    afterEach(() => {
      if (ttyDescriptor) {
        Object.defineProperty(process.stdin, 'isTTY', ttyDescriptor)
      }
      else {
        delete (process.stdin as { isTTY?: boolean }).isTTY
      }
    })

    it('Then cancels when the existing config is kept', async () => {
      write('relizy.config.ts', 'export default {}')
      answer(confirm, [false])

      const result = await init({ cwd })

      expect(result.written).toBe(false)
      expect(read('relizy.config.ts')).toBe('export default {}')
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
      answer(select, ['publish', 'selective', 'restricted', 'update'])
      answer(multiselect, [['packages/*'], ['dependencies', 'devDependencies'], typesExcept('chore'), ['slack'], ['providerRelease']])
      answer(confirm, [true, false, false, true, false, true])
      answer(text, ['', 'https://npm.acme.dev', 'pnpm build', '#releases', 'https://acme.dev/changelog', 'fr'])

      const result = await init({ cwd })

      expect(result.config).toEqual({
        monorepo: { versionMode: 'selective', packages: ['packages/*'] },
        types: { chore: false },
        bump: { dependencyTypes: ['dependencies', 'devDependencies'], capZeroMajor: false },
        changelog: { rootChangelog: false },
        publish: { access: 'restricted', registry: 'https://npm.acme.dev', buildCmd: 'pnpm build' },
        social: { slack: { enabled: true, channel: '#releases' }, changelogUrl: 'https://acme.dev/changelog' },
        prComment: { mode: 'update' },
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
      answer(confirm, [false, true, true, true, true])

      const result = await init({ cwd })

      expect(result.config).toEqual({
        monorepo: { versionMode: 'selective', packages: ['packages/*', 'tools/*'], includePrivates: true },
        release: { publish: false },
      })
      expect(result.hook?.status).toBe('replaced')
      expect(read('.git/hooks/commit-msg')).toContain('relizy commitlint')
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
      let ttyDescriptor: PropertyDescriptor | undefined

      beforeEach(() => {
        ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
        Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
      })

      afterEach(() => {
        if (ttyDescriptor) {
          Object.defineProperty(process.stdin, 'isTTY', ttyDescriptor)
        }
        else {
          delete (process.stdin as { isTTY?: boolean }).isTTY
        }
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
