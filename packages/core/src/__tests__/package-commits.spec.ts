import type { GitCommit } from '../types'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getCommitChangedFiles, isAllowedCommit, isCommitInPackage, resolveReleasedPackagePaths } from '../package-commits'

function commitWithFiles(
  { type, message, files, isBreaking = false }: { type: string, message: string, files: string[], isBreaking?: boolean },
): GitCommit {
  const nameStatus = files.map(file => `M\t${file}`).join('\n')
  return {
    shortHash: 'abc1234',
    author: { name: 'Test', email: 'test@example.com' },
    message,
    body: `\n\n${nameStatus}\n`,
    type,
    scope: '',
    references: [],
    description: message,
    isBreaking,
    authors: [],
  } as GitCommit
}

describe('Given getCommitChangedFiles', () => {
  it('Then extracts file paths from --name-status body lines', () => {
    const commit = commitWithFiles({
      type: 'feat',
      message: 'feat: x',
      files: ['packages/pkg-a/src/index.ts', 'packages/pkg-a/package.json'],
    })

    expect(getCommitChangedFiles(commit)).toEqual([
      'packages/pkg-a/src/index.ts',
      'packages/pkg-a/package.json',
    ])
  })

  it('Then keeps the new path for renames/copies (R100/C75)', () => {
    const commit = {
      body: '\n\nR100\tpackages/pkg-a/old.ts\tpackages/pkg-a/new.ts\nC75\tpackages/pkg-a/a.ts\tpackages/pkg-a/b.ts\n',
    } as GitCommit

    expect(getCommitChangedFiles(commit)).toEqual([
      'packages/pkg-a/new.ts',
      'packages/pkg-a/b.ts',
    ])
  })

  it('Then ignores the human-readable body text (no tab)', () => {
    const commit = {
      body: '\n\nBREAKING CHANGE: dropped the old API\n\nM\tpackages/pkg-a/index.ts\n',
    } as GitCommit

    expect(getCommitChangedFiles(commit)).toEqual(['packages/pkg-a/index.ts'])
  })

  it('Then returns an empty array when the body has no file lines', () => {
    expect(getCommitChangedFiles({ body: '' } as GitCommit)).toEqual([])
  })

  it('Then drops the quotes git adds around paths with unusual characters', () => {
    const commit = {
      body: '\n\nA\t"packages/pkg-a/caf\\303\\251.ts"\nR100\t"packages/pkg-a/a b.ts"\t"packages/pkg-a/c d.ts"\n',
    } as GitCommit

    expect(getCommitChangedFiles(commit)).toEqual([
      'packages/pkg-a/caf\\303\\251.ts',
      'packages/pkg-a/c d.ts',
    ])
  })
})

describe('Given isCommitInPackage', () => {
  it('Then is true when the commit changes a file of the package', () => {
    const commit = commitWithFiles({
      type: 'feat',
      message: 'feat: x',
      files: ['packages/components/src/index.ts'],
    })

    expect(isCommitInPackage(commit, 'packages/components')).toBe(true)
  })

  it('Then is true when the commit changes the package directory itself (submodule, symlink)', () => {
    const commit = commitWithFiles({
      type: 'feat',
      message: 'feat: x',
      files: ['packages/components'],
    })

    expect(isCommitInPackage(commit, 'packages/components')).toBe(true)
  })

  it('Then respects the directory boundary (packages/components does not match packages/components-mcp)', () => {
    const commit = commitWithFiles({
      type: 'feat',
      message: 'feat: x',
      files: ['packages/components-mcp/src/index.ts'],
    })

    expect(isCommitInPackage(commit, 'packages/components')).toBe(false)
  })

  it('Then does not match the package path inside a longer directory name', () => {
    const commit = commitWithFiles({
      type: 'feat',
      message: 'feat: x',
      files: ['shared-components/ah-related-dropdown/src/index.ts'],
    })

    expect(isCommitInPackage(commit, 'shared-components/related-dropdown')).toBe(false)
  })

  it('Then does not match a nested directory of another package with the same name', () => {
    const commit = commitWithFiles({
      type: 'feat',
      message: 'feat: x',
      files: ['apps/demo/packages/components/index.ts'],
    })

    expect(isCommitInPackage(commit, 'packages/components')).toBe(false)
  })

  it('Then counts both paths of a rename and of a copy', () => {
    const movedOut = { body: '\n\nR100\tpackages/pkg-a/old.ts\tpackages/pkg-b/new.ts\n' } as GitCommit
    const copiedIn = { body: '\n\nC75\tpackages/pkg-b/a.ts\tpackages/pkg-a/b.ts\n' } as GitCommit

    expect(isCommitInPackage(movedOut, 'packages/pkg-a')).toBe(true)
    expect(isCommitInPackage(movedOut, 'packages/pkg-b')).toBe(true)
    expect(isCommitInPackage(copiedIn, 'packages/pkg-a')).toBe(true)
  })

  it('Then matches a path quoted by git', () => {
    const commit = { body: '\n\nM\t"packages/pkg-a/caf\\303\\251.ts"\n' } as GitCommit

    expect(isCommitInPackage(commit, 'packages/pkg-a')).toBe(true)
  })

  it('Then ignores the package path written in the commit message', () => {
    const commit = { body: '\n\nMoved from packages/pkg-a/index.ts\n\nM\tdocs/index.md\n' } as GitCommit

    expect(isCommitInPackage(commit, 'packages/pkg-a')).toBe(false)
  })

  it('Then is false when the body has no file lines', () => {
    expect(isCommitInPackage({ body: '' } as GitCommit, 'packages/pkg-a')).toBe(false)
  })
})

