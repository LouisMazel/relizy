import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import process from 'node:process'
import { execPromise } from '@maz-ui/node'
import { assertPublishNpmVersion, getPublishRoute, getUploadNpmVersion, packAndUpload, parsePackOutput } from '../pack-upload'
import { isYarnBerry } from '../package-manager'
import { withRegistryNpmrc } from '../registry'

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}))

vi.mock('@maz-ui/node', async importActual => ({
  ...await importActual<typeof import('@maz-ui/node')>(),
  execPromise: vi.fn(),
}))

vi.mock('../registry', async importActual => ({
  ...await importActual<typeof import('../registry')>(),
  withRegistryNpmrc: vi.fn(({ fn }: { fn: () => Promise<unknown> }) => fn()),
}))

vi.mock('../package-manager', async importActual => ({
  ...await importActual<typeof import('../package-manager')>(),
  isYarnBerry: vi.fn(() => false),
}))

function mockVersions(versions: Record<string, string>) {
  vi.mocked(execSync).mockImplementation(((command: string) => {
    const tool = command.split(' ')[0]!
    if (!versions[tool]) {
      throw new Error(`${tool}: command not found`)
    }
    return `${versions[tool]}\n`
  }) as typeof execSync)
}

const registryTarget = { registry: 'https://registry.npmjs.org/', access: 'public' as const }

describe('Given getPublishRoute function', () => {
  beforeEach(() => {
    vi.mocked(isYarnBerry).mockReturnValue(false)
  })

  it('Then stages natively with npm and with pnpm 11.3 or later', () => {
    mockVersions({ pnpm: '11.3.0' })
    expect(getPublishRoute({
      packageManager: 'npm',
      cwd: '/p',
      staged: true,
      authMode: 'token',
    })).toBe('native')
    expect(getPublishRoute({
      packageManager: 'pnpm',
      cwd: '/p',
      staged: true,
      authMode: 'token',
    })).toBe('native')
  })

  it('Then stages through the upload with npm for older pnpm, yarn and bun', () => {
    mockVersions({ pnpm: '10.18.0' })
    expect(getPublishRoute({
      packageManager: 'pnpm',
      cwd: '/p',
      staged: true,
      authMode: 'token',
    })).toBe('pack-and-upload')
    mockVersions({})
    expect(getPublishRoute({
      packageManager: 'pnpm',
      cwd: '/p',
      staged: true,
      authMode: 'token',
    })).toBe('pack-and-upload')
    expect(getPublishRoute({
      packageManager: 'yarn',
      cwd: '/p',
      staged: true,
      authMode: 'npmrc',
    })).toBe('pack-and-upload')
    expect(getPublishRoute({
      packageManager: 'bun',
      cwd: '/p',
      staged: true,
      authMode: 'oidc',
    })).toBe('pack-and-upload')
  })

  it('Then uploads with npm the direct publishes of bun and yarn classic under trusted publishing only', () => {
    expect(getPublishRoute({
      packageManager: 'bun',
      cwd: '/p',
      staged: false,
      authMode: 'oidc',
    })).toBe('pack-and-upload')
    expect(getPublishRoute({
      packageManager: 'yarn',
      cwd: '/p',
      staged: false,
      authMode: 'oidc',
    })).toBe('pack-and-upload')
  })

  it('Then keeps the native route of every direct publish that works today', () => {
    for (const packageManager of ['npm', 'pnpm', 'yarn', 'bun'] as const) {
      expect(getPublishRoute({
        packageManager,
        cwd: '/p',
        staged: false,
        authMode: 'token',
      })).toBe('native')
      expect(getPublishRoute({
        packageManager,
        cwd: '/p',
        staged: false,
        authMode: 'npmrc',
      })).toBe('native')
    }
    expect(getPublishRoute({
      packageManager: 'npm',
      cwd: '/p',
      staged: false,
      authMode: 'oidc',
    })).toBe('native')
    expect(getPublishRoute({
      packageManager: 'pnpm',
      cwd: '/p',
      staged: false,
      authMode: 'oidc',
    })).toBe('native')
    vi.mocked(isYarnBerry).mockReturnValue(true)
    expect(getPublishRoute({
      packageManager: 'yarn',
      cwd: '/p',
      staged: false,
      authMode: 'oidc',
    })).toBe('native')
  })
})

