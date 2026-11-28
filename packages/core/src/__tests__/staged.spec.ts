import type { NpmCommandRunner } from '../staged'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { isVersionPublished } from '../npm-versions'
import { InteractiveAuthRequiredError } from '../stage-publish'
import {
  approveStagedVersion,
  approveStagedVersions,
  assertInteractiveNpmAuth,
  getStagedApprovalUrl,
  getStagedState,
  getStagedVersion,
  getWebAuth,
  listStagedVersions,
  parseStagedEntries,
  rejectStagedVersion,
  waitForWebAuth,
} from '../staged'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('../npm-versions', async importActual => ({
  ...await importActual<typeof import('../npm-versions')>(),
  isVersionPublished: vi.fn(),
}))

const NPMJS = 'https://registry.npmjs.org/'
const LOCAL: NodeJS.ProcessEnv = {}
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

// The shape of `npm stage list --json` (npm/cli v12.2.3, test/lib/commands/stage)
function item(overrides: Record<string, unknown> = {}) {
  return {
    id: A,
    packageName: '@scope/core',
    version: '1.2.0',
    tag: 'latest',
    createdAt: '2026-11-28T00:00:00.000Z',
    actor: 'louismazel',
    actorType: 'user',
    access: 'public',
    shasum: 'abc',
    status: 'staged',
    ...overrides,
  }
}

function npmError(message: string, stdout = '') {
  return Object.assign(new Error(message), { stdout })
}

/** A runner answering `stage view`, `stage approve` and `stage reject` from a table of statuses */
function fakeRunner(statuses: Record<string, string | undefined>, approve: (id: string, otp?: string) => void = () => {}) {
  const calls: string[][] = []
  const runner: NpmCommandRunner = vi.fn(async (args) => {
    await Promise.resolve()
    calls.push(args)
    const [, action, id] = args
    if (action === 'view') {
      const status = statuses[id!]
      if (!status) {
        throw npmError('npm error code E404')
      }
      return {
        stdout: JSON.stringify(item({ id, status })),
      }
    }
    if (action === 'approve') {
      const otp = args.find((arg: string) => arg.startsWith('--otp='))?.slice('--otp='.length)
      approve(id!, otp)
      statuses[id!] = undefined
    }
    return { stdout: '' }
  })
  return { runner, calls }
}

