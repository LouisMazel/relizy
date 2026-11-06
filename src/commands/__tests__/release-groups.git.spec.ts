import type { GitRepository } from '../../../tests/git-repository'
import type { PackageBase } from '../../types'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { logger } from '@maz-ui/node'
import { createGitRepository } from '../../../tests/git-repository'
import { setInteractiveTerminal } from '../../../tests/mocks'
import { loadRelizyConfig, RelizyCancelError } from '../../core'
import { isVersionPublished, publishPackage } from '../../core/npm'
import { askConfirm } from '../../core/prompts'
import { bump, planBumps } from '../bump'
import { release } from '../release'

// The setup file mocks execPromise: these tests run the real git commands against a temporary repository
vi.mock('@maz-ui/node', importActual => importActual())

vi.mock('../../core/prompts', () => ({ askConfirm: vi.fn(), assertInteractivePrompt: vi.fn(), BUMP_NOT_INTERACTIVE: '' }))

// Only the registry is mocked: publishing and querying the published versions
vi.mock('../../core/npm', async (importActual) => {
  const actual = await importActual<typeof import('../../core/npm')>()
  return {
    ...actual,
    publishPackage: vi.fn(),
    isVersionPublished: vi.fn(),
  }
})

/**
 * Integration tests of a release with version groups, against a real git
 * repository: the scenario of two version lines released together, a selective
 * group (`main`) and an independent group (`header`) whose packages have peer
 * dependencies on the packages of the first one.
 */
