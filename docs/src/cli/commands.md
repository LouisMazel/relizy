# CLI Commands

Complete reference for all Relizy CLI commands.

## Overview

Relizy provides five main commands:

| Command                                     | Description                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`release`](/cli/release)                   | Complete release workflow (bump + changelog + commit + tag + publish + provider release) |
| [`bump`](/cli/bump)                         | Update version in package.json                                                           |
| [`changelog`](/cli/changelog)               | Generate or update CHANGELOG.md                                                          |
| [`publish`](/cli/publish)                   | Publish packages to npm                                                                  |
| [`provider-release`](/cli/provider-release) | Create GitHub/GitLab releases                                                            |

## Global Options

These options work with all commands:

### --config

Specify which config file to use:

```bash
relizy release --config relizy.standalone
# Uses relizy.standalone.config.ts
```

### --log-level

Control logging verbosity:

```bash
relizy release --log-level debug
# Levels: silent, error, warn, info, debug
```

### --dry-run

Preview changes without making them:

```bash
relizy release --patch --dry-run
```

### --yes

Skip all interactive prompts:

```bash
relizy release --patch --yes
```

## Quick Examples

### Full Release

```bash
# Interactive - asks for confirmation
relizy release --minor

# Automatic - no prompts
relizy release --minor --yes
```

### Version Bump Only

```bash
# Bump patch version
relizy bump --patch

# Bump minor version
relizy bump --minor

# Bump major version
relizy bump --major
```

### Changelog Only

```bash
# Generate changelog
relizy changelog

# From specific version
relizy changelog --from v1.0.0
```

### Publish Only

```bash
# Publish all packages
relizy publish

# Publish specific packages
relizy publish
```

### Provider Release Only

```bash
# Create GitHub/GitLab release
relizy provider-release
```

## Monorepo-Specific Options

### Version Modes

Set in config file:

```ts
// relizy.config.ts
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: {
    versionMode: 'selective', // 'unified' | 'selective' | 'independent'
  },
})
```

## Common Workflows

### Standard Release

```bash
# 1. Make changes and commit
git add .
git commit -m "feat: new feature"

# 2. Release
relizy release --minor

# Done! Version bumped, changelog updated, committed, and tagged
```

### Release with Publishing

```bash
# Complete release + npm publish + GitHub release
relizy release --minor
```

### Preview Before Release

```bash
# See what would happen
relizy release --minor --dry-run

# If satisfied, run for real
relizy release --minor
```

### Monorepo Selective Release

```bash
# Only release changed packages
relizy release --selective --minor
```

### Manual Control

```bash
# Step 1: Bump version
relizy bump --minor

# Step 2: Generate changelog
relizy changelog

# Step 3: Commit and tag manually
git add .
git commit -m "chore(release): v1.2.0"
git tag v1.2.0

# Step 4: Publish
relizy publish

# Step 5: Create provider release
relizy provider-release
```

## Command Chaining

While Relizy doesn't support chaining directly, you can use shell operators:

```bash
# Run multiple commands
relizy bump --patch && \
relizy changelog && \
relizy publish

# With error handling
relizy bump --patch || exit 1
relizy changelog || exit 1
relizy publish || exit 1
```

## Exit Codes

Relizy uses standard exit codes:

- `0` - Success
- `1` - Error occurred
- `2` - Invalid arguments

Use in scripts:

```bash
if relizy release --patch; then
  echo "Release successful"
else
  echo "Release failed"
  exit 1
fi
```

## Debug Mode

Get detailed output for troubleshooting:

```bash
relizy release --minor --log-level debug
```

This shows:

- Git commands being executed
- File changes
- Version calculations
- Dependency resolution
- Publishing steps

## Help

Get help for any command:

```bash
# General help
relizy --help

# Command-specific help
relizy release --help
relizy bump --help
relizy changelog --help
relizy publish --help
relizy provider-release --help
```

## Next Steps

Dive deeper into each command:

- [release](release.md) - Full release workflow
- [bump](bump.md) - Version bumping
- [changelog](changelog.md) - Changelog generation
- [publish](publish.md) - NPM publishing
- [provider-release](provider-release.md) - GitHub/GitLab releases
