import type { GitRepository } from '../../../../tests/git-repository'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createGitRepository } from '../../../../tests/git-repository'
import { findCiFiles, getDefaultBranch, getInstallDependenciesCommand, getNodeVersion, isPnpmPinned } from '../ci-workflow'

describe('Given the commands of a package manager', () => {
  it('Then installs from the lockfile', () => {
    expect((['npm', 'pnpm', 'yarn', 'bun'] as const).map(packageManager => getInstallDependenciesCommand({ packageManager, yarnBerry: false })))
      .toEqual([
        'npm ci',
        'pnpm install --frozen-lockfile',
        'yarn install --frozen-lockfile',
        'bun install --frozen-lockfile',
      ])
    expect(getInstallDependenciesCommand({ packageManager: 'yarn', yarnBerry: true })).toBe('yarn install --immutable')
  })
})

describe('Given the CI files of a project', () => {
  let cwd: string

  function write(path: string, content: string) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true })
    writeFileSync(join(cwd, path), content)
  }

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'relizy-ci-files-'))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('When a provider is read, Then lists its files sorted by path, without their comment lines', () => {
    write('.gitlab-ci.yml', '# the pipeline\ninclude:\n  - local: .gitlab/ci/release.yml\n')
    write('.gitlab/ci/release.yml', 'release:\n  # run by hand\n  script:\n    - pnpm relizy release --yes\n')
    write('.github/workflows/ci.yml', 'jobs: {}\n')

    expect(findCiFiles(cwd, 'gitlab')).toEqual([
      { file: '.gitlab-ci.yml', code: 'include:\n  - local: .gitlab/ci/release.yml\n' },
      { file: '.gitlab/ci/release.yml', code: 'release:\n  script:\n    - pnpm relizy release --yes\n' },
    ])
    expect(findCiFiles(cwd, 'github').map(({ file }) => file)).toEqual(['.github/workflows/ci.yml'])
  })

  it('When the project has no CI file, Then lists none', () => {
    expect(findCiFiles(cwd, 'github')).toEqual([])
    expect(findCiFiles(cwd, 'gitlab')).toEqual([])
  })
})

describe('Given what a workflow reads of the project', () => {
  let repo: GitRepository

  beforeEach(() => {
    repo = createGitRepository('relizy-ci-project-')
  })

  afterEach(() => {
    repo.remove()
  })

  it('When the repository has no remote, Then the default branch is the current one', () => {
    repo.commit('chore: init')
    repo.git('checkout', '--quiet', '-b', 'develop')

    expect(getDefaultBranch(repo.cwd)).toBe('develop')
  })

  it('When origin points to a default branch, Then it is the default branch', () => {
    repo.commit('chore: init')
    repo.git('update-ref', 'refs/remotes/origin/trunk', 'HEAD')
    repo.git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk')

    expect(getDefaultBranch(repo.cwd)).toBe('trunk')
  })

  it('When the directory is not a repository, Then the default branch is main', () => {
    const directory = mkdtempSync(join(tmpdir(), 'relizy-ci-no-repo-'))

    try {
      expect(getDefaultBranch(directory)).toBe('main')
    }
    finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('When the project has a node version file, Then gives its name and its major version', () => {
    expect(getNodeVersion(repo.cwd)).toEqual({})

    repo.write('.node-version', 'v22.12.0\n')
    expect(getNodeVersion(repo.cwd)).toEqual({ nodeVersionFile: '.node-version', nodeVersion: '22' })

    repo.write('.nvmrc', 'lts/*\n')
    expect(getNodeVersion(repo.cwd)).toEqual({ nodeVersionFile: '.nvmrc' })
  })

  it('When the packageManager field names pnpm, Then pnpm is pinned', () => {
    expect(isPnpmPinned(repo.cwd)).toBe(false)

    repo.write('package.json', '{ "packageManager": "yarn@4.0.0" }')
    expect(isPnpmPinned(repo.cwd)).toBe(false)

    repo.write('package.json', '{ "packageManager": "pnpm@10.0.0" }')
    expect(isPnpmPinned(repo.cwd)).toBe(true)
  })
})
