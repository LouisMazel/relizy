import { ensurePushAccess as ensureCorePushAccess } from '@relizy/core'
import { createMockConfig } from '../../../tests/mocks'
import { ensurePushAccess } from '../ci'

// The setup file mocks the checks of @relizy/core on the repository, and this adapter: these tests run the adapter
vi.unmock('../ci')

describe('Given the push access of the release', () => {
  it('When it is checked with a config, Then checks the repository of the config with its GitLab token', async () => {
    const env = { CI: 'true' }

    await ensurePushAccess({
      config: createMockConfig({
        cwd: '/project',
        tokens: { gitlab: 'project-token' },
      }),
      env,
    })

    expect(ensureCorePushAccess).toHaveBeenCalledWith({
      cwd: '/project',
      gitlabToken: 'project-token',
      env,
      logger: expect.anything(),
    })
  })

  it('When no environment is given, Then uses the one of the process', async () => {
    await ensurePushAccess({
      config: createMockConfig({ cwd: '/project' }),
    })

    expect(ensureCorePushAccess).toHaveBeenLastCalledWith(expect.objectContaining({ env: process.env }))
  })
})
