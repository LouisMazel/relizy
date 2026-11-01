import type { TestRepository } from './helpers'

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createContext } from '../context'
import { loadKnowledge } from '../knowledge/load'
import { getConfigOption } from '../tools/get-config-option'
import { getDoc } from '../tools/get-doc'
import { getProject } from '../tools/get-project'
import { lintCommit } from '../tools/lint-commit'
import { previewChangelog } from '../tools/preview-changelog'
import { previewRelease } from '../tools/preview-release'
import { searchDocs } from '../tools/search-docs'
import { ToolInputError } from '../tools/types'
import { cleanTempDirs, createRepository, createTempDir, createTestContext } from './helpers'

// The setup file mocks execPromise: these tests run the real git commands against temporary repositories
vi.mock('@maz-ui/node', importActual => importActual())

const BASE_CONFIG = `logLevel: 'silent', safetyCheck: false, noAuthors: true,
  // Never run by the MCP server
  hooks: { 'before:bump': 'touch hooked', 'generate:changelog': () => { throw new Error('hook ran') } },`

function snapshot(repository: TestRepository) {
  return { status: repository.git('status', '--porcelain'), tags: repository.git('tag'), head: repository.git('rev-parse', 'HEAD') }
}

function createStandalone(): TestRepository {
  const repository = createRepository()

  repository.writeJson('.', { name: 'standalone', version: '1.0.0' })
  repository.writeFile('relizy.config.mjs', `export default { ${BASE_CONFIG} publish: { token: 'npm_abcdefghijklmnopqrstuvwxyz' } }\n`)
  repository.commit('chore: init')
  repository.git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0')
  repository.commit('feat: add the export command', { 'export.js': 'export {}' })
  repository.commit('fix: keep the empty lines\n\nThe exported file keeps its blank lines.', { 'export.js': 'export { a }' })
  repository.commit('docs: explain the export', { 'README.md': '# export' })

  return repository
}

function createMonorepo(versionMode: 'selective' | 'independent' | 'unified'): TestRepository {
  const repository = createRepository()

  repository.writeJson('.', { name: 'monorepo', version: '2.0.0', private: true })
  repository.writeJson('packages/core', { name: '@scope/core', version: '2.0.0' })
  repository.writeJson('packages/ui', { name: '@scope/ui', version: '2.0.0', dependencies: { '@scope/core': 'workspace:^' } })
  repository.writeJson('packages/docs', { name: '@scope/docs', version: '2.0.0' })
  repository.writeFile('relizy.config.mjs', `export default { ${BASE_CONFIG} types: { chore: false }, monorepo: { versionMode: '${versionMode}', packages: ['packages/*'] } }\n`)
  repository.commit('chore: init')
  repository.git('tag', '-a', 'v2.0.0', '-m', 'v2.0.0')

  for (const name of ['core', 'ui', 'docs']) {
    repository.git('tag', '-a', `@scope/${name}@2.0.0`, '-m', `@scope/${name}@2.0.0`)
  }

  repository.commit('feat(core): add the parser', { 'packages/core/parser.js': 'export {}' })

  return repository
}

function createGroups(): TestRepository {
  const repository = createRepository()

  repository.writeJson('.', { name: 'monorepo', version: '6.19.1', private: true })
  repository.writeJson('packages/components', { name: '@scope/components', version: '6.19.1' })
  repository.writeJson('shared/nav', { name: '@scope/nav', version: '1.2.0', peerDependencies: { '@scope/components': 'workspace:*' } })
  repository.writeJson('shared/login', { name: '@scope/login', version: '2.0.0' })
  repository.writeFile('relizy.config.mjs', `export default { ${BASE_CONFIG}
  monorepo: { groups: [
    { name: 'main', versionMode: 'selective', packages: ['packages/*'] },
    { name: 'header', versionMode: 'independent', packages: ['shared/*'] },
  ] },
}
`)
  repository.commit('chore: init')
  repository.git('tag', '-a', 'v6.19.1', '-m', 'v6.19.1')
  repository.git('tag', '-a', '@scope/nav@1.2.0', '-m', '@scope/nav@1.2.0')
  repository.git('tag', '-a', '@scope/login@2.0.0', '-m', '@scope/login@2.0.0')
  repository.commit('feat(components): add a button', { 'packages/components/button.js': 'export {}' })

  return repository
}

