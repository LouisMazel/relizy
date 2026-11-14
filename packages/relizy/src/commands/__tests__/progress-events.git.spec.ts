import type { GitRepository } from '../../../../../tests/git-repository'
import type { RelizyEvent } from '../../core/events'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { createGitRepository } from '../../../../../tests/git-repository'
import { bump } from '../bump'
import { release } from '../release'

vi.mock('@maz-ui/node', importActual => importActual())

describe('Given a repository with a commit to release', () => {
  let repository: GitRepository
  let initialCwd: string

  beforeEach(() => {
    initialCwd = process.cwd()
    repository = createGitRepository('relizy-progress-')
    process.chdir(repository.cwd)
    repository.writeJson('.', { name: 'app', version: '1.0.0' })
    writeFileSync(join(repository.cwd, 'relizy.config.mjs'), `export default {
  logLevel: 'silent',
  safetyCheck: false,
  release: { commit: false, push: false, publish: false, providerRelease: false, social: false, prComment: false, changelog: false },
  profiles: { quiet: { release: { changelog: false } } },
}\n`)
    repository.commit('chore: init')
    repository.git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0')
    repository.commit('feat: a new thing', { 'index.js': 'feat' })
  })

  afterEach(() => {
    process.chdir(initialCwd)
    repository.remove()
  })

  describe('When bumping with onProgress', () => {
    it('Then gives the start, the step and the end of the command, in order', async () => {
      const events: RelizyEvent[] = []

      await bump({
        dryRun: true,
        yes: true,
        onProgress: event => events.push(event),
      })

      const types = events.map(event => event.type)
      expect(types[0]).toBe('command:start')
      expect(events[0]).toMatchObject({ command: 'bump', dryRun: true })
      expect(events.find(event => event.type === 'step:start')).toMatchObject({ step: 'bump', label: 'Computing the versions' })
      expect(events.find(event => event.type === 'step:done')).toMatchObject({
        step: 'bump',
        durationMs: expect.any(Number),
      })
      expect(types.at(-1)).toBe('command:complete')
      expect(types.indexOf('step:start')).toBeLessThan(types.indexOf('step:done'))
    })
  })

  describe('When a command fails', () => {
    it('Then ends with the error', async () => {
      const events: RelizyEvent[] = []

      // Without --yes, nobody can confirm the versions
      await expect(bump({
        dryRun: true,
        onProgress: event => events.push(event),
      })).rejects.toThrow('asks to confirm')

      expect(events.map(event => event.type)).toEqual(['command:start', 'command:error'])
      expect(events.at(-1)).toMatchObject({
        type: 'command:error',
        cancelled: false,
        message: expect.stringContaining('asks to confirm'),
      })
    })
  })

  describe('When steps are turned off by the run, by canary mode and by the config', () => {
    it('Then each skipped step tells its own reason', async () => {
      const events: RelizyEvent[] = []

      await release({
        yes: true,
        dryRun: true,
        canary: true,
        publish: false,
        onProgress: event => events.push(event),
      })

      const reasons = Object.fromEntries(events.flatMap(event => event.type === 'step:skipped'
        ? [
            [event.step, event.reason],
          ]
        : []))

      expect(reasons).toEqual({
        'checks': 'safetyCheck: false',
        'changelog': 'canary',
        'publish': '--no-publish',
        'commit-and-tag': 'canary',
        'push': 'canary',
        'provider-release': 'canary',
        'social': 'canary',
        'pr-comment': 'release.prComment: false',
      })
    })
  })

  describe('When releasing with onProgress', () => {
    it('Then gives each step of the release once, the skipped ones and the report, without the steps of the commands it runs', async () => {
      const events: RelizyEvent[] = []

      const report = await release({
        dryRun: true,
        yes: true,
        onProgress: event => events.push(event),
      })

      const started = events.filter(event => event.type === 'step:start').map(event => event.step)
      const skipped = events.filter(event => event.type === 'step:skipped').map(event => event.step)
      expect(started).toEqual(['bump'])
      expect(skipped).toEqual(expect.arrayContaining([
        'changelog',
        'publish',
        'commit-and-tag',
        'push',
        'provider-release',
        'social',
        'pr-comment',
      ]))
      expect(events.filter(event => event.type === 'command:start')).toHaveLength(1)

      const finish = events.find(event => event.type === 'release:finish')
      expect(finish).toMatchObject({
        report: { dryRun: true },
      })
      expect(report.dryRun).toBe(true)
    })

    it('Then has no event for a profile that does not exist, the command does not start', async () => {
      const events: RelizyEvent[] = []

      await expect(release({
        dryRun: true,
        yes: true,
        profile: 'nope',
        onProgress: event => events.push(event),
      })).rejects.toThrow('Unknown profile')

      expect(events).toEqual([])
    })
  })
})

