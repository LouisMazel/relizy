---
title: getConfigOptions()
description: The options of relizy.config.ts as a tree for a tool - path, type, accepted values, default, description and nested options, profiles included.
keywords: relizy config options, getConfigOptions, config reference, config schema, config editor, ConfigOptionNode, relizy.config.ts options
category: API Reference
tags: [api, config, reference, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

```ts
function getConfigOptions(options?: { bundleDir?: string }): Promise<ConfigOptionNode[]>
```

It reads the same reference as the `get_config_option` tool of the [MCP server](./../cli/mcp.md): the options extracted from the types of the installed relizy, with their JSDoc. A tool showing or editing a config (a form, a settings screen) generates itself from it, whatever the version of relizy the project has installed.

```ts
interface ConfigOptionNode {
  path: string // `bump.type`, `monorepo.groups[].name`, `profiles.*.bump.type`
  key: string // the last segment of the path
  type: string // `boolean`, `string[]`, `VersionMode`, `BumpConfig`...
  values?: string[] // the values the type accepts: `['unified', 'selective', 'independent']`
  default?: unknown // none when it depends on the project (`cwd`, `repo`, `tokens`); a secret read from the environment is masked
  description: string // markdown
  summary: string // its first paragraph, on one line
  deprecated?: string
  see?: string
  docId: string // `config/bump`
  docUrl: string // https://relizy.dev/config/bump
  children: ConfigOptionNode[]
}
```

The result is the top-level options. `[]` in a path is the items of an array, `*` the entries of a record: the options of a [profile](./../config/profiles.md) are under `profiles.*`, with `profiles.*.description` and the options of the sections a profile can set (`profiles.*.bump.preid`, `profiles.*.release.canary`...).

```ts
import { getConfigOptions } from 'relizy'

const options = await getConfigOptions()
const bump = options.find(option => option.path === 'bump')!

for (const option of bump.children) {
  console.log(option.path, option.type, option.default, option.summary)
}
// bump.type 'release' | 'major' | ... 'release' Release type (...)
```

`bundleDir` is the folder of the docs bundle (`agent-docs/` of relizy), the one of the installed relizy by default. It throws when the bundle is missing, which only happens with a copy of relizy without its `agent-docs` folder.

## See Also

- [Configuration](./../config/overview.md)
- [Profiles](./../config/profiles.md)
- [`loadRelizyConfig()`](./load-relizy-config.md)
