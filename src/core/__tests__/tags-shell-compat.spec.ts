import { execPromise, logger } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockPackageInfo } from '../../../tests/mocks'
import { clearTagCache, getBootstrapTag, getLastPackageTag, getLastRepoTag, getLastTag } from '../tags'

vi.mock('@maz-ui/node', async (importActual) => {
  const actual = await importActual<typeof import('@maz-ui/node')>()

  return {
    ...actual,
    execPromise: vi.fn(),
    logger: {
      ...actual.logger,
      debug: vi.fn(),
      info: vi.fn(),
    },
  }
})

describe('Given tag lookup on Windows-compatible paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearTagCache()

    vi.mocked(execPromise).mockImplementation((command) => {
      if (command === 'git tag --sort=-creatordate') {
        return Promise.resolve({
          stdout: 'pkg-a@1.2.0\npkg-a@1.1.0\nv2.0.0-beta.0\nv1.0.0\nv0.9.0',
          stderr: '',
        })
      }

      return Promise.resolve({
        stdout: '',
        stderr: '',
      })
    })
  })

  it('uses plain git tag listing for repo tag lookup and filters in Node', async () => {
    const tag = await getLastRepoTag({
      pkg: createMockPackageInfo({ version: '1.0.0' }),
      onlyStable: true,
      cwd: '/repo',
    })

    expect(tag).toBe('v1.0.0')
    expect(execPromise).toHaveBeenCalledWith(
      'git tag --sort=-creatordate',
      expect.objectContaining({ cwd: '/repo' }),
    )
  })

  it('uses plain git tag listing for package tag lookup and filters in Node', async () => {
    const tag = await getLastPackageTag({
      pkg: createMockPackageInfo({ name: 'pkg-a', version: '1.2.0' }),
      onlyStable: false,
      cwd: '/repo',
    })

    expect(tag).toBe('pkg-a@1.2.0')
    expect(execPromise).toHaveBeenCalledWith(
      'git tag --sort=-creatordate',
      expect.objectContaining({ cwd: '/repo' }),
    )
  })

  it('returns the last repo-wide tag for legacy lookup without package metadata', async () => {
    const tag = await getLastRepoTag({
      cwd: '/repo',
    })

    expect(tag).toBe('v2.0.0-beta.0')
  })

  it('returns null for repo lookup when tag collection falls back to empty', async () => {
    vi.mocked(execPromise).mockRejectedValueOnce(new Error('git failed'))

    const tag = await getLastRepoTag({
      onlyStable: true,
      cwd: '/repo',
    })

    expect(tag).toBe('')
  })

  it('returns empty string for legacy last-tag lookup when only package tags exist', async () => {
    vi.mocked(execPromise).mockResolvedValueOnce({
      stdout: 'pkg-a@1.2.0\npkg-b@1.0.0',
      stderr: '',
    } as Awaited<ReturnType<typeof execPromise>>)

    const tag = await getLastTag({
      cwd: '/repo',
    })

    expect(tag).toBe('')
  })

  it('returns null when repo tag collection finds no compatible tag for the current version', async () => {
    vi.mocked(execPromise).mockResolvedValueOnce({
      stdout: 'v3.0.0\nv2.1.0-beta.0',
      stderr: '',
    } as Awaited<ReturnType<typeof execPromise>>)

    const tag = await getLastRepoTag({
      pkg: createMockPackageInfo({ version: '1.0.0' }),
      onlyStable: false,
      cwd: '/repo',
    })

    expect(tag).toBeNull()
  })

  it('returns null for package lookup when a scoped package has no matching stable tags', async () => {
    vi.mocked(execPromise).mockResolvedValueOnce({
      stdout: '@scope/pkg@1.2.0-beta.0\npkg-a@1.0.0',
      stderr: '',
    } as Awaited<ReturnType<typeof execPromise>>)

    const tag = await getLastPackageTag({
      pkg: createMockPackageInfo({ name: '@scope/pkg', version: undefined as any }),
      onlyStable: true,
      cwd: '/repo',
    })

    expect(tag).toBeNull()
  })

  it('uses the non-stable legacy package pattern when version metadata is unavailable', async () => {
    vi.mocked(execPromise).mockResolvedValueOnce({
      stdout: '@scope/pkg@1.2.0-beta.0\n@scope/pkg@1.1.0',
      stderr: '',
    } as Awaited<ReturnType<typeof execPromise>>)

    const tag = await getLastPackageTag({
      pkg: createMockPackageInfo({ name: '@scope/pkg', version: undefined as any }),
      onlyStable: false,
      cwd: '/repo',
    })

    expect(tag).toBe('@scope/pkg@1.2.0-beta.0')
  })

  it('returns null when package tag collection catches downstream errors', async () => {
    vi.mocked(logger.debug).mockImplementationOnce(() => {
      throw new Error('logger failure')
    })

    const tag = await getLastPackageTag({
      pkg: createMockPackageInfo({ name: 'pkg-a', version: '1.2.0' }),
      onlyStable: false,
      cwd: '/repo',
    })

    expect(tag).toBeNull()
  })

  it('throws when independent bootstrap tag is requested without package name', () => {
    expect(() => getBootstrapTag({
      versionMode: 'independent',
      tagTemplate: 'v{{newVersion}}',
    })).toThrow('Package name is required to build an independent bootstrap tag')
  })
})
