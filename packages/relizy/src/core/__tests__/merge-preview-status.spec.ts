import type { MergePreviewContext } from '../merge-preview/context'
import { logger } from '@maz-ui/node'
import { createMockConfig } from '../../../tests/mocks'
import { setMergePreviewStatus } from '../merge-preview/status'

function context(provider: 'github' | 'gitlab'): MergePreviewContext {
  return {
    pullRequest: {
      provider,
      kind: provider === 'github'
        ? 'pull request'
        : 'merge request',
      number: 7,
      targetBranch: 'main',
    },
    targetSha: 'target',
    headSha: 'abcdef1234567',
    commits: [],
    merged: true,
  }
}

function config(provider: 'github' | 'gitlab', token: string) {
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
  })
}

describe('Given the commit status of the merge preview', () => {
  let fetch: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.unstubAllEnvs()
    for (const name of [
      'GITHUB_SERVER_URL',
      'GITHUB_REPOSITORY',
      'GITHUB_RUN_ID',
      'CI_JOB_URL',
      'CI_JOB_TOKEN',
    ]) {
      vi.stubEnv(name, '')
    }
    fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  function sent() {
    const [url, init] = fetch.mock.calls[0]!
    return {
      url: String(url),
      init: init as RequestInit,
      body: JSON.parse(String((init as RequestInit).body)),
    }
  }

  describe('When it is set on GitHub in a GitHub Actions run', () => {
    it('Then posts the state, the context and the description, linked to the run', async () => {
      vi.stubEnv('GITHUB_SERVER_URL', 'https://github.com')
      vi.stubEnv('GITHUB_REPOSITORY', 'acme/app')
      vi.stubEnv('GITHUB_RUN_ID', '42')

      await expect(setMergePreviewStatus({
        config: config('github', 'gh-token'),
        context: context('github'),
        failed: false,
        description: 'releases app 1.1.0',
      })).resolves.toBe(true)

      const { url, init, body } = sent()
      expect(url).toBe('https://api.github.com/repos/acme/app/statuses/abcdef1234567')
      expect(init.method).toBe('POST')
      expect(init.headers).toMatchObject({ Authorization: 'Bearer gh-token' })
      expect(body).toEqual({
        state: 'success',
        context: 'relizy/merge-preview',
        description: 'releases app 1.1.0',
        target_url: 'https://github.com/acme/app/actions/runs/42',
      })
    })

    it('Then a release that would fail is a failure', async () => {
      await setMergePreviewStatus({
        config: config('github', 'gh-token'),
        context: context('github'),
        failed: true,
        description: 'would fail',
      })

      expect(sent().body).toEqual({ state: 'failure', context: 'relizy/merge-preview', description: 'would fail' })
    })
  })

  describe('When it is set on GitLab in a GitLab CI job', () => {
    it('Then posts the state, the name and the description, linked to the job', async () => {
      vi.stubEnv('CI_JOB_URL', 'https://gitlab.com/acme/app/-/jobs/9')

      await setMergePreviewStatus({
        config: config('gitlab', 'glpat-token'),
        context: context('gitlab'),
        failed: true,
        description: 'would fail',
      })

      const { url, init, body } = sent()
      expect(url).toBe('https://gitlab.com/api/v4/projects/acme%2Fapp/statuses/abcdef1234567')
      expect(init.headers).toMatchObject({ 'PRIVATE-TOKEN': 'glpat-token' })
      expect(body).toEqual({
        state: 'failed',
        name: 'relizy/merge-preview',
        description: 'would fail',
        target_url: 'https://gitlab.com/acme/app/-/jobs/9',
      })
    })

    it('Then the job token is refused with a warning, nothing is posted', async () => {
      vi.stubEnv('CI_JOB_TOKEN', 'job-token')
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})

      await expect(setMergePreviewStatus({
        config: config('gitlab', 'job-token'),
        context: context('gitlab'),
        failed: false,
        description: 'ok',
      })).resolves.toBe(false)

      expect(fetch).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('The CI_JOB_TOKEN of GitLab cannot set commit statuses'))
    })
  })

  describe('When the API refuses the status', () => {
    it('Then warns and resolves false', async () => {
      fetch.mockResolvedValue(new Response('{"message":"Resource not accessible by integration"}', { status: 403 }))
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})

      await expect(setMergePreviewStatus({
        config: config('github', 'gh-token'),
        context: context('github'),
        failed: false,
        description: 'ok',
      })).resolves.toBe(false)

      expect(warn).toHaveBeenCalledWith('Failed to set the commit status of the merge preview: POST /statuses/abcdef1234567: 403 {"message":"Resource not accessible by integration"}')
    })
  })
})
