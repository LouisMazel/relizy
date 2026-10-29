---
title: Version Groups
description: Release several sets of packages with different version modes (e.g. selective and independent) together, in a single run.
keywords: version groups, monorepo versioning, selective and independent, multiple version lines, release groups
category: Guide
tags: [guide, versioning, monorepo, groups]
---

# {{ $frontmatter.title }}

> Only for monorepo with multiple packages

{{ $frontmatter.description }}

## When to Use Version Groups

A single [version mode](./version-modes.md) applies to every package of the monorepo. Some monorepos need more than one:

- most packages (design system, shared components, tooling) are released together in `selective` mode, on a `7.x` line;
- a few packages have their own version line (`1.x`, `2.x`) and are released in `independent` mode.

Without groups, this needs two config files run one after the other, with the independent packages listed twice (in the `packages` of the second config and in the `ignored` of the first one). The two runs have drawbacks:

- **Canary releases publish stale dependencies**: the canary versions of the first run are rolled back once published, so when the second run publishes, `workspace:*` resolves to the last stable versions of the first set of packages.
- **No single release**: two release commits, two sets of tags, two PR comments, and the first set of packages is published even if the second run fails.

Version groups release every set of packages with its own version mode in **a single run**.

## Configuration

Replace `monorepo.versionMode` and `monorepo.packages` with `monorepo.groups`:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: {
    groups: [
      {
        name: 'main',
        versionMode: 'selective',
        packages: ['packages/*', 'shared-components/*', 'tooling/*'],
      },
      {
        name: 'header',
        versionMode: 'independent',
        packages: [
          'shared-components/login-nav',
          'shared-components/related-dropdown',
          'shared-components/navigation',
        ],
        bump: { capZeroMajor: false },
        changelog: { rootChangelog: false },
      },
    ],
  },
})
```

Each group has:

| Option        | Description                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `name`        | Name of the group, used in the logs and with [`--group`](#releasing-a-single-group)                                       |
| `versionMode` | `unified`, `selective` or `independent`                                                                                   |
| `packages`    | Glob patterns of the package directories of the group                                                                     |
| `ignored`     | Glob patterns of package directories to ignore in this group, on top of `monorepo.ignored`                                |
| `bump`        | `capZeroMajor` and `dependencyTypes` of the group, overriding the global [`bump`](../config/bump.md) options              |
| `changelog`   | `rootChangelog` and `includeCommitBody` of the group, overriding the global [`changelog`](../config/changelog.md) options |

The other `monorepo` options (`ignored`, `includePrivates`) and the rest of the config apply to every group.

### Rules

- **One group per package.** When a package is matched by several groups, the group listing its **exact path** (a pattern without glob, like `shared-components/navigation`) wins, with a warning. Any other overlap (two globs, or the same exact path in two groups) is an error: list the exact path in the group the package belongs to, or exclude it with the `ignored` option of the other group.
- **At most one `unified` or `selective` group.** It owns the root `package.json` version and the repository tags (`templates.tagBody`, `v1.2.3` by default). The other groups use the `independent` mode, with one tag per package (`@scope/pkg@1.2.3`).
- **No `versionMode` nor `packages` next to `groups`.** Set them on each group.

## What a Release Does

`relizy release` processes every group in one run:

1. **Bump**: each group is bumped with its own version mode and options. The packages of the other groups are ignored by a group, so a commit touching only the packages of the `header` group never bumps the root version of the `main` group (a breaking change there no longer bumps the whole repository). The packages depending on packages of another group are bumped too, see [Dependencies Between Groups](#dependencies-between-groups).
2. **Changelog**: each group generates its changelogs. Set `changelog.rootChangelog: false` on a group to keep it out of the root `CHANGELOG.md`.
3. **Publish**: the packages of every group are published in a single order, each package after the internal packages it depends on (`dependencies`, `peerDependencies` and `optionalDependencies`), whatever their group.
4. **Commit and tags**: a single release commit, with the tags of every group.
5. **Provider releases and social posts**: one per group, as each group would do on its own.
6. **PR comment**: a single comment listing the packages of every group.

A group without relevant commits is skipped: it is not bumped, published nor tagged.

### Canary Releases

With `--canary`, the canary versions of every group are written before anything is published, and rolled back **once**, after the last package is published. The `workspace:` dependencies between groups therefore resolve to the canary versions of the run:

```bash
relizy release --canary --yes
```

### Releasing a Single Group

The global `--group` option only processes the given groups (comma-separated names):

```bash
relizy release --group header
relizy bump --group main,header --dry-run
```

It works with `release`, `bump`, `changelog`, `publish`, `provider-release` and `social`.

## Release Commit

The release commit lists the packages of every group. Unless you set [`templates.commitMessage`](../config/commit-templates.md):

- when the `unified`/`selective` group is released, the title is <code v-pre>chore(release): bump version to {{newVersion}}</code>, with its version;
- otherwise, the title is <code v-pre>chore(release): bump {{packageCount}} packages</code>;
- when an `independent` group is released, the body lists the bumped packages (<code v-pre>{{packageList}}</code>).

```text
chore(release): bump version to 7.1.0

