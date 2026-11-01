import type { ResolvedRelizyConfig } from '../config'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { createMockConfig } from '../../../tests/mocks'
import { bump } from '../../commands/bump'
import { getCatalogName, getChangedCatalogEntries, getCommitCatalogChanges, prefetchCatalogChanges, readCatalogEntries, readFilesAtCommits, referencesCatalogEntries, resetCatalogCache } from '../catalogs'
import { getPackageCommits } from '../repo'

// The setup file mocks execPromise: these tests run the real git commands against a temporary repository
vi.mock('@maz-ui/node', importActual => importActual())

describe('Given readCatalogEntries', () => {
  it('Then reads the default and named catalogs of pnpm-workspace.yaml and .yarnrc.yml', () => {
    const yaml = 'packages:\n  - packages/*\ncatalog:\n  vue: ^3.4.0\ncatalogs:\n  default:\n    react: ^18.0.0\n  vue2:\n    vue: ^2.7.0\n'

    for (const file of ['pnpm-workspace.yaml', '.yarnrc.yml'] as const) {
      expect([...readCatalogEntries(file, yaml)]).toEqual([['default:vue', '^3.4.0'], ['default:react', '^18.0.0'], ['vue2:vue', '^2.7.0']])
    }
  })

  it('Then reads the catalogs of a bun package.json, at its root or in its workspaces', () => {
    expect([...readCatalogEntries('package.json', JSON.stringify({ catalog: { vue: '^3.4.0' } }))]).toEqual([['default:vue', '^3.4.0']])
    expect([...readCatalogEntries('package.json', JSON.stringify({ workspaces: { packages: ['packages/*'], catalog: { vue: '^3.5.0' }, catalogs: { test: { vitest: '^2.0.0' } } } }))])
      .toEqual([['default:vue', '^3.5.0'], ['test:vitest', '^2.0.0']])
  })

  it('Then a missing, invalid or catalog-less file declares no entry', () => {
    expect(readCatalogEntries('pnpm-workspace.yaml', undefined).size).toBe(0)
    expect(readCatalogEntries('package.json', '{ invalid').size).toBe(0)
    expect(readCatalogEntries('package.json', JSON.stringify({ name: 'root', workspaces: ['packages/*'], catalog: 'nope' })).size).toBe(0)
    expect(readCatalogEntries('pnpm-workspace.yaml', 'catalogs: 12\n').size).toBe(0)
  })
})

describe('Given getChangedCatalogEntries', () => {
  it('Then returns the entries added, removed and changed', () => {
    const before = new Map([['default:vue', '^3.4.0'], ['default:vitest', '^2.0.0'], ['default:lodash', '^4.0.0']])
    const after = new Map([['default:vue', '^3.5.0'], ['default:vitest', '^2.0.0'], ['default:zod', '^4.0.0']])

    expect([...getChangedCatalogEntries(before, after)].sort()).toEqual(['default:lodash', 'default:vue', 'default:zod'])
  })
})

describe('Given getCatalogName', () => {
  it('Then returns the catalog of a catalog specifier only', () => {
    expect(getCatalogName('catalog:')).toBe('default')
    expect(getCatalogName('catalog:vue2')).toBe('vue2')
    expect(getCatalogName('catalog: ')).toBe('default')
    expect(getCatalogName('workspace:*')).toBeUndefined()
    expect(getCatalogName('^3.4.0')).toBeUndefined()
    expect(getCatalogName(undefined)).toBeUndefined()
  })
})

/**
 * Integration tests against a real git repository: a commit that only changes
 * an entry of a catalog belongs to the packages referencing this entry.
 */
