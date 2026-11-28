import type { MockInstance } from 'vitest'
import type { ReleaseReport } from '../release-report'
import process from 'node:process'
import { logger } from '@maz-ui/node'
import { createMockConfig } from '../../../tests/mocks'
import { emitEvent, runWithEvents } from '../events'
import { closeReleaseStatus, startReleaseStatus } from '../release-status'

const SHA = 'abcdef1234567'

const GITHUB_ENV = {
  GITHUB_ACTIONS: 'true',
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_REPOSITORY: 'acme/app',
  GITHUB_RUN_ID: '42',
  GITHUB_EVENT_NAME: 'push',
}

const GITLAB_ENV = {
  GITLAB_CI: 'true',
  CI_JOB_URL: 'https://gitlab.com/acme/app/-/jobs/9',
  CI_COMMIT_REF_NAME: 'main',
  CI_PIPELINE_ID: '77',
  CI_PIPELINE_SOURCE: 'push',
}

const released = {
  status: 'released',
  released: true,
  dryRun: false,
  canary: false,
  version: '1.1.0',
  tags: ['v1.1.0'],
  steps: [],
} as ReleaseReport

function config(provider: 'github' | 'gitlab', { status = true, token = provider === 'github'
  ? 'gh-token'
  : 'glpat-token' }: { status?: boolean, token?: string } = {}) {
  return createMockConfig({
    repo: {
      provider,
      domain: provider === 'github'
        ? 'github.com'
        : 'gitlab.com',
      repo: 'acme/app',
    },
    tokens: provider === 'github'
      ? { github: token }
      : { gitlab: token },
    release: {
      report: { github: true, status },
    },
  })
}

