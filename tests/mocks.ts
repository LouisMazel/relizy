import type { DeepPartial } from '@maz-ui/utils'
import type { GitCommit } from 'changelogen'
import type { ResolvedRelizyConfig } from '../src/core/config'
import type { PackageBase, RelizyConfig } from '../src/types'
import { getDefaultConfig } from '../src/core/config'

export function createMockConfig(config: DeepPartial<RelizyConfig> & { versionMode?: NonNullable<RelizyConfig['monorepo']>['versionMode'] }) {
  const defaultConfig = getDefaultConfig()
  const versionMode = config.versionMode ?? config.monorepo?.versionMode ?? 'selective'

  return {
    ...defaultConfig,
    ...config,
    monorepo: {
      versionMode,
      packages: ['packages/*'],
      ...config.monorepo,
    },
    bump: {
      ...defaultConfig.bump,
      ...config.bump,
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
