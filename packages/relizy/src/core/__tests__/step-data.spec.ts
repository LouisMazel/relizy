import type { RelizyEvent } from '../events'
import { setTimeout as sleep } from 'node:timers/promises'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import { runWithEvents } from '../events'
import { emitStepItem, getBumpStepData, getProviderReleaseStepData, getSocialStepData, recordChangelogFile, recordPrComment, recordPublishedPackage, recordReleaseCommit, takeChangelogFiles, takeCommitAndTagStepData, takePrCommentStepData, takePublishStepData } from '../step-data'

describe('Given the data of the steps', () => {
  describe('When a bump bumps nothing', () => {
    it('Then has no package', () => {
      expect(getBumpStepData({ bumped: false })).toEqual({ packages: [] })
    })
  })

  describe('When a bump has version groups', () => {
    it('Then gives the group of each package', () => {
      const core = {
        ...createMockPackageInfo({ name: '@relizy/core', version: '1.0.0', newVersion: '1.1.0' }),
        oldVersion: '1.0.0',
      }
      const cli = {
        ...createMockPackageInfo({ name: 'relizy', version: '2.0.0', newVersion: '2.1.0' }),
        oldVersion: '2.0.0',
      }

      expect(getBumpStepData({
        bumped: true,
        bumpedPackages: [core, cli],
        groups: [
          {
            name: 'core',
            title: 'Core',
            versionMode: 'independent',
            bumped: true,
            bumpedPackages: [core],
          },
        ],
      })).toEqual({
        packages: [
          {
            name: '@relizy/core',
            oldVersion: '1.0.0',
            newVersion: '1.1.0',
            group: 'core',
          },
          { name: 'relizy', oldVersion: '2.0.0', newVersion: '2.1.0' },
        ],
      })
    })
  })

  describe('When provider releases are posted', () => {
    it('Then gives their page when the repository is known', () => {
      const release = {
        name: 'v2.0.0',
        tag: 'v2.0.0',
        prerelease: false,
        version: '2.0.0',
      }
      const known = createMockConfig({
        repo: { provider: 'github', domain: 'github.com', repo: 'acme/app' },
      })
      const unknown = createMockConfig({
        repo: { provider: 'github' },
      })

      expect(getProviderReleaseStepData(known, {
        detectedProvider: 'github',
        postedReleases: [release],
      })).toEqual({
        provider: 'github',
        releases: [
          { tag: 'v2.0.0', name: 'v2.0.0', url: 'https://github.com/acme/app/releases/tag/v2.0.0' },
        ],
      })
      expect(getProviderReleaseStepData(unknown, {
        detectedProvider: 'github',
        postedReleases: [release],
      }).releases).toEqual([
        { tag: 'v2.0.0', name: 'v2.0.0' },
      ])
    })
  })

  describe('When the posts are done', () => {
    it('Then gives the status of each platform', () => {
      expect(getSocialStepData({
        hasErrors: true,
        results: [
          { platform: 'twitter', success: true, url: 'https://x.com/i/web/status/1' },
          { platform: 'slack', success: true, skipped: 'prerelease' },
          { platform: 'teams', success: false, error: 'timeout' },
        ],
      }, { dryRun: false })).toEqual({
        dryRun: false,
        posts: [
          { platform: 'twitter', status: 'posted', url: 'https://x.com/i/web/status/1' },
          { platform: 'slack', status: 'skipped', reason: 'prerelease' },
          { platform: 'teams', status: 'failed', reason: 'timeout' },
        ],
      })
    })
  })

  describe('When a pull request is commented', () => {
    it('Then gives it once, then nothing', () => {
      recordPrComment({ number: 12, url: 'https://github.com/acme/app/pull/12' })

      expect(takePrCommentStepData(true)).toEqual({ posted: true, number: 12, url: 'https://github.com/acme/app/pull/12' })
      expect(takePrCommentStepData(false)).toEqual({ posted: false })

      recordPrComment({ number: 13, url: 'https://github.com/acme/app/pull/13' })
      recordPrComment(null)
      expect(takePrCommentStepData(false)).toEqual({ posted: false })
    })
  })

  describe('When no release commit was made', () => {
    it('Then gives only the tags', () => {
      expect(takeCommitAndTagStepData(['v1.0.0'])).toEqual({
        tags: ['v1.0.0'],
      })
    })
  })

  describe('When nothing was published and the config has no registry', () => {
    it('Then gives the registry of the npmrc and the default dist-tag', () => {
      const config = createMockConfig({
        publish: { registry: undefined },
      })

      expect(takePublishStepData(config, { dryRun: false })).toEqual({
        registry: expect.stringMatching(/^https?:\/\//),
        tag: 'latest',
        dryRun: false,
        packages: [],
      })
    })
  })

  describe('When the publish and the posts are simulated', () => {
    it('Then their data say it is a dry run', () => {
      const config = createMockConfig({
        publish: { registry: 'https://registry.npmjs.org/' },
      })

      runWithEvents(undefined, () => {
        recordPublishedPackage({ name: 'relizy', version: '2.0.0', status: 'published' })

        expect(takePublishStepData(config, { dryRun: true })).toMatchObject({
          dryRun: true,
          packages: [
            { name: 'relizy', status: 'published' },
          ],
        })
      })
      expect(getSocialStepData({
        hasErrors: false,
        results: [
          { platform: 'slack', success: true },
        ],
      }, { dryRun: true })).toEqual({
        dryRun: true,
        posts: [
          { platform: 'slack', status: 'posted' },
        ],
      })
    })
  })

  describe('When two runs record their steps at the same time', () => {
    it('Then each run takes only what it recorded', async () => {
      const config = createMockConfig({
        publish: { registry: 'https://registry.npmjs.org/' },
      })
      const run = (name: string, delay: number) => runWithEvents(undefined, async () => {
        recordChangelogFile({ file: `${name}/CHANGELOG.md`, packageName: name, content: name })
        await sleep(delay)
        recordPublishedPackage({ name, version: '1.0.0', status: 'published' })
        recordReleaseCommit({ hash: name, message: `chore(release): ${name}` })
        recordPrComment({ number: delay, url: `https://github.com/acme/${name}/pull/${delay}` })
        await sleep(delay)

        return {
          changelogs: takeChangelogFiles().files.map(file => file.packageName),
          published: takePublishStepData(config, { dryRun: false }).packages.map(pkg => pkg.name),
          commit: takeCommitAndTagStepData([]).commit?.hash,
          pr: takePrCommentStepData(true).number,
        }
      })

      const [first, second] = await Promise.all([
        run('app-a', 20),
        run('app-b', 5),
      ])

      expect(first).toEqual({
        changelogs: ['app-a'],
        published: ['app-a'],
        commit: 'app-a',
        pr: 20,
      })
      expect(second).toEqual({
        changelogs: ['app-b'],
        published: ['app-b'],
        commit: 'app-b',
        pr: 5,
      })
    })

    it('Then a command run by another one shares the state of its parent', () => {
      runWithEvents(undefined, () => {
        runWithEvents(undefined, () => recordChangelogFile({ file: 'CHANGELOG.md', packageName: 'app', content: '' }))

        expect(takeChangelogFiles().files.map(file => file.packageName)).toEqual(['app'])
      })
    })
  })

  describe('When a step follows one of its things', () => {
    it('Then emits a step:item event', () => {
      const events: RelizyEvent[] = []

      runWithEvents(event => events.push(event), () => emitStepItem('publish', { name: 'relizy@2.0.0', status: 'running' }))

      expect(events).toEqual([
        {
          type: 'step:item',
          step: 'publish',
          item: { name: 'relizy@2.0.0', status: 'running' },
          time: expect.any(Number),
        },
      ])
    })
  })
})
