import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadRelizyConfig } from '../config'
import { getOwnEntry } from '../own-version'

vi.mock('../own-version', async importActual => ({
  ...await importActual<typeof import('../own-version')>(),
  getOwnEntry: vi.fn(),
}))

/**
 * A project run by an application where relizy is installed: the project does
 * not have relizy in its `node_modules`, its config imports it all the same
 */
describe('Given a config importing relizy in a project without relizy', () => {
  let cwd: string

  beforeEach(() => {
    cwd = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-import-')))
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'app', version: '1.0.0' }))
    // The running relizy, as its build would export it
    writeFileSync(join(cwd, '..', `relizy-entry-${cwd.split(/[/\\]/).at(-1)}.mjs`), 'export function defineConfig(config) { return config }\n')
  })

  afterEach(() => {
    rmSync(join(cwd, '..', `relizy-entry-${cwd.split(/[/\\]/).at(-1)}.mjs`), { force: true })
    rmSync(cwd, { recursive: true, force: true })
  })

  describe('When the config is loaded', () => {
    it('Then relizy is the running one', async () => {
      vi.mocked(getOwnEntry).mockReturnValue(join(cwd, '..', `relizy-entry-${cwd.split(/[/\\]/).at(-1)}.mjs`))
      writeFileSync(join(cwd, 'relizy.config.ts'), `import { defineConfig } from 'relizy'\n\nexport default defineConfig({ projectName: 'from-the-app', logLevel: 'silent' })\n`)

      const config = await loadRelizyConfig({
        overrides: { cwd },
      })

      expect(config.projectName).toBe('from-the-app')
    })
  })

  describe('When the running relizy is not found', () => {
    it('Then a config without import still loads', async () => {
      vi.mocked(getOwnEntry).mockReturnValue(undefined)
      writeFileSync(join(cwd, 'relizy.config.mjs'), `export default { projectName: 'plain', logLevel: 'silent' }\n`)

      const config = await loadRelizyConfig({
        overrides: { cwd },
      })

      expect(config.projectName).toBe('plain')
    })
  })
})
