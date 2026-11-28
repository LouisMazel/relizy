import type { ReleaseStatusUpdate } from '../release-status'
import { formatReleaseStatus, parseReleaseStatus, readReleaseStatus, RELEASE_STATUS_CONTEXT } from '../release-status'

// The contract an app reads: these descriptions and states never change their meaning
const CONTRACT: { update: ReleaseStatusUpdate, github: string, gitlab: string, description: string }[] = [
  {
    update: { phase: 'running', step: 'checks' },
    github: 'pending',
    gitlab: 'running',
    description: 'running checks',
  },
  {
    update: { phase: 'running', step: 'publish', label: 'Publishing the packages' },
    github: 'pending',
    gitlab: 'running',
    description: 'running publish: Publishing the packages',
  },
  {
    update: { phase: 'released', version: '1.2.0' },
    github: 'success',
    gitlab: 'success',
    description: 'released 1.2.0',
  },
  {
    update: { phase: 'released', packages: 3 },
    github: 'success',
    gitlab: 'success',
    description: 'released 3 packages',
  },
  {
    update: { phase: 'released', version: '1.3.0-0.canary-a3f4b2c', canary: true },
    github: 'success',
    gitlab: 'success',
    description: 'canary 1.3.0-0.canary-a3f4b2c',
  },
  {
    update: { phase: 'nothing' },
    github: 'success',
    gitlab: 'success',
    description: 'nothing to release',
  },
  {
    update: { phase: 'failed', step: 'push', message: 'rejected by the remote' },
    github: 'failure',
    gitlab: 'failed',
    description: 'failed push: rejected by the remote',
  },
  {
    update: { phase: 'cancelled', step: 'publish' },
    github: 'error',
    gitlab: 'canceled',
    description: 'cancelled publish',
  },
]

describe('Given the commit status of a release', () => {
  describe('When it is formatted, then read back', () => {
    it.each(CONTRACT)('Then $description keeps its state and its meaning on both forges', ({ update, github, gitlab, description }) => {
      const onGithub = formatReleaseStatus(update, { provider: 'github' })
      const onGitlab = formatReleaseStatus(update, { provider: 'gitlab' })

      expect(onGithub).toEqual({ state: github, description })
      expect(onGitlab).toEqual({ state: gitlab, description })
      expect(parseReleaseStatus(onGithub)).toEqual(update)
      expect(parseReleaseStatus(onGitlab)).toEqual(update)
    })
  })

  describe('When the error is long, on several lines, multi-byte or holds a secret', () => {
    it('Then only its first line is kept, the secrets masked, and the description cut at 140 characters', () => {
      const { description } = formatReleaseStatus({
        phase: 'failed',
        step: 'publish',
        message: `\nnpm error 403 for token ghp_secret1234 ${'é'.repeat(200)}\nat line 2`,
      }, {
        provider: 'github',
        secrets: ['ghp_secret1234'],
      })

      expect(Array.from(description)).toHaveLength(140)
      expect(description.startsWith('failed publish: npm error 403 for token *** é')).toBe(true)
      expect(description.endsWith('é...')).toBe(true)
      expect(description).not.toContain('at line 2')
      expect(parseReleaseStatus({ state: 'failure', description })).toMatchObject({ phase: 'failed', step: 'publish' })
    })
  })

  describe('When the status was written by something else, or does not match its state', () => {
    it.each([
      { state: 'success', description: 'Build passed' },
      { state: 'pending', description: 'released 1.2.0' },
      { state: 'success', description: 'running publish' },
      { state: 'error', description: 'cancelled publish: why' },
      { state: 'success', description: '' },
      { state: 'success', description: 'nothing to do' },
    ])('Then $description ($state) is unknown, never an error', (status) => {
      expect(parseReleaseStatus(status)).toEqual({ phase: 'unknown' })
    })
  })
})

