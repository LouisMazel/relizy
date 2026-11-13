import type { RelizyConfig, RelizyProfile } from '../types'
import { logger } from '@maz-ui/node'
import { redactSecrets } from '@relizy/core'

/**
 * Config sections a profile can set: what the way of releasing changes, never
 * the project (repository, tokens, hooks, monorepo, commit types...)
 */
export const PROFILE_SECTIONS = [
  'bump',
  'changelog',
  'publish',
  'release',
  'social',
  'prComment',
  'ai',
  'safetyCheck',
] as const

export type ProfileSection = typeof PROFILE_SECTIONS[number]

/** The sections of a profile that are objects of options */
type ProfileOptionsSection = Exclude<ProfileSection, 'safetyCheck'>

/** The config options of a profile, as they are applied over the config file */
export type ProfileOptions = Pick<RelizyConfig, ProfileSection>

/**
 * One option set by a profile: its path in the config (`bump.type`) and its value
 */
export interface ProfileSetting {
  path: string
  value: unknown
}

/**
 * A profile as a consumer (the CLI, an app) shows it
 */
export interface ProfileInfo {
  name: string
  description?: string
  /** True when the profile releases a canary (`release.canary`) */
  canary: boolean
  /** The config options the profile sets, over the config file, secrets masked (`redactSecrets` of `@relizy/core`) */
  options: ProfileOptions
  /** The same options, one entry per leaf: `{ path: 'publish.tag', value: 'beta' }`, secrets masked */
  settings: ProfileSetting[]
}

/** Thrown when the selected profile is not in `profiles` */
export class UnknownProfileError extends Error {
  override name = 'UnknownProfileError'

  constructor(readonly profile: string, readonly available: string[]) {
    super(available.length > 0
      ? `Unknown profile "${profile}". Available profiles: ${available.join(', ')}`
      : `Unknown profile "${profile}": the config defines no profiles, add them to \`profiles\` in relizy.config.ts`)
  }
}

/** True for an object literal (`{}`, `Object.create(null)`), false for an array, a class instance or a function */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * What a profile option accepts: a type, the values of an enum, or `null` when
 * its value is not checked here (an object, an array, a union of types)
 */
type OptionCheck = 'boolean' | 'string' | 'number' | readonly string[] | null

/**
 * The options of each section a profile can set, with the check of their
 * value. Kept in sync with `types.ts` by the tests of the profiles.
 */
export const PROFILE_OPTIONS: Record<ProfileOptionsSection, Record<string, OptionCheck>> = {
  bump: {
    type: [
      'release',
      'major',
      'minor',
      'patch',
      'prerelease',
      'premajor',
      'preminor',
      'prepatch',
    ],
    preid: 'string',
    suffix: 'string',
    clean: 'boolean',
    dependencyTypes: null,
    dependents: ['out-of-range', 'always'],
    yes: 'boolean',
    capZeroMajor: 'boolean',
    outOfRangePeers: ['bump', 'warn', 'error'],
  },
  changelog: {
    formatCmd: null,
    rootChangelog: 'boolean',
    includeCommitBody: 'boolean',
  },
  publish: {
    args: null,
    packageManager: ['npm', 'yarn', 'pnpm', 'bun'],
    registry: 'string',
    tag: 'string',
    access: ['public', 'restricted'],
    otp: 'string',
    buildCmd: 'string',
    safetyCheck: 'boolean',
    safetyCheckTimeout: 'number',
    registries: null,
    skipExistingVersions: 'boolean',
    checkWorkspaceDependencies: 'boolean',
  },
  release: {
    canary: 'boolean',
    commit: 'boolean',
    push: 'boolean',
    changelog: 'boolean',
    providerRelease: 'boolean',
    publish: 'boolean',
    noVerify: 'boolean',
    clean: 'boolean',
    gitTag: 'boolean',
    social: 'boolean',
    prComment: 'boolean',
    report: null,
  },
  social: {
    twitter: null,
    slack: null,
    teams: null,
    changelogUrl: 'string',
  },
  prComment: {
    mode: ['append', 'update'],
  },
  ai: {
    provider: ['claude-code', 'ai-sdk'],
    providers: null,
    language: 'string',
    fallback: ['raw', 'fail'],
    extraGuidelines: null,
    systemPromptOverrides: null,
    onlyStable: 'boolean',
    providerRelease: null,
    social: null,
  },
}

/** What the value of an option must be, as the error says it, none when it is valid */
function describeInvalidValue(check: OptionCheck, value: unknown): string | undefined {
  if (check === null || value === undefined) {
    return undefined
  }

  if (typeof check === 'string') {
    const type: string = typeof value
    return type === check
      ? undefined
      : `a ${check}`
  }

  return check.includes(value as string)
    ? undefined
    : `one of ${check.map(entry => JSON.stringify(entry)).join(', ')}`
}

