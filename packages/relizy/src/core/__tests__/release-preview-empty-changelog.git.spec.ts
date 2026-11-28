import type { GitRepository } from '../../../../../tests/git-repository'
import type { BumpResultTruthy } from '../../types'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { createGitRepository } from '../../../../../tests/git-repository'
import { bump } from '../../commands/bump'
import { changelog } from '../../commands/changelog'
import { previewChangelog } from '../release-preview'

vi.mock('@maz-ui/node', importActual => importActual())

/** b depends on a: a commit in a releases b without commit of its own */
function setup(versionMode: string) {
  const repository = createGitRepository(`relizy-preview-empty-${versionMode}-`)

  repository.writeJson('.', { name: 'monorepo', version: '1.0.0', private: true })
  repository.writeJson('packages/a', { name: 'a', version: '1.0.0' })
  repository.writeJson('packages/b', {
    name: 'b',
    version: '1.0.0',
    dependencies: { a: 'workspace:^' },
  })
  writeFileSync(join(repository.cwd, 'relizy.config.mjs'), `export default {
  logLevel: 'silent',
  safetyCheck: false,
  noAuthors: true,
  monorepo: { versionMode: '${versionMode}', packages: ['packages/*'] },
  bump: { dependents: 'all' },
}\n`)
  repository.commit('chore: init')
  repository.git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0')
  repository.git('tag', '-a', 'a@1.0.0', '-m', 'a@1.0.0')
  repository.git('tag', '-a', 'b@1.0.0', '-m', 'b@1.0.0')
  repository.commit('feat(a): a new option', { 'packages/a/index.js': 'feat' })

  return repository
}

describe.each(['unified', 'selective', 'independent'])('Given a %s monorepo with a package released without commit', (versionMode) => {
  let repository: GitRepository
  let initialCwd: string

  beforeEach(() => {
    initialCwd = process.cwd()
    repository = setup(versionMode)
    process.chdir(repository.cwd)
  })

  afterEach(() => {
    process.chdir(initialCwd)
    repository.remove()
  })

  it('When previewing its changelog, Then it is the entry the release writes, emptyChangelogContent included', async () => {
    const [preview] = await previewChangelog({ package: 'b' })

    expect(preview!.content).toContain('No relevant changes for this release')

    const bumpResult = await bump({ yes: true }) as BumpResultTruthy
    await changelog({ bumpResult })

    expect(readFileSync(join(repository.cwd, 'packages/b/CHANGELOG.md'), 'utf8')).toContain(preview!.content)
  })
})
