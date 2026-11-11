import { logger } from '@maz-ui/node'
import { isVersionPublished as coreIsVersionPublished } from '@relizy/core'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import { isVersionPublished } from '../npm-versions'

vi.mock('@relizy/core', async importActual => ({
  ...await importActual<typeof import('@relizy/core')>(),
  isVersionPublished: vi.fn(),
}))

describe('Given isVersionPublished function', () => {
  it('Then asks the registry with the token, the timeout, the log level and the root of the config', async () => {
    const config = createMockConfig({
      cwd: '/project',
      logLevel: 'debug',
      tokens: { registry: 'registry-token' },
      publish: { safetyCheckTimeout: 5000 },
    })
    const pkg = createMockPackageInfo({ name: '@scope/pkg' })
    const registryTarget = { name: 'default', registry: 'https://registry.npmjs.org/' }
    vi.mocked(coreIsVersionPublished).mockResolvedValue(true)

    expect(await isVersionPublished({
      pkg,
      version: '1.0.1',
      config,
      packageManager: 'pnpm',
      registryTarget,
    })).toBe(true)
    expect(coreIsVersionPublished).toHaveBeenCalledWith({
      pkg,
      version: '1.0.1',
      cwd: '/project',
      packageManager: 'pnpm',
      registryTarget,
      token: 'registry-token',
      timeoutMs: 5000,
      logLevel: 'debug',
      logger,
    })
  })

  it('Then returns null when the registry cannot be queried', async () => {
    vi.mocked(coreIsVersionPublished).mockResolvedValue(null)

    expect(await isVersionPublished({
      pkg: createMockPackageInfo(),
      version: '1.0.1',
      config: createMockConfig({ cwd: '/project' }),
      packageManager: 'npm',
      registryTarget: { registry: 'https://registry.npmjs.org/' },
    })).toBeNull()
  })
})
