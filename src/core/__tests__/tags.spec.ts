import { logger } from '@maz-ui/node'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import { resolveTags } from '../tags'

logger.setLevel('error')

const FIRST_COMMIT_HASH = 'FAKE_COMMIT_HASH'
const TEST_BRANCH = 'test-branch'

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
      if (param === `git tag --sort=-creatordate | grep -E '^[^0-9]*[0-9]+\\.[0-9]+\\.[0-9]+$' | head -n 1`) {
        return Promise.resolve({
          stdout: 'LAST_STABLE_TAG',
        })
      }

      if (param === `git tag --sort=-creatordate | head -n 1`) {
        return Promise.resolve({
          stdout: 'LAST_TAG',
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

        expect(result).toEqual({ from: 'LAST_TAG', to: TEST_BRANCH })
      })

      it('Then resolves tags for changelog step', async () => {
        const config = createMockConfig({ bump: { type: 'release' }, versionMode: 'unified' })
        const result = await resolveTags<'changelog'>({
          config,
          step: 'changelog',
          pkg: createMockPackageInfo(),
          newVersion: '1.1.0',
        })

        expect(result.from).toBe('LAST_TAG')
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

        expect(result.from).toBe('LAST_TAG')
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

        expect(result).toEqual({ from: 'LAST_TAG', to: TEST_BRANCH })
      })

      it('Then resolves tags for prerelease to stable', async () => {
        const config = createMockConfig({ bump: { type: 'release' }, versionMode: 'selective' })
        const result = await resolveTags<'bump'>({
          config,
          step: 'bump',
          pkg: createMockPackageInfo({ version: '1.0.0-next.0' }),
          newVersion: undefined,
        })

        expect(result).toEqual({ from: 'LAST_STABLE_TAG', to: TEST_BRANCH })
      })

      it('Then resolves tags for prerelease to prerelease', async () => {
        const config = createMockConfig({ bump: { type: 'prerelease' }, versionMode: 'selective' })
        const result = await resolveTags<'bump'>({
          config,
          step: 'bump',
          pkg: createMockPackageInfo({ version: '1.0.0-next.0' }),
          newVersion: undefined,
        })

        expect(result).toEqual({ from: 'LAST_TAG', to: TEST_BRANCH })
      })

      it('Then resolves tags for changelog step', async () => {
        const config = createMockConfig({ bump: { type: 'release' }, versionMode: 'selective' })
        const result = await resolveTags<'changelog'>({
          config,
          step: 'changelog',
          pkg: createMockPackageInfo(),
          newVersion: '1.1.0',
        })

        expect(result.from).toBe('LAST_TAG')
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

        expect(result.from).toBe('LAST_TAG')
        expect(result.to).toBe('v1.5.0')
      })
    })
  })
})
