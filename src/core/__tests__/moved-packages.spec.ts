import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runGitSync } from '../git-exec'
import { getDetectedPackageMoves, getPackageJsonHistory, getPreviousPackagePaths } from '../moved-packages'

vi.mock('../git-exec', async importActual => ({
  ...(await importActual<typeof import('../git-exec')>()),
  runGitSync: vi.fn(),
}))

function commitWithLines(...lines: string[]): { body: string } {
  return { body: `Move the package\n\n${lines.join('\n')}\n` }
}

function rename(from: string, to: string, score = 100): string {
  return `R${score}\t${from}\t${to}`
}

let cwd: string

beforeEach(() => {
  vi.clearAllMocks()
  cwd = mkdtempSync(join(tmpdir(), 'relizy-moved-packages-'))
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

describe('Given getDetectedPackageMoves', () => {
  describe('When a commit renames the package.json of a package', () => {
    it('Then it returns the move of its directory', () => {
      const commits = [commitWithLines(
        rename('packages/components/package.json', 'packages/ui/package.json'),
        rename('packages/components/src/index.ts', 'packages/ui/src/index.ts'),
      )]

      expect(getDetectedPackageMoves(commits, cwd)).toEqual([{ from: 'packages/components', to: 'packages/ui', detected: true }])
    })
  })

  describe('When a commit renames a package.json inexactly (edited in the commit)', () => {
    const commits = [{ ...commitWithLines(rename('packages/components/package.json', 'packages/ui/package.json', 87)), shortHash: 'abc1234' }]

    function mockPackageNames(names: Record<string, string>) {
      vi.mocked(runGitSync).mockImplementation((args) => {
        const ref = args[1] as string

        if (!(ref in names)) {
          throw new Error(`fatal: invalid object name ${ref}`)
        }

        return JSON.stringify({ name: names[ref] })
      })
    }

    it('Then it is a move when the package keeps its name', () => {
      mockPackageNames({ 'abc1234^:packages/components/package.json': '@scope/ui', 'abc1234:packages/ui/package.json': '@scope/ui' })

      expect(getDetectedPackageMoves(commits, cwd)).toEqual([{ from: 'packages/components', to: 'packages/ui', detected: true }])
      expect(runGitSync).toHaveBeenCalledWith(['show', 'abc1234^:packages/components/package.json'], expect.objectContaining({ cwd }))
    })

    it('Then git paired the package.json of two different packages when the names differ', () => {
      mockPackageNames({ 'abc1234^:packages/components/package.json': '@scope/related-dropdown', 'abc1234:packages/ui/package.json': '@scope/navigation' })

      expect(getDetectedPackageMoves(commits, cwd)).toEqual([])
    })

    it('Then it is not a move when a package.json cannot be read', () => {
      mockPackageNames({ 'abc1234:packages/ui/package.json': '@scope/ui' })

      expect(getDetectedPackageMoves(commits, cwd)).toEqual([])
    })

    it('Then it is not a move without the hash of the commit', () => {
      expect(getDetectedPackageMoves([commitWithLines(rename('packages/components/package.json', 'packages/ui/package.json', 87))], cwd)).toEqual([])
      expect(runGitSync).not.toHaveBeenCalled()
    })
  })

  describe('When a commit moves a file alone, or copies a package.json', () => {
    it('Then it returns no move', () => {
      const commits = [commitWithLines(
        rename('packages/a/src/util.ts', 'packages/b/src/util.ts'),
        'C100\tpackages/a/package.json\tpackages/c/package.json',
        'M\tpackages/a/package.json',
      )]

      expect(getDetectedPackageMoves(commits, cwd)).toEqual([])
    })
  })

  describe('When the root package.json is renamed', () => {
    it('Then it is not a package move', () => {
      const commits = [commitWithLines(rename('package.json', 'packages/app/package.json'))]

      expect(getDetectedPackageMoves(commits, cwd)).toEqual([])
    })
  })
})

describe('Given getPreviousPackagePaths', () => {
  describe('When the package was moved in the commits', () => {
    it('Then it returns the old directory', () => {
      const commits = [commitWithLines(rename('packages/components/package.json', 'packages/ui/package.json'))]

      expect(getPreviousPackagePaths({ packagePath: 'packages/ui', commits, cwd })).toEqual(['packages/components'])
    })

    it('Then it follows the chains of moves', () => {
      const commits = [
        commitWithLines(rename('packages/ui/package.json', 'packages/design-system/package.json')),
        commitWithLines(rename('packages/components/package.json', 'packages/ui/package.json')),
      ]

      expect(getPreviousPackagePaths({ packagePath: 'packages/design-system', commits, cwd })).toEqual(['packages/ui', 'packages/components'])
    })

    it('Then the moves of the other packages are left out', () => {
      const commits = [commitWithLines(rename('shared/nav/package.json', 'packages/nav/package.json'))]

      expect(getPreviousPackagePaths({ packagePath: 'packages/ui', commits, cwd })).toEqual([])
    })
  })

  describe('When a package lives in the old directory again', () => {
    it('Then the detected move is skipped', () => {
      mkdirSync(join(cwd, 'packages/components'), { recursive: true })
      writeFileSync(join(cwd, 'packages/components/package.json'), '{}')
      const commits = [commitWithLines(rename('packages/components/package.json', 'packages/ui/package.json'))]

      expect(getPreviousPackagePaths({ packagePath: 'packages/ui', commits, cwd })).toEqual([])
    })

    it('Then a move of monorepo.movedPackages is still applied', () => {
      mkdirSync(join(cwd, 'packages/components'), { recursive: true })
      writeFileSync(join(cwd, 'packages/components/package.json'), '{}')

      expect(getPreviousPackagePaths({
        packagePath: 'packages/ui',
        commits: [],
        movedPackages: { 'packages/components': 'packages/ui' },
        cwd,
      })).toEqual(['packages/components'])
    })
  })

  describe('When the moves come from monorepo.movedPackages', () => {
    it('Then they are normalized and followed through the chains, with the detected ones', () => {
      const commits = [commitWithLines(rename('packages/ui/package.json', 'packages/design-system/package.json'))]

      expect(getPreviousPackagePaths({
        packagePath: 'packages/design-system/',
        commits,
        movedPackages: { './packages/components/': 'packages/ui', 'legacy\\components': 'packages/components' },
        cwd,
      })).toEqual(['packages/ui', 'packages/components', 'legacy/components'])
    })
  })

  describe('When two moves point to each other', () => {
    it('Then it stops once every directory is found', () => {
      const commits = [
        commitWithLines(rename('packages/b/package.json', 'packages/a/package.json')),
        commitWithLines(rename('packages/a/package.json', 'packages/b/package.json')),
      ]

      expect(getPreviousPackagePaths({ packagePath: 'packages/a', commits, cwd })).toEqual(['packages/b'])
    })
  })
})

describe('Given getPackageJsonHistory', () => {
  describe('When git follows the package.json', () => {
    it('Then it returns one record per commit, with its file lines', () => {
      vi.mocked(runGitSync).mockReturnValue(`\x1Eabc1234\n\nR100\tpackages/components/package.json\tpackages/ui/package.json\n\x1Edef5678\n\nA\tpackages/components/package.json\n`)

      expect(getPackageJsonHistory('packages/ui', cwd)).toEqual([
        { shortHash: 'abc1234', body: '\nR100\tpackages/components/package.json\tpackages/ui/package.json\n' },
        { shortHash: 'def5678', body: '\nA\tpackages/components/package.json\n' },
      ])
      expect(runGitSync).toHaveBeenCalledWith(
        ['--no-pager', 'log', '--follow', '--name-status', '--format=%x1E%h', '--', 'packages/ui/package.json'],
        { cwd, trim: false },
      )
    })
  })

  describe('When git fails', () => {
    it('Then it returns no commit', () => {
      vi.mocked(runGitSync).mockImplementation(() => {
        throw new Error('not a git repository')
      })

      expect(getPackageJsonHistory('packages/ui', cwd)).toEqual([])
    })
  })
})