/** Check the options of a section of a profile: an unknown one is a warning, an invalid value an error */
function validateSectionOptions(name: string, section: ProfileOptionsSection, options: Record<string, unknown>): void {
  const known = PROFILE_OPTIONS[section]

  for (const [key, value] of Object.entries(options)) {
    const path = `profiles.${name}.${section}.${key}`

    if (!Object.hasOwn(known, key)) {
      logger.warn(`${path} is not a ${section} option, it is ignored (${section} options: ${Object.keys(known).join(', ')})`)
      continue
    }

    const expected = describeInvalidValue(known[key]!, value)

    if (expected) {
      throw new Error(`${path} must be ${expected}, got ${JSON.stringify(value)}`)
    }
  }
}

/** The type of the value of a profile option, as the error says it */
function describeInvalidOption(key: string, value: unknown): string | undefined {
  if (value === undefined) {
    return undefined
  }

  if (key === 'description') {
    return typeof value === 'string'
      ? undefined
      : 'a string'
  }

  if (key === 'safetyCheck') {
    return typeof value === 'boolean'
      ? undefined
      : 'a boolean'
  }

  return isPlainObject(value)
    ? undefined
    : 'an object'
}

function validateProfile(name: string, profile: unknown): void {
  if (!name.trim()) {
    throw new Error('A profile of `profiles` needs a name')
  }

  if (!isPlainObject(profile)) {
    throw new Error(`profiles.${name} must be an object`)
  }

  const allowed: string[] = ['description', ...PROFILE_SECTIONS]

  for (const [key, value] of Object.entries(profile)) {
    if (!allowed.includes(key)) {
      throw new Error(`profiles.${name}.${key} is not a profile option: a profile sets ${allowed.join(', ')}`)
    }

    const expected = describeInvalidOption(key, value)

    if (expected) {
      throw new Error(`profiles.${name}.${key} must be ${expected}`)
    }

    if (key !== 'description' && key !== 'safetyCheck' && isPlainObject(value)) {
      validateSectionOptions(name, key as ProfileOptionsSection, value)
    }
  }
}

/**
 * Check the `profiles` of a config: each profile is an object that only sets
 * the sections a profile can set, with valid values for the options of these
 * sections (an unknown option is a warning)
 */
export function validateProfiles(config: Pick<RelizyConfig, 'profiles'>): void {
  const { profiles } = config

  if (profiles === undefined) {
    return
  }

  if (!isPlainObject(profiles)) {
    throw new Error('profiles must be an object of profiles by name: `profiles: { beta: { bump: { preid: \'beta\' } } }`')
  }

  for (const [name, profile] of Object.entries(profiles)) {
    validateProfile(name, profile)
  }
}

/**
 * The profile `name` of a config
 * @throws {UnknownProfileError} when the config has no such profile
 */
export function getProfile(config: Pick<RelizyConfig, 'profiles'>, name: string): RelizyProfile {
  const profile = Object.hasOwn(config.profiles ?? {}, name)
    ? config.profiles?.[name]
    : undefined

  if (!profile) {
    throw new UnknownProfileError(name, Object.keys(config.profiles ?? {}))
  }

  return profile
}

/** The config options a profile sets (its description left out) */
export function getProfileOptions(profile: RelizyProfile): ProfileOptions {
  return Object.fromEntries(Object.entries(profile).filter(([key]) => key !== 'description')) as ProfileOptions
}

function flatten(value: unknown, path: string): ProfileSetting[] {
  if (!isPlainObject(value)) {
    return [
      { path, value },
    ]
  }

  return Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .flatMap(([key, entry]) => flatten(entry, `${path}.${key}`))
}

/**
 * The profiles of a config (`profiles`): their name, description and what they
 * change, e.g. to show them as release workflows. Works on the config of
 * `loadRelizyConfig()`, or on a config file as written. The secrets a profile
 * sets (tokens, API keys, webhook URLs) are masked in `options` and `settings`.
 *
 * @example
 * const profiles = listProfiles(await loadRelizyConfig())
 * // [{ name: 'beta', description: '...', canary: false, settings: [{ path: 'publish.tag', value: 'beta' }] }]
 */
export function listProfiles(config: Pick<RelizyConfig, 'profiles'>): ProfileInfo[] {
  validateProfiles(config)

  return Object.entries(config.profiles ?? {}).map(([name, profile]) => {
    const options = redactSecrets(getProfileOptions(profile))

    return {
      name,
      ...(profile.description === undefined
        ? {}
        : { description: profile.description }),
      canary: options.release?.canary === true,
      options,
      settings: flatten(options, '').map(setting => ({
        ...setting,
        path: setting.path.slice(1),
      })),
    }
  })
}