@scope/components@7.1.0, @scope/theme@7.1.0, @scope/navigation@1.3.0
```

## Dependencies Between Groups

When a package depends on a package bumped by another group, it is bumped too, so that its published dependency ranges follow (e.g. `workspace:*` is published as the exact new version):

- in an `independent` group, the dependent gets a patch (or the matching prerelease), and its own dependents in the group follow;
- in the `unified`/`selective` group, the dependent is bumped with the root version. Without commits of its own, the group gets a patch of its root version.

Which dependencies count:

- the ones of the [`bump.dependencyTypes`](../config/bump.md#dependencytypes) of the dependent's group (`dependencies` only by default): the dependent is bumped on every bump of its dependency;
- the peer dependencies whose published range no longer accepts the new version (see [`bump.outOfRangePeers`](../config/bump.md#outofrangepeers), `bump` by default): a peer dependency declared as `workspace:*` is published as the exact version, so the dependent is bumped on every bump of its dependency; with `workspace:^`, only on a major.

With the configuration of the example above, `@scope/navigation` (peer dependency `"@scope/components": "workspace:*"`) is released with a patch each time `@scope/components` is, without any other option.

The groups are computed in dependency order, and again until no group changes when they depend on each other (a package of `main` depending on a package of `header`, itself depending on `main`). Everything is computed and confirmed before any file is written. Canary releases follow the same rules.

Two checks run before publishing (see [`publish.checkWorkspaceDependencies`](../config/publish.md#checkworkspacedependencies)):

- a `workspace:` dependency resolving to a version neither published by the release nor on the registry fails the release;
- a package not released whose published peer dependency range rejects the new version of a dependency (e.g. a group not targeted by `--group`, or with `bump.outOfRangePeers: 'warn'`) is reported with a warning, or fails the release with `bump.outOfRangePeers: 'error'`.

## Migrating from Two Configs

Given a `selective` config and an `independent` config listed in the `ignored` option of the first one:

```ts
// relizy.config.ts
export default defineConfig({
  monorepo: {
    versionMode: 'selective',
    packages: ['packages/*', 'shared-components/*'],
    ignored: ['shared-components/navigation'],
  },
})

// relizy-independent.config.ts
export default defineConfig({
  monorepo: {
    versionMode: 'independent',
    packages: ['shared-components/navigation'],
  },
  changelog: { rootChangelog: false },
})
```

Merge them into a single config, with one group per config, and drop the `ignored` list:

```ts
// relizy.config.ts
export default defineConfig({
  monorepo: {
    groups: [
      { name: 'main', versionMode: 'selective', packages: ['packages/*', 'shared-components/*'] },
      {
        name: 'navigation',
        versionMode: 'independent',
        packages: ['shared-components/navigation'],
        changelog: { rootChangelog: false },
      },
    ],
  },
})
```

The tags stay the same (`v7.0.0` for the selective group, `@scope/navigation@1.2.0` for the independent one), so the next release starts from the existing ones. Then replace the two commands of your CI with one:

```bash
# Before
relizy release --yes
relizy release --yes --config relizy-independent

# After
relizy release --yes
```
