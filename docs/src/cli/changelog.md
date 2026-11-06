---
title: changelog
description: Write the CHANGELOG.md files from the commits, without bump, commit nor publication.
keywords: relizy changelog, changelog generation, CHANGELOG.md, conventional commits, root changelog, monorepo changelog
category: CLI Reference
tags: [cli, changelog, commits, monorepo]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Usage

```bash
relizy changelog [options]
```

`changelog` is the second [step of `release`](./release.md#steps). Alone, it writes the entry of the current version of each package, from the commits since its last release tag: run it after [`bump`](./bump.md). In a monorepo, it also writes the root `CHANGELOG.md`, then runs the format command. The [global options](./commands.md#global-options) apply too (`--dry-run`, `--group`...).

See [Changelog](./../guide/changelog.md) for the content of the entries.

## Options

| Flag                        | Description                                                                           | Config                                                                |
| --------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `--from <ref>`              | Start of the commit range (tag or commit), instead of the last release tag            | [`from`](./../config/overview.md#from-to)                             |
| `--to <ref>`                | End of the commit range, `HEAD` by default                                            | [`to`](./../config/overview.md#from-to)                               |
| `--format-cmd <cmd>`        | Command run after writing the changelogs, e.g. `"pnpm lint:fix"`                      | [`changelog.formatCmd`](./../config/changelog.md#formatcmd)           |
| `--no-root-changelog`       | Do not write the root `CHANGELOG.md` of a monorepo                                    | [`changelog.rootChangelog`](./../config/changelog.md#rootchangelog)   |
| `--private-packages <mode>` | `release`: write the changelogs of the private packages too, `ignore`: leave them out | [`monorepo.privatePackages`](./../config/monorepo.md#privatepackages) |

## Examples

```bash
# Preview the changelogs
relizy changelog --dry-run

# A given range
relizy changelog --from v1.0.0 --to v1.1.0

# Format the files once written
relizy changelog --format-cmd "pnpm exec prettier --write '**/CHANGELOG.md'"
```

## See Also

- [release](./release.md)
- [Changelog config](./../config/changelog.md)
- [AI-Enhanced Changelogs](./../guide/ai-changelog.md)
- [`changelog()`](./../api/changelog.md)
