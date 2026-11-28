import type { GitRepository } from '../../../../../tests/git-repository'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { logger } from '@maz-ui/node'
import { createGitRepository } from '../../../../../tests/git-repository'
import { isVersionPublished } from '../../core/npm-versions'
import { MERGE_PREVIEW_MARKER } from '../../core/pr-comment'
import { mergePreview } from '../merge-preview'

vi.mock('../../core/npm-versions', async importOriginal => ({
  ...await importOriginal<typeof import('../../core/npm-versions')>(),
  isVersionPublished: vi.fn(),
}))

/** The variables telling relizy it runs in a CI, cleared: these tests run outside any pipeline */
const CI_VARIABLES = [
  'CI',
  'CONTINUOUS_INTEGRATION',
  'GITHUB_ACTIONS',
  'GITHUB_WORKFLOW',
  'GITLAB_CI',
  'BUILD_ID',
  'JENKINS_URL',
  'JENKINS_HOME',
  'GITHUB_BASE_REF',
  'GITHUB_HEAD_REF',
  'GITHUB_EVENT_PATH',
  'GITHUB_EVENT_NAME',
  'CI_MERGE_REQUEST_TARGET_BRANCH_NAME',
  'GITHUB_SERVER_URL',
  'GITHUB_REPOSITORY',
  'GITHUB_RUN_ID',
  'CI_JOB_URL',
  'CI_JOB_TOKEN',
  'RELIZY_GITHUB_TOKEN',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'RELIZY_GITLAB_TOKEN',
  'GITLAB_TOKEN',
  'GITLAB_API_TOKEN',
]

type Route = (url: string, method: string) => { status?: number, json: unknown } | undefined