afterAll(() => {
  cleanTempDirs()
})

describe('Given preview_release on a standalone package', () => {
  let repository: TestRepository

  beforeAll(() => {
    repository = createStandalone()
  })

  describe('When the next release is previewed', () => {
    it('Then it reports the version, the commits and the tag without changing anything', async () => {
      const before = snapshot(repository)

      const text = await previewRelease(createTestContext(repository.cwd), {})

      expect(text).toContain('## standalone mode')
      expect(text).toContain('**Version:** 1.0.0 → 1.1.0 (commits since `v1.0.0`)')
      expect(text).toContain('feat: add the export command')
      expect(text).toContain('**Tags:** `v1.1.0`')
      expect(snapshot(repository)).toEqual(before)
      expect(existsSync(join(repository.cwd, 'hooked'))).toBe(false)
    })
  })

  describe('When a release type, a prerelease identifier and a range are given', () => {
    it('Then the preview follows them', async () => {
      const context = createTestContext(repository.cwd)

      expect(await previewRelease(context, { type: 'prerelease', preid: 'beta' })).toContain('1.0.0 → 1.1.0-beta.0')
      expect(await previewRelease(context, { type: 'major' })).toContain('1.0.0 → 2.0.0')
      expect(await previewRelease(context, { from: 'HEAD~1' })).toContain('**Version:** 1.0.0 → 1.0.1 (commits since `HEAD~1`)')
      expect(await previewRelease(context, { from: 'HEAD' })).toContain('Nothing to release: none of the commits since `HEAD` triggers a bump')
    })
  })

  describe('When there is nothing to release', () => {
    it('Then it says why and how to force a release', async () => {
      const text = await previewRelease(createTestContext(repository.cwd), { from: 'HEAD' })

      expect(text).toContain('No package would be released')
    })
  })

  describe('When the changelog is previewed', () => {
    it('Then it renders the entries of the commits, without hook nor contributors', async () => {
      const before = snapshot(repository)

      const text = await previewChangelog(createTestContext(repository.cwd), {})

      expect(text).toContain('## root (standalone) → `CHANGELOG.md`')
      expect(text).toContain('## v1.0.0...v1.1.0')
      expect(text).toContain('Add the export command')
      expect(text).toContain('The exported file keeps its blank lines.')
      expect(text).not.toContain('Contributors')
      expect(existsSync(join(repository.cwd, 'CHANGELOG.md'))).toBe(false)
      expect(snapshot(repository)).toEqual(before)
    })

    it('Then a package that is not released is reported', async () => {
      await expect(previewChangelog(createTestContext(repository.cwd), { package: 'other' })).rejects.toThrow(ToolInputError)
      await expect(previewChangelog(createTestContext(repository.cwd), { package: 'other' })).rejects.toThrow('"other" is not released by this release. Released: `standalone` (and `root`).')
    })

    it('Then there is no changelog without release', async () => {
      expect(await previewChangelog(createTestContext(repository.cwd), { from: 'HEAD' })).toContain('Nothing to release, so no changelog')
    })
  })

  describe('When the project is read', () => {
    it('Then it describes the config with the secrets masked', async () => {
      const text = await getProject(createTestContext(repository.cwd), {})

      expect(text).toContain('- **Config:** `relizy` (loaded: `relizy`)')
      expect(text).toContain('- **Version mode:** standalone')
      expect(text).toContain('last tag `v1.0.0`')
      expect(text).toContain('npm_***wxyz')
      expect(text).not.toContain('npm_abcdefghijklmnopqrstuvwxyz')
      expect(text).not.toContain('touch hooked')
      expect(text).toContain('The agents of this project have no relizy rules')
    })

    it('Then an unknown config is reported with the available ones', async () => {
      await expect(getProject(createTestContext(repository.cwd), { config: 'relizy.prod' })).rejects.toThrow('No config "relizy.prod"')
      await expect(getProject(createTestContext(repository.cwd), { config: 'relizy.prod' })).rejects.toThrow('Available configs: relizy.')
    })
  })
})

