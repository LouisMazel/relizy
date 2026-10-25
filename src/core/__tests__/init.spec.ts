import type { InitAnswers, ProjectDetection } from '../init'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import {
  buildInitConfig,
  detectProject,
  getDefaultAnswers,
  getDetectedPublishConfig,
  getInstallCommand,
  getMissingRootFields,
  getScriptsToAdd,
  isPublicNpmRegistry,
  renderConfigFile,
  suggestGoal,
  suggestPatterns,
  suggestVersionMode,
  updateRootPackageJson,
} from '../init'

describe('Given the init helpers', () => {
  let cwd: string

  function write(path: string, content: string) {
    mkdirSync(join(cwd, path, '..'), { recursive: true })
    writeFileSync(join(cwd, path), content)
  }

  function writePackage(path: string, content: Record<string, unknown>) {
    write(join(path, 'package.json'), JSON.stringify(content, null, 2))
  }

  function createMonorepo() {
    writePackage('.', { name: 'mono', private: true, packageManager: 'pnpm@9.0.0', scripts: { build: 'turbo build' } })
    write('pnpm-workspace.yaml', 'packages:\n  - packages/*\n  - apps/*\n  - tools/*\n  - \'!**/fixtures/**\'\n')
    writePackage('packages/core', { name: '@acme/core', version: '1.2.0', publishConfig: { access: 'public' } })
    writePackage('packages/ui', { name: '@acme/ui', version: '1.2.0', publishConfig: { access: 'public' } })
    writePackage('packages/docs', { name: '@acme/docs', private: true })
    writePackage('packages/fixtures', { name: 'fixtures', version: '1.0.0' })
    writePackage('apps/web', { name: 'web', private: true })
    writePackage('tools/cfg', { name: '@acme/cfg', version: '0.1.0', private: true })
  }

  function answers(detection: ProjectDetection, overrides: Partial<InitAnswers> = {}): InitAnswers {
    const goal = overrides.goal ?? suggestGoal(detection)
    const patterns = overrides.patterns ?? suggestPatterns(detection, goal)
    return { ...getDefaultAnswers(detection, { goal, patterns }), ...overrides }
  }

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'relizy-init-'))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  describe('When detecting a monorepo', () => {
    it('Then reads the workspace packages, the package manager and the scripts', () => {
      createMonorepo()

      const detection = detectProject({ cwd })

      expect(detection.packageManager).toBe('pnpm')
      expect(detection.workspaceFiles).toEqual(['pnpm-workspace.yaml'])
      expect(detection.provider).toBeNull()
      expect(detection.root).toEqual(expect.objectContaining({ name: 'mono', version: undefined, private: true, hasRelizy: false }))
      expect(detection.workspaces).toEqual([
        {
          pattern: 'packages/*',
          packages: [
            { name: '@acme/core', path: 'packages/core', version: '1.2.0', private: false, access: 'public', registry: undefined },
            { name: '@acme/docs', path: 'packages/docs', version: undefined, private: true, access: undefined, registry: undefined },
            { name: '@acme/ui', path: 'packages/ui', version: '1.2.0', private: false, access: 'public', registry: undefined },
          ],
        },
        { pattern: 'apps/*', packages: [expect.objectContaining({ name: 'web', version: undefined })] },
        { pattern: 'tools/*', packages: [expect.objectContaining({ name: '@acme/cfg', version: '0.1.0', private: true })] },
      ])
    })

    it('Then suggests publishing the folders with publishable packages, in selective mode', () => {
      createMonorepo()
      const detection = detectProject({ cwd })

      expect(suggestGoal(detection)).toBe('publish')
      expect(suggestPatterns(detection, 'publish')).toEqual(['packages/*'])
      expect(suggestPatterns(detection, 'version')).toEqual(['packages/*', 'tools/*'])
      expect(answers(detection).versionMode).toBe('selective')
    })

    it('Then builds a minimal config ignoring the packages without version', () => {
      createMonorepo()
      const detection = detectProject({ cwd })

      expect(buildInitConfig(detection, answers(detection))).toEqual({
        monorepo: { versionMode: 'selective', packages: ['packages/*'], ignored: ['packages/docs'] },
        publish: { buildCmd: 'pnpm run build' },
        release: { providerRelease: false, prComment: false },
      })
      expect(getDetectedPublishConfig(detection, { goal: 'publish', patterns: ['packages/*'] })).toEqual({ access: 'public', registry: undefined })
    })

    it('Then includes the private packages when only versioning', () => {
      createMonorepo()
      const detection = detectProject({ cwd })

      const config = buildInitConfig(detection, answers(detection, { goal: 'version', patterns: ['tools/*'] }))

      expect(config.monorepo).toEqual({ versionMode: 'selective', packages: ['tools/*'], includePrivates: true })
      expect(config.release).toEqual(expect.objectContaining({ publish: false }))
      expect(config.publish).toBeUndefined()
    })

    it('Then adds the root version from the highest package version', () => {
      createMonorepo()
      writePackage('packages/ui', { name: '@acme/ui', version: '1.10.0' })
      const detection = detectProject({ cwd })

      expect(getMissingRootFields(detection, answers(detection, { versionMode: 'selective' }))).toEqual({ version: '1.10.0' })
      expect(getMissingRootFields(detection, answers(detection, { versionMode: 'independent' }))).toEqual({ version: '0.0.0' })
    })

    it('Then installs relizy at the root of the pnpm workspace', () => {
      createMonorepo()

      expect(getInstallCommand(detectProject({ cwd }))).toBe('pnpm add -D -w relizy')
    })
  })

  describe('When detecting a standalone package', () => {
    it('Then suggests publishing a public package and versioning a private one', () => {
      writePackage('.', { name: 'lib', version: '0.3.0', devDependencies: { relizy: '^1.0.0' } })
      const detection = detectProject({ cwd })

      expect(detection.workspaces).toEqual([])
      expect(detection.root.hasRelizy).toBe(true)
      expect(suggestGoal(detection)).toBe('publish')
      expect(suggestPatterns(detection, 'publish')).toEqual([])

      writePackage('.', { name: 'app', private: true })
      expect(suggestGoal(detectProject({ cwd }))).toBe('version')
    })

    it('Then builds an empty config with the defaults', () => {
      writePackage('.', { name: 'lib', version: '1.0.0' })
      const detection = { ...detectProject({ cwd }), provider: 'github' as const }

      expect(buildInitConfig(detection, answers(detection))).toEqual({})
    })

    it('Then completes the missing name and version', () => {
      writePackage('.', { private: true })

      expect(getMissingRootFields(detectProject({ cwd }), answers(detectProject({ cwd })))).toEqual({ name: basename(cwd), version: '0.0.0' })
    })

    it('Then treats a workspace without versioned packages as a standalone project', () => {
      writePackage('.', { name: 'site', version: '1.0.0', workspaces: ['apps/*'] })
      writePackage('apps/web', { name: 'web', private: true })
      const detection = detectProject({ cwd })

      expect(suggestPatterns(detection, 'publish')).toEqual([])
      expect(buildInitConfig(detection, answers(detection)).monorepo).toBeUndefined()
    })
  })

  describe('When detecting an existing config', () => {
    it('Then finds a config file of any format, or the relizy key of the package.json', () => {
      writePackage('.', { name: 'lib', version: '1.0.0', relizy: { types: {} } })
      expect(detectProject({ cwd }).existingConfigFile).toBe('package.json')
      expect(detectProject({ cwd, configName: 'relizy.other' }).existingConfigFile).toBeUndefined()

      write('relizy.config.mjs', 'export default {}')
      expect(detectProject({ cwd }).existingConfigFile).toBe('relizy.config.mjs')
    })

    it('Then throws without package.json', () => {
      expect(() => detectProject({ cwd })).toThrow('No package.json found')
    })
  })

  describe('When building the advanced options', () => {
    it('Then writes only the values differing from the defaults', () => {
      createMonorepo()
      const detection = { ...detectProject({ cwd }), provider: 'gitlab' as const }

      const config = buildInitConfig(detection, answers(detection, {
        versionMode: 'independent',
        dependencyTypes: ['dependencies', 'peerDependencies'],
        capZeroMajor: false,
        rootChangelog: false,
        hiddenTypes: ['chore', 'ci'],
        formatCmd: 'pnpm lint:fix',
        access: 'restricted',
        registry: 'https://npm.acme.dev/',
        buildCmd: undefined,
        twitter: true,
        slack: true,
        slackChannel: '#releases',
        changelogUrl: 'https://acme.dev/changelog',
        prCommentMode: 'update',
        ai: ['providerRelease', 'slack'],
        aiLanguage: 'fr',
      }))

      expect(config).toEqual({
        monorepo: { versionMode: 'independent', packages: ['packages/*'], ignored: ['packages/docs'] },
        types: { chore: false, ci: false },
        bump: { dependencyTypes: ['dependencies', 'peerDependencies'], capZeroMajor: false },
        changelog: { rootChangelog: false, formatCmd: 'pnpm lint:fix' },
        publish: { access: 'restricted', registry: 'https://npm.acme.dev/' },
        social: { twitter: { enabled: true }, slack: { enabled: true, channel: '#releases' }, changelogUrl: 'https://acme.dev/changelog' },
        prComment: { mode: 'update' },
        ai: { language: 'fr', providerRelease: { enabled: true }, social: { slack: { enabled: true } } },
      })
    })

    it('Then skips the public npm registry and the default AI language', () => {
      writePackage('.', { name: 'lib', version: '1.0.0' })
      const detection = { ...detectProject({ cwd }), provider: 'github' as const }

      expect(buildInitConfig(detection, answers(detection, { registry: 'https://registry.npmjs.org/', ai: ['twitter'], twitter: true }))).toEqual({
        social: { twitter: { enabled: true } },
        ai: { social: { twitter: { enabled: true } } },
      })
      expect(isPublicNpmRegistry('https://registry.npmjs.org')).toBe(true)
    })
  })

  describe('When suggesting the version mode', () => {
    it('Then picks independent for packages on different versions', () => {
      expect(suggestVersionMode([{ name: 'a', path: 'a', version: '1.0.0', private: false }, { name: 'b', path: 'b', version: '2.0.0', private: false }])).toBe('independent')
      expect(suggestVersionMode([{ name: 'a', path: 'a', version: '1.0.0', private: false }])).toBe('selective')
    })
  })

  describe('When updating the root package.json', () => {
    it('Then adds the fields first and the scripts, keeping the indentation', () => {
      write('package.json', '{\n    "private": true,\n    "scripts": { "build": "tsc" }\n}\n')

      updateRootPackageJson({ cwd, fields: { name: 'lib', version: '0.0.0' }, scripts: getScriptsToAdd(detectProject({ cwd })) })

      expect(readFileSync(join(cwd, 'package.json'), 'utf8')).toBe([
        '{',
        '    "name": "lib",',
        '    "version": "0.0.0",',
        '    "private": true,',
        '    "scripts": {',
        '        "build": "tsc",',
        '        "release": "relizy release"',
        '    }',
        '}',
        '',
      ].join('\n'))
      expect(getScriptsToAdd(detectProject({ cwd }))).toEqual({})
    })
  })

  describe('When installing relizy', () => {
    it('Then uses the package manager of the project', () => {
      writePackage('.', { name: 'lib', version: '1.0.0' })
      const detection = detectProject({ cwd })

      expect(getInstallCommand({ ...detection, packageManager: 'npm' })).toBe('npm install -D relizy')
      expect(getInstallCommand({ ...detection, packageManager: 'yarn' })).toBe('yarn add -D relizy')
      expect(getInstallCommand({ ...detection, packageManager: 'bun' })).toBe('bun add -d relizy')
      expect(getInstallCommand({ ...detection, packageManager: 'pnpm' })).toBe('pnpm add -D relizy')
    })
  })

  describe('When rendering the config file', () => {
    it('Then writes TypeScript with defineConfig', () => {
      expect(renderConfigFile({})).toBe([
        `import { defineConfig } from 'relizy'`,
        '',
        '// All the options: https://relizy.dev/config/overview',
        'export default defineConfig({})',
        '',
      ].join('\n'))
    })

    it('Then quotes the strings and the keys that are not identifiers, and wraps the long arrays', () => {
      const content = renderConfigFile({
        monorepo: { versionMode: 'selective', packages: ['packages/*', 'apps/very-long-application-name/*', 'tools/another-long-folder/*'] },
        ai: { providers: { 'claude-code': { model: 'it\'s' } } },
        bump: { capZeroMajor: false },
      })

      expect(content).toContain([
        'export default defineConfig({',
        '  monorepo: {',
        '    versionMode: \'selective\',',
        '    packages: [',
        '      \'packages/*\',',
        '      \'apps/very-long-application-name/*\',',
        '      \'tools/another-long-folder/*\',',
        '    ],',
        '  },',
        '  ai: {',
        '    providers: {',
        '      \'claude-code\': {',
        '        model: \'it\\\'s\',',
        '      },',
        '    },',
        '  },',
        '  bump: {',
        '    capZeroMajor: false,',
        '  },',
        '})',
      ].join('\n'))
    })
  })
})