describe('Given the reader of the release status', () => {
  function answer(body: unknown, status = 200) {
    return vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), {
      status,
      statusText: status === 200
        ? 'OK'
        : 'Not Found',
    }))
  }

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('When the commit has statuses on GitHub', () => {
    it('Then gives the newest relizy/release, the other contexts ignored', async () => {
      const fetch = answer([
        {
          state: 'success',
          context: 'ci/tests',
          description: 'ok',
          target_url: null,
        },
        {
          state: 'pending',
          context: RELEASE_STATUS_CONTEXT,
          description: 'running push: Pushing the release commit',
          target_url: 'https://github.com/acme/app/actions/runs/1',
          updated_at: '2026-11-28T10:00:02Z',
        },
        {
          state: 'pending',
          context: RELEASE_STATUS_CONTEXT,
          description: 'running publish',
          target_url: null,
          updated_at: '2026-11-28T10:00:01Z',
        },
      ])

      const status = await readReleaseStatus({
        provider: 'github',
        repo: 'acme/app',
        token: 'gh-token',
        sha: 'abc',
        fetch,
      })

      expect(fetch).toHaveBeenCalledWith('https://api.github.com/repos/acme/app/commits/abc/statuses?per_page=100', expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ authorization: 'Bearer gh-token' }),
      }))
      expect(status).toEqual({
        phase: 'running',
        step: 'push',
        label: 'Pushing the release commit',
        state: 'pending',
        description: 'running push: Pushing the release commit',
        url: 'https://github.com/acme/app/actions/runs/1',
        updatedAt: '2026-11-28T10:00:02Z',
      })
    })

    it('Then gives nothing without a relizy/release status, and throws a refused request', async () => {
      await expect(readReleaseStatus({
        provider: 'github',
        repo: 'acme/app',
        token: 't',
        sha: 'abc',
        fetch: answer([
          {
            state: 'success',
            context: 'ci',
            description: 'ok',
            target_url: null,
          },
        ]),
      })).resolves.toBeUndefined()
      await expect(readReleaseStatus({
        provider: 'github',
        repo: 'acme/app',
        domain: 'git.acme.com',
        token: 't',
        sha: 'abc',
        fetch: answer({ message: 'Not Found' }, 404),
      }))
        .rejects
        .toThrow('[GET] "https://git.acme.com/api/v3/repos/acme/app/commits/abc/statuses?per_page=100": 404 Not Found {"message":"Not Found"}')
    })
  })

  describe('When the commit has statuses on GitLab', () => {
    it('Then asks every status of the name, newest first, on the ref given', async () => {
      const fetch = answer([
        {
          status: 'success',
          name: RELEASE_STATUS_CONTEXT,
          description: 'released 1.2.0',
          target_url: 'https://gitlab.com/acme/app/-/jobs/9',
          created_at: '2026-11-28T10:00:00Z',
          finished_at: '2026-11-28T10:01:00Z',
        },
      ])

      const status = await readReleaseStatus({
        provider: 'gitlab',
        repo: 'acme/app',
        token: 'glpat-token',
        sha: 'abc',
        ref: 'feat/x',
        fetch,
      })

      expect(fetch).toHaveBeenCalledWith('https://gitlab.com/api/v4/projects/acme%2Fapp/repository/commits/abc/statuses?name=relizy%2Frelease&all=true&order_by=id&sort=desc&ref=feat%2Fx', expect.objectContaining({
        headers: expect.objectContaining({ 'PRIVATE-TOKEN': 'glpat-token' }),
      }))
      expect(status).toMatchObject({
        phase: 'released',
        version: '1.2.0',
        state: 'success',
        updatedAt: '2026-11-28T10:01:00Z',
      })
    })

    it('Then refuses the job token, which cannot read commit statuses', async () => {
      vi.stubEnv('CI_JOB_TOKEN', 'job-token')
      const fetch = answer([])

      await expect(readReleaseStatus({
        provider: 'gitlab',
        repo: 'acme/app',
        token: 'job-token',
        sha: 'abc',
        fetch,
      })).rejects.toThrow('The CI_JOB_TOKEN of GitLab cannot read commit statuses')
      expect(fetch).not.toHaveBeenCalled()
    })
  })
})
