import type { GitRepository } from '../../../../tests/git-repository'
import type { VersionChange } from '../peers'
import { join } from 'node:path'
import { createGitRepository } from '../../../../tests/git-repository'
import { findStalePeerDependents, getOutOfRangeDependencies, getOutOfRangePeers } from '../peers'
import { NEW_PACKAGE_MARKER } from '../tags'

describe('Given the published ranges of a package at its last release', () => {
  let repo: GitRepository
  let packagePath: string
  const bumped = new Map<string, VersionChange>([
    [
      'loader',
      { oldVersion: '0.1.0', newVersion: '0.2.0' },
    ],
  ])

  function writeIcons(content: Record<string, unknown> = {}) {
    repo.writeJson('packages/icons', { name: 'icons', version: '5.7.0', ...content })
  }

  beforeEach(() => {
    repo = createGitRepository('relizy-peers-')
    packagePath = join(repo.cwd, 'packages/icons')
  })

  afterEach(() => {
    repo.remove()
  })

  it('When a peer dependency was added since the release, Then it rejects nothing', () => {
    writeIcons()
    repo.commit('chore: release')
    repo.git('tag', '-a', 'v5.7.0', '-m', 'v5.7.0')
    writeIcons({
      peerDependencies: { loader: 'workspace:^' },
    })
    repo.commit('feat: use the loader')

    expect(getOutOfRangePeers({ packagePath, bumped, ref: 'v5.7.0' })).toEqual([])
    // Without ref, the working tree
    expect(getOutOfRangePeers({ packagePath, bumped })).toEqual([
      expect.objectContaining({ dependency: 'loader', range: '^0.1.0' }),
    ])
  })

  it('When a range was changed since the release, Then checks the published one', () => {
    writeIcons({
      dependencies: { loader: 'workspace:*' },
    })
    repo.commit('chore: release')
    repo.git('tag', '-a', 'v5.7.0', '-m', 'v5.7.0')
    writeIcons({
      dependencies: { loader: '^0.2.0' },
    })
    repo.commit('feat: use the new loader')

    expect(getOutOfRangeDependencies({
      packagePath,
      bumped,
      fields: ['dependencies'],
      ref: 'v5.7.0',
    })).toEqual([
      expect.objectContaining({ dependency: 'loader', field: 'dependencies', range: '0.1.0' }),
    ])
  })

  it('When the package was never released, Then nothing is out of range', () => {
    repo.commit('chore: init', { 'README.md': 'readme\n' })
    repo.git('tag', '-a', 'v5.7.0', '-m', 'v5.7.0')
    writeIcons({
      peerDependencies: { loader: 'workspace:*' },
    })
    repo.commit('feat: add the icons')

    expect(getOutOfRangePeers({ packagePath, bumped, ref: 'v5.7.0' })).toEqual([])
    expect(getOutOfRangePeers({ packagePath, bumped, ref: NEW_PACKAGE_MARKER })).toEqual([])
  })

  it('When the ref does not exist, Then reads the working tree', () => {
    writeIcons({
      peerDependencies: { loader: 'workspace:*' },
    })
    repo.commit('chore: init')

    expect(getOutOfRangePeers({ packagePath, bumped, ref: 'icons@5.7.0' })).toEqual([
      expect.objectContaining({ dependency: 'loader', range: '0.1.0' }),
    ])
  })

  it('When a package not released has refs, Then findStalePeerDependents reads its ranges there', () => {
    writeIcons()
    repo.commit('chore: release')
    repo.git('tag', '-a', 'v5.7.0', '-m', 'v5.7.0')
    writeIcons({
      peerDependencies: { loader: 'workspace:*' },
    })
    repo.commit('feat: use the loader')
    const icons = {
      name: 'icons',
      version: '5.7.0',
      private: false,
      path: packagePath,
    }
    const loader = {
      name: 'loader',
      version: '0.1.0',
      private: false,
      path: join(repo.cwd, 'packages/loader'),
      fromTag: '',
      commits: [],
      dependencies: [],
      oldVersion: '0.1.0',
      newVersion: '0.2.0',
    }

    expect(findStalePeerDependents({
      workspacePackages: [icons],
      bumpedPackages: [loader],
      publishedPackages: [loader],
      refs: new Map([
        ['icons', 'v5.7.0'],
      ]),
    })).toEqual([])
    expect(findStalePeerDependents({
      workspacePackages: [icons],
      bumpedPackages: [loader],
      publishedPackages: [loader],
    })).toEqual([
      expect.objectContaining({ dependent: 'icons', dependency: 'loader' }),
    ])
  })
})
