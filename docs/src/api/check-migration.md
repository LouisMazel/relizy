---
title: checkMigration()
description: List from code what to change in a project to upgrade it from relizy 1 to relizy 2, as data - each finding with its files and lines, its fix and the section of the migration guide.
keywords: relizy migration api, checkMigration, MigrationReport, MigrationFinding, upgrade relizy 1 to 2, migration-v2
category: API Reference
tags: [api, migration, upgrade, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

```ts
function checkMigration(options?: CheckMigrationOptions): Promise<MigrationReport>
```

It runs the checks of the `check_migration` tool of the [MCP server](./../cli/mcp.md), read-only: the relizy dependency, the config (removed or renamed options, `bump.dependencyTypes`, the version groups, the AI options), the templates, the code calling the relizy API, the CLI calls of the scripts and the CI files, and the scripts posting to Teams or Slack. See the [migration guide](./../guide/migration-v2.md).

## Options

| Option       | Description                                                                                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`        | Root of the project. Default: the current directory                                                                                                                                |
| `configName` | The config: its name (`'relizy.standalone'` for `relizy.standalone.config.ts`) or its path (`'./configs/relizy.config.ts'`, relative to `cwd`), as `--config`. Throws when missing |

## Result

```ts
interface MigrationReport {
  /** The installed relizy of the project, else the range of its package.json */
  fromVersion?: string
  /** The config files read, relative to the project */
  configFiles: string[]
  /** False when relizy 2 cannot load the config: a blocking finding tells why */
  configLoaded: boolean
  findings: MigrationFinding[]
}

interface MigrationFinding {
  /** `change`: to change; `review`: a change of behavior to check */
  severity: 'change' | 'review'
  title: string
  /** The section of the migration guide */
  section: string
  /** The fix */
  detail: string
  /** `file:line` */
  locations?: string[]
  /** The section on relizy.dev */
  docUrl?: string
  /** The config does not load until this is fixed */
  blocking?: boolean
}
```

The config is loaded silently: the level of the logger is back to the one of before once the check ends.

A config that relizy 2 cannot load (an option it refuses, a config that throws) gives a `blocking` finding first, with the checks that do not read the config (the dependency, the code, the CLI calls): fix it, then check again for the others.

## Example

```ts
import { checkMigration } from 'relizy'

const { fromVersion, findings } = await checkMigration({ cwd: '/path/to/project' })

console.log(`From relizy ${fromVersion}`)
for (const finding of findings) {
  console.log(`[${finding.severity}] ${finding.title}`, finding.locations ?? [], finding.docUrl)
}
```

## See Also

- [Migration from relizy 1](./../guide/migration-v2.md)
- [MCP server](./../cli/mcp.md)
- [Programmatic API](./usage.md)
