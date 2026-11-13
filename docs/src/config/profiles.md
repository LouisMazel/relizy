---
title: Profiles Configuration
description: Named ways of releasing (beta, canary, latest...) defined once in the config and selected with --profile, by the CLI, the CI and the programmatic API.
keywords: relizy profiles, release profile, --profile, beta release, canary profile, latest, prerelease workflow, named release, listProfiles
category: Configuration
tags: [config, profiles, prerelease, canary, ci]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

A profile is a set of config options applied over the config file when it is selected. It replaces the flags repeated in each CI job (`--preid beta --tag beta`) by one definition shared by the CLI, the CI and the programmatic API.

```ts
// relizy.config.ts
import { defineConfig } from 'relizy'

export default defineConfig({
  profiles: {
    beta: {
      description: 'Prerelease for testers',
      bump: { type: 'prerelease', preid: 'beta' },
      publish: { tag: 'beta' },
    },
    canary: {
      description: 'Test version of the current commit',
      release: { canary: true },
    },
    latest: {
      publish: { tag: 'latest' },
    },
  },
})
```

```bash
relizy release --profile beta --yes
relizy release --profile canary --yes
```

## profiles

- **Type:** `Record<string, RelizyProfile>`
- **Default:** none
- **CLI:** `--profile <name>`
- **API:** the `profile` option of the commands and of [`loadRelizyConfig()`](./../api/load-relizy-config.md)

Each key is the name of a profile. A profile sets these options, all optional:

| Option        | Content                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------- |
| `description` | What the profile is for, for the tools listing the profiles                                 |
| `bump`        | The [bump](./bump.md) options: `type`, `preid`, `suffix`, `yes`, `dependents`...            |
| `changelog`   | The [changelog](./changelog.md) options                                                     |
| `publish`     | The [publish](./publish.md) options: `tag`, `access`, `registry`, `buildCmd`...             |
| `release`     | The [release](./release.md) options: `canary`, and the steps to run (`social`, `commit`...) |
| `social`      | The [social](./social.md) options                                                           |
| `prComment`   | The [PR comment](./pr-comment.md) options                                                   |
| `ai`          | The [AI](./ai.md) options                                                                   |
| `safetyCheck` | The global [safety check](./overview.md#safetycheck)                                        |

A profile changes how to release, never the project: `monorepo`, `repo`, `tokens`, `hooks`, `templates`, `types` and the other options are not profile options, and the config fails to load when a profile sets one.

### Equivalent of the flags

The options that only existed as flags have a config option, so a profile can set them:

| Flag                             | In a profile                                                             |
| -------------------------------- | ------------------------------------------------------------------------ |
| `--canary`                       | `release: { canary: true }`, see [`release.canary`](./release.md#canary) |
| `--prerelease`, `--minor`...     | `bump: { type: 'prerelease' }`, see [`bump.type`](./bump.md#type)        |
| `--preid`                        | `bump: { preid: 'beta' }`                                                |
| `--suffix`                       | `bump: { suffix: 'build' }`, see [`bump.suffix`](./bump.md#suffix)       |
| `--tag`                          | `publish: { tag: 'beta' }`                                               |
| `--no-social`, `--no-publish`... | `release: { social: false }`, `release: { publish: false }`              |

### Precedence

From the lowest to the highest:

1. the defaults of relizy;
2. the config file;
3. the profile;
4. the options of the run: the CLI flags, the options given to the API.

A flag given with a profile wins over it: `relizy release --profile beta --preid rc` publishes with the preid `rc` and the other options of `beta`. The options of the profile are merged key by key as the config file is: `publish: { tag: 'beta' }` keeps the `access` and the other `publish` options of the config file. An array replaces the one of the config file.

A profile that is not defined fails with the list of the profiles available:

```text
Unknown profile "nightly". Available profiles: beta, canary, latest
```

### Commands

`--profile` is a global option: it goes before or after the command, and applies to `release`, `bump`, `changelog`, `publish`, `provider-release`, `social`, `pr-comment` and `merge-preview`. In `relizy release`, the steps share the profile. `relizy merge-preview --profile beta` previews the release of that profile.

### Use it from Node.js

```ts
import { listProfiles, loadRelizyConfig, release } from 'relizy'

// What the config offers: name, description and what each profile changes
const profiles = listProfiles(await loadRelizyConfig())
// [{ name: 'beta', description: 'Prerelease for testers', canary: false,
//    settings: [{ path: 'bump.type', value: 'prerelease' }, { path: 'publish.tag', value: 'beta' }, ...] }]

// The config of a profile, with the defaults and the config file
const config = await loadRelizyConfig({ profile: 'beta' })

await release({ profile: 'beta', yes: true })
```

`listProfiles()` also validates the profiles, and masks the secrets they set (tokens, API keys, webhook URLs) in `options` and `settings`. See [`loadRelizyConfig()`](./../api/load-relizy-config.md#profiles) and [Shared Options](./../api/usage.md#shared-options).

## See Also

- [Prereleases & Canary](./../guide/prereleases.md#release-profiles)
- [Release from CI](./../guide/ci-cd.md)
