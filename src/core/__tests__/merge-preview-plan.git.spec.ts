import type { GitRepository } from '../../../tests/git-repository'
import type { MergePreviewContext } from '../merge-preview/context'
import type { MergePreviewSquash } from '../merge-preview/squash'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { createGitRepository } from '../../../tests/git-repository'
import { planBumps } from '../../commands/bump'
import { loadRelizyConfig } from '../config'
import { withGitCache } from '../git-cache'
import { planMergePreview } from '../merge-preview/plan'
import { getSquashCommit } from '../merge-preview/squash'

vi.mock('@maz-ui/node', importActual => importActual())

describe('Given the merge of a pull request in a selective monorepo', () => {
  let repository: GitRepository
  let initialCwd: string
  let context: MergePreviewContext

  /**
   * `main` releases 1.0.0 then gets a fix of `b`; the pull request adds a fix
   * of `a` and merges `main`, as the CI does before the preview
   */
  beforeEach(() => {
    initialCwd = process.cwd()
    repository = createGitRepository('relizy-merge-preview-plan-')
    process.chdir(repository.cwd)

    repository.writeJson('.', { name: 'monorepo', version: '1.0.0', private: true })
    repository.writeJson('packages/a', { name: 'a', version: '1.0.0' })
    repository.writeJson('packages/b', { name: 'b', version: '1.0.0' })
    writeFileSync(join(repository.cwd, 'relizy.config.mjs'), `export default { logLevel: 'silent', safetyCheck: false, monorepo: { versionMode: 'selective', packages: ['packages/*'] } }\n`)
    repository.commit('chore: init')
    repository.git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0')

    repository.git('checkout', '--quiet', '-b', 'feature')
    repository.commit('fix(a): the bug', { 'packages/a/index.js': 'fix' })
    const headSha = repository.git('rev-parse', 'HEAD')

    repository.git('checkout', '--quiet', 'main')
    repository.commit('fix(b): the other bug', { 'packages/b/index.js': 'fix' })
    const targetSha = repository.git('rev-parse', 'HEAD')

    repository.git('checkout', '--quiet', 'feature')
    repository.git('merge', '--quiet', '--no-edit', 'main')

    context = {
      pullRequest: { provider: 'github', kind: 'pull request', number: 5, title: 'feat(a)!: the new api', targetBranch: 'main' },
      targetSha,
      headSha,
      commits: [headSha],
      merged: true,
    }
  })

  afterEach(() => {
    process.chdir(initialCwd)
    repository.remove()
  })

  async function plan(squash: MergePreviewSquash) {
    const config = await loadRelizyConfig()

    return withGitCache(() => planMergePreview({
      config,
      context,
      squash,
      planBump: async () => (await planBumps({ config, dryRun: true })).result,
    }))
  }

  describe('When the merge keeps the commits', () => {
    it('Then releases the commits of the target branch and of the pull request, telling which come from the pull request', async () => {
      const result = await plan({ mode: 'commits', reason: 'the repository does not allow squash merges' })

      expect(result.squashOutcome).toBeUndefined()
      expect(result.outcome.overview?.groups.map(group => group.version)).toEqual(['1.0.1'])
      expect(result.outcome.packages).toEqual([
        expect.objectContaining({ name: 'a', oldVersion: '1.0.0', newVersion: '1.0.1', reason: 'commits', fromPullRequest: true, commits: [expect.objectContaining({ type: 'fix', scope: 'a', fromPullRequest: true })] }),
        expect.objectContaining({ name: 'b', oldVersion: '1.0.0', newVersion: '1.0.1', reason: 'commits', fromPullRequest: false, commits: [expect.objectContaining({ type: 'fix', scope: 'b', fromPullRequest: false })] }),
      ])
    })
  })

  describe('When the merge squashes', () => {
    it('Then releases the title of the pull request instead of its commits', async () => {
      const squash = getSquashCommit({ context, settings: { title: 'PR_TITLE', body: 'BLANK' }, cwd: repository.cwd })!

      const result = await plan({ mode: 'squash', reason: 'the repository only allows squash merges', squash })

      expect(result.outcome.overview?.groups.map(group => group.version)).toEqual(['2.0.0'])
      expect(result.outcome.packages.find(pkg => pkg.name === 'a')).toMatchObject({
        newVersion: '2.0.0',
        fromPullRequest: true,
        commits: [{ type: 'feat', scope: 'a', isBreaking: true, fromPullRequest: true }],
      })
    })
  })

  describe('When the merge method is unknown', () => {
    it('Then keeps the squash outcome when it releases other versions', async () => {
      const squash = getSquashCommit({ context, settings: { title: 'PR_TITLE', body: 'BLANK' }, cwd: repository.cwd })!

      const result = await plan({ mode: 'both', reason: 'the repository allows several merge methods', squash })

      expect(result.outcome.overview?.groups.map(group => group.version)).toEqual(['1.0.1'])
      expect(result.squashOutcome?.overview?.groups.map(group => group.version)).toEqual(['2.0.0'])
    })

    it('Then drops the squash outcome when it releases the same versions', async () => {
      context.pullRequest.title = 'fix(a): the bug'
      const squash = getSquashCommit({ context, settings: { title: 'PR_TITLE', body: 'BLANK' }, cwd: repository.cwd })!

      const result = await plan({ mode: 'both', reason: 'the repository allows several merge methods', squash })

      expect(result.squashOutcome).toBeUndefined()
    })
  })

  describe('When the squash title is not a conventional commit', () => {
    it('Then the pull request releases nothing, only the target branch does', async () => {
      context.pullRequest.title = 'Update the a package'
      const squash = getSquashCommit({ context, settings: { title: 'PR_TITLE', body: 'BLANK' }, cwd: repository.cwd })!

      const result = await plan({ mode: 'squash', reason: 'the repository only allows squash merges', squash })

      expect(result.outcome.packages.map(pkg => [pkg.name, pkg.fromPullRequest])).toEqual([['b', false]])
    })
  })
})
