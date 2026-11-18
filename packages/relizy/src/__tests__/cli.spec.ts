import type { GitRepository } from '../../../../tests/git-repository'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createGitRepository } from '../../../../tests/git-repository'
import { writeOutdatedRules } from '../core/mcp/__tests__/helpers'

const PACKAGE_DIR = fileURLToPath(new URL('../..', import.meta.url))

/** The variables that would give relizy a token, or the output of a CI */
const IGNORED_VARIABLES = /^(?:CI|GITHUB_ACTIONS|GITHUB_WORKFLOW|GITLAB_CI|GITHUB_BASE_REF|GITHUB_EVENT_PATH|FORCE_COLOR|NO_COLOR)$|^CI_MERGE_REQUEST_|TOKEN|TWITTER|SLACK/

describe('Given the relizy CLI', () => {
  let repository: GitRepository
  let cwd: string

  beforeAll(() => {
    repository = createGitRepository('relizy-cli-')
    cwd = repository.cwd

    mkdirSync(join(cwd, '.bin'))
    writeFileSync(join(cwd, '.bin/gh'), '#!/bin/sh\nexit 1\n')
    chmodSync(join(cwd, '.bin/gh'), 0o755)
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

    return spawnSync(join(PACKAGE_DIR, 'node_modules/.bin/tsx'), [
      join(PACKAGE_DIR, 'src/cli.ts'),
      ...args,
    ], {
      cwd,
      encoding: 'utf8',
      // No token of the GitHub CLI of the machine either: a gh that is not logged in
      env: {
        ...env,
        NO_COLOR: '1',
        // The tsconfig of relizy resolves @relizy/core to its sources, whatever the directory of the run
        TSX_TSCONFIG_PATH: join(PACKAGE_DIR, '../../tsconfig.json'),
        PATH: `${join(cwd, '.bin')}${delimiter}${process.env.PATH}`,
      },
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

  describe('When the relizy rules of the project are outdated', () => {
    afterEach(() => {
      rmSync(join(cwd, '.claude'), { recursive: true, force: true })
    })

    it('Then a command warns once, and the mcp and commitlint commands do not', () => {
      writeOutdatedRules(cwd)

      const warned = run('--log-level', 'default', 'provider-release', '--no-safety-check')

      expect(`${warned.stdout}${warned.stderr}`).toContain('rules for your AI agents are outdated (.claude/rules/relizy.md): run `relizy mcp update`')

      const commitlint = run('--log-level', 'default', 'commitlint', '--message', 'feat: add the parser')

      expect(commitlint.status).toBe(0)
      expect(`${commitlint.stdout}${commitlint.stderr}`).not.toContain('are outdated')

      const mcp = run('--log-level', 'default', 'mcp', 'init', '--dry-run', '--no-mcp')

      expect(`${mcp.stdout}${mcp.stderr}`).not.toContain('are outdated')

      const update = run('--log-level', 'default', 'mcp', 'update', '--dry-run')

      expect(update.status).toBe(0)
      expect(`${update.stdout}${update.stderr}`).not.toContain('are outdated')
      expect(`${update.stdout}${update.stderr}`).toContain('would update')
      expect(`${update.stdout}${update.stderr}`).toContain('.claude/rules/relizy.md')
    }, 30_000)
  })

  describe('When bumping without a release type flag', () => {
    beforeAll(() => {
      writeFileSync(join(cwd, 'relizy.typed.config.json'), JSON.stringify({
        logLevel: 'silent',
        bump: { type: 'major' },
        profiles: {
          prepatch: {
            bump: { type: 'prepatch', preid: 'rc' },
          },
        },
      }))
    })

    afterAll(() => {
      rmSync(join(cwd, 'relizy.typed.config.json'))
    })

    function bump(...args: string[]) {
      const result = run('--config', 'relizy.typed', '--log-level', 'default', '--dry-run', 'bump', '--yes', '--no-clean', ...args)

      return `${result.stdout}${result.stderr}`
    }

    it('Then bump.type of the config applies instead of the bump of the commits', () => {
      expect(bump()).toContain('2.0.0')
    }, 30_000)

    it('Then bump.type of the profile applies over the one of the config', () => {
      expect(bump('--profile', 'prepatch')).toContain('1.0.1-rc.0')
    }, 30_000)

    it('Then a release type flag wins over both', () => {
      const output = bump('--profile', 'prepatch', '--minor')

      expect(output).toContain('1.1.0')
      expect(output).not.toContain('1.0.1-rc.0')
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
