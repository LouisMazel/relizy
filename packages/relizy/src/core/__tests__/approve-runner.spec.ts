import { spawn } from 'node:child_process'
import process from 'node:process'
import { logger } from '@maz-ui/node'
import { describeApproval, getApprovalBlocker } from '../approve'
import { runWithEvents } from '../events'
import { askText } from '../prompts'
import { createOtpAsker, getWebAuthHandler, isInteractiveTerminal, openNpmPage } from '../two-factor'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))
vi.mock('@maz-ui/node', async importActual => ({
  ...await importActual<typeof import('@maz-ui/node')>(),
  execPromise: vi.fn(),
}))
vi.mock('../prompts')

function setTerminal(tty: boolean) {
  Object.defineProperty(process.stdin, 'isTTY', { value: tty, configurable: true })
  Object.defineProperty(process.stdout, 'isTTY', { value: tty, configurable: true })
}

describe('Given the 2FA of the approval', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('RELIZY_REPORTER', '')
    setTerminal(false)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
    setTerminal(false)
  })

  it('Then shows the web 2FA page to the app, else in the output with the 5 minutes tip', async () => {
    const onWebAuth = vi.fn()
    await runWithEvents(undefined, () => getWebAuthHandler()({ url: 'https://www.npmjs.com/auth/cli/0661', purpose: 'approve' }), { onWebAuth })
    expect(onWebAuth).toHaveBeenCalledWith({ url: 'https://www.npmjs.com/auth/cli/0661', purpose: 'approve' })

    const info = vi.spyOn(logger, 'info').mockImplementation(() => {})
    await getWebAuthHandler()({ url: 'https://www.npmjs.com/auth/cli/0662', purpose: 'trust' })
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/^Validate on npm\nTo set up trusted publishing, validate with your security key, passkey or code:\nhttps:\/\/www\.npmjs\.com\/auth\/cli\/0662\n\nCheck "skip 2FA for the next 5 minutes"/))
  })

  it('Then opens the npm page in the browser only in a terminal outside a CI', () => {
    const unref = vi.fn()
    vi.mocked(spawn).mockReturnValue({
      on: vi.fn(),
      unref,
    } as never)
    vi.stubEnv('CI', '')
    vi.stubEnv('GITHUB_ACTIONS', '')
    vi.stubEnv('GITHUB_WORKFLOW', '')
    vi.stubEnv('CONTINUOUS_INTEGRATION', '')
    vi.stubEnv('BUILD_ID', '')

    expect(openNpmPage('https://www.npmjs.com/auth/cli/0661')).toBe(false)
    setTerminal(true)
    expect(openNpmPage('https://evil.example/auth')).toBe(false)
    expect(openNpmPage('https://www.npmjs.com/auth/cli/0661')).toBe(true)
    expect(spawn).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining(['https://www.npmjs.com/auth/cli/0661']), { detached: true, stdio: 'ignore' })
    expect(unref).toHaveBeenCalled()
    vi.stubEnv('BROWSER', 'none')
    expect(openNpmPage('https://www.npmjs.com/auth/cli/0661')).toBe(false)
    vi.stubEnv('BROWSER', '')
    vi.mocked(spawn).mockImplementationOnce(() => {
      throw new Error('spawn failed')
    })
    expect(openNpmPage('https://www.npmjs.com/auth/cli/0661')).toBe(false)
  })

  it('Then asks the code in the terminal, and tells when a person can answer', async () => {
    expect(isInteractiveTerminal()).toBe(false)
    setTerminal(true)
    expect(isInteractiveTerminal()).toBe(true)
    vi.stubEnv('RELIZY_REPORTER', 'json')
    expect(isInteractiveTerminal()).toBe(false)
    vi.stubEnv('RELIZY_REPORTER', '')

    vi.mocked(askText).mockResolvedValueOnce(' 123456 ').mockResolvedValueOnce('').mockRejectedValueOnce(new Error('cancel'))
    const asker = createOtpAsker({ registry: 'https://registry.npmjs.org/', purpose: 'approve' })
    expect(await asker({ count: 2 })).toBe('123456')
    expect(askText).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('2FA code of npm for 2 versions'),
    }))
    expect(await asker({ count: 1 })).toBeUndefined()
    expect(await asker({ count: 1 })).toBeUndefined()
  })

  it('Then is blocked under trusted publishing, and tells a partial approval', () => {
    for (const key of [
      'CI',
      'GITHUB_WORKFLOW',
      'CONTINUOUS_INTEGRATION',
      'BUILD_ID',
    ]) {
      vi.stubEnv(key, '')
    }
    vi.stubEnv('GITHUB_ACTIONS', '')
    vi.stubEnv('GITLAB_CI', '')
    vi.stubEnv('NPM_ID_TOKEN', '')
    expect(getApprovalBlocker()).toBeUndefined()

    expect(describeApproval({
      packages: [
        { name: 'a', version: '1.0.0', status: 'approved' },
        {
          name: 'b',
          version: '1.0.0',
          status: 'skipped',
          reason: 'validating',
        },
      ],
    }))
      .toBe('Approved 1 of 2 staged versions, the others await approval')
    expect(describeApproval({
      packages: [
        { name: 'a', version: '1.0.0', status: 'approved' },
      ],
    })).toBe('Approved 1 staged version')
  })
})
