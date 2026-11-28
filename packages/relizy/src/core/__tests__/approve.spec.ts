import type { StagedVersion } from '@relizy/core'
import process from 'node:process'
import { approveStagedVersions, listStagedVersions } from '@relizy/core'
import { createMockConfig } from '../../../tests/mocks'
import { approveRunVersions, describeApproval, getApprovalBlocker, runApprovalStep } from '../approve'
import { runWithEvents } from '../events'
import { askConfirm } from '../prompts'
import { getStagedVersions, recordStagedVersion } from '../staging'
import { createOtpAsker } from '../two-factor'

vi.mock('@relizy/core', async (importActual) => {
  const actual = await importActual<typeof import('@relizy/core')>()
  return {
    ...actual,
    approveStagedVersions: vi.fn(),
    listStagedVersions: vi.fn(),
  }
})
vi.mock('../prompts')

const NPMJS = 'https://registry.npmjs.org/'
const versions: StagedVersion[] = [
  {
    name: '@s/core',
    version: '1.0.0',
    tag: 'latest',
    registry: NPMJS,
    stageId: 'a1',
  },
  {
    name: '@s/cli',
    version: '1.0.0',
    tag: 'latest',
    registry: NPMJS,
    stageId: 'b2',
  },
]
const dependencies = new Map([
  [
    '@s/cli',
    ['@s/core'],
  ],
])

function setTerminal(tty: boolean) {
  Object.defineProperty(process.stdin, 'isTTY', { value: tty, configurable: true })
  Object.defineProperty(process.stdout, 'isTTY', { value: tty, configurable: true })
}

