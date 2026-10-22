import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMockConfig } from '../../../tests/mocks'
import { findPackageByScope, getAllowedScopes, getPackageManagerWorkspaces, getPackagesOfFiles, getWorkspacePackages } from '../commitlint/workspace'

describe('Given the commitlint workspace helpers', () => {
  let cwd: string

  function writePackage(path: string, content: Record<string, unknown>) {
    mkdirSync(join(cwd, path), { recursive: true })
    writeFileSync(join(cwd, path, 'package.json'), JSON.stringify(content))
  }

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'relizy-commitlint-workspace-'))
    writePackage('.', { name: 'root', version: '1.0.0', private: true })
    writePackage('packages/nuxt', { name: '@maz-ui/nuxt', version: '1.0.0' })
    writePackage('packages/core-lib', { name: 'core', version: '1.0.0' })
    writePackage('apps/web', { name: 'web-app', version: '1.0.0', private: true })
    writePackage('apps/playground', { name: 'playground', private: true })
    mkdirSync(join(cwd, 'apps/assets'))
    writePackage('apps/broken', { private: true })
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  describe('When reading the workspace packages', () => {
    it('Then lists every package, private ones included, with their scope forms', () => {
      const config = createMockConfig({ cwd, monorepo: { packages: ['packages/*', 'apps/*'] } })

      expect(getWorkspacePackages(config)).toEqual(expect.arrayContaining([
        { name: '@maz-ui/nuxt', path: 'packages/nuxt', scopes: ['nuxt', '@maz-ui/nuxt'] },
        { name: 'core', path: 'packages/core-lib', scopes: ['core', 'core-lib'] },
        { name: 'web-app', path: 'apps/web', scopes: ['web-app', 'web'] },
        { name: 'playground', path: 'apps/playground', scopes: ['playground'] },
      ]))
      expect(getWorkspacePackages(config)).toHaveLength(4)
    })

    it('Then adds the directories of commitlint.packages, e.g. apps that are never released', () => {
      const config = createMockConfig({ cwd, monorepo: { packages: ['packages/*'] }, commitlint: { packages: ['apps/*', 'packages/*'] } })

      expect(getWorkspacePackages(config).map(pkg => pkg.name).sort()).toEqual(['@maz-ui/nuxt', 'core', 'playground', 'web-app'])
    })

    it('Then accepts the packages without version and skips the directories without package name', () => {
      const config = createMockConfig({ cwd, monorepo: { packages: ['apps/*'] } })

      expect(getWorkspacePackages(config)).toEqual([
        { name: 'playground', path: 'apps/playground', scopes: ['playground'] },
        { name: 'web-app', path: 'apps/web', scopes: ['web-app', 'web'] },
      ])
    })

    it('Then reads commitlint.packages in standalone mode', () => {
      const config = createMockConfig({ cwd, commitlint: { packages: ['apps/*'] } })
      delete (config as Partial<typeof config>).monorepo

      expect(getWorkspacePackages(config).map(pkg => pkg.name)).toEqual(['playground', 'web-app'])
    })

    it('Then never lists the root package', () => {
      const config = createMockConfig({ cwd, monorepo: { packages: ['.', 'packages/*'] } })

      expect(getWorkspacePackages(config).map(pkg => pkg.name)).not.toContain('root')
    })

    it('Then keeps the ignored directories, released by another config', () => {
      const config = createMockConfig({ cwd, monorepo: { packages: ['packages/*'], ignored: ['packages/core-lib'] } })

      expect(getWorkspacePackages(config).map(pkg => pkg.name).sort()).toEqual(['@maz-ui/nuxt', 'core'])
    })

    it('Then adds the packages of pnpm-workspace.yaml, e.g. apps that are never released', () => {
      writeFileSync(join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n  - \'apps/*\'\n  - \'!apps/web\'\ncatalog:\n  vue: ^3.5.0\n')
      const config = createMockConfig({ cwd, monorepo: { packages: ['packages/*'] } })

      expect(getWorkspacePackages(config).map(pkg => pkg.name).sort()).toEqual(['@maz-ui/nuxt', 'core', 'playground'])
    })

    it('Then reads the members of a deno workspace, written with ./', () => {
      writeFileSync(join(cwd, 'deno.json'), '{ "workspace": ["./apps/web"] }')
      const config = createMockConfig({ cwd, monorepo: { packages: ['packages/*'] } })

      expect(getWorkspacePackages(config)).toEqual(expect.arrayContaining([{ name: 'web-app', path: 'apps/web', scopes: ['web-app', 'web'] }]))
    })

    it.each([
      ['an array', ['apps/*']],
      ['an object', { packages: ['apps/*'] }],
    ])('Then adds the workspaces of the package.json, as %s', (_, workspaces) => {
      writePackage('.', { name: 'root', private: true, workspaces })
      const config = createMockConfig({ cwd, monorepo: { packages: ['packages/*'] } })

      expect(getWorkspacePackages(config).map(pkg => pkg.name).sort()).toEqual(['@maz-ui/nuxt', 'core', 'playground', 'web-app'])
    })

    it.each([
      ['no workspace', {}, []],
      ['a pnpm-workspace.yaml without packages', { 'pnpm-workspace.yaml': 'catalog:\n  vue: ^3.5.0\n' }, []],
      ['an empty pnpm-workspace.yaml', { 'pnpm-workspace.yaml': '' }, []],
      ['an invalid pnpm-workspace.yaml', { 'pnpm-workspace.yaml': 'packages: [' }, []],
      ['the package.json and pnpm-workspace.yaml', { 'pnpm-workspace.yaml': 'packages: [packages/*]', 'package.json': '{ "workspaces": ["apps/*", "packages/*"] }' }, ['apps/*', 'packages/*']],
      ['an invalid package.json', { 'package.json': '{' }, []],
      ['lerna.json', { 'lerna.json': '{ "packages": ["libs/*"] }' }, ['libs/*']],
      ['rush.json', { 'rush.json': '// Rush config\n{ "projects": [{ "packageName": "web", "projectFolder": "apps/web" }, {}] }' }, ['apps/web']],
      ['deno.json', { 'deno.json': '{ "workspace": ["./add", "./subtract"] }' }, ['./add', './subtract']],
      ['deno.jsonc', { 'deno.jsonc': '{\n  // Members\n  "workspace": ["./add"],\n}' }, ['./add']],
    ])('Then reads the workspace of the package manager with %s', (_, files, expected) => {
      for (const [name, content] of Object.entries(files)) {
        writeFileSync(join(cwd, name), content)
      }

      expect(getPackageManagerWorkspaces(cwd)).toEqual(expected)
    })

    it('Then returns no package in standalone mode', () => {
      const config = createMockConfig({ cwd })
      delete (config as Partial<typeof config>).monorepo

      expect(getWorkspacePackages(config)).toEqual([])
    })
  })

  describe('When computing the allowed scopes', () => {
    it('Then allows the package forms, the scopeMap keys and the explicit scopes', () => {
      const config = createMockConfig({ cwd, monorepo: { packages: ['packages/*'] }, scopeMap: { ui: 'nuxt' }, commitlint: { scopes: ['ci', 'deps'] } })
      const packages = getWorkspacePackages(config)

      expect(getAllowedScopes(config, packages)?.sort()).toEqual(['@maz-ui/nuxt', 'ci', 'core', 'core-lib', 'deps', 'nuxt', 'ui'].sort())
    })

    it('Then allows any scope without package nor explicit list', () => {
      expect(getAllowedScopes(createMockConfig({ cwd }), [])).toBeUndefined()
    })

    it('Then restricts the scopes to the explicit list in standalone mode', () => {
      expect(getAllowedScopes(createMockConfig({ cwd, commitlint: { scopes: ['api'] } }), [])).toEqual(['api'])
    })
  })

  describe('When matching files and scopes to packages', () => {
    const packages = [
      { name: '@maz-ui/nuxt', path: 'packages/nuxt', scopes: ['nuxt', '@maz-ui/nuxt'] },
      { name: 'core', path: 'packages/core', scopes: ['core'] },
    ]

    it('Then returns the packages containing the files', () => {
      expect(getPackagesOfFiles(['packages/nuxt/src/index.ts', 'README.md'], packages)).toEqual(['@maz-ui/nuxt'])
    })

    it('Then does not confuse a package with a sibling sharing its prefix', () => {
      expect(getPackagesOfFiles(['packages/nuxt-extra/index.ts', 'packages/core'], packages)).toEqual(['core'])
    })

    it('Then finds the package designated by any of its scopes', () => {
      expect(findPackageByScope('@maz-ui/nuxt', packages)?.path).toBe('packages/nuxt')
      expect(findPackageByScope('ci', packages)).toBeUndefined()
    })
  })
})
