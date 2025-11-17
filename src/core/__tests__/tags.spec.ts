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
    })
  })
})
