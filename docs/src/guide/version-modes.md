---
title: Version Modes
description: The three version modes of a monorepo (unified, selective, independent), what each one bumps, tags and writes, with an example per mode.
keywords: version modes, monorepo versioning, unified mode, selective mode, independent mode, versionMode, root version, package tags, lerna.json
category: Guide
tags: [guide, versioning, monorepo, strategies]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

A project without `monorepo` config is a single package (standalone): its root `package.json` is bumped, tagged `v1.2.3` and published. In a monorepo, `monorepo.versionMode` decides how the packages matched by `monorepo.packages` are versioned:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: {
    versionMode: 'selective',
    packages: ['packages/*'],
  },
})
```

## Comparison

|                         | `unified`                                      | `selective`                                            | `independent`                                                      |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------ |
| **Packages bumped**     | All                                            | The ones with commits, and their dependents            | The ones with commits, and their dependents                        |
| **Version**             | The root version, for every package            | The root version, for the bumped packages              | Each package its own, from its own commits                         |
| **Root `package.json`** | Bumped                                         | Bumped                                                 | Not bumped                                                         |
| **Git tags**            | One: `v1.2.0`                                  | One: `v1.2.0`                                          | One per package: `@scope/core@2.1.0`                               |
| **Changelogs**          | Root `CHANGELOG.md` and one per package        | Root `CHANGELOG.md` and one per bumped package         | One per bumped package, and a root `CHANGELOG.md` aggregating them |
| **`lerna.json`**        | `version` updated                              | `version` updated                                      | Not updated                                                        |
| **Best for**            | Tightly coupled packages, always used together | Many packages sharing a version line, not all changing | Packages with their own lifecycle                                  |

In every mode:

- the root version (`unified`, `selective`) is computed from every commit of the repository, except the commits only changing [ignored](./../config/monorepo.md#ignored) packages;
- a package gets the commits changing its directory (see [Moving & Renaming Packages](./moved-packages.md) for the moves), and the commits changing a [catalog](./dependency-management.md#catalogs) entry it uses;
- the dependents follow [`bump.dependencyTypes`](./../config/bump.md#dependencytypes) and the [out-of-range peer dependencies](./../config/bump.md#outofrangepeers), see [Dependency Management](./dependency-management.md);
- the tag format comes from [`templates.tagBody`](./../config/commit-templates.md#tagbody) for the repository tag, the package tags are always `<name>@<version>`.

The bump type comes from the commits (see [Semver Convention](./semver-convention.md)), or from a flag such as `--minor`.

## Unified

Every package gets the root version, even without commits of its own:

```text
                  Before   After a feat commit in packages/ui
root              1.4.2    1.5.0
packages/core     1.4.2    1.5.0
packages/utils    1.4.2    1.5.0
packages/ui       1.4.2    1.5.0
Tag: v1.5.0
```

Use it when the packages are always installed together and their versions must match.

## Selective

The root version is bumped from the commits, and only the packages with commits (and their dependents) get it. The others keep their version:

```text
                  Before   After a feat commit in packages/core
root              1.4.2    1.5.0
packages/core     1.4.2    1.5.0    commits
packages/ui       1.4.2    1.5.0    depends on @scope/core
packages/utils    1.4.2    1.4.2    not released
Tag: v1.5.0
```

A package not released for a while jumps to the root version on its next release: `packages/utils` goes from `1.4.2` to the root version of that release (`1.6.1`, say), not to `1.4.3`. A dependent always gets the root version, never a patch of its own version.

Use it for most monorepos: one version line, without releasing unchanged packages.

## Independent

Each package is bumped from its own commits, from its own version. A dependent without commits of its own gets a patch (with `--prerelease`, a `prepatch`, or the next `prerelease` when it already is a prerelease). The root `package.json` keeps its version:

```text
                  Before   After a feat commit in packages/core, a fix in packages/utils
root              1.0.0    1.0.0
packages/core     2.0.0    2.1.0    feat
packages/ui       0.8.3    0.8.4    depends on @scope/core
packages/utils    1.3.5    1.3.6    fix
Tags: @scope/core@2.1.0, @scope/ui@0.8.4, @scope/utils@1.3.6
```

The previous release of a package is its last `<name>@<version>` tag. A package without a tag of its current version starts at the commit that set this version in its `package.json` (see [Moving Packages to an Independent Group](./version-groups.md#moving-packages-to-an-independent-group)).

Use it when the packages evolve at different paces, with their own major versions.

## Switching Modes

Change `monorepo.versionMode`; nothing is rewritten until the next release:

- **From `independent` to `unified`/`selective`**: the next release gives the new root version to the packages it bumps (all of them in `unified`, the changed ones in `selective`). The previous release is then read from the repository tags (`v1.2.3`), not from the package tags.
- **From `unified`/`selective` to `independent`**: each package continues from its own version, and starts at the commit that set it when it has no `<name>@<version>` tag yet.

Preview the first release in the new mode with `relizy release --dry-run`.

## Mixing Modes

To release some packages in `selective` mode and others in `independent` mode in the same run, use [version groups](./version-groups.md).
