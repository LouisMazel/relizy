---
title: Monorepo Configuration
description: Reference of the monorepo options - version mode, packages, version groups, ignored and private packages, moved packages.
keywords: monorepo config, versionMode, packages, version groups, monorepo.groups, VersionGroup, ignored packages, privatePackages, movedPackages
category: Configuration
tags: [config, monorepo, versioning, workspace, groups]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }} A standalone package needs none of them.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: {
    versionMode: 'selective',
    packages: ['packages/*', 'apps/*'],
    ignored: ['apps/docs'],
  },
})
```

## versionMode

- **Type:** `'unified' | 'selective' | 'independent'`
- **Required** unless [`groups`](#groups) is set (they cannot be set together)

How the packages are versioned: one version for all of them (`unified`), one version for the packages with commits (`selective`), or a version per package (`independent`). See [Version Modes](./../guide/version-modes.md).

## packages

- **Type:** `string[]`
- **Required** unless [`groups`](#groups) is set (they cannot be set together)

Glob patterns, relative to `cwd`, of the package directories (`['packages/*']`). A directory is a package when it has a `package.json`.

## groups

- **Type:** `VersionGroup[]`
- **Default:** none

Sets of packages released together in a single run, each with its own version mode. Replaces `versionMode` and `packages`. Every package belongs to one group: a package matched by several groups goes to the group listing its exact path (no glob), any other overlap is an error. At most one group uses the `unified` or `selective` mode: it owns the root version and the repository tags. See [Version Groups](./../guide/version-groups.md) for the behavior and the examples.

| Field         | Type                                                   | Effect                                                                                                                                    |
| ------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | `string` (required)                                    | Name in the logs, targeted by `--group <name>`                                                                                            |
| `title`       | `string` (default: `name`)                             | Name in the bump confirmation, the social posts, the PR comment and the release summary                                                   |
| `versionMode` | `'unified' \| 'selective' \| 'independent'` (required) | Version mode of the packages of the group                                                                                                 |
| `packages`    | `string[]` (required)                                  | Glob patterns of the package directories of the group                                                                                     |
| `ignored`     | `string[]` (default: `[]`)                             | Package directories to ignore in the group, on top of [`monorepo.ignored`](#ignored)                                                      |
| `bump`        | `{ capZeroMajor?, dependencyTypes? }`                  | Overrides [`bump.capZeroMajor`](./bump.md#capzeromajor) and [`bump.dependencyTypes`](./bump.md#dependencytypes)                           |
| `changelog`   | `{ rootChangelog?, includeCommitBody? }`               | Overrides [`changelog.rootChangelog`](./changelog.md#rootchangelog) and [`changelog.includeCommitBody`](./changelog.md#includecommitbody) |
| `release`     | `{ providerRelease?, social? }`                        | `providerRelease: false`: no provider release for its packages; `social: false`: left out of the social posts                             |
| `ai`          | `{ providerRelease? }`                                 | Overrides [`ai.providerRelease`](./ai.md), e.g. `{ enabled: false }` to limit the AI calls of an `independent` group                      |

```ts
export default defineConfig({
  monorepo: {
    groups: [
      { name: 'main', versionMode: 'selective', packages: ['packages/*'] },
      { name: 'tooling', title: 'Tooling', versionMode: 'independent', packages: ['tooling/*'], changelog: { rootChangelog: false } },
    ],
  },
})
```

The options without a group field (`privatePackages`, `movedPackages`) apply to every group.

## ignored

- **Type:** `string[]`
- **Default:** `[]`

Glob patterns of package directories to leave out, matched as [`packages`](#packages). An ignored package is not bumped, has no changelog, is not published, gets no provider release and is not listed in the PR comment.

In `unified` and `selective` mode, a commit whose changed files are all inside ignored packages does not count for the root version nor the root changelog: keep the changes of an ignored package in their own commits, so a breaking change there does not bump the whole repository.

## privatePackages

- **Type:** `'ignore' | 'release'`
- **Default:** `'ignore'`
- **CLI:** `--private-packages <mode>` (`bump`, `changelog`, `release`)

What relizy does with the private packages of the workspace (`"private": true` in their `package.json`):

- `ignore`: they are left out of the release.
- `release`: they are released as the other packages (bump, changelog, tag, GitHub/GitLab release, PR comment), but never published to a registry.

A project without workspace packages (a private app with a single `package.json`) is released, private or not. `ignored` still applies: an ignored private package stays out. See [Private Projects & Apps](./../guide/private-projects.md).

## movedPackages

- **Type:** `Record<string, string>`
- **Default:** `{}`

Package directories moved or renamed that git does not detect, as `old path: new path` (relative to `cwd`, no glob), so the commits made before the move still belong to the package. See [Moving & Renaming Packages](./../guide/moved-packages.md).