describe('Given isCommitInPackage with the former directories of a package', () => {
  it('Then a commit of a former directory belongs to the package', () => {
    const commit = commitWithFiles({
      type: 'feat',
      message: 'feat: x',
      files: ['legacy/pkg-a/src/x.ts'],
    })

    expect(isCommitInPackage(commit, 'packages/pkg-a', ['legacy/pkg-a'])).toBe(true)
    expect(isCommitInPackage(commit, 'packages/pkg-a')).toBe(false)
  })
})

describe('Given resolveReleasedPackagePaths function', () => {
  let cwd: string

  function writePackage(directory: string, content: Record<string, unknown>) {
    mkdirSync(join(cwd, directory), { recursive: true })
    writeFileSync(join(cwd, directory, 'package.json'), JSON.stringify(content))
  }

  beforeEach(() => {
    cwd = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-released-paths-')))
    writePackage('.', { name: 'root-package', version: '1.0.0' })
    writePackage('packages/pkg-a', { name: 'pkg-a', version: '1.0.0' })
    writePackage('packages/pkg-b', { name: 'pkg-b', version: '1.1.0' })
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('Then returns the relative POSIX paths, without the ones matched by the ignored globs', () => {
    expect(resolveReleasedPackagePaths({
      cwd,
      patterns: ['packages/*'],
      ignored: ['packages/pkg-a'],
    })).toEqual(['packages/pkg-b'])
  })

  it('Then leaves the private packages out, unless privatePackages is release', () => {
    writePackage('packages/pkg-b', { name: 'pkg-b', version: '1.1.0', private: true })

    expect(resolveReleasedPackagePaths({
      cwd,
      patterns: ['packages/*'],
    })).toEqual(['packages/pkg-a'])
    expect(resolveReleasedPackagePaths({
      cwd,
      patterns: ['packages/*'],
      privatePackages: 'release',
    })).toEqual(['packages/pkg-a', 'packages/pkg-b'])
  })
})

describe('Given isAllowedCommit function', () => {
  const feat = commitWithFiles({ type: 'feat', message: 'feat: x', files: [] })

  it('Then keeps a commit whose type triggers a bump', () => {
    expect(isAllowedCommit({
      commit: feat,
      type: { title: 'Features', semver: 'minor' },
      changelog: false,
    })).toBe(true)
  })

  it('Then keeps a commit whose type only has a title when the changelog is concerned', () => {
    expect(isAllowedCommit({
      commit: feat,
      type: { title: 'Chore' },
      changelog: true,
    })).toBe(true)
    expect(isAllowedCommit({
      commit: feat,
      type: { title: 'Chore' },
      changelog: false,
    })).toBe(false)
  })

  it('Then follows a boolean type and leaves out an unknown one', () => {
    expect(isAllowedCommit({ commit: feat, type: true, changelog: false })).toBe(true)
    expect(isAllowedCommit({ commit: feat, type: false, changelog: true })).toBe(false)
    expect(isAllowedCommit({ commit: feat, changelog: true })).toBe(false)
  })

  it('Then leaves out the chore(deps) and chore(release) commits, unless they are breaking', () => {
    const type = { title: 'Chore', semver: 'patch' as const }

    expect(isAllowedCommit({
      commit: { ...feat, type: 'chore', scope: 'deps' },
      type,
      changelog: true,
    })).toBe(false)
    expect(isAllowedCommit({
      commit: { ...feat, type: 'chore', scope: 'release' },
      type,
      changelog: true,
    })).toBe(false)
    expect(isAllowedCommit({
      commit: {
        ...feat,
        type: 'chore',
        scope: 'deps',
        isBreaking: true,
      },
      type,
      changelog: true,
    })).toBe(true)
    expect(isAllowedCommit({
      commit: { ...feat, type: 'chore', scope: 'ci' },
      type,
      changelog: true,
    })).toBe(true)
  })
})
