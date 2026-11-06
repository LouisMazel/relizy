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

| Option       | Description                                                                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `configFile` | Name of the config, as `--config`: `'relizy.standalone'` loads `relizy.standalone.config.ts`. Default: `'relizy'`                                           |
| `overrides`  | `RelizyConfigOverrides`, options applied over the config file (each one partial: `{ bump: { type: 'minor' } }`). `overrides.cwd` sets the project directory |
| `baseConfig` | A `ResolvedRelizyConfig`, merged under the overrides and over the config file and the defaults: the file is still read                                      |

See [LoadRelizyConfigOptions](./../typedoc/interfaces/LoadRelizyConfigOptions.md) and [ResolvedRelizyConfig](./../typedoc/type-aliases/ResolvedRelizyConfig.md).

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

A command given a `config` still loads its config file under it (see [Shared Options](./usage.md#shared-options)): pass the same `configName`.

`defineConfig()` only types the object of `relizy.config.ts`, see [Configuration](./../config/overview.md).

## See Also

- [Programmatic API](./usage.md)
- [Multiple configs](./../config/overview.md#multiple-configs)
