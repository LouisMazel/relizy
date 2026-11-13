import type { RelizyConfig, RelizyProfile } from '../types'

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
  /** The config options the profile sets, over the config file */
  options: ProfileOptions
  /** The same options, one entry per leaf: `{ path: 'publish.tag', value: 'beta' }` */
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
  }
}

/**
 * Check the `profiles` of a config: each profile is an object that only sets
 * the sections a profile can set
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
 * `loadRelizyConfig()`, or on a config file as written.
 *
 * @example
 * const profiles = listProfiles(await loadRelizyConfig())
 * // [{ name: 'beta', description: '...', canary: false, settings: [{ path: 'publish.tag', value: 'beta' }] }]
 */
export function listProfiles(config: Pick<RelizyConfig, 'profiles'>): ProfileInfo[] {
  validateProfiles(config)

  return Object.entries(config.profiles ?? {}).map(([name, profile]) => {
    const options = getProfileOptions(profile)

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
