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
7. ✅ Posts to social media (optional)
8. ✅ Posts a comment on the PR/MR (optional)

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

### --canary

Publish a temporary test version without git side effects:

```bash
relizy release --canary
```

When `--canary` is used, Relizy automatically disables: changelog generation, git commit, git tag, git push, provider release (GitHub/GitLab), and social media posting. Only publishing to npm and PR comments remain active.

The canary version format is `{nextVersion}-canary.{sha}.0` (e.g., `1.3.0-canary.a3f4b2c.0`).

Use `--preid` to customize the prerelease identifier:

```bash
relizy release --canary --preid snapshot
# → 1.3.0-snapshot.a3f4b2c.0
```

See the [Canary Releases guide](/guide/canary-releases) for full details.

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

### --no-social

Skip social media posting:

```bash
relizy release --no-social
```

### --no-pr-comment

Skip PR/MR comment posting:

```bash
relizy release --no-pr-comment
```

### --pr-number

Override the auto-detected PR/MR number:

```bash
relizy release --patch --pr-number 42
```

Useful in CI/CD where the PR number is available as an environment variable:

```bash
relizy release --patch --yes --pr-number ${{ github.event.pull_request.number }}
```

### --no-provider-release

Skip provider release creation (GitHub/GitLab):

```bash
relizy release --no-provider-release
```

### --no-publish

Skip npm publishing:

```bash
relizy release --no-publish
```

### --include-private

Include private packages (packages with `"private": true` in their
`package.json`) in the bump and changelog phases. By default, private packages
are skipped entirely.

```bash
relizy release --minor --include-private
```

When enabled:

- Private packages are bumped alongside public ones.
- Private packages get their own `CHANGELOG.md`.
- Their commits are included in the aggregated root changelog.

Private packages **remain excluded** from `publish`, `provider-release`, and
`pr-comment` — even with this flag. They are versioned and documented, but
never published to a registry or announced.

This is equivalent to setting `monorepo.includePrivates: true` in
`relizy.config.ts`. See
[Monorepo Configuration — includePrivates](../config/monorepo.md#includeprivates).

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

### Canary Release

```bash
# Publish a canary version
relizy release --canary

# Canary with custom preid in CI
relizy release --canary --preid snapshot --yes

# Canary with PR comment
relizy release --canary --yes --pr-number 42
```

## See Also

- [Canary Releases](/guide/canary-releases) - Full guide on canary releases
- [bump](/cli/bump) - Version bumping only
- [changelog](/cli/changelog) - Changelog generation only
- [publish](/cli/publish) - NPM publishing only
- [provider-release](/cli/provider-release) - Provider releases only
- [pr-comment](/cli/pr-comment) - PR/MR comments only
