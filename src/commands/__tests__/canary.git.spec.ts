import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { bump } from '../bump'

vi.mock('@maz-ui/node', importActual => importActual())

describe('Given a canary bump on a real git repository', () => {
  let cwd: string
  let initialCwd: string

  function git(...args: string[]) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  }

  function writeJson(dir: string, content: Record<string, unknown>) {
    mkdirSync(join(cwd, dir), { recursive: true })
    writeFileSync(join(cwd, dir, 'package.json'), `${JSON.stringify(content, null, 2)}\n`)
  }

  function commit(message: string, file: string) {
    writeFileSync(join(cwd, file), `${message}\n`)
    git('add', '-A')
    git('commit', '--no-verify', '-m', message)
  }

  function init(config: string) {
    writeFileSync(join(cwd, 'relizy.config.mjs'), `export default { logLevel: 'silent', safetyCheck: false, ${config} }\n`)
    git('add', '-A')
    git('commit', '--no-verify', '-m', 'chore: init')
  }

  beforeEach(() => {
    initialCwd = process.cwd()
    cwd = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-canary-')))
    git('init', '--initial-branch=main')
    git('config', 'user.email', 'relizy@example.com')
    git('config', 'user.name', 'Relizy')
    git('config', 'commit.gpgsign', 'false')
    git('config', 'tag.gpgsign', 'false')
    process.chdir(cwd)
  })

  afterEach(() => {
    process.chdir(initialCwd)
    rmSync(cwd, { recursive: true, force: true })
  })

  describe('When a 0.x package has a breaking change', () => {
    it('Then bumps the minor, as a release does with bump.capZeroMajor', async () => {
      writeJson('.', { name: 'app', version: '0.5.2' })
      init('')
      git('tag', '-a', 'v0.5.2', '-m', 'v0.5.2')
      commit('feat!: drop the old parser', 'parser.js')

      const result = await bump({ canary: true, yes: true, dryRun: true })

      expect(result.bumped && result.newVersion).toMatch(/^0\.6\.0-0\.canary-[0-9a-f]+$/)
    })

    it('Then bumps the major with bump.capZeroMajor: false', async () => {
      writeJson('.', { name: 'app', version: '0.5.2' })
      init(`bump: { capZeroMajor: false }`)
      git('tag', '-a', 'v0.5.2', '-m', 'v0.5.2')
      commit('feat!: drop the old parser', 'parser.js')

      const result = await bump({ canary: true, yes: true, dryRun: true })

      expect(result.bumped && result.newVersion).toMatch(/^1\.0\.0-0\.canary-[0-9a-f]+$/)
    })
  })

  describe('When a 0.x package of an independent monorepo has a breaking change', () => {
    it('Then bumps its minor', async () => {
      writeJson('.', { name: 'monorepo', version: '1.0.0', private: true })
      writeJson('packages/core', { name: '@scope/core', version: '0.5.2' })
      init(`monorepo: { versionMode: 'independent', packages: ['packages/*'] }`)
      git('tag', '-a', '@scope/core@0.5.2', '-m', '@scope/core@0.5.2')
      commit('feat(core)!: drop the old parser', 'packages/core/parser.js')

      const result = await bump({ canary: true, yes: true, dryRun: true })

      expect(result.bumped && result.bumpedPackages.map(pkg => pkg.newVersion)).toEqual([expect.stringMatching(/^0\.6\.0-0\.canary-[0-9a-f]+$/)])
    })
  })
})
