import { logger } from '@maz-ui/node'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import { resolveTags } from '../tags'

logger.setLevel('error')

const FIRST_COMMIT_HASH = 'FAKE_COMMIT_HASH'
const TEST_BRANCH = 'test-branch'
const LAST_TAG = 'v1.0.0' // Simulates the most recent tag (could be stable or prerelease)
const LAST_STABLE_TAG = 'v0.9.0' // Simulates the last stable tag

vi.mock('../git', async (importActual) => {
  const actual = await importActual<typeof import('../git')>()

  return {
    ...actual,
    getCurrentGitRef: vi.fn(() => TEST_BRANCH),
    getFirstCommit: vi.fn(() => FIRST_COMMIT_HASH),
  }
})

vi.mock('@maz-ui/node', async (importActual) => {
  const actual = await importActual<typeof import('@maz-ui/node')>()

  return {
    ...actual,
    execPromise: vi.fn((param) => {
      // Mock for getAllRecentRepoTags (returns multiple tags)
      if (param === `git tag --sort=-creatordate | head -n 50`) {
        // Simulate a realistic scenario:
        // - v2.0.0-beta.0 (newest, prerelease, major 2 - simulates future beta)
        // - v1.0.0 (LAST_TAG, stable, major 1)
        // - v0.9.0 (LAST_STABLE_TAG, stable, major 0)
        // - v0.8.0 (older stable)
        return Promise.resolve({
          stdout: 'v2.0.0-beta.0\nv1.0.0\nv0.9.0\nv0.8.0',
        })
      }

      // Mock for getLastStableTag
      if (param === `git tag --sort=-creatordate | grep -E '^[^0-9]*[0-9]+\\.[0-9]+\\.[0-9]+$' | head -n 1`) {
        return Promise.resolve({
          stdout: LAST_STABLE_TAG, // v0.9.0
        })
      }

      // Mock for getLastTag
      if (param === `git tag --sort=-creatordate | head -n 1`) {
        return Promise.resolve({
          stdout: LAST_TAG, // v1.0.0
        })
      }

      return Promise.resolve({
        stdout: '',
      })
    }),
  }
})