describe('Given preview_release on a monorepo', () => {
  describe('When it is in selective mode', () => {
    it('Then it explains the bump of each package and lists the packages not released', async () => {
      const repository = createMonorepo('selective')

      const text = await previewRelease(createTestContext(repository.cwd), {})

      expect(text).toContain('**Version:** 2.0.0 → 2.1.0')
      expect(text).toMatch(/\| `@scope\/core` \(`packages\/core`\) \| 2\.0\.0 → 2\.1\.0 \| 1 commit\(s\): feat\(core\): add the parser/)
      expect(text).toContain('| `@scope/ui` (`packages/ui`) | 2.0.0 → 2.1.0 | depends on `@scope/core` (`bump.dependencyTypes`) |')
      expect(text).toContain('Not released (no relevant commit nor bumped dependency): `@scope/docs`')
      expect(text).toContain('**Tags:** `v2.1.0`')
    })
  })

  describe('When it is in independent mode', () => {
    it('Then each package gets its own version and tag', async () => {
      const repository = createMonorepo('independent')

      const text = await previewRelease(createTestContext(repository.cwd), {})

      expect(text).toContain('| `@scope/core` (`packages/core`) | 2.0.0 → 2.1.0 |')
      expect(text).toContain('| `@scope/ui` (`packages/ui`) | 2.0.0 → 2.0.1 | depends on `@scope/core`')
      expect(text).toContain('**Tags:** `@scope/core@2.1.0`, `@scope/ui@2.0.1`')
    })
  })

  describe('When it is in unified mode', () => {
    it('Then every package follows the unified version', async () => {
      const repository = createMonorepo('unified')

      const text = await previewRelease(createTestContext(repository.cwd), {})

      expect(text).toContain('| `@scope/docs` (`packages/docs`) | 2.0.0 → 2.1.0 | follows the unified version |')
      expect(text).toContain('follows the unified version, 1 commit(s): feat(core): add the parser')
    })
  })

  describe('When the projects is read', () => {
    it('Then it lists the packages', async () => {
      const repository = createMonorepo('selective')

      const text = await getProject(createTestContext(repository.cwd), {})

      expect(text).toContain('## Packages (selective)')
      expect(text).toContain('| `@scope/ui` | 2.0.0 | `packages/ui` |')
      expect(text).toContain('`monorepo` 2.0.0 (private)')
    })
  })

  describe('When the changelog of one package is previewed', () => {
    it('Then only this package is rendered', async () => {
      const repository = createMonorepo('selective')

      const text = await previewChangelog(createTestContext(repository.cwd), { package: '@scope/core' })

      expect(text).toContain('## @scope/core → `packages/core/CHANGELOG.md`')
      expect(text).not.toContain('## root')
      expect(text).toContain('Add the parser')
    })
  })
})

describe('Given preview_release with version groups', () => {
  let repository: TestRepository

  beforeAll(() => {
    repository = createGroups()
  })

  describe('When a package of a group has a peer dependency on a package bumped by another group', () => {
    it('Then each group is previewed and the rejected peer range explains the bump', async () => {
      const before = snapshot(repository)

      const text = await previewRelease(createTestContext(repository.cwd), {})

      expect(text).toContain('## Group `main` (selective)')
      expect(text).toContain('## Group `header` (independent)')
      expect(text).toContain('| `@scope/nav` (`shared/nav`) | 1.2.0 → 1.2.1 | the published range of its peer dependency `@scope/components` rejects the new version of it (`bump.outOfRangePeers`) |')
      expect(text).toContain('Not released (no relevant commit nor bumped dependency): `@scope/login`')
      expect(text).toContain('**Tags:** `v6.20.0`, `@scope/nav@1.2.1`')
      expect(snapshot(repository)).toEqual(before)
    })
  })

  describe('When only one group is previewed', () => {
    it('Then the other groups are left out', async () => {
      const text = await previewRelease(createTestContext(repository.cwd), { groups: ['main'] })

      expect(text).toContain('## Group `main` (selective)')
      expect(text).not.toContain('## Group `header`')
    })
  })

  describe('When the project is read', () => {
    it('Then it lists the packages of each group', async () => {
      const text = await getProject(createTestContext(repository.cwd), {})

      expect(text).toContain('- **Version mode:** `main` group in selective mode, `header` group in independent mode')
      expect(text).toContain('## Group `header` (independent)')
      expect(text).toContain('| `@scope/nav` | 1.2.0 | `shared/nav` |')
    })
  })
})

