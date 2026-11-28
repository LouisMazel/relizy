import type { GitRepository } from '../../../../../tests/git-repository'
import type { RelizyEvent } from '../../core/events'
import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { createGitRepository } from '../../../../../tests/git-repository'
import { getReleaseReportOutputs } from '../../core/release-report'
import { release } from '../release'

vi.mock('@maz-ui/node', importActual => importActual())

// How a failed release is resumed: what a re-run from the same state does (guide "Resume a release")
describe('Given a release that failed after its packages were published', () => {
  let repository: GitRepository
  let remote: string
  let initialCwd: string

  /** The commit of the release fails while this file exists, as a clone lost in CI */
  const failCommit = () => join(repository.cwd, '.git', 'relizy-fail-commit')

  beforeEach(() => {
    initialCwd = process.cwd()
    repository = createGitRepository('relizy-recovery-')
    remote = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-recovery-remote-')))
    process.chdir(repository.cwd)
    repository.git('init', '--quiet', '--bare', remote)
    repository.writeJson('.', { name: 'app', version: '1.0.0' })
    writeFileSync(join(repository.cwd, 'relizy.config.mjs'), `export default {
  logLevel: 'silent',
  noAuthors: true,
  release: { publish: false, providerRelease: false, social: false, prComment: false },
  hooks: { 'before:commit-and-tag': 'test ! -e .git/relizy-fail-commit' },
}\n`)
    repository.commit('chore: init')
    repository.git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0')
    repository.git('remote', 'add', 'origin', remote)
    repository.git('push', '--quiet', '-u', 'origin', 'main', '--follow-tags')
    repository.commit('feat: a new thing', { 'index.js': 'feat' })
  })

  afterEach(() => {
    process.chdir(initialCwd)
    repository.remove()
    rmSync(remote, { recursive: true, force: true })
  })

  describe('When the commit fails after the publish (W2), then the release is run again from the same commit', () => {
    it('Then the failure ends with the failed step, and the re-run computes the same version and goes on to commit, tag and push', async () => {
      // The commit fails
      writeFileSync(failCommit(), '')
      const events: RelizyEvent[] = []

      await expect(release({
        yes: true,
        onProgress: event => events.push(event),
      })).rejects.toThrow()

      expect(events.at(-1)).toMatchObject({ type: 'command:error', failedStep: 'Commit', cancelled: false })
      expect(events.find(event => event.type === 'step:failed')).toMatchObject({ step: 'commit-and-tag', fatal: true })
      // What a following job reads (step outputs, dotenv of GitLab)
      const failure = events.at(-1) as Extract<RelizyEvent, { type: 'command:error' }>
      const outputs = getReleaseReportOutputs(failure.report!)
      expect({ status: outputs.status, failed_steps: outputs.failed_steps, version: outputs.version }).toMatchInlineSnapshot(`
        {
          "failed_steps": "",
          "status": "failed",
          "version": "1.1.0",
        }
      `)
      expect(repository.git('tag')).not.toContain('v1.1.0')
      // The files of the bump and the changelog stay: a CI clone is lost, a local one is restored first
      expect(repository.git('status', '--porcelain')).toBe('M package.json\n?? CHANGELOG.md')
      repository.git('restore', '.')
      repository.git('clean', '--quiet', '-f')

      // The re-run of the same commit, with --skip-existing-versions as the guide says
      rmSync(failCommit())
      const report = await release({ yes: true, skipExistingVersions: true })

      expect(report.status).toBe('released')
      expect(report.version).toBe('1.1.0')
      expect(repository.git('--git-dir', remote, 'tag')).toContain('v1.1.0')
    })
  })

  describe('When the push is refused after the local commit and tag (W4), then the release is run again', () => {
    it('Then the re-run finds nothing to release, and pushing the commit with its tags ends the release', async () => {
      const hook = join(remote, 'hooks', 'pre-receive')
      writeFileSync(hook, '#!/bin/sh\nexit 1\n')
      chmodSync(hook, 0o755)
      const failed: RelizyEvent[] = []

      await expect(release({
        yes: true,
        onProgress: event => failed.push(event),
      })).rejects.toThrow()

      expect(failed.at(-1)).toMatchObject({ type: 'command:error', failedStep: 'Push' })
      expect(repository.git('tag')).toContain('v1.1.0')
      expect(repository.git('--git-dir', remote, 'tag')).not.toContain('v1.1.0')

      rmSync(hook)
      const events: RelizyEvent[] = []
      const report = await release({
        yes: true,
        onProgress: event => events.push(event),
      })

      expect(report.status).toBe('nothing')
      expect(events.at(-1)).toMatchObject({
        type: 'release:finish',
        report: { status: 'nothing' },
      })

      repository.git('push', '--quiet', '--follow-tags')
      expect(repository.git('--git-dir', remote, 'tag')).toContain('v1.1.0')
    })
  })
})
