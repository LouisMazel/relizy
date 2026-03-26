import { execPromise } from '@maz-ui/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockPackageInfo } from '../../../tests/mocks'
import { getLastPackageTag, getLastRepoTag } from '../tags'

vi.mock('@maz-ui/node', async (importActual) => {
  const actual = await importActual<typeof import('@maz-ui/node')>()

  return {
    ...actual,
    execPromise: vi.fn(),
  }
})

describe('Given tag lookup on Windows-compatible paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()

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
})
