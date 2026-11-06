import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

/** The variables that would give relizy a token, or the output of a CI */
const IGNORED_VARIABLES = /^(?:CI|GITHUB_ACTIONS|GITLAB_CI|FORCE_COLOR|NO_COLOR)$|TOKEN|TWITTER|SLACK/

describe('Given the relizy CLI', () => {
  let cwd: string

  beforeAll(() => {
    cwd = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-cli-')))
    const git = (...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' })

    git('init', '--initial-branch=main')
    git('config', 'user.email', 'relizy@example.com')
    git('config', 'user.name', 'Relizy')
    git('config', 'commit.gpgsign', 'false')
    git('config', 'tag.gpgsign', 'false')
    git('remote', 'add', 'origin', 'https://github.com/acme/app.git')
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'app', version: '1.0.0' }))
    writeFileSync(join(cwd, 'relizy.config.json'), JSON.stringify({ logLevel: 'silent', social: { twitter: { enabled: true } } }))
    git('add', '-A')
    git('commit', '--no-verify', '-m', 'chore: init')
    git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0')
    writeFileSync(join(cwd, 'parser.js'), 'export {}\n')
    git('add', '-A')
    git('commit', '--no-verify', '-m', 'feat: add the parser')
  })

  afterAll(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  function run(...args: string[]) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !IGNORED_VARIABLES.test(name)))

    return spawnSync(join(process.cwd(), 'node_modules/.bin/tsx'), [join(process.cwd(), 'src/cli.ts'), ...args], {
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
})
