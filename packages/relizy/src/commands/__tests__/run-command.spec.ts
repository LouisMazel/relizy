import { logger } from '@maz-ui/node'
import { prepareCiRepository } from '@relizy/core'
import { createMockConfig } from '../../../tests/mocks'
import { executeHook, RelizyCancelError } from '../../core'
import { runCommand } from '../run-command'

vi.mock('../../core', async importActual => ({
  ...await importActual<typeof import('../../core')>(),
  executeHook: vi.fn(),
}))

describe('Given runCommand', () => {
  const config = createMockConfig({})
  const loadConfig = () => Promise.resolve(config)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Then prepares the CI clone after the check, and gives the run its context', async () => {
    const check = vi.fn()
    const run = vi.fn().mockResolvedValue('done')

    await expect(runCommand({
      name: 'bump',
      label: 'Bump',
      options: { dryRun: true },
      loadConfig,
      check,
      run,
    })).resolves.toBe('done')

    expect(vi.mocked(check).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(prepareCiRepository).mock.invocationCallOrder[0]!)
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ config, dryRun: true, hookContext: undefined }))
  })

  it('Then logs the error, runs its error hook and rethrows it', async () => {
    const error = vi.spyOn(logger, 'error')

    await expect(runCommand({
      name: 'bump',
      label: 'Bump',
      errorMessage: 'Bump failed!',
      hook: 'bump',
      options: {},
      loadConfig,
      run: () => Promise.reject(new Error('boom')),
    })).rejects.toThrow('boom')

    expect(error).toHaveBeenCalledWith('Bump failed!\n\n', new Error('boom'))
    expect(executeHook).toHaveBeenCalledWith('error:bump', config, false, undefined)
  })

  it('Then turns the error into the result with recover', async () => {
    const result = await runCommand({
      name: 'social',
      label: 'Social media',
      hook: 'social',
      options: {},
      loadConfig,
      recover: error => (error as Error).message,
      run: () => Promise.reject(new Error('boom')),
    })

    expect(result).toBe('boom')
    expect(executeHook).toHaveBeenCalledWith('error:social', config, false, undefined)
  })

  it('Then rethrows a cancelled prompt without the error hook nor recover', async () => {
    const recover = vi.fn()

    await expect(runCommand({
      name: 'bump',
      label: 'Bump',
      hook: 'bump',
      options: {},
      loadConfig,
      recover,
      run: () => Promise.reject(new RelizyCancelError('refused')),
    })).rejects.toThrow(RelizyCancelError)

    expect(executeHook).not.toHaveBeenCalled()
    expect(recover).not.toHaveBeenCalled()
  })

  it('Then neither logs the error nor runs a hook without errorMessage nor hook', async () => {
    const error = vi.spyOn(logger, 'error')

    await expect(runCommand({
      name: 'pr-comment',
      label: 'PR comment',
      options: {},
      loadConfig,
      run: () => Promise.reject(new Error('boom')),
    })).rejects.toThrow('boom')

    expect(error).not.toHaveBeenCalled()
    expect(executeHook).not.toHaveBeenCalled()
  })

  it('Then does not log the error of a command run by release (given its config)', async () => {
    const error = vi.spyOn(logger, 'error')

    await expect(runCommand({
      name: 'bump',
      label: 'Bump',
      errorMessage: 'Bump failed!',
      options: { config },
      loadConfig,
      run: () => Promise.reject(new Error('boom')),
    })).rejects.toThrow('boom')

    expect(error).not.toHaveBeenCalled()
  })
})
