import type { ReadPackage } from '../types'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execPromise } from '@maz-ui/node'
import { isPackageOnRegistry, isVersionAlreadyPublishedError, isVersionPublished } from '../npm-versions'

vi.mock('@maz-ui/node', async importActual => ({
  ...await importActual<typeof import('@maz-ui/node')>(),
  execPromise: vi.fn(),
}))

describe('Given isVersionAlreadyPublishedError function', () => {
  it.each([
    ['Nexus immutable asset (HTTP 400)', 'Repository does not allow updating assets: npm'],
    ['npm EPUBLISHCONFLICT', 'code EPUBLISHCONFLICT'],
    ['npm cannot publish over', 'You cannot publish over the previously published versions: 1.0.0.'],
    ['generic already exists', 'Version already exists'],
    ['Artifactory repository conflict', 'artifact already exists in the repository'],
    ['bare HTTP 409', 'request failed with status 409 conflict'],
  ])('Then returns true for %s', (_label, message) => {
    expect(isVersionAlreadyPublishedError(new Error(message))).toBe(true)
  })

  it('Then returns false for an unrelated publish failure', () => {
    expect(isVersionAlreadyPublishedError(new Error('ENEEDAUTH: authentication required'))).toBe(false)
  })

  it('Then returns false for non-error values', () => {
    expect(isVersionAlreadyPublishedError(null)).toBe(false)
    expect(isVersionAlreadyPublishedError(undefined)).toBe(false)
    expect(isVersionAlreadyPublishedError('does not allow updating assets')).toBe(false)
  })
})

