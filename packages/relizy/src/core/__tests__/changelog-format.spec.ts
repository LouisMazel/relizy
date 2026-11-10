import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execPromise, logger } from '@maz-ui/node'
import { createMockConfig } from '../../../tests/mocks'
import { executeFormatCmd, findChangelogFormatter, resolveFormatCommand } from '../changelog-format'

let cwd: string

function createConfig({ formatCmd, devDependencies = {} }: { formatCmd?: string | false, devDependencies?: Record<string, string> } = {}) {
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'root', devDependencies }))

  const config = createMockConfig({
    bump: { type: 'patch' },
  })
  config.cwd = cwd
  config.publish = { ...config.publish, packageManager: 'pnpm' }
  config.changelog = { rootChangelog: true, includeCommitBody: false, formatCmd: formatCmd as string }

  return config
}

function changelogs(...paths: string[]): string[] {
  return paths.map(path => join(cwd, path))
}

beforeEach(() => {
  vi.clearAllMocks()
  cwd = mkdtempSync(join(tmpdir(), 'relizy-format-'))
  mkdirSync(join(cwd, 'packages/a'), { recursive: true })
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

describe('Given findChangelogFormatter function', () => {
  it('Then prefers a dedicated formatter to ESLint', () => {
    expect(findChangelogFormatter({ eslint: '^9.0.0', prettier: '^3.0.0' })).toBe('prettier')
    expect(findChangelogFormatter({ 'eslint': '^9.0.0', '@biomejs/biome': '^2.0.0' })).toBe('biome')
    expect(findChangelogFormatter({ eslint: '^9.0.0' })).toBe('eslint')
    expect(findChangelogFormatter({ typescript: '^5.0.0' })).toBeUndefined()
  })
})

describe('Given resolveFormatCommand function', () => {
  describe('When changelog.formatCmd is not set', () => {
    it('Then runs the formatter of the root package.json on the changelogs written', () => {
      const config = createConfig({
        devDependencies: { eslint: '^9.0.0' },
      })

      expect(resolveFormatCommand({
        config,
        files: changelogs('CHANGELOG.md', 'packages/a/CHANGELOG.md'),
      })).toEqual({
        command: 'pnpm exec eslint --fix --no-warn-ignored "CHANGELOG.md" "packages/a/CHANGELOG.md"',
        formatter: 'eslint',
      })
    })

    it('Then runs the binary with the package manager of the project', () => {
      const config = createConfig({
        devDependencies: { prettier: '^3.0.0' },
      })
      config.publish.packageManager = 'npm'

      expect(resolveFormatCommand({
        config,
        files: changelogs('CHANGELOG.md'),
      })?.command).toBe('npx prettier --write --ignore-unknown --no-error-on-unmatched-pattern "CHANGELOG.md"')
    })

    it('Then formats nothing without formatter or without changelog written', () => {
      expect(resolveFormatCommand({
        config: createConfig(),
        files: changelogs('CHANGELOG.md'),
      })).toBeUndefined()
      expect(resolveFormatCommand({
        config: createConfig({
          devDependencies: { eslint: '^9.0.0' },
        }),
        files: [],
      })).toBeUndefined()
    })
  })

  describe('When changelog.formatCmd is set', () => {
    it('Then replaces {{files}} by the changelogs written', () => {
      const config = createConfig({
        formatCmd: 'eslint --fix {{files}}',
        devDependencies: { prettier: '^3.0.0' },
      })

      expect(resolveFormatCommand({
        config,
        files: changelogs('CHANGELOG.md', 'packages/a/CHANGELOG.md'),
      })).toEqual({
        command: 'eslint --fix "CHANGELOG.md" "packages/a/CHANGELOG.md"',
      })
      expect(resolveFormatCommand({ config, files: [] })).toBeUndefined()
    })

    it('Then runs a command without {{files}} as is', () => {
      const config = createConfig({ formatCmd: 'pnpm lint:fix' })

      expect(resolveFormatCommand({ config, files: [] })).toEqual({ command: 'pnpm lint:fix' })
    })

    it('Then formats nothing with false', () => {
      const config = createConfig({
        formatCmd: false,
        devDependencies: { eslint: '^9.0.0' },
      })

      expect(resolveFormatCommand({
        config,
        files: changelogs('CHANGELOG.md'),
      })).toBeUndefined()
    })
  })
})

describe('Given executeFormatCmd function', () => {
  it('Then runs the command from the root', async () => {
    vi.mocked(execPromise).mockResolvedValue({ stdout: '', stderr: '' } as never)
    const config = createConfig({ formatCmd: 'prettier --write {{files}}' })

    await executeFormatCmd({
      config,
      dryRun: false,
      files: changelogs('CHANGELOG.md'),
    })

    expect(execPromise).toHaveBeenCalledWith('prettier --write "CHANGELOG.md"', {
      noStderr: true,
      noStdout: true,
      logLevel: config.logLevel,
      cwd,
    })
  })

  it('Then only logs the command in dry run', async () => {
    const config = createConfig({
      devDependencies: { eslint: '^9.0.0' },
    })

    await executeFormatCmd({
      config,
      dryRun: true,
      files: changelogs('CHANGELOG.md'),
    })

    expect(logger.log).toHaveBeenCalledWith('[dry-run] exec format command: ', 'pnpm exec eslint --fix --no-warn-ignored "CHANGELOG.md"')
    expect(execPromise).not.toHaveBeenCalled()
  })

  it('Then throws when the command of the config fails', async () => {
    vi.mocked(execPromise).mockRejectedValue(new Error('Command failed'))
    const config = createConfig({ formatCmd: 'invalid-command' })

    await expect(executeFormatCmd({ config, dryRun: false })).rejects.toThrow('Format command failed: Command failed')
  })

  it('Then only warns when the detected formatter fails', async () => {
    vi.mocked(execPromise).mockRejectedValue(new Error('1 problem'))
    const config = createConfig({
      devDependencies: { eslint: '^9.0.0' },
    })

    await executeFormatCmd({
      config,
      dryRun: false,
      files: changelogs('CHANGELOG.md'),
    })

    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/^The changelogs were not formatted, eslint failed: set changelog\.formatCmd .+\n1 problem$/))
  })

  it('Then runs nothing without command', async () => {
    await executeFormatCmd({
      config: createConfig(),
      dryRun: false,
      files: changelogs('CHANGELOG.md'),
    })

    expect(execPromise).not.toHaveBeenCalled()
  })
})
