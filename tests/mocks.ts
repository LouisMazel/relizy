import type { GitCommit } from 'changelogen'
import type { ResolvedRelizyConfig } from '../src/core/config'
import type { BumpConfig, PackageBase, VersionMode } from '../src/types'
import { getDefaultConfig } from '../src/core/config'

export function createMockConfig({
  to,
  from,
  versionMode,
  bump,
}: {
  to?: string
  from?: string
  versionMode?: VersionMode
  bump: Partial<BumpConfig>
}) {
  const defaultConfig = getDefaultConfig()

  return {
    ...defaultConfig,
    cwd: process.cwd(),
    to,
    from,
    monorepo: {
      versionMode: versionMode || 'selective',
      packages: ['packages/*'],
    },
    bump: {
      ...defaultConfig.bump,
      ...bump,
    },
  } as ResolvedRelizyConfig
}

export function createMockCommit(type: string, message: string): GitCommit {
  return {
    shortHash: 'abc1234',
    author: { name: 'Test', email: 'test@example.com' },
    message,
    body: '',
    type,
    scope: '',
    references: [],
    description: message,
    isBreaking: false,
    authors: [],
  } as GitCommit
}

export function createMockPackageInfo(overrides?: Partial<PackageBase>): PackageBase {
  return {
    name: 'pkg-a',
    path: '/packages/pkg-a',
    version: '1.0.0',
    private: false,
    newVersion: '1.0.1',
    dependencies: [],
    dependencyChain: [],
    reason: 'commits',
    fromTag: 'v1.0.0',
    commits: [],
    ...overrides,
  }
}
