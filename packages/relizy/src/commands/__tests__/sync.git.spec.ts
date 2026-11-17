import type { GitRepository } from '../../../../../tests/git-repository'
import type { RelizyEvent } from '../../core/events'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { createGitRepository } from '../../../../../tests/git-repository'
import { release } from '../release'
import { sync, SyncError } from '../sync'

vi.mock('@maz-ui/node', importActual => importActual())

describe('Given a release from main with develop to sync', () => {
  let repository: GitRepository
  let remote: string
  let initialCwd: string

  const remoteGit = (...args: string[]) => repository.git('--git-dir', remote, ...args)
  const hasCommit = (branch: string, commit: string) => {
    try {
      remoteGit('merge-base', '--is-ancestor', commit, branch)
      return true
    }
    catch {
      return false
    }
  }

  function writeConfig(options: string) {
    writeFileSync(join(repository.cwd, 'relizy.config.mjs'), `export default {
  logLevel: 'silent',
  noAuthors: true,
  release: { publish: false, providerRelease: false, social: false, prComment: false },
  ${options}
}\n`)
  }

  /** A commit of develop, pushed to the remote from another branch */
  function commitOnDevelop(files: Record<string, string>) {
    repository.git('switch', '--quiet', '-c', 'work', 'origin/develop')
    repository.commit('feat: develop work', files)
    repository.git('push', '--quiet', 'origin', 'work:develop')
    repository.git('switch', '--quiet', 'main')
    repository.git('branch', '--quiet', '-D', 'work')
  }

  beforeEach(() => {
    initialCwd = process.cwd()
    repository = createGitRepository('relizy-sync-')
    remote = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-sync-remote-')))
    process.chdir(repository.cwd)
    repository.git('init', '--quiet', '--bare', remote)
    repository.writeJson('.', { name: 'app', version: '1.0.0' })
    writeConfig(`sync: { rules: [{ from: 'main', to: ['develop'] }] },`)
    repository.commit('chore: init', { 'relizy.config.mjs': '' })
    writeConfig(`sync: { rules: [{ from: 'main', to: ['develop'] }] },`)
    repository.commit('chore: config')
    repository.git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0')
    repository.git('remote', 'add', 'origin', remote)
    repository.git('push', '--quiet', '-u', 'origin', 'main', '--follow-tags')
    repository.git('push', '--quiet', 'origin', 'main:develop')
    commitOnDevelop({ 'develop.js': 'develop' })
    repository.commit('feat: a new thing', { 'index.js': 'feat' })
  })

  afterEach(() => {
    process.chdir(initialCwd)
    repository.remove()
    rmSync(remote, { recursive: true, force: true })
    vi.unstubAllGlobals()
  })

  describe('When releasing', () => {
    it('Then merges the release commit into develop and pushes it, after checking it can', async () => {
      const events: RelizyEvent[] = []

      const report = await release({
        yes: true,
        onProgress: event => events.push(event),
      })

      const releaseCommit = repository.git('rev-parse', 'HEAD')
      expect(hasCommit('develop', releaseCommit)).toBe(true)
      expect(remoteGit('log', '-1', '--format=%s', 'develop')).toBe('chore(release): sync develop with main')
      expect(remoteGit('show', 'develop:develop.js')).toBe('develop')
      expect(repository.git('rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
      expect(report.sync).toMatchObject({
        source: 'main',
        dryRun: false,
        branches: [
          { branch: 'develop', mode: 'push', status: 'merged' },
        ],
      })
      expect(report.steps.find(step => step.name === 'sync')).toEqual({ name: 'sync', status: 'done', detail: 'main → develop merged' })
      const checks = events.find(event => event.type === 'step:done' && event.step === 'checks')
      expect(checks).toMatchObject({
        data: {
          checks: expect.arrayContaining([
            { name: 'sync', status: 'passed' },
          ]),
        },
      })
    })

    it('Then only computes the merge in dry-run', async () => {
      const develop = remoteGit('rev-parse', 'develop')

      const report = await release({ yes: true, dryRun: true })

      expect(remoteGit('rev-parse', 'develop')).toBe(develop)
      expect(report.sync).toMatchObject({
        dryRun: true,
        branches: [
          { branch: 'develop', status: 'merged' },
        ],
      })
    })

    it('Then tells in dry-run what the release commit would do to a branch that already has the released branch', async () => {
      repository.git('push', '--quiet', '--force', 'origin', 'HEAD:develop')

      const fastForward = await release({ yes: true, dryRun: true })

      expect(fastForward.sync?.branches).toEqual([
        { branch: 'develop', mode: 'push', status: 'fast-forward' },
      ])

      commitOnDevelop({ 'develop.js': 'ahead' })

      const merged = await release({ yes: true, dryRun: true })

      expect(merged.sync?.branches).toEqual([
        { branch: 'develop', mode: 'push', status: 'merged' },
      ])
    })

    it('Then syncs right after the push, before the provider release and the social posts', async () => {
      const events: RelizyEvent[] = []

      await release({
        yes: true,
        dryRun: true,
        onProgress: event => events.push(event),
      })

      const steps = events.flatMap(event => event.type === 'step:start' || event.type === 'step:skipped'
        ? [event.step]
        : [])
      expect(steps.slice(steps.indexOf('push'))).toEqual([
        'push',
        'sync',
        'provider-release',
        'social',
        'pr-comment',
      ])
    })

    it('Then skips the sync with --no-sync', async () => {
      const develop = remoteGit('rev-parse', 'develop')

      const report = await release({ yes: true, sync: false })

      expect(remoteGit('rev-parse', 'develop')).toBe(develop)
      expect(report.steps.find(step => step.name === 'sync')).toEqual({ name: 'sync', status: 'skipped' })
    })

    it('Then syncs the branches of the run instead of the rules', async () => {
      repository.git('push', '--quiet', 'origin', 'main~1:refs/heads/next')

      const report = await release({
        yes: true,
        syncBranches: ['next'],
      })

      expect(hasCommit('next', repository.git('rev-parse', 'HEAD'))).toBe(true)
      expect(report.sync?.branches.map(branch => branch.branch)).toEqual(['next'])
    })
  })

  describe('When releasing a canary from main', () => {
    it('Then nothing is synced nor checked, the sync is skipped as canary', async () => {
      const develop = remoteGit('rev-parse', 'develop')
      const events: RelizyEvent[] = []

      const report = await release({
        yes: true,
        canary: true,
        onProgress: event => events.push(event),
      })

      expect(remoteGit('rev-parse', 'develop')).toBe(develop)
      expect(report.sync).toBeUndefined()
      expect(report.steps.find(step => step.name === 'sync')).toEqual({ name: 'sync', status: 'skipped' })
      const checks = events.find(event => event.type === 'step:done' && event.step === 'checks')
      expect(checks).toMatchObject({
        data: {
          checks: expect.arrayContaining([
            { name: 'sync', status: 'skipped', message: 'canary' },
          ]),
        },
      })
    })
  })

  describe('When the merge into develop is in conflict', () => {
    it('Then the release succeeds, develop is untouched, and the step fails with how to merge by hand', async () => {
      commitOnDevelop({ 'CHANGELOG.md': '# Develop changelog\n' })
      const develop = remoteGit('rev-parse', 'develop')

      const report = await release({ yes: true })

      expect(report.status).toBe('released')
      expect(remoteGit('rev-parse', 'develop')).toBe(develop)
      expect(report.sync?.branches).toEqual([
        {
          branch: 'develop',
          mode: 'push',
          status: 'conflict',
          conflicts: ['CHANGELOG.md'],
          reason: 'Merge it by hand: git fetch origin && git switch develop && git merge origin/main && git push origin develop',
        },
      ])
      expect(report.steps.find(step => step.name === 'sync')).toMatchObject({ status: 'failed', detail: 'main → develop: conflict on 1 file' })
    })
  })

  describe('When a branch to sync does not exist', () => {
    it('Then the safety checks fail before anything is written', async () => {
      const main = remoteGit('rev-parse', 'main')

      await expect(release({
        yes: true,
        syncBranches: ['next'],
      })).rejects.toThrow('sync: "next" does not exist on "origin"')
      expect(remoteGit('rev-parse', 'main')).toBe(main)
    })
  })

  describe('When no rule of sync matches the released branch', () => {
    it('Then a release from a feature branch has no sync step nor check, develop is untouched', async () => {
      repository.git('switch', '--quiet', '-c', 'feat/thing')
      repository.git('push', '--quiet', '-u', 'origin', 'feat/thing')
      const develop = remoteGit('rev-parse', 'develop')
      const events: RelizyEvent[] = []

      const report = await release({
        yes: true,
        onProgress: event => events.push(event),
      })

      expect(report.status).toBe('released')
      expect(remoteGit('rev-parse', 'develop')).toBe(develop)
      expect(report.steps.map(step => step.name)).not.toContain('sync')
      expect(report.sync).toBeUndefined()
      const checks = events.find(event => event.type === 'step:done' && event.step === 'checks')
      expect(JSON.stringify(checks)).not.toContain('"sync"')
    })
  })

  describe('When the rule of sync is a glob', () => {
    it('Then a release from a matching branch is merged into its branches', async () => {
      writeConfig(`sync: { rules: [{ from: 'release/*', to: ['develop'] }] },`)
      repository.commit('chore: release branches')
      repository.git('switch', '--quiet', '-c', 'release/1.x')
      repository.git('push', '--quiet', '-u', 'origin', 'release/1.x')

      const report = await release({ yes: true })

      expect(hasCommit('develop', repository.git('rev-parse', 'HEAD'))).toBe(true)
      expect(remoteGit('log', '-1', '--format=%s', 'develop')).toBe('chore(release): sync develop with release/1.x')
      expect(report.sync).toMatchObject({
        source: 'release/1.x',
        branches: [
          { branch: 'develop', status: 'merged' },
        ],
      })
    })
  })

  describe('When the rules of sync are invalid', () => {
    it.each([
      [`sync: { rules: { from: 'main', to: ['develop'] } },`, 'sync.rules must be a list of rules'],
      [`sync: { rules: [{ to: ['develop'] }] },`, 'sync.rules[0].from must be the released branch'],
      [`sync: { rules: [{ from: 'main', to: [] }] },`, 'sync.rules[0].to must list the branches to merge "main" into'],
      [`sync: { rules: [{ from: 'main', to: 'develop' }] },`, 'sync.rules[0].to must list the branches'],
    ])('Then the config fails to load: %s', async (options, message) => {
      writeConfig(options)

      await expect(sync({ dryRun: true })).rejects.toThrow(message)
    })
  })

  describe('When the mode is pull-request', () => {
    const pullRequest = { number: 7, html_url: 'https://github.com/acme/app/pull/7', title: 'chore(release): sync develop with main' }

    beforeEach(() => {
      writeConfig(`repo: { provider: 'github', domain: 'github.com', repo: 'acme/app' },
  tokens: { github: 'gh-token' },
  sync: { rules: [{ from: 'main', to: ['develop'], mode: 'pull-request' }] },`)
      repository.commit('chore: pull request mode')
    })

    it('Then opens a pull request from main into develop, without pushing to develop', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(pullRequest),
        })
      vi.stubGlobal('fetch', fetchMock)
      const develop = remoteGit('rev-parse', 'develop')

      const report = await release({ yes: true })

      expect(remoteGit('rev-parse', 'develop')).toBe(develop)
      expect(report.sync?.branches).toEqual([
        {
          branch: 'develop',
          mode: 'pull-request',
          status: 'pull-request',
          pullRequest: { number: 7, url: pullRequest.html_url, existing: false },
        },
      ])
      expect(report.steps.find(step => step.name === 'sync')).toMatchObject({
        detail: 'main → develop: pull request #7',
        links: [
          { label: '#7', url: pullRequest.html_url },
        ],
      })
      const [url, init] = fetchMock.mock.calls[1]!
      expect(url).toBe('https://api.github.com/repos/acme/app/pulls')
      expect(JSON.parse(init.body)).toMatchObject({
        title: 'chore(release): sync develop with main',
        head: 'main',
        base: 'develop',
        body: expect.stringContaining('after the release of `v1.1.0`'),
      })
    })

    it('Then reuses the open pull request', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([pullRequest]),
      })
      vi.stubGlobal('fetch', fetchMock)

      const report = await release({ yes: true })

      expect(report.sync?.branches[0]).toMatchObject({
        status: 'pull-request',
        pullRequest: { number: 7, existing: true },
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('When the mode is pull-request on GitLab with the job token', () => {
    it('Then the safety checks fail before anything is written: it cannot open merge requests', async () => {
      vi.stubEnv('CI_JOB_TOKEN', 'job-token')
      writeConfig(`repo: { provider: 'gitlab', domain: 'gitlab.com', repo: 'acme/app' },
  tokens: { gitlab: 'job-token' },
  sync: { rules: [{ from: 'main', to: ['develop'], mode: 'pull-request' }] },`)
      repository.commit('chore: gitlab')

      await expect(release({ yes: true })).rejects.toThrow('the CI_JOB_TOKEN of GitLab cannot open merge requests')
      vi.unstubAllEnvs()
    })
  })

  describe('Given relizy sync', () => {
    beforeEach(() => {
      repository.git('push', '--quiet', 'origin', 'main')
    })

    it('Then merges the current branch into the branches of its rules', async () => {
      const result = await sync()

      expect(result).toMatchObject({
        source: 'main',
        branches: [
          { branch: 'develop', status: 'merged' },
        ],
      })
      expect(hasCommit('develop', repository.git('rev-parse', 'HEAD'))).toBe(true)
    })

    it('Then says when the branch already has it', async () => {
      await sync()

      expect((await sync()).branches).toEqual([
        { branch: 'develop', mode: 'push', status: 'up-to-date' },
      ])
    })

    it('Then does nothing on a branch no rule matches', async () => {
      repository.git('switch', '--quiet', '-c', 'feat/thing')
      const develop = remoteGit('rev-parse', 'develop')

      const result = await sync()

      expect(result).toEqual({ source: 'feat/thing', dryRun: false, branches: [] })
      expect(remoteGit('rev-parse', 'develop')).toBe(develop)
    })

    it('Then uses the mode of the run over the mode of the rule', async () => {
      const result = await sync({ dryRun: true, mode: 'pull-request' }).catch((error: unknown) => error)

      expect(String(result)).toContain('The sync mode "pull-request" needs a')
    })

    it('Then merges another released branch with from', async () => {
      repository.git('switch', '--quiet', '-c', 'other')

      const result = await sync({
        from: 'main',
        branches: ['develop'],
      })

      expect(result.source).toBe('main')
      expect(hasCommit('develop', remoteGit('rev-parse', 'main'))).toBe(true)
    })

    it('Then throws a SyncError with the result on a conflict', async () => {
      commitOnDevelop({ 'index.js': 'develop' })

      const error = await sync().then(() => undefined, (error: unknown) => error)

      expect(error).toBeInstanceOf(SyncError)
      expect((error as SyncError).message).toContain('develop: conflict on 1 file. Merge it by hand: git fetch origin')
      expect((error as SyncError).result.branches[0]).toMatchObject({
        status: 'conflict',
        conflicts: ['index.js'],
      })
    })
  })
})
