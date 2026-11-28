import type { RelizyEvent } from '../../core/events'
import process from 'node:process'
import { approveStagedVersions, listStagedVersions, rejectStagedVersion } from '@relizy/core'
import { createMockConfig } from '../../../tests/mocks'
import { loadRelizyConfig, readPackages } from '../../core'
import { askMultiselect } from '../../core/prompts'
import { stage } from '../stage'

vi.mock('../../core/config', async importActual => ({
  ...await importActual<typeof import('../../core/config')>(),
  loadRelizyConfig: vi.fn(),
}))
vi.mock('../../core/prompts', async importActual => ({
  ...await importActual<typeof import('../../core/prompts')>(),
  askMultiselect: vi.fn(),
}))
vi.mock('../../core/repo', async importActual => ({
  getPrivatePackagesMode: (await importActual<typeof import('../../core/repo')>()).getPrivatePackagesMode,
  readPackageJson: vi.fn(),
  readPackages: vi.fn(),
}))
vi.mock('@relizy/core', async (importActual) => {
  const actual = await importActual<typeof import('@relizy/core')>()
  return {
    ...actual,
    approveStagedVersions: vi.fn(),
    listStagedVersions: vi.fn(),
    rejectStagedVersion: vi.fn(),
    readDependencyFields: vi.fn(() => ({})),
    prepareCiRepository: vi.fn(),
  }
})

const entries = [
  {
    stageId: 'a1',
    name: '@s/core',
    version: '1.0.0',
    tag: 'latest',
    status: 'staged',
  },
  {
    stageId: 'b2',
    name: '@s/cli',
    version: '1.0.0',
    tag: 'latest',
    status: 'staged',
  },
]

describe('Given relizy stage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
      publish: { registry: 'https://registry.npmjs.org/', args: [] },
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
      {
        name: 'app',
        version: '1.0.0',
        private: true,
        path: '/p/app',
      },
    ] as any)
    vi.mocked(listStagedVersions).mockResolvedValue(entries)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('Then lists the staged versions of the public packages, with their data', async () => {
    const events: RelizyEvent[] = []

    const response = await stage({
      action: 'list',
      onProgress: event => events.push(event),
    })

    expect(listStagedVersions).toHaveBeenCalledWith(expect.objectContaining({
      registry: 'https://registry.npmjs.org/',
      packageNames: ['@s/core', '@s/cli'],
    }))
    expect(response).toEqual({ action: 'list', staged: entries, results: [] })
    expect(events.find(event => event.type === 'step:done')).toMatchObject({
      step: 'list',
      data: { versions: entries },
    })
  })

  it('Then approves the named packages with one code, and refuses an unknown one', async () => {
    vi.mocked(approveStagedVersions).mockImplementation(async ({ versions, getOtp }) => {
      await getOtp({ purpose: 'approve', count: versions.length })
      return versions.map(version => ({ ...version, status: 'approved' as const }))
    })
    const onOtp = vi.fn().mockResolvedValue('123456')

    const response = await stage({
      action: 'approve',
      packages: ['@s/core'],
      onOtp,
    })

    expect(onOtp).toHaveBeenCalledWith({ registry: 'https://registry.npmjs.org/', purpose: 'approve', count: 2 })
    expect(response.results.map(result => result.status)).toEqual(['approved', 'approved'])
    await expect(stage({
      action: 'approve',
      packages: ['app'],
    })).rejects.toThrow('Not a public package of the project: app')
  })

  it('Then needs the names or --all without terminal', async () => {
    await expect(stage({ action: 'approve' })).rejects.toThrow('relizy stage approve needs the packages to approve: pass their names or --all')
  })

  it('Then rejects only once confirmed, never without terminal nor handler', async () => {
    const nothing = await stage({ action: 'reject', all: true })
    expect(nothing.results).toEqual([])
    expect(rejectStagedVersion).not.toHaveBeenCalled()

    const onPrompt = vi.fn().mockResolvedValue(true)
    const response = await stage({
      action: 'reject',
      all: true,
      otp: '111111',
      onPrompt,
    })
    expect(onPrompt).toHaveBeenCalledWith({
      kind: 'reject-staged',
      items: [
        { name: '@s/core', version: '1.0.0', stageId: 'a1' },
        { name: '@s/cli', version: '1.0.0', stageId: 'b2' },
      ],
    })
    expect(vi.mocked(rejectStagedVersion).mock.calls.map(call => [call[0].stageId, call[0].otp])).toEqual([
      ['a1', '111111'],
      ['b2', '111111'],
    ])
    expect(response.results.map(result => result.status)).toEqual(['rejected', 'rejected'])
  })

  it('Then calls nothing in a dry run, and refuses in a CI', async () => {
    const onOtp = vi.fn()
    await stage({
      action: 'approve',
      all: true,
      dryRun: true,
      onOtp,
    })
    expect(listStagedVersions).not.toHaveBeenCalled()
    expect(onOtp).not.toHaveBeenCalled()

    vi.stubEnv('GITHUB_ACTIONS', 'true')
    await expect(stage({ action: 'approve', all: true })).rejects.toThrow('from your npm login')
    expect(approveStagedVersions).not.toHaveBeenCalled()
  })

  it('Then chooses the versions in the terminal, and tells a security key needs the web 2FA', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    vi.stubEnv('RELIZY_REPORTER', '')
    vi.mocked(askMultiselect).mockResolvedValue(['b2'])
    vi.mocked(approveStagedVersions).mockResolvedValue([
      {
        name: '@s/cli',
        version: '1.0.0',
        stageId: 'b2',
        status: 'failed',
        reason: 'web-auth',
        url: 'https://www.npmjs.com/settings',
      },
    ])

    const response = await stage({
      action: 'approve',
      otp: '1',
      onProgress: () => {},
    })

    expect(askMultiselect).toHaveBeenCalledWith(expect.objectContaining({
      initialValues: ['a1', 'b2'],
    }))
    expect(vi.mocked(approveStagedVersions).mock.calls[0]![0].versions).toEqual([
      {
        name: '@s/cli',
        version: '1.0.0',
        stageId: 'b2',
        dependencies: [],
      },
    ])
    expect(response.results[0]).toMatchObject({ reason: 'web-auth' })
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true })
  })

  it('Then tries without code, asks it once npm needs it, and reports a version npm fails to reject', async () => {
    const onOtp = vi.fn().mockResolvedValueOnce('111111')
    vi.mocked(rejectStagedVersion)
      .mockRejectedValueOnce(new Error('EOTP one-time password required'))
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error('npm error code E500'))

    const response = await stage({
      action: 'reject',
      all: true,
      onOtp,
      onPrompt: () => true,
    })

    expect(onOtp).toHaveBeenCalledTimes(1)
    expect(vi.mocked(rejectStagedVersion).mock.calls.map(([options]) => options.otp)).toEqual([undefined, '111111', '111111'])
    expect(response.results).toEqual([
      {
        name: '@s/core',
        version: '1.0.0',
        stageId: 'a1',
        status: 'rejected',
      },
      {
        name: '@s/cli',
        version: '1.0.0',
        stageId: 'b2',
        status: 'failed',
        reason: 'npm error code E500',
      },
    ])
  })

  it('Then says when there is nothing to approve, and lists nothing', async () => {
    vi.mocked(listStagedVersions).mockResolvedValue([])
    expect((await stage({ action: 'approve', all: true })).results).toEqual([])
    expect((await stage({ action: 'list' })).staged).toEqual([])
  })
})
