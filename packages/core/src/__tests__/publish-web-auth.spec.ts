import { exec } from 'node:child_process'
import { runNpmPublishWithWebAuth } from '../publish'

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}))

const LINKS = JSON.stringify({
  error: { code: 'EOTP', authUrl: 'https://www.npmjs.com/auth/cli/0661', doneUrl: 'https://registry.npmjs.org/-/v1/done?authId=0661' },
})

function build({ otp, json }: { otp?: string, json?: boolean }) {
  return ['npm publish', otp && `--otp ${otp}`, json && '--json'].filter(Boolean).join(' ')
}

describe('Given an npm publish that asks a one-time password', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('Then runs it again with --json for the web 2FA links, shows the page, and publishes with the token', async () => {
    vi.mocked(exec).mockImplementation(((_command: string, _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      callback(new Error('Command failed'), LINKS, '')
    }) as never)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"token":"9919257186804593"}', { status: 200 })))
    const run = vi.fn()
      .mockRejectedValueOnce(new Error('npm error code EOTP one-time password'))
      .mockResolvedValueOnce({ stdout: '+ pkg@1.0.0' })
    const onWebAuth = vi.fn()

    expect(await runNpmPublishWithWebAuth({
      run,
      build,
      cwd: '/repo/pkg',
      onWebAuth,
    })).toEqual({ stdout: '+ pkg@1.0.0' })
    expect(exec).toHaveBeenCalledWith('npm publish --json', expect.objectContaining({ cwd: '/repo/pkg' }), expect.any(Function))
    expect(onWebAuth).toHaveBeenCalledWith({ url: 'https://www.npmjs.com/auth/cli/0661', purpose: 'publish' })
    expect(run.mock.calls.map(([command]) => command)).toEqual(['npm publish', 'npm publish --otp 9919257186804593'])
  })

  it('Then keeps the first error without handler or for another failure, and the result when the second run publishes', async () => {
    const otpError = new Error('npm error code EOTP one-time password')
    await expect(runNpmPublishWithWebAuth({
      run: vi.fn().mockRejectedValue(otpError),
      build,
      cwd: '/repo',
    })).rejects.toBe(otpError)

    const other = new Error('npm error code E500')
    await expect(runNpmPublishWithWebAuth({
      run: vi.fn().mockRejectedValue(other),
      build,
      cwd: '/repo',
      onWebAuth: vi.fn(),
    })).rejects.toBe(other)

    vi.mocked(exec).mockImplementation(((_command: string, _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      callback(null, '{"id":"pkg@1.0.0"}', '')
    }) as never)
    const onWebAuth = vi.fn()
    expect(await runNpmPublishWithWebAuth({
      run: vi.fn().mockRejectedValue(otpError),
      build,
      cwd: '/repo',
      onWebAuth,
    })).toEqual({ stdout: '{"id":"pkg@1.0.0"}' })
    expect(onWebAuth).not.toHaveBeenCalled()
  })
})