describe('Given getPackageCommits with catalogs on a real git repository', () => {
  let cwd: string
  let base: string

  function git(...args: string[]) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  }

  function write(path: string, content: string) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true })
    writeFileSync(join(cwd, path), content)
  }

  function writeJson(path: string, content: Record<string, unknown>) {
    write(path, `${JSON.stringify(content, null, 2)}\n`)
  }

  function commit(message: string) {
    git('add', '--all')
    git('commit', '--no-verify', '--allow-empty', '-m', message)
  }

  function createConfig(): ResolvedRelizyConfig {
    const config = createMockConfig({
      bump: { type: 'release' },
      monorepo: { versionMode: 'independent', packages: ['packages/*'] },
    })
    config.cwd = cwd
    config.logLevel = 'silent'
    config.detectRewrittenTags = false
    return config
  }

  async function descriptionsOf(name: string) {
    const commits = await getPackageCommits({
      pkg: { name, version: '1.0.0', path: join(cwd, 'packages', name), private: false },
      from: base,
      to: 'HEAD',
      config: createConfig(),
      changelog: true,
    })

    return commits.map(commit => commit.description)
  }

  function initRepository(files: () => void) {
    cwd = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-catalogs-')))
    git('init', '--quiet', '--initial-branch=main')
    git('config', 'user.name', 'Relizy')
    git('config', 'user.email', 'relizy@example.com')
    git('config', 'commit.gpgsign', 'false')

    files()
    writeJson('packages/ui/package.json', { name: 'ui', version: '1.0.0', dependencies: { vue: 'catalog:' }, devDependencies: { vitest: 'catalog:test' } })
    writeJson('packages/legacy/package.json', { name: 'legacy', version: '1.0.0', peerDependencies: { vue: 'catalog:vue2' } })
    writeJson('packages/utils/package.json', { name: 'utils', version: '1.0.0', dependencies: { vue: '^3.4.0' } })
    commit('chore: init the monorepo')
    base = git('rev-parse', 'HEAD')
  }

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
    resetCatalogCache()
  })

  describe('When the catalogs are in pnpm-workspace.yaml', () => {
    const workspace = (vue: string, vitest = '^2.0.0', vue2 = '^2.7.0') => `packages:\n  - packages/*\ncatalog:\n  vue: ${vue}\ncatalogs:\n  test:\n    vitest: ${vitest}\n  vue2:\n    vue: ${vue2}\n`

    beforeEach(() => {
      initRepository(() => {
        writeJson('package.json', { name: 'root', version: '1.0.0', private: true })
        write('pnpm-workspace.yaml', workspace('^3.4.0'))
      })
    })

    it('Then a commit changing a catalog entry belongs to the packages referencing it, in any field', async () => {
      write('pnpm-workspace.yaml', workspace('^3.5.0'))
      commit('fix(deps): update vue to 3.5')
      write('pnpm-workspace.yaml', workspace('^3.5.0', '^3.0.0'))
      commit('build(deps): update vitest to 3')
      write('pnpm-workspace.yaml', workspace('^3.5.0', '^3.0.0', '^2.7.16'))
      commit('fix(deps): update vue 2')

      expect(await descriptionsOf('ui')).toEqual(['update vitest to 3', 'update vue to 3.5'])
      expect(await descriptionsOf('legacy')).toEqual(['update vue 2'])
      expect(await descriptionsOf('utils')).toEqual([])
    })

    it('Then a commit changing the workspace file without a catalog entry belongs to no package', async () => {
      write('pnpm-workspace.yaml', `${workspace('^3.4.0')}onlyBuiltDependencies:\n  - esbuild\n`)
      commit('chore: allow the esbuild build')

      expect(await descriptionsOf('ui')).toEqual([])
    })

    it('Then the package.json of the package at the commit decides, not the current one', async () => {
      write('pnpm-workspace.yaml', workspace('^3.5.0'))
      commit('fix(deps): update vue to 3.5')
      writeJson('packages/utils/package.json', { name: 'utils', version: '1.0.0', dependencies: { vue: 'catalog:' } })
      commit('refactor(utils): use the vue catalog')

      expect(await descriptionsOf('utils')).toEqual(['use the vue catalog'])
    })

    it('Then a package created later, or with an invalid package.json at the commit, does not get the commit', async () => {
      write('packages/utils/package.json', '{ invalid')
      write('pnpm-workspace.yaml', workspace('^3.5.0'))
      commit('fix(deps): update vue to 3.5')
      writeJson('packages/later/package.json', { name: 'later', version: '1.0.0', dependencies: { vue: 'catalog:' } })
      commit('feat(later): add the later package')

      expect(await descriptionsOf('ui')).toEqual(['update vue to 3.5'])
      expect(await descriptionsOf('utils')).toEqual(['update vue to 3.5'])
      expect(await descriptionsOf('later')).toEqual(['add the later package'])
    })
  })

  describe('When the catalogs are in .yarnrc.yml', () => {
    beforeEach(() => {
      initRepository(() => {
        writeJson('package.json', { name: 'root', version: '1.0.0', private: true, workspaces: ['packages/*'] })
        write('.yarnrc.yml', 'nodeLinker: node-modules\ncatalog:\n  vue: ^3.4.0\n')
      })
    })

    it('Then a commit changing a catalog entry belongs to the packages referencing it', async () => {
      write('.yarnrc.yml', 'nodeLinker: node-modules\ncatalog:\n  vue: ^3.5.0\n')
      commit('fix(deps): update vue to 3.5')

      expect(await descriptionsOf('ui')).toEqual(['update vue to 3.5'])
      expect(await descriptionsOf('utils')).toEqual([])
    })
  })

  describe('When the catalogs are in the package.json of bun', () => {
    const root = (vue: string) => ({ name: 'root', version: '1.0.0', private: true, workspaces: { packages: ['packages/*'], catalog: { vue } } })

    beforeEach(() => {
      initRepository(() => writeJson('package.json', root('^3.4.0')))
    })

    it('Then a commit changing a catalog entry belongs to the packages referencing it, and the other changes of the root package.json do not', async () => {
      writeJson('package.json', root('^3.5.0'))
      commit('fix(deps): update vue to 3.5')
      writeJson('package.json', { ...root('^3.5.0'), scripts: { build: 'bun run build' } })
      commit('chore: add the build script')

      expect(await descriptionsOf('ui')).toEqual(['update vue to 3.5'])
    })
  })

  describe('When files are read at several commits at once', () => {
    it('Then each content is returned in order, undefined for a missing file, a tree or a missing commit', () => {
      initRepository(() => {
        writeJson('package.json', { name: 'root', version: '1.0.0', private: true })
        write('pnpm-workspace.yaml', 'catalog:\n  vue: ^3.4.0\n')
        write('notes/é.md', 'Accents: é\n')
      })

      expect(readFilesAtCommits(cwd, [`${base}:pnpm-workspace.yaml`, `${base}:missing.yaml`, `${base}:notes/é.md`, `${base}:packages`, 'nothing:file', `${base}^:package.json`]))
        .toEqual(['catalog:\n  vue: ^3.4.0\n', undefined, 'Accents: é\n', undefined, undefined, undefined])
      expect(readFilesAtCommits(cwd, [])).toEqual([])
      expect(readFilesAtCommits(join(cwd, 'missing'), ['HEAD:package.json'])).toEqual([undefined])
    })

    it('Then the catalog changes of many commits are read once and cached', () => {
      initRepository(() => {
        writeJson('package.json', { name: 'root', version: '1.0.0', private: true })
        write('pnpm-workspace.yaml', 'catalog:\n  vue: ^3.4.0\n')
      })
      write('pnpm-workspace.yaml', 'catalog:\n  vue: ^3.5.0\n')
      commit('fix(deps): update vue')
      const head = git('rev-parse', '--short', 'HEAD')

      prefetchCatalogChanges({ commits: [{ hash: base, files: ['pnpm-workspace.yaml'] }, { hash: head, files: ['pnpm-workspace.yaml', 'README.md'] }, { hash: head, files: ['README.md'] }], cwd })

      expect([...getCommitCatalogChanges({ hash: head, files: ['pnpm-workspace.yaml'], cwd })]).toEqual(['default:vue'])
    })
  })

  describe('When the catalog is created by the first commit of the repository', () => {
    it('Then its entries count as added', () => {
      initRepository(() => {
        writeJson('package.json', { name: 'root', version: '1.0.0', private: true })
        write('pnpm-workspace.yaml', 'catalog:\n  vue: ^3.4.0\n')
      })

      const changes = getCommitCatalogChanges({ hash: base, files: ['pnpm-workspace.yaml'], cwd })

      expect([...changes]).toEqual(['default:vue'])
      expect(getCommitCatalogChanges({ hash: base, files: ['pnpm-workspace.yaml'], cwd })).toBe(changes)
      expect(getCommitCatalogChanges({ hash: base, files: ['README.md'], cwd }).size).toBe(0)
      expect(referencesCatalogEntries({ hash: base, packageRelativePath: 'packages/ui', entries: changes, cwd })).toBe(true)
      expect(referencesCatalogEntries({ hash: base, packageRelativePath: 'packages/ui', entries: new Set(), cwd })).toBe(false)
      expect(referencesCatalogEntries({ hash: base, packageRelativePath: 'packages/missing', entries: changes, cwd })).toBe(false)
    })
  })
})

