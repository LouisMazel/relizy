import type { GitRepository } from '../../../../../tests/git-repository'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { createGitRepository } from '../../../../../tests/git-repository'
import { isVersionPublished } from '../../core/npm-versions'
import { MERGE_PREVIEW_MARKER } from '../../core/pr-comment'
import { mergePreview, MergePreviewError } from '../merge-preview'

vi.mock('../../core/npm-versions', async importOriginal => ({
  ...await importOriginal<typeof import('../../core/npm-versions')>(),
  isVersionPublished: vi.fn(),
}))

/** The variables telling relizy it runs in a CI, cleared so the tests run the same locally and in CI */
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
]

describe('Given the merge preview of a GitHub pull request', () => {
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

  /** Answers the API calls of the pull request #7: merge methods, comments, statuses */
  function mockApi() {
    return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      const json = url.endsWith('/repos/test/repo')
        ? { allow_squash_merge: false, allow_merge_commit: true }
        : url.endsWith('/comments?per_page=100')
          ? []
          : {}
      return Promise.resolve(new Response(JSON.stringify(json), { status: 200 }))
    })
  }

  function calls(fetch: ReturnType<typeof mockApi>, method: string, suffix: string) {
    return fetch.mock.calls
      .filter(([input, init]) => String(input).includes(suffix) && (init?.method ?? 'GET') === method)
      .map(([, init]) => JSON.parse(String(init?.body)))
  }

  beforeEach(() => {
    for (const name of CI_VARIABLES) {
      vi.stubEnv(name, undefined)
    }
    vi.mocked(isVersionPublished).mockReset().mockResolvedValue(false)

    origin = createGitRepository('relizy-merge-preview-command-')
    origin.writeJson('.', { name: 'app', version: '1.0.0' })
    origin.write('relizy.config.mjs', `export default { logLevel: 'silent', noAuthors: true, publish: { packageManager: 'npm' } }\n`)
    origin.commit('chore: init')
    origin.git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0')

    dir = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-merge-preview-command-clone-')))
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
    headSha = git('rev-parse', 'HEAD')

    const eventPath = join(dir, 'event.json')
    writeFileSync(eventPath, JSON.stringify({
      pull_request: {
        number: 7,
        title: 'feat: the api',
        head: { sha: headSha },
      },
    }))
    vi.stubEnv('CI', 'true')
    vi.stubEnv('GITHUB_ACTIONS', 'true')
    vi.stubEnv('GITHUB_EVENT_NAME', 'pull_request')
    vi.stubEnv('GITHUB_BASE_REF', 'main')
    vi.stubEnv('GITHUB_HEAD_REF', 'feature')
    vi.stubEnv('GITHUB_EVENT_PATH', eventPath)
    vi.stubEnv('RELIZY_GITHUB_TOKEN', 'gh-token')

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

  it('When nothing blocks the release, Then comments what the merge releases and sets a success status, without writing anything', async () => {
    const fetch = mockApi()

    const report = await mergePreview()

    expect(report).toMatchObject({
      status: 'released',
      released: false,
      dryRun: true,
      version: '1.1.0',
      mergePreview: {
        pullRequest: 7,
        squash: 'commits',
        problems: [],
        warnings: [],
      },
    })

    const [comment] = calls(fetch, 'POST', '/issues/7/comments')
    expect(comment.body).toContain(MERGE_PREVIEW_MARKER)
    expect(comment.body).toContain('| app | `1.0.0` → `1.1.0` | this PR: 1 feature |')

    expect(calls(fetch, 'POST', `/statuses/${headSha}`)).toEqual([
      { state: 'success', context: 'relizy/merge-preview', description: 'Releases app@1.1.0' },
    ])

    expect(JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).version).toBe('1.0.0')
    expect(git('status', '--porcelain')).toBe('')
    expect(git('tag', '--list')).toBe('v1.0.0')
    expect(git('rev-parse', 'HEAD')).toBe(headSha)
  })

  it('When the tag of the release already exists on the remote, Then fails with a failed status', async () => {
    const fetch = mockApi()
    origin.git('tag', '-a', 'v1.1.0', '-m', 'v1.1.0')

    await expect(mergePreview()).rejects.toThrow(MergePreviewError)

    const [status] = calls(fetch, 'POST', `/statuses/${headSha}`)
    expect(status).toMatchObject({
      state: 'failure',
      description: expect.stringContaining('The tag v1.1.0 already exists on the remote'),
    })
    expect(calls(fetch, 'POST', '/issues/7/comments')[0].body).toContain('#### ❌ The release of the merge would fail')
  })

  it('When the comment and the status are disabled, Then calls no API for them', async () => {
    const fetch = mockApi()

    await mergePreview({ comment: false, check: false })

    expect(calls(fetch, 'POST', '/comments')).toEqual([])
    expect(calls(fetch, 'POST', '/statuses/')).toEqual([])
  })

  it('When an application only computes it with the changelogs, Then posts nothing and gives the preview as data', async () => {
    const fetch = mockApi()

    const report = await mergePreview({ comment: false, check: false, changelog: true })

    expect(calls(fetch, 'POST', '/comments')).toEqual([])
    expect(calls(fetch, 'POST', '/statuses/')).toEqual([])
    expect(report.release?.groups).toEqual([
      expect.objectContaining({ version: '1.1.0', tag: 'v1.1.0' }),
    ])
    expect(report.mergePreview).toMatchObject({
      pullRequest: 7,
      pullRequestDetails: {
        provider: 'github',
        kind: 'pull request',
        number: 7,
        title: 'feat: the api',
        targetBranch: 'main',
        merged: true,
      },
      branch: 'main',
      packages: [
        {
          name: 'app',
          oldVersion: '1.0.0',
          newVersion: '1.1.0',
          reason: 'commits',
          fromPullRequest: true,
          commits: [
            expect.objectContaining({ type: 'feat', description: 'the api', fromPullRequest: true }),
          ],
        },
      ],
      publish: { enabled: true, distTag: 'latest' },
      changelogs: [
        {
          file: 'CHANGELOG.md',
          packageName: 'app',
          content: expect.stringContaining('- The api'),
        },
      ],
      posted: { comment: false, status: false },
    })
    expect(report.mergePreview).not.toHaveProperty('squashPackages')
  })

  it('When the release would fail, Then the error carries the report with the problems', async () => {
    mockApi()
    vi.mocked(isVersionPublished).mockResolvedValue(true)

    const error = await mergePreview({ comment: false, check: false }).catch((error_: unknown) => error_)

    expect(error).toBeInstanceOf(MergePreviewError)
    expect((error as MergePreviewError).report?.mergePreview?.problems).toEqual([
      expect.objectContaining({ kind: 'version-taken' }),
    ])
  })

  it('When it comments and sets the status, Then the report tells what was posted', async () => {
    mockApi()

    const report = await mergePreview()

    expect(report.mergePreview?.posted).toEqual({ comment: true, status: true })
    expect(report.mergePreview).not.toHaveProperty('changelogs')
  })

  it('When it runs with the release type of the release job, Then previews the versions of this release', async () => {
    mockApi()

    const report = await mergePreview({ type: 'major', comment: false, check: false })

    expect(report).toMatchObject({ status: 'released', version: '2.0.0' })
  })

  describe('When it runs with a profile', () => {
    beforeEach(() => {
      writeFileSync(join(cwd, 'relizy.config.mjs'), `export default {
  logLevel: 'silent',
  noAuthors: true,
  publish: { packageManager: 'npm' },
  profiles: {
    beta: { bump: { type: 'prerelease', preid: 'beta' }, publish: { tag: 'beta' } },
    canary: { release: { canary: true } },
  },
}
`)
      git('add', '-A')
      git('commit', '--quiet', '-m', 'chore: add the profiles')
    })

    it('Then previews the release of the profile', async () => {
      mockApi()

      const report = await mergePreview({ profile: 'beta', comment: false, check: false })

      expect(report).toMatchObject({ status: 'released', canary: false, version: '1.1.0-beta.0' })
      expect(report.mergePreview?.markdown).toContain('`beta`')
    })

    it('Then previews a canary release of a canary profile, and says it in the report', async () => {
      mockApi()

      const report = await mergePreview({ profile: 'canary', comment: false, check: false })

      expect(report).toMatchObject({ status: 'released', canary: true })
      expect(report.version).toMatch(/^1\.1\.0-0\.canary-[0-9a-f]+$/)
      expect(report.mergePreview?.markdown).toContain('`canary`')
    })
  })

  it('When it runs in GitHub Actions, Then the status links to the run', async () => {
    const fetch = mockApi()
    vi.stubEnv('GITHUB_SERVER_URL', 'https://github.com')
    vi.stubEnv('GITHUB_REPOSITORY', 'test/repo')
    vi.stubEnv('GITHUB_RUN_ID', '42')

    await mergePreview({ comment: false })

    expect(calls(fetch, 'POST', `/statuses/${headSha}`)).toEqual([
      expect.objectContaining({ target_url: 'https://github.com/test/repo/actions/runs/42' }),
    ])
  })

  it('When the repository has no commit yet, Then fails with a clear message', async () => {
    const empty = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-merge-preview-empty-')))
    execFileSync('git', ['init', '--quiet'], { cwd: empty })
    writeFileSync(join(empty, 'package.json'), JSON.stringify({ name: 'empty', version: '0.0.0' }))
    vi.stubEnv('GITHUB_BASE_REF', undefined)
    vi.stubEnv('GITHUB_EVENT_PATH', undefined)
    process.chdir(empty)

    try {
      await expect(mergePreview({ comment: false, check: false })).rejects.toThrow('The next release would fail:\n- The repository has no commit yet')
    }
    finally {
      process.chdir(cwd)
      rmSync(empty, { recursive: true, force: true })
    }
  })
})
