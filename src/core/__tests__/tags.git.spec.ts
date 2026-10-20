import type { ResolvedRelizyConfig } from '../config'
import type { Step } from '../tags'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { logger } from '@maz-ui/node'
import { createMockConfig, createMockPackageInfo } from '../../../tests/mocks'
import { getFirstCommit } from '../git'
import { NEW_PACKAGE_MARKER, resolveTags } from '../tags'

// The setup file mocks execPromise: these tests run the real git commands against a temporary repository
vi.mock('@maz-ui/node', importActual => importActual())

/**
 * Integration tests of the range resolution against a real git repository
 * where a selective (or unified) release and an independent release share the
 * repository, as with two configs:
 * - `relizy.config.ts`: selective, tags `v{{newVersion}}`, ignores `shared-components/navigation`
 * - `relizy-independent.config.ts`: independent, only `shared-components/navigation`, tags `@scope/navigation@x.y.z`
 */
describe('Given resolveTags function on a real git repository', () => {
  let cwd: string
  let clock: number

  function git(...args: string[]) {
    // Each commit and tag gets its own date, as in a real history
    const date = `${1_700_000_000 + clock} +0000`

    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    }).trim()
  }

  function commit(message: string) {
    clock++
    git('commit', '--allow-empty', '--no-verify', '-m', message)
  }

  /** Annotated tags on HEAD, as created by relizy, in a single `git fast-import` to stay fast */
  function tag(...names: string[]) {
    const head = git('rev-parse', 'HEAD')
    const stream = names.map((name) => {
      clock++
      return `tag ${name}\nfrom ${head}\ntagger Relizy <relizy@example.com> ${1_700_000_000 + clock} +0000\ndata ${Buffer.byteLength(name)}\n${name}\n`
    }).join('')

    execFileSync('git', ['fast-import', '--quiet'], { cwd, input: stream })
  }

  /** Version of the root package.json, read for the sub-packages in unified and selective modes */
  function writeRootVersion(version: string) {
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'root', version }))
  }

  function createConfig(versionMode: 'unified' | 'selective' | 'independent', tagBody?: string): ResolvedRelizyConfig {
    const config = createMockConfig({ bump: { type: 'release' }, monorepo: { versionMode } })
    config.cwd = cwd
    config.logLevel = 'silent'

    if (tagBody) {
      config.templates = { ...config.templates, tagBody }
    }

    return config
  }

  async function resolveFrom({
    config,
    version,
    newVersion,
    name = 'root',
    path = cwd,
    step = newVersion ? 'changelog' : 'bump',
  }: {
    config: ResolvedRelizyConfig
    version: string
    newVersion?: string
    name?: string
    path?: string
    step?: Step
  }) {
    const pkg = createMockPackageInfo({ name, version, path })
    const { from } = await resolveTags({ config, step, pkg, newVersion: newVersion as any })

    return from
  }

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'relizy-tags-'))
    mkdirSync(join(cwd, 'packages'))
    clock = 0
    git('init', '-q')
    git('config', 'user.name', 'Relizy')
    git('config', 'user.email', 'relizy@example.com')
    git('config', 'commit.gpgSign', 'false')
    git('config', 'tag.gpgSign', 'false')
    commit('chore: init')
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  describe('When selective and independent releases alternate in the same repository', () => {
    beforeEach(() => {
      tag('v6.17.0')
      commit('feat(navigation): a')
      tag('@scope/navigation@0.3.0')
      commit('feat(core): b')
      tag('v6.18.0')
      commit('feat(navigation)!: c')
      tag('@scope/navigation@1.0.0')
      commit('feat(core): d')
      writeRootVersion('6.18.0')
    })

    it('Then the selective release starts at its last repository tag in every step', async () => {
      const config = createConfig('selective')

      for (const step of ['bump', 'changelog', 'publish', 'provider-release', 'social'] as const) {
        expect(await resolveFrom({ config, version: '6.18.0', newVersion: step === 'bump' ? undefined : '6.19.0', step })).toBe('v6.18.0')
      }
    })

    it('Then the steps after the bump start at the last repository tag once the new version is written', async () => {
      // `relizy release` writes 6.19.0 in the package.json files, then generates the changelogs before tagging
      writeRootVersion('6.19.0')

      expect(await resolveFrom({ config: createConfig('selective'), version: '6.19.0', newVersion: '6.19.0' })).toBe('v6.18.0')
    })

    it('Then the changelog previewed without bump starts at the tag of the current version', async () => {
      // `relizy changelog` alone: the version on disk is the last released one
      expect(await resolveFrom({ config: createConfig('selective'), version: '6.18.0', newVersion: '6.18.0' })).toBe('v6.18.0')
    })

    it('Then a sub-package starts at the last repository tag, even when it was not bumped since an older release', async () => {
      const config = createConfig('selective')

      for (const version of ['6.18.0', '6.10.0']) {
        expect(await resolveFrom({ config, version, name: '@scope/core', path: join(cwd, 'packages/core') })).toBe('v6.18.0')
      }
    })

    it('Then the unified release ignores the package tags too', async () => {
      expect(await resolveFrom({ config: createConfig('unified'), version: '6.18.0' })).toBe('v6.18.0')
    })

    it('Then the independent release starts at the last tag of its package in every step', async () => {
      const config = createConfig('independent')
      const navigation = { name: '@scope/navigation', path: join(cwd, 'packages/navigation') }

      for (const step of ['bump', 'changelog', 'publish', 'provider-release', 'social'] as const) {
        expect(await resolveFrom({ config, ...navigation, version: '1.0.0', newVersion: step === 'bump' ? undefined : '1.1.0', step })).toBe('@scope/navigation@1.0.0')
      }
    })

    it('Then the independent release ignores the tags of a package whose name starts the same', async () => {
      tag('@scope/navigation-utils@2.0.0', '@scope/navigation@utils@2.0.0')

      const config = createConfig('independent')

      expect(await resolveFrom({ config, name: '@scope/navigation', path: join(cwd, 'packages/navigation'), version: '1.0.0' })).toBe('@scope/navigation@1.0.0')
    })

    it('Then the selective release ignores the tags of many packages released since', async () => {
      tag(...Array.from({ length: 60 }, (_, index) => [`@scope/package-${index}@1.0.${index}`, `vue-package-${index}@1.0.${index}`]).flat())

      expect(await resolveFrom({ config: createConfig('selective'), version: '6.18.0' })).toBe('v6.18.0')
    })

    it('Then the selective release ignores an unscoped package tag matching `v*`', async () => {
      tag('vue-utils@1.0.0', 'v-next@2.0.0')

      expect(await resolveFrom({ config: createConfig('selective'), version: '6.18.0' })).toBe('v6.18.0')
    })
  })

  describe('When a tag is created later on another branch', () => {
    it('Then ignores the hotfix of an older version', async () => {
      tag('v6.17.0')
      commit('feat: a')
      tag('v6.18.0')
      commit('feat: b')
      // v6.17.1 is released from a maintenance branch after v6.18.0
      git('checkout', '-q', '-b', 'maintenance', 'v6.17.0')
      commit('fix: hotfix')
      tag('v6.17.1')
      git('checkout', '-q', '-')

      expect(await resolveFrom({ config: createConfig('selective'), version: '6.18.0' })).toBe('v6.18.0')
    })

    it('Then ignores a release above the current version', async () => {
      tag('v6.18.0')
      git('checkout', '-q', '-b', 'next')
      commit('feat: next')
      tag('v6.19.0')
      git('checkout', '-q', '-')
      commit('feat: main')

      expect(await resolveFrom({ config: createConfig('selective'), version: '6.18.0' })).toBe('v6.18.0')
    })
  })

  describe('When releasing prereleases', () => {
    beforeEach(() => {
      tag('v6.18.0')
      commit('feat!: a')
      tag('v7.0.0-beta.0')
      commit('feat: b')
      tag('@scope/navigation@1.0.0', 'v7.0.0-beta.1')
      commit('feat: c')
    })

    it('Then a prerelease starts at the previous prerelease', async () => {
      expect(await resolveFrom({ config: createConfig('selective'), version: '7.0.0-beta.1', newVersion: '7.0.0-beta.2' })).toBe('v7.0.0-beta.1')
    })

    it('Then the graduation starts at the last stable release, not a more recent stable package tag', async () => {
      expect(await resolveFrom({ config: createConfig('selective'), version: '7.0.0-beta.1', newVersion: '7.0.0' })).toBe('v6.18.0')
    })

    it('Then a stable release ignores the prereleases of the next major', async () => {
      expect(await resolveFrom({ config: createConfig('selective'), version: '6.18.0' })).toBe('v6.18.0')
    })
  })

  describe('When only prerelease tags exist (failed tag push of the stable release)', () => {
    it('Then falls back to the last prerelease repository tag', async () => {
      tag('v1.0.0-beta.0')
      commit('feat: a')
      tag('v1.0.0-beta.1')
      commit('feat: b')
      tag('@scope/navigation@0.5.0')

      expect(await resolveFrom({ config: createConfig('unified'), version: '1.0.0', newVersion: '1.0.1' })).toBe('v1.0.0-beta.1')
    })
  })

  describe('When the tag template is changed', () => {
    it('Then the first release after the change starts at the last tag of the default template', async () => {
      tag('v6.17.0')
      commit('feat: a')
      tag('v6.18.0')
      commit('feat: b')
      tag('@scope/navigation@1.0.0')

      expect(await resolveFrom({ config: createConfig('selective', 'release-{{newVersion}}'), version: '6.18.0' })).toBe('v6.18.0')
    })

    it('Then the next release starts at the tag of the new template', async () => {
      tag('v6.18.0')
      commit('feat: a')
      tag('release-6.19.0')
      commit('feat: b')

      expect(await resolveFrom({ config: createConfig('selective', 'release-{{newVersion}}'), version: '6.19.0' })).toBe('release-6.19.0')
    })

    it('Then the graduation starts at the last stable release of the default template', async () => {
      tag('v6.18.0')
      commit('feat!: a')
      tag('release-7.0.0-beta.0')
      commit('feat: b')

      expect(await resolveFrom({ config: createConfig('selective', 'release-{{newVersion}}'), version: '7.0.0-beta.0', newVersion: '7.0.0' })).toBe('v6.18.0')
    })

    it('Then prefers the tag of the template for the same version', async () => {
      tag('6.18.0', 'v6.18.0', 'release/6.18.0-final')

      expect(await resolveFrom({ config: createConfig('selective', 'release/{{newVersion}}-final'), version: '6.18.0' })).toBe('release/6.18.0-final')
    })

    it('Then warns when the previous tags follow another custom template', async () => {
      const warn = vi.spyOn(logger, 'warn')
      tag('release-6.17.0')
      commit('feat: a')
      tag('release-6.18.0')
      commit('feat: b')

      const config = createConfig('selective')
      config.templates = { ...config.templates, tagBody: 'version-{{newVersion}}' }

      expect(await resolveFrom({ config, version: '6.18.0' })).toBe(getFirstCommit(cwd))
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('release-6.18.0'))
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('--from'))
    })
  })

  describe('When the repository has no repository tag but package tags', () => {
    beforeEach(() => {
      commit('feat: a')
      tag('@scope/navigation@1.0.0', 'vue-utils@1.0.0')
    })

    it('Then starts from the first commit for the root package', async () => {
      expect(await resolveFrom({ config: createConfig('selective'), version: '1.0.0' })).toBe(getFirstCommit(cwd))
    })

    it('Then marks a sub-package as new', async () => {
      expect(await resolveFrom({ config: createConfig('selective'), version: '1.0.0', name: '@scope/core', path: join(cwd, 'packages/core') })).toBe(NEW_PACKAGE_MARKER)
    })
  })

  describe('When a new sub-package is added at 0.0.0', () => {
    it('Then marks it as new', async () => {
      tag('v6.18.0')
      commit('feat: new package')
      writeRootVersion('6.18.0')

      expect(await resolveFrom({ config: createConfig('selective'), version: '0.0.0', name: '@scope/new', path: join(cwd, 'packages/new') })).toBe(NEW_PACKAGE_MARKER)
    })
  })
})