describe('Given a bump in selective mode after a commit that only updates a catalog', () => {
  let cwd: string
  let initialCwd: string

  function git(...args: string[]) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  }

  function writePackage(path: string, content: Record<string, unknown>) {
    mkdirSync(join(cwd, path), { recursive: true })
    writeFileSync(join(cwd, path, 'package.json'), `${JSON.stringify(content, null, 2)}\n`)
  }

  beforeEach(() => {
    initialCwd = process.cwd()
    cwd = realpathSync(mkdtempSync(join(tmpdir(), 'relizy-catalogs-bump-')))
    git('init', '--quiet', '--initial-branch=main')
    git('config', 'user.name', 'Relizy')
    git('config', 'user.email', 'relizy@example.com')
    git('config', 'commit.gpgsign', 'false')
    git('config', 'tag.gpgsign', 'false')
    git('remote', 'add', 'origin', 'https://github.com/acme/mono.git')

    writePackage('.', { name: 'mono', version: '1.0.0', private: true })
    writePackage('packages/ui', { name: '@acme/ui', version: '1.0.0', dependencies: { vue: 'catalog:' } })
    writePackage('packages/utils', { name: '@acme/utils', version: '1.0.0' })
    writeFileSync(join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\ncatalog:\n  vue: ^3.4.0\n')
    writeFileSync(join(cwd, 'relizy.config.mjs'), `export default { logLevel: 'silent', safetyCheck: false, monorepo: { versionMode: 'selective', packages: ['packages/*'] } }\n`)
    git('add', '-A')
    git('commit', '--no-verify', '-m', 'chore: init')
    git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0')

    writeFileSync(join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\ncatalog:\n  vue: ^3.5.0\n')
    git('add', '-A')
    git('commit', '--no-verify', '-m', 'fix(deps): update vue to 3.5')
    process.chdir(cwd)
  })

  afterEach(() => {
    process.chdir(initialCwd)
    rmSync(cwd, { recursive: true, force: true })
    resetCatalogCache()
  })

  it('Then only the packages using the updated catalog entry are released, without writing anything in dry run', async () => {
    const result = await bump({ dryRun: true, yes: true })

    expect(result.bumped && result.bumpedPackages.map(pkg => [pkg.name, pkg.newVersion])).toEqual([['@acme/ui', '1.0.1']])
    expect(git('status', '--porcelain')).toBe('')
  })
})
