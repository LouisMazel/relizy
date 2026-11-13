import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { commitFile, git, readVersion, releaseRepo, useReleaseGroupsRepository, writeConfig, writeJson } from '../../../tests/release-groups'
import { isVersionPublished } from '../../core/npm-versions'
import { bump } from '../bump'
import { release } from '../release'

// The setup file mocks execPromise: these tests run the real git commands against a temporary repository
vi.mock('@maz-ui/node', importActual => importActual())

vi.mock('../../core/prompts', () => ({
  askConfirm: vi.fn(),
  assertInteractivePrompt: vi.fn(),
  BUMP_NOT_INTERACTIVE: '',
}))

// Only the registry is mocked: publishing and querying the published versions
vi.mock('../../core/npm', async (importActual) => {
  const actual = await importActual<typeof import('../../core/npm')>()
  return {
    ...actual,
    publishPackage: vi.fn(),
  }
})

vi.mock('../../core/npm-versions', async (importActual) => {
  const actual = await importActual<typeof import('../../core/npm-versions')>()
  return {
    ...actual,
    isVersionPublished: vi.fn(),
  }
})

/**
 * Integration tests of a release with version groups, against a real git
 * repository (see `tests/release-groups.ts`): stable and canary releases, dependencies between the groups.
 */
describe('Given a release with version groups on a real git repository', () => {
  useReleaseGroupsRepository()

  describe('When an application validates the plan with onConfirm', () => {
    it('Then gives every package of both groups with its group and the tag of its release', async () => {
      const onConfirm = vi.fn().mockReturnValue(true)

      await release({ dryRun: true, onConfirm })

      expect(onConfirm).toHaveBeenCalledTimes(1)
      expect(onConfirm.mock.calls[0]![0].packages).toEqual([
        {
          name: '@scope/components',
          path: 'packages/components',
          private: false,
          oldVersion: '6.19.1',
          newVersion: '6.20.0',
          tag: 'v6.20.0',
          group: 'main',
          reason: 'commits',
        },
        {
          name: '@scope/nav',
          path: 'shared/nav',
          private: false,
          oldVersion: '1.2.0',
          newVersion: '2.0.0',
          tag: '@scope/nav@2.0.0',
          group: 'header',
          reason: 'commits',
        },
      ])
    })
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

      expect(releaseRepo.publishedPackages.map(({ name, version }) => `${name}@${version}`)).toEqual(['@scope/components@6.20.0', '@scope/nav@2.0.0'])
      // @scope/theme is not released: its version must be on the registry for the peer of @scope/nav
      expect(isVersionPublished).toHaveBeenCalledTimes(1)
      expect(isVersionPublished).toHaveBeenCalledWith(expect.objectContaining({
        pkg: expect.objectContaining({ name: '@scope/theme' }),
        version: '6.18.0',
      }))
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

      const rootChangelog = readFileSync(join(releaseRepo.cwd, 'CHANGELOG.md'), 'utf8')
      const navChangelog = readFileSync(join(releaseRepo.cwd, 'shared/nav/CHANGELOG.md'), 'utf8')

      expect(rootChangelog).toContain('## v6.19.1...v6.20.0')
      expect(rootChangelog).toContain('Add a button')
      // The commits of the independent group stay out of the root changelog of the selective group
      expect(rootChangelog).not.toContain('New menu API')
      // rootChangelog: false on the independent group
      expect(rootChangelog).not.toContain('Multiple Packages Updated')
      expect(navChangelog).toContain('## @scope/nav@1.2.0...@scope/nav@2.0.0')
      expect(navChangelog).toContain('New menu API')
      expect(existsSync(join(releaseRepo.cwd, 'packages/components/CHANGELOG.md'))).toBe(true)
      expect(existsSync(join(releaseRepo.cwd, 'shared/login/CHANGELOG.md'))).toBe(false)
    })

    it('Then only releases the group with new commits on the next release', async () => {
      await release({ yes: true })
      commitFile('shared/login/form.js', 'fix(login): fix the form')
      releaseRepo.publishedPackages = []

      await release({ yes: true })

      expect(readVersion('.')).toBe('6.20.0')
      expect(readVersion('shared/login')).toBe('2.0.1')
      expect(releaseRepo.publishedPackages.map(({ name, version }) => `${name}@${version}`)).toEqual(['@scope/login@2.0.1'])
      expect(git('log', '-1', '--format=%B')).toBe('chore(release): bump 1 packages\n\n@scope/login@2.0.1')
      expect(git('tag', '--points-at', 'HEAD')).toBe('@scope/login@2.0.1')
      expect(readFileSync(join(releaseRepo.cwd, 'CHANGELOG.md'), 'utf8')).not.toContain('fix the form')
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
      const components = releaseRepo.publishedPackages.find(pkg => pkg.name === '@scope/components')!
      const nav = releaseRepo.publishedPackages.find(pkg => pkg.name === '@scope/nav')!

      expect(components.version).toContain(sha)
      expect(nav.version).toContain(sha)
      // The peer `workspace:*` of @scope/nav is resolved by the package manager from this version
      expect(nav.componentsVersionOnDisk).toBe(components.version)
      expect(releaseRepo.publishedPackages.map(pkg => pkg.name)).toEqual(['@scope/components', '@scope/nav'])
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

      expect(releaseRepo.publishedPackages).toEqual([])
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
      expect(releaseRepo.publishedPackages.map(({ name, version }) => `${name}@${version}`)).toEqual(['@scope/components@6.20.0', '@scope/nav@1.2.1'])
      expect(git('tag', '--points-at', 'HEAD').split('\n').sort()).toEqual(['@scope/nav@1.2.1', 'v6.20.0'])
      expect(git('log', '-1', '--format=%B')).toBe('chore(release): bump version to 6.20.0\n\n@scope/components@6.20.0, @scope/nav@1.2.1')
    })

    it('Then bumps the selective group for a package depending on a package of an independent group', async () => {
      // No commit of the selective group either
      git('reset', '--hard', 'HEAD~1')
      writeJson('packages/app', {
        name: '@scope/app',
        version: '6.19.1',
        dependencies: { '@scope/login': 'workspace:*' },
      })
      git('add', '-A')
      git('commit', '--no-verify', '-m', 'chore: add the app')
      commitFile('shared/login/form.js', 'fix(login): fix the form')

      await release({ yes: true })

      // No commit of the selective group: its root version gets a patch for its dependent
      expect(readVersion('.')).toBe('6.19.2')
      expect(readVersion('packages/app')).toBe('6.19.2')
      expect(readVersion('packages/components')).toBe('6.19.1')
      expect(readVersion('shared/login')).toBe('2.0.1')
      expect(releaseRepo.publishedPackages.map(({ name, version }) => `${name}@${version}`)).toEqual(['@scope/login@2.0.1', '@scope/app@6.19.2'])
      expect(git('tag', '--points-at', 'HEAD').split('\n').sort()).toEqual(['@scope/login@2.0.1', 'v6.19.2'])
    })

    it('Then checks the peer ranges with the root version of a selective group bumped for its dependents only', async () => {
      git('reset', '--hard', 'HEAD~1')
      // @scope/app has its own version: bumped for @scope/login, it gets the root version 6.19.2, out of the range "^1.5.0" of @scope/kit
      writeJson('packages/app', {
        name: '@scope/app',
        version: '1.5.0',
        dependencies: { '@scope/login': 'workspace:*' },
      })
      writeJson('packages/kit', {
        name: '@scope/kit',
        version: '6.19.1',
        peerDependencies: { '@scope/app': 'workspace:^' },
      })
      git('add', '-A')
      git('commit', '--no-verify', '-m', 'chore: add the app and the kit')
      commitFile('shared/login/form.js', 'fix(login): fix the form')

      await release({ yes: true })

      expect(readVersion('packages/app')).toBe('6.19.2')
      expect(readVersion('packages/kit')).toBe('6.19.2')
    })

    it('Then bumps every package of a unified group for a dependent of an independent group', async () => {
      git('reset', '--hard', 'HEAD~1')
      writeJson('packages/app', {
        name: '@scope/app',
        version: '6.19.1',
        dependencies: { '@scope/login': 'workspace:*' },
      })
      writeFileSync(join(releaseRepo.cwd, 'relizy.config.mjs'), readFileSync(join(releaseRepo.cwd, 'relizy.config.mjs'), 'utf8').replace(`versionMode: 'selective'`, `versionMode: 'unified'`))
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
      writeJson('packages/app', {
        name: '@scope/app',
        version: '6.19.1',
        dependencies: { '@scope/nav': 'workspace:*' },
      })
      commitConfig(FOLLOW_PEERS)

      await release({ yes: true })

      expect(readVersion('packages/components')).toBe('6.20.0')
      expect(readVersion('shared/nav')).toBe('1.2.1')
      expect(readVersion('packages/app')).toBe('6.20.0')
      expect(releaseRepo.publishedPackages.map(({ name }) => name)).toEqual(['@scope/components', '@scope/nav', '@scope/app'])
    })

    it('Then publishes the canary versions of the dependents', async () => {
      commitConfig(FOLLOW_PEERS)

      await release({ canary: true, yes: true })

      const components = releaseRepo.publishedPackages.find(pkg => pkg.name === '@scope/components')!
      const nav = releaseRepo.publishedPackages.find(pkg => pkg.name === '@scope/nav')!

      expect(nav.version).toMatch(/^1\.2\.1-0\.canary-/)
      expect(nav.componentsVersionOnDisk).toBe(components.version)
      expect(git('status', '--porcelain')).toBe('')
    })
  })
})
