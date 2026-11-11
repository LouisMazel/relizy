import type { BumpResultTruthy, GitCommit } from '../../types'
import { getCurrentGitBranch, getGitUpstream, getShortCommitSha } from '@relizy/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockCommit, createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import { attachStepLinks, getNpmLinks, getProviderReleaseLinks, getReleaseAI, getReleaseContent, getReleaseGit, getReleasePublish } from '../release-facts'

vi.mock('@relizy/core', async importActual => ({
  ...await importActual<typeof import('@relizy/core')>(),
  getCurrentGitBranch: vi.fn(),
  getGitUpstream: vi.fn(),
  getShortCommitSha: vi.fn(),
}))

function commit(type: string, hash: string, { breaking = false, author = 'Ada' } = {}): GitCommit {
  return {
    ...createMockCommit(type, `${type}: change ${hash}`),
    shortHash: hash,
    isBreaking: breaking,
    author: { name: author, email: `${author.toLowerCase()}@example.com` },
  }
}

describe('Given the content of a release', () => {
  it('Then counts each commit once, by kind, and the contributors', () => {
    const shared = commit('feat', 'a1')
    const bumpResult = {
      bumped: true,
      rootPackage: {
        commits: [
          shared,
          commit('fix', 'b2', { author: 'Linus' }),
        ],
      },
      bumpedPackages: [
        {
          ...createMockPackageInfo({ name: 'a' }),
          oldVersion: '1.0.0',
          commits: [
            shared,
            commit('feat', 'c3', { breaking: true }),
          ],
        },
        {
          ...createMockPackageInfo({ name: 'b' }),
          oldVersion: '1.0.0',
          commits: [
            commit('docs', 'd4'),
          ],
        },
      ],
    } as unknown as BumpResultTruthy

    expect(getReleaseContent({
      bumpResult,
      config: createMockConfig({}),
    })).toEqual({
      commits: 4,
      features: 2,
      fixes: 1,
      breaking: 1,
      contributors: 2,
    })
  })
})

describe('Given the git of a release', () => {
  const config = createMockConfig({})

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getCurrentGitBranch).mockReturnValue('main')
    vi.mocked(getShortCommitSha).mockReturnValue('a1b2c3d')
  })

  it('Then gives the branch, the release commit and the remote', async () => {
    vi.mocked(getGitUpstream).mockResolvedValue({
      remote: 'origin',
      mergeRef: 'refs/heads/main',
      trackingRef: 'refs/remotes/origin/main',
      name: 'origin/main',
    })

    expect(await getReleaseGit({ config, committed: true, dryRun: false })).toEqual({ branch: 'main', commit: 'a1b2c3d', remote: 'origin/main' })
  })

  it('Then has no commit in dry-run or without commit, nor a remote without upstream', async () => {
    vi.mocked(getGitUpstream).mockResolvedValue(null)

    expect(await getReleaseGit({ config, committed: true, dryRun: true })).toEqual({ branch: 'main' })
    expect(await getReleaseGit({ config, committed: false, dryRun: false })).toEqual({ branch: 'main' })
    expect(getShortCommitSha).not.toHaveBeenCalled()
  })

  it('Then gives nothing out of a git repository', async () => {
    vi.mocked(getCurrentGitBranch).mockImplementation(() => {
      throw new Error('not a git repository')
    })

    expect(await getReleaseGit({ config, committed: false, dryRun: false })).toBeUndefined()
  })
})

