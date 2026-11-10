import type { GitRepository } from '../../../../../tests/git-repository'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { createGitRepository } from '../../../../../tests/git-repository'
import { bump } from '../bump'

// The setup file mocks execPromise: these tests run the real git commands against a temporary repository
vi.mock('@maz-ui/node', importActual => importActual())

vi.mock('../../core/prompts', () => ({
  askConfirm: vi.fn(),
  assertInteractivePrompt: vi.fn(),
  BUMP_NOT_INTERACTIVE: '',
}))

/**
 * The root version of a `unified` or `selective` group only comes from the commits of its
 * packages: a commit changing the CI, a private app or the packages of another
 * group does not release the group (issue #196).
 */
describe.each(['unified', 'selective'] as const)('Given a %s group next to an independent group and a private app', (versionMode) => {
  let repository: GitRepository
  let initialCwd: string

  async function bumpedPackages() {
    const result = await bump({ dryRun: true, yes: true })

    return result.bumped
      ? result.bumpedPackages.map(pkg => `${pkg.name}@${pkg.newVersion}`).sort()
      : []
  }

  beforeEach(() => {
    initialCwd = process.cwd()
    repository = createGitRepository('relizy-root-commits-')

    repository.writeJson('.', { name: 'monorepo', version: '5.5.0', private: true })
    repository.writeJson('packages/lib', { name: 'lib', version: '5.5.0' })
    repository.writeJson('packages/utils', { name: 'utils', version: '5.5.0' })
    repository.writeJson('packages/eslint-config', { name: 'eslint-config', version: '1.0.0' })
    repository.writeJson('apps/docs', { name: 'docs', version: '0.0.0', private: true })
    writeFileSync(join(repository.cwd, 'relizy.config.mjs'), `export default {
logLevel: 'silent',
safetyCheck: false,
monorepo: {
  groups: [
    { name: 'ecosystem', versionMode: '${versionMode}', packages: ['packages/lib', 'packages/utils'] },
    { name: 'tooling', versionMode: 'independent', packages: ['packages/eslint-config'] },
  ],
},
}
`)
    repository.commit('chore: init')
    repository.git('tag', '-a', 'v5.5.0', '-m', 'v5.5.0')
    repository.git('tag', '-a', 'eslint-config@1.0.0', '-m', 'eslint-config@1.0.0')

    process.chdir(repository.cwd)
  })

  afterEach(() => {
    process.chdir(initialCwd)
    repository.remove()
  })

  describe('When a fix only changes a CI workflow', () => {
    it('Then nothing is released', async () => {
      repository.commit('fix(ci): run the linters on every branch', { '.github/workflows/linters.yml': 'on: push\n' })

      expect(await bumpedPackages()).toEqual([])
    })
  })

  describe('When a fix changes the private app and a package of the independent group', () => {
    it('Then only the package of the independent group is released', async () => {
      repository.commit('fix: share the lint rules with the docs', {
        'apps/docs/index.md': '# Docs\n',
        'packages/eslint-config/index.js': 'export default []\n',
      })

      expect(await bumpedPackages()).toEqual(['eslint-config@1.0.1'])
    })
  })

  describe('When a fix changes a package of the group', () => {
    it('Then the group is released with a patch', async () => {
      repository.commit('fix(utils): round the numbers', { 'packages/utils/index.js': 'export {}\n' })

      expect(await bumpedPackages()).toEqual(versionMode === 'unified'
        ? ['lib@5.5.1', 'utils@5.5.1']
        : ['utils@5.5.1'])
    })
  })

  describe('When a feat only changes a root script and a fix changes a package of the group', () => {
    it('Then the feat does not count: the group is released with a patch', async () => {
      repository.commit('feat: add a release script', { 'scripts/release.js': 'export {}\n' })
      repository.commit('fix(utils): round the numbers', { 'packages/utils/index.js': 'export {}\n' })

      expect(await bumpedPackages()).toEqual(versionMode === 'unified'
        ? ['lib@5.5.1', 'utils@5.5.1']
        : ['utils@5.5.1'])
    })
  })
})