describe('Given resolveTags function', () => {
  describe('When user provides tags', () => {
    it('Then returns user provided tags', async () => {
      const config = createMockConfig({ bump: { type: 'release' }, from: 'v1.0.0', to: 'v2.0.0', versionMode: 'selective' })
      const result = await resolveTags<'bump'>({
        config,
        step: 'bump',
        pkg: createMockPackageInfo(),
        newVersion: undefined,
      })

      expect(result).toEqual({ from: 'v1.0.0', to: 'v2.0.0' })
    })
  })

  describe('When version mode is independent', () => {
    describe('And step is bump', () => {
      it('Then resolves tags', async () => {
        const config = createMockConfig({ bump: { type: 'release' }, versionMode: 'independent' })
        const result = await resolveTags<'bump'>({
          config,
          step: 'bump',
          pkg: createMockPackageInfo(),
          newVersion: undefined,
        })

        expect(result).toEqual({ from: FIRST_COMMIT_HASH, to: TEST_BRANCH })
      })

      it('Then resolves tags for changelog step', async () => {
        const config = createMockConfig({ bump: { type: 'release' }, versionMode: 'independent' })
        const result = await resolveTags<'changelog'>({
          config,
          step: 'changelog',
          pkg: createMockPackageInfo(),
          newVersion: '1.1.0',
        })

        expect(result.from).toBe(FIRST_COMMIT_HASH)
        expect(result.to).toBe(TEST_BRANCH)
      })

      it('Then resolves tags for publish step with newVersion', async () => {
        const config = createMockConfig({ bump: { type: 'release' }, versionMode: 'independent' })
        const result = await resolveTags<'publish'>({
          config,
          step: 'publish',
          pkg: createMockPackageInfo({ name: 'pkg-a' }),
          newVersion: '1.1.0',
        })

        expect(result.from).toBe(FIRST_COMMIT_HASH)
        expect(result.to).toBe('pkg-a@1.1.0')
      })

      it('Then resolves tags for provider-release step', async () => {
        const config = createMockConfig({ bump: { type: 'release' }, versionMode: 'independent' })
        const result = await resolveTags<'provider-release'>({
          config,
          step: 'provider-release',
          pkg: createMockPackageInfo({ name: 'pkg-a' }),
          newVersion: '2.0.0',
        })

        expect(result.from).toBe(FIRST_COMMIT_HASH)
        expect(result.to).toBe('pkg-a@2.0.0')
      })
    })
  })

  describe('When version mode is unified', () => {
    describe('And step is bump', () => {
      it('Then resolves tags using repo-wide tag', async () => {
        const config = createMockConfig({ bump: { type: 'release' }, versionMode: 'unified' })
        const result = await resolveTags<'bump'>({
          config,
          step: 'bump',
          pkg: createMockPackageInfo(),
          newVersion: undefined,
        })

        expect(result).toEqual({ from: LAST_TAG, to: TEST_BRANCH })
      })

      it('Then resolves tags for changelog step', async () => {
        const config = createMockConfig({ bump: { type: 'release' }, versionMode: 'unified' })
        const result = await resolveTags<'changelog'>({
          config,
          step: 'changelog',
          pkg: createMockPackageInfo(),
          newVersion: '1.1.0',
        })

        expect(result.from).toBe(LAST_TAG)
        expect(result.to).toBe(TEST_BRANCH)
      })

      it('Then resolves tags for publish step with version', async () => {
        const config = createMockConfig({
          bump: { type: 'release' },
          versionMode: 'unified',
        })
        config.templates = {
          ...config.templates,
          tagBody: 'v{{newVersion}}',
        }

        const result = await resolveTags<'publish'>({
          config,
          step: 'publish',
          pkg: createMockPackageInfo(),
          newVersion: '1.2.0',
        })

        expect(result.from).toBe(LAST_TAG)
        expect(result.to).toBe('v1.2.0')
      })
    })
  })

  describe('When version mode is selective', () => {
    describe('And step is bump', () => {
      it('Then resolves tags for stable to stable', async () => {
        const config = createMockConfig({ bump: { type: 'release' }, versionMode: 'selective' })
        const result = await resolveTags<'bump'>({
          config,
          step: 'bump',
          pkg: createMockPackageInfo(),
          newVersion: undefined,
        })

        expect(result).toEqual({ from: LAST_TAG, to: TEST_BRANCH })
      })

      it('Then resolves tags for prerelease to stable', async () => {
        const config = createMockConfig({ bump: { type: 'release' }, versionMode: 'selective' })
        const result = await resolveTags<'bump'>({
          config,
          step: 'bump',
          pkg: createMockPackageInfo({ version: '1.0.0-next.0' }), // prerelease of major 1
          newVersion: undefined,
        })

        // When graduating from 1.0.0-next.0 to stable, should use last stable tag with major <= 1
        // which is v1.0.0 (LAST_TAG), not v0.9.0 (LAST_STABLE_TAG)
        expect(result).toEqual({ from: LAST_TAG, to: TEST_BRANCH })
      })

      it('Then resolves tags for prerelease to prerelease', async () => {
        const config = createMockConfig({ bump: { type: 'prerelease' }, versionMode: 'selective' })
        const result = await resolveTags<'bump'>({
          config,
          step: 'bump',
          pkg: createMockPackageInfo({ version: '1.0.0-next.0' }),
          newVersion: undefined,
        })

        expect(result).toEqual({ from: LAST_TAG, to: TEST_BRANCH })
      })

      it('Then resolves tags for changelog step', async () => {
        const config = createMockConfig({ bump: { type: 'release' }, versionMode: 'selective' })
        const result = await resolveTags<'changelog'>({
          config,
          step: 'changelog',
          pkg: createMockPackageInfo(),
          newVersion: '1.1.0',
        })

        expect(result.from).toBe(LAST_TAG)
        expect(result.to).toBe(TEST_BRANCH)
      })

      it('Then resolves tags for publish step', async () => {
        const config = createMockConfig({
          bump: { type: 'release' },
          versionMode: 'selective',
        })
        config.templates = {
          ...config.templates,
          tagBody: 'v{{newVersion}}',
        }

        const result = await resolveTags<'publish'>({
          config,
          step: 'publish',
          pkg: createMockPackageInfo(),
          newVersion: '1.5.0',
        })

        expect(result.from).toBe(LAST_TAG)
        expect(result.to).toBe('v1.5.0')
      })

      it('Then filters prerelease tags when bumping stable to stable', async () => {
        const config = createMockConfig({ bump: { type: 'patch' }, versionMode: 'selective' })

        // Stable version bumping to another stable version should filter out newer major prerelease tags
        const result = await resolveTags<'bump'>({
          config,
          step: 'bump',
          pkg: createMockPackageInfo({ version: '1.0.0' }), // Current stable version (major 1)
          newVersion: undefined,
        })

        // Should use v1.0.0 (LAST_TAG), filtering out v2.0.0-beta.0 (higher major)
        expect(result).toEqual({ from: LAST_TAG, to: TEST_BRANCH })
      })

      it('Then does not filter prerelease tags when on prerelease version', async () => {
        const config = createMockConfig({ bump: { type: 'prerelease' }, versionMode: 'selective' })

        // Prerelease version bumping to another prerelease should not filter
        const result = await resolveTags<'bump'>({
          config,
          step: 'bump',
          pkg: createMockPackageInfo({ version: '2.0.0-beta.0' }), // Current prerelease version
          newVersion: undefined,
        })

        // Should use v2.0.0-beta.0 which is the most recent tag matching major 2
        // Since we're on 2.0.0-beta.0, v2.0.0-beta.0 itself should be filtered, so next would be v1.0.0
        // But wait, the from tag should be the last tag, not the current version
        // Actually, let me reconsider - the mock returns v2.0.0-beta.0 as the newest tag
        // If current version is 2.0.0-beta.0 (prerelease), we don't filter prereleases
        // But we do filter tags with major > 2, so v2.0.0-beta.0 is compatible
        // The most recent compatible tag would be v2.0.0-beta.0 itself
        expect(result.from).toBe('v2.0.0-beta.0')
        expect(result.to).toBe(TEST_BRANCH)
      })
    })
  })
})