describe('Given the publication of a release', () => {
  const stable = createMockPackageInfo({ name: 'relizy', version: '1.0.0', newVersion: '2.0.0' })
  const beta = createMockPackageInfo({ name: '@relizy/beta', version: '1.0.0', newVersion: '2.0.0-beta.0' })

  it('Then gives the dist-tags, the registries and the install command', () => {
    const config = createMockConfig({
      publish: { packageManager: 'pnpm' },
    })

    expect(getReleasePublish({
      config,
      packages: [stable, beta],
    })).toEqual({
      tags: ['latest', 'next'],
      registries: ['registry.npmjs.org'],
      install: 'pnpm add relizy@2.0.0 @relizy/beta@2.0.0-beta.0',
    })
  })

  it('Then gives the configured dist-tag, the host of the registry and the install command of npm', () => {
    const config = createMockConfig({
      publish: { packageManager: 'npm', tag: 'canary', registry: 'https://npm.example.com/repository/' },
    })

    expect(getReleasePublish({
      config,
      packages: [stable],
    })).toEqual({
      tags: ['canary'],
      registries: ['npm.example.com'],
      install: 'npm install relizy@2.0.0',
    })
  })

  it('Then gives no install command above 3 packages, nothing without package', () => {
    const config = createMockConfig({
      publish: { packageManager: 'pnpm' },
    })
    const packages = ['a', 'b', 'c', 'd'].map(name => createMockPackageInfo({ name, newVersion: '2.0.0' }))

    expect(getReleasePublish({ config, packages })).not.toHaveProperty('install')
    expect(getReleasePublish({ config, packages: [] })).toBeUndefined()
  })

  it('Then links the npm pages of the versions published on npm only', () => {
    expect(getNpmLinks({
      config: createMockConfig({}),
      packages: [
        stable,
        createMockPackageInfo({ name: '' }),
      ],
    })).toEqual([
      { step: 'publish', label: 'relizy@2.0.0', url: 'https://www.npmjs.com/package/relizy/v/2.0.0' },
    ])
    expect(getNpmLinks({
      config: createMockConfig({
        publish: { registry: 'https://npm.example.com/' },
      }),
      packages: [stable],
    })).toEqual([])
  })
})

describe('Given the provider releases and the AI of a release', () => {
  it('Then links the provider releases', () => {
    const config = createMockConfig({
      repo: { provider: 'github', domain: 'github.com', repo: 'user/relizy' },
    })

    expect(getProviderReleaseLinks({
      config,
      postedReleases: [
        {
          name: 'relizy',
          tag: 'v2.0.0',
          version: '2.0.0',
          prerelease: false,
        },
      ],
    })).toEqual([
      { step: 'providerRelease', label: 'v2.0.0', url: 'https://github.com/user/relizy/releases/tag/v2.0.0' },
    ])
  })

  it('Then sums the AI rewrites, simulated only when none was called', () => {
    expect(getReleaseAI([])).toBeUndefined()
    expect(getReleaseAI([
      {
        subject: 'the notes of v2.0.0',
        provider: 'claude-code',
        simulated: false,
        durationMs: 1000,
        inputTokens: 3000,
        outputTokens: 600,
        costUsd: 0.01,
      },
      {
        subject: 'the Twitter post',
        provider: 'claude-code',
        simulated: false,
        durationMs: 500,
        inputTokens: 1000,
        outputTokens: 100,
        costUsd: 0.02,
      },
      {
        subject: 'the Slack post',
        provider: 'claude-code',
        simulated: false,
        durationMs: 500,
        inputTokens: 1000,
        outputTokens: 200,
        costUsd: 0.015,
      },
    ])).toEqual({
      provider: 'claude-code',
      rewrites: 3,
      simulated: false,
      durationMs: 2000,
      inputTokens: 5000,
      outputTokens: 900,
      costUsd: 0.045,
    })
    // A call without usage (failed provider, older SDK) does not hide the others
    expect(getReleaseAI([
      {
        subject: 'the notes of v2.0.0',
        provider: 'ai-sdk',
        simulated: false,
        durationMs: 1000,
      },
      {
        subject: 'the Twitter post',
        provider: 'ai-sdk',
        simulated: false,
        durationMs: 500,
        inputTokens: 800,
        outputTokens: 50,
      },
    ])).toEqual({
      provider: 'ai-sdk',
      rewrites: 2,
      simulated: false,
      durationMs: 1500,
      inputTokens: 800,
      outputTokens: 50,
    })
    expect(getReleaseAI([
      { subject: 'the Twitter post', provider: 'ai-sdk', simulated: true },
    ])).toEqual({
      provider: 'ai-sdk',
      rewrites: 1,
      simulated: true,
      durationMs: 0,
    })
  })

  it('Then gives each step the links of what it created', () => {
    const steps = [
      { name: 'publish' as const, status: 'done' as const },
      { name: 'social' as const, status: 'done' as const },
    ]

    attachStepLinks(steps, [
      { step: 'social', label: 'Tweet', url: 'https://x.com/i/web/status/1' },
    ])

    expect(steps).toEqual([
      { name: 'publish', status: 'done' },
      {
        name: 'social',
        status: 'done',
        links: [
          { label: 'Tweet', url: 'https://x.com/i/web/status/1' },
        ],
      },
    ])
  })
})
