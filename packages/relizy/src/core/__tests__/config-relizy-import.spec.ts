import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig } from 'c12'
import { getConfigJitiOptions, loadRelizyConfig } from '../config'
import { findOwnRoot, getOwnImportAliases } from '../own-version'

function writeJson(file: string, value: unknown): void {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, JSON.stringify(value))
}

/**
 * A relizy installed somewhere (the one of an application): its `package.json`,
 * its build and its bin. Its `defineConfig` marks the configs it defines.
 */
function installRunningRelizy(directory: string): string {
  writeJson(join(directory, 'package.json'), {
    name: 'relizy',
    version: '9.0.0',
    exports: {
      '.': { types: './dist/index.d.ts', import: './dist/index.mjs' },
      './cli': './bin/relizy.mjs',
      './missing': './bin/missing.mjs',
    },
  })
  mkdirSync(join(directory, 'dist'), { recursive: true })
  mkdirSync(join(directory, 'bin'), { recursive: true })
  writeFileSync(join(directory, 'dist', 'index.mjs'), 'export const defineConfig = config => ({ ...config, definedBy: \'running\' })\n')
  writeFileSync(join(directory, 'bin', 'relizy.mjs'), 'export const bin = \'running\'\n')

  return join(directory, 'dist')
}

/**
 * The project has its own relizy, of another version: its `defineConfig` marks
 * the configs too
 */
function installProjectRelizy(cwd: string): void {
  const directory = join(cwd, 'node_modules', 'relizy')
  writeJson(join(directory, 'package.json'), {
    name: 'relizy',
    version: '1.0.0',
    type: 'module',
    exports: { '.': './index.mjs' },
  })
  writeFileSync(join(directory, 'index.mjs'), 'export const defineConfig = config => ({ ...config, definedBy: \'project\' })\n')
}

describe('Given a config importing relizy', () => {
  let root: string
  let cwd: string

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-import-')))
    cwd = join(root, 'project')
    writeJson(join(cwd, 'package.json'), { name: 'app', version: '1.0.0', type: 'module' })
    installProjectRelizy(cwd)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  describe('When the project installs another version of relizy', () => {
    it('Then the config gets the running relizy, and relizy/cli its bin', async () => {
      const from = installRunningRelizy(join(root, 'app', 'node_modules', 'relizy'))
      writeFileSync(join(cwd, 'relizy.config.ts'), [
        'import { defineConfig } from \'relizy\'',
        'import { bin } from \'relizy/cli\'',
        '',
        'export default defineConfig({ projectName: bin })',
        '',
      ].join('\n'))

      const { config } = await loadConfig<{ projectName: string, definedBy: string }>({
        cwd,
        name: 'relizy',
        jitiOptions: getConfigJitiOptions(from),
      })

      expect(config).toMatchObject({ projectName: 'running', definedBy: 'running' })
    })

    it('Then only the exact import and the exported subpaths found are rewritten', () => {
      const from = installRunningRelizy(join(root, 'app', 'node_modules', 'relizy'))
      const directory = join(root, 'app', 'node_modules', 'relizy')

      expect(getOwnImportAliases(from)).toEqual({
        'relizy': join(directory, 'dist', 'index.mjs'),
        'relizy/cli': join(directory, 'bin', 'relizy.mjs'),
      })
    })
  })

  describe('When the running relizy is not found (bundled in another program)', () => {
    it('Then the config gets the relizy of the project', async () => {
      const from = join(root, 'bundle')
      mkdirSync(from)
      writeFileSync(join(cwd, 'relizy.config.ts'), 'import { defineConfig } from \'relizy\'\n\nexport default defineConfig({ projectName: \'plain\' })\n')

      expect(getConfigJitiOptions(from)).toEqual({})

      const { config } = await loadConfig<{ projectName: string, definedBy: string }>({
        cwd,
        name: 'relizy',
        jitiOptions: getConfigJitiOptions(from),
      })

      expect(config).toMatchObject({ projectName: 'plain', definedBy: 'project' })
    })
  })

  describe('When the running relizy has no build', () => {
    it('Then nothing is rewritten', () => {
      const directory = join(root, 'app', 'node_modules', 'relizy')
      writeJson(join(directory, 'package.json'), { name: 'relizy', version: '9.0.0' })

      expect(getOwnImportAliases(join(directory, 'dist'))).toEqual({})
    })
  })

  describe('When relizy runs from its sources', () => {
    it('Then the config gets its sources, and relizy/cli its bin', () => {
      const own = findOwnRoot()!

      expect(getOwnImportAliases()).toEqual({
        'relizy': join(own, 'src', 'index.ts'),
        'relizy/cli': join(own, 'bin', 'relizy.mjs'),
      })
    })

    it('Then a config without import loads', async () => {
      writeFileSync(join(cwd, 'relizy.config.mjs'), 'export default { projectName: \'plain\', logLevel: \'silent\' }\n')

      const config = await loadRelizyConfig({
        overrides: { cwd },
      })

      expect(config.projectName).toBe('plain')
    })
  })
})
