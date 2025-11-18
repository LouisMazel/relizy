---
title: release
description: Execute the complete release workflow in a single command.
keywords: relizy release, automated release, release workflow, npm publish, git tag, changelog generation
category: CLI Reference
tags: [cli, release, workflow, automation, publish]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Usage

```bash
relizy release [options]
```

## What It Does

The `release` command combines multiple operations:

1. ✅ Bumps version in package.json
2. ✅ Generates/updates CHANGELOG.md
3. ✅ Creates a git commit
4. ✅ Creates a git tag
5. ✅ Publishes to npm
6. ✅ Creates GitHub or GitLab release

## Options

### Release Type

Specify the version bump type:

```bash
# Patch release (1.0.0 → 1.0.1)
relizy release --patch

# Minor release (1.0.0 → 1.1.0)
relizy release --minor

# Major release (1.0.0 → 2.0.0)
relizy release --major
```

All available version flags: `--patch`, `--minor`, `--major`, `--prerelease`, `--prepatch`, `--preminor`, `--premajor`

If no type is specified, Relizy automatically detects it from commits.

### --no-commit

Skip creating git commit:

```bash
relizy release --no-commit
```

### --no-push

Skip pushing to remote:

```bash
relizy release --no-push
```

### --dry-run

Preview changes without executing:

```bash
relizy release --dry-run
```

### --yes

Skip all confirmations:

```bash
relizy release --yes
```

### --no-git-tag

Skip pushing git tag:

```bash
relizy release --no-git-tag
```

## Examples

### Basic Release

```bash
# Interactive release
relizy release --patch

# Output:
# → Bumping version to 1.0.1
# → Generating changelog
# → Creating commit
# → Creating tag v1.0.1
# → Pushing to remote
# ✓ Release complete!
```

### Complete Release with Publishing

```bash
relizy release --minor

# This will:
# 1. Bump to 1.1.0
# 2. Update changelog
# 3. Commit and tag
# 4. Publish to npm
# 5. Create GitHub release
```

### Monorepo Selective Release

```bash
relizy release --selective --minor

# Only packages with changes are bumped
```

### CI/CD Usage

```bash
# Automated release in CI
relizy release --patch --yes --no-clean
```

## See Also

- [bump](/cli/bump) - Version bumping only
- [changelog](/cli/changelog) - Changelog generation only
- [publish](/cli/publish) - NPM publishing only
- [provider-release](/cli/provider-release) - Provider releases only