describe('Given a release with version groups on a real git repository', () => {
  let repository: GitRepository
  let cwd: string
  let initialCwd: string
  /**
   * Versions of the dependencies of `@scope/nav` on disk, read when each package is published
   */
  let publishedPackages: { name: string, version: string, componentsVersionOnDisk: string, dryRun: boolean }[]

  function git(...args: string[]) {
    return repository.git(...args)
  }

  function writeJson(path: string, content: Record<string, unknown>) {
    repository.writeJson(path, content)
  }

  function readVersion(path: string): string {
    return JSON.parse(readFileSync(join(cwd, path, 'package.json'), 'utf8')).version
  }

  function commitFile(path: string, message: string) {
    repository.commit(message, { [path]: `${message}\n` })
  }

  function writeConfig({ headerOptions = '', options = '' }: { headerOptions?: string, options?: string } = {}) {
    writeFileSync(join(cwd, 'relizy.config.mjs'), `export default {
  ${options}
  logLevel: 'silent',
  safetyCheck: false,
  noAuthors: true,
  publish: { packageManager: 'pnpm', registry: 'https://registry.npmjs.org/' },
  release: { push: false, providerRelease: false, social: false, prComment: false },
  monorepo: {
    groups: [
      { name: 'main', versionMode: 'selective', packages: ['packages/*', 'shared/*'] },
      { name: 'header', versionMode: 'independent', packages: ['shared/nav', 'shared/login'], changelog: { rootChangelog: false }${headerOptions} },
    ],
  },
}
`)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    initialCwd = process.cwd()
    repository = createGitRepository('relizy-release-groups-')
    cwd = repository.cwd

    writeJson('.', { name: 'monorepo', version: '6.19.1', private: true })
    writeJson('packages/components', { name: '@scope/components', version: '6.19.1' })
    writeJson('packages/theme', { name: '@scope/theme', version: '6.18.0' })
    writeJson('shared/nav', {
      name: '@scope/nav',
      version: '1.2.0',
      peerDependencies: { '@scope/components': 'workspace:*', '@scope/theme': 'workspace:^' },
    })
    writeJson('shared/login', { name: '@scope/login', version: '2.0.0' })
    writeConfig()

    git('add', '-A')
    git('commit', '--no-verify', '-m', 'chore: init')
    git('tag', '-a', 'v6.19.1', '-m', 'v6.19.1')
    git('tag', '-a', '@scope/nav@1.2.0', '-m', '@scope/nav@1.2.0')
    git('tag', '-a', '@scope/login@2.0.0', '-m', '@scope/login@2.0.0')

    commitFile('packages/components/button.js', 'feat(components): add a button')
    // A breaking change in the independent group must not bump the major of the selective group
    commitFile('shared/nav/menu.js', 'feat(nav)!: new menu API')

    process.chdir(cwd)

    publishedPackages = []
    vi.mocked(publishPackage).mockImplementation(({ pkg, dryRun }: { pkg: PackageBase, dryRun: boolean }) => {
      publishedPackages.push({
        name: pkg.name,
        version: pkg.newVersion || pkg.version,
        componentsVersionOnDisk: readVersion('packages/components'),
        dryRun,
      })
      return Promise.resolve()
    })
    // The versions not published by the release (e.g. @scope/theme@6.18.0) are on the registry
    vi.mocked(isVersionPublished).mockResolvedValue(true)
  })

  afterEach(() => {
    process.chdir(initialCwd)
    repository.remove()
  })

  describe('When releasing stable versions', () => {
    it('Then bumps each group with its own version mode', async () => {
      await release({ yes: true })

      expect(readVersion('.')).toBe('6.20.0')
      expect(readVersion('packages/components')).toBe('6.20.0')
      expect(readVersion('packages/theme')).toBe('6.18.0')
      expect(readVersion('shared/nav')).toBe('2.0.0')
      expect(readVersion('shared/login')).toBe('2.0.0')
    })

    it('Then publishes the packages of both groups, each after its workspace dependencies', async () => {
      await release({ yes: true })

      expect(publishedPackages.map(({ name, version }) => `${name}@${version}`)).toEqual(['@scope/components@6.20.0', '@scope/nav@2.0.0'])
      // @scope/theme is not released: its version must be on the registry for the peer of @scope/nav
      expect(isVersionPublished).toHaveBeenCalledTimes(1)
      expect(isVersionPublished).toHaveBeenCalledWith(expect.objectContaining({ pkg: expect.objectContaining({ name: '@scope/theme' }), version: '6.18.0' }))
    })

    it('Then creates a single release commit with the tags of both groups', async () => {
      await release({ yes: true })

      expect(git('log', '-1', '--format=%B')).toBe('chore(release): bump version to 6.20.0\n\n@scope/components@6.20.0, @scope/nav@2.0.0')
      expect(git('rev-list', '--count', 'HEAD')).toBe('4')
      expect(git('tag', '--points-at', 'HEAD').split('\n').sort()).toEqual(['@scope/nav@2.0.0', 'v6.20.0'])
      expect(git('status', '--porcelain')).toBe('')
    })

    it('Then generates the changelogs of each group', async () => {
      await release({ yes: true })

      const rootChangelog = readFileSync(join(cwd, 'CHANGELOG.md'), 'utf8')
      const navChangelog = readFileSync(join(cwd, 'shared/nav/CHANGELOG.md'), 'utf8')

      expect(rootChangelog).toContain('## v6.19.1...v6.20.0')
      expect(rootChangelog).toContain('Add a button')
      // The commits of the independent group stay out of the root changelog of the selective group
      expect(rootChangelog).not.toContain('New menu API')
      // rootChangelog: false on the independent group
      expect(rootChangelog).not.toContain('Multiple Packages Updated')
      expect(navChangelog).toContain('## @scope/nav@1.2.0...@scope/nav@2.0.0')
      expect(navChangelog).toContain('New menu API')
      expect(existsSync(join(cwd, 'packages/components/CHANGELOG.md'))).toBe(true)
      expect(existsSync(join(cwd, 'shared/login/CHANGELOG.md'))).toBe(false)
    })

    it('Then only releases the group with new commits on the next release', async () => {
      await release({ yes: true })
      commitFile('shared/login/form.js', 'fix(login): fix the form')
      publishedPackages = []

      await release({ yes: true })

      expect(readVersion('.')).toBe('6.20.0')
      expect(readVersion('shared/login')).toBe('2.0.1')
      expect(publishedPackages.map(({ name, version }) => `${name}@${version}`)).toEqual(['@scope/login@2.0.1'])
      expect(git('log', '-1', '--format=%B')).toBe('chore(release): bump 1 packages\n\n@scope/login@2.0.1')
      expect(git('tag', '--points-at', 'HEAD')).toBe('@scope/login@2.0.1')
      expect(readFileSync(join(cwd, 'CHANGELOG.md'), 'utf8')).not.toContain('fix the form')
      // Two releases on a real repository: slow when the machine is loaded
    }, 30_000)

    it('Then starts the next release of each group from its own tags', async () => {
      await release({ yes: true })
      commitFile('shared/login/form.js', 'fix(login): fix the form')

      const result = await bump({ yes: true, dryRun: true })

      expect(result.bumped && result.groups!.map(group => group.name)).toEqual(['header'])
      expect(result.bumped && result.bumpedPackages.map(pkg => `${pkg.name}@${pkg.newVersion}`)).toEqual(['@scope/login@2.0.1'])
    })
  })

  describe('When releasing canary versions', () => {
    it('Then publishes the independent packages while the selective packages have their canary version on disk', async () => {
      await release({ canary: true, yes: true })

      const sha = git('rev-parse', '--short=7', 'HEAD')
      const components = publishedPackages.find(pkg => pkg.name === '@scope/components')!
      const nav = publishedPackages.find(pkg => pkg.name === '@scope/nav')!

      expect(components.version).toContain(sha)
      expect(nav.version).toContain(sha)
      // The peer `workspace:*` of @scope/nav is resolved by the package manager from this version
      expect(nav.componentsVersionOnDisk).toBe(components.version)
      expect(publishedPackages.map(pkg => pkg.name)).toEqual(['@scope/components', '@scope/nav'])
    })

    it('Then rolls back the versions once everything is published, without commit nor tag', async () => {
      await release({ canary: true, yes: true })

      expect(readVersion('packages/components')).toBe('6.19.1')
      expect(readVersion('shared/nav')).toBe('1.2.0')
      expect(git('status', '--porcelain')).toBe('')
      expect(git('rev-list', '--count', 'HEAD')).toBe('3')
      expect(git('tag', '--points-at', 'HEAD')).toBe('')
    })

    it('Then rolls back the versions without publishing either (--no-publish)', async () => {
      await release({ canary: true, yes: true, publish: false })

      expect(publishedPackages).toEqual([])
      expect(readVersion('packages/components')).toBe('6.19.1')
      expect(readVersion('shared/nav')).toBe('1.2.0')
      expect(git('status', '--porcelain')).toBe('')
    })
  })

  describe('When packages depend on packages of another group', () => {
    const FOLLOW_PEERS = `, bump: { dependencyTypes: ['dependencies', 'peerDependencies'] }`

    beforeEach(() => {
      // Only the commit of the selective group: @scope/nav has no commit of its own
      git('reset', '--hard', 'HEAD~1')
    })

    function commitConfig(headerOptions: string) {
      writeConfig({ headerOptions })
      git('add', '-A')
      git('commit', '--no-verify', '-m', 'chore: update the config')
    }

    it('Then bumps the independent dependents of the packages of the selective group', async () => {
      commitConfig(FOLLOW_PEERS)

      await release({ yes: true })

      expect(readVersion('packages/components')).toBe('6.20.0')
      expect(readVersion('shared/nav')).toBe('1.2.1')
      expect(readVersion('shared/login')).toBe('2.0.0')
      expect(publishedPackages.map(({ name, version }) => `${name}@${version}`)).toEqual(['@scope/components@6.20.0', '@scope/nav@1.2.1'])
      expect(git('tag', '--points-at', 'HEAD').split('\n').sort()).toEqual(['@scope/nav@1.2.1', 'v6.20.0'])
      expect(git('log', '-1', '--format=%B')).toBe('chore(release): bump version to 6.20.0\n\n@scope/components@6.20.0, @scope/nav@1.2.1')
    })

    it('Then bumps the selective group for a package depending on a package of an independent group', async () => {
      // No commit of the selective group either
      git('reset', '--hard', 'HEAD~1')
      writeJson('packages/app', { name: '@scope/app', version: '6.19.1', dependencies: { '@scope/login': 'workspace:^' } })
      git('add', '-A')
      git('commit', '--no-verify', '-m', 'chore: add the app')
      commitFile('shared/login/form.js', 'fix(login): fix the form')

      await release({ yes: true })

      // No commit of the selective group: its root version gets a patch for its dependent
      expect(readVersion('.')).toBe('6.19.2')
      expect(readVersion('packages/app')).toBe('6.19.2')
      expect(readVersion('packages/components')).toBe('6.19.1')
      expect(readVersion('shared/login')).toBe('2.0.1')
      expect(publishedPackages.map(({ name, version }) => `${name}@${version}`)).toEqual(['@scope/login@2.0.1', '@scope/app@6.19.2'])
      expect(git('tag', '--points-at', 'HEAD').split('\n').sort()).toEqual(['@scope/login@2.0.1', 'v6.19.2'])
    })

    it('Then checks the peer ranges with the root version of a selective group bumped for its dependents only', async () => {
      git('reset', '--hard', 'HEAD~1')
      // @scope/app has its own version: bumped for @scope/login, it gets the root version 6.19.2, out of the range "^1.5.0" of @scope/kit
      writeJson('packages/app', { name: '@scope/app', version: '1.5.0', dependencies: { '@scope/login': 'workspace:^' } })
      writeJson('packages/kit', { name: '@scope/kit', version: '6.19.1', peerDependencies: { '@scope/app': 'workspace:^' } })
      git('add', '-A')
      git('commit', '--no-verify', '-m', 'chore: add the app and the kit')
      commitFile('shared/login/form.js', 'fix(login): fix the form')

      await release({ yes: true })

      expect(readVersion('packages/app')).toBe('6.19.2')
      expect(readVersion('packages/kit')).toBe('6.19.2')
    })

    it('Then bumps every package of a unified group for a dependent of an independent group', async () => {
      git('reset', '--hard', 'HEAD~1')
      writeJson('packages/app', { name: '@scope/app', version: '6.19.1', dependencies: { '@scope/login': 'workspace:^' } })
      writeFileSync(join(cwd, 'relizy.config.mjs'), readFileSync(join(cwd, 'relizy.config.mjs'), 'utf8').replace(`versionMode: 'selective'`, `versionMode: 'unified'`))
      git('add', '-A')
      git('commit', '--no-verify', '-m', 'chore: unified app')
      commitFile('shared/login/form.js', 'fix(login): fix the form')

      await release({ yes: true })

      expect(readVersion('.')).toBe('6.19.2')
      expect(readVersion('packages/app')).toBe('6.19.2')
      expect(readVersion('packages/components')).toBe('6.19.2')
      expect(readVersion('packages/theme')).toBe('6.19.2')
      expect(readVersion('shared/login')).toBe('2.0.1')
    })

    it('Then follows the dependencies back and forth between the groups', async () => {
      // @scope/app (main) depends on @scope/nav (header), which has a peer dependency on @scope/components (main)
      writeJson('packages/app', { name: '@scope/app', version: '6.19.1', dependencies: { '@scope/nav': 'workspace:*' } })
      commitConfig(FOLLOW_PEERS)

      await release({ yes: true })

      expect(readVersion('packages/components')).toBe('6.20.0')
      expect(readVersion('shared/nav')).toBe('1.2.1')
      expect(readVersion('packages/app')).toBe('6.20.0')
      expect(publishedPackages.map(({ name }) => name)).toEqual(['@scope/components', '@scope/nav', '@scope/app'])
    })

    it('Then publishes the canary versions of the dependents', async () => {
      commitConfig(FOLLOW_PEERS)

      await release({ canary: true, yes: true })

      const components = publishedPackages.find(pkg => pkg.name === '@scope/components')!
      const nav = publishedPackages.find(pkg => pkg.name === '@scope/nav')!

      expect(nav.version).toMatch(/^1\.2\.1-0\.canary-/)
      expect(nav.componentsVersionOnDisk).toBe(components.version)
      expect(git('status', '--porcelain')).toBe('')
    })
  })

  describe('When the published range of a peer dependency rejects the new version', () => {
    beforeEach(() => {
      // Only the commit of @scope/components: @scope/nav has no commit of its own
      git('reset', '--hard', 'HEAD~1')
    })

    function commitChanges(message: string, changes: () => void) {
      changes()
      git('add', '-A')
      git('commit', '--no-verify', '-m', message)
    }

    it('Then bumps the packages with a workspace:* peer dependency, in every group, without following the peer dependencies', async () => {
      // @scope/kit is in the selective group, @scope/nav in the independent one
      commitChanges('chore: add the kit', () => writeJson('packages/kit', { name: '@scope/kit', version: '6.19.1', peerDependencies: { '@scope/components': 'workspace:*' } }))

      await release({ yes: true })

      expect(readVersion('packages/components')).toBe('6.20.0')
      expect(readVersion('packages/kit')).toBe('6.20.0')
      expect(readVersion('shared/nav')).toBe('1.2.1')
      expect(publishedPackages.map(({ name }) => name)).toEqual(['@scope/components', '@scope/kit', '@scope/nav'])
    })

    it('Then planBumps reports the rejecting peer dependency of each group without writing anything', async () => {
      const config = await loadRelizyConfig()

      const { result, plans, groups } = await planBumps({ config, dryRun: true })
      const nav = result.bumped ? result.bumpedPackages.find(pkg => pkg.name === '@scope/nav') : undefined

      expect(nav).toEqual(expect.objectContaining({ newVersion: '1.2.1', reason: 'dependency', dependencyChain: ['@scope/components'], outOfRangePeer: '@scope/components' }))
      expect(groups?.map(({ group, result }) => [group.name, result.bumped])).toEqual([['main', true], ['header', true]])
      expect(plans.map(plan => plan.result)).toEqual(groups?.map(group => group.result))
      expect(readVersion('packages/components')).toBe('6.19.1')
      expect(readVersion('shared/nav')).toBe('1.2.0')
      expect(git('status', '--porcelain')).toBe('')
      expect(askConfirm).not.toHaveBeenCalled()
    })

    it('Then does not bump a package whose workspace:^ range accepts the new version', async () => {
      commitChanges('chore: caret peer', () => writeJson('shared/nav', { name: '@scope/nav', version: '1.2.0', peerDependencies: { '@scope/components': 'workspace:^' } }))
      const warn = vi.spyOn(logger, 'warn')

      await release({ yes: true })

      expect(readVersion('shared/nav')).toBe('1.2.0')
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('do not accept'))
      warn.mockRestore()
    })

    describe('When the dependency makes a breaking change', () => {
      function setupNav({ version = '1.2.0', headerOptions = '' }: { version?: string, headerOptions?: string } = {}) {
        git('reset', '--hard', 'HEAD~1')
        commitChanges('chore: caret peer', () => {
          writeJson('shared/nav', { name: '@scope/nav', version, peerDependencies: { '@scope/components': 'workspace:^' } })
          writeConfig({ headerOptions })
        })
        commitFile('packages/components/button.js', 'feat(components)!: new button API')
      }

      it('Then bumps the major of a package out of its workspace:^ range', async () => {
        setupNav()

        await release({ yes: true })

        expect(readVersion('packages/components')).toBe('7.0.0')
        expect(readVersion('shared/nav')).toBe('2.0.0')
      })

      it('Then bumps the major of a package with commits of its own', async () => {
        setupNav()
        commitFile('shared/nav/menu.js', 'fix(nav): fix the menu')

        await release({ yes: true })

        expect(readVersion('shared/nav')).toBe('2.0.0')
      })

      it('Then bumps the major of a package released while outOfRangePeers is warn', async () => {
        setupNav()
        commitChanges('chore: warn', () => writeConfig({ options: `bump: { outOfRangePeers: 'warn' },` }))
        commitFile('shared/nav/menu.js', 'fix(nav): fix the menu')

        await release({ yes: true })

        expect(readVersion('shared/nav')).toBe('2.0.0')
      })

      it('Then bumps the major of a package following its peer dependencies', async () => {
        setupNav({ headerOptions: `, bump: { dependencyTypes: ['dependencies', 'peerDependencies'] }` })

        await release({ yes: true })

        expect(readVersion('shared/nav')).toBe('2.0.0')
      })

      it('Then bumps the minor of a 0.x package', async () => {
        setupNav({ version: '0.2.18' })

        await release({ yes: true })

        expect(readVersion('shared/nav')).toBe('0.3.0')
      })

      it('Then bumps the major of a 0.x package with capZeroMajor: false', async () => {
        setupNav({ version: '0.2.18', headerOptions: ', bump: { capZeroMajor: false }' })

        await release({ yes: true })

        expect(readVersion('shared/nav')).toBe('1.0.0')
      })

      it('Then bumps the premajor of a package for a prerelease', async () => {
        setupNav()

        await release({ yes: true, type: 'prerelease', preid: 'beta' })

        expect(readVersion('packages/components')).toBe('7.0.0-beta.0')
        expect(readVersion('shared/nav')).toBe('2.0.0-beta.0')
      })

      it('Then keeps a patch for a dependency released without breaking change', async () => {
        git('reset', '--hard', 'HEAD~1')
        commitFile('packages/components/button.js', 'feat(components): add a button')

        await release({ yes: true })

        expect(readVersion('packages/components')).toBe('6.20.0')
        expect(readVersion('shared/nav')).toBe('1.2.1')
      })
    })

    describe('When a package of the selective group has a peer dependency on a package of the independent group making a breaking change', () => {
      beforeEach(() => {
        commitChanges('chore: add the kit', () => writeJson('packages/kit', { name: '@scope/kit', version: '6.19.1', peerDependencies: { '@scope/login': 'workspace:^' } }))
        commitFile('shared/login/form.js', 'feat(login)!: new form API')
      })

      it('Then bumps the major of the root version of the selective group', async () => {
        await release({ yes: true })

        expect(readVersion('shared/login')).toBe('3.0.0')
        expect(readVersion('.')).toBe('7.0.0')
        expect(readVersion('packages/components')).toBe('7.0.0')
        expect(readVersion('packages/kit')).toBe('7.0.0')
        // The peer dependency `workspace:*` of @scope/nav rejects the major of @scope/components
        expect(readVersion('shared/nav')).toBe('2.0.0')
      })

      it('Then bumps the major of a unified group', async () => {
        commitChanges('chore: unified', () => writeFileSync(join(cwd, 'relizy.config.mjs'), readFileSync(join(cwd, 'relizy.config.mjs'), 'utf8').replace(`versionMode: 'selective'`, `versionMode: 'unified'`)))

        await release({ yes: true })

        expect(readVersion('.')).toBe('7.0.0')
        expect(readVersion('packages/theme')).toBe('7.0.0')
        expect(readVersion('packages/kit')).toBe('7.0.0')
      })

      it('Then publishes a major canary of the selective group', async () => {
        await release({ canary: true, yes: true })

        const components = publishedPackages.find(pkg => pkg.name === '@scope/components')!
        const kit = publishedPackages.find(pkg => pkg.name === '@scope/kit')!

        expect(components.version).toMatch(/^7\.0\.0-0\.canary-/)
        expect(kit.version).toBe(components.version)
      })
    })

    it('Then publishes a major canary of a package whose peer dependency makes a breaking change', async () => {
      git('reset', '--hard', 'HEAD~1')
      commitChanges('chore: caret peer', () => writeJson('shared/nav', { name: '@scope/nav', version: '1.2.0', peerDependencies: { '@scope/components': 'workspace:^' } }))
      commitFile('packages/components/button.js', 'feat(components)!: new button API')

      await release({ canary: true, yes: true })

      const nav = publishedPackages.find(pkg => pkg.name === '@scope/nav')!

      expect(nav.version).toMatch(/^2\.0\.0-0\.canary-/)
    })

    it('Then publishes the canary version of a package whose workspace:^ range rejects the canary of its dependency', async () => {
      commitChanges('chore: caret peer', () => writeJson('shared/nav', { name: '@scope/nav', version: '1.2.0', peerDependencies: { '@scope/components': 'workspace:^' } }))

      await release({ canary: true, yes: true })

      const components = publishedPackages.find(pkg => pkg.name === '@scope/components')!
      const nav = publishedPackages.find(pkg => pkg.name === '@scope/nav')!

      expect(components.version).toMatch(/^6\.20\.0-0\.canary-/)
      expect(nav.version).toMatch(/^1\.2\.1-0\.canary-/)
      expect(nav.componentsVersionOnDisk).toBe(components.version)
    })

    it('Then only warns with outOfRangePeers: warn', async () => {
      commitChanges('chore: warn', () => writeConfig({ options: `bump: { outOfRangePeers: 'warn' },` }))
      const warn = vi.spyOn(logger, 'warn')

      await release({ yes: true })

      expect(readVersion('shared/nav')).toBe('1.2.0')
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('@scope/nav: @scope/components "6.19.1" does not accept 6.20.0'))
      warn.mockRestore()
    })

    it('Then fails before publishing with outOfRangePeers: error', async () => {
      commitChanges('chore: error', () => writeConfig({ options: `bump: { outOfRangePeers: 'error' },` }))

      await expect(release({ yes: true })).rejects.toThrow('@scope/nav: @scope/components "6.19.1" does not accept 6.20.0')

      expect(publishPackage).not.toHaveBeenCalled()
      expect(git('status', '--porcelain')).toBe('')
    })

    it('Then warns about the packages of the groups not released', async () => {
      const warn = vi.spyOn(logger, 'warn')

      await release({ yes: true, groups: ['main'] })

      expect(readVersion('shared/nav')).toBe('1.2.0')
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('@scope/nav: @scope/components "6.19.1" does not accept 6.20.0'))
      warn.mockRestore()
    })
  })

  describe('When confirming the bump', () => {
    let restoreTerminal: () => void

    // Someone answers the prompt in a terminal
    beforeEach(() => {
      restoreTerminal = setInteractiveTerminal(true)
    })

    afterEach(() => {
      restoreTerminal()
    })

    it('Then displays every group, by title, and asks once', async () => {
      writeConfig({ headerOptions: ', title: \'Header\'' })
      git('add', '-A')
      git('commit', '--no-verify', '-m', 'chore: update the config')
      const log = vi.spyOn(logger, 'log')
      vi.mocked(askConfirm).mockResolvedValueOnce(true)

      await bump({})

      const logged = log.mock.calls.map(([message]) => String(message))
      expect(askConfirm).toHaveBeenCalledTimes(1)
      expect(logged).toContain('main (selective mode)')
      expect(logged).toContain('Header (independent mode)')
      expect(logged.indexOf('main (selective mode)')).toBeLessThan(logged.indexOf('Header (independent mode)'))
      log.mockRestore()
    })

    it('Then writes nothing when refused', async () => {
      vi.mocked(askConfirm).mockResolvedValueOnce(false)

      await expect(bump({})).rejects.toThrow(RelizyCancelError)

      expect(askConfirm).toHaveBeenCalledTimes(1)
      expect(git('status', '--porcelain')).toBe('')
      expect(readVersion('packages/components')).toBe('6.19.1')
      expect(readVersion('shared/nav')).toBe('1.2.0')
    })
  })

  describe('When the working directory has uncommitted changes (--no-clean)', () => {
    const untrackedPackage = 'packages/draft/package.json'
    let changedFiles: Record<string, string>

    function readFiles(paths: string[]): Record<string, string> {
      return Object.fromEntries(paths.map(path => [path, readFileSync(join(cwd, path), 'utf8')]))
    }

    beforeEach(() => {
      // An uncommitted change in a package bumped by the release, another in a package not bumped
      writeJson('packages/components', { name: '@scope/components', version: '6.19.1', description: 'uncommitted' })
      writeJson('packages/theme', { name: '@scope/theme', version: '6.18.0', keywords: ['uncommitted'] })
      writeJson('packages/draft', { name: '@scope/draft', version: '0.0.0', private: true })
      changedFiles = readFiles(['packages/components/package.json', 'packages/theme/package.json', untrackedPackage])
    })

    it('Then keeps them after a canary, restoring only the versions it wrote', async () => {
      await release({ canary: true, yes: true, clean: false })

      expect(publishedPackages.map(({ name }) => name)).toEqual(['@scope/components', '@scope/nav'])
      expect(readFiles(Object.keys(changedFiles))).toEqual(changedFiles)
      expect(readVersion('shared/nav')).toBe('1.2.0')
    })

    it('Then keeps them with bump.clean: false in the config, as with --no-clean', async () => {
      writeConfig({ options: 'bump: { clean: false },' })

      await expect(release({ yes: true, dryRun: true })).resolves.toMatchObject({ status: 'released' })
    })

    it('Then leaves every file untouched in dry-run', async () => {
      const files = ['package.json', 'shared/nav/package.json', ...Object.keys(changedFiles)]
      const before = readFiles(files)

      await release({ canary: true, yes: true, clean: false, dryRun: true })
      await release({ yes: true, clean: false, dryRun: true })

      expect(readFiles(files)).toEqual(before)
      expect(existsSync(join(cwd, 'CHANGELOG.md'))).toBe(false)
    })

    it('Then only commits the files written by the release', async () => {
      await release({ yes: true, clean: false })

      const committed = git('show', '--name-only', '--format=', 'HEAD').split('\n')

      expect(committed).toContain('packages/components/package.json')
      expect(committed).not.toContain('packages/theme/package.json')
      expect(committed).not.toContain(untrackedPackage)
      expect(readFiles(['packages/theme/package.json', untrackedPackage])).toEqual({
        'packages/theme/package.json': changedFiles['packages/theme/package.json'],
        [untrackedPackage]: changedFiles[untrackedPackage],
      })
      // A file written by the release is committed with the changes it contains
      expect(JSON.parse(readFileSync(join(cwd, 'packages/components/package.json'), 'utf8'))).toEqual({ name: '@scope/components', version: '6.20.0', description: 'uncommitted' })
    })

    it('Then restores them when the release fails before its commit', async () => {
      vi.mocked(publishPackage).mockRejectedValueOnce(new Error('registry down'))

      await expect(release({ yes: true, clean: false })).rejects.toThrow('registry down')

      expect(readFiles(Object.keys(changedFiles))).toEqual(changedFiles)
      expect(readVersion('shared/nav')).toBe('1.2.0')
      expect(git('status', '--porcelain', '--', 'CHANGELOG.md', 'shared/nav')).toBe('')
    })
  })

  describe('When releasing a single group', () => {
    it('Then only releases the packages of that group', async () => {
      await release({ yes: true, groups: ['header'] })

      expect(readVersion('.')).toBe('6.19.1')
      expect(readVersion('packages/components')).toBe('6.19.1')
      expect(readVersion('shared/nav')).toBe('2.0.0')
      expect(publishedPackages.map(pkg => pkg.name)).toEqual(['@scope/nav'])
      expect(git('log', '-1', '--format=%B')).toBe('chore(release): bump 1 packages\n\n@scope/nav@2.0.0')
      expect(git('tag', '--points-at', 'HEAD')).toBe('@scope/nav@2.0.0')
    })
  })

  describe('When running a dry run', () => {
    it('Then writes nothing and checks the workspace dependencies against the planned versions', async () => {
      await release({ yes: true, dryRun: true })

      expect(git('status', '--porcelain')).toBe('')
      expect(git('rev-list', '--count', 'HEAD')).toBe('3')
      expect(publishedPackages.map(({ name, version, dryRun }) => `${name}@${version}:${dryRun}`)).toEqual(['@scope/components@6.20.0:true', '@scope/nav@2.0.0:true'])
      // @scope/components@6.20.0 is planned by the run, only @scope/theme is checked on the registry
      expect(isVersionPublished).toHaveBeenCalledTimes(1)
    })
  })

  describe('When a workspace dependency resolves to a version missing from the registry', () => {
    it('Then fails before publishing anything and rolls back the release files', async () => {
      writeJson('shared/internal', { name: '@scope/internal', version: '0.1.0', private: true })
      writeJson('shared/login', { name: '@scope/login', version: '2.0.0', dependencies: { '@scope/internal': 'workspace:*' } })
      git('add', '-A')
      git('commit', '--no-verify', '-m', 'fix(login): use the internal package')
      vi.mocked(isVersionPublished).mockImplementation(({ pkg }) => Promise.resolve(pkg.name !== '@scope/internal'))

      await expect(release({ yes: true })).rejects.toThrow('@scope/login (dependencies): @scope/internal@0.1.0')

      expect(publishPackage).not.toHaveBeenCalled()
      expect(git('status', '--porcelain')).toBe('')
      expect(git('tag', '--points-at', 'HEAD')).toBe('')
    })
  })

  describe('When a package is matched by two globs of different groups', () => {
    it('Then fails before bumping anything', async () => {
      const config = readFileSync(join(cwd, 'relizy.config.mjs'), 'utf8')
      writeFileSync(join(cwd, 'relizy.config.mjs'), config.replace(`['shared/nav', 'shared/login']`, `['shared/*']`))
      git('add', '-A')
      git('commit', '--no-verify', '-m', 'chore: overlapping groups')

      await expect(bump({ yes: true })).rejects.toThrow('is matched by several version groups (main, header)')

      expect(git('status', '--porcelain')).toBe('')
    })
  })
})
