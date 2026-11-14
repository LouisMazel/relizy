import type { GitRepository } from '../../../../../tests/git-repository'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { createGitRepository } from '../../../../../tests/git-repository'
import { previewChangelog, previewRelease } from '../release-preview'

vi.mock('@maz-ui/node', importActual => importActual())

function setup(prefix: string, config: string, tagVersion: string | false = '1.0.0') {
  const repository = createGitRepository(prefix)

  repository.writeJson('.', { name: 'monorepo', version: '1.0.0', private: true })
  repository.writeJson('packages/a', { name: 'a', version: '1.0.0' })
  repository.writeJson('packages/b', {
    name: 'b',
    version: '1.0.0',
    dependencies: { a: 'workspace:*' },
  })
  writeFileSync(join(repository.cwd, 'relizy.config.mjs'), `export default {
  logLevel: 'silent',
  safetyCheck: false,
  ${config}
}\n`)
  repository.commit('chore: init')

  if (tagVersion) {
    repository.git('tag', '-a', `v${tagVersion}`, '-m', `v${tagVersion}`)
  }

  return repository
}

describe('Given a unified monorepo', () => {
  let repository: GitRepository
  let initialCwd: string

  beforeEach(() => {
    initialCwd = process.cwd()
    repository = setup('relizy-preview-unified-', `monorepo: { versionMode: 'unified', packages: ['packages/*'] },`)
    repository.commit('feat(a)!: drop the old option', { 'packages/a/index.js': 'feat' })
    process.chdir(repository.cwd)
  })

  afterEach(() => {
    process.chdir(initialCwd)
    repository.remove()
  })

  it('When previewing, Then gives one version with its tag and the breaking commit', async () => {
    const preview = await previewRelease()
    const [set] = preview.sets

    expect(preview.versionMode).toBe('unified')
    expect(set).toMatchObject({
      oldVersion: '1.0.0',
      newVersion: '2.0.0',
      bump: 'major',
      tag: 'v2.0.0',
      notReleased: [],
    })
    expect(set!.commits[0]).toMatchObject({ breaking: true, type: 'feat' })
    expect(set!.packages.map(pkg => pkg.name)).toEqual(['a', 'b'])
    expect(preview.tags).toEqual(['v2.0.0'])
  })

  it('When previewing from another directory, Then uses the cwd option', async () => {
    process.chdir(initialCwd)

    const preview = await previewRelease({ cwd: repository.cwd })

    expect(preview.released).toBe(true)
    expect(preview.sets[0]!.newVersion).toBe('2.0.0')
  })

  it('When previewing with a bump type and a suffix, Then they apply', async () => {
    const preview = await previewRelease({ type: 'prerelease', preid: 'beta', force: true })

    expect(preview.sets[0]!.newVersion).toMatch(/-beta\./)
  })

  it('When previewing the changelogs, Then the root one aggregates the release and can be picked with root', async () => {
    const all = await previewChangelog()
    const root = await previewChangelog({ package: 'root' })

    expect(all.map(changelog => changelog.file)).toContain('CHANGELOG.md')
    expect(root).toHaveLength(1)
    expect(root[0]!.label).toContain('root')
  })

  it('When checking the release, Then warns and reports nothing wrong for a clean release', async () => {
    const preview = await previewRelease({
      checks: true,
      overrides: {
        release: { publish: false },
      },
    })

    expect(preview.problems).toEqual([])
    expect(Array.isArray(preview.warnings)).toBe(true)
  })

  it('When the changelog options are given, Then the contributors can be asked', async () => {
    const preview = await previewRelease({
      changelog: { package: 'a', contributors: false },
    })

    expect(preview.changelogs).toHaveLength(1)
  })

  it('When the whole changelog is asked as an option, Then every file is given', async () => {
    const preview = await previewRelease({ changelog: true })

    expect(preview.changelogs.length).toBeGreaterThan(1)
  })
})

describe('Given an independent monorepo with the root changelog', () => {
  let repository: GitRepository
  let initialCwd: string

  beforeEach(() => {
    initialCwd = process.cwd()
    repository = setup('relizy-preview-independent-', `monorepo: { versionMode: 'independent', packages: ['packages/*'] },
  changelog: { rootChangelog: true },`, false)
    repository.git('tag', '-a', 'a@1.0.0', '-m', 'a@1.0.0')
    repository.git('tag', '-a', 'b@1.0.0', '-m', 'b@1.0.0')
    repository.commit('fix(a): a bug', { 'packages/a/index.js': 'fix' })
    process.chdir(repository.cwd)
  })

  afterEach(() => {
    process.chdir(initialCwd)
    repository.remove()
  })

  it('When previewing the changelogs, Then the root one aggregates the packages', async () => {
    const changelogs = await previewChangelog()
    const root = changelogs.find(changelog => changelog.file === 'CHANGELOG.md')

    expect(root?.label).toContain('the changelogs of the packages')
    expect((await previewChangelog({ package: 'root' }))).toHaveLength(1)
  })

  it('When a release step is turned off, Then it says by which option', async () => {
    const preview = await previewRelease({
      overrides: {
        release: {
          changelog: false,
          publish: false,
          providerRelease: false,
          prComment: false,
        },
      },
    })
    const disabled = Object.fromEntries(preview.steps.map(step => [step.name, step.disabledBy]))

    expect(disabled).toMatchObject({
      'changelog': 'release.changelog',
      'publish': 'release.publish',
      'provider-release': 'release.providerRelease',
      'pr-comment': 'release.prComment',
    })
  })
})

describe('Given a monorepo with version groups', () => {
  let repository: GitRepository
  let initialCwd: string

  beforeEach(() => {
    initialCwd = process.cwd()
    repository = setup('relizy-preview-groups-', `monorepo: {
    groups: [
      { name: 'first', title: 'First', packages: ['packages/a'], versionMode: 'unified' },
      { name: 'second', packages: ['packages/b'], versionMode: 'independent' },
    ],
  },`, false)
    repository.writeJson('packages/b', { name: 'b', version: '1.0.0' })
    repository.commit('chore: b does not depend on a')
    repository.git('tag', '-a', 'first-v1.0.0', '-m', 'first-v1.0.0')
    repository.git('tag', '-a', 'b@1.0.0', '-m', 'b@1.0.0')
    repository.commit('feat(a): a new option', { 'packages/a/index.js': 'feat' })
    process.chdir(repository.cwd)
  })

  afterEach(() => {
    process.chdir(initialCwd)
    repository.remove()
  })

  it('When previewing, Then gives a set per group, the one without commits not released', async () => {
    const preview = await previewRelease()

    expect(preview.versionMode).toBe('groups')
    expect(preview.sets.map(set => set.group)).toEqual(['first', 'second'])
    expect(preview.sets[0]!.title).toBe('First')
    expect(preview.sets[1]!.title).toBe('second')
    expect(preview.sets[1]).toMatchObject({
      released: false,
      notReleased: ['b'],
    })
  })

  it('When previewing one group, Then the others are left out', async () => {
    const preview = await previewRelease({
      groups: ['first'],
    })

    expect(preview.sets.map(set => set.group)).toEqual(['first'])
  })
})
