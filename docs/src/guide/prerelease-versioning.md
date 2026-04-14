---
title: Prerelease Versioning
description: How Relizy handles prerelease version bumping with conventional commits.
keywords: relizy prerelease, beta versioning, alpha versioning, conventional commits prerelease, semver prerelease
category: Guide
tags: [guide, prerelease, versioning, beta, alpha, rc]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## How It Works

When you're in a prerelease cycle (e.g. publishing beta versions), Relizy analyzes your commits to determine whether the **base version** should increase.

The base version is the `major.minor.patch` portion of a prerelease version. For example, in `1.2.3-beta.4`, the base version is `1.2.3`.

### Example Lifecycle

Starting from stable version `1.2.1`:

| Step | Commits              | Result         | Explanation                                    |
| ---- | -------------------- | -------------- | ---------------------------------------------- |
| 1    | `fix: resolve bug`   | `1.2.2-beta.0` | First prerelease, fix implies patch bump       |
| 2    | `fix: another fix`   | `1.2.2-beta.1` | Same level (patch), just increment counter     |
| 3    | `feat: new feature`  | `1.3.0-beta.0` | feat implies minor > patch, base bumps up      |
| 4    | `feat: another feat` | `1.3.0-beta.1` | Same level (minor), just increment counter     |
| 5    | `fix: small fix`     | `1.3.0-beta.2` | fix < minor, no base change, increment counter |
| 6    | `feat!: breaking`    | `2.0.0-beta.0` | Breaking implies major > minor, base bumps up  |

### Key Rules

1. **Base version only goes up, never down.** A `fix` commit won't lower the base from minor-level to patch-level.
2. **Counter resets to 0** when the base version changes.
3. **Counter increments** when the base version stays the same.
4. **Non-semver commits** (chore, test, ci, etc.) always increment the counter without changing the base.

### Behaviour on `0.x` versions

When your package is in initial development (`0.x.y`), a breaking change does **not** graduate the base version to `1.0.0`. It bumps the minor instead. See [Semver Convention](./semver-convention#initial-development-versions-0-x-y) for the full rationale.

| Step | Starting from  | Commits           | Result         |
| ---- | -------------- | ----------------- | -------------- |
| 1    | `0.5.2`        | `feat!: breaking` | `0.6.0-beta.0` |
| 2    | `0.6.0-beta.0` | `feat: add foo`   | `0.6.0-beta.1` |
| 3    | `0.6.0-beta.1` | `feat!: breaking` | `0.7.0-beta.0` |

To explicitly graduate to `1.0.0`, use `--major` (or `--premajor` for a prerelease).

## Starting a Prerelease

From a stable version, use `--prerelease` with `--preid`:

```bash
# Auto-detect bump level from commits
relizy release --prerelease --preid beta --tag beta
# If commits contain feat: 1.0.0 -> 1.1.0-beta.0
# If commits contain fix:  1.0.0 -> 1.0.1-beta.0

# Or specify the bump level explicitly
relizy release --preminor --preid beta --tag beta
# 1.0.0 -> 1.1.0-beta.0
```

## Continuing a Prerelease

Once in a prerelease cycle, keep using `--prerelease`:

```bash
relizy release --prerelease --preid beta --tag beta
```

Relizy will automatically:

- Analyze your new commits
- Determine if the base version needs to increase
- Either bump the base version (with counter reset) or increment the counter

## Graduating to Stable

When ready to release a stable version:

```bash
relizy release --patch   # Graduates to the base version (e.g. 1.3.0-beta.5 -> 1.3.0)
# or
relizy release           # Auto-detects from commits
```

## Changing Preid

You can upgrade the prerelease identifier (e.g. from alpha to beta to rc):

```bash
# Currently on 1.2.0-alpha.3
relizy release --prerelease --preid beta --tag beta
# -> 1.2.0-beta.0
```

::: warning
You cannot downgrade prerelease identifiers (e.g. from `rc` to `beta`). Relizy will throw an error if you try.
:::
