---
title: Dependency Management
description: How Relizy bumps the packages depending on a released package in a monorepo - dependency types, transitive dependents, peer dependency ranges, workspace protocol, catalogs and ignored packages.
keywords: dependency management, monorepo dependencies, dependents, transitive dependencies, dependencyTypes, workspace protocol, peer dependencies, outOfRangePeers, pnpm catalog, bun catalog, yarn catalog
category: Guide
tags: [guide, dependencies, monorepo, workspace]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Dependents

When a package is released, the packages of the workspace depending on it are released too, so that they are published with its new version. A package is a dependent when it lists the released package in one of the fields of [`bump.dependencyTypes`](./../config/bump.md#dependencytypes) (`['dependencies']` by default), whatever the range it uses.

The dependents are followed transitively:

```text
@myorg/app  ──dependencies──▶  @myorg/ui  ──dependencies──▶  @myorg/core
```

A `fix` commit in `packages/core` releases `@myorg/core`, then `@myorg/ui` (depends on core), then `@myorg/app` (depends on ui). A diamond (`app` depending on `ui` and `admin`, both depending on `core`) releases each package once.

To also follow the peer or dev dependencies, list their fields:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  bump: {
    dependencyTypes: ['dependencies', 'peerDependencies'],
  },
})
```

The list replaces the default one: keep `dependencies` in it. Without `peerDependencies` in the list, a package is still released when its published peer dependency range rejects the new version, see [Peer Dependencies](#peer-dependencies).

## Version of a Dependent

What a dependent gets depends on the [version mode](./version-modes.md):

| Mode          | Dependent without commits of its own                                                     |
| ------------- | ---------------------------------------------------------------------------------------- |
| `unified`     | Every package is released with the root version anyway                                   |
| `selective`   | The root version of the release, like the packages with commits (`1.4.2` to `1.6.0`)     |
| `independent` | A patch of its own version (with `--prerelease`, a `prepatch`, or the next `prerelease`) |

A dependent with commits of its own is bumped from its commits, as any package. In `independent` mode, for the example above with a `feat` commit in `core`:

```text
@myorg/core   2.0.0 → 2.1.0   feat
@myorg/ui     1.5.0 → 1.5.1   depends on core
@myorg/app    0.3.2 → 0.3.3   depends on ui
```

Relizy only writes the `version` of the released `package.json` files: it never rewrites the dependency ranges. The ranges published are the ones of the [workspace protocol](#workspace-protocol), replaced by the package manager.

## Peer Dependencies

A peer dependency declared as `workspace:*` is published as the exact version of the dependency, `workspace:^` as `^<version>`. When the new version of the dependency falls out of the published range, the consumers of the package get peer dependency errors (npm) or warnings (pnpm). With [`bump.outOfRangePeers`](./../config/bump.md#outofrangepeers) (`bump` by default), Relizy releases these packages too, even without `peerDependencies` in `dependencyTypes`:

- `workspace:*`: on every release of the dependency; `workspace:^`: on a major, a minor in `0.x`, or a prerelease (the ranges are checked as npm does, `^6.19.1` rejects `6.20.0-beta.0`);
- when the dependency makes a breaking change (`6.19.1` to `7.0.0`), the package is bumped as for a breaking commit (a minor in `0.x` with [`capZeroMajor`](./../config/bump.md#capzeromajor)), as its consumers have to upgrade the dependency too.

```text
@myorg/core   2.0.0 → 3.0.0   breaking commit
@myorg/ui     1.5.0 → 2.0.0   peer "@myorg/core": "workspace:^", published as "^2.0.0"
```

An explicit release type (`--patch`, `--minor`, `--major`) applies as is: it does not turn into a major for a breaking peer dependency.

## Workspace Protocol

Declare the internal dependencies with the `workspace:` protocol of pnpm, yarn and bun:

```json
{
  "dependencies": {
    "@myorg/core": "workspace:*"
  }
}
```

The package manager replaces it when publishing: `workspace:*` with the exact version, `workspace:^` with `^1.2.0`, `workspace:~` with `~1.2.0`. An explicit range (`"^1.0.0"`, `"workspace:^1.0.0"`) is published as is, and Relizy does not update it.

Before publishing, Relizy checks that every `workspace:` dependency resolves to a version published by the release or already on the registry, see [`publish.checkWorkspaceDependencies`](./../config/publish.md#checkworkspacedependencies). The packages are published in dependency order (`dependencies`, `peerDependencies` and `optionalDependencies`, whatever `dependencyTypes`), see [Publish](./../config/publish.md).

## Catalogs

The catalogs declare the versions of the dependencies once, referenced with `catalog:` (the default catalog) or `catalog:<name>`:

- pnpm: `catalog` and `catalogs` of `pnpm-workspace.yaml`
- yarn 4.10+: `catalog` and `catalogs` of `.yarnrc.yml`
- bun: `catalog` and `catalogs` of the root `package.json`, or of its `workspaces` field

```yaml
# pnpm-workspace.yaml
catalog:
  vue: ^3.5.0
catalogs:
  vue2:
    vue: ^2.7.16
```

A commit changing an entry of a catalog belongs to the packages referencing this entry in their `dependencies`, `devDependencies`, `peerDependencies` or `optionalDependencies`, as if it had edited their `package.json`. In `selective` and `independent` mode, it decides which packages are released; in every mode, the commit appears in their changelogs. Its type decides the bump, as for any commit:

| Commit                           | Changed entry       | Result                                                   |
| -------------------------------- | ------------------- | -------------------------------------------------------- |
| `fix(deps): update vue to 3.5`   | `vue` of `catalog`  | The packages using `vue` with `catalog:` get a patch     |
| `chore: update vitest`           | `vitest`            | The commit belongs to the packages using vitest, no bump |
| `chore: allow the esbuild build` | none (not an entry) | No package gets the commit                               |

The dependents of the released packages then follow `dependencyTypes`, as usual. The package manager replaces `catalog:` with the range of the catalog when publishing.

## Between Version Groups

With [version groups](./version-groups.md), a package depending on a package bumped by another group is bumped too, following the `dependencyTypes` of its own group and the out-of-range peer dependencies. See [Dependencies Between Groups](./version-groups.md#dependencies-between-groups).

## Circular Dependencies

A cycle between packages (`ui → core → ui`) is reported with a warning (`Circular dependency detected`), and the release goes on: each package of the cycle is released once. Break the cycle to get a reliable publish order.

## Ignored Packages

The packages matched by [`monorepo.ignored`](./../config/monorepo.md#ignored) (path globs) are left out of the release: they are never bumped, changelogged nor published, and they do not release their dependents. In `unified` and `selective` mode, a commit only changing ignored packages does not bump the root version.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: {
    versionMode: 'selective',
    packages: ['packages/*', 'examples/*'],
    ignored: ['examples/*'],
  },
})
```

`monorepo.ignorePackageNames` (exact package names, no glob) is deprecated: use `ignored`. The private packages follow [`monorepo.privatePackages`](./../config/monorepo.md#privatepackages).

## Checking the Dependents

Preview the packages a release bumps before running it:

```bash
relizy release --dry-run
```

The `preview_release` tool of the [MCP server](./ai-agents.md) also tells why each package is released (its commits, a dependency, a peer dependency). A dependent that is not bumped usually lists the package in a field missing from `dependencyTypes`, or is ignored.
