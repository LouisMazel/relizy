---
title: bump
description: Compute the new versions from the commits and write them to the package.json files, without changelog, commit, tag nor publication.
keywords: relizy bump, version bump, semver, prerelease, canary version, package version, monorepo versioning
category: CLI Reference
tags: [cli, bump, versioning, semver, monorepo]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Usage

```bash
relizy bump [options]
```

`bump` is the first [step of `release`](./release.md#steps). It:

1. checks the working directory is clean (unless `--no-clean`);
2. computes the version of each package from its commits (see [SemVer Convention](./../guide/semver-convention.md)), and its dependents (see [Dependency Management](./../guide/dependency-management.md));
3. asks to confirm the new versions, unless `--yes`;
4. writes them to the `package.json` files.

It exits with code `0` when no commit triggers a bump. The [global options](./commands.md#global-options) apply too (`--dry-run`, `--group`...).

## Options

| Flag                                                     | Description                                                                                                              | Config                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `--major`, `--minor`, `--patch`                          | Force the bump type, instead of the one computed from the commits                                                        | [`bump.type`](./../config/bump.md#type)                               |
| `--prerelease`, `--premajor`, `--preminor`, `--prepatch` | Bump to a prerelease version, see [Prerelease Versions](./../guide/prereleases.md#prerelease-versions)                   | [`bump.type`](./../config/bump.md#type)                               |
| `--preid <id>`                                           | Prerelease identifier: `alpha`, `beta`, `rc`...                                                                          | [`bump.preid`](./../config/bump.md#preid)                             |
| `--suffix <suffix>`                                      | With a prerelease type, replace the last number: `1.0.0-beta.0` becomes `1.0.0-beta.<suffix>`                            | -                                                                     |
| `--canary`                                               | Write a canary version, `{nextVersion}-0.canary-{sha}`, see [Canary Releases](./../guide/prereleases.md#canary-releases) | -                                                                     |
| `--force`                                                | Bump the packages even without a commit triggering a bump                                                                | -                                                                     |
| `--no-clean`                                             | Bump with uncommitted changes                                                                                            | [`bump.clean`](./../config/bump.md#clean)                             |
| `--yes`                                                  | Confirm the new versions without asking. Required without an interactive terminal (CI)                                   | [`bump.yes`](./../config/bump.md#yes)                                 |
| `--private-packages <mode>`                              | `release`: bump the private packages too, `ignore`: leave them out                                                       | [`monorepo.privatePackages`](./../config/monorepo.md#privatepackages) |

## Examples

```bash
# Preview the new versions
relizy bump --dry-run

# Computed from the commits, without confirmation
relizy bump --yes

# Force a minor
relizy bump --minor

# 1.2.0 -> 1.3.0-beta.0, then 1.3.0-beta.1
relizy bump --preminor --preid beta
relizy bump --prerelease --preid beta

# 1.3.0-beta.0 -> 1.3.0-beta.<short sha>
relizy bump --prerelease --preid beta --suffix "$(git rev-parse --short HEAD)"

# 1.2.3 -> 1.3.0-0.canary-a3f4b2c
relizy bump --canary
```

## See Also

- [release](./release.md)
- [Bump config](./../config/bump.md)
- [Version Modes](./../guide/version-modes.md)
- [`bump()`](./../api/bump.md)
