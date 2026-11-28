import { previewRelease as previewNextRelease } from '../../release-preview'
import { previewRelease } from '../tools/preview-release'

vi.mock('../../release-preview', async importActual => ({
  ...await importActual<typeof import('../../release-preview')>(),
  previewRelease: vi.fn(),
}))

const context = { cwd: '/repo', version: '2.5.0' } as any

function pkg(name: string, staged: boolean) {
  return {
    name,
    path: name,
    private: false,
    oldVersion: '1.0.0',
    newVersion: '1.1.0',
    bump: 'minor',
    reason: 'commits',
    commits: [],
    publish: { distTag: 'latest', staged },
  }
}

function preview(packages: ReturnType<typeof pkg>[]) {
  return {
    released: true,
    tags: ['v1.1.0'],
    sets: [
      {
        title: 'p',
        versionMode: 'independent',
        released: true,
        commits: [],
        packages,
        notReleased: [],
      },
    ],
    steps: [
      { name: 'publish', label: 'Publish', enabled: true },
      { name: 'approve', label: 'Approve', enabled: true },
    ],
  } as any
}

describe('Given preview_release of a project that stages', () => {
  it('Then tells which versions are staged and which are published directly, and the approval', async () => {
    vi.mocked(previewNextRelease).mockResolvedValueOnce(preview([
      pkg('a', true),
      pkg('b', false),
    ]))
    const mixed = await previewRelease(context, {})

    expect(mixed).toContain('Staged, awaiting approval: `a@1.1.0` (latest)')
    expect(mixed).toContain('Published directly: `b@1.1.0` (latest)')
    expect(mixed).toContain('publish to npm and stage the versions to approve, approve the staged versions with one 2FA')

    vi.mocked(previewNextRelease).mockResolvedValueOnce(preview([
      pkg('a', true),
    ]))
    expect(await previewRelease(context, {})).toContain('stage on npm (not installable until approved)')
  })
})
