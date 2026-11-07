import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '@maz-ui/node'
import { commitFile, git, readVersion, releaseRepo, useReleaseGroupsRepository, writeConfig, writeJson } from '../../../tests/release-groups'
import { loadRelizyConfig } from '../../core'
import { publishPackage } from '../../core/npm'
import { askConfirm } from '../../core/prompts'
import { planBumps } from '../bump'
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
 * repository (see `tests/release-groups.ts`): the published ranges of the peer dependencies.
 */
describe('Given a release with version groups on a real git repository', () => {
  useReleaseGroupsRepository()

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
      expect(releaseRepo.publishedPackages.map(({ name }) => name)).toEqual(['@scope/components', '@scope/kit', '@scope/nav'])
    })

    it('Then planBumps reports the rejecting peer dependency of each group without writing anything', async () => {
      const config = await loadRelizyConfig()

      const { result, plans, groups } = await planBumps({ config, dryRun: true })
      const nav = result.bumped ? result.bumpedPackages.find(pkg => pkg.name === '@scope/nav') : undefined

      expect(nav).toEqual(expect.objectContaining({ newVersion: '1.2.1', reason: 'dependency', dependencyChain: ['@scope/components'], outOfRangeDependency: { name: '@scope/components', field: 'peerDependencies', range: '6.19.1', newVersion: '6.20.0' } }))
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

    describe('When a package depends on a package of another group with bump.dependents: out-of-range', () => {
      beforeEach(() => {
        commitChanges('chore: caret dependency', () => {
          writeJson('shared/nav', { name: '@scope/nav', version: '1.2.0', dependencies: { '@scope/components': 'workspace:^' } })
          writeConfig({ headerOptions: `, bump: { dependents: 'out-of-range' }` })
        })
      })

      it('Then does not release the package whose published range accepts the new version', async () => {
        await release({ yes: true })

        expect(readVersion('packages/components')).toBe('6.20.0')
        expect(readVersion('shared/nav')).toBe('1.2.0')
      })

      it('Then releases a patch of the package whose published range rejects a major', async () => {
        commitFile('packages/components/card.js', 'feat(components)!: new card API')

        await release({ yes: true })

        expect(readVersion('packages/components')).toBe('7.0.0')
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
        commitChanges('chore: unified', () => writeFileSync(join(releaseRepo.cwd, 'relizy.config.mjs'), readFileSync(join(releaseRepo.cwd, 'relizy.config.mjs'), 'utf8').replace(`versionMode: 'selective'`, `versionMode: 'unified'`)))

        await release({ yes: true })

        expect(readVersion('.')).toBe('7.0.0')
        expect(readVersion('packages/theme')).toBe('7.0.0')
        expect(readVersion('packages/kit')).toBe('7.0.0')
      })

      it('Then publishes a major canary of the selective group', async () => {
        await release({ canary: true, yes: true })

        const components = releaseRepo.publishedPackages.find(pkg => pkg.name === '@scope/components')!
        const kit = releaseRepo.publishedPackages.find(pkg => pkg.name === '@scope/kit')!

        expect(components.version).toMatch(/^7\.0\.0-0\.canary-/)
        expect(kit.version).toBe(components.version)
      })
    })

    it('Then publishes a major canary of a package whose peer dependency makes a breaking change', async () => {
      git('reset', '--hard', 'HEAD~1')
      commitChanges('chore: caret peer', () => writeJson('shared/nav', { name: '@scope/nav', version: '1.2.0', peerDependencies: { '@scope/components': 'workspace:^' } }))
      commitFile('packages/components/button.js', 'feat(components)!: new button API')

      await release({ canary: true, yes: true })

      const nav = releaseRepo.publishedPackages.find(pkg => pkg.name === '@scope/nav')!

      expect(nav.version).toMatch(/^2\.0\.0-0\.canary-/)
    })

    it('Then publishes the canary version of a package whose workspace:^ range rejects the canary of its dependency', async () => {
      commitChanges('chore: caret peer', () => writeJson('shared/nav', { name: '@scope/nav', version: '1.2.0', peerDependencies: { '@scope/components': 'workspace:^' } }))

      await release({ canary: true, yes: true })

      const components = releaseRepo.publishedPackages.find(pkg => pkg.name === '@scope/components')!
      const nav = releaseRepo.publishedPackages.find(pkg => pkg.name === '@scope/nav')!

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
})
