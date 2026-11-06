---
title: Semver Convention
description: How Relizy turns Conventional Commits into Semantic Versioning bumps - the default commit type to bump table, breaking changes, the 0.x rule of bump.capZeroMajor, prerelease identifiers and graduation to 1.0.0.
metaDescription: 'How Relizy turns Conventional Commits into semver bumps: commit types, breaking changes, the 0.x rule, prerelease identifiers and 1.0.0.'
keywords: semver, semantic versioning, conventional commits, commit types, version bump, breaking change, capZeroMajor, 0.x versions, initial development, prerelease identifier, graduate to 1.0.0
category: Guide
tags: [guide, semver, versioning, convention, conventional-commits, prerelease]
---

# {{ $frontmatter.title }}

Relizy follows [Semantic Versioning 2.0.0](https://semver.org/): in `MAJOR.MINOR.PATCH`, the major is for breaking changes, the minor for new features and the patch for fixes. It reads the bump of each release from the [Conventional Commits](https://www.conventionalcommits.org/) since the previous one.

## Commit Types

The default types, their bump and their section in the changelog:

| Commit type | Bump  | Changelog section |
| ----------- | ----- | ----------------- |
| `feat`      | minor | 🚀 Enhancements   |
| `perf`      | patch | 🔥 Performance    |
| `fix`       | patch | 🩹 Fixes          |
| `refactor`  | patch | 💅 Refactors      |
| `docs`      | patch | 📖 Documentation  |
| `build`     | patch | 📦 Build          |
| `types`     | patch | 🌊 Types          |
| `chore`     | none  | 🏡 Chore          |
| `examples`  | none  | 🏀 Examples       |
| `test`      | none  | ✅ Tests          |
| `style`     | none  | 🎨 Styles         |
| `ci`        | none  | 🤖 CI             |

A commit with a `!` after its type or scope (`feat!:`, `fix(api)!:`) or a `BREAKING CHANGE:` footer is a **breaking change**: it bumps the major, whatever its type. A commit whose type is not in the `types` of the config, or set to `false`, is left out of the changelog and bumps nothing, even when breaking.

Change the titles, the bumps or hide a type with the [`types`](./../config/changelog.md#types) option.

When the commits of a release have different bumps, the highest wins: one breaking commit among fixes is a major. Commits without bump (`chore`, `test`...) release nothing.

A package whose peer dependency makes a breaking change rejected by its published range is bumped as for a breaking commit. See [`bump.outOfRangePeers`](./../config/bump.md#outofrangepeers).

## Initial Development Versions (0.x)

Semver [reserves the `0.y.z` versions](https://semver.org/#spec-item-4) for initial development: the public API is not stable yet. Graduating to `1.0.0` declares it stable, so Relizy does not do it on its own. With [`bump.capZeroMajor`](./../config/bump.md#capzeromajor) (`true` by default), a breaking change bumps the minor of a `0.x` version:

| Current version | Commit            | Next version |
| --------------- | ----------------- | ------------ |
| `0.5.2`         | `feat!: breaking` | `0.6.0`      |
| `0.5.2`         | `feat: new stuff` | `0.6.0`      |
| `0.5.2`         | `fix: small fix`  | `0.5.3`      |
| `1.2.3`         | `feat!: breaking` | `2.0.0`      |

The same applies to prereleases: a breaking change on `0.5.2-beta.1` gives `0.6.0-beta.0`, not `1.0.0-beta.0`.

To let a breaking change bump `0.x` to `1.0.0`, turn it off:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  bump: {
    capZeroMajor: false,
  },
})
```

## Graduating to 1.0.0

The rules above apply to the bump computed from the commits. The release type flags (`--major`, `--minor`, `--patch`, `--premajor`, `--preminor`, `--prepatch`) are applied as they are, never capped. Graduate to `1.0.0` with `--major`, or start its prereleases with `--premajor`:

```bash
relizy release --major
# 0.5.2 -> 1.0.0

relizy release --premajor --preid beta
# 0.5.2 -> 1.0.0-beta.0
```

## Prerelease Identifiers

A [prerelease](https://semver.org/#spec-item-9) has a suffix after a hyphen: `1.0.0-alpha.0`, `1.0.0-beta.3`, `1.0.0-rc.1`. It has a lower precedence than its stable version: `1.0.0-rc.1` < `1.0.0`. Relizy accepts any identifier (`alpha`, `beta`, `rc`, `next`...).

::: warning
An identifier can only move forward: `1.0.0-alpha.3` to `1.0.0-beta.0` works, `1.0.0-rc.1` to `1.0.0-beta.0` would lower the precedence and Relizy refuses it.
:::

See [Prereleases](./prereleases.md#prerelease-versions) for the whole lifecycle, and the canary versions.
