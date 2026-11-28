import type { GitRepository } from '../../../../../tests/git-repository'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { getPublishedRange } from '@relizy/core'
import * as semver from 'semver'
import { createGitRepository } from '../../../../../tests/git-repository'
import { bump } from '../bump'

vi.mock('@maz-ui/node', importActual => importActual())

/**
 * The range of a sibling the published package.json of `b` holds: the package
 * manager replaces `workspace:` with the version of the sibling at publish
 */
function publishedRangeOfA(repository: GitRepository): string {
  const b = JSON.parse(readFileSync(join(repository.cwd, 'packages/b/package.json'), 'utf8'))
  const a = JSON.parse(readFileSync(join(repository.cwd, 'packages/a/package.json'), 'utf8'))

  return getPublishedRange({ dependencyName: 'a', specifier: b.dependencies.a, dependencyVersion: a.version })!.range
}

describe('Given a selective monorepo whose package b depends on its sibling a with workspace:^', () => {
  let repository: GitRepository
  let initialCwd: string

  beforeEach(() => {
    initialCwd = process.cwd()
    repository = createGitRepository('relizy-canary-dependents-')
    process.chdir(repository.cwd)

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
  monorepo: { versionMode: 'selective', packages: ['packages/*'] },
  bump: { dependents: 'all' },
}\n`)
    repository.commit('chore: init')
    repository.git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0')
  })

  afterEach(() => {
    process.chdir(initialCwd)
    repository.remove()
  })

  describe('When two canaries are released one after the other', () => {
    it('Then the dependent of each canary only accepts the canary of its sibling published by the same run', async () => {
      const canaryRange = async (change: string) => {
        repository.commit(`feat(a): ${change}`, { 'packages/a/index.js': change })
        await bump({ canary: true, yes: true })
        const range = publishedRangeOfA(repository)
        const version = JSON.parse(readFileSync(join(repository.cwd, 'packages/a/package.json'), 'utf8')).version
        // As the release after its publish: the files of the canary are restored
        repository.git('checkout', '--', '.')

        return { range, version }
      }

      const first = await canaryRange('first')
      const second = await canaryRange('second')

      expect(first.version).toMatch(/^1\.1\.0-0\.canary-/)
      expect(second.version).toMatch(/^1\.1\.0-0\.canary-/)
      expect(second.version).not.toBe(first.version)
      // The exact version: whatever the hashes compare as text
      expect(first.range).toBe(first.version)
      expect(second.range).toBe(second.version)
      expect(semver.satisfies(first.version, second.range)).toBe(false)
      expect(semver.satisfies(second.version, first.range)).toBe(false)
    })
  })

  describe('When a stable or a prerelease is released', () => {
    it.each([
      ['minor', undefined, '1.1.0'],
      ['prerelease', 'beta', '1.1.0-beta.0'],
    ])('Then the workspace range is kept (%s)', async (type, preid, version) => {
      repository.commit('feat(a): a new option', { 'packages/a/index.js': 'feat' })

      await bump({ type: type as 'minor', preid, yes: true })

      const b = JSON.parse(readFileSync(join(repository.cwd, 'packages/b/package.json'), 'utf8'))
      expect(b.dependencies.a).toBe('workspace:^')
      expect(publishedRangeOfA(repository)).toBe(`^${version}`)
    })
  })
})
