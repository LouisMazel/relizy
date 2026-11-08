import type { GitRepository } from '../../tests/git-repository'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import process from 'node:process'
import { createGitRepository } from '../../tests/git-repository'

/** The variables that would give relizy a token, or the output of a CI */
const IGNORED_VARIABLES = /^(?:CI|GITHUB_ACTIONS|GITLAB_CI|GITHUB_BASE_REF|GITHUB_EVENT_PATH|FORCE_COLOR|NO_COLOR)$|^CI_MERGE_REQUEST_|TOKEN|TWITTER|SLACK/

describe('Given the relizy CLI', () => {
  let repository: GitRepository
  let cwd: string

  beforeAll(() => {
    repository = createGitRepository('relizy-cli-')
    cwd = repository.cwd

    repository.git('remote', 'add', 'origin', 'https://github.com/acme/app.git')
    repository.commit('chore: init', {
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0' }),
      'relizy.config.json': JSON.stringify({
        logLevel: 'silent',
        social: {
          twitter: { enabled: true },
        },
      }),
    })
    repository.git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0')
    repository.commit('feat: add the parser', { 'parser.js': 'export {}\n' })
  })

  afterAll(() => {
    repository.remove()
  })

  function run(...args: string[]) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !IGNORED_VARIABLES.test(name)))

    return spawnSync(join(process.cwd(), 'node_modules/.bin/tsx'), [
      join(process.cwd(), 'src/cli.ts'),
      ...args,
    ], {
      cwd,
      encoding: 'utf8',
      env: { ...env, NO_COLOR: '1' },
    })
  }

  describe('When the provider release fails', () => {
    it('Then exits with code 1', () => {
      const result = run('provider-release', '--no-safety-check')

      expect(`${result.stdout}${result.stderr}`).toContain('No GitHub token specified')
      expect(result.status).toBe(1)
    }, 30_000)
  })

  describe('When a social post fails', () => {
    it('Then exits with code 1', () => {
      const result = run('social', '--no-safety-check')

      expect(`${result.stdout}${result.stderr}`).toContain('twitter failed')
      expect(result.status).toBe(1)
    }, 30_000)
  })

  describe('When linting a commit message', () => {
    it('Then exits with 0 on a valid message, without the banner', () => {
      const result = run('commitlint', '--message', 'feat: add the commitlint command')

      expect(result.status).toBe(0)
      expect(result.stdout.trim()).toBe('✔ feat → minor bump, 🚀 Enhancements')
    }, 30_000)

    it('Then exits with 1 on an invalid message', () => {
      const result = run('commitlint', '--message', 'Added stuff')

      expect(result.status).toBe(1)
      expect(result.stdout).toContain('✖ Added stuff')
    }, 30_000)

    it('Then prints an expected error without stack trace', () => {
      // The config of the repository is silent
      const result = run('--log-level', 'default', 'commitlint', '--from', 'origin/unknown-ref')
      const output = `${result.stdout}${result.stderr}`

      expect(result.status).toBe(1)
      expect(output).toContain('Cannot find "origin/unknown-ref"')
      expect(output).not.toContain('at assertRefAvailable')
    }, 30_000)
  })
})
