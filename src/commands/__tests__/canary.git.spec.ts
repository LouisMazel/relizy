import type { GitRepository } from '../../../tests/git-repository'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { createGitRepository } from '../../../tests/git-repository'
import { bump } from '../bump'

vi.mock('@maz-ui/node', importActual => importActual())

describe('Given a canary bump on a real git repository', () => {
  let repository: GitRepository
  let cwd: string
  let initialCwd: string

  function git(...args: string[]) {
    return repository.git(...args)
  }

  function writeJson(dir: string, content: Record<string, unknown>) {
    repository.writeJson(dir, content)
  }

  function commit(message: string, file: string) {
    repository.commit(message, { [file]: `${message}\n` })
  }

  function init(config: string) {
    writeFileSync(join(cwd, 'relizy.config.mjs'), `export default { logLevel: 'silent', safetyCheck: false, ${config} }\n`)
    git('add', '-A')
    git('commit', '--no-verify', '-m', 'chore: init')
  }

  beforeEach(() => {
    initialCwd = process.cwd()
    repository = createGitRepository('relizy-canary-')
    cwd = repository.cwd
    process.chdir(cwd)
  })

  afterEach(() => {
    process.chdir(initialCwd)
    repository.remove()
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
