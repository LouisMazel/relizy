import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { checkMigration } from '../migration'

const directories: string[] = []

function writeProject(files: Record<string, string>): string {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-migration-')))
  directories.push(cwd)

  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true })
    writeFileSync(join(cwd, path), content)
  }

  return cwd
}

const V1_PACKAGE = JSON.stringify({
  name: 'lib',
  version: '1.0.0',
  devDependencies: { relizy: '^1.14.0' },
})

afterAll(() => {
  for (const directory of directories) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('Given checkMigration on a relizy 1 project', () => {
  describe('When its config loads with relizy 2', () => {
    it('Then gives the findings with their locations and the page of the guide', async () => {
      const cwd = writeProject({
        'package.json': V1_PACKAGE,
        'relizy.config.mjs': `export default {\n  social: { slack: { enabled: true, template: '*v{{version}}*' } },\n}\n`,
        'scripts/release.ts': `import { confirmBump } from 'relizy'\n\nconfirmBump()\n`,
      })

      const report = await checkMigration({ cwd })

      expect(report).toMatchObject({
        fromVersion: '^1.14.0',
        configLoaded: true,
        configFiles: ['relizy.config.mjs'],
      })
      expect(report.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({
          severity: 'change',
          title: '`relizy` is required as `^1.14.0` in `package.json`',
          section: 'Upgrade',
          docUrl: 'https://relizy.dev/guide/migration-v2#upgrade',
        }),
        expect.objectContaining({
          severity: 'change',
          section: 'Version Placeholder',
          locations: ['relizy.config.mjs:2'],
          docUrl: 'https://relizy.dev/guide/migration-v2#version-placeholder',
        }),
        expect.objectContaining({
          locations: expect.arrayContaining([
            expect.stringMatching(/^scripts\/release\.ts:\d+$/),
          ]),
        }),
      ]))
      expect(report.findings.some(finding => finding.blocking)).toBe(false)
    })
  })

  describe('When relizy is installed', () => {
    it('Then gives its installed version', async () => {
      const cwd = writeProject({
        'package.json': V1_PACKAGE,
        'node_modules/relizy/package.json': JSON.stringify({ name: 'relizy', version: '1.14.3' }),
      })

      expect((await checkMigration({ cwd })).fromVersion).toBe('1.14.3')
    })
  })

  describe('When its config uses an option that stops relizy 2 from loading it', () => {
    it('Then gives it first as blocking, with the checks that do not need the config', async () => {
      const cwd = writeProject({
        'package.json': V1_PACKAGE,
        'relizy.config.mjs': `export default {\n  monorepo: {\n    versionMode: 'selective',\n    packages: ['packages/*'],\n    ignorePackageNames: ['@scope/legacy'],\n  },\n}\n`,
      })

      const report = await checkMigration({ cwd })

      expect(report.configLoaded).toBe(false)
      expect(report.findings[0]).toMatchObject({
        severity: 'change',
        title: '`monorepo.ignorePackageNames` is removed',
        locations: ['relizy.config.mjs:5'],
        blocking: true,
        docUrl: 'https://relizy.dev/guide/migration-v2#removed-ignorepackagenames',
      })
      expect(report.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({ section: 'Upgrade' }),
      ]))
    })
  })

  describe('When its config fails to load for another reason', () => {
    it('Then gives the error of the loading as a blocking finding', async () => {
      const cwd = writeProject({
        'package.json': V1_PACKAGE,
        'relizy.config.mjs': `throw new Error('a config of relizy 1')\n`,
      })

      const report = await checkMigration({ cwd })

      expect(report.configLoaded).toBe(false)
      expect(report.findings[0]).toMatchObject({
        title: 'The config does not load with relizy 2',
        detail: expect.stringContaining('a config of relizy 1'),
        locations: ['relizy.config.mjs'],
        blocking: true,
      })
    })
  })

  describe('When the config asked does not exist', () => {
    it('Then fails', async () => {
      const cwd = writeProject({ 'package.json': V1_PACKAGE })

      await expect(checkMigration({ cwd, configName: 'relizy.nope' })).rejects.toThrow('No config "relizy.nope"')
    })
  })

  describe('When the project does not require relizy', () => {
    it('Then has no version to migrate from', async () => {
      const cwd = writeProject({
        'package.json': JSON.stringify({ name: 'lib', version: '1.0.0' }),
      })
      const initialCwd = process.cwd()
      process.chdir(cwd)
      // The project is the current directory by default
      const report = await checkMigration().finally(() => process.chdir(initialCwd))

      expect(report).not.toHaveProperty('fromVersion')
      expect(report.configFiles).toEqual([])
    })
  })
})