describe('Given the staged versions of npm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When the person is not at a terminal of their own', () => {
    it('Then refuses in a CI and under trusted publishing, before calling npm', async () => {
      expect(() => assertInteractiveNpmAuth({ CI: 'true' })).toThrow(InteractiveAuthRequiredError)
      expect(() => assertInteractiveNpmAuth({ GITLAB_CI: 'true', NPM_ID_TOKEN: 'jwt' })).toThrow(/from your npm login/)
      expect(() => assertInteractiveNpmAuth(LOCAL)).not.toThrow()

      const runner = vi.fn()
      await expect(listStagedVersions({
        cwd: '/repo',
        registry: NPMJS,
        env: { GITHUB_ACTIONS: 'true' },
        runner,
      })).rejects.toBeInstanceOf(InteractiveAuthRequiredError)
      await expect(approveStagedVersions({
        cwd: '/repo',
        registry: NPMJS,
        env: { CI: 'true' },
        runner,
        versions: [],
        getOtp: vi.fn(),
      })).rejects.toMatchObject({ code: 'E_INTERACTIVE_AUTH' })
      expect(runner).not.toHaveBeenCalled()
    })
  })

  describe('When they are listed', () => {
    it('Then maps the JSON of npm, keeps an unknown status and drops what is not an entry', () => {
      expect(parseStagedEntries(JSON.stringify([
        item(),
        item({ id: B, status: 'quarantined', tag: undefined }),
        { foo: 1 },
      ]))).toEqual([
        {
          stageId: A,
          name: '@scope/core',
          version: '1.2.0',
          tag: 'latest',
          status: 'staged',
          createdAt: '2026-11-28T00:00:00.000Z',
          actor: 'louismazel',
          actorType: 'user',
          access: 'public',
          shasum: 'abc',
        },
        expect.objectContaining({ stageId: B, status: 'quarantined', tag: 'latest' }),
      ])
      expect(parseStagedEntries(JSON.stringify({
        items: [
          item(),
        ],
        total: 1,
      }))).toHaveLength(1)
      expect(parseStagedEntries(JSON.stringify(item()))).toHaveLength(1)
      expect(parseStagedEntries('')).toEqual([])
      expect(parseStagedEntries('npm notice\n[]')).toEqual([])
    })

    it('Then runs npm with the token variables blanked, from a neutral directory, per package', async () => {
      const runner = vi.fn<NpmCommandRunner>(args => Promise.resolve({
        stdout: args[2] === '@scope/core'
          ? JSON.stringify([
              item(),
            ])
          : '[]',
      }))

      const entries = await listStagedVersions({
        cwd: '/repo',
        registry: NPMJS,
        packageNames: ['@scope/core', '@scope/cli'],
        env: LOCAL,
        runner,
        timeoutMs: 5000,
      })

      expect(entries.map(entry => entry.name)).toEqual(['@scope/core'])
      expect(runner).toHaveBeenCalledWith([
        'stage',
        'list',
        '@scope/core',
        '--json',
        '--registry',
        NPMJS,
      ], {
        cwd: tmpdir(),
        env: { NPM_TOKEN: '', NODE_AUTH_TOKEN: '', RELIZY_NPM_TOKEN: '' },
        timeoutMs: 5000,
      })
    })

    it('Then lists every staged version of the login without names, and none for a package npm does not know', async () => {
      const runner = vi.fn<NpmCommandRunner>()
        .mockResolvedValueOnce({
          stdout: JSON.stringify([
            item(),
            item({ id: B }),
          ]),
        })
        .mockRejectedValueOnce(npmError('npm error code E404'))
        .mockRejectedValueOnce(npmError('npm error code ENEEDAUTH'))

      expect(await listStagedVersions({
        cwd: '/repo',
        registry: NPMJS,
        env: LOCAL,
        runner,
      })).toHaveLength(2)
      expect(runner.mock.calls[0]![0]).toEqual([
        'stage',
        'list',
        '--json',
        '--registry',
        NPMJS,
      ])
      expect(await listStagedVersions({
        cwd: '/repo',
        registry: NPMJS,
        packageNames: ['new-pkg'],
        env: LOCAL,
        runner,
      })).toEqual([])
      await expect(listStagedVersions({
        cwd: '/repo',
        registry: NPMJS,
        packageNames: ['pkg'],
        env: LOCAL,
        runner,
      })).rejects.toThrow('ENEEDAUTH')
    })

    it('Then runs npm without a terminal by default, with a large buffer and the timeout, and keeps its output on a failure', async () => {
      vi.mocked(execFile).mockImplementation(((_file: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        callback(null, '[]', '')
      }) as never)

      await listStagedVersions({
        cwd: '/repo',
        registry: NPMJS,
        packageNames: ['@scope/core'],
        env: LOCAL,
      })

      expect(execFile).toHaveBeenCalledWith('npm', [
        'stage',
        'list',
        '@scope/core',
        '--json',
        '--registry',
        NPMJS,
      ], expect.objectContaining({
        cwd: tmpdir(),
        env: expect.objectContaining({ NPM_TOKEN: '', NODE_AUTH_TOKEN: '', RELIZY_NPM_TOKEN: '' }),
        timeout: 60_000,
        maxBuffer: 64 * 1024 * 1024,
      }), expect.any(Function))

      vi.mocked(execFile).mockImplementation(((_file: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        callback(new Error('Command failed'), '{"error":{"code":"EOTP"}}', 'npm error code EOTP')
      }) as never)
      await expect(approveStagedVersion({
        cwd: '/repo',
        registry: NPMJS,
        stageId: A,
        env: LOCAL,
      })).rejects.toMatchObject({ stdout: '{"error":{"code":"EOTP"}}', stderr: 'npm error code EOTP' })
      vi.mocked(execFile).mockImplementation(((_file: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        callback(new Error('Command failed: npm stage list'), 'Unknown command: "stage"\n{"error":{"code":"EUNKNOWNCOMMAND","summary":""}}', '')
      }) as never)
      await expect(listStagedVersions({ cwd: '/repo', registry: NPMJS, env: LOCAL })).rejects.toThrow('Update the npm CLI (not pnpm, yarn or bun): npm install -g npm@latest')
      vi.mocked(execFile).mockImplementation(((_file: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        callback(Object.assign(new Error('spawn npm ENOENT'), { code: 'ENOENT' }), '', '')
      }) as never)
      await expect(listStagedVersions({ cwd: '/repo', registry: NPMJS, env: LOCAL })).rejects.toMatchObject({
        code: 'E_STAGING_UNAVAILABLE',
        message: expect.stringContaining('npm was not found'),
      })
      vi.mocked(execFile).mockImplementation(((_file: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        callback(new Error('Command failed: npm stage list'), '{"error":{"code":"E401","summary":"401 Unauthorized"}}', '')
      }) as never)
      await expect(listStagedVersions({ cwd: '/repo', registry: NPMJS, env: LOCAL })).rejects.toThrow('401 Unauthorized\nLog in to npm with "npm login", then run the command again')
      vi.mocked(execFile).mockImplementation(((_file: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        callback(new Error('Command failed: npm stage list'), '{not json', '')
      }) as never)
      await expect(listStagedVersions({ cwd: '/repo', registry: NPMJS, env: LOCAL })).rejects.toThrow('Command failed: npm stage list')
      await expect(listStagedVersions({
        cwd: '/repo',
        registry: NPMJS,
        packageNames: ['a; rm -rf /'],
        env: LOCAL,
      })).rejects.toThrow('Unsafe argument')
    })
  })

  describe('When one is viewed, approved or rejected', () => {
    it('Then views it, and gives nothing once it left the staging area', async () => {
      const { runner } = fakeRunner({ [A]: 'validating' })
      expect(await getStagedVersion({
        cwd: '/repo',
        registry: NPMJS,
        stageId: A,
        env: LOCAL,
        runner,
      })).toMatchObject({ status: 'validating' })
      expect(await getStagedVersion({
        cwd: '/repo',
        registry: NPMJS,
        stageId: B,
        env: LOCAL,
        runner,
      })).toBeUndefined()

      const failing = vi.fn<NpmCommandRunner>().mockRejectedValue(npmError('E500'))
      await expect(getStagedVersion({
        cwd: '/repo',
        registry: NPMJS,
        stageId: A,
        env: LOCAL,
        runner: failing,
      })).rejects.toThrow('E500')
    })

    it('Then approves and rejects with the code', async () => {
      const runner = vi.fn<NpmCommandRunner>().mockResolvedValue({ stdout: '' })

      await approveStagedVersion({
        cwd: '/repo',
        registry: NPMJS,
        stageId: A,
        otp: '123456',
        env: LOCAL,
        runner,
      })
      await rejectStagedVersion({
        cwd: '/repo',
        registry: NPMJS,
        stageId: B,
        env: LOCAL,
        runner,
      })

      expect(runner.mock.calls.map(call => call[0])).toEqual([
        [
          'stage',
          'approve',
          A,
          '--json',
          '--otp=123456',
          '--registry',
          NPMJS,
        ],
        [
          'stage',
          'reject',
          B,
          '--json',
          '--registry',
          NPMJS,
        ],
      ])
    })
  })

  describe('When a batch is approved', () => {
    const versions = [
      {
        name: '@scope/cli',
        version: '1.2.0',
        stageId: B,
        dependencies: ['@scope/core'],
      },
      { name: '@scope/core', version: '1.2.0', stageId: A },
    ]

    it('Then approves only the given versions, dependencies first, with one code asked once npm needs it', async () => {
      const approved: string[] = []
      const { runner } = fakeRunner({ [A]: 'staged', [B]: 'staged' }, (id, otp) => {
        if (!otp) {
          throw npmError('npm error code EOTP\nThis operation requires a one-time password')
        }
        approved.push(`${id}:${otp}`)
      })
      const getOtp = vi.fn().mockResolvedValue('123456')
      const onItem = vi.fn()

      const results = await approveStagedVersions({
        cwd: '/repo',
        registry: NPMJS,
        versions,
        getOtp,
        onItem,
        env: LOCAL,
        runner,
      })

      expect(approved).toEqual([`${A}:123456`, `${B}:123456`])
      expect(getOtp).toHaveBeenCalledTimes(1)
      expect(getOtp).toHaveBeenCalledWith({ purpose: 'approve', count: 2 })
      expect(results).toEqual([
        {
          name: '@scope/core',
          version: '1.2.0',
          stageId: A,
          status: 'approved',
        },
        {
          name: '@scope/cli',
          version: '1.2.0',
          stageId: B,
          status: 'approved',
        },
      ])
      expect(onItem).toHaveBeenCalledTimes(2)
    })

    it('Then approves every version of one package, none dropped', async () => {
      const approved: string[] = []
      const { runner } = fakeRunner({ [A]: 'staged', [B]: 'staged' }, id => approved.push(id))

      const results = await approveStagedVersions({
        cwd: '/repo',
        registry: NPMJS,
        versions: [
          { name: 'pkg', version: '1.0.1', stageId: A },
          { name: 'pkg', version: '1.0.2', stageId: B },
        ],
        getOtp: () => undefined,
        env: LOCAL,
        runner,
      })

      expect(approved).toEqual([A, B])
      expect(results.map(result => `${result.version}:${result.status}`)).toEqual(['1.0.1:approved', '1.0.2:approved'])
    })

    it('Then asks the code again when npm refuses it, and retries the version', async () => {
      let refused = false
      const { runner } = fakeRunner({ [A]: 'staged', [B]: 'staged' }, (id, otp) => {
        if (!otp) {
          throw npmError('npm error code EOTP\nThis operation requires a one-time password')
        }
        if (id === B && otp === '111111' && !refused) {
          refused = true
          throw npmError('npm error code EOTP\nThis operation requires a one-time password')
        }
      })
      const getOtp = vi.fn().mockResolvedValueOnce('111111').mockResolvedValueOnce('222222')

      const results = await approveStagedVersions({
        cwd: '/repo',
        registry: NPMJS,
        versions,
        getOtp,
        env: LOCAL,
        runner,
      })

      expect(getOtp).toHaveBeenCalledTimes(2)
      expect(results.map(result => result.status)).toEqual(['approved', 'approved'])
    })

    it('Then skips the rest when the code is cancelled, and skips a dependent of a version not approved', async () => {
      const { runner } = fakeRunner({ [A]: 'staged', [B]: 'staged' }, () => {
        throw npmError('EOTP one-time password required')
      })
      const getOtp = vi.fn().mockResolvedValueOnce(undefined)

      const results = await approveStagedVersions({
        cwd: '/repo',
        registry: NPMJS,
        versions,
        getOtp,
        env: LOCAL,
        runner,
      })

      expect(results).toEqual([
        expect.objectContaining({ name: '@scope/core', status: 'skipped', reason: 'cancelled' }),
        expect.objectContaining({ name: '@scope/cli', status: 'skipped', reason: 'cancelled' }),
      ])

      const failing = fakeRunner({ [A]: 'staged', [B]: 'staged' }, (id) => {
        if (id === A) {
          throw npmError('npm error code E500 Internal Server Error')
        }
      })
      const second = await approveStagedVersions({
        cwd: '/repo',
        registry: NPMJS,
        versions,
        otp: '1',
        getOtp: () => '1',
        env: LOCAL,
        runner: failing.runner,
      })
      expect(second).toEqual([
        expect.objectContaining({ name: '@scope/core', status: 'failed', reason: 'npm error code E500 Internal Server Error' }),
        expect.objectContaining({ name: '@scope/cli', status: 'skipped', reason: 'dependency @scope/core not approved' }),
      ])
    })

    it('Then waits for a validating version, then skips it when the scan takes too long', async () => {
      vi.useFakeTimers()
      const statuses: Record<string, string | undefined> = { [A]: 'validating' }
      const { runner, calls } = fakeRunner(statuses)
      const onValidating = vi.fn()

      const pending = approveStagedVersions({
        cwd: '/repo',
        registry: NPMJS,
        versions: [versions[1]!],
        getOtp: () => '1',
        onValidating,
        env: LOCAL,
        runner,
        waitMs: 1000,
        maxWaitMs: 2500,
      })
      await vi.advanceTimersByTimeAsync(1000)
      statuses[A] = 'staged'
      await vi.advanceTimersByTimeAsync(1000)
      expect(await pending).toEqual([
        expect.objectContaining({ status: 'approved' }),
      ])
      expect(calls.filter(call => call[1] === 'view')).toHaveLength(3)
      expect(onValidating).toHaveBeenCalledTimes(1)
      expect(onValidating).toHaveBeenCalledWith({ name: '@scope/core', version: '1.2.0' })

      statuses[A] = 'validating'
      const late = approveStagedVersions({
        cwd: '/repo',
        registry: NPMJS,
        versions: [versions[1]!],
        getOtp: () => '1',
        env: LOCAL,
        runner,
        waitMs: 1000,
        maxWaitMs: 2500,
      })
      await vi.advanceTimersByTimeAsync(5000)
      expect(await late).toEqual([
        expect.objectContaining({ status: 'skipped', reason: 'validating' }),
      ])
      vi.useRealTimers()
    })

    it('Then skips a version no longer staged, and gives the web page to a security-key account', async () => {
      const { runner } = fakeRunner({ [B]: 'staged' }, () => {
        throw npmError('npm error code EOTP', JSON.stringify({
          error: { code: 'EOTP', authUrl: 'https://www.npmjs.com/auth/cli/f807c3a4', doneUrl: 'https://registry.npmjs.org/-/v1/done?authId=f807c3a4' },
        }))
      })

      const results = await approveStagedVersions({
        cwd: '/repo',
        registry: NPMJS,
        versions,
        getOtp: () => undefined,
        env: LOCAL,
        runner,
      })

      expect(results).toEqual([
        {
          name: '@scope/core',
          version: '1.2.0',
          stageId: A,
          status: 'skipped',
          reason: 'not staged',
        },
        {
          name: '@scope/cli',
          version: '1.2.0',
          stageId: B,
          status: 'skipped',
          reason: 'dependency @scope/core not approved',
        },
      ])

      const alone = await approveStagedVersions({
        cwd: '/repo',
        registry: NPMJS,
        versions: [
          { ...versions[0]!, dependencies: [] },
        ],
        getOtp: () => '',
        env: LOCAL,
        runner,
      })
      expect(alone).toEqual([
        {
          name: '@scope/cli',
          version: '1.2.0',
          stageId: B,
          status: 'failed',
          reason: 'web-auth',
          url: 'https://www.npmjs.com/settings',
        },
      ])
    })
  })

  describe('When the state of one version is asked', () => {
    it('Then tells validating and staged from the staging area', async () => {
      const runner = vi.fn<NpmCommandRunner>().mockResolvedValueOnce({
        stdout: JSON.stringify([
          item({ status: 'validating' }),
        ]),
      }).mockResolvedValueOnce({
        stdout: JSON.stringify([
          item({ version: '1.1.0', id: B }),
        ]),
      })

      expect(await getStagedState({
        cwd: '/repo',
        registry: NPMJS,
        name: '@scope/core',
        version: '1.2.0',
        env: LOCAL,
        runner,
      })).toBe('validating')
      expect(await getStagedState({
        cwd: '/repo',
        registry: NPMJS,
        name: '@scope/core',
        version: '9.9.9',
        stageId: B,
        env: LOCAL,
        runner,
      })).toBe('staged')
    })

    it('Then tells installable, rejected or gone, and unknown from the packument', async () => {
      const empty = vi.fn<NpmCommandRunner>().mockResolvedValue({ stdout: '[]' })
      vi.mocked(isVersionPublished).mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(null).mockResolvedValueOnce(false)

      expect(await getStagedState({
        cwd: '/repo',
        registry: NPMJS,
        name: 'pkg',
        version: '1.0.0',
        env: LOCAL,
        runner: empty,
      })).toBe('installable')
      expect(await getStagedState({
        cwd: '/repo',
        registry: NPMJS,
        name: 'pkg',
        version: '1.0.0',
        env: LOCAL,
        runner: empty,
      })).toBe('rejected-or-gone')
      expect(await getStagedState({
        cwd: '/repo',
        registry: NPMJS,
        name: 'pkg',
        version: '1.0.0',
        env: LOCAL,
        runner: empty,
      })).toBe('unknown')
      // In a CI the staging area cannot be read: not published is not "gone"
      expect(await getStagedState({
        cwd: '/repo',
        registry: NPMJS,
        name: 'pkg',
        version: '1.0.0',
        env: { CI: 'true' },
        runner: empty,
      })).toBe('unknown')
      expect(isVersionPublished).toHaveBeenCalledWith(expect.objectContaining({
        packageManager: 'npm',
        version: '1.0.0',
        registryTarget: { registry: NPMJS },
      }))
    })
  })

  it('Then gives the web page of npmjs only', () => {
    expect(getStagedApprovalUrl({ registry: NPMJS })).toBe('https://www.npmjs.com/settings')
    expect(getStagedApprovalUrl({ registry: 'https://npm.pkg.github.com/' })).toBeUndefined()
  })

  describe('When the account validates with a security key (web 2FA)', () => {
    const webError = () => Object.assign(new Error('Command failed'), {
      stdout: JSON.stringify({
        error: { code: 'EOTP', authUrl: 'https://www.npmjs.com/auth/cli/0661', doneUrl: 'https://registry.npmjs.org/-/v1/done?authId=0661' },
      }),
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('Then reads the links of the error, never masked ones', () => {
      expect(getWebAuth(webError())).toEqual({ authUrl: 'https://www.npmjs.com/auth/cli/0661', doneUrl: 'https://registry.npmjs.org/-/v1/done?authId=0661' })
      expect(getWebAuth(new Error('"authUrl": "https://www.npmjs.com/auth/cli/***", "doneUrl": "x"'))).toBeUndefined()
      expect(getWebAuth(new Error('E404'))).toBeUndefined()
    })

    it('Then approves a batch with the web 2FA, without asking a code', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response('{"token":"9919257186804593"}', { status: 200 }))))
      const calls: string[][] = []
      const runner = vi.fn<NpmCommandRunner>().mockImplementation((args) => {
        calls.push(args)
        if (args[1] === 'view') {
          return Promise.resolve({
            stdout: JSON.stringify({
              id: args[2],
              packageName: 'pkg',
              version: '1.0.0',
              status: 'staged',
            }),
          })
        }
        if (!args.some(arg => arg.startsWith('--otp='))) {
          return Promise.reject(webError())
        }
        return Promise.resolve({ stdout: '' })
      })
      const onWebAuth = vi.fn()
      const getOtp = vi.fn()

      const results = await approveStagedVersions({
        cwd: '/repo',
        registry: NPMJS,
        versions: [
          { name: 'pkg', version: '1.0.0', stageId: A },
        ],
        getOtp,
        onWebAuth,
        env: LOCAL,
        runner,
      })

      expect(results).toEqual([
        expect.objectContaining({ status: 'approved' }),
      ])
      expect(getOtp).not.toHaveBeenCalled()
      expect(onWebAuth).toHaveBeenCalledWith({ url: 'https://www.npmjs.com/auth/cli/0661', purpose: 'approve' })
      expect(calls.filter(args => args[1] === 'approve').map(args => args.some(arg => arg.startsWith('--otp=')))).toEqual([false, true])
    })

    it('Then shows the page, waits for the validation, and runs the call again with the token npm gives once', async () => {
      // As observed on npmjs: 202 while pending, then 200 with the token
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(new Response('', { status: 202 }))
        .mockResolvedValueOnce(new Response('{"token":"9919257186804593"}', { status: 200 })))
      const runner = vi.fn<NpmCommandRunner>().mockRejectedValueOnce(webError()).mockResolvedValueOnce({ stdout: '' })
      const onWebAuth = vi.fn()

      await approveStagedVersion({
        cwd: '/repo',
        registry: NPMJS,
        stageId: A,
        env: LOCAL,
        runner,
        onWebAuth,
      })

      expect(onWebAuth).toHaveBeenCalledWith({ url: 'https://www.npmjs.com/auth/cli/0661', purpose: 'approve' })
      expect(runner.mock.calls[1]![0]).toEqual([
        'stage',
        'approve',
        A,
        '--json',
        '--otp=9919257186804593',
        '--registry',
        NPMJS,
      ])
    })

    it('Then shows the page again when npm asks again right after a validation', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response('{"token":"1"}', { status: 200 }))))
      const runner = vi.fn<NpmCommandRunner>()
        .mockRejectedValueOnce(webError())
        .mockRejectedValueOnce(webError())
        .mockResolvedValueOnce({ stdout: '' })
      const onWebAuth = vi.fn()

      await approveStagedVersion({
        cwd: '/repo',
        registry: NPMJS,
        stageId: A,
        env: LOCAL,
        runner,
        onWebAuth,
      })

      expect(onWebAuth).toHaveBeenCalledTimes(2)
      expect(runner).toHaveBeenCalledTimes(3)

      const always = vi.fn<NpmCommandRunner>().mockRejectedValue(webError())
      await expect(approveStagedVersion({
        cwd: '/repo',
        registry: NPMJS,
        stageId: A,
        env: LOCAL,
        runner: always,
        onWebAuth: vi.fn(),
      })).rejects.toThrow('Command failed')
      expect(always).toHaveBeenCalledTimes(4)
    })

    it('Then runs the call again without code when npm refuses the token of the page', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response('{"token":"1"}', { status: 200 }))))
      const runner = vi.fn<NpmCommandRunner>()
        .mockRejectedValueOnce(webError())
        .mockRejectedValueOnce(new Error('npm error code EOTP one-time password invalid'))
        .mockResolvedValueOnce({ stdout: '' })

      await approveStagedVersion({
        cwd: '/repo',
        registry: NPMJS,
        stageId: A,
        env: LOCAL,
        runner,
        onWebAuth: vi.fn(),
      })

      expect(runner.mock.calls.map(([args]) => args.some(arg => arg.startsWith('--otp=')))).toEqual([false, true, false])
    })

    it('Then gives up when the page expires, and gives the error without handler', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"message":"not found"}', { status: 404 })))
      expect(await waitForWebAuth({ doneUrl: 'https://registry.npmjs.org/-/v1/done?authId=0661', pollMs: 1 })).toBeUndefined()

      const runner = vi.fn<NpmCommandRunner>().mockRejectedValue(webError())
      await expect(rejectStagedVersion({
        cwd: '/repo',
        registry: NPMJS,
        stageId: A,
        env: LOCAL,
        runner,
        onWebAuth: vi.fn(),
      })).rejects.toThrow('Command failed')
      await expect(rejectStagedVersion({
        cwd: '/repo',
        registry: NPMJS,
        stageId: A,
        env: LOCAL,
        runner,
      })).rejects.toThrow('Command failed')
      expect(await waitForWebAuth({ doneUrl: 'x', timeoutMs: 0 })).toBeUndefined()
    })
  })
})
