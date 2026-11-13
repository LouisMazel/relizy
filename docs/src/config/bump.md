---
title: Bump Configuration
description: Reference of the bump options - release type, prerelease identifier, clean check, confirmation, dependency bumps, out-of-range peer dependencies and the 0.x cap.
metaDescription: 'Reference of the bump options: release type, prerelease identifier, confirmation, dependency bumps, out-of-range peers and the 0.x cap.'
keywords: bump config, release type, preid, prerelease, dependencyTypes, dependents, outOfRangePeers, peer dependencies, capZeroMajor, clean, yes
category: Configuration
tags: [config, bump, versioning, semver, dependencies]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  bump: {
    dependencyTypes: ['dependencies', 'peerDependencies'],
    dependents: 'out-of-range',
    outOfRangePeers: 'bump',
  },
})
```

## type

- **Type:** `'release' | 'major' | 'minor' | 'patch' | 'prerelease' | 'premajor' | 'preminor' | 'prepatch'`
- **Default:** `'release'`
- **CLI:** `--major`, `--minor`, `--patch`, `--prerelease`, `--premajor`, `--preminor`, `--prepatch`

`release` computes the bump from the commits (see [Semver Convention](./../guide/semver-convention.md)) and graduates a prerelease to its stable version. The other types force the bump, except `prerelease`: from a stable version, it computes the bump from the commits and makes it a prerelease (`1.0.0` with a `feat` gives `1.1.0-beta.0`); from a prerelease, it increments it (`1.1.0-beta.0` to `1.1.0-beta.1`). See [Prereleases](./../guide/prereleases.md#prerelease-versions).

Without a type flag, the CLI uses `bump.type` of the config, or of the [profile](./profiles.md), as the API does (before relizy 2.3.0, the CLI always used `release`): a config with `type: 'prerelease'` releases a prerelease on every `relizy release`, and `release-type: auto` of the [GitHub Action](./../guide/github-actions.md) and of the GitLab component no longer follows the commits alone. A flag (`--minor`, `--prerelease`...) still wins over it.

## preid

- **Type:** `string`
- **Default:** none
- **CLI:** `--preid <id>`

Prerelease identifier (`alpha`, `beta`, `rc`) of the `pre*` types. It needs a prerelease type: `release` with a `preid` is an error. It does not set the npm dist-tag (see [`publish.tag`](./publish.md#tag)). For canary versions, see [Canary Releases](./../guide/prereleases.md#canary-releases).

## suffix

- **Type:** `string`
- **Default:** none
- **CLI:** `--suffix <suffix>`

Custom suffix of the prerelease versions: replaces the last `.X` with `.suffix` (`1.0.0-beta.0` gives `1.0.0-beta.suffix`). A [profile](./profiles.md) can set it.

## clean

- **Type:** `boolean`
- **Default:** `true`
- **CLI:** `--no-clean`

With [`release.clean`](./release.md), fail when the working directory has uncommitted changes. Otherwise the changes are kept, and relizy asks a confirmation (interactive terminal, outside of the CI) when they touch files the release commits (`package.json`, `CHANGELOG.md`).

## yes

- **Type:** `boolean`
- **Default:** `false`
- **CLI:** `--yes`

Skip the confirmation of the new versions. Required outside of an interactive terminal (CI): `bump` and `release` fail without it.

## dependencyTypes

- **Type:** `('dependencies' | 'devDependencies' | 'peerDependencies')[]`
- **Default:** `['dependencies']`

Dependency fields whose internal dependencies bump the package: a package is bumped (a patch, or the matching prerelease) when its published range rejects the new version of a package it lists in these fields, or on every bump of it with [`dependents: 'always'`](#dependents); its own dependents are then checked in turn. The list replaces the default one: list `dependencies` too to keep it. See [Dependency Management](./../guide/dependency-management.md).

`peerDependencies` is not included by default: a package is then bumped only when the published range of its peer dependency rejects the new version, see [`outOfRangePeers`](#outofrangepeers).

This option only decides which dependents are bumped. The publish order always follows `dependencies`, `peerDependencies` and `optionalDependencies`: each package is published after the internal packages it depends on. With [version groups](./../guide/version-groups.md#dependencies-between-groups), each group can set its own `dependencyTypes`, which also decides whether its packages follow the bumps of another group.

## dependents

- **Type:** `'out-of-range' | 'always'`
- **Default:** `'out-of-range'`

When a package is bumped because of an internal dependency listed in one of the [`dependencyTypes`](#dependencytypes) fields:

- `out-of-range`: only when the range the package was published with rejects the new version of the dependency, as for [`outOfRangePeers`](#outofrangepeers). A package whose range accepts the new version is not released: a fresh install of its current version already resolves the new version of the dependency.
- `always`: on every bump of the dependency, e.g. for a package that bundles its dependency.

| Dependency                  | Dependency bump           | `out-of-range`               | `always` |
| --------------------------- | ------------------------- | ---------------------------- | -------- |
| `workspace:^`               | `5.4.0` to `5.5.0`        | not released                 | a patch  |
| `workspace:^`               | `5.4.0` to `6.0.0`        | a patch                      | a patch  |
| `workspace:^`               | `0.4.0` to `0.5.0`        | a patch                      | a patch  |
| `workspace:^`               | `5.4.0` to `5.5.0-beta.0` | a patch (npm rejects it)     | a patch  |
| `workspace:~`               | `5.4.0` to `5.4.1`        | not released                 | a patch  |
| `workspace:*`               | any                       | a patch                      | a patch  |
| `catalog:`, `link:`, `npm:` | any                       | a patch (not a semver range) | a patch  |
| `^5.0.0`                    | `5.4.0` to `5.5.0`        | not released                 | a patch  |

The dependents are then checked in turn: with `app` depending on `ui` depending on `core`, `app` is only released when its range rejects the new version of `ui`. A dependent with commits of its own is bumped from its commits, whatever its ranges. With [version groups](./../guide/version-groups.md#dependencies-between-groups), the ranges are checked against the bumps of the other groups, and a `unified` or `selective` group whose packages all accept the new versions is not released.

A dependent released out of range gets a patch, also when its dependency makes a breaking change: a dependency is installed for the package, its consumers do not have to upgrade it. Only a [peer dependency](#breaking-changes) turns it into a major.

## outOfRangePeers

- **Type:** `'bump' | 'warn' | 'error'`
- **Default:** `'bump'`

What to do with a package not bumped while the range of one of its peer dependencies, as published, rejects the new version of that dependency. The package manager publishes a `workspace:` specifier with the version the dependency has at that time:

| Peer dependency | Published as | Out of range when the dependency gets |
| --------------- | ------------ | ------------------------------------- |
| `workspace:*`   | `6.19.1`     | any new version                       |
| `workspace:~`   | `~6.19.1`    | a minor, a major or a prerelease      |
| `workspace:^`   | `^6.19.1`    | a major or a prerelease               |
| `^6.0.0`        | `^6.0.0`     | a major or a prerelease               |

- `bump`: the package is bumped as a dependent and released with an up-to-date range; its own dependents follow, across [version groups](./../guide/version-groups.md#dependencies-between-groups) too. The packages outside of the release (a group not targeted by `--group`) are reported with a warning before publishing.
- `warn`: the package is not bumped, relizy warns before publishing.
- `error`: the release fails before publishing anything.

The warnings and the error come from the publish step of `relizy release`, and not when [`publish.checkWorkspaceDependencies`](./publish.md#checkworkspacedependencies) is `false`: `relizy bump`, `relizy publish` alone and a release without publication (`--no-publish`) report nothing.

A package whose range still accepts the new version (`workspace:^` on a minor) is left untouched: unlike `dependencyTypes: ['peerDependencies']`, it is only released when needed. A range accepting several majors (`^6.0.0 || ^7.0.0`) still accepts the new version.

### Prereleases

The ranges are checked as npm does: a range rejects a prerelease unless it targets the same version (`^6.19.1` rejects `6.20.0-beta.0`, `^7.0.0-beta.0` accepts `7.0.0-beta.1`). pnpm accepts these prereleases, the consumers using npm fail with `ERESOLVE`. With `workspace:^`, a canary or a beta of the dependency therefore also releases the package, as a prerelease.

### Breaking changes

| Dependency                                         | Package released with it                                           |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| a minor or a patch (`6.19.1` to `6.20.0`)          | a patch: `1.2.0` to `1.2.1`                                        |
| a breaking change (`6.19.1` to `7.0.0`)            | a major: `1.2.0` to `2.0.0`                                        |
| a breaking change, package in `0.x`                | a minor: `0.2.18` to `0.3.0` (see [`capZeroMajor`](#capzeromajor)) |
| a breaking prerelease (`6.19.1` to `7.0.0-beta.0`) | a premajor: `1.2.0` to `2.0.0-beta.0`                              |

A breaking change is a new major, or a new minor in `0.x`, rejected by `^oldVersion`: once released with the new range, the package requires its consumers to upgrade the dependency too. Whatever `outOfRangePeers`, a released package whose published range rejects a breaking change of its peer dependency is bumped as for a breaking commit (a minor in `0.x` with [`capZeroMajor`](#capzeromajor)); with commits of its own, it gets the highest of both bumps. In a `unified` or `selective` group, the root version is bumped likewise when such a peer belongs to another group.

In `unified` and `selective` mode, the packages share the root version: a peer dependency on a package of the same group needs nothing more (its breaking commit already bumps the group), a peer dependency on a package of another version group making a breaking change gives a major to the root version (canary included).

## capZeroMajor

- **Type:** `boolean`
- **Default:** `true`

Cap the `major` bumps detected from the commits to `minor` while the version is `0.x.y` (semver [§4](https://semver.org/#spec-item-4)): a breaking commit on `0.5.2` gives `0.6.0` instead of `1.0.0`. Set it to `false` to follow strict semver. The explicit types (`--major`, `--premajor`) are never capped, and the option has no effect from `1.0.0`.