describe('Given isVersionPublished function', () => {
  let cwd: string
  let pkg: Pick<ReadPackage, 'name' | 'path'>
  let fetchMock: ReturnType<typeof vi.fn>
  const registryTarget = { name: 'default', registry: 'https://registry.npmjs.org/', token: 'token' }

  function mockFetchResponse({ status = 200, ok = status < 400, body = {} }: { status?: number, ok?: boolean, body?: unknown } = {}) {
    fetchMock.mockResolvedValue({
      status,
      ok,
      json: () => Promise.resolve(body),
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    cwd = mkdtempSync(join(tmpdir(), 'relizy-npm-versions-'))
    pkg = {
      name: '@scope/pkg',
      path: '/packages/pkg',
    }
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    rmSync(cwd, { recursive: true, force: true })
  })

  describe('When using npm/pnpm (view strategy)', () => {
    it('Then returns true when the registry returns the version', async () => {
      vi.mocked(execPromise).mockResolvedValue({ stdout: '"1.0.1"', stderr: '' })

      const result = await isVersionPublished({
        pkg,
        version: '1.0.1',
        cwd,
        packageManager: 'pnpm',
        registryTarget,
      })

      expect(result).toBe(true)
      expect(execPromise).toHaveBeenCalledWith(
        expect.stringContaining('view @scope/pkg@1.0.1'),
        expect.any(Object),
      )
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('Then queries the target registry', async () => {
      vi.mocked(execPromise).mockResolvedValue({ stdout: '"1.0.1"', stderr: '' })

      await isVersionPublished({
        pkg,
        version: '1.0.1',
        cwd,
        packageManager: 'pnpm',
        registryTarget,
      })

      expect(execPromise).toHaveBeenCalledWith(
        expect.stringContaining('--registry https://registry.npmjs.org/'),
        expect.any(Object),
      )
    })

    it('Then returns false when the package exists but not that version (empty stdout)', async () => {
      vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' })

      const result = await isVersionPublished({
        pkg,
        version: '9.9.9',
        cwd,
        packageManager: 'npm',
        registryTarget,
      })

      expect(result).toBe(false)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('Then returns false when the package is not found (E404)', async () => {
      vi.mocked(execPromise).mockRejectedValue(new Error('npm error code E404 - Not found'))

      const result = await isVersionPublished({
        pkg,
        version: '1.0.1',
        cwd,
        packageManager: 'npm',
        registryTarget,
      })

      expect(result).toBe(false)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('Then falls back to a direct HTTP request when view is inconclusive', async () => {
      vi.mocked(execPromise).mockRejectedValue(new Error('ENEEDAUTH: authentication required'))
      mockFetchResponse({
        body: {
          versions: { '1.0.1': {} },
        },
      })

      const result = await isVersionPublished({
        pkg,
        version: '1.0.1',
        cwd,
        packageManager: 'npm',
        registryTarget,
      })

      expect(result).toBe(true)
      expect(fetchMock).toHaveBeenCalled()
    })
  })

  describe('When using yarn/bun (HTTP strategy)', () => {
    it('Then never shells out to a view command', async () => {
      mockFetchResponse({
        body: {
          versions: { '1.0.1': {} },
        },
      })

      await isVersionPublished({
        pkg,
        version: '1.0.1',
        cwd,
        packageManager: 'bun',
        registryTarget,
      })

      expect(execPromise).not.toHaveBeenCalled()
      expect(fetchMock).toHaveBeenCalled()
    })

    it('Then requests the packument with the scope slash encoded and a bearer token', async () => {
      mockFetchResponse({
        body: {
          versions: { '1.0.1': {} },
        },
      })

      await isVersionPublished({
        pkg,
        version: '1.0.1',
        cwd,
        packageManager: 'yarn',
        registryTarget,
      })

      expect(fetchMock).toHaveBeenCalledWith(
        'https://registry.npmjs.org/@scope%2Fpkg',
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: 'Bearer token' }),
        }),
      )
    })

    it('Then returns true when the packument lists the version', async () => {
      mockFetchResponse({
        body: {
          versions: { '1.0.0': {}, '1.0.1': {} },
        },
      })

      const result = await isVersionPublished({
        pkg,
        version: '1.0.1',
        cwd,
        packageManager: 'bun',
        registryTarget,
      })

      expect(result).toBe(true)
    })

    it('Then returns false when the packument does not list the version', async () => {
      mockFetchResponse({
        body: {
          versions: { '1.0.0': {} },
        },
      })

      const result = await isVersionPublished({
        pkg,
        version: '9.9.9',
        cwd,
        packageManager: 'bun',
        registryTarget,
      })

      expect(result).toBe(false)
    })

    it('Then returns false on a 404 (package absent)', async () => {
      mockFetchResponse({ status: 404, ok: false })

      const result = await isVersionPublished({
        pkg,
        version: '1.0.1',
        cwd,
        packageManager: 'bun',
        registryTarget,
      })

      expect(result).toBe(false)
    })

    it('Then returns null (inconclusive) on a non-OK response (e.g. 401)', async () => {
      mockFetchResponse({ status: 401, ok: false })

      const result = await isVersionPublished({
        pkg,
        version: '1.0.1',
        cwd,
        packageManager: 'bun',
        registryTarget,
      })

      expect(result).toBeNull()
    })

    it('Then returns null (inconclusive) on a network error', async () => {
      fetchMock.mockRejectedValue(new Error('network down'))

      const result = await isVersionPublished({
        pkg,
        version: '1.0.1',
        cwd,
        packageManager: 'bun',
        registryTarget,
      })

      expect(result).toBeNull()
    })

    it('Then omits the Authorization header when no token is configured', async () => {
      mockFetchResponse({
        body: { versions: {} },
      })

      await isVersionPublished({
        pkg,
        version: '1.0.1',
        cwd,
        packageManager: 'bun',
        registryTarget: { name: 'default', registry: 'https://registry.npmjs.org/' },
      })

      const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
      expect(headers.authorization).toBeUndefined()
    })

    it('Then falls back to the default token when the registry target has none', async () => {
      mockFetchResponse({
        body: { versions: {} },
      })

      await isVersionPublished({
        pkg,
        version: '1.0.1',
        cwd,
        packageManager: 'bun',
        registryTarget: { name: 'default', registry: 'https://registry.npmjs.org/' },
        token: 'default-token',
      })

      const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
      expect(headers.authorization).toBe('Bearer default-token')
    })

    it('Then guards the request with a timeout signal', async () => {
      mockFetchResponse({
        body: { versions: {} },
      })

      await isVersionPublished({
        pkg,
        version: '1.0.1',
        cwd,
        packageManager: 'bun',
        registryTarget,
      })

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      )
    })
  })
})

describe('Given isPackageOnRegistry function', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('Then asks the abbreviated packument of the package, the scope slash encoded', async () => {
    fetchMock.mockResolvedValue({ status: 200, ok: true })

    expect(await isPackageOnRegistry({ name: '@scope/pkg', registry: 'https://registry.npmjs.org' })).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://registry.npmjs.org/@scope%2Fpkg',
      expect.objectContaining({
        headers: { accept: 'application/vnd.npm.install-v1+json' },
      }),
    )
  })

  it('Then returns false for a 404, the package is not visible', async () => {
    fetchMock.mockResolvedValue({ status: 404, ok: false })

    expect(await isPackageOnRegistry({ name: 'pkg', registry: 'https://registry.npmjs.org/' })).toBe(false)
  })

  it('Then returns null when the registry does not answer clearly', async () => {
    const logger = {
      debug: vi.fn(),
    }

    fetchMock.mockResolvedValue({ status: 500, ok: false })
    expect(await isPackageOnRegistry({ name: 'pkg', registry: 'https://registry.npmjs.org/' })).toBeNull()

    fetchMock.mockRejectedValue(new Error('network down'))
    expect(await isPackageOnRegistry({ name: 'pkg', registry: 'https://registry.npmjs.org/', logger })).toBeNull()
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('network down'))
  })
})