describe('Given assertPublishNpmVersion function', () => {
  it('Then reads the npm on the PATH', () => {
    mockVersions({ npm: '11.15.0' })
    expect(getUploadNpmVersion('/p')).toBe('11.15.0')
    mockVersions({})
    expect(getUploadNpmVersion('/p')).toBeUndefined()
  })

  it('Then needs npm 11.15.0 to stage with npm or through the upload', () => {
    mockVersions({ npm: '11.14.1' })
    expect(() => assertPublishNpmVersion({
      packageManager: 'npm',
      cwd: '/p',
      staged: true,
      route: 'native',
    }))
      .toThrow(/Staging a version needs npm 11\.15\.0 or later, npm 11\.14\.1 is installed[\s\S]*npm install -g npm@latest/)
    expect(() => assertPublishNpmVersion({
      packageManager: 'bun',
      cwd: '/p',
      staged: true,
      route: 'pack-and-upload',
    })).toThrow(/11\.15\.0/)
    mockVersions({ npm: '12.2.3' })
    expect(() => assertPublishNpmVersion({
      packageManager: 'npm',
      cwd: '/p',
      staged: true,
      route: 'native',
    })).not.toThrow()
  })

  it('Then needs npm 11.5.1 to upload under trusted publishing', () => {
    mockVersions({ npm: '10.9.0' })
    expect(() => assertPublishNpmVersion({
      packageManager: 'bun',
      cwd: '/p',
      staged: false,
      route: 'pack-and-upload',
    })).toThrow(/needs npm 11\.5\.1/)
    mockVersions({ npm: '11.5.1' })
    expect(() => assertPublishNpmVersion({
      packageManager: 'bun',
      cwd: '/p',
      staged: false,
      route: 'pack-and-upload',
    })).not.toThrow()
  })

  it('Then checks nothing when pnpm stages by itself, for a native direct publish, or without a readable npm', () => {
    mockVersions({ npm: '10.0.0' })
    expect(() => assertPublishNpmVersion({
      packageManager: 'pnpm',
      cwd: '/p',
      staged: true,
      route: 'native',
    })).not.toThrow()
    expect(() => assertPublishNpmVersion({
      packageManager: 'npm',
      cwd: '/p',
      staged: false,
      route: 'native',
    })).not.toThrow()
    mockVersions({})
    expect(() => assertPublishNpmVersion({
      packageManager: 'npm',
      cwd: '/p',
      staged: true,
      route: 'native',
    })).not.toThrow()
  })
})

describe('Given parsePackOutput function', () => {
  it('Then reads the tarball of each package manager', () => {
    expect(parsePackOutput('{"name":"@s/a","filename":"/cache/d/s-a-1.0.0.tgz","manifest":{}}', '/cache/d')).toBe('/cache/d/s-a-1.0.0.tgz')
    expect(parsePackOutput('[{"id":"@s/a@1.0.0","filename":"s-a-1.0.0.tgz"}]', '/cache/d')).toBe('/cache/d/s-a-1.0.0.tgz')
    expect(parsePackOutput('{"base":"/p"}\n{"location":"package.json"}\n{"output":"/cache/d/package.tgz"}\n', '/cache/d')).toBe('/cache/d/package.tgz')
    expect(parsePackOutput('yarn pack v1.22.22\nsuccess Wrote tarball to "/cache/d/package.tgz".\nDone in 0.05s.', '/cache/d')).toBe('/cache/d/package.tgz')
    expect(parsePackOutput('/cache/d/s-a-1.0.0.tgz\n', '/cache/d')).toBe('/cache/d/s-a-1.0.0.tgz')
  })

  it('Then reads the JSON after the lines printed by a prepack script', () => {
    expect(parsePackOutput('> pkg@1.0.0 prepack\n> tsc\n{\n  "filename": "/cache/d/a-1.0.0.tgz"\n}\n', '/cache/d')).toBe('/cache/d/a-1.0.0.tgz')
  })

  it('Then keeps a Windows path and gives nothing without a tarball', () => {
    expect(parsePackOutput('C:\\Cache\\d\\a-1.0.0.tgz', 'C:\\Cache\\d')).toMatch(/a-1\.0\.0\.tgz$/)
    expect(parsePackOutput('nothing here', '/cache/d')).toBeUndefined()
    expect(parsePackOutput('{"filename":"a.txt"}', '/cache/d')).toBeUndefined()
  })
})

