import type { GitRepository } from '../../../tests/git-repository'
import type { MergePreviewPullRequest } from '../merge-preview/context'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGitRepository } from '../../../tests/git-repository'
import { withGitCache } from '../git-cache'
import { getMergePreviewPullRequest, prepareMergePreviewContext } from '../merge-preview/context'

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
]

const cleanups: (() => void)[] = []

function tempDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-merge-preview-')))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** An origin on `main` (tag v1.0.0) and a clone on `feature`, which adds a commit */
function setup(): { origin: GitRepository, cwd: string, git: (...args: string[]) => string } {
  const origin = createGitRepository('relizy-merge-preview-origin-')
  cleanups.push(origin.remove)
  origin.commit('chore: init', { 'package.json': '{ "version": "1.0.0" }\n' })
  origin.git('tag', 'v1.0.0')

  const cwd = join(tempDir(), 'clone')
  execFileSync('git', [
    'clone',
    '--quiet',
    `file://${origin.cwd}`,
    cwd,
  ])
  const git = (...args: string[]) => execFileSync('git', [
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

  git('checkout', '--quiet', '-b', 'feature')
  writeFileSync(join(cwd, 'feature.txt'), 'feature')
  git('add', '-A')
  git('commit', '--quiet', '-m', 'feat: add the feature')

  return { origin, cwd, git }
}

const pullRequest: MergePreviewPullRequest = {
  provider: 'github',
  kind: 'pull request',
  number: 12,
  targetBranch: 'main',
}

beforeEach(() => {
  for (const name of CI_VARIABLES) {
    vi.stubEnv(name, undefined)
  }
})

afterEach(() => {
  vi.unstubAllEnvs()
})

afterAll(() => {
  for (const cleanup of cleanups) {
    cleanup()
  }
})

describe('Given the environment of a CI job', () => {
  it('When it runs for a GitHub pull request, Then reads the pull request from the event', () => {
    const eventPath = join(tempDir(), 'event.json')
    writeFileSync(eventPath, JSON.stringify({
      pull_request: {
        number: 42,
        title: 'feat: add it',
        body: 'The why',
        head: { sha: 'abc123' },
      },
    }))

    expect(getMergePreviewPullRequest({ GITHUB_ACTIONS: 'true', GITHUB_BASE_REF: 'main', GITHUB_EVENT_PATH: eventPath })).toEqual({
      provider: 'github',
      kind: 'pull request',
      number: 42,
      title: 'feat: add it',
      body: 'The why',
      targetBranch: 'main',
      headSha: 'abc123',
    })
  })

  it('When the event of GitHub is unreadable, Then keeps the target branch', () => {
    expect(getMergePreviewPullRequest({ GITHUB_ACTIONS: 'true', GITHUB_BASE_REF: 'develop', GITHUB_EVENT_PATH: '/nowhere/event.json' })).toEqual({
      provider: 'github',
      kind: 'pull request',
      number: undefined,
      title: undefined,
      body: undefined,
      targetBranch: 'develop',
      headSha: undefined,
    })
  })

  it('When it runs for a GitLab merge request, Then reads the merge request without its draft marker', () => {
    expect(getMergePreviewPullRequest({
      GITLAB_CI: 'true',
      CI_MERGE_REQUEST_TARGET_BRANCH_NAME: 'main',
      CI_MERGE_REQUEST_IID: '7',
      CI_MERGE_REQUEST_TITLE: 'Draft: fix: the bug',
      CI_MERGE_REQUEST_DESCRIPTION: 'Closes #3',
      CI_COMMIT_SHA: 'def456',
    })).toEqual({
      provider: 'gitlab',
      kind: 'merge request',
      number: 7,
      title: 'fix: the bug',
      body: 'Closes #3',
      targetBranch: 'main',
      headSha: 'def456',
    })
  })

  it('When it is a merged results pipeline of GitLab, Then the head is the commit of the source branch', () => {
    expect(getMergePreviewPullRequest({
      GITLAB_CI: 'true',
      CI_MERGE_REQUEST_TARGET_BRANCH_NAME: 'main',
      CI_MERGE_REQUEST_SOURCE_BRANCH_SHA: 'source',
      CI_COMMIT_SHA: 'merge',
    })?.headSha).toBe('source')
  })

  it('When it is not a pull request pipeline, Then there is no pull request', () => {
    expect(getMergePreviewPullRequest({ GITHUB_ACTIONS: 'true', GITHUB_REF_NAME: 'main' })).toBeUndefined()
    expect(getMergePreviewPullRequest({ GITLAB_CI: 'true', CI_COMMIT_BRANCH: 'main' })).toBeUndefined()
    expect(getMergePreviewPullRequest({})).toBeUndefined()
  })
})

describe('Given the merge of a pull request to preview', () => {
  it('When HEAD already holds the target branch, Then lists the commits of the pull request only', async () => {
    const { origin, cwd, git } = setup()

    const context = await withGitCache(() => prepareMergePreviewContext({ pullRequest, cwd, env: {} }))

    expect(context).toEqual({
      pullRequest,
      targetSha: origin.git('rev-parse', 'HEAD'),
      headSha: git('rev-parse', 'HEAD'),
      commits: [
        git('rev-parse', 'HEAD'),
      ],
      merged: true,
    })
  })

  it('When the target branch moved on in a CI, Then merges it into HEAD, as the merge will', async () => {
    const { origin, cwd, git } = setup()
    origin.commit('fix: on main', { 'package.json': '{ "version": "1.0.1" }\n', 'main.txt': 'main' })
    const head = git('rev-parse', 'HEAD')

    const context = await withGitCache(() => prepareMergePreviewContext({
      pullRequest,
      cwd,
      env: { CI: 'true' },
    }))

    expect(context.merged).toBe(true)
    expect(context.warning).toBeUndefined()
    expect(context.targetSha).toBe(origin.git('rev-parse', 'HEAD'))
    expect(context.headSha).toBe(head)
    expect(context.commits).toEqual([head])
    expect(readFileSync(join(cwd, 'package.json'), 'utf8')).toContain('1.0.1')
    expect(git('status', '--porcelain')).toBe('')
  })

  it('When the target branch moved on outside a CI, Then warns and leaves HEAD as is', async () => {
    const { origin, cwd, git } = setup()
    origin.commit('fix: on main', { 'main.txt': 'main' })
    const head = git('rev-parse', 'HEAD')

    const context = await withGitCache(() => prepareMergePreviewContext({ pullRequest, cwd, env: {} }))

    expect(context.merged).toBe(false)
    expect(context.warning).toBe('HEAD is behind main: the preview is computed without its last commits (git merge origin/main)')
    expect(git('rev-parse', 'HEAD')).toBe(head)
  })

  it('When the pull request conflicts with the target branch, Then warns and aborts the merge', async () => {
    const { origin, cwd, git } = setup()
    origin.commit('fix: on main', { 'feature.txt': 'main' })
    const head = git('rev-parse', 'HEAD')

    const context = await withGitCache(() => prepareMergePreviewContext({
      pullRequest,
      cwd,
      env: { CI: 'true' },
    }))

    expect(context.merged).toBe(false)
    expect(context.warning).toBe('The pull request conflicts with main: the preview is computed without its last commits')
    expect(git('rev-parse', 'HEAD')).toBe(head)
    expect(git('status', '--porcelain')).toBe('')
  })

  it('When the head of the pull request is given, Then lists its commits, not the ones of HEAD', async () => {
    const { cwd, git } = setup()
    const head = git('rev-parse', 'HEAD')
    // The merge commit of refs/pull/<number>/merge, with a commit the pull request does not have
    git('commit', '--quiet', '--allow-empty', '-m', 'chore: not in the pull request')

    const context = await withGitCache(() => prepareMergePreviewContext({
      pullRequest: { ...pullRequest, headSha: head },
      cwd,
      env: {},
    }))

    expect(context.headSha).toBe(head)
    expect(context.commits).toEqual([head])
  })

  it('When the target branch does not exist, Then throws how to fetch it', async () => {
    const { cwd } = setup()

    await expect(withGitCache(() => prepareMergePreviewContext({
      pullRequest: { ...pullRequest, targetBranch: 'nope' },
      cwd,
      env: {},
    })))
      .rejects
      .toThrow('Cannot find the target branch "nope" of the pull request: fetch it before the preview (git fetch origin nope)')
  })
})