describe('Given the commit status of a release in CI', () => {
  let fetch: MockInstance<typeof globalThis.fetch>

  beforeEach(() => {
    fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response('{}', { status: 201 })))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const bodies = () => fetch.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)))
  const descriptions = () => bodies().map(body => `${body.state} ${body.description}`)

  /** A release run: the writer started, the events of the run, then its end */
  function run(cfg: ReturnType<typeof config>, env: Record<string, string>, events: () => void, { dryRun = false } = {}) {
    return runWithEvents(undefined, async () => {
      startReleaseStatus({ config: cfg, dryRun, sha: SHA, env })
      events()
      await closeReleaseStatus()
    })
  }

  describe('When a release runs in GitHub Actions with release.report.status', () => {
    it('Then each step is posted in order, once, then the release, on the commit of the push, linked to the run', async () => {
      await run(config('github'), GITHUB_ENV, () => {
        emitEvent({
          type: 'command:start',
          command: 'release',
          title: 'relizy release',
          dryRun: false,
        })
        emitEvent({ type: 'step:start', step: 'bump', label: 'Computing the versions' })
        emitEvent({ type: 'step:start', step: 'bump', label: 'Computing the versions' })
        emitEvent({ type: 'step:start', label: 'A step without hook' })
        emitEvent({
          type: 'step:skipped',
          step: 'social',
          label: 'Social',
          reason: 'off',
        })
        emitEvent({ type: 'step:start', step: 'publish', label: 'Publishing the packages' })
        emitEvent({ type: 'release:finish', report: released })
      })

      expect(descriptions()).toEqual([
        'pending running checks',
        'pending running bump: Computing the versions',
        'pending running publish: Publishing the packages',
        'success released 1.1.0',
      ])
      const [url, init] = fetch.mock.calls[0]!
      expect(String(url)).toBe(`https://api.github.com/repos/acme/app/statuses/${SHA}`)
      expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer gh-token' })
      expect(bodies()[0]).toEqual({
        state: 'pending',
        context: 'relizy/release',
        description: 'running checks',
        target_url: 'https://github.com/acme/app/actions/runs/42',
      })
    })

    it('Then a failure posts its step and the first line of its error, the tokens masked', async () => {
      await run(config('github'), GITHUB_ENV, () => {
        emitEvent({
          type: 'command:start',
          command: 'release',
          title: 'relizy release',
          dryRun: false,
        })
        emitEvent({ type: 'step:start', step: 'push', label: 'Pushing' })
        emitEvent({
          type: 'command:error',
          message: 'push refused with gh-token\nremote: details',
          failedStep: 'Push',
          cancelled: false,
        })
      })

      expect(descriptions().at(-1)).toBe('failure failed push: push refused with ***')
    })

    it('Then a refused prompt is cancelled, nothing to release a success, a canary its version', async () => {
      await run(config('github'), GITHUB_ENV, () => {
        emitEvent({ type: 'step:start', step: 'bump', label: 'Bump' })
        emitEvent({ type: 'command:error', message: 'Release cancelled', cancelled: true })
      })
      await run(config('github'), GITHUB_ENV, () => {
        emitEvent({
          type: 'release:finish',
          report: { ...released, status: 'nothing', version: undefined },
        })
      })
      await run(config('github'), GITHUB_ENV, () => {
        emitEvent({
          type: 'release:finish',
          report: { ...released, canary: true, version: '1.2.0-0.canary-abc1234' },
        })
      })

      expect(descriptions()).toEqual([
        'pending running bump: Bump',
        'error cancelled bump',
        'success nothing to release',
        'success canary 1.2.0-0.canary-abc1234',
      ])
    })

    it('Then the events of another run of the process and of other commands are not posted', async () => {
      await run(config('github'), GITHUB_ENV, () => {
        emitEvent({
          type: 'command:start',
          command: 'bump',
          title: 'relizy bump',
          dryRun: false,
        })
        runWithEvents(undefined, () => {}, {})
      })
      // Another run, out of the context of this one
      startReleaseStatus({
        config: config('github'),
        dryRun: false,
        sha: SHA,
        env: GITHUB_ENV,
      })
      runWithEvents(undefined, () => {
        emitEvent({ type: 'step:start', step: 'publish', label: 'Publishing' })
      })
      await closeReleaseStatus()

      expect(fetch).not.toHaveBeenCalled()
      expect(process.listenerCount('SIGTERM')).toBe(0)
    })

    it('Then a refused post warns once with the permission to grant, and stops the next posts: the release goes on', async () => {
      fetch.mockImplementation(() => Promise.resolve(new Response('{"message":"Resource not accessible by integration"}', { status: 403 })))
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})

      await run(config('github'), GITHUB_ENV, () => {
        emitEvent({
          type: 'command:start',
          command: 'release',
          title: 'relizy release',
          dryRun: false,
        })
        emitEvent({ type: 'step:start', step: 'bump', label: 'Bump' })
        emitEvent({ type: 'release:finish', report: released })
      })

      expect(fetch).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^The commit status relizy\/release could not be set, the next ones are not posted: POST \/statuses\/abcdef1234567: 403 .* - grant "statuses: write" to the job/))
    })

    it('Then a forge that does not answer is given up after 5 seconds, the release not held longer', async () => {
      vi.useFakeTimers()
      fetch.mockImplementation(() => new Promise(() => {}))
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})

      const done = run(config('github'), GITHUB_ENV, () => {
        emitEvent({ type: 'release:finish', report: released })
      })
      await vi.advanceTimersByTimeAsync(5000)
      await done
      vi.useRealTimers()

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('no answer after 5s'))
    })
  })

  describe('When a release runs in GitLab CI', () => {
    it('Then the status joins the pipeline of the job, and a 409 is tried again once', async () => {
      fetch.mockImplementationOnce(() => Promise.resolve(new Response('{"message":"409 Conflict"}', { status: 409 })))

      await run(config('gitlab'), GITLAB_ENV, () => {
        emitEvent({
          type: 'command:start',
          command: 'release',
          title: 'relizy release',
          dryRun: false,
        })
        emitEvent({
          type: 'release:finish',
          report: {
            ...released,
            version: undefined,
            release: {
              projectName: 'acme',
              groups: [
                {
                  name: 'a',
                  title: 'a',
                  versionMode: 'independent',
                  packages: [
                    {
                      name: 'a',
                      oldVersion: '1.0.0',
                      newVersion: '1.1.0',
                      private: false,
                    },
                    {
                      name: 'b',
                      oldVersion: '1.0.0',
                      newVersion: '2.0.0',
                      private: false,
                    },
                  ],
                },
              ],
            },
          } as ReleaseReport,
        })
      })

      expect(fetch).toHaveBeenCalledTimes(3)
      const [url, init] = fetch.mock.calls[0]!
      expect(String(url)).toBe(`https://gitlab.com/api/v4/projects/acme%2Fapp/statuses/${SHA}`)
      expect((init as RequestInit).headers).toMatchObject({ 'PRIVATE-TOKEN': 'glpat-token' })
      expect(bodies()[1]).toEqual({
        state: 'running',
        name: 'relizy/release',
        description: 'running checks',
        target_url: 'https://gitlab.com/acme/app/-/jobs/9',
        ref: 'main',
        pipeline_id: 77,
      })
      expect(bodies()[2]).toMatchObject({ state: 'success', description: 'released 2 packages' })
    })

    it('Then only the first step and the end are posted: GitLab refuses a status in the state it has', async () => {
      await run(config('gitlab'), GITLAB_ENV, () => {
        emitEvent({
          type: 'command:start',
          command: 'release',
          title: 'relizy release',
          dryRun: false,
        })
        emitEvent({ type: 'step:start', step: 'bump', label: 'Computing the versions' })
        emitEvent({ type: 'step:start', step: 'publish', label: 'Publishing the packages' })
        emitEvent({ type: 'command:error', message: 'E403', cancelled: false })
      })

      expect(descriptions()).toEqual(['running running checks', 'failed failed publish: E403'])
    })

    it('Then the job token warns with the token to set, nothing is posted', async () => {
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})

      await run(config('gitlab', { token: 'job-token' }), { ...GITLAB_ENV, CI_JOB_TOKEN: 'job-token' }, () => {
        emitEvent({
          type: 'command:start',
          command: 'release',
          title: 'relizy release',
          dryRun: false,
        })
      })

      expect(fetch).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledWith('The commit status relizy/release is not posted: no usable token - set GITLAB_TOKEN (or RELIZY_GITLAB_TOKEN) to a token with the api scope, the job token cannot set commit statuses')
    })
  })

  describe('When the status is not to post', () => {
    it.each([
      {
        name: 'without release.report.status',
        cfg: () => config('github', { status: false }),
        env: GITHUB_ENV,
        dryRun: false,
      },
      {
        name: 'in dry-run',
        cfg: () => config('github'),
        env: GITHUB_ENV,
        dryRun: true,
      },
      {
        name: 'outside CI',
        cfg: () => config('github'),
        env: {},
        dryRun: false,
      },
      {
        name: 'on a pull request run',
        cfg: () => config('github'),
        env: { ...GITHUB_ENV, GITHUB_EVENT_NAME: 'pull_request' },
        dryRun: false,
      },
    ])('Then nothing is posted $name', async ({ cfg, env, dryRun }) => {
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})

      await run(cfg(), env, () => {
        emitEvent({
          type: 'command:start',
          command: 'release',
          title: 'relizy release',
          dryRun,
        })
        emitEvent({ type: 'release:finish', report: released })
      }, { dryRun })

      expect(fetch).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
    })
  })

  describe('When the job is cancelled while the release runs', () => {
    it('Then the status says cancelled at the running step, then the signal goes on', async () => {
      const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)

      await runWithEvents(undefined, async () => {
        startReleaseStatus({
          config: config('github'),
          dryRun: false,
          sha: SHA,
          env: GITHUB_ENV,
        })
        emitEvent({ type: 'step:start', step: 'publish', label: 'Publishing' })
        process.emit('SIGTERM')
        await vi.waitFor(() => expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM'))
        await closeReleaseStatus()
      })

      expect(descriptions()).toEqual(['pending running publish: Publishing', 'error cancelled publish'])
      expect(process.listenerCount('SIGTERM')).toBe(0)
    })
  })
})
