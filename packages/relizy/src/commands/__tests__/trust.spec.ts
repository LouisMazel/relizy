import type { ReleaseWorkflow } from '@relizy/core'
import process from 'node:process'
import { createTrustedPublisher, getUploadNpmVersion, isPackageOnRegistry, listTrustedPublishers, readReleaseWorkflows, revokeTrustedPublisher } from '@relizy/core'
import { createMockConfig } from '../../../tests/mocks'
import { loadRelizyConfig, readPackages } from '../../core'
import { getPackagePermissions, getWantedPublishers, trust } from '../trust'

vi.mock('../../core/config', async importActual => ({
  ...await importActual<typeof import('../../core/config')>(),
  loadRelizyConfig: vi.fn(),
}))
vi.mock('../../core/repo', async importActual => ({
  getPrivatePackagesMode: (await importActual<typeof import('../../core/repo')>()).getPrivatePackagesMode,
  readPackageJson: vi.fn(),
  readPackages: vi.fn(),
}))
// The config of the repository is never written by the tests
vi.mock('magicast', () => ({
  loadFile: vi.fn(() => Promise.resolve({
    exports: {
      default: { $type: 'object' },
    },
  })),
  writeFile: vi.fn(),
}))
vi.mock('magicast/helpers', () => ({
  getDefaultExportOptions: vi.fn(() => ({})),
}))
vi.mock('../../core/release-preview', () => ({
  previewRelease: vi.fn(() => Promise.resolve({
    sets: [
      {
        packages: [
          { name: '@s/core' },
        ],
      },
    ],
  })),
}))
vi.mock('@relizy/core', async (importActual) => {
  const actual = await importActual<typeof import('@relizy/core')>()
  return {
    ...actual,
    createTrustedPublisher: vi.fn(),
    getUploadNpmVersion: vi.fn(() => '11.15.0'),
    isPackageOnRegistry: vi.fn(),
    listTrustedPublishers: vi.fn(),
    readReleaseWorkflows: vi.fn(),
    revokeTrustedPublisher: vi.fn(),
    prepareCiRepository: vi.fn(),
  }
})

const release: ReleaseWorkflow = {
  provider: 'github',
  file: 'release.yml',
  path: '.github/workflows/release.yml',
  repository: 'acme/repo',
  generated: true,
  jobs: [
    { name: 'release' },
  ],
}

