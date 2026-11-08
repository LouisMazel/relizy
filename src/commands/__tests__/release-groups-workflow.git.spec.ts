import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '@maz-ui/node'
import { setInteractiveTerminal } from '../../../tests/mocks'
import { git, readVersion, releaseRepo, useReleaseGroupsRepository, writeConfig, writeJson } from '../../../tests/release-groups'
import { RelizyCancelError } from '../../core'
import { publishPackage } from '../../core/npm'
import { isVersionPublished } from '../../core/npm-versions'
import { askConfirm } from '../../core/prompts'
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
 * repository (see `tests/release-groups.ts`): confirmation, uncommitted changes, targeted groups and dry run.
 */
describe('Given a release with version groups on a real git repository', () => {
  useReleaseGroupsRepository()

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
      return Object.fromEntries(paths.map(path => [
        path,
        readFileSync(join(releaseRepo.cwd, path), 'utf8'),
      ]))
    }

    beforeEach(() => {
      // An uncommitted change in a package bumped by the release, another in a package not bumped
      writeJson('packages/components', { name: '@scope/components', version: '6.19.1', description: 'uncommitted' })
      writeJson('packages/theme', {
        name: '@scope/theme',
        version: '6.18.0',
        keywords: ['uncommitted'],
      })
      writeJson('packages/draft', { name: '@scope/draft', version: '0.0.0', private: true })
      changedFiles = readFiles(['packages/components/package.json', 'packages/theme/package.json', untrackedPackage])
    })

    it('Then keeps them after a canary, restoring only the versions it wrote', async () => {
      await release({ canary: true, yes: true, clean: false })

      expect(releaseRepo.publishedPackages.map(({ name }) => name)).toEqual(['@scope/components', '@scope/nav'])
      expect(readFiles(Object.keys(changedFiles))).toEqual(changedFiles)
      expect(readVersion('shared/nav')).toBe('1.2.0')
    })

    it('Then keeps them with bump.clean: false in the config, as with --no-clean', async () => {
      writeConfig({ options: 'bump: { clean: false },' })

      await expect(release({ yes: true, dryRun: true })).resolves.toMatchObject({ status: 'released' })
    })

    it('Then leaves every file untouched in dry-run', async () => {
      const files = [
        'package.json',
        'shared/nav/package.json',
        ...Object.keys(changedFiles),
      ]
      const before = readFiles(files)

      await release({
        canary: true,
        yes: true,
        clean: false,
        dryRun: true,
      })
      await release({ yes: true, clean: false, dryRun: true })

      expect(readFiles(files)).toEqual(before)
      expect(existsSync(join(releaseRepo.cwd, 'CHANGELOG.md'))).toBe(false)
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
      expect(JSON.parse(readFileSync(join(releaseRepo.cwd, 'packages/components/package.json'), 'utf8'))).toEqual({ name: '@scope/components', version: '6.20.0', description: 'uncommitted' })
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
      await release({
        yes: true,
        groups: ['header'],
      })

      expect(readVersion('.')).toBe('6.19.1')
      expect(readVersion('packages/components')).toBe('6.19.1')
      expect(readVersion('shared/nav')).toBe('2.0.0')
      expect(releaseRepo.publishedPackages.map(pkg => pkg.name)).toEqual(['@scope/nav'])
      expect(git('log', '-1', '--format=%B')).toBe('chore(release): bump 1 packages\n\n@scope/nav@2.0.0')
      expect(git('tag', '--points-at', 'HEAD')).toBe('@scope/nav@2.0.0')
    })
  })

  describe('When running a dry run', () => {
    it('Then writes nothing and checks the workspace dependencies against the planned versions', async () => {
      await release({ yes: true, dryRun: true })

      expect(git('status', '--porcelain')).toBe('')
      expect(git('rev-list', '--count', 'HEAD')).toBe('3')
      expect(releaseRepo.publishedPackages.map(({ name, version, dryRun }) => `${name}@${version}:${dryRun}`)).toEqual(['@scope/components@6.20.0:true', '@scope/nav@2.0.0:true'])
      // @scope/components@6.20.0 is planned by the run, only @scope/theme is checked on the registry
      expect(isVersionPublished).toHaveBeenCalledTimes(1)
    })
  })

  describe('When a workspace dependency resolves to a version missing from the registry', () => {
    it('Then fails before publishing anything and rolls back the release files', async () => {
      writeJson('shared/internal', { name: '@scope/internal', version: '0.1.0', private: true })
      writeJson('shared/login', {
        name: '@scope/login',
        version: '2.0.0',
        dependencies: { '@scope/internal': 'workspace:*' },
      })
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
      const config = readFileSync(join(releaseRepo.cwd, 'relizy.config.mjs'), 'utf8')
      writeFileSync(join(releaseRepo.cwd, 'relizy.config.mjs'), config.replace(`['shared/nav', 'shared/login']`, `['shared/*']`))
      git('add', '-A')
      git('commit', '--no-verify', '-m', 'chore: overlapping groups')

      await expect(bump({ yes: true })).rejects.toThrow('is matched by several version groups (main, header)')

      expect(git('status', '--porcelain')).toBe('')
    })
  })
})
