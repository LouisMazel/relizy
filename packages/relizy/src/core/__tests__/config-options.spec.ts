import type { ConfigOptionNode } from '../config-options'
import { describe, expect, it, vi } from 'vitest'
import { getDefaultConfig } from '../config'
import { getConfigOptions } from '../config-options'

vi.mock('../config', async importActual => ({
  ...await importActual<typeof import('../config')>(),
  getDefaultConfig: vi.fn((await importActual<typeof import('../config')>()).getDefaultConfig),
}))

function find(nodes: ConfigOptionNode[], path: string): ConfigOptionNode | undefined {
  for (const node of nodes) {
    if (node.path === path) {
      return node
    }

    const found = find(node.children, path)

    if (found) {
      return found
    }
  }

  return undefined
}

describe('Given the catalog of the config options', () => {
  describe('When reading the options', () => {
    it('Then gives the top-level options with their nested options', async () => {
      const options = await getConfigOptions()

      expect(options.map(option => option.path)).toEqual(expect.arrayContaining([
        'bump',
        'publish',
        'release',
        'monorepo',
        'profiles',
        'hooks',
      ]))
      expect(find(options, 'bump')!.children.map(option => option.path)).toEqual(expect.arrayContaining(['bump.type', 'bump.preid', 'bump.suffix']))
    })

    it('Then gives the type, the default, the values and the description of an option', async () => {
      const options = await getConfigOptions()
      const type = find(options, 'bump.type')!
      const versionMode = find(options, 'monorepo.versionMode')!
      const clean = find(options, 'bump.clean')!

      expect(type).toMatchObject({
        key: 'type',
        default: 'release',
        docId: 'config/bump',
        docUrl: 'https://relizy.dev/config/bump',
      })
      expect(type.values).toEqual(expect.arrayContaining(['prerelease']))
      expect(type.summary).not.toContain('\n')
      expect(clean).toMatchObject({ type: 'boolean', default: true })
      expect(versionMode.values).toHaveLength(3)
      expect(versionMode.values).toEqual(expect.arrayContaining(['unified', 'independent', 'selective']))
    })

    it('Then nests the items of an array under it', async () => {
      const groups = find(await getConfigOptions(), 'monorepo.groups')!

      expect(groups.children.map(option => option.path)).toContain('monorepo.groups[].name')
      expect(find(groups.children, 'monorepo.groups[].name')!.key).toBe('name')
    })

    it('Then gives no default to what depends on the project or the environment', async () => {
      const options = await getConfigOptions()

      expect(find(options, 'cwd')).not.toHaveProperty('default')
      expect(find(options, 'tokens')).not.toHaveProperty('default')
      expect(find(options, 'publish.packageManager')).not.toHaveProperty('default')
    })

    it('Then keeps the defaults of the docs when there is no runtime one', async () => {
      expect(find(await getConfigOptions(), 'release.canary')).toMatchObject({ type: 'boolean', default: false })
    })
  })

  describe('When reading the options of the profiles', () => {
    it('Then a profile has a description and the options of the sections it can set', async () => {
      const options = await getConfigOptions()
      const profile = find(options, 'profiles.*')!

      expect(profile.children.map(option => option.path)).toEqual(expect.arrayContaining([
        'profiles.*.description',
        'profiles.*.bump',
        'profiles.*.publish',
        'profiles.*.release',
      ]))
      expect(find(options, 'profiles.*.bump.preid')).toMatchObject({ key: 'preid', type: 'string' })
      expect(find(options, 'profiles.*.release.canary')).toMatchObject({ type: 'boolean' })
      expect(profile.children.map(option => option.path)).not.toContain('profiles.*.monorepo')
    })

    it('Then leaves the options of the sections as they are', async () => {
      const options = await getConfigOptions()

      expect(find(options, 'bump.preid')!.path).toBe('bump.preid')
    })
  })

  describe('When a default holds a secret (read from the environment)', () => {
    it('Then it is masked', async () => {
      const { getDefaultConfig: actual } = await vi.importActual<typeof import('../config')>('../config')
      const defaults = actual()
      vi.mocked(getDefaultConfig).mockReturnValueOnce({
        ...defaults,
        social: {
          ...defaults.social,
          slack: { ...defaults.social?.slack, webhookUrl: 'https://hooks.slack.com/services/T0000/B0000/abcdefghijklmnopqrstuvwx' },
        },
      } as ReturnType<typeof getDefaultConfig>)

      const webhook = find(await getConfigOptions(), 'social.slack.webhookUrl')!

      expect(webhook.default).toBeDefined()
      expect(String(webhook.default)).not.toContain('abcdefghijklmnopqrstuvwx')
    })
  })
})
