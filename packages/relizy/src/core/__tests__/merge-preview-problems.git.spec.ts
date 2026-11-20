import type { GitRepository } from '../../../../../tests/git-repository'
import type { BumpResultTruthy, PackageBase } from '../../types'
import type { MergePreviewContext } from '../merge-preview/context'
import type { MergePreviewPlan } from '../merge-preview/plan'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { createGitRepository } from '../../../../../tests/git-repository'
import { loadRelizyConfig } from '../config'
import { checkMergePreview } from '../merge-preview/problems'
import { isVersionPublished } from '../npm-versions'

vi.mock('../npm-versions', async importOriginal => ({
  ...await importOriginal<typeof import('../npm-versions')>(),
  isVersionPublished: vi.fn(),
}))

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
    execFileSync('git', [
      'clone',
      '--quiet',
      `file://${origin.cwd}`,
      cwd,
    ])
    git('checkout', '--quiet', '-b', 'feature')
    writeFileSync(join(cwd, 'index.js'), 'feature')
    git('add', '-A')
    git('commit', '--quiet', '-m', 'feat: the feature')
    const headSha = git('rev-parse', 'HEAD')

    initialCwd = process.cwd()
    process.chdir(cwd)
    cleanups.push(() => process.chdir(initialCwd))

    context = {
      pullRequest: {
        provider: 'github',
        kind: 'pull request',
        number: 3,
        title: 'feat: the feature',
        targetBranch: 'main',
      },
      targetSha: origin.git('rev-parse', 'HEAD'),
      headSha,
      commits: [headSha],
      merged: true,
    }
  }

  function planOf(newVersion: string, squash: MergePreviewPlan['squash'] = { mode: 'commits', reason: 'test' }): MergePreviewPlan {
    const pkg = {
      name: 'app',
      version: '1.0.0',
      newVersion,
      oldVersion: '1.0.0',
      path: cwd,
      private: false,
      commits: [],
      fromTag: 'v1.0.0',
      dependencies: [],
    } as unknown as PackageBase & { oldVersion: string }
    const bumpResult: BumpResultTruthy = {
      bumped: true,
      oldVersion: '1.0.0',
      newVersion,
      bumpedPackages: [pkg],
    }

    return {
      squash,
      outcome: { bumpResult, packages: [] },
    }
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

    expect(await checkMergePreview({
      config,
      plan: planOf('1.1.0'),
      context,
      commitlint: 'auto',
    })).toEqual({ problems: [], commitlint: [], warnings: [] })
  })

  it('When the version is already published, Then the publish would fail', async () => {
    setup()
    vi.mocked(isVersionPublished).mockResolvedValue(true)
    const config = await loadRelizyConfig()

    const { problems } = await checkMergePreview({
      config,
      plan: planOf('1.1.0'),
      context,
      commitlint: false,
    })

    expect(problems).toEqual([
      { kind: 'version-taken', message: 'app@1.1.0 is already published: the publish would fail. Check the versions in the package.json files, they are behind the latest release' },
    ])
  })

  it('When the registry cannot tell, Then only warns', async () => {
    setup()
    vi.mocked(isVersionPublished).mockResolvedValue(null)
    const config = await loadRelizyConfig()

    expect(await checkMergePreview({
      config,
      plan: planOf('1.1.0'),
      context,
      commitlint: false,
    }))
      .toEqual({
        problems: [],
        commitlint: [],
        warnings: ['Could not check whether app@1.1.0 is already published'],
      })
  })

  it('When the release does not publish, Then the registry is not checked', async () => {
    setup(`release: { publish: false }`)
    const config = await loadRelizyConfig()

    await checkMergePreview({
      config,
      plan: planOf('1.1.0'),
      context,
      commitlint: false,
    })

    expect(isVersionPublished).not.toHaveBeenCalled()
  })

  it('When the tag of the release exists on the remote, Then the release would fail', async () => {
    setup()
    origin.git('tag', 'v1.1.0')
    const config = await loadRelizyConfig()

    const { problems } = await checkMergePreview({
      config,
      plan: planOf('1.1.0'),
      context,
      commitlint: false,
    })

    expect(problems).toEqual([
      { kind: 'tag-taken', message: 'The tag v1.1.0 already exists on the remote: the release would fail. Check the versions in the package.json files, they are behind the latest release' },
    ])
  })

  describe('When a squash merge creates a commit that is not conventional', () => {
    const message = 'the squash commit "Update the app (#3)" is not a Conventional Commit, the release would ignore the changes of the pull request. Write its title as "type(scope): subject"'

    function squashOf() {
      return {
        hashes: context.commits,
        commit: {
          message: 'Update the app (#3)',
          body: '',
          shortHash: 'abc1234',
          author: { name: 'Dev', email: 'dev@example.com' },
        },
      }
    }

    it('Then it is a problem when the merge squashes for sure', async () => {
      setup()
      const config = await loadRelizyConfig()

      const { problems, warnings } = await checkMergePreview({
        config,
        plan: planOf('1.1.0', {
          mode: 'squash',
          reason: 'test',
          squash: squashOf(),
        }),
        context,
        commitlint: false,
      })

      expect(problems).toEqual([
        { kind: 'squash-title', message },
      ])
      expect(warnings).toEqual([])
    })

    it('Then it is only a warning when the merge method is left open', async () => {
      setup()
      const config = await loadRelizyConfig()

      const { problems, warnings } = await checkMergePreview({
        config,
        plan: planOf('1.1.0', {
          mode: 'both',
          reason: 'test',
          squash: squashOf(),
        }),
        context,
        commitlint: false,
      })

      expect(problems).toEqual([])
      expect(warnings).toEqual([`If you squash merge: ${message}`])
    })
  })

  it('When the project uses the commitlint of relizy, Then a commit failing it is a warning apart, not a problem', async () => {
    setup(`commitlint: { rules: { 'subject-case': ['error', 'lower-case'] } }`)
    git('commit', '--quiet', '--allow-empty', '-m', 'fix: The Bug')
    context.headSha = git('rev-parse', 'HEAD')
    context.commits = [context.headSha, ...context.commits]
    const config = await loadRelizyConfig()

    const { problems, commitlint } = await checkMergePreview({
      config,
      plan: planOf('1.1.0'),
      context,
      commitlint: 'auto',
    })

    expect(problems).toEqual([])
    expect(commitlint).toEqual([
      {
        kind: 'commitlint',
        message: expect.stringMatching(/^[0-9a-f]{7} "fix: The Bug": /),
        merge: 'kept',
      },
    ])
  })

  it('When the project does not use the commitlint of relizy, Then auto does not lint', async () => {
    setup()
    git('commit', '--quiet', '--allow-empty', '-m', 'not conventional')
    context.headSha = git('rev-parse', 'HEAD')
    const config = await loadRelizyConfig()

    expect((await checkMergePreview({
      config,
      plan: planOf('1.1.0'),
      context,
      commitlint: 'auto',
    })).commitlint).toEqual([])
    expect(await checkMergePreview({
      config,
      plan: planOf('1.1.0'),
      context,
      commitlint: true,
    })).toMatchObject({
      problems: [],
      commitlint: [
        {
          kind: 'commitlint',
          message: expect.stringMatching(/"not conventional": /),
          merge: 'kept',
        },
      ],
    })
  })

  it('When the squash commit fails the commitlint, Then it is a warning, said conditional when the merge method is left open', async () => {
    setup(`commitlint: { rules: { 'subject-case': ['error', 'lower-case'] } }`)
    const config = await loadRelizyConfig()
    const squash = {
      hashes: context.commits,
      commit: {
        message: 'feat: The App (#3)',
        body: '',
        shortHash: 'abc1234',
        author: { name: 'Dev', email: 'dev@example.com' },
      },
    }

    const sure = await checkMergePreview({
      config,
      plan: planOf('1.1.0', { mode: 'squash', reason: 'test', squash }),
      context,
      commitlint: true,
    })
    const open = await checkMergePreview({
      config,
      plan: planOf('1.1.0', { mode: 'both', reason: 'test', squash }),
      context,
      commitlint: true,
    })

    expect(sure.problems).toEqual([])
    expect(sure.commitlint).toEqual([
      {
        kind: 'commitlint',
        message: expect.stringMatching(/^the squash commit "feat: The App \(#3\)": /),
        merge: 'kept',
      },
    ])
    expect(open.problems).toEqual([])
    expect(open.commitlint).toEqual([
      {
        kind: 'commitlint',
        message: expect.stringMatching(/^If you squash merge: the squash commit "feat: The App \(#3\)": /),
        merge: 'squash',
      },
    ])
  })

  describe('When the commits and the squash commit fail the commitlint', () => {
    const squashOf = (hashes: string[]) => ({
      hashes,
      commit: {
        message: 'feat: the app (#3)',
        body: '',
        shortHash: 'abc1234',
        author: { name: 'Dev', email: 'dev@example.com' },
      },
    })

    async function checkWith({ title, squash }: { title?: string, squash: Omit<MergePreviewPlan['squash'], 'squash'> }) {
      const titleOption = title === undefined
        ? ''
        : `title: '${title}', `
      setup(`commitlint: { ${titleOption}rules: { 'subject-meaningful': ['error', { minWords: 5, minLength: 100 }] } }`)
      const config = await loadRelizyConfig()
      const checks = await checkMergePreview({
        config,
        plan: planOf('1.1.0', {
          ...squash,
          squash: squashOf(context.commits),
        }),
        context,
        commitlint: true,
      })
      return checks.commitlint.map(problem => [
        problem.merge,
        problem.message.replace(/\b[0-9a-f]{7}\b/g, '<hash>').replace(/": .*$/, '"'),
      ])
    }

    it('Then tells the commits a squash merge drops', async () => {
      expect(await checkWith({
        squash: { mode: 'squash', reason: 'test' },
      })).toEqual([
        ['kept', 'the squash commit "feat: the app (#3)"'],
        ['dropped', '<hash> "feat: the feature"'],
      ])
    })

    it('Then keeps the commits as is when the merge method is left open', async () => {
      expect(await checkWith({
        squash: { mode: 'both', reason: 'test' },
      })).toEqual([
        ['squash', 'If you squash merge: the squash commit "feat: the app (#3)"'],
        ['kept', '<hash> "feat: the feature"'],
      ])
    })

    it('Then does not lint the squash commit with commitlint.title: off', async () => {
      expect(await checkWith({
        title: 'off',
        squash: { mode: 'squash', reason: 'test' },
      })).toEqual([
        ['dropped', '<hash> "feat: the feature"'],
      ])
    })

    it('Then lints the only commit once when the squash commit takes its message', async () => {
      expect(await checkWith({
        squash: { mode: 'squash', reason: 'test', titleFromCommit: true },
      })).toEqual([
        ['kept', '<hash> "feat: the feature"'],
      ])
    })
  })

  it('When the preview is computed without the last commits of the target branch, Then warns', async () => {
    setup()
    const config = await loadRelizyConfig()

    expect((await checkMergePreview({
      config,
      plan: planOf('1.1.0'),
      context: { ...context, warning: 'HEAD is behind main' },
      commitlint: false,
    })).warnings)
      .toEqual(['HEAD is behind main'])
  })
})
