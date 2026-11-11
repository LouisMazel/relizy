import { logger } from '@maz-ui/node'
import { afterEach, vi } from 'vitest'
import { createMockCommit, createMockConfig, createMockPackageInfo, setInteractiveTerminal } from '../../../tests/mocks'
import { confirmBump, displayBump } from '../bump-confirm'
import { setBumpConfirmation } from '../bump-prompt'
import { RelizyCancelError } from '../errors'
import { askConfirm } from '../prompts'
import { getKnownReleaseVersions, isPrereleaseOnlyRelease } from '../version'

vi.mock('../prompts', async importActual => ({
  ...await importActual<typeof import('../prompts')>(),
  askConfirm: vi.fn(() => Promise.resolve(true)),
}))

describe('Given displayBump function', () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(logger, 'log').mockImplementation(() => undefined)
    vi.spyOn(logger, 'debug').mockImplementation(() => undefined)
    logSpy.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function logged(): string {
    return logSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('\n')
  }

  describe('When called with no packages', () => {
    it('Then displays nothing', () => {
      displayBump({
        versionMode: 'unified',
        config: createMockConfig({ cwd: '/tmp' }),
        packages: [],
        force: false,
        currentVersion: '1.0.0',
        newVersion: '1.1.0',
        dryRun: false,
      })

      expect(logSpy).not.toHaveBeenCalled()
    })
  })

  describe('When called in unified mode with private and public packages', () => {
    it('Then displays the root version and marks private packages', () => {
      displayBump({
        versionMode: 'unified',
        config: createMockConfig({ cwd: '/tmp' }),
        packages: [
          buildBumpPackage({ name: '@scope/public' }),
          buildBumpPackage({ name: '@scope/private', isPrivate: true }),
        ],
        force: false,
        currentVersion: '1.0.0',
        newVersion: '1.1.0',
        dryRun: false,
      })

      expect(logged()).toContain('Root package.json: 1.0.0 → 1.1.0')
      expect(logged()).toContain('@scope/private: 1.0.0 → 1.1.0 (1 commits)  🔒')
      expect(logged()).toContain('@scope/public')
    })
  })

  describe('When called in selective mode with force', () => {
    it('Then displays packages with force suffix and private marker', () => {
      displayBump({
        versionMode: 'selective',
        config: createMockConfig({ cwd: '/tmp' }),
        packages: [
          buildBumpPackage({ name: '@scope/public' }),
          buildBumpPackage({ name: '@scope/private', isPrivate: true }),
        ],
        force: true,
        currentVersion: '1.0.0',
        newVersion: '1.1.0',
        dryRun: false,
      })

      expect(logged()).toContain('(force)')
      expect(logged()).toContain('🔒')
    })
  })

  describe('When called in selective mode with mixed reasons', () => {
    it('Then groups packages by reason and keeps private markers', () => {
      displayBump({
        versionMode: 'selective',
        config: createMockConfig({ cwd: '/tmp' }),
        packages: [
          buildBumpPackage({ name: '@scope/a', reason: 'commits' }),
          buildBumpPackage({ name: '@scope/b', reason: 'dependency', isPrivate: true }),
          buildBumpPackage({ name: '@scope/c', reason: 'graduation' }),
        ],
        force: false,
        currentVersion: '1.0.0',
        newVersion: '1.1.0',
        dryRun: false,
      })

      expect(logged()).toContain('package(s) with commits')
      expect(logged()).toContain('dependent package(s)')
      expect(logged()).toContain('graduation package(s)')
      expect(logged()).toContain('🔒')
    })
  })

  describe('When called in independent mode with force', () => {
    it('Then displays each package with its own newVersion and private marker', () => {
      displayBump({
        versionMode: 'independent',
        config: createMockConfig({ cwd: '/tmp' }),
        packages: [
          buildBumpPackage({ name: '@scope/public' }),
          buildBumpPackage({ name: '@scope/private', isPrivate: true }),
        ],
        force: true,
        dryRun: false,
      })

      expect(logged()).toContain('(force)')
      expect(logged()).toContain('🔒')
      expect(logged()).not.toContain('Root package.json')
    })
  })

  describe('When called in independent mode with mixed reasons', () => {
    it('Then groups packages by reason and keeps private markers', () => {
      displayBump({
        versionMode: 'independent',
        config: createMockConfig({ cwd: '/tmp' }),
        packages: [
          buildBumpPackage({ name: '@scope/a', reason: 'commits' }),
          buildBumpPackage({ name: '@scope/b', reason: 'dependency', isPrivate: true }),
          buildBumpPackage({ name: '@scope/c', reason: 'graduation' }),
        ],
        force: false,
        dryRun: false,
      })

      expect(logged()).toContain('package(s) with commits')
      expect(logged()).toContain('dependent package(s)')
      expect(logged()).toContain('graduation package(s)')
      expect(logged()).toContain('🔒')
    })
  })
})

