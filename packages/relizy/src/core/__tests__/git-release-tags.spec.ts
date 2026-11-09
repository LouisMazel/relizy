import type { ResolvedRelizyConfig } from '../config'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import { getReleaseTagNames } from '../git'
import { readPackageJson } from '../repo'

vi.mock('../repo', () => ({
  readPackageJson: vi.fn(),
  hasLernaJson: vi.fn(),
}))

function createReleaseConfig(overrides: Partial<ResolvedRelizyConfig['release']> = {}): ResolvedRelizyConfig {
  const config = createMockConfig({
    bump: { type: 'patch' },
  })

  config.release = {
    ...config.release,
    gitTag: true,
    commit: true,
    push: true,
    noVerify: false,
    ...overrides,
  }

  return config
}

describe('Given getReleaseTagNames function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When the version mode is unified', () => {
    it('Then returns the tag built from the new version', () => {
      const config = createReleaseConfig()
      config.monorepo = { ...config.monorepo!, versionMode: 'unified' }

      expect(getReleaseTagNames({ config, newVersion: '1.2.0' })).toEqual(['v1.2.0'])
    })

    it('Then falls back to the root package version', () => {
      vi.mocked(readPackageJson).mockReturnValue({
        name: 'root',
        version: '1.3.0',
        path: '/project',
        private: true,
      })
      const config = createReleaseConfig()

      expect(getReleaseTagNames({ config })).toEqual(['v1.3.0'])
    })
  })

  describe('When the version mode is independent', () => {
    it('Then returns one tag per bumped package', () => {
      const config = createReleaseConfig()
      config.monorepo = { ...config.monorepo!, versionMode: 'independent' }
      const bumpedPackages = [
        {
          ...createMockPackageInfo({ name: 'pkg-a', newVersion: '1.0.1' }),
          oldVersion: '1.0.0',
        },
        {
          ...createMockPackageInfo({ name: 'pkg-b', newVersion: '2.1.0' }),
          oldVersion: '2.0.0',
        },
      ]

      expect(getReleaseTagNames({ config, bumpedPackages })).toEqual(['pkg-a@1.0.1', 'pkg-b@2.1.0'])
    })
  })

  describe('When git tags are disabled', () => {
    it('Then returns no tag', () => {
      const config = createReleaseConfig({ gitTag: false })

      expect(getReleaseTagNames({ config, newVersion: '1.2.0' })).toEqual([])
    })
  })
})
