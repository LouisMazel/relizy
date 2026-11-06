import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureCliOutput } from '../../../tests/cli-output'
import { anyHookContext, createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import { executeFormatCmd, executeHook, generateChangelog, getPackagesOrBumpedPackages, getRootPackage, loadRelizyConfig, readPackageJson, resolveTags, writeChangelogToFile } from '../../core'
import { changelog } from '../changelog'

vi.mock('../../core', async () => {
  const actual = await vi.importActual('../../core')
  return {
    ...actual,
    loadRelizyConfig: vi.fn(),
    executeHook: vi.fn(),
    executeFormatCmd: vi.fn(),
    getPackagesOrBumpedPackages: vi.fn(),
    generateChangelog: vi.fn(),
    writeChangelogToFile: vi.fn(),
    getRootPackage: vi.fn(),
    readPackageJson: vi.fn(),
    resolveTags: vi.fn(),
  }
})

describe('Given changelog command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadRelizyConfig).mockResolvedValue(createMockConfig({ bump: { type: 'patch' } }))
    vi.mocked(executeHook).mockResolvedValue(undefined)
    vi.mocked(executeFormatCmd).mockResolvedValue(undefined)
    vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([])
    vi.mocked(generateChangelog).mockResolvedValue('## v1.0.0\n\n- Feature')
    vi.mocked(readPackageJson).mockReturnValue({ name: 'test', version: '1.0.0', path: '/root', private: false })
    vi.mocked(resolveTags).mockResolvedValue({ from: 'v0.9.0', to: 'v1.0.0' })
    vi.mocked(getRootPackage).mockResolvedValue({
      name: 'test',
      version: '1.0.0',
      path: '/root',
      private: false,
      fromTag: 'v0.9.0',
      commits: [],
    })
  })

  describe('When generating changelog with default options', () => {
    it('Then loads config and executes hooks', async () => {
      await changelog({})

      expect(loadRelizyConfig).toHaveBeenCalled()
      expect(executeHook).toHaveBeenCalledWith('before:changelog', expect.any(Object), false, anyHookContext)
    })

    it('Then generates changelog for root package', async () => {
      await changelog({})

      expect(generateChangelog).toHaveBeenCalled()
      expect(writeChangelogToFile).toHaveBeenCalled()
    })

    it('Then executes success hook', async () => {
      await changelog({})

      expect(executeHook).toHaveBeenCalledWith('success:changelog', expect.any(Object), false, anyHookContext)
    })
  })

  describe('When the privatePackages option is provided', () => {
    it('Then forwards it to loadRelizyConfig overrides', async () => {
      await changelog({ privatePackages: 'release' })

      expect(loadRelizyConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          overrides: expect.objectContaining({
            monorepo: expect.objectContaining({ privatePackages: 'release' }),
          }),
        }),
      )
    })
  })

  describe('When includeCommitBody is given', () => {
    it('Then forwards it to the config', async () => {
      await changelog({ includeCommitBody: true })

      expect(loadRelizyConfig).toHaveBeenCalledWith(expect.objectContaining({
        overrides: expect.objectContaining({
          changelog: expect.objectContaining({ includeCommitBody: true }),
        }),
      }))
    })
  })

  describe('When using dry-run mode', () => {
    it('Then passes dryRun to hooks and functions', async () => {
      await changelog({ dryRun: true })

      expect(executeHook).toHaveBeenCalledWith('before:changelog', expect.any(Object), true, anyHookContext)
      expect(writeChangelogToFile).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true }),
      )
    })
  })

  describe('When format command is configured', () => {
    it('Then executes format command', async () => {
      await changelog({ formatCmd: 'prettier --write *.md' })

      expect(executeFormatCmd).toHaveBeenCalled()
    })
  })

  describe('When error occurs', () => {
    it('Then executes error hook', async () => {
      vi.mocked(generateChangelog).mockRejectedValue(new Error('Failed'))

      await expect(changelog({})).rejects.toThrow('Failed')

      expect(executeHook).toHaveBeenCalledWith('error:changelog', expect.any(Object), false, anyHookContext)
    })
  })

  describe('When in independent mode', () => {
    it('Then generates changelogs for all packages', async () => {
      const config = createMockConfig({ bump: { type: 'patch' } })
      config.monorepo = { versionMode: 'independent', packages: ['packages/*'] }
      config.changelog = { rootChangelog: true, formatCmd: '', includeCommitBody: false }

      vi.mocked(loadRelizyConfig).mockResolvedValue(config)
      vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([
        createMockPackageInfo({ name: 'pkg-a', version: '1.0.0', path: '/pkg-a', commits: [] }),
        createMockPackageInfo({ name: 'pkg-b', version: '2.0.0', path: '/pkg-b', commits: [] }),
      ])

      await changelog({})

      // Once per package: the root changelog gathers them, without running generate:changelog again
      expect(generateChangelog).toHaveBeenCalledTimes(2)
      expect(writeChangelogToFile).toHaveBeenCalledTimes(3)
    })
  })
})

describe('Given the output of changelog in CI', () => {
  let output: ReturnType<typeof captureCliOutput>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadRelizyConfig).mockResolvedValue(createMockConfig({ bump: { type: 'patch' }, monorepo: { versionMode: 'unified', packages: ['packages/*'] } }))
    vi.mocked(getPackagesOrBumpedPackages).mockResolvedValue([])
    vi.mocked(generateChangelog).mockResolvedValue('## v1.0.0\n\n- Feature')
    vi.mocked(readPackageJson).mockReturnValue({ name: 'test', version: '1.0.0', path: '/root', private: false })
    vi.mocked(resolveTags).mockResolvedValue({ from: 'v0.9.0', to: 'v1.0.0' })
    vi.mocked(getRootPackage).mockResolvedValue({ name: 'test', version: '1.0.0', path: '/root', private: false, fromTag: 'v0.9.0', commits: [] })
    output = captureCliOutput()
  })

  afterEach(() => {
    output.restore()
  })

  it('Then tells how many changelogs it wrote', async () => {
    await changelog({})

    expect(output.lines()).toEqual([
      'relizy changelog · ci',
      '▸ Writing the changelogs',
      expect.stringMatching(/^✔ 1 changelog written {2}\d+ms$/),
      expect.stringMatching(/^✔ Wrote 1 changelog {2}\d+ms$/),
    ])
  })

  it('Then shows the changelog it would write in dry-run', async () => {
    await changelog({ dryRun: true })

    const lines = output.lines()
    // The root changelog, as the ones of the packages
    expect(lines).toContain('▸ Preview: Root changelog of test')
    expect(lines).toContain('  v0.9.0...v1.0.0')
    expect(lines).toContain('  ## v1.0.0')
    expect(lines.at(-1)).toMatch(/^ DRY RUN {2}Previewed 1 changelog, nothing was written {2}\d+ms$/)
  })

  it('Then shows the error once', async () => {
    vi.mocked(generateChangelog).mockRejectedValue(new Error('git log failed'))

    await expect(changelog({})).rejects.toThrow('git log failed')

    expect(output.lines()).toEqual(expect.arrayContaining([
      expect.stringMatching(/^✖ Writing the changelogs failed {2}\d+ms$/),
      '✖ Changelog failed',
      '  git log failed',
    ]))
  })
})