describe('Given packAndUpload function', () => {
  const pkg = { name: '@scope/pkg', path: '/project/packages/pkg' }
  const options = {
    pkg,
    cwd: '/project',
    registryTarget,
    tag: 'latest',
    dryRun: false,
    packageNameAndVersion: '@scope/pkg@1.0.0',
  }
  let chdirSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isYarnBerry).mockReturnValue(false)
    chdirSpy = vi.spyOn(process, 'chdir')
  })

  afterEach(() => {
    chdirSpy.mockRestore()
  })

  function mockPack(output: (command: string) => string) {
    let destination = ''
    vi.mocked(execPromise).mockImplementation((async (command: string) => {
      await Promise.resolve()
      if (command.includes(' pack ')) {
        destination = /'([^']+)'/.exec(command)![1]!.replace(/\/package\.tgz$/, '')
        return {
          stdout: output(destination),
          stderr: '',
        }
      }
      return { stdout: `+ @scope/pkg@1.0.0 (staged with id 2f1c7b8e-1d2a-4c5b-9e8f-0a1b2c3d4e5f)`, stderr: '' }
    }) as typeof execPromise)
    return () => destination
  }

  it('Then packs with bun in the package and stages the tarball with npm from the root', async () => {
    const destination = mockPack(dir => `${dir}/scope-pkg-1.0.0.tgz\n`)

    const result = await packAndUpload({ ...options, packageManager: 'bun', staged: true })

    const [pack, upload] = vi.mocked(execPromise).mock.calls
    expect(pack![0]).toMatch(/^bun pm pack --destination '.+relizy-pack-.+' --quiet$/)
    expect(pack![1]).toEqual(expect.objectContaining({ cwd: '/project/packages/pkg', noStdout: true }))
    expect(upload![0]).toBe(`npm stage publish '${destination()}/scope-pkg-1.0.0.tgz' --tag latest --registry https://registry.npmjs.org/ --access public --json`)
    expect(upload![1]).toEqual(expect.objectContaining({ cwd: '/project' }))
    expect(withRegistryNpmrc).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/project', packageName: '@scope/pkg', packageManager: 'npm' }))
    expect(result.stdout).toContain('staged with id')
    expect(chdirSpy).not.toHaveBeenCalled()
    expect(existsSync(destination())).toBe(false)
  })

  it('Then packs with each package manager', async () => {
    mockPack(dir => JSON.stringify({ filename: `${dir}/a.tgz` }))
    await packAndUpload({ ...options, packageManager: 'pnpm', staged: true })
    expect(vi.mocked(execPromise).mock.calls[0]![0]).toMatch(/^pnpm pack --pack-destination '.+' --json$/)

    vi.clearAllMocks()
    mockPack(dir => `success Wrote tarball to "${dir}/package.tgz".`)
    await packAndUpload({ ...options, packageManager: 'yarn', staged: true })
    expect(vi.mocked(execPromise).mock.calls[0]![0]).toMatch(/^yarn pack --filename '.+\/package\.tgz'$/)

    vi.clearAllMocks()
    vi.mocked(isYarnBerry).mockReturnValue(true)
    mockPack(dir => `{"output":"${dir}/package.tgz"}`)
    await packAndUpload({ ...options, packageManager: 'yarn', staged: true })
    expect(vi.mocked(execPromise).mock.calls[0]![0]).toMatch(/^yarn pack --out '.+\/package\.tgz' --json$/)
  })

  it('Then publishes the tarball directly without stage, with the one-time password, the arguments and the dry run', async () => {
    const destination = mockPack(dir => `${dir}/a.tgz`)

    await packAndUpload({
      ...options,
      packageManager: 'bun',
      staged: false,
      otp: '123456',
      extraArgs: ['--provenance'],
      dryRun: true,
    })

    expect(vi.mocked(execPromise).mock.calls[1]![0]).toBe(`npm publish '${destination()}/a.tgz' --tag latest --registry https://registry.npmjs.org/ --otp 123456 --access public --yes --json --provenance --dry-run`)
  })

  it('Then removes the temporary directory when the upload fails, and when the pack names no tarball', async () => {
    let destination = ''
    vi.mocked(execPromise).mockImplementation(((command: string) => {
      if (command.includes(' pack ')) {
        destination = /'([^']+)'/.exec(command)![1]!
        return Promise.resolve({ stdout: `${destination}/a.tgz`, stderr: '' })
      }
      return Promise.reject(new Error('E_STAGE_REQUIRED'))
    }) as typeof execPromise)

    await expect(packAndUpload({ ...options, packageManager: 'bun', staged: false })).rejects.toThrow('E_STAGE_REQUIRED')
    expect(existsSync(destination)).toBe(false)

    vi.mocked(execPromise).mockResolvedValue({ stdout: 'nothing', stderr: '' })
    await expect(packAndUpload({ ...options, packageManager: 'bun', staged: true })).rejects.toThrow('bun packed @scope/pkg@1.0.0 but its output names no tarball')
  })

  it('Then removes the temporary directory when the process is stopped, and re-raises the signal once', async () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    let destination = ''
    vi.mocked(execPromise).mockImplementation(((command: string) => {
      destination = /'([^']+)'/.exec(command)![1]!
      process.emit('SIGTERM', 'SIGTERM')
      return Promise.resolve({ stdout: `${destination}/a.tgz`, stderr: '' })
    }) as typeof execPromise)
    const listeners = () => ['exit', 'SIGINT', 'SIGTERM', 'SIGHUP'].map(event => process.listenerCount(event))
    const before = listeners()

    await packAndUpload({ ...options, packageManager: 'bun', staged: true }).catch(() => {})

    expect(existsSync(destination)).toBe(false)
    expect(kill).toHaveBeenCalledTimes(1)
    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM')
    expect(listeners()).toEqual(before)
    kill.mockRestore()
  })
})
