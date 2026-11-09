import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMockConfig } from '../../../tests/mocks'
import { getWorkspacePackages } from '../commitlint'

describe('Given the workspace packages read from the config', () => {
  let cwd: string

  function writePackage(path: string, content: Record<string, unknown>) {
    mkdirSync(join(cwd, path), { recursive: true })
    writeFileSync(join(cwd, path, 'package.json'), JSON.stringify(content))
  }

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'relizy-commitlint-config-packages-'))
    writePackage('.', { name: 'root', version: '1.0.0', private: true })
    writePackage('packages/nuxt', { name: '@maz-ui/nuxt', version: '1.0.0' })
    writePackage('packages/core-lib', { name: 'core', version: '1.0.0' })
    writePackage('apps/web', { name: 'web-app', version: '1.0.0', private: true })
    writePackage('apps/playground', { name: 'playground', private: true })
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('When monorepo.packages is set, Then lists those packages, private ones included', () => {
    const config = createMockConfig({
      cwd,
      monorepo: {
        packages: ['packages/*', 'apps/*'],
      },
    })

    expect(getWorkspacePackages(config).map(pkg => pkg.name).sort()).toEqual([
      '@maz-ui/nuxt',
      'core',
      'playground',
      'web-app',
    ])
  })

  it('When commitlint.packages is set, Then adds those directories, e.g. apps that are never released', () => {
    const config = createMockConfig({
      cwd,
      monorepo: {
        packages: ['packages/*'],
      },
      commitlint: {
        packages: ['apps/*', 'packages/*'],
      },
    })

    expect(getWorkspacePackages(config).map(pkg => pkg.name).sort()).toEqual([
      '@maz-ui/nuxt',
      'core',
      'playground',
      'web-app',
    ])
  })

  it('When the config has version groups, Then reads the packages of the groups', () => {
    const config = createMockConfig({
      cwd,
      monorepo: {
        groups: [
          {
            name: 'libs',
            versionMode: 'selective',
            packages: ['packages/*'],
          },
        ],
      },
    })
    delete config.monorepo!.packages

    expect(getWorkspacePackages(config).map(pkg => pkg.name).sort()).toEqual(['@maz-ui/nuxt', 'core'])
  })

  it('When the config is standalone, Then reads commitlint.packages only', () => {
    const config = createMockConfig({
      cwd,
      commitlint: {
        packages: ['apps/*'],
      },
    })
    delete (config as Partial<typeof config>).monorepo

    expect(getWorkspacePackages(config).map(pkg => pkg.name)).toEqual(['playground', 'web-app'])
  })

  it('When the config is standalone without commitlint.packages, Then returns no package', () => {
    const config = createMockConfig({ cwd })
    delete (config as Partial<typeof config>).monorepo

    expect(getWorkspacePackages(config)).toEqual([])
  })

  it('When a package is ignored, Then keeps its directory, released by another config', () => {
    const config = createMockConfig({
      cwd,
      monorepo: {
        packages: ['packages/*'],
        ignored: ['packages/core-lib'],
      },
    })

    expect(getWorkspacePackages(config).map(pkg => pkg.name).sort()).toEqual(['@maz-ui/nuxt', 'core'])
  })
})