describe('Given the approval of the staged versions of a run', () => {
  const config = createMockConfig({
    bump: { type: 'patch' },
    publish: { staged: true },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of [
      'CI',
      'GITHUB_ACTIONS',
      'GITHUB_WORKFLOW',
      'CONTINUOUS_INTEGRATION',
      'BUILD_ID',
      'GITLAB_CI',
      'CIRCLECI',
      'NPM_ID_TOKEN',
      'ACTIONS_ID_TOKEN_REQUEST_URL',
      'RELIZY_REPORTER',
    ]) {
      vi.stubEnv(key, '')
    }
    setTerminal(false)
    vi.mocked(approveStagedVersions).mockImplementation(({ versions: given }) => Promise.resolve(given.map(version => ({ ...version, status: 'approved' as const }))))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    setTerminal(false)
  })

  it('Then never approves when disabled, in a CI, under trusted publishing or in a dry run', async () => {
    expect((await approveRunVersions({
      config,
      versions,
      dependencies,
      approve: false,
      dryRun: false,
    })).packages.map(pkg => pkg.reason)).toEqual(['disabled', 'disabled'])
    expect((await approveRunVersions({
      config,
      versions,
      dependencies,
      approve: true,
      dryRun: true,
    })).packages[0]).toEqual({
      name: '@s/core',
      version: '1.0.0',
      stageId: 'a1',
      status: 'skipped',
      reason: 'dry run',
    })

    vi.stubEnv('GITHUB_ACTIONS', 'true')
    expect(getApprovalBlocker()).toBe('ci')
    expect((await approveRunVersions({
      config,
      versions,
      dependencies,
      approve: true,
      dryRun: false,
    })).packages[0]!.reason).toBe('ci')

    expect(approveStagedVersions).not.toHaveBeenCalled()
  })

  it('Then skips without a terminal nor handler, even for an app answering onConfirm', async () => {
    const onConfirm = vi.fn(() => true)

    const prompted = await runWithEvents(undefined, () => approveRunVersions({
      config,
      versions,
      dependencies,
      approve: 'prompt',
      dryRun: false,
    }), { onConfirm })
    const forced = await approveRunVersions({
      config,
      versions,
      dependencies,
      approve: true,
      dryRun: false,
    })

    expect(prompted.packages.map(pkg => pkg.reason)).toEqual(['not interactive', 'not interactive'])
    expect(forced.packages.map(pkg => pkg.reason)).toEqual(['not interactive', 'not interactive'])
    expect(onConfirm).not.toHaveBeenCalled()
    expect(approveStagedVersions).not.toHaveBeenCalled()
  })

  it('Then asks the app with onPrompt, and gives the code of onOtp for the batch', async () => {
    const onPrompt = vi.fn().mockResolvedValue(true)
    const onOtp = vi.fn().mockResolvedValue('123456')
    vi.mocked(approveStagedVersions).mockImplementation(async ({ versions: given, getOtp }) => {
      await getOtp({ purpose: 'approve', count: given.length })
      return given.map(version => ({ ...version, status: 'approved' as const }))
    })

    const data = await runWithEvents(undefined, () => approveRunVersions({
      config,
      versions,
      dependencies,
      approve: 'prompt',
      dryRun: false,
    }), { onPrompt, onOtp })

    expect(onPrompt).toHaveBeenCalledWith({
      kind: 'approve-staged',
      items: [
        { name: '@s/core', version: '1.0.0', stageId: 'a1' },
        { name: '@s/cli', version: '1.0.0', stageId: 'b2' },
      ],
    })
    expect(onOtp).toHaveBeenCalledWith({ registry: NPMJS, purpose: 'approve', count: 2 })
    expect(approveStagedVersions).toHaveBeenCalledWith(expect.objectContaining({
      registry: NPMJS,
      versions: [
        {
          name: '@s/core',
          version: '1.0.0',
          stageId: 'a1',
          dependencies: [],
        },
        {
          name: '@s/cli',
          version: '1.0.0',
          stageId: 'b2',
          dependencies: ['@s/core'],
        },
      ],
    }))
    expect(data.packages.map(pkg => pkg.status)).toEqual(['approved', 'approved'])
    expect(describeApproval(data)).toBe('Approved 2 staged versions')
  })

  it('Then approves nothing when the app or the person declines', async () => {
    const declined = await runWithEvents(undefined, () => approveRunVersions({
      config,
      versions,
      dependencies,
      approve: 'prompt',
      dryRun: false,
    }), {
      onPrompt: () => false,
    })
    expect(declined.packages.map(pkg => pkg.reason)).toEqual(['declined', 'declined'])

    setTerminal(true)
    vi.mocked(askConfirm).mockResolvedValue(false)
    const refused = await approveRunVersions({
      config,
      versions,
      dependencies,
      approve: 'prompt',
      dryRun: false,
    })
    expect(askConfirm).toHaveBeenCalledWith(expect.objectContaining({ message: 'Approve the 2 staged versions now? (one 2FA)' }))
    expect(refused.packages[0]!.reason).toBe('declined')
    expect(describeApproval(refused)).toMatch(/^Not approved \(declined\): run "relizy stage approve --all"/)
  })

  it('Then reads the stage id of a version already staged, and never fails the release', async () => {
    vi.mocked(listStagedVersions).mockResolvedValue([
      {
        stageId: 'c3',
        name: '@s/old',
        version: '1.0.0',
        tag: 'latest',
        status: 'staged',
      },
    ])

    const data = await approveRunVersions({
      config,
      versions: [
        {
          name: '@s/old',
          version: '1.0.0',
          tag: 'latest',
          registry: NPMJS,
        },
      ],
      dependencies,
      approve: true,
      dryRun: false,
    }).catch(error => error)
    // Not interactive without terminal nor onOtp: an app gives onOtp
    expect(data.packages[0].reason).toBe('not interactive')

    const withOtp = await runWithEvents(undefined, () => approveRunVersions({
      config,
      versions: [
        {
          name: '@s/old',
          version: '1.0.0',
          tag: 'latest',
          registry: NPMJS,
        },
      ],
      dependencies,
      approve: true,
      dryRun: false,
    }), {
      onOtp: () => '1',
    })
    expect(withOtp.packages).toEqual([
      {
        name: '@s/old',
        version: '1.0.0',
        stageId: 'c3',
        status: 'approved',
      },
    ])

    vi.mocked(approveStagedVersions).mockRejectedValue(new Error('npm too old'))
    const failed = await runWithEvents(undefined, () => approveRunVersions({
      config,
      versions,
      dependencies,
      approve: true,
      dryRun: false,
    }), {
      onOtp: () => '1',
    })
    expect(failed.packages.map(pkg => pkg.reason)).toEqual(['failed', 'failed'])
  })

  it('Then asks the given code first, then onOtp, and nothing without terminal', async () => {
    const onOtp = vi.fn().mockResolvedValue(' 654321 ')
    const asker = createOtpAsker({ registry: NPMJS, purpose: 'reject', otp: '111111' })

    expect(await asker({ count: 3 })).toBe('111111')
    expect(await runWithEvents(undefined, () => asker({ count: 2 }), { onOtp })).toBe('654321')
    expect(onOtp).toHaveBeenCalledWith({ registry: NPMJS, purpose: 'reject', count: 2 })
    expect(await createOtpAsker({ registry: NPMJS, purpose: 'approve' })({ count: 1 })).toBeUndefined()
  })

  it('Then the step marks the approved versions, and is left out without staging', async () => {
    const ui = {
      step: vi.fn(({ run }) => run()),
      skip: vi.fn(),
    } as any

    await runWithEvents(undefined, async () => {
      expect(await runApprovalStep({
        ui,
        config: createMockConfig({
          bump: { type: 'patch' },
        }),
        dryRun: false,
        packages: [],
      })).toBeUndefined()
      expect(ui.skip).not.toHaveBeenCalled()

      await runApprovalStep({
        ui,
        config,
        dryRun: false,
        packages: [],
      })
      expect(ui.skip).toHaveBeenCalledWith(expect.objectContaining({ name: 'approve', reason: 'nothing staged' }))

      recordStagedVersion(versions[0]!)
      await runApprovalStep({
        ui,
        config,
        dryRun: false,
        packages: [],
      })
      expect(getStagedVersions()[0]!.approved).toBe(true)
    }, {
      onPrompt: () => true,
      onOtp: () => '1',
    })

    await runWithEvents(undefined, async () => {
      recordStagedVersion(versions[0]!)
      await runApprovalStep({
        ui,
        config: createMockConfig({
          bump: { type: 'patch' },
          publish: { staged: true, approve: true },
        }),
        dryRun: false,
        packages: [],
      })
      expect(getStagedVersions()[0]!.approved).toBe(true)
    }, {
      onOtp: () => '1',
    })
  })
})
