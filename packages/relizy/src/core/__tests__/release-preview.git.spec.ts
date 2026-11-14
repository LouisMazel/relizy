import type { GitRepository } from '../../../../../tests/git-repository'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { createGitRepository } from '../../../../../tests/git-repository'
import { previewChangelog, previewRelease } from '../release-preview'

vi.mock('@maz-ui/node', importActual => importActual())

describe('Given a selective monorepo with commits since its last release', () => {
  let repository: GitRepository
  let initialCwd: string

  beforeEach(() => {
    initialCwd = process.cwd()
    repository = createGitRepository('relizy-release-preview-')
    process.chdir(repository.cwd)

    repository.writeJson('.', { name: 'monorepo', version: '1.0.0', private: true })
    repository.writeJson('packages/a', { name: 'a', version: '1.0.0' })
    repository.writeJson('packages/b', {
      name: 'b',
      version: '1.0.0',
      dependencies: { a: 'workspace:*' },
    })
    repository.writeJson('packages/c', { name: 'c', version: '1.0.0' })
    writeFileSync(join(repository.cwd, 'relizy.config.mjs'), `export default {
  logLevel: 'silent',
  safetyCheck: false,
  monorepo: { versionMode: 'independent', packages: ['packages/*'] },
  profiles: {
    beta: { description: 'Prerelease', bump: { type: 'prerelease', preid: 'beta' }, publish: { tag: 'beta' } },
    canary: { release: { canary: true } },
  },
}\n`)
    repository.commit('chore: init')
    repository.git('tag', '-a', 'a@1.0.0', '-m', 'a@1.0.0')
    repository.git('tag', '-a', 'b@1.0.0', '-m', 'b@1.0.0')
    repository.git('tag', '-a', 'c@1.0.0', '-m', 'c@1.0.0')
    repository.commit('feat(a): a new option', { 'packages/a/index.js': 'feat' })
    repository.commit('fix(c): a bug', { 'packages/c/index.js': 'fix' })
  })

  afterEach(() => {
    process.chdir(initialCwd)
    repository.remove()
  })

  describe('When previewing the release', () => {
    it('Then gives the versions, the reasons, the commits and the tags of each package', async () => {
      const preview = await previewRelease()

      expect(preview.released).toBe(true)
      expect(preview.canary).toBe(false)
      expect(preview.versionMode).toBe('independent')
      expect(preview.tags).toEqual(expect.arrayContaining(['a@1.1.0', 'c@1.0.1']))

      const [set] = preview.sets
      const a = set!.packages.find(pkg => pkg.name === 'a')!
      expect(a).toMatchObject({
        path: 'packages/a',
        oldVersion: '1.0.0',
        newVersion: '1.1.0',
        bump: 'minor',
        reason: 'commits',
        tag: 'a@1.1.0',
      })
      expect(a.commits).toEqual([
        expect.objectContaining({
          type: 'feat',
          scope: 'a',
          description: 'a new option',
          breaking: false,
        }),
      ])
      expect(set!.packages.find(pkg => pkg.name === 'c')).toMatchObject({ newVersion: '1.0.1', bump: 'patch' })
    })

    it('Then says why a dependent is released', async () => {
      const preview = await previewRelease()
      const b = preview.sets[0]!.packages.find(pkg => pkg.name === 'b')

      expect(b).toMatchObject({
        reason: 'dependency',
        dependency: {
          chain: ['a'],
        },
      })
    })

    it('Then lists the steps with what turns them off', async () => {
      const preview = await previewRelease({
        overrides: {
          release: { social: false, commit: false },
        },
      })
      const steps = Object.fromEntries(preview.steps.map(step => [step.name, step]))

      expect(preview.steps.map(step => step.name)).toEqual([
        'bump',
        'changelog',
        'publish',
        'commit-and-tag',
        'push',
        'provider-release',
        'social',
        'pr-comment',
      ])
      expect(steps.bump!.enabled).toBe(true)
      expect(steps.social).toMatchObject({ enabled: false, disabledBy: 'release.social' })
      expect(steps['commit-and-tag']).toMatchObject({ enabled: false, disabledBy: 'release.commit' })
      expect(steps.push).toMatchObject({ enabled: false, disabledBy: 'release.commit' })
    })

    it('Then writes nothing and runs no hook', async () => {
      await previewRelease()

      expect(repository.git('status', '--porcelain')).toBe('')
    })
  })

  describe('When checking what would make the release fail', () => {
    it('Then gives the problems, none when the release can go on', async () => {
      const preview = await previewRelease({
        checks: true,
        overrides: {
          release: { publish: false },
        },
      })

      expect(preview.problems).toEqual([])
      expect(preview.released).toBe(true)
    })

    it('Then leaves the problems empty without the checks', async () => {
      expect((await previewRelease()).problems).toEqual([])
    })
  })

  describe('When previewing a profile', () => {
    it('Then applies it, with the explicit options over it', async () => {
      const beta = await previewRelease({ profile: 'beta' })
      const rc = await previewRelease({ profile: 'beta', preid: 'rc' })

      expect(beta.profile).toBe('beta')
      expect(beta.sets[0]!.packages.find(pkg => pkg.name === 'a')).toMatchObject({ newVersion: '1.1.0-beta.0' })
      expect(rc.sets[0]!.packages.find(pkg => pkg.name === 'a')).toMatchObject({ newVersion: '1.1.0-rc.0' })
    })

    it('Then previews a canary with its steps turned off', async () => {
      const preview = await previewRelease({ profile: 'canary' })

      expect(preview.canary).toBe(true)
      expect(preview.sets[0]!.packages.find(pkg => pkg.name === 'a')!.newVersion).toMatch(/^1\.1\.0-0\.canary-[0-9a-f]+$/)
      expect(preview.sets[0]!.packages[0]!.bump).toBe('canary')
      expect(preview.steps.find(step => step.name === 'social')).toMatchObject({ enabled: false, disabledBy: 'release.canary' })
      expect(preview.steps.find(step => step.name === 'publish')!.enabled).toBe(true)
    })

    it('Then fails with the profiles available when it does not exist', async () => {
      await expect(previewRelease({ profile: 'nightly' })).rejects.toThrow('Unknown profile "nightly". Available profiles: beta, canary')
    })
  })

  describe('When previewing the changelogs', () => {
    it('Then gives the entry of each released package', async () => {
      const changelogs = await previewChangelog()

      expect(changelogs.map(changelog => changelog.packageName)).toEqual(expect.arrayContaining(['a', 'c']))
      const a = changelogs.find(changelog => changelog.packageName === 'a')!
      expect(a.file).toBe('packages/a/CHANGELOG.md')
      expect(a.content).toContain('A new option')
    })

    it('Then gives a single package, and fails for one that is not released', async () => {
      expect(await previewChangelog({ package: 'c' })).toHaveLength(1)
      await expect(previewChangelog({ package: 'zzz' })).rejects.toThrow('"zzz" is not released by this release')
    })

    it('Then comes with the release when asked', async () => {
      const preview = await previewRelease({
        changelog: { package: 'a' },
      })

      expect(preview.changelogs).toHaveLength(1)
      expect(preview.changelogs[0]!.content).toContain('A new option')
    })
  })

  describe('When nothing is released', () => {
    it('Then says so', async () => {
      for (const name of ['a', 'b', 'c']) {
        repository.git('tag', '-f', '-a', `${name}@1.0.0`, '-m', `${name}@1.0.0`)
      }

      const preview = await previewRelease()

      expect(preview.released).toBe(false)
      expect(preview.tags).toEqual([])
      expect(preview.sets[0]).toMatchObject({ released: false, packages: [] })
    })
  })
})
