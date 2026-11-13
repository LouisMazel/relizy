---
title: loadRelizyConfig()
description: Load the relizy config of the project from Node.js, with its defaults and your overrides.
keywords: relizy config api, loadRelizyConfig, ResolvedRelizyConfig, LoadRelizyConfigOptions, config overrides, defineConfig
category: API Reference
tags: [api, config, configuration, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

```ts
function loadRelizyConfig(options?: LoadRelizyConfigOptions): Promise<ResolvedRelizyConfig>
```

`loadRelizyConfig()` reads the config file of the current directory (and its `.env`), merges it with the defaults, and returns the resolved config, with the defaults and the `types`. It throws when `configFile` is given and the file does not exist, when the [version groups](./../guide/version-groups.md) are invalid, or when the config sets an option removed in relizy 2 (`monorepo.ignorePackageNames`, see [the migration guide](./../guide/migration-v2.md#removed-ignorepackagenames)).

## Options

| Option       | Description                                                                                                                                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `configFile` | Name of the config, as `--config`: `'relizy.standalone'` loads `relizy.standalone.config.ts`; or the path of the file, absolute or relative to the project with its extension (`'/configs/relizy.config.ts'`). Default: `'relizy'`                   |
| `overrides`  | `RelizyConfigOverrides`, options applied over the config file (each one partial: `{ bump: { type: 'minor' } }`). `overrides.cwd` sets the project directory. The `hooks` of the overrides run after the ones of the config instead of replacing them |
| `profile`    | Name of a [profile](./../config/profiles.md) of the config, as `--profile`: its options come over the config file and under the `overrides`. Throws `UnknownProfileError` when it is not defined                                                     |
| `baseConfig` | A `ResolvedRelizyConfig`, used instead of the config file: the profile and the overrides are applied over it, the file is not read again                                                                                                             |

See [LoadRelizyConfigOptions](./../typedoc/interfaces/LoadRelizyConfigOptions.md) and [ResolvedRelizyConfig](./../typedoc/type-aliases/ResolvedRelizyConfig.md).

## Profiles

The [profiles](./../config/profiles.md) of the config are listed by `listProfiles()`, which takes the resolved config (or a config as written):

```ts
function listProfiles(config: Pick<RelizyConfig, 'profiles'>): ProfileInfo[]

interface ProfileInfo {
  name: string
  description?: string
  /** True when the profile releases a canary (`release.canary`) */
  canary: boolean
  /** The config options the profile sets, over the config file, secrets masked */
  options: ProfileOptions
  /** The same options, one entry per leaf */
  settings: { path: string, value: unknown }[]
}

/** The sections a profile sets, exported by relizy */
type ProfileOptions = Pick<RelizyConfig, 'bump' | 'changelog' | 'publish' | 'release' | 'social' | 'prComment' | 'ai' | 'safetyCheck'>
```

```ts
import { listProfiles, loadRelizyConfig } from 'relizy'

const profiles = listProfiles(await loadRelizyConfig())
// [{ name: 'beta', description: 'Prerelease for testers', canary: false, options: {...},
//    settings: [{ path: 'bump.type', value: 'prerelease' }, { path: 'bump.preid', value: 'beta' }, { path: 'publish.tag', value: 'beta' }] }]

// The config the profile resolves to, with the defaults and the config file under it
const config = await loadRelizyConfig({ profile: 'beta' })
console.log(config.profile, config.bump.preid, config.publish.tag) // beta beta beta
```

The precedence is the defaults, the config file, the profile, then the `overrides`. `config.profile` is the name of the profile applied. `UnknownProfileError` has the `profile` asked and the `available` names; the config also fails to load when a profile sets an option a profile cannot set.

## Examples

```ts
import { loadRelizyConfig } from 'relizy'

const config = await loadRelizyConfig()

console.log(config.monorepo?.versionMode, Object.keys(config.types))
```

Another config file, with overrides, given to a command:

```ts
import { bump, loadRelizyConfig } from 'relizy'

const config = await loadRelizyConfig({
  configFile: 'relizy.standalone',
  overrides: { bump: { type: 'prerelease', preid: 'beta' } },
})

await bump({ config, configName: 'relizy.standalone', yes: true })
```

A command given a `config` uses it as it is, without loading the config file (see [Shared Options](./usage.md#shared-options)).

`defineConfig()` only types the object of `relizy.config.ts`, see [Configuration](./../config/overview.md).

## See Also

- [Programmatic API](./usage.md)
- [Multiple configs](./../config/overview.md#multiple-configs)
