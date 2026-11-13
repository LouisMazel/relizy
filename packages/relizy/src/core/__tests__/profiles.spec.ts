import type { RelizyConfig } from '../../types'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { logger } from '@maz-ui/node'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadRelizyConfig } from '../config'
import { extractConfigReference } from '../mcp/knowledge/generate'
import { createCoreResolver } from '../mcp/knowledge/source'
import { getProfile, getProfileOptions, listProfiles, PROFILE_OPTIONS, UnknownProfileError, validateProfiles } from '../profiles'

const profiles: NonNullable<RelizyConfig['profiles']> = {
  beta: {
    description: 'Prerelease for testers',
    bump: { type: 'prerelease', preid: 'beta' },
    publish: { tag: 'beta' },
  },
  canary: {
    release: { canary: true },
  },
  latest: {
    publish: { tag: 'latest', access: 'public' },
    release: { social: false },
  },
}

describe('Given the profiles of a config', () => {
  describe('When listing them', () => {
    it('Then gives their name, description and what they change', () => {
      const [beta, canary, latest] = listProfiles({ profiles })

      expect(beta).toEqual({
        name: 'beta',
        description: 'Prerelease for testers',
        canary: false,
        options: {
          bump: { type: 'prerelease', preid: 'beta' },
          publish: { tag: 'beta' },
        },
        settings: [
          { path: 'bump.type', value: 'prerelease' },
          { path: 'bump.preid', value: 'beta' },
          { path: 'publish.tag', value: 'beta' },
        ],
      })
      expect(canary).toMatchObject({
        name: 'canary',
        canary: true,
        settings: [
          { path: 'release.canary', value: true },
        ],
      })
      expect(canary).not.toHaveProperty('description')
      expect(latest!.settings.map(setting => setting.path)).toEqual(['publish.tag', 'publish.access', 'release.social'])
    })

    it('Then gives nothing without profiles', () => {
      expect(listProfiles({})).toEqual([])
    })

    it('Then masks the secrets the profiles set, in the options and the settings', () => {
      const [announced] = listProfiles({
        profiles: {
          announced: {
            social: {
              slack: {
                enabled: true,
                credentials: { token: 'xoxb-1234567890-abcdefghijkl' },
              },
              twitter: {
                enabled: true,
                credentials: {
                  apiKey: 'twitter-api-key-0001',
                  apiKeySecret: 'twitter-api-secret-0002',
                  accessToken: 'twitter-access-token-0003',
                  accessTokenSecret: 'twitter-access-secret-0004',
                },
              },
            },
            ai: {
              providers: {
                'claude-code': { apiKey: 'sk-ant-api03-abcdefghijklmnop', oauthToken: 'sk-ant-oat01-abcdefghijklmnop' },
              },
            },
          },
        },
      })
      const serialized = JSON.stringify(announced)

      for (const secret of [
        'xoxb-1234567890-abcdefghijkl',
        'twitter-api-key-0001',
        'twitter-api-secret-0002',
        'twitter-access-token-0003',
        'twitter-access-secret-0004',
        'sk-ant-api03-abcdefghijklmnop',
        'sk-ant-oat01-abcdefghijklmnop',
      ]) {
        expect(serialized).not.toContain(secret)
      }
      expect(announced!.options.social?.slack?.credentials?.token).toBe('xoxb-***ijkl')
      expect(announced!.settings).toContainEqual({ path: 'social.slack.credentials.token', value: 'xoxb-***ijkl' })
      expect(announced!.settings).toContainEqual({ path: 'social.slack.enabled', value: true })
    })
  })

  describe('When a profile sets an option of a section that does not exist', () => {
    it('Then warns naming the option and the options of the section', () => {
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})

      try {
        validateProfiles({
          profiles: {
            beta: {
              bump: { typo: 'prerelease' } as any,
            },
          },
        })

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('profiles.beta.bump.typo is not a bump option, it is ignored (bump options: type, preid'))
      }
      finally {
        warn.mockRestore()
      }
    })
  })

  describe('When a profile sets an invalid value', () => {
    it('Then fails with the values or the type expected', () => {
      expect(() => validateProfiles({
        profiles: {
          beta: {
            bump: { type: 'beta' } as any,
          },
        },
      })).toThrow('profiles.beta.bump.type must be one of "release", "major", "minor", "patch", "prerelease", "premajor", "preminor", "prepatch", got "beta"')
      expect(() => validateProfiles({
        profiles: {
          beta: {
            publish: { access: 'private' } as any,
          },
        },
      })).toThrow('profiles.beta.publish.access must be one of "public", "restricted"')
      expect(() => validateProfiles({
        profiles: {
          beta: {
            release: { canary: 'yes' } as any,
          },
        },
      })).toThrow('profiles.beta.release.canary must be a boolean, got "yes"')
      expect(() => validateProfiles({
        profiles: {
          beta: {
            bump: { preid: 1 } as any,
          },
        },
      })).toThrow('profiles.beta.bump.preid must be a string, got 1')
      expect(() => validateProfiles({
        profiles: {
          beta: {
            publish: { safetyCheckTimeout: '10' } as any,
          },
        },
      })).toThrow('profiles.beta.publish.safetyCheckTimeout must be a number')
    })

    it('Then accepts the valid ones, the options it does not check included', () => {
      expect(() => validateProfiles({
        profiles: {
          beta: {
            bump: {
              type: 'prerelease',
              preid: 'beta',
              dependencyTypes: ['dependencies'],
              dependents: 'always',
            },
            changelog: { formatCmd: false },
            publish: { tag: 'beta', access: 'public', registries: [] },
            release: {
              canary: false,
              report: { github: false },
            },
            prComment: { mode: 'update' },
            ai: { provider: 'claude-code', fallback: 'raw' },
          },
        },
      })).not.toThrow()
    })
  })

  describe('When the options a profile can set are compared to the types of the config', () => {
    it('Then they are the options of each section, with the values of their enums', () => {
      const typesFile = fileURLToPath(new URL('../../types.ts', import.meta.url))
      const coreDir = fileURLToPath(new URL('../../../../core/src', import.meta.url))
      const reference = extractConfigReference(readFileSync(typesFile, 'utf8'), createCoreResolver(coreDir))

      for (const [section, options] of Object.entries(PROFILE_OPTIONS)) {
        const documented = reference.filter(option => option.path.split('.').length === 2 && option.path.startsWith(`${section}.`))

        expect(Object.keys(options).sort(), section).toEqual(documented.map(option => option.path.split('.')[1]).sort())

        for (const option of documented) {
          const check = options[option.path.split('.')[1]!]
          const literals = option.values ?? (/^(?:'[^']+'(?: \| |$))+$/.test(option.type)
            ? option.type.split(' | ').map(value => `"${value.slice(1, -1)}"`)
            : undefined)

          if (literals) {
            expect(Array.isArray(check) && check.map(value => `"${value}"`).sort(), option.path).toEqual(literals.sort())
          }
          else if (['boolean', 'string', 'number'].includes(option.type)) {
            expect(check, option.path).toBe(option.type)
          }
          else {
            expect(check, option.path).toBeNull()
          }
        }
      }
    })
  })

  describe('When getting a profile that does not exist', () => {
    it('Then fails with the profiles available', () => {
      expect(() => getProfile({ profiles }, 'nightly')).toThrow(new UnknownProfileError('nightly', ['beta', 'canary', 'latest']))
      expect(() => getProfile({ profiles }, 'nightly')).toThrow('Unknown profile "nightly". Available profiles: beta, canary, latest')
    })

    it('Then says the config has none without profiles', () => {
      expect(() => getProfile({}, 'beta')).toThrow('the config defines no profiles')
    })

    it('Then does not take the properties of Object as profiles', () => {
      expect(() => getProfile({ profiles }, 'toString')).toThrow(UnknownProfileError)
    })
  })

  describe('When a profile sets an option that is not one of a profile', () => {
    it('Then fails naming the option', () => {
      expect(() => validateProfiles({
        profiles: {
          beta: {
            tokens: { github: 'x' },
          } as any,
        },
      })).toThrow('profiles.beta.tokens is not a profile option')
      expect(() => validateProfiles({
        profiles: {
          beta: { monorepo: {} } as any,
        },
      })).toThrow('profiles.beta.monorepo is not a profile option')
    })

    it('Then fails when a section is not an object or the description not a string', () => {
      expect(() => validateProfiles({
        profiles: {
          beta: { bump: 'beta' } as any,
        },
      })).toThrow('profiles.beta.bump must be an object')
      expect(() => validateProfiles({
        profiles: {
          beta: { description: 1 } as any,
        },
      })).toThrow('profiles.beta.description must be a string')
      expect(() => validateProfiles({
        profiles: {
          beta: { safetyCheck: {} } as any,
        },
      })).toThrow('profiles.beta.safetyCheck must be a boolean')
      expect(() => validateProfiles({
        profiles: { beta: null } as any,
      })).toThrow('profiles.beta must be an object')
      expect(() => validateProfiles({ profiles: [] as any })).toThrow('profiles must be an object')
    })
  })

  describe('When getting the options of a profile', () => {
    it('Then leaves its description out', () => {
      expect(getProfileOptions(profiles.beta!)).toEqual({
        bump: { type: 'prerelease', preid: 'beta' },
        publish: { tag: 'beta' },
      })
    })
  })
})