describe('Given a repository with a remote and a commit to release', () => {
  let repository: GitRepository
  let remote: string
  let initialCwd: string

  const stepData = (events: RelizyEvent[], step: string) => events.find(event => (event.type === 'step:done' || event.type === 'step:failed') && event.step === step)

  beforeEach(() => {
    initialCwd = process.cwd()
    repository = createGitRepository('relizy-step-data-')
    remote = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-step-data-remote-')))
    process.chdir(repository.cwd)
    repository.git('init', '--quiet', '--bare', remote)
    repository.writeJson('.', { name: 'app', version: '1.0.0' })
    writeFileSync(join(repository.cwd, 'relizy.config.mjs'), `export default {
  logLevel: 'silent',
  noAuthors: true,
  release: { publish: false, providerRelease: false, social: false, prComment: false },
}\n`)
    repository.commit('chore: init')
    repository.git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0')
    repository.git('remote', 'add', 'origin', remote)
    repository.git('push', '--quiet', '-u', 'origin', 'main', '--follow-tags')
    repository.commit('feat: a new thing', { 'index.js': 'feat' })
  })

  afterEach(() => {
    process.chdir(initialCwd)
    repository.remove()
    rmSync(remote, { recursive: true, force: true })
  })

  describe('When releasing with onProgress', () => {
    it('Then gives what each step did as data: the checks, the versions, the changelogs, the commit, the tags and the push', async () => {
      const events: RelizyEvent[] = []

      await release({
        yes: true,
        onProgress: event => events.push(event),
      })

      expect(stepData(events, 'checks')).toMatchObject({
        type: 'step:done',
        data: {
          checks: [
            { name: 'provider-release', status: 'skipped', message: 'release.providerRelease: false' },
            { name: 'publish', status: 'skipped', message: 'release.publish: false' },
            { name: 'social', status: 'skipped', message: 'release.social: false' },
            { name: 'branch', status: 'passed' },
            { name: 'push', status: 'passed' },
          ],
        },
      })
      expect(stepData(events, 'bump')).toMatchObject({
        data: {
          packages: [
            { name: 'app', oldVersion: '1.0.0', newVersion: '1.1.0' },
          ],
        },
      })
      expect(stepData(events, 'changelog')).toMatchObject({
        data: {
          files: [
            {
              file: 'CHANGELOG.md',
              packageName: 'app',
              content: expect.stringContaining('- A new thing'),
            },
          ],
        },
      })
      expect(stepData(events, 'commit-and-tag')).toMatchObject({
        data: {
          commit: {
            hash: repository.git('rev-parse', 'HEAD'),
            message: 'chore(release): bump version to 1.1.0',
          },
          tags: ['v1.1.0'],
        },
      })
      expect(stepData(events, 'push')).toMatchObject({
        data: { remote: 'origin', branch: 'main', tags: true },
      })
      expect(repository.git('--git-dir', remote, 'tag')).toContain('v1.1.0')
    })

    it('Then gives the commit without hash in dry-run', async () => {
      const events: RelizyEvent[] = []

      await release({
        yes: true,
        dryRun: true,
        onProgress: event => events.push(event),
      })

      const commit = stepData(events, 'commit-and-tag')
      expect(commit).toMatchObject({
        data: {
          commit: { message: 'chore(release): bump version to 1.1.0' },
        },
      })
      expect(commit).not.toHaveProperty('data.commit.hash')
    })

    it('Then gives the release commit made before the step failed', async () => {
      repository.commit('chore: hook', {
        'relizy.config.mjs': `export default {
  logLevel: 'silent',
  safetyCheck: false,
  release: { push: false, publish: false, providerRelease: false, social: false, prComment: false, changelog: false },
  hooks: { 'success:commit-and-tag': () => { throw new Error('hook failed') } },
}\n`,
      })
      const events: RelizyEvent[] = []

      await expect(release({
        yes: true,
        onProgress: event => events.push(event),
      })).rejects.toThrow('hook failed')

      expect(stepData(events, 'commit-and-tag')).toMatchObject({
        type: 'step:failed',
        data: {
          commit: {
            hash: repository.git('rev-parse', 'HEAD'),
            message: 'chore(release): bump version to 1.1.0',
          },
          tags: [],
        },
      })
    })

    it('Then gives the status of each check when one fails', async () => {
      const events: RelizyEvent[] = []
      // The remote moves on: the branch is behind it
      const other = createGitRepository('relizy-step-data-other-')
      try {
        other.git('remote', 'add', 'origin', remote)
        other.git('fetch', '--quiet', 'origin')
        other.git('reset', '--quiet', '--hard', 'origin/main')
        other.commit('fix: elsewhere', { 'other.js': 'fix' })
        other.git('push', '--quiet', 'origin', 'HEAD:main')
      }
      finally {
        other.remove()
      }

      await expect(release({
        yes: true,
        onProgress: event => events.push(event),
      })).rejects.toThrow()

      expect(stepData(events, 'checks')).toMatchObject({
        type: 'step:failed',
        fatal: true,
        data: {
          checks: expect.arrayContaining([
            {
              name: 'branch',
              status: 'failed',
              message: expect.any(String),
            },
          ]),
        },
      })
    })
  })
})
