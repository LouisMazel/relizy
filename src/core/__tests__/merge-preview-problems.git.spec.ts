import type { GitRepository } from '../../../tests/git-repository'
import type { BumpResultTruthy, PackageBase } from '../../types'
import type { MergePreviewContext } from '../merge-preview/context'
import type { MergePreviewPlan } from '../merge-preview/plan'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { createGitRepository } from '../../../tests/git-repository'
import { loadRelizyConfig } from '../config'
import { checkMergePreview } from '../merge-preview/problems'
import { isVersionPublished } from '../npm-versions'

vi.mock('../npm-versions', async importOriginal => ({ ...await importOriginal<typeof import('../npm-versions')>(), isVersionPublished: vi.fn() }))

const cleanups: (() => void)[] = []

afterAll(() => {
  for (const cleanup of cleanups) {
    cleanup()
  }
})

describe('Given the release of the merge of a pull request', () => {
  let origin: GitRepository
  let cwd: string
  let initialCwd: string
  let context: MergePreviewContext

  function git(...args: string[]) {
    return execFileSync('git', ['-c', 'user.name=Dev', '-c', 'user.email=dev@example.com', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  }

  /** A clone of `origin`, with the config, on the branch of the pull request */
  function setup(config = '') {
    origin = createGitRepository('relizy-merge-preview-problems-')
    cleanups.push(origin.remove)
    origin.writeJson('.', { name: 'app', version: '1.0.0' })
    origin.write('relizy.config.mjs', `export default { logLevel: 'silent', ${config} }\n`)
    origin.commit('chore: init')
    origin.git('tag', 'v1.0.0')

    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-merge-preview-problems-clone-')))
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
    cwd = join(dir, 'clone')
    execFileSync('git', ['clone', '--quiet', `file://${origin.cwd}`, cwd])
    git('checkout', '--quiet', '-b', 'feature')
    writeFileSync(join(cwd, 'index.js'), 'feature')
    git('add', '-A')
    git('commit', '--quiet', '-m', 'feat: the feature')
    const headSha = git('rev-parse', 'HEAD')

    initialCwd = process.cwd()
    process.chdir(cwd)
    cleanups.push(() => process.chdir(initialCwd))

    context = {
      pullRequest: { provider: 'github', kind: 'pull request', number: 3, title: 'feat: the feature', targetBranch: 'main' },
      targetSha: origin.git('rev-parse', 'HEAD'),
      headSha,
      commits: [headSha],
      merged: true,
    }
  }

  function planOf(newVersion: string, squash: MergePreviewPlan['squash'] = { mode: 'commits', reason: 'test' }): MergePreviewPlan {
    const pkg = { name: 'app', version: '1.0.0', newVersion, oldVersion: '1.0.0', path: cwd, private: false, commits: [], fromTag: 'v1.0.0', dependencies: [] } as unknown as PackageBase & { oldVersion: string }
    const bumpResult: BumpResultTruthy = { bumped: true, oldVersion: '1.0.0', newVersion, bumpedPackages: [pkg] }

    return { squash, outcome: { bumpResult, packages: [] } }
  }

  beforeEach(() => {
    vi.mocked(isVersionPublished).mockReset().mockResolvedValue(false)
  })

  afterEach(() => {
    process.chdir(initialCwd)
  })

  it('When nothing blocks the release, Then reports no problem', async () => {
    setup()
    const config = await loadRelizyConfig()

    expect(await checkMergePreview({ config, plan: planOf('1.1.0'), context, commitlint: 'auto' })).toEqual({ problems: [], warnings: [] })
  })

  it('When the version is already published, Then the publish would fail', async () => {
    setup()
    vi.mocked(isVersionPublished).mockResolvedValue(true)
    const config = await loadRelizyConfig()

    const { problems } = await checkMergePreview({ config, plan: planOf('1.1.0'), context, commitlint: false })

    expect(problems).toEqual([{ kind: 'version-taken', message: 'app@1.1.0 is already published: the publish would fail. Check the versions in the package.json files, they are behind the latest release' }])
  })

  it('When the registry cannot tell, Then only warns', async () => {
    setup()
    vi.mocked(isVersionPublished).mockResolvedValue(null)
    const config = await loadRelizyConfig()

    expect(await checkMergePreview({ config, plan: planOf('1.1.0'), context, commitlint: false }))
      .toEqual({ problems: [], warnings: ['Could not check whether app@1.1.0 is already published'] })
  })

  it('When the release does not publish, Then the registry is not checked', async () => {
    setup(`release: { publish: false }`)
    const config = await loadRelizyConfig()

    await checkMergePreview({ config, plan: planOf('1.1.0'), context, commitlint: false })

    expect(isVersionPublished).not.toHaveBeenCalled()
  })

  it('When the tag of the release exists on the remote, Then the release would fail', async () => {
    setup()
    origin.git('tag', 'v1.1.0')
    const config = await loadRelizyConfig()

    const { problems } = await checkMergePreview({ config, plan: planOf('1.1.0'), context, commitlint: false })

    expect(problems).toEqual([{ kind: 'tag-taken', message: 'The tag v1.1.0 already exists on the remote: the release would fail. Check the versions in the package.json files, they are behind the latest release' }])
  })

  it('When a squash merge creates a commit that is not conventional, Then the changes of the pull request would be ignored', async () => {
    setup()
    const config = await loadRelizyConfig()
    const squash = { hashes: context.commits, commit: { message: 'Update the app (#3)', body: '', shortHash: 'abc1234', author: { name: 'Dev', email: 'dev@example.com' } } }

    const { problems } = await checkMergePreview({ config, plan: planOf('1.1.0', { mode: 'both', reason: 'test', squash }), context, commitlint: false })

    expect(problems).toEqual([{ kind: 'squash-title', message: 'A squash merge creates the commit "Update the app (#3)", which is not a Conventional Commit: the release would ignore the changes of the pull request. Write its title as "type(scope): subject"' }])
  })

  it('When the project uses the commitlint of relizy, Then a commit failing it is a problem', async () => {
    setup(`commitlint: { rules: { 'subject-case': ['error', 'lower-case'] } }`)
    git('commit', '--quiet', '--allow-empty', '-m', 'fix: The Bug')
    context.headSha = git('rev-parse', 'HEAD')
    context.commits = [context.headSha, ...context.commits]
    const config = await loadRelizyConfig()

    const { problems } = await checkMergePreview({ config, plan: planOf('1.1.0'), context, commitlint: 'auto' })

    expect(problems).toEqual([{ kind: 'commitlint', message: expect.stringMatching(/^[0-9a-f]{7} "fix: The Bug": /) }])
  })

  it('When the project does not use the commitlint of relizy, Then auto does not lint', async () => {
    setup()
    git('commit', '--quiet', '--allow-empty', '-m', 'not conventional')
    context.headSha = git('rev-parse', 'HEAD')
    const config = await loadRelizyConfig()

    expect((await checkMergePreview({ config, plan: planOf('1.1.0'), context, commitlint: 'auto' })).problems).toEqual([])
    expect((await checkMergePreview({ config, plan: planOf('1.1.0'), context, commitlint: true })).problems).toEqual([
      { kind: 'commitlint', message: expect.stringMatching(/"not conventional": /) },
    ])
  })

  it('When the preview is computed without the last commits of the target branch, Then warns', async () => {
    setup()
    const config = await loadRelizyConfig()

    expect((await checkMergePreview({ config, plan: planOf('1.1.0'), context: { ...context, warning: 'HEAD is behind main' }, commitlint: false })).warnings)
      .toEqual(['HEAD is behind main'])
  })
})