describe('Given a config file with profiles', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'relizy-profiles-'))
    writeFileSync(join(dir, 'relizy.config.json'), JSON.stringify({
      bump: { type: 'patch', preid: 'rc', yes: true },
      publish: { tag: 'next', access: 'restricted' },
      profiles: {
        ...profiles,
        suffixed: {
          bump: { suffix: 'build' },
          release: { canary: true },
        },
      },
    }))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  describe('When loading it without a profile', () => {
    it('Then applies no profile and keeps them for the consumers', async () => {
      const config = await loadRelizyConfig({
        overrides: { cwd: dir },
      })

      expect(config.profile).toBeUndefined()
      expect(config.bump).toMatchObject({ type: 'patch', preid: 'rc' })
      expect(config.publish.tag).toBe('next')
      expect(listProfiles(config).map(profile => profile.name)).toEqual(['beta', 'canary', 'latest', 'suffixed'])
    })
  })

  describe('When loading it with a profile', () => {
    it('Then the profile wins over the config file and the defaults', async () => {
      const config = await loadRelizyConfig({
        profile: 'beta',
        overrides: { cwd: dir },
      })

      expect(config.profile).toBe('beta')
      expect(config.bump).toMatchObject({
        type: 'prerelease',
        preid: 'beta',
        yes: true,
        clean: true,
      })
      expect(config.publish).toMatchObject({ tag: 'beta', access: 'restricted' })
    })

    it('Then the explicit options win over the profile', async () => {
      const config = await loadRelizyConfig({
        profile: 'beta',
        overrides: {
          cwd: dir,
          bump: { preid: 'alpha' },
          publish: { tag: 'next' },
        },
      })

      expect(config.bump).toMatchObject({ type: 'prerelease', preid: 'alpha' })
      expect(config.publish.tag).toBe('next')
    })

    it('Then an option left undefined does not hide the profile', async () => {
      const config = await loadRelizyConfig({
        profile: 'beta',
        overrides: {
          cwd: dir,
          bump: { type: undefined, preid: undefined },
          publish: { tag: undefined },
        },
      })

      expect(config.bump).toMatchObject({ type: 'prerelease', preid: 'beta' })
      expect(config.publish.tag).toBe('beta')
    })

    it('Then a profile can turn on the canary and set the suffix', async () => {
      const config = await loadRelizyConfig({
        profile: 'suffixed',
        overrides: { cwd: dir },
      })

      expect(config.release.canary).toBe(true)
      expect(config.bump.suffix).toBe('build')
      // The other release options keep the config file and defaults
      expect(config.release.commit).toBe(true)
    })

    it('Then an explicit canary: false wins over the profile', async () => {
      const config = await loadRelizyConfig({
        profile: 'canary',
        overrides: {
          cwd: dir,
          release: { canary: false },
        },
      })

      expect(config.release.canary).toBe(false)
    })

    it('Then fails with the profiles available when it does not exist', async () => {
      await expect(loadRelizyConfig({
        profile: 'nightly',
        overrides: { cwd: dir },
      }))
        .rejects
        .toThrow('Unknown profile "nightly". Available profiles: beta, canary, latest, suffixed')
    })
  })

  describe('When a resolved config gets a profile', () => {
    it('Then applies it over the config, under the overrides', async () => {
      const base = await loadRelizyConfig({
        overrides: { cwd: dir },
      })
      const config = await loadRelizyConfig({
        baseConfig: base,
        profile: 'beta',
        overrides: {
          publish: { tag: 'next' },
        },
      })

      expect(config.profile).toBe('beta')
      expect(config.bump).toMatchObject({ type: 'prerelease', preid: 'beta' })
      expect(config.publish.tag).toBe('next')
      // The base config is left as it was
      expect(base.bump.type).toBe('patch')
    })

    it('Then keeps the profile it already has', async () => {
      const base = await loadRelizyConfig({
        profile: 'beta',
        overrides: { cwd: dir },
      })
      const config = await loadRelizyConfig({
        baseConfig: base,
        profile: 'beta',
        overrides: {
          bump: { yes: false },
        },
      })

      expect(config.profile).toBe('beta')
      expect(config.bump).toMatchObject({ type: 'prerelease', preid: 'beta', yes: false })
    })
  })
})

describe('Given a config file with an invalid profile', () => {
  it('Then loading it fails, with or without the profile selected', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'relizy-profiles-'))
    writeFileSync(join(dir, 'relizy.config.json'), JSON.stringify({
      profiles: {
        beta: { tokens: {} },
      },
    }))

    try {
      await expect(loadRelizyConfig({
        overrides: { cwd: dir },
      })).rejects.toThrow('profiles.beta.tokens is not a profile option')
      await expect(loadRelizyConfig({
        profile: 'beta',
        overrides: { cwd: dir },
      })).rejects.toThrow('profiles.beta.tokens is not a profile option')
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
