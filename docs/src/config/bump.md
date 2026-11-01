---
title: Bump Configuration
description: Configure version bumping behavior.
keywords: bump config, version bump settings, semver config, prerelease config, dependency bumping
category: Configuration
tags: [config, bump, versioning, semver]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## type

Set version type:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  bump: {
    type: 'minor', // 'major' | 'minor' | 'patch' | 'prerelease' | 'release' | 'prepatch' | 'preminor' | 'premajor'
  },
})
```

## preid

Set prerelease identifier:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  bump: {
    preid: 'beta', // For pre-releases like 1.0.0-beta.1
  },
})
```

## dependencyTypes

Dependency fields whose internal dependencies bump the package: a package is bumped (a patch, or the matching prerelease) on **every** bump of the packages it lists in these fields.

- **Type:** `('dependencies' | 'devDependencies' | 'peerDependencies')[]`
- **Default:** `['dependencies']`

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  bump: {
    dependencyTypes: ['dependencies', 'devDependencies', 'peerDependencies'],
  },
})
```

This option only drives which dependents get bumped: the [publish order](./publish.md#checkworkspacedependencies) always follows `dependencies`, `peerDependencies` and `optionalDependencies`.

With [version groups](/guide/version-groups#dependencies-between-groups), each group can set its own `dependencyTypes`, which also decides whether its packages are bumped when they depend on packages bumped by another group.

::: tip Peer dependencies
`peerDependencies` are not in `dependencyTypes` by default: a package is not bumped on **every** bump of its peer dependencies, only when its published range no longer accepts the new version, see [`outOfRangePeers`](#outofrangepeers). Add `peerDependencies` to release it on every bump of its peer dependencies.
:::

## outOfRangePeers

What to do with a package that is not bumped while the range of one of its peer dependencies, as published, no longer accepts the new version of that dependency.

- **Type:** `'bump' | 'warn' | 'error'`
- **Default:** `'bump'`

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  bump: {
    outOfRangePeers: 'warn',
  },
})
```

The package manager publishes a `workspace:` specifier with the version the dependency has at that time. When the dependency is released again, the range published by the package may no longer accept it, and the consumers of the package get peer dependency errors (npm) or warnings (pnpm):

| Peer dependency | Published as | Out of range when the dependency gets |
| --------------- | ------------ | ------------------------------------- |
| `workspace:*`   | `6.19.1`     | any new version                       |
| `workspace:~`   | `~6.19.1`    | a minor, a major or a prerelease      |
| `workspace:^`   | `^6.19.1`    | a major or a prerelease               |
| `^6.0.0`        | `^6.0.0`     | a major or a prerelease               |

- `bump`: the package is bumped as a dependent, so it is released with an up-to-date range. Its own dependents follow, as for [`dependencyTypes`](#dependencytypes). It also works across [version groups](/guide/version-groups#dependencies-between-groups). The packages not part of the release (e.g. a group not targeted by `--group`) are reported with a warning before publishing.
- `warn`: the package is not bumped; Relizy warns before publishing.
- `error`: the release fails before publishing anything.

A package whose range still accepts the new version (`workspace:^` on a minor) is left untouched: unlike `dependencyTypes: ['peerDependencies']`, it is only released when needed.

::: info Behavior change
Before this option, such packages were never bumped. Set `outOfRangePeers: 'warn'` to keep that behavior while being told about them.
:::

### Prereleases

The ranges are checked as npm does: a range rejects a prerelease unless it targets the same version (`^6.19.1` rejects `6.20.0-beta.0`, `^7.0.0-beta.0` accepts `7.0.0-beta.1`). pnpm accepts these prereleases, but the consumers of a package may use npm, which fails with `ERESOLVE`.

So with `workspace:^`, a canary or a beta of the dependency also releases the package, as a prerelease with a range accepting it. The stable releases keep the rule of the table above.

### Breaking changes

The version the package gets depends on the change of its dependency:

| Dependency                                         | Package (bumped with its peer dependency)                          |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| a minor or a patch (`6.19.1` to `6.20.0`)          | a patch: `1.2.0` to `1.2.1`                                        |
| a breaking change (`6.19.1` to `7.0.0`)            | a major: `1.2.0` to `2.0.0`                                        |
| a breaking change, package in `0.x`                | a minor: `0.2.18` to `0.3.0` (see [`capZeroMajor`](#capzeromajor)) |
| a breaking prerelease (`6.19.1` to `7.0.0-beta.0`) | a premajor: `1.2.0` to `2.0.0-beta.0`                              |

A breaking change is a new major, or a new minor in `0.x`: the range `^6.19.1` does not accept `7.0.0`. Once released with `^7.0.0`, the package requires its consumers to upgrade the dependency too, which is a breaking change for them. A package with commits of its own gets the highest of both bumps (`fix` and a breaking peer dependency: a major).

This rule applies to every package released while its published range rejects a breaking change of its peer dependency, whatever `outOfRangePeers` (also with `warn`, `error` or `dependencyTypes: ['peerDependencies']`).

In the `unified` and `selective` modes, the packages share the version of the root:

- a peer dependency on a package of the same group needs nothing more: its breaking commit already gives a major to the whole group;
- a peer dependency on a package of another [version group](/guide/version-groups#dependencies-between-groups) making a breaking change gives a major to the root version, so to every package released by the group (canary included).

A range accepting several majors (`"^6.0.0 || ^7.0.0"`) still accepts the new version: the package is neither bumped nor given a major.

## clean

Check if there are any uncommitted changes before bumping. If the working directory is not clean, the bump will be aborted:

- **Type:** `boolean`
- **Default:** `true`

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  bump: {
    clean: true,
  },
})
```

## yes

Skip the confirmation prompt about bumping packages:

- **Type:** `boolean`
- **Default:** `false`

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  bump: {
    yes: true,
  },
})
```

## capZeroMajor

Cap commit-detected `major` bumps to `minor` while the current version is in the
`0.x.y` range (semver [§4](https://semver.org/#spec-item-4), initial
development). This prevents a breaking change from graduating a `0.x` package to
`1.0.0` automatically.

- **Type:** `boolean`
- **Default:** `true`

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  bump: {
    capZeroMajor: false, // a breaking change bumps 0.x.y straight to 1.0.0
  },
})
```

With the default (`true`), a breaking commit on `0.5.2` bumps to `0.6.0`. Set it
to `false` when a `0.x` package is production-ready and you want breaking changes
to follow strict semver (`0.5.2` → `1.0.0`).

::: tip
This only affects **commit-based** detection. Explicit CLI release types
(`--major`, `--premajor`, …) always graduate and are never capped. Once the
package reaches `1.x`, this option is a no-op.
:::

## Canary Mode

When using `--canary`, the `preid` option is used as the canary prerelease identifier. If not set, it defaults to `canary`.

```bash
# Uses default preid "canary"
relizy release --canary
# → 1.3.0-0.canary-a3f4b2c

# Uses custom preid from config or CLI
relizy release --canary --preid snapshot
# → 1.3.0-0.snapshot-a3f4b2c
```

The `preid` value is also used as the npm dist-tag for canary releases. See the [Canary Releases guide](/guide/canary-releases) for full details.

## Complete Example

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  bump: {
    type: 'prerelease',
    preid: 'beta',
    dependencyTypes: ['dependencies', 'devDependencies', 'peerDependencies'],
    outOfRangePeers: 'bump',
    yes: true,
  },
})
```

Usage:

```bash
relizy bump
# Results in: 1.0.0 → 1.0.0-beta.0
```
