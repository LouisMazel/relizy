import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { execPromise } from '@maz-ui/node'
import { createInteractiveNpmRunner, createOtpAsker, describeApproval, getApprovalBlocker, isInteractiveTerminal } from '../approve'
import { askText } from '../prompts'

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

function fakeChild() {
  const child = Object.assign(new EventEmitter(), {
    kill: vi.fn(),
  })
  vi.mocked(spawn).mockReturnValue(child as never)
  return child
}

const options = {
  cwd: '/tmp',
  env: { NPM_TOKEN: '' },
  timeoutMs: 1000,
}

describe('Given the interactive npm runner of the approval', () => {
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

  it('Then runs the calls that need the 2FA in the terminal, and the reads without it', async () => {
    const runner = createInteractiveNpmRunner()
    vi.mocked(execPromise).mockResolvedValue({ stdout: '[]', stderr: '' })
    expect(await runner(['stage', 'list', 'pkg', '--json'], options)).toEqual({ stdout: '[]' })
    expect(execPromise).toHaveBeenCalledWith('npm stage list pkg --json', expect.objectContaining({
      cwd: '/tmp',
      env: { NPM_TOKEN: '' },
      timeout: 1000,
    }))

    const child = fakeChild()
    const approving = runner(['stage', 'approve', 'a1'], options)
    child.emit('exit', 0)
    expect(await approving).toEqual({ stdout: '' })
    expect(spawn).toHaveBeenCalledWith('npm', ['stage', 'approve', 'a1'], expect.objectContaining({ stdio: 'inherit', cwd: '/tmp' }))
  })

  it('Then fails on an exit code, an error and a timeout, and refuses an unsafe argument', async () => {
    const runner = createInteractiveNpmRunner()

    const failed = fakeChild()
    const exit = runner(['trust', 'github', 'pkg'], options)
    failed.emit('exit', 1)
    await expect(exit).rejects.toThrow('npm trust github exited with code 1')

    const broken = fakeChild()
    const error = runner(['stage', 'reject', 'a1'], options)
    broken.emit('error', new Error('ENOENT'))
    await expect(error).rejects.toThrow('ENOENT')

    vi.useFakeTimers()
    const stuck = fakeChild()
    const timeout = runner(['stage', 'approve', 'a1'], options)
    timeout.catch(() => {})
    await vi.advanceTimersByTimeAsync(1000)
    await expect(timeout).rejects.toMatchObject({ killed: true })
    expect(stuck.kill).toHaveBeenCalled()

    await expect(runner(['stage', 'approve', 'a1; rm'], options)).rejects.toThrow('Unsafe argument')
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
    vi.stubEnv('CI', '')
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
