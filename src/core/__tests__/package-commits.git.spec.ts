import type { ResolvedRelizyConfig } from '../config'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createMockConfig } from '../../../tests/mocks'
import { getPackageCommits } from '../repo'
import { NEW_PACKAGE_MARKER } from '../tags'

// The setup file mocks execPromise: these tests run the real git commands against a temporary repository
vi.mock('@maz-ui/node', importActual => importActual())

/**
 * Integration tests of the commit attribution against a real git repository: the
 * real `git log --name-status` output (renames, quoted paths) parsed by changelogen.
 * `packages/components` is a prefix of `packages/components-mcp`, as in a real
 * monorepo (a component library and its MCP server).
 */
describe('Given getPackageCommits on a real git repository', () => {
  let cwd: string
  let base: string

  function git(...args: string[]) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  }

  function write(path: string, content = `${path}\n`) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true })
    writeFileSync(join(cwd, path), content)
  }

  function commit(message: string) {
    git('add', '--all')
    git('commit', '--no-verify', '-m', message)
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

  async function descriptionsOf(directory: string, from = base) {
    const commits = await getPackageCommits({
      pkg: { name: directory, version: '1.0.0', path: join(cwd, directory), private: false },
      from,
      to: 'HEAD',
      config: createConfig(),
      changelog: true,
    })

    return commits.map(commit => commit.description)
  }

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'relizy-package-commits-'))
    git('init', '--quiet', '--initial-branch=main')
    git('config', 'user.name', 'Relizy')
    git('config', 'user.email', 'relizy@example.com')
    git('config', 'commit.gpgsign', 'false')

    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'root', version: '1.0.0' }))
    write('packages/components/package.json', JSON.stringify({ name: 'components', version: '1.0.0' }))
    write('packages/components-mcp/package.json', JSON.stringify({ name: 'components-mcp', version: '1.0.0' }))
    commit('chore: init the monorepo')
    base = git('rev-parse', 'HEAD')
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  describe('When commits change one package, the other, or both', () => {
    it('Then each package only gets the commits that change its own files', async () => {
      write('packages/components-mcp/src/tools.ts')
      commit('feat: add an mcp tool')
      write('packages/components/src/button.ts')
      commit('feat: add a button')
      write('packages/components/src/shared.ts')
      write('packages/components-mcp/src/shared.ts')
      commit('feat: share a helper')

      expect(await descriptionsOf('packages/components')).toEqual(['share a helper', 'add a button'])
      expect(await descriptionsOf('packages/components-mcp')).toEqual(['share a helper', 'add an mcp tool'])
    })
  })

  describe('When a commit only mentions the package path in its body', () => {
    it('Then the package does not get it', async () => {
      write('docs/guide.md')
      git('add', '--all')
      git('commit', '--no-verify', '-m', 'feat: document the setup', '-m', 'Moved from packages/components/README.md.')

      expect(await descriptionsOf('packages/components')).toEqual([])
    })
  })

  describe('When a commit moves a file from a package to the other', () => {
    it('Then both packages get it', async () => {
      write('packages/components/src/helper.ts', 'export const helper = 1\n'.repeat(20))
      commit('feat: add a helper')
      mkdirSync(join(cwd, 'packages/components-mcp/src'), { recursive: true })
      renameSync(join(cwd, 'packages/components/src/helper.ts'), join(cwd, 'packages/components-mcp/src/helper.ts'))
      commit('feat: move the helper to the mcp server')

      expect(git('show', '--name-status', '--format=', 'HEAD')).toMatch(/^R100\t/)
      expect(await descriptionsOf('packages/components')).toEqual(['move the helper to the mcp server', 'add a helper'])
      expect(await descriptionsOf('packages/components-mcp')).toEqual(['move the helper to the mcp server'])
    })
  })

  describe('When a commit changes a file whose name git quotes', () => {
    it('Then the package gets it', async () => {
      git('config', 'core.quotePath', 'true')
      write('packages/components/src/café.ts')
      commit('feat: add the café component')

      expect(git('show', '--name-status', '--format=', 'HEAD')).toContain('"packages/components/src/caf\\303\\251.ts"')
      expect(await descriptionsOf('packages/components')).toEqual(['add the café component'])
      expect(await descriptionsOf('packages/components-mcp')).toEqual([])
    })
  })

  describe('When the package has no tag yet', () => {
    it('Then its history starts at its first commit and ignores the sibling package', async () => {
      write('packages/components-mcp/src/tools.ts')
      commit('feat: add an mcp tool')
      write('packages/components/src/button.ts')
      commit('feat: add a button')

      // The init commit creates packages/components/package.json: it is part of the package history
      expect(await descriptionsOf('packages/components', NEW_PACKAGE_MARKER)).toEqual(['add a button', 'init the monorepo'])
    })
  })
})