describe('Given relizy trust', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({
      toFake: ['setTimeout'],
    })
    for (const key of [
      'CI',
      'GITHUB_ACTIONS',
      'GITHUB_WORKFLOW',
      'CONTINUOUS_INTEGRATION',
      'BUILD_ID',
      'GITLAB_CI',
      'NPM_ID_TOKEN',
      'ACTIONS_ID_TOKEN_REQUEST_URL',
    ]) {
      vi.stubEnv(key, '')
    }
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
    vi.mocked(loadRelizyConfig).mockResolvedValue(createMockConfig({
      bump: { type: 'patch' },
      publish: { args: [] },
    }))
    vi.mocked(readPackages).mockReturnValue([
      {
        name: '@s/core',
        version: '1.0.0',
        private: false,
        path: '/p/core',
      },
      {
        name: '@s/cli',
        version: '1.0.0',
        private: false,
        path: '/p/cli',
      },
    ] as any)
    vi.mocked(readReleaseWorkflows).mockResolvedValue([release])
    vi.mocked(isPackageOnRegistry).mockResolvedValue(true)
    vi.mocked(listTrustedPublishers).mockResolvedValue([])
    vi.mocked(createTrustedPublisher).mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  async function run(options: Parameters<typeof trust>[0] = {}) {
    const pending = trust(options)
    pending.catch(() => {})
    await vi.runAllTimersAsync()
    return pending
  }

  describe('When the permissions come from publish.staged', () => {
    it('Then gives direct publish to a package never staged, both to a staged one (its canaries publish directly)', () => {
      expect(getPackagePermissions(false, 'a')).toEqual({ allowPublish: true, allowStagePublish: false })
      // Its canaries are published directly
      expect(getPackagePermissions({
        packages: ['a'],
      }, 'a')).toEqual({ allowPublish: true, allowStagePublish: true })
      expect(getPackagePermissions({
        packages: ['a'],
      }, 'b')).toEqual({ allowPublish: true, allowStagePublish: false })
      expect(getPackagePermissions({
        tags: ['latest'],
      }, 'a')).toEqual({ allowPublish: true, allowStagePublish: true })
      expect(getPackagePermissions(true, 'a')).toEqual({ allowPublish: true, allowStagePublish: true })
    })

    it('Then reads two configurations when npm enforces staging by environment, and the flags override the files', () => {
      const enforced = getWantedPublishers({
        workflows: [
          {
            ...release,
            jobs: [
              { name: 'stable', environment: 'npm-staged' },
              { name: 'next', environment: 'npm-direct' },
            ],
          },
        ],
        options: {},
      })
      expect(enforced).toEqual([
        {
          source: {
            type: 'github',
            file: 'release.yml',
            repository: 'acme/repo',
            environment: 'npm-staged',
          },
          permissions: { allowPublish: false, allowStagePublish: true },
        },
        {
          source: {
            type: 'github',
            file: 'release.yml',
            repository: 'acme/repo',
            environment: 'npm-direct',
          },
          permissions: { allowPublish: true, allowStagePublish: false },
        },
      ])
      expect(getWantedPublishers({
        workflows: [release],
        options: { repo: 'other/repo', env: 'prod' },
      })).toEqual([
        {
          source: {
            type: 'github',
            file: 'release.yml',
            repository: 'other/repo',
            environment: 'prod',
          },
        },
      ])
      expect(getWantedPublishers({
        workflows: [],
        options: {
          circleci: {
            orgId: 'o',
            projectId: 'p',
            pipelineDefinitionId: 'd',
            vcsOrigin: 'github.com/a/r',
          },
        },
      })[0]!.source).toMatchObject({ type: 'circleci' })
      expect(() => getWantedPublishers({
        workflows: [
          { ...release, repository: undefined },
        ],
        options: {},
      })).toThrow('pass --repo owner/repo')
    })
  })

  it('Then creates the missing configurations with one code, says the existing ones, and warns about the ones that expire', async () => {
    vi.mocked(listTrustedPublishers).mockImplementation(({ packageName }) => Promise.resolve(packageName === '@s/cli'
      ? [
          {
            id: 't1',
            type: 'github',
            file: 'release.yml',
            repository: 'acme/repo',
            allowPublish: true,
            allowStagePublish: false,
            raw: {},
          },
        ]
      : []))
    vi.mocked(listTrustedPublishers).mockRejectedValueOnce(new Error('npm error code EOTP one-time password'))
    const onOtp = vi.fn().mockResolvedValue('123456')

    const response = await run({ onOtp })

    expect(onOtp).toHaveBeenCalledTimes(1)
    expect(onOtp).toHaveBeenCalledWith({ registry: 'https://registry.npmjs.org/', purpose: 'trust', count: 2 })
    expect(createTrustedPublisher).toHaveBeenCalledTimes(1)
    expect(createTrustedPublisher).toHaveBeenCalledWith(expect.objectContaining({
      packageName: '@s/core',
      source: { type: 'github', file: 'release.yml', repository: 'acme/repo' },
      allowPublish: true,
      allowStagePublish: false,
      otp: '123456',
    }))
    expect(response.results.map(result => [result.name, result.status])).toEqual([
      ['@s/core', 'created'],
      ['@s/cli', 'exists'],
    ])
    expect(response.expiring).toEqual([])
  })

  it('Then reports a differing configuration, and replaces it only with --replace once confirmed', async () => {
    vi.mocked(listTrustedPublishers).mockResolvedValue([
      {
        id: 't1',
        type: 'github',
        file: 'release.yml',
        repository: 'acme/repo',
        allowPublish: false,
        allowStagePublish: true,
        raw: {},
      },
    ])

    const differs = await run({
      packages: ['@s/core'],
      otp: '1',
    })
    expect(differs.results[0]).toMatchObject({
      status: 'differs',
      reason: expect.stringContaining('--replace'),
    })

    const declined = await run({
      packages: ['@s/core'],
      otp: '1',
      replace: true,
    })
    expect(declined.results[0]!.status).toBe('differs')
    expect(revokeTrustedPublisher).not.toHaveBeenCalled()

    const onPrompt = vi.fn(({ kind }) => Promise.resolve(kind === 'replace-trust'))
    const replaced = await run({
      packages: ['@s/core'],
      otp: '1',
      replace: true,
      onPrompt,
    })
    expect(onPrompt).toHaveBeenCalledWith(expect.objectContaining({ kind: 'replace-trust' }))
    expect(revokeTrustedPublisher).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }))
    expect(replaced.results[0]!.status).toBe('replaced')
  })

  it('Then gives the way to create a package not on npm, and proposes publish.staged for the packages that may only stage', async () => {
    vi.mocked(isPackageOnRegistry).mockImplementation(({ name }) => Promise.resolve(name !== '@s/cli'))
    vi.mocked(listTrustedPublishers).mockResolvedValue([
      {
        id: 't1',
        type: 'github',
        file: 'release.yml',
        repository: 'acme/repo',
        allowPublish: false,
        allowStagePublish: true,
        raw: {},
      },
    ])

    const response = await run({ otp: '1' })

    expect(response.results.find(result => result.name === '@s/cli')).toMatchObject({
      status: 'missing',
      reason: expect.stringContaining('not on npm yet'),
    })
    expect(response.proposedStaged).toEqual({
      packages: ['@s/core'],
    })
    expect(response.configWritten).toBe(false)
  })

  it('Then calls nothing in a dry run, refuses in a CI and with an npm without npm trust', async () => {
    await run({ dryRun: true })
    expect(listTrustedPublishers).not.toHaveBeenCalled()

    vi.mocked(getUploadNpmVersion).mockReturnValueOnce('11.14.1')
    await expect(run({ otp: '1' })).rejects.toThrow('relizy trust needs npm 11.15.0 or later')

    vi.stubEnv('GITHUB_ACTIONS', 'true')
    await expect(run({ otp: '1' })).rejects.toThrow('from your npm login')
    expect(createTrustedPublisher).not.toHaveBeenCalled()
  })

  it('Then needs a release workflow', async () => {
    vi.mocked(readReleaseWorkflows).mockResolvedValue([])
    await expect(run()).rejects.toThrow('No release workflow found')
  })

  it('Then sets up a GitLab project and a CircleCI pipeline, and asks the code once npm needs it', async () => {
    vi.mocked(readReleaseWorkflows).mockResolvedValue([
      {
        provider: 'gitlab',
        file: '.gitlab-ci.yml',
        path: '.gitlab-ci.yml',
        repository: 'group/project',
        generated: true,
        jobs: [
          { name: 'release', environment: 'npm' },
        ],
      },
    ])
    vi.mocked(listTrustedPublishers)
      .mockRejectedValueOnce(new Error('npm error code EOTP one-time password'))
      .mockResolvedValue([])
    const onOtp = vi.fn().mockResolvedValueOnce('222222')

    const gitlab = await run({
      packages: ['@s/core'],
      onOtp,
    })
    expect(onOtp).toHaveBeenCalledTimes(1)
    expect(createTrustedPublisher).toHaveBeenCalledWith(expect.objectContaining({
      source: {
        type: 'gitlab',
        file: '.gitlab-ci.yml',
        project: 'group/project',
        environment: 'npm',
      },
      otp: '222222',
    }))
    expect(gitlab.results[0]!.status).toBe('created')

    const circleci = {
      orgId: 'o',
      projectId: 'p',
      pipelineDefinitionId: 'd',
      vcsOrigin: 'github.com/acme/repo',
    }
    await run({
      packages: ['@s/core'],
      otp: '1',
      circleci,
      dryRun: true,
    })
    await run({
      packages: ['@s/core'],
      otp: '1',
      circleci,
    })
    expect(createTrustedPublisher).toHaveBeenLastCalledWith(expect.objectContaining({
      source: { type: 'circleci', ...circleci },
    }))
    expect(readReleaseWorkflows).toHaveBeenCalledTimes(1)
  })

  it('Then proposes the stable releases when npm enforces staging, and reports a failed package', async () => {
    vi.mocked(readReleaseWorkflows).mockResolvedValue([
      {
        ...release,
        jobs: [
          { name: 'stable', environment: 'npm-staged' },
          { name: 'next', environment: 'npm-direct' },
        ],
      },
    ])
    vi.mocked(createTrustedPublisher).mockRejectedValueOnce(new Error('npm error code E409 already exists'))

    const response = await run({ otp: '1' })

    expect(response.proposedStaged).toEqual({
      tags: ['latest'],
    })
    expect(response.results[0]).toMatchObject({ status: 'failed', reason: 'npm error code E409 already exists' })
    await expect(run({
      packages: ['nope'],
    })).rejects.toThrow('Not a public package of the project: nope')
  })

  it('Then keeps a direct publish configuration to which npm added the staged publish', async () => {
    vi.mocked(listTrustedPublishers).mockResolvedValue([
      {
        id: 't1',
        type: 'github',
        file: 'release.yml',
        repository: 'acme/repo',
        allowPublish: true,
        allowStagePublish: true,
        raw: {},
      },
    ])

    const response = await run({
      packages: ['@s/core'],
      otp: '1',
    })

    expect(response.results[0]!.status).toBe('exists')
    expect(createTrustedPublisher).not.toHaveBeenCalled()
  })
})
