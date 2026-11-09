import type { GitRepository } from '../../../../tests/git-repository'
import { createGitRepository } from '../../../../tests/git-repository'
import { detectRewrittenTag } from '../rewritten-tags'

describe('Given a tag compared to a ref', () => {
  let repo: GitRepository

  beforeEach(() => {
    repo = createGitRepository('relizy-rewritten-tags-')
    repo.commit('chore: init', { 'README.md': 'readme\n' })
  })

  afterEach(() => {
    repo.remove()
  })

  it('When the name is not a tag, Then is missing', async () => {
    const head = repo.git('rev-parse', 'HEAD')

    await expect(detectRewrittenTag({ tag: 'v9.9.9', to: 'main', cwd: repo.cwd })).resolves.toEqual({ status: 'missing' })
    await expect(detectRewrittenTag({ tag: head, to: 'main', cwd: repo.cwd })).resolves.toEqual({ status: 'missing' })
  })

  it('When the commit of the tag is in the history of the ref, Then is reachable', async () => {
    repo.git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0')
    repo.commit('feat: add a thing')

    await expect(detectRewrittenTag({ tag: 'v1.0.0', to: 'main', cwd: repo.cwd })).resolves.toEqual({ status: 'reachable' })
  })

  it('When the tagged commit was rewritten, Then gives its subject and its twin in the ref', async () => {
    repo.commit('chore(release): bump version to 1.0.0')
    repo.git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0')
    // A rebase rewrites the commit: the tag keeps the old one
    repo.git('commit', '--quiet', '--amend', '--no-verify', '--allow-empty', '-m', 'chore(release): bump version to 1.0.0', '--date', '2020-01-01T00:00:00')
    const twin = repo.git('rev-parse', 'HEAD')

    await expect(detectRewrittenTag({ tag: 'v1.0.0', to: 'main', cwd: repo.cwd })).resolves.toEqual({
      status: 'rewritten',
      subject: 'chore(release): bump version to 1.0.0',
      twin,
    })
  })

  it('When the tagged commit has no equivalent in the ref, Then has no twin', async () => {
    repo.git('checkout', '--quiet', '-b', 'other')
    repo.commit('chore(release): bump version to 2.0.0')
    repo.git('tag', '-a', 'v2.0.0', '-m', 'v2.0.0')
    repo.git('checkout', '--quiet', 'main')

    await expect(detectRewrittenTag({ tag: 'v2.0.0', to: 'main', cwd: repo.cwd })).resolves.toEqual({
      status: 'rewritten',
      subject: 'chore(release): bump version to 2.0.0',
      twin: null,
    })
  })
})
