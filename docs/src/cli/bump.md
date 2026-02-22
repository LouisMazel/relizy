---
title: bump
description: Update version numbers in package.json files according to the release type and commits.
keywords: relizy bump, version bump, semver, package version, monorepo versioning, npm version
category: CLI Reference
tags: [cli, bump, versioning, semver, monorepo]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Usage

```bash
relizy bump [options]
```

## What It Does

The `bump` command:

1. ✅ Calculates the new version
2. ✅ Updates package.json
3. ✅ Updates dependencies in monorepos
4. ❌ Does NOT create commits or tags
5. ❌ Does NOT generate changelogs

## Options

### Release Type

```bash
# Patch (1.0.0 → 1.0.1)
relizy bump --patch

# Minor (1.0.0 → 1.1.0)
relizy bump --minor

# Major (1.0.0 → 2.0.0)
relizy bump --major
```

### --dry-run

Preview version changes:

```bash
relizy bump --minor --dry-run
```

### --canary

Compute and write a canary version without publishing:

```bash
relizy bump --canary
# 1.2.3 → 1.3.0-canary.a3f4b2c.0
```

The canary version is based on the next version auto-detected from commits, with a canary suffix appended. Use `--preid` to customize the prerelease identifier:

```bash
relizy bump --canary --preid snapshot
# 1.2.3 → 1.3.0-snapshot.a3f4b2c.0
```

See the [Canary Releases guide](/guide/canary-releases) for full details.

### --yes

Skip confirmations:

```bash
relizy bump --minor --yes
```

## Examples

### Single Package

```bash
relizy bump --patch

# Before: "version": "1.0.0"
# After:  "version": "1.0.1"
```

### Monorepo

```bash
relizy bump --minor

# packages/core: 1.0.0 → 1.1.0
# packages/ui: 1.0.0 → 1.1.0 (depends on core)
```

### Preview Changes

```bash
relizy bump --major --dry-run

# Output:
# Packages to bump:
# ✓ @myorg/core: 1.5.0 → 2.0.0
# ✓ @myorg/ui: 1.5.0 → 2.0.0
```

### Canary Version

```bash
relizy bump --canary

# Before: "version": "1.2.3"
# After:  "version": "1.3.0-canary.a3f4b2c.0"
```

## See Also

- [Canary Releases](/guide/canary-releases) - Full guide on canary releases
- [release](release.md) - Full release workflow
