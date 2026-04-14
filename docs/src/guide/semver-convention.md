---
title: Semver Convention
description: How Relizy applies the Semantic Versioning 2.0.0 specification — commit-to-bump mapping, the 0.x initial-development rule, prerelease identifiers, and graduation to 1.0.0.
keywords: semver, semantic versioning, 0.x convention, initial development, breaking changes, prerelease precedence, relizy versioning
category: Guide
tags: [guide, semver, versioning, convention, initial-development, prerelease]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Overview

Relizy follows the [Semantic Versioning 2.0.0](https://semver.org/) specification to decide how to bump your packages. Given a version `MAJOR.MINOR.PATCH`:

- **MAJOR** — incremented on incompatible API changes (breaking changes).
- **MINOR** — incremented on backward-compatible new features.
- **PATCH** — incremented on backward-compatible bug fixes.

Relizy infers the bump level from your [Conventional Commits](https://www.conventionalcommits.org/) and applies a few extra rules that are described below.

## Commit Type to Bump Mapping

Each commit type is mapped to a semver level. These are Relizy's defaults — you can override them in your [config](/config/release) via the `types` option.

| Commit type                                | Default bump | Appears in changelog |
| ------------------------------------------ | ------------ | -------------------- |
| `feat`                                     | minor        | ✅ Enhancements      |
| `fix`                                      | patch        | ✅ Fixes             |
| `perf`                                     | patch        | ✅ Performance       |
| `refactor`                                 | patch        | ✅ Refactors         |
| `docs`                                     | patch        | ✅ Documentation     |
| `build`                                    | patch        | ✅ Build             |
| `types`                                    | patch        | ✅ Types             |
| `chore`, `test`, `style`, `ci`, `examples` | none         | ✅ (no bump)         |

Any commit marked with a `!` (e.g. `feat!:`) or carrying a `BREAKING CHANGE:` footer is treated as a **breaking change**, overriding the default mapping for that commit.

### Highest-Wins Rule

When a release range contains several commits with different bump levels, Relizy picks the **highest** one. `major` wins over `minor`, and `minor` wins over `patch`. A single breaking commit in a range of fixes is enough to trigger a major bump.

## Initial Development Versions (`0.x.y`)

The semver spec has a [dedicated clause for `0.y.z` versions](https://semver.org/#spec-item-4):

> Major version zero (0.y.z) is for initial development. Anything MAY change at any time. The public API SHOULD NOT be considered stable.

Graduating to `1.0.0` is a deliberate signal that the public API is now stable. Relizy therefore treats `0.x.y` versions differently from stable ones:

| Current version | Commits           | Result  | Why                                           |
| --------------- | ----------------- | ------- | --------------------------------------------- |
| `0.5.2`         | `feat!: breaking` | `0.6.0` | Breaking change bumps **minor**, not major    |
| `0.5.2`         | `feat: new stuff` | `0.6.0` | Unchanged: `feat` still bumps the minor       |
| `0.5.2`         | `fix: small fix`  | `0.5.3` | Unchanged: `fix` still bumps the patch        |
| `1.2.3`         | `feat!: breaking` | `2.0.0` | Standard behavior outside initial development |

::: tip
The same logic applies to prereleases: a breaking change on `0.5.2-beta.1` bumps to `0.6.0-beta.0`, not `1.0.0-beta.0`. See [Prerelease Versioning](./prerelease-versioning#behaviour-on-0-x-versions) for more.
:::

## Graduating to `1.0.0`

Graduating to a stable `1.0.0` is an **explicit decision**. When your public API is ready to be declared stable, pass `--major` on the command line:

```bash
relizy release --major
# 0.5.2 -> 1.0.0
```

For a prerelease, use `--premajor`:

```bash
relizy release --premajor --preid beta --tag beta
# 0.5.2 -> 1.0.0-beta.0
```

This makes the jump to `1.0.0` a deliberate act rather than an accidental side-effect of a breaking commit.

## Prerelease Identifiers

Per [semver §9](https://semver.org/#spec-item-9), a prerelease version has a suffix after a hyphen: `1.0.0-alpha.0`, `1.0.0-beta.3`, `1.0.0-rc.1`. Prereleases have **lower precedence** than the associated stable version, so `1.0.0-rc.1` < `1.0.0`.

Relizy supports any preid you like (`alpha`, `beta`, `rc`, `next`, ...) and enforces one safety rule inherited from the spec:

::: warning
You **cannot downgrade** a prerelease identifier. Going from `1.0.0-alpha.3` to `1.0.0-beta.0` is fine, but going from `1.0.0-rc.1` back to `1.0.0-beta.0` would produce a version with lower precedence, so Relizy refuses it.
:::

See [Prerelease Versioning](./prerelease-versioning) for the full prerelease lifecycle.

## Explicit Flags Override Auto-Detection

All the rules above apply to the **auto-detected** bump level derived from your commits. Explicit CLI flags — `--major`, `--minor`, `--patch`, `--premajor`, `--preminor`, `--prepatch` — represent a deliberate user intent and are always honored as-is, including the graduation from `0.x.y` to `1.0.0`.

## Alignment With Other Tools

This behavior matches what established release tools already do:

- [changesets](https://github.com/changesets/changesets)
- [semantic-release](https://github.com/semantic-release/semantic-release)
- [release-please](https://github.com/googleapis/release-please)

All of them cap automatic major bumps while a package is in the `0.x` range and require an explicit action to graduate.

## Next Steps

- [Prerelease Versioning](./prerelease-versioning) — how prereleases interact with the convention.
- [Version Modes](./version-modes) — unified, selective, and independent monorepo strategies.
- [Changelog Generation](./changelog) — how commits map to bump levels.
