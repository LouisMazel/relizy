import type { GitRepository } from '../../../../../tests/git-repository'
import { createGitRepository } from '../../../../../tests/git-repository'
import { previewChangelog, previewRelease, UnreleasedPackageError } from '../release-preview'

vi.mock('@maz-ui/node', importActual => importActual())

/**
 * A monorepo with a commit to release. When `warns`, a package matched by two
 * version groups: relizy warns it gives it to the group listing its exact path
 */
function createMonorepo({ name, warns }: { name: string, warns: boolean }): GitRepository {
  const repository = createGitRepository(`relizy-preview-${name}-`)
  repository.writeJson('.', { name, version: '1.0.0', private: true })
  repository.writeJson('packages/lib', { name: `${name}-lib`, version: '1.0.0' })
  repository.writeJson('packages/extra', { name: `${name}-extra`, version: '1.0.0' })
  const monorepo = warns
    ? `{ groups: [{ name: 'main', versionMode: 'selective', packages: ['packages/*'] }, { name: 'extra', versionMode: 'independent', packages: ['packages/extra'] }] }`
    : `{ versionMode: 'selective', packages: ['packages/*'] }`
  repository.write('relizy.config.mjs', `export default { logLevel: 'default', monorepo: ${monorepo} }\n`)
  repository.commit('chore: init')
  repository.git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0')
  repository.commit('feat(lib): a new option', { 'packages/lib/index.js': 'feat' })

  return repository
}

describe('Given an application previewing two projects at the same time', () => {
  let warning: GitRepository
  let quiet: GitRepository

  beforeEach(() => {
    warning = createMonorepo({ name: 'warning', warns: true })
    quiet = createMonorepo({ name: 'quiet', warns: false })
  })

  afterEach(() => {
    warning.remove()
    quiet.remove()
  })

  describe('When both previews run together', () => {
    it('Then each one gets its own warnings, none is printed, and the level of the logger stays', async () => {
      const { logger } = await import('@maz-ui/node')
      logger.setLevel('error')
      const printed = vi.spyOn(process.stderr, 'write')
      const stdout = vi.spyOn(process.stdout, 'write')

      try {
        const [first, second] = await Promise.all([
          previewRelease({ cwd: warning.cwd }),
          previewRelease({ cwd: quiet.cwd }),
        ])

        expect(first.warnings).toEqual(['Package "packages/extra" is matched by several version groups (main, extra): assigned to "extra", which lists its exact path'])
        expect(second.warnings).toEqual([])
        expect(first.versionMode).toBe('groups')
        expect(second.sets[0]!.newVersion).toBe('1.1.0')
        expect(logger.getLevel()).toBe(0)
        expect([
          ...printed.mock.calls,
          ...stdout.mock.calls,
        ].map(([chunk]) => String(chunk)).join('')).not.toContain('matched by several version groups')
      }
      finally {
        printed.mockRestore()
        stdout.mockRestore()
        logger.setLevel('default')
      }
    })
  })

  describe('When the overrides ask for a log level', () => {
    it('Then the preview follows it', async () => {
      const preview = await previewRelease({
        cwd: warning.cwd,
        overrides: { logLevel: 'silent' },
      })

      expect(preview.warnings).toEqual([])
    })
  })

  describe('When previewing a commit', () => {
    it('Then gives its full hash with its short one', async () => {
      const preview = await previewRelease({ cwd: quiet.cwd })
      const [commit] = preview.sets[0]!.packages.find(pkg => pkg.name === 'quiet-lib')!.commits

      expect(commit!.hash).toBe(quiet.git('rev-parse', 'HEAD'))
      expect(commit!.hash!.startsWith(commit!.shortHash)).toBe(true)
    })
  })

  describe('When the changelog of a package the release does not release is asked', () => {
    it('Then tells the released ones', async () => {
      const error = await previewChangelog({ cwd: quiet.cwd, package: 'nope' }).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(UnreleasedPackageError)
      expect((error as Error).message).toBe('"nope" is not released by this release. Released: quiet, quiet-lib (and root)')
    })
  })
})
