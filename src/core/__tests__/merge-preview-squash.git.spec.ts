import type { GitRepository } from '../../../tests/git-repository'
import type { MergePreviewContext } from '../merge-preview/context'
import { createGitRepository } from '../../../tests/git-repository'
import { createMockConfig } from '../../../tests/mocks'
import { getGitDiff } from '../git-refs'
import { getSquashCommit, resolveMergePreviewSquash } from '../merge-preview/squash'
import { applySimulatedSquash, withSimulatedSquash } from '../squash-simulation'

const repositories: GitRepository[] = []

/** `main` with a commit, `feature` with two commits on top of it */
function setup(): { repo: GitRepository, context: (overrides?: Partial<MergePreviewContext['pullRequest']>) => MergePreviewContext } {
  const repo = createGitRepository('relizy-merge-preview-squash-')
  repositories.push(repo)
  repo.commit('chore: init', { 'package.json': '{ "version": "1.0.0" }\n', 'old.txt': 'old' })
  const targetSha = repo.git('rev-parse', 'HEAD')
  repo.git('checkout', '--quiet', '-b', 'feature')
  repo.commit('feat: add a', { 'a.txt': 'a' })
  repo.git('mv', 'old.txt', 'renamed.txt')
  repo.commit('fix: rename\n\nBREAKING CHANGE: old.txt is gone')
  const headSha = repo.git('rev-parse', 'HEAD')
  const commits = repo.git('rev-list', `${targetSha}..${headSha}`).split('\n')

  return {
    repo,
    context: overrides => ({
      pullRequest: { provider: 'github', kind: 'pull request', number: 12, title: 'feat: the feature', targetBranch: 'main', ...overrides },
      targetSha,
      headSha,
      commits,
      merged: true,
    }),
  }
}