describe('Given preview_release with a package depending on a package of another group', () => {
  describe('When the dependency is bumped', () => {
    it('Then the dependent is explained by the other group', async () => {
      const repository = createGroups()
      repository.writeJson('shared/login', { name: '@scope/login', version: '2.0.0', dependencies: { '@scope/components': 'workspace:^' } })
      repository.commit('chore: depend on the components')
      repository.git('tag', '-f', '-a', '@scope/login@2.0.0', '-m', '@scope/login@2.0.0')

      const text = await previewRelease(createTestContext(repository.cwd), {})

      expect(text).toContain('| `@scope/login` (`shared/login`) | 2.0.0 → 2.0.1 | depends on `@scope/components`, bumped by the `main` group |')
    })
  })
})

describe('Given lint_commit', () => {
  let repository: TestRepository

  beforeAll(() => {
    repository = createMonorepo('selective')
  })

  describe('When a valid message is linted', () => {
    it('Then it returns its bump, its packages and its changelog entry', async () => {
      const text = await lintCommit(createTestContext(repository.cwd), { message: 'feat(core): add the lexer\n\nThe lexer reads the tokens.', files: ['packages/core/lexer.js'] })

      expect(text).toContain('# Commitlint (relizy')
      expect(text).toContain('): passed')
      expect(text).toContain('### `feat(core): add the lexer`: valid')
      expect(text).toContain('- Bump: minor, packages: `@scope/core`')
      expect(text).toContain('- Changelog entry:')
      expect(text).toContain('The lexer reads the tokens.')
    })
  })

  describe('When an invalid message is linted', () => {
    it('Then it returns the problems, their fix and a suggested header', async () => {
      const text = await lintCommit(createTestContext(repository.cwd), { message: 'Feat(nothing): Add the lexer.', files: [] })

      expect(text).toContain('): failed')
      expect(text).toContain('**error**')
      expect(text).toContain('- Suggested header: `feat')
      expect(text).toContain('Fix the errors before committing')
    })
  })

  describe('When a breaking change and a type without changelog are linted', () => {
    it('Then it reports the major bump and the missing changelog entry', async () => {
      const context = createTestContext(repository.cwd)

      expect(await lintCommit(context, { message: 'feat(core)!: drop the old parser', files: [] })).toContain('- Bump: major (breaking change)')
      expect(await lintCommit(context, { message: 'chore: update the tooling', files: [] })).toContain('- Not in the changelog (the type `chore` has no changelog title)')
    })
  })

  describe('When the commits since the last tag are linted', () => {
    it('Then it lints each commit of the range', async () => {
      const text = await lintCommit(createTestContext(repository.cwd), {})

      expect(text).toMatch(/Linted 1 commit\(s\) after `(?:v2\.0\.0|@scope\/\w+@2\.0\.0)`/)
      expect(text).toContain('`feat(core): add the parser`: valid')
    })

    it('Then a range can be given, and the whole history without tag', async () => {
      const context = createTestContext(repository.cwd)

      expect(await lintCommit(context, { from: 'v2.0.0', to: 'HEAD' })).toContain('Linted 1 commit(s) after `v2.0.0` up to `HEAD`')

      const untagged = createRepository()
      untagged.writeJson('.', { name: 'app', version: '0.0.0' })
      untagged.commit('feat: first')

      expect(await lintCommit(createTestContext(untagged.cwd), {})).toContain('Linted 1 commit(s) of the whole history')
    })
  })

  describe('When many commits are linted', () => {
    it('Then only the commits with problems are detailed', async () => {
      const many = createRepository()
      many.writeJson('.', { name: 'app', version: '0.0.0' })

      for (let index = 0; index < 22; index++) {
        many.commit(`fix: fix the bug ${index}`)
      }

      many.commit('Update things')

      const text = await lintCommit(createTestContext(many.cwd), {})

      expect(text).toContain('Linted 23 commit(s)')
      expect(text).toContain('`Update things`: invalid')
      expect(text).not.toContain('`fix: fix the bug 3`')
      expect(text).toContain('The 22 other commits are valid.')
    })
  })

  describe('When a message and a range are both given', () => {
    it('Then it asks for one of them', async () => {
      await expect(lintCommit(createTestContext(repository.cwd), { message: 'feat: a', from: 'v2.0.0' })).rejects.toThrow('Pass either `message`')
    })
  })
})