describe('Given the merge preview of a pull request run outside its pipeline, with prNumber', () => {
  let origin: GitRepository
  let dir: string
  let cwd: string
  let initialCwd: string
  let headSha: string

  function git(...args: string[]) {
    return execFileSync('git', [
      '-c',
      'user.name=Dev',
      '-c',
      'user.email=dev@example.com',
      ...args,
    ], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  }

  function useConfig(repo: string) {
    writeFileSync(join(cwd, 'relizy.config.mjs'), `export default { logLevel: 'silent', noAuthors: true, publish: { packageManager: 'npm' }${repo} }\n`)
    git('add', '-A')
    git('commit', '--quiet', '-m', 'chore: the repository')
    headSha = git('rev-parse', 'HEAD')
  }

  /** Answers the API with the first route matching, `{}` otherwise */
  function mockApi(route: Route) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const answer = route(String(input), init?.method ?? 'GET') ?? { json: {} }
      return Promise.resolve(new Response(JSON.stringify(answer.json), { status: answer.status ?? 200 }))
    })
  }

  function calls(fetch: ReturnType<typeof mockApi>, method: string, suffix: string) {
    return fetch.mock.calls
      .filter(([input, init]) => String(input).includes(suffix) && (init?.method ?? 'GET') === method)
      .map(([, init]) => init?.body
        ? JSON.parse(String(init.body))
        : undefined)
  }

  beforeEach(() => {
    for (const name of CI_VARIABLES) {
      vi.stubEnv(name, undefined)
    }
    vi.mocked(isVersionPublished).mockReset().mockResolvedValue(false)

    origin = createGitRepository('relizy-merge-preview-local-')
    origin.writeJson('.', { name: 'app', version: '1.0.0' })
    origin.write('relizy.config.mjs', `export default { logLevel: 'silent', noAuthors: true }\n`)
    origin.commit('chore: init')
    origin.git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0')

    dir = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-merge-preview-local-clone-')))
    cwd = join(dir, 'clone')
    execFileSync('git', [
      'clone',
      '--quiet',
      `file://${origin.cwd}`,
      cwd,
    ])
    git('checkout', '--quiet', '-b', 'feature')
    writeFileSync(join(cwd, 'index.js'), 'api')
    git('add', '-A')
    git('commit', '--quiet', '-m', 'feat: the api')

    initialCwd = process.cwd()
    process.chdir(cwd)
  })

  afterEach(() => {
    process.chdir(initialCwd)
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    origin.remove()
    rmSync(dir, { recursive: true, force: true })
  })

  describe('When the repository is on GitHub', () => {
    let comments: { id: number, body: string }[]

    const github: Route = (url, method) => {
      if (url.endsWith('/repos/test/repo/pulls/7')) {
        return {
          json: {
            number: 7,
            state: 'open',
            title: 'feat: the api',
            body: '',
            base: { ref: 'main' },
            head: { sha: headSha },
          },
        }
      }
      if (url.endsWith('/repos/test/repo/pulls/8')) {
        return {
          status: 404,
          json: { message: 'Not Found' },
        }
      }
      if (url.endsWith('/repos/test/repo')) {
        return {
          json: { allow_squash_merge: false, allow_merge_commit: true },
        }
      }
      if (url.endsWith('/comments?per_page=100')) {
        return { json: comments }
      }
      if (method === 'POST' && url.endsWith('/issues/7/comments')) {
        return {
          status: 201,
          json: { id: 1 },
        }
      }
      return undefined
    }

    beforeEach(() => {
      comments = []
      useConfig(`, repo: { provider: 'github', domain: 'github.com', repo: 'test/repo' }`)
    })

    it('Then without prNumber, nothing is read nor posted, as before', async () => {
      vi.stubEnv('RELIZY_GITHUB_TOKEN', 'gh-token')
      const fetch = mockApi(github)

      const report = await mergePreview()

      expect(report.mergePreview?.posted).toEqual({ comment: false, status: false })
      expect(report.mergePreview?.pullRequest).toBeUndefined()
      expect(calls(fetch, 'GET', '/pulls/')).toEqual([])
      expect(calls(fetch, 'POST', '/comments')).toEqual([])
    })

    it('Then it posts the comment with the token, then updates it instead of posting a second one', async () => {
      vi.stubEnv('RELIZY_GITHUB_TOKEN', 'gh-token')
      const fetch = mockApi(github)

      const first = await mergePreview({ prNumber: 7 })

      expect(first.mergePreview?.posted).toEqual({ comment: true, status: false })
      expect(first.mergePreview?.pullRequest).toBe(7)
      const [comment] = calls(fetch, 'POST', '/issues/7/comments')
      expect(comment.body).toContain(MERGE_PREVIEW_MARKER)
      expect(comment.body).toContain('1.1.0')

      comments = [
        { id: 1, body: comment.body },
      ]
      fetch.mockClear()
      const second = await mergePreview({ prNumber: 7 })

      expect(second.mergePreview?.posted).toEqual({ comment: true, status: false })
      expect(calls(fetch, 'POST', '/issues/7/comments')).toEqual([])
      expect(calls(fetch, 'PATCH', '/issues/comments/1')).toHaveLength(1)
    })

    it('Then without token, it says why nothing is posted', async () => {
      const fetch = mockApi(github)

      const report = await mergePreview({ prNumber: 7 })

      expect(report.mergePreview?.posted).toEqual({
        comment: false,
        status: false,
        reason: 'no GitHub token: set RELIZY_GITHUB_TOKEN, GITHUB_TOKEN or GH_TOKEN, or log in with gh auth login',
      })
      expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/comments'), expect.anything())
    })

    it('Then a pull request not found is the reason', async () => {
      vi.stubEnv('RELIZY_GITHUB_TOKEN', 'gh-token')
      mockApi(github)

      const report = await mergePreview({ prNumber: 8 })

      expect(report.mergePreview?.posted).toEqual({ comment: false, status: false, reason: 'the pull request #8 was not found in test/repo' })
    })

    it('Then it never posts the preview of another commit than the last one of the pull request', async () => {
      vi.stubEnv('RELIZY_GITHUB_TOKEN', 'gh-token')
      const fetch = mockApi(github)
      writeFileSync(join(cwd, 'other.js'), 'local')
      git('add', '-A')
      git('commit', '--quiet', '-m', 'feat: not pushed')

      const report = await mergePreview({ prNumber: 7 })

      expect(report.mergePreview?.posted.comment).toBe(false)
      expect(report.mergePreview?.posted.reason).toMatch(/^HEAD \([0-9a-f]{7}\) is not the last commit of the pull request #7 \([0-9a-f]{7}\): check out its branch and pull, then run again$/)
      expect(calls(fetch, 'POST', '/comments')).toEqual([])
    })
  })

  describe('When the forge of the repository is unknown', () => {
    it('Then it says why nothing is posted', async () => {
      useConfig(`, repo: { domain: 'git.example.com', repo: 'test/repo' }`)
      mockApi(() => undefined)

      const report = await mergePreview({ prNumber: 7 })

      expect(report.mergePreview?.posted.comment).toBe(false)
      expect(report.mergePreview?.posted.reason).toMatch(/^the forge of the repository is unknown/)
    })
  })

  describe('When the repository is on GitLab', () => {
    let notes: { id: number, body: string }[]

    const gitlab: Route = (url, method) => {
      if (url.endsWith('/projects/test%2Frepo/merge_requests/7')) {
        return {
          json: {
            iid: 7,
            state: 'opened',
            title: 'Draft: feat: the api',
            description: '',
            target_branch: 'main',
            sha: headSha,
          },
        }
      }
      if (url.includes('/merge_requests/7/notes?')) {
        return { json: notes }
      }
      if (method === 'POST' && url.endsWith('/merge_requests/7/notes')) {
        return {
          status: 201,
          json: { id: 3 },
        }
      }
      return undefined
    }

    beforeEach(() => {
      notes = []
      useConfig(`, repo: { provider: 'gitlab', domain: 'gitlab.com', repo: 'test/repo' }`)
    })

    it('Then it posts the note with the token, then updates it', async () => {
      vi.stubEnv('RELIZY_GITLAB_TOKEN', 'glpat-token')
      const fetch = mockApi(gitlab)

      const first = await mergePreview({ prNumber: 7 })

      expect(first.mergePreview?.posted).toEqual({ comment: true, status: false })
      const [note] = calls(fetch, 'POST', '/merge_requests/7/notes')
      expect(note.body).toContain(MERGE_PREVIEW_MARKER)

      notes = [
        { id: 3, body: note.body },
      ]
      fetch.mockClear()
      await mergePreview({ prNumber: 7 })

      expect(calls(fetch, 'POST', '/merge_requests/7/notes')).toEqual([])
      expect(calls(fetch, 'PUT', '/merge_requests/7/notes/3')).toHaveLength(1)
    })

    it('Then without token, it says why nothing is posted', async () => {
      mockApi(gitlab)

      const report = await mergePreview({ prNumber: 7 })

      expect(report.mergePreview?.posted.reason).toBe('no GitLab token: set RELIZY_GITLAB_TOKEN, GITLAB_TOKEN or GITLAB_API_TOKEN, or log in with glab auth login')
    })

    it('Then the warning names the merge request as GitLab does', async () => {
      mockApi(gitlab)
      const warn = vi.spyOn(logger, 'warn')

      await mergePreview({ prNumber: 7 })

      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^Nothing posted on the merge request !7: no GitLab token/))
    })
  })
})