function mockFetch(responses: Record<string, unknown>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    const entry = Object.entries(responses).find(([suffix]) => url.endsWith(suffix))
    return Promise.resolve(entry
      ? new Response(JSON.stringify(entry[1]), { status: 200 })
      : new Response('not found', { status: 404 }))
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(() => {
  for (const repo of repositories) {
    repo.remove()
  }
})

describe('Given a simulated squash merge', () => {
  const commit = (message: string, shortHash: string) => ({ message, shortHash, body: '', author: { name: 'Dev', email: 'dev@example.com' } })

  it('When the commits of a range are read, Then the ones of the pull request become the squash commit, at the place of the newest', () => {
    const squash = { hashes: ['bbbbbbb1234', 'ddddddd1234'], commit: commit('feat: squashed (#1)', 'ddddddd') }

    const commits = withSimulatedSquash(squash, () => applySimulatedSquash([
      commit('fix: on main', 'aaaaaaa'),
      commit('feat: b', 'bbbbbbb'),
      commit('fix: also on main', 'ccccccc'),
      commit('feat: d', 'ddddddd'),
    ]))

    expect(commits.map(entry => entry.message)).toEqual(['fix: on main', 'feat: squashed (#1)', 'fix: also on main'])
  })

  it('When the range has no commit of the pull request, Then is left as is', () => {
    const squash = { hashes: ['bbbbbbb1234'], commit: commit('feat: squashed', 'bbbbbbb') }
    const range = [commit('fix: on main', 'aaaaaaa')]

    expect(withSimulatedSquash(squash, () => applySimulatedSquash(range))).toEqual(range)
  })

  it('When no squash is simulated, Then the commits are left as is', () => {
    const range = [commit('feat: b', 'bbbbbbb')]

    expect(applySimulatedSquash(range)).toBe(range)
  })

  it('When getGitDiff reads the range, Then sees the squash commit with the files of the pull request', () => {
    const { repo, context } = setup()
    const squash = getSquashCommit({ context: context(), settings: { title: 'PR_TITLE', body: 'BLANK' }, cwd: repo.cwd })!

    const commits = withSimulatedSquash(squash, () => getGitDiff(context().targetSha, 'HEAD', repo.cwd))

    expect(commits).toHaveLength(1)
    expect(commits[0]!.message).toBe('feat: the feature (#12)')
    expect(commits[0]!.body).toBe('A\ta.txt\nR100\told.txt\trenamed.txt')
  })
})

describe('Given the commit of a squash merge', () => {
  it('When GitHub writes the commit messages in the body (its default), Then a breaking change of a commit is in the squash', () => {
    const { repo, context } = setup()

    const squash = getSquashCommit({ context: context(), cwd: repo.cwd })!

    expect(squash.commit.message).toBe('feat: the feature (#12)')
    expect(squash.commit.body).toBe('* feat: add a\n\n* fix: rename\n\nBREAKING CHANGE: old.txt is gone\n\nA\ta.txt\nR100\told.txt\trenamed.txt')
    expect(squash.commit.shortHash).toBe(context().headSha.slice(0, 7))
    expect(squash.commit.author).toEqual({ name: 'Relizy', email: 'relizy@example.com' })
  })

  it('When GitHub writes the description in the body, Then the body is the description', () => {
    const { repo, context } = setup()

    const squash = getSquashCommit({ context: context({ body: 'Closes #3' }), settings: { body: 'PR_BODY' }, cwd: repo.cwd })!

    expect(squash.commit.body).toBe('Closes #3\n\nA\ta.txt\nR100\told.txt\trenamed.txt')
  })

  it('When the pull request has one commit, Then GitHub takes its message (COMMIT_OR_PR_TITLE)', () => {
    const { repo, context } = setup()
    const base = context()
    const only = { ...base, commits: [base.commits[1]!], headSha: base.commits[1]! }

    const squash = getSquashCommit({ context: only, cwd: repo.cwd })!

    expect(squash.commit.message).toBe('feat: add a (#12)')
  })

  it('When it is a GitLab merge request, Then the commit is its title, without body', () => {
    const { repo, context } = setup()

    const squash = getSquashCommit({ context: context({ provider: 'gitlab', kind: 'merge request' }), cwd: repo.cwd })!

    expect(squash.commit.message).toBe('feat: the feature')
    expect(squash.commit.body).toBe('A\ta.txt\nR100\told.txt\trenamed.txt')
  })

  it('When the title is unknown, Then there is no squash commit', () => {
    const { repo, context } = setup()

    expect(getSquashCommit({ context: context({ title: undefined }), settings: { title: 'PR_TITLE' }, cwd: repo.cwd })).toBeUndefined()
  })
})

describe('Given the merge method of the pull request', () => {
  const config = createMockConfig({ bump: { type: 'release' }, repo: { provider: 'github', domain: 'github.com', repo: 'test/repo' }, tokens: { github: 'gh-token', gitlab: 'gl-token' } })

  it('When mergePreview.squash is false, Then computes the commits without the API', async () => {
    const { repo, context } = setup()
    const fetch = mockFetch({})

    expect(await resolveMergePreviewSquash({ config, context: context(), option: false, cwd: repo.cwd })).toEqual({ mode: 'commits', reason: 'mergePreview.squash is false' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('When mergePreview.squash is true, Then squashes without the API', async () => {
    const { repo, context } = setup()
    const fetch = mockFetch({})

    const result = await resolveMergePreviewSquash({ config, context: context(), option: true, cwd: repo.cwd })

    expect(result.mode).toBe('squash')
    expect(result.squash?.commit.message).toBe('feat: the feature (#12)')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('When the auto-merge of GitHub squashes, Then squashes', async () => {
    const { repo, context } = setup()
    mockFetch({ '/repos/test/repo': { allow_squash_merge: true, allow_merge_commit: true }, '/pulls/12': { auto_merge: { merge_method: 'squash' } } })

    const result = await resolveMergePreviewSquash({ config, context: context(), option: 'auto', cwd: repo.cwd })

    expect(result).toMatchObject({ mode: 'squash', reason: 'auto-merge is enabled with the squash method' })
  })

  it('When the repository only allows squash merges, Then squashes with its message settings', async () => {
    const { repo, context } = setup()
    mockFetch({
      '/repos/test/repo': { allow_squash_merge: true, allow_merge_commit: false, allow_rebase_merge: false, squash_merge_commit_title: 'PR_TITLE', squash_merge_commit_message: 'BLANK' },
      '/pulls/12': { auto_merge: null },
    })

    const result = await resolveMergePreviewSquash({ config, context: context(), option: 'auto', cwd: repo.cwd })

    expect(result).toMatchObject({ mode: 'squash', reason: 'the repository only allows squash merges' })
    expect(result.squash?.commit.body).toBe('A\ta.txt\nR100\told.txt\trenamed.txt')
  })

  it('When the repository does not allow squash merges, Then computes the commits', async () => {
    const { repo, context } = setup()
    mockFetch({ '/repos/test/repo': { allow_squash_merge: false }, '/pulls/12': {} })

    expect(await resolveMergePreviewSquash({ config, context: context(), option: 'auto', cwd: repo.cwd }))
      .toEqual({ mode: 'commits', reason: 'the repository does not allow squash merges' })
  })

  it('When the repository allows several methods, Then computes both', async () => {
    const { repo, context } = setup()
    mockFetch({ '/repos/test/repo': { allow_squash_merge: true, allow_merge_commit: true }, '/pulls/12': {} })

    expect(await resolveMergePreviewSquash({ config, context: context(), option: 'auto', cwd: repo.cwd }))
      .toMatchObject({ mode: 'both', reason: 'the repository allows several merge methods' })
  })

  it('When the API fails, Then computes both', async () => {
    const { repo, context } = setup()
    mockFetch({})

    expect(await resolveMergePreviewSquash({ config, context: context(), option: 'auto', cwd: repo.cwd }))
      .toMatchObject({ mode: 'both', reason: 'the pull request could not be read from the API' })
  })

  it('When the GitLab project always squashes, Then squashes', async () => {
    const { repo, context } = setup()
    mockFetch({ '/projects/test%2Frepo': { squash_option: 'always' }, '/merge_requests/12': { squash: false } })

    expect(await resolveMergePreviewSquash({ config, context: context({ provider: 'gitlab', kind: 'merge request' }), option: 'auto', cwd: repo.cwd }))
      .toMatchObject({ mode: 'squash', reason: 'the project always squashes the commits' })
  })

  it('When the GitLab merge request does not squash, Then computes the commits', async () => {
    const { repo, context } = setup()
    mockFetch({ '/projects/test%2Frepo': { squash_option: 'default_on' }, '/merge_requests/12': { squash: true, squash_on_merge: false } })

    expect(await resolveMergePreviewSquash({ config, context: context({ provider: 'gitlab', kind: 'merge request' }), option: 'auto', cwd: repo.cwd }))
      .toEqual({ mode: 'commits', reason: 'the merge request does not squash its commits' })
  })

  it('When the pull request has no commit, Then computes the commits', async () => {
    const { repo, context } = setup()

    expect(await resolveMergePreviewSquash({ config, context: { ...context(), commits: [] }, option: true, cwd: repo.cwd }))
      .toEqual({ mode: 'commits', reason: 'the pull request has no commit' })
  })
})
