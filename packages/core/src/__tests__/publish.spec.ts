import process from 'node:process'
import { execPromise } from '@maz-ui/node'
import { getAuthCommand, getPublishCommand, getPublishTag, isOtpError, isPaymentRequiredError, publishToRegistry } from '../publish'
import { withRegistryNpmrc } from '../registry'

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

const registryTarget = { name: 'default', registry: 'https://registry.npmjs.org/', access: 'public' as const }

describe('Given getPublishTag function', () => {
  it('Then returns the given tag', () => {
    expect(getPublishTag('1.0.0', 'stable')).toBe('stable')
    expect(getPublishTag('1.0.0-beta.1', 'canary')).toBe('canary')
  })

  it('Then returns latest for a stable version and next for a prerelease', () => {
    expect(getPublishTag('1.0.0')).toBe('latest')
    expect(getPublishTag('1.0.0-beta.1')).toBe('next')
  })
})

describe('Given getAuthCommand function', () => {
  it('Then asks who the user is on the registry', () => {
    expect(getAuthCommand({ packageManager: 'npm', cwd: '/project', registryTarget })).toBe('npm whoami --registry https://registry.npmjs.org/')
  })

  it('Then gives the one-time password, the given one first', () => {
    expect(getAuthCommand({
      packageManager: 'pnpm',
      cwd: '/project',
      registryTarget: { ...registryTarget, otp: '111111' },
    })).toContain('--otp 111111')
    expect(getAuthCommand({
      packageManager: 'pnpm',
      cwd: '/project',
      otp: '222222',
      registryTarget: { ...registryTarget, otp: '111111' },
    })).toContain('--otp 222222')
  })
})

describe('Given getPublishCommand function', () => {
  const options = {
    tag: 'latest',
    registryTarget,
    dryRun: false,
    cwd: '/project',
  }

  it.each([
    ['npm', 'npm publish --tag latest --registry https://registry.npmjs.org/ --access public --yes'],
    ['pnpm', 'pnpm publish --tag latest --registry https://registry.npmjs.org/ --access public --no-git-checks'],
    ['yarn', 'yarn publish --tag latest --registry https://registry.npmjs.org/ --access public --non-interactive'],
    ['bun', 'bun publish --tag latest --registry https://registry.npmjs.org/ --access public'],
  ] as const)('Then builds the %s command', (packageManager, command) => {
    expect(getPublishCommand({ ...options, packageManager })).toBe(command)
  })

  it('Then adds the extra arguments, the one-time password and the dry run', () => {
    expect(getPublishCommand({
      ...options,
      packageManager: 'npm',
      otp: '123456',
      dryRun: true,
      extraArgs: ['--provenance'],
    }))
      .toBe('npm publish --tag latest --registry https://registry.npmjs.org/ --otp 123456 --access public --yes --provenance --dry-run')
  })

  it('Then publishes with yarn npm on Yarn Berry', async () => {
    const { isYarnBerry } = await import('../package-manager')
    vi.mocked(isYarnBerry).mockReturnValueOnce(true).mockReturnValueOnce(true)

    expect(getPublishCommand({ ...options, packageManager: 'yarn' })).toBe('yarn npm publish --tag latest --registry https://registry.npmjs.org/ --access public --non-interactive --no-git-checks')
  })
})

describe('Given the errors of a failed publish', () => {
  it('Then recognizes the ones asking for a one-time password', () => {
    expect(isOtpError(new Error('npm error code EOTP'))).toBe(true)
    expect(isOtpError(new Error('This operation requires a one-time password'))).toBe(true)
    expect(isOtpError(new Error('two-factor authentication required'))).toBe(true)
    expect(isOtpError(new Error('ENEEDAUTH'))).toBe(false)
    expect(isOtpError('otp')).toBe(false)
    expect(isOtpError(null)).toBe(false)
  })

  it('Then recognizes the refusal of a restricted publish', () => {
    expect(isPaymentRequiredError(new Error('npm error code E402'))).toBe(true)
    expect(isPaymentRequiredError(new Error('402 Payment Required'))).toBe(true)
    expect(isPaymentRequiredError(new Error('You must sign up for private packages'))).toBe(true)
    expect(isPaymentRequiredError(new Error('E404'))).toBe(false)
    expect(isPaymentRequiredError(undefined)).toBe(false)
  })
})

describe('Given publishToRegistry function', () => {
  const pkg = { name: 'pkg-a', path: '/project/packages/pkg-a' }
  const options = {
    pkg,
    cwd: '/project',
    packageManager: 'npm' as const,
    registryTarget,
    tag: 'latest',
    dryRun: false,
    packageNameAndVersion: 'pkg-a@1.0.1',
  }
  let chdirSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })
    chdirSpy = vi.spyOn(process, 'chdir').mockImplementation(() => {})
  })

  afterEach(() => {
    chdirSpy.mockRestore()
  })

  it('Then publishes from the directory of the package with the registry written to the .npmrc, then goes back to the project', async () => {
    const logger = {
      info: vi.fn(),
    }

    await publishToRegistry({ ...options, logger })

    expect(chdirSpy).toHaveBeenNthCalledWith(1, '/project/packages/pkg-a')
    expect(chdirSpy).toHaveBeenLastCalledWith('/project')
    expect(withRegistryNpmrc).toHaveBeenCalledWith(expect.objectContaining({
      cwd: '/project',
      registryTarget,
      packageName: 'pkg-a',
      packageManager: 'npm',
    }))
    expect(execPromise).toHaveBeenCalledWith(
      'npm publish --tag latest --registry https://registry.npmjs.org/ --access public --yes',
      expect.objectContaining({ cwd: '/project/packages/pkg-a', noStdout: true, noStderr: true }),
    )
    expect(logger.info).toHaveBeenCalledWith('Publishing pkg-a@1.0.1 with tag "latest"')
  })

  it('Then names the registry in the logs', async () => {
    const logger = {
      info: vi.fn(),
    }

    await publishToRegistry({ ...options, registryLabel: ' [github]', logger })

    expect(logger.info).toHaveBeenCalledWith('Publishing pkg-a@1.0.1 with tag "latest" [github]')
  })

  it('Then does not publish with yarn or bun in a dry run', async () => {
    const logger = {
      info: vi.fn(),
    }

    await publishToRegistry({
      ...options,
      packageManager: 'bun',
      dryRun: true,
      logger,
    })

    expect(execPromise).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith('[dry-run] Skipping actual publish for pkg-a@1.0.1')
  })

  it('Then goes back to the project when the publish fails', async () => {
    vi.mocked(execPromise).mockRejectedValue(new Error('boom'))

    await expect(publishToRegistry(options)).rejects.toThrow('boom')

    expect(chdirSpy).toHaveBeenLastCalledWith('/project')
  })
})
