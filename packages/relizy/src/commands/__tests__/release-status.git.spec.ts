import type { MockInstance } from 'vitest'
import type { GitRepository } from '../../../../../tests/git-repository'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { createGitRepository } from '../../../../../tests/git-repository'
import { release } from '../release'

vi.mock('@maz-ui/node', importActual => importActual())

describe('Given a release in GitHub Actions with release.report.status', () => {
  let repository: GitRepository
  let remote: string
  let outputs: string
  let initialCwd: string
  let fetch: MockInstance<typeof globalThis.fetch>

  beforeEach(() => {
    initialCwd = process.cwd()
    repository = createGitRepository('relizy-release-status-')
    remote = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-release-status-remote-')))
    outputs = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-release-status-outputs-')))
    process.chdir(repository.cwd)
    repository.git('init', '--quiet', '--bare', remote)
    repository.writeJson('.', { name: 'app', version: '1.0.0' })
    writeFileSync(join(repository.cwd, 'relizy.config.mjs'), `export default {
  logLevel: 'silent',
  noAuthors: true,
  repo: { provider: 'github', domain: 'github.com', repo: 'acme/app' },
  release: { publish: false, providerRelease: false, social: false, prComment: false, report: { github: false, status: true } },
}\n`)
    repository.commit('chore: init')
    repository.git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0')
    repository.git('remote', 'add', 'origin', remote)
    repository.git('push', '--quiet', '-u', 'origin', 'main', '--follow-tags')
    repository.commit('feat: a new thing', { 'index.js': 'feat' })

    for (const [name, value] of Object.entries({
      CI: 'true',
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF_NAME: 'main',
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_REPOSITORY: 'acme/app',
      GITHUB_RUN_ID: '42',
      GITHUB_OUTPUT: join(outputs, 'output'),
      GITHUB_STEP_SUMMARY: join(outputs, 'summary'),
      RELIZY_GITHUB_TOKEN: 'gh-token',
    })) {
      vi.stubEnv(name, value)
    }
    fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response('{}', { status: 201 })))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    process.chdir(initialCwd)
    repository.remove()
    rmSync(remote, { recursive: true, force: true })
    rmSync(outputs, { recursive: true, force: true })
  })

  const posts = () => fetch.mock.calls
    .filter(([url]) => String(url).includes('/statuses/'))
    .map(([url, init]) => ({
      url: String(url),
      ...JSON.parse(String((init as RequestInit).body)),
    }))

  describe('When the release runs', () => {
    it('Then the commit of the push gets the status of each step, and the released version before release() resolves', async () => {
      const sha = repository.git('rev-parse', 'HEAD')

      const report = await release({ yes: true })

      expect(report.status).toBe('released')
      const sent = posts()
      expect(sent.every(post => post.url === `https://api.github.com/repos/acme/app/statuses/${sha}`)).toBe(true)
      expect(sent.map(post => post.description)).toEqual([
        'running checks',
        'running checks: Checking the release',
        'running bump: Computing the versions',
        'running changelog: Writing the changelogs',
        'running commit-and-tag: Committing and tagging',
        'running push: Pushing',
        'released 1.1.0',
      ])
      expect(sent.at(-1)).toMatchObject({ state: 'success', context: 'relizy/release', target_url: 'https://github.com/acme/app/actions/runs/42' })
    })
  })

  describe('When --no-report-status is given', () => {
    it('Then nothing is posted', async () => {
      await release({
        yes: true,
        report: { status: false },
      })

      expect(posts()).toEqual([])
    })
  })

  describe('When the release is a dry run', () => {
    it('Then nothing is posted', async () => {
      await release({ yes: true, dryRun: true })

      expect(posts()).toEqual([])
    })
  })
})
