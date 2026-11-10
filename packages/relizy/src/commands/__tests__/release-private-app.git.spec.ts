import type { GitRepository } from '../../../../../tests/git-repository'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { execPromise } from '@maz-ui/node'
import { createGitRepository } from '../../../../../tests/git-repository'
import { publishPackage } from '../../core/npm'
import { release } from '../release'

// The setup file mocks execPromise: these tests run the real git commands against a temporary repository
vi.mock('@maz-ui/node', async (importActual) => {
  const actual = await importActual<typeof import('@maz-ui/node')>()
  return {
    ...actual,
    execPromise: vi.fn(actual.execPromise),
  }
})

vi.mock('../../core/prompts', () => ({
  askConfirm: vi.fn(),
  assertInteractivePrompt: vi.fn(),
  BUMP_NOT_INTERACTIVE: '',
}))

vi.mock('../../core/npm', async (importActual) => {
  const actual = await importActual<typeof import('../../core/npm')>()
  return {
    ...actual,
    publishPackage: vi.fn(),
  }
})

/**
 * A private app (`"private": true` in its package.json, no workspace): it is
 * versioned like a library, never published.
 */
describe('Given the release of a private app on a real git repository', () => {
  let repository: GitRepository
  let cwd: string
  let initialCwd: string

  function git(...args: string[]) {
    return repository.git(...args)
  }

  function commitFile(path: string, message: string) {
    repository.commit(message, { [path]: `${message}\n` })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    initialCwd = process.cwd()
    repository = createGitRepository('relizy-private-app-')
    cwd = repository.cwd

    writeFileSync(join(cwd, 'package.json'), `${JSON.stringify({ name: 'app', version: '1.0.0', private: true }, null, 2)}\n`)
    // `release.publish` stays on: the private app is still never published
    writeFileSync(join(cwd, 'relizy.config.mjs'), `export default {
  logLevel: 'silent',
  noAuthors: true,
  publish: { packageManager: 'npm' },
  release: { push: false, providerRelease: false, social: false, prComment: false },
}
`)
    git('add', '-A')
    git('commit', '--no-verify', '-m', 'chore: init')
    git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0')

    commitFile('index.js', 'fix: handle the empty cart')

    process.chdir(cwd)
  })

  afterEach(() => {
    process.chdir(initialCwd)
    repository.remove()
  })

  describe('When it is released', () => {
    it('Then bumps, tags and generates its changelog, without publishing nor authenticating to the registry', async () => {
      await release({ yes: true })

      expect(JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).version).toBe('1.0.1')
      expect(git('tag', '--points-at', 'HEAD')).toBe('v1.0.1')
      expect(readFileSync(join(cwd, 'CHANGELOG.md'), 'utf8')).toContain('Handle the empty cart')
      expect(publishPackage).not.toHaveBeenCalled()
      expect(vi.mocked(execPromise).mock.calls.some(([command]) => /\bnpm (?:whoami|ping)\b/.test(String(command)))).toBe(false)
    })
  })
})
