import type { DeepPartial } from '@maz-ui/utils/ts-helpers/DeepPartial'
import type { ResolvedRelizyConfig } from '../src/core/config'
import type { GitCommit, PackageBase, RelizyConfig, SocialTemplateVariables } from '../src/types'
import { expect } from 'vitest'
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

/**
 * Variables of the social templates for a single version released
 */
export function socialVariables({ projectName = 'pkg', newVersion = '1.0.0', ...overrides }: Partial<SocialTemplateVariables> = {}): SocialTemplateVariables {
  return {
    projectName,
    newVersion,
    releaseTitle: `${projectName} ${newVersion} is out!`,
    packageList: `${projectName}@${newVersion}`,
    packageCount: '1',
    ...overrides,
  }
}

/**
 * The context of a step hook: undefined without bump result
 */
export const anyHookContext = expect.toBeOneOf([undefined, expect.objectContaining({ bumpResult: expect.any(Object), release: expect.any(Object) })])
