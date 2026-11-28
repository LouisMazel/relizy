import { InteractiveAuthRequiredError, listStagedVersions } from '@relizy/core'
import { createMockConfig } from '../../../../tests/mocks'
import { readPackages } from '../../repo'
import { loadProjectConfig } from '../runtime'
import { listStaged } from '../tools/list-staged-versions'

vi.mock('@relizy/core', async importActual => ({
  ...await importActual<typeof import('@relizy/core')>(),
  listStagedVersions: vi.fn(),
}))
vi.mock('../runtime', async importActual => ({
  ...await importActual<typeof import('../runtime')>(),
  loadProjectConfig: vi.fn(),
}))
vi.mock('../../repo', async importActual => ({
  ...await importActual<typeof import('../../repo')>(),
  readPackages: vi.fn(),
}))

const context = { cwd: '/repo', version: '2.5.0' } as any

describe('Given list_staged_versions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadProjectConfig).mockResolvedValue(createMockConfig({
      bump: { type: 'patch' },
      publish: { registry: 'https://registry.npmjs.org/', args: [] },
    }))
    vi.mocked(readPackages).mockReturnValue([
      {
        name: '@s/core',
        version: '1.0.0',
        private: false,
        path: '/repo/core',
      },
      {
        name: 'app',
        version: '1.0.0',
        private: true,
        path: '/repo/app',
      },
    ] as any)
  })

  it('Then lists the staged versions of the public packages, never to be called out', async () => {
    vi.mocked(listStagedVersions).mockResolvedValue([
      {
        stageId: 'a1',
        name: '@s/core',
        version: '1.1.0',
        tag: 'latest',
        status: 'validating',
        createdAt: '2026-11-28',
        actor: 'maz',
      },
    ])

    const text = await listStaged(context, {})

    expect(listStagedVersions).toHaveBeenCalledWith(expect.objectContaining({
      registry: 'https://registry.npmjs.org/',
      packageNames: ['@s/core'],
    }))
    expect(text).toContain('| `@s/core` | 1.1.0 | latest | validating | 2026-11-28 by maz | `a1` |')
    expect(text).toContain('Never say they are out')
    expect(text).toContain('Never run it yourself')
  })

  it('Then says there is none, and gives "not available" as a result in a CI or without login', async () => {
    vi.mocked(listStagedVersions).mockResolvedValueOnce([])
    expect(await listStaged(context, {})).toContain('No version of the public packages of the project awaits approval')

    vi.mocked(listStagedVersions).mockRejectedValueOnce(new InteractiveAuthRequiredError('no'))
    expect(await listStaged(context, {})).toContain('Not available: this runs in a CI or under trusted publishing')

    vi.mocked(listStagedVersions).mockRejectedValueOnce(new Error('npm error code ENEEDAUTH'))
    expect(await listStaged(context, {})).toContain('Not available: npm could not list them (npm error code ENEEDAUTH)')
  })
})
