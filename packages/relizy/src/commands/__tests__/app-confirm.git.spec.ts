import type { GitRepository } from '../../../../../tests/git-repository'
import type { RelizyEvent } from '../../core/events'
import type { ConfirmPlan } from '../../types'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { createGitRepository } from '../../../../../tests/git-repository'
import { RelizyCancelError } from '../../core/errors'
import { bump } from '../bump'
import { release } from '../release'

vi.mock('@maz-ui/node', importActual => importActual())

/**
 * An application validating the versions in its own interface: `onConfirm`
 * replaces the prompt of the terminal, here without terminal (the tests do not run in a TTY)
 */
describe('Given an application validating the bump plan with onConfirm', () => {
  let repository: GitRepository
  let initialCwd: string

  const readVersion = () => JSON.parse(readFileSync(join(repository.cwd, 'package.json'), 'utf8')).version

  beforeEach(() => {
    initialCwd = process.cwd()
    repository = createGitRepository('relizy-confirm-')
    process.chdir(repository.cwd)
    repository.writeJson('.', { name: 'app', version: '1.0.0' })
    writeFileSync(join(repository.cwd, 'relizy.config.mjs'), `export default {
  logLevel: 'silent',
  safetyCheck: false,
  release: { commit: false, push: false, publish: false, providerRelease: false, social: false, prComment: false, changelog: false },
  profiles: { beta: { bump: { type: 'prerelease', preid: 'beta' } } },
}\n`)
    repository.commit('chore: init')
    repository.git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0')
    repository.commit('feat: a new thing', { 'index.js': 'feat' })
  })

  afterEach(() => {
    process.chdir(initialCwd)
    repository.remove()
  })

  describe('When bumping and the application accepts', () => {
    it('Then gives the plan before writing, then writes the versions', async () => {
      const plans: { plan: ConfirmPlan, version: string }[] = []

      const result = await bump({
        onConfirm: (plan) => {
          plans.push({
            plan,
            version: readVersion(),
          })
          return Promise.resolve(true)
        },
      })

      expect(plans).toEqual([
        {
          plan: {
            command: 'bump',
            dryRun: false,
            canary: false,
            packages: [
              {
                name: 'app',
                path: '.',
                private: false,
                oldVersion: '1.0.0',
                newVersion: '1.1.0',
                reason: 'commits',
              },
            ],
          },
          // Nothing written yet
          version: '1.0.0',
        },
      ])
      expect(result.bumped).toBe(true)
      expect(readVersion()).toBe('1.1.0')
    })
  })

  describe('When bumping and the application refuses', () => {
    it('Then cancels the run as a refused prompt, without writing anything', async () => {
      const onConfirm = vi.fn().mockReturnValue(false)

      await expect(bump({ onConfirm })).rejects.toBeInstanceOf(RelizyCancelError)

      expect(onConfirm).toHaveBeenCalledTimes(1)
      expect(readVersion()).toBe('1.0.0')
    })
  })

  describe('When bumping with yes', () => {
    it('Then does not ask the application', async () => {
      const onConfirm = vi.fn()

      await bump({ yes: true, dryRun: true, onConfirm })

      expect(onConfirm).not.toHaveBeenCalled()
    })
  })

  describe('When there is nothing to bump', () => {
    it('Then does not ask the application', async () => {
      repository.git('tag', '-a', 'v1.0.1', '-m', 'v1.0.1')
      writeFileSync(join(repository.cwd, 'package.json'), `${JSON.stringify({ name: 'app', version: '1.0.1' })}\n`)
      repository.commit('chore: sync')
      repository.git('tag', '-f', '-a', 'v1.0.1', '-m', 'v1.0.1')
      const onConfirm = vi.fn()

      const result = await bump({ dryRun: true, onConfirm })

      expect(result.bumped).toBe(false)
      expect(onConfirm).not.toHaveBeenCalled()
    })
  })

  describe('When releasing a canary with a profile in dry run', () => {
    it('Then gives the command, the profile, the canary and no tag, and the release goes on once accepted', async () => {
      const onConfirm = vi.fn().mockResolvedValue(true)

      const report = await release({
        dryRun: true,
        profile: 'beta',
        canary: true,
        onConfirm,
      })

      expect(onConfirm).toHaveBeenCalledTimes(1)
      const plan: ConfirmPlan = onConfirm.mock.calls[0]![0]
      expect(plan).toMatchObject({
        command: 'release',
        dryRun: true,
        profile: 'beta',
        canary: true,
      })
      expect(plan.packages[0]).not.toHaveProperty('tag')
      expect(plan.packages[0]!.newVersion).toMatch(/^1\.1\.0-0\.canary-/)
      expect(report.dryRun).toBe(true)
    })
  })

  describe('When releasing with the release commit and its tags', () => {
    it('Then gives the tag of each package, which relizy bump does not create', async () => {
      const onConfirm = vi.fn().mockReturnValue(false)

      await expect(release({
        dryRun: true,
        commit: true,
        gitTag: true,
        onConfirm,
      })).rejects.toBeInstanceOf(RelizyCancelError)

      expect(onConfirm.mock.calls[0]![0].packages[0]).toMatchObject({ name: 'app', tag: 'v1.1.0' })
    })
  })

  describe('When releasing and the application refuses', () => {
    it('Then cancels the release, without writing anything', async () => {
      await expect(release({
        onConfirm: () => false,
      })).rejects.toBeInstanceOf(RelizyCancelError)

      expect(readVersion()).toBe('1.0.0')
    })
  })

  describe('When releasing and onConfirm throws', () => {
    it('Then the release fails (not a cancellation) with the error of the application, without writing anything', async () => {
      const events: RelizyEvent[] = []

      const error = await release({
        onConfirm: () => {
          throw new Error('the application crashed')
        },
        onProgress: event => events.push(event),
      }).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(Error)
      expect(error).not.toBeInstanceOf(RelizyCancelError)
      expect((error as Error).message).toBe('the application crashed')
      expect(events.find(event => event.type === 'step:failed')).toMatchObject({ step: 'bump', fatal: true, cancelled: false })
      expect(events.find(event => event.type === 'command:error')).toMatchObject({ cancelled: false })
      expect(readVersion()).toBe('1.0.0')
    })

    it('Then a RelizyCancelError of the application cancels the release', async () => {
      const events: RelizyEvent[] = []

      await expect(release({
        onConfirm: () => Promise.reject(new RelizyCancelError('Closed by the user')),
        onProgress: event => events.push(event),
      })).rejects.toBeInstanceOf(RelizyCancelError)

      expect(events.find(event => event.type === 'command:error')).toMatchObject({ cancelled: true })
      expect(readVersion()).toBe('1.0.0')
    })
  })

  describe('When bump.yes is in the config', () => {
    it('Then onConfirm is not called', async () => {
      writeFileSync(join(repository.cwd, 'relizy.config.mjs'), `export default { logLevel: 'silent', bump: { yes: true } }\n`)
      repository.commit('chore: confirm in advance')
      const onConfirm = vi.fn()

      await bump({ dryRun: true, onConfirm })

      expect(onConfirm).not.toHaveBeenCalled()
    })
  })

  describe('When RELIZY_REPORTER=json without yes nor onConfirm', () => {
    afterEach(() => {
      delete process.env.RELIZY_REPORTER
    })

    it('Then the bump and the release fail at once, before any prompt writes on stdout', async () => {
      process.env.RELIZY_REPORTER = 'json'
      const write = vi.spyOn(process.stdout, 'write')

      await expect(bump({ dryRun: true })).rejects.toThrow('RELIZY_REPORTER=json keeps stdout for the events: run "relizy bump --yes"')
      await expect(release({ dryRun: true })).rejects.toThrow('run "relizy release --yes"')

      const written = write.mock.calls.map(([chunk]) => String(chunk)).join('')
      write.mockRestore()
      expect(written).not.toContain('Release this version?')
      expect(written).not.toContain('Bump this version?')
      expect(readVersion()).toBe('1.0.0')
    })

    it('Then onConfirm answers instead', async () => {
      // The output writes its log file in node_modules
      repository.commit('chore: ignore', { '.gitignore': 'node_modules\n' })
      process.env.RELIZY_REPORTER = 'json'
      const onConfirm = vi.fn().mockReturnValue(true)

      const result = await bump({ dryRun: true, onConfirm })

      expect(result.bumped).toBe(true)
      expect(onConfirm).toHaveBeenCalledTimes(1)
    })
  })
})