describe('Given confirmBump function', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let restoreTerminal: () => void

  beforeEach(() => {
    logSpy = vi.spyOn(logger, 'log').mockImplementation(() => undefined)
    vi.spyOn(logger, 'info').mockImplementation(() => undefined)
    vi.spyOn(logger, 'debug').mockImplementation(() => undefined)
    vi.mocked(askConfirm).mockClear()
    logSpy.mockClear()
    // An interactive terminal, unless a test says otherwise
    restoreTerminal = setInteractiveTerminal(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    restoreTerminal()
  })

  function logged(): string {
    return logSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('\n')
  }

  describe('When called with no packages', () => {
    it('Then returns without displaying nor prompting', async () => {
      const display = vi.fn()

      await confirmBump({ packages: [], display, dryRun: false })

      expect(display).not.toHaveBeenCalled()
      expect(askConfirm).not.toHaveBeenCalled()
    })
  })

  describe('When the terminal is not interactive (CI without --yes)', () => {
    it('Then fails with what to do instead of cancelling the run, before prompting', async () => {
      setInteractiveTerminal(false)

      await expect(confirmBump({
        packages: [
          { private: false },
        ],
        display: vi.fn(),
        dryRun: false,
      }))
        .rejects
        .toThrow('"Do you want to proceed with these version updates?" needs an answer, but the terminal is not interactive: run with --yes to confirm it in advance')
      expect(askConfirm).not.toHaveBeenCalled()
    })
  })

  describe('When called with the packages of every version group', () => {
    it('Then displays them, then asks once', async () => {
      const display = vi.fn(() => {
        expect(askConfirm).not.toHaveBeenCalled()
      })

      await confirmBump({
        packages: [
          { private: false },
          { private: false },
        ],
        display,
        dryRun: false,
      })

      expect(display).toHaveBeenCalledTimes(1)
      expect(askConfirm).toHaveBeenCalledTimes(1)
    })
  })

  describe('When a package is private', () => {
    it('Then displays the private notice', async () => {
      await confirmBump({
        packages: [
          { private: false },
          { private: true },
        ],
        display: vi.fn(),
        dryRun: false,
      })

      expect(logged()).toContain('Private packages are versioned')
    })
  })

  describe('When only public packages are provided', () => {
    it('Then does not display the private notice', async () => {
      await confirmBump({
        packages: [
          { private: false },
        ],
        display: vi.fn(),
        dryRun: false,
      })

      expect(logged()).not.toContain('Private packages are versioned')
    })
  })

  describe('When the bump is refused', () => {
    it('Then cancels the run', async () => {
      vi.mocked(askConfirm).mockResolvedValueOnce(false)

      await expect(confirmBump({
        packages: [
          { private: false },
        ],
        display: vi.fn(),
        dryRun: false,
      }))
        .rejects
        .toThrow(new RelizyCancelError('Bump refused'))
    })
  })

  describe('When the prompt is closed (Ctrl+C)', () => {
    it('Then cancels the run', async () => {
      // askConfirm throws its cancel message when the prompt is cancelled (see prompts.spec)
      vi.mocked(askConfirm).mockImplementationOnce(({ cancelMessage }) => Promise.reject(new RelizyCancelError(cancelMessage)))

      await expect(confirmBump({
        packages: [
          { private: false },
        ],
        display: vi.fn(),
        dryRun: false,
      }))
        .rejects
        .toThrow(new RelizyCancelError('Bump cancelled'))
    })
  })

  describe('When the output of the CLI asks the confirmation', () => {
    afterEach(() => {
      setBumpConfirmation(undefined)
    })

    it('Then neither displays nor prompts itself once confirmed', async () => {
      const confirmation = vi.fn(() => Promise.resolve(true))
      setBumpConfirmation(confirmation)
      const display = vi.fn()

      await confirmBump({
        packages: [
          { private: false },
        ],
        display,
        dryRun: false,
      })

      expect(confirmation).toHaveBeenCalledWith([
        { private: false },
      ])
      expect(display).not.toHaveBeenCalled()
      expect(askConfirm).not.toHaveBeenCalled()
    })

    it('Then cancels the run when refused', async () => {
      setBumpConfirmation(() => Promise.resolve(false))

      await expect(confirmBump({
        packages: [
          { private: false },
        ],
        display: vi.fn(),
        dryRun: false,
      }))
        .rejects
        .toThrow(new RelizyCancelError('Bump refused'))
      expect(askConfirm).not.toHaveBeenCalled()
    })

    it('Then prompts itself when the output does not handle it', async () => {
      setBumpConfirmation(() => Promise.resolve(undefined))

      await confirmBump({
        packages: [
          { private: false },
        ],
        display: vi.fn(),
        dryRun: false,
      })

      expect(askConfirm).toHaveBeenCalledTimes(1)
    })
  })
})