describe('Given the knowledge tools', () => {
  const context = createTestContext()

  describe('When the docs are searched', () => {
    it('Then the pages and the config options are ranked, words of other tools included', () => {
      expect(searchDocs(context, { query: 'version groups' })).toContain('`guide/version-groups`')
      expect(searchDocs(context, { query: 'snapshot release' })).toContain('guide/canary-releases')
      expect(searchDocs(context, { query: 'out of range peers' })).toContain('get_config_option({ path: "bump.outOfRangePeers" })')
      expect(searchDocs(context, { query: 'github', category: 'guide', limit: 2 })).toContain('(category: guide)')
    })

    it('Then a query without result gives other leads', () => {
      expect(searchDocs(context, { query: 'zzqxw' })).toContain('No result.')
    })
  })

  describe('When a doc page is read', () => {
    it('Then it is found by id, name or title, and long pages return an outline', () => {
      expect(getDoc(context, { id: 'config/bump' })).toContain('Source: https://relizy.dev/config/bump')
      expect(getDoc(context, { id: 'version-groups' })).toContain('# Version Groups')
      expect(getDoc(context, { id: '/guide/version-modes.md#selective' })).toContain('Source: https://relizy.dev/guide/version-modes')
      expect(getDoc(context, { id: 'config/bump', sections: ['yes', 'nothing'] })).toContain('Sections not found: nothing.')
    })

    it('Then a long page returns its outline unless full is set', () => {
      const directory = createTempDir()
      const page = `# Long\n\nIntro.\n\n## First\n\n${'text '.repeat(6000)}\n\n### Nested\n\n## Second\n`
      const manifest = { ...context.knowledge.manifest, docs: [{ ...context.knowledge.docs[0]!, id: 'guide/long', file: 'pages/guide/long.md', chars: page.length }] }

      writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest))
      mkdirSync(join(directory, 'pages/guide'), { recursive: true })
      writeFileSync(join(directory, 'pages/guide/long.md'), page)

      const longContext = createContext({ cwd: directory, knowledge: loadKnowledge(directory) })
      const outline = getDoc(longContext, { id: 'guide/long' })

      expect(outline).toContain('This page is long')
      expect(outline).toContain('- First\n  - Nested\n- Second')
      expect(outline).not.toContain('text text')
      expect(getDoc(longContext, { id: 'guide/long', full: true })).not.toContain('This page is long')
    })

    it('Then an unknown page or section is reported with suggestions', () => {
      expect(() => getDoc(context, { id: 'canary' })).toThrow('No relizy doc matches "canary"')
      expect(() => getDoc(context, { id: 'config/bump', sections: ['nothing'] })).toThrow('No section "nothing" in `config/bump`')
    })
  })

  describe('When a config option is read', () => {
    it('Then it returns its type, default, description and nested options', () => {
      const groups = getConfigOption(context, { path: 'monorepo.groups' })

      expect(groups).toContain('# `monorepo.groups`')
      expect(groups).toContain('| `monorepo.groups[].versionMode` | `VersionMode` |')
      expect(getConfigOption(context, { path: 'release.push' })).toContain('- **Default:** `true`')
      expect(getConfigOption(context, { path: 'config.bump.dependencyTypes' })).toContain('- **Default:** `[\'dependencies\']`')
      expect(getConfigOption(context, { path: 'publish.packageManager' })).toContain('- **Default:** `"pnpm"`')
      expect(getConfigOption(context, { path: 'monorepo.ignorePackageNames' })).toContain('- **Deprecated:**')
      expect(getConfigOption(context, { path: 'commitlint' })).toContain('- **See:** https://relizy.dev/commitlint/')
      expect(getConfigOption(context, { path: 'monorepo.groups.name' })).toContain('# `monorepo.groups[].name`')
    })

    it('Then without path it lists the top-level options', () => {
      const text = getConfigOption(context, {})

      expect(text).toContain('| `bump` | `BumpConfig` |')
      expect(text).not.toContain('`bump.type`')
    })

    it('Then an unknown option is reported with the closest ones', () => {
      expect(() => getConfigOption(context, { path: 'bump.dependencies' })).toThrow('has no config option "bump.dependencies"')
      expect(() => getConfigOption(context, { path: 'publish.otpCode' })).toThrow('relizy')
    })
  })
})
