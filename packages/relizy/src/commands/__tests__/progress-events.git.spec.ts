import type { GitRepository } from '../../../../../tests/git-repository'
import type { RelizyEvent } from '../../core/events'
import { writeFileSync } from 'node:fs'
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