function buildBumpPackage(overrides: { name: string, isPrivate?: boolean, reason?: 'commits' | 'dependency' | 'graduation' }) {
  return createMockPackageInfo({
    name: overrides.name,
    version: '1.0.0',
    newVersion: '1.1.0',
    path: `/tmp/${overrides.name}`,
    private: overrides.isPrivate ?? false,
    commits: [
      createMockCommit('feat', 'a change'),
    ],
    dependencies: [],
    reason: overrides.reason ?? 'commits',
    fromTag: `${overrides.name}@1.0.0`,
  })
}

describe('Given isPrereleaseOnlyRelease function', () => {
  it('Then is true for a prerelease bump, or when every known version is a prerelease', () => {
    expect(isPrereleaseOnlyRelease(createMockConfig({
      bump: { type: 'preminor' },
    }))).toBe(true)
    expect(isPrereleaseOnlyRelease(createMockConfig({
      bump: { type: 'release' },
    }), ['2.0.0-beta.0', '1.3.0-rc.1'])).toBe(true)
  })

  it('Then is false when a stable version can be released', () => {
    expect(isPrereleaseOnlyRelease(createMockConfig({
      bump: { type: 'release' },
    }))).toBe(false)
    expect(isPrereleaseOnlyRelease(createMockConfig({
      bump: { type: 'patch' },
    }), ['2.0.0-beta.0', '1.3.0'])).toBe(false)
    expect(isPrereleaseOnlyRelease(createMockConfig({
      bump: { type: 'patch' },
    }), [])).toBe(false)
  })
})

describe('Given getKnownReleaseVersions function', () => {
  it('Then gives the versions of the bump result', () => {
    const config = createMockConfig({
      bump: { type: 'release' },
    })

    expect(getKnownReleaseVersions({
      config,
      bumpResult: {
        bumped: true,
        newVersion: '2.0.0-beta.0',
        bumpedPackages: [
          {
            ...createMockPackageInfo({ newVersion: '1.3.0' }),
            oldVersion: '1.2.0',
          },
        ],
      },
    })).toEqual(['2.0.0-beta.0', '1.3.0'])
  })

  it('Then gives nothing when several versions can be released without a bump result', () => {
    expect(getKnownReleaseVersions({
      config: createMockConfig({
        bump: { type: 'release' },
        monorepo: { versionMode: 'independent' },
      }),
    })).toBeUndefined()
  })
})
