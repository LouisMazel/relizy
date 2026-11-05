---
title: changelog()
description: Write the CHANGELOG.md files from Node.js.
keywords: relizy changelog api, programmatic changelog, ChangelogOptions, bumpResult, CHANGELOG.md
category: API Reference
tags: [api, changelog, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

```ts
function changelog(options?: Partial<ChangelogOptions>): Promise<void>
```

`changelog()` runs [`relizy changelog`](./../cli/changelog.md): it writes the `CHANGELOG.md` of each package (and the root one in a monorepo), then runs the format command. It resolves once the files are written.

## Options

The flags of [`relizy changelog`](./../cli/changelog.md#options), camelCased, and the [shared options](./usage.md#shared-options):

| Option            | Description                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| `bumpResult`      | `BumpResultTruthy`, the result of [`bump()`](./bump.md): the changelogs of the bumped packages, at their new version |
| `from`, `to`      | The commit range, instead of the last release tag and `HEAD`                                                         |
| `formatCmd`       | Overrides [`changelog.formatCmd`](./../config/changelog.md#formatcmd)                                                |
| `rootChangelog`   | Overrides [`changelog.rootChangelog`](./../config/changelog.md#rootchangelog)                                        |
| `force`           | Without `bumpResult`, includes the packages without commits                                                          |
| `suffix`          | Without `bumpResult`, the prerelease suffix of the versions, as for [`bump()`](./bump.md)                            |
| `privatePackages` | Overrides [`monorepo.privatePackages`](./../config/monorepo.md#privatepackages)                                      |

`ChangelogOptions` also has `includeCommitBody`, which `changelog()` ignores: set [`changelog.includeCommitBody`](./../config/changelog.md#includecommitbody) in the config. See [ChangelogOptions](./../typedoc/interfaces/ChangelogOptions.md).

## Examples

```ts
import { bump, changelog } from 'relizy'

const bumpResult = await bump({ yes: true })

if (bumpResult.bumped) {
  await changelog({ bumpResult })
}
```

A given range, previewed:

```ts
await changelog({ from: 'v1.0.0', to: 'v1.1.0', dryRun: true })
```

## See Also

- [`relizy changelog`](./../cli/changelog.md)
- [Changelog](./../guide/changelog.md)
- [Changelog config](./../config/changelog.md)
