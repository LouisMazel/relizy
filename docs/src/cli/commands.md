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
relizy release --config standalone
# Uses changelog.standalone.config.ts
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
npx relizy release --minor

# Automatic - no prompts
npx relizy release --minor --yes

# With publishing
npx relizy release --minor --publish --provider-release
```

### Version Bump Only

```bash
# Bump patch version
npx relizy bump --patch

# Bump minor version
npx relizy bump --minor

# Bump major version
npx relizy bump --major
```

### Changelog Only

```bash
# Generate changelog
npx relizy changelog

# From specific version
npx relizy changelog --from v1.0.0
```

### Publish Only

```bash
# Publish all packages
npx relizy publish

# Publish specific packages
npx relizy publish --packages core,utils
```

### Provider Release Only

```bash
# Create GitHub/GitLab release
npx relizy provider-release
```

## Monorepo-Specific Options

### --packages

Select specific packages:

```bash
relizy release --minor --packages core,utils
```

### Version Modes

Set in config file:

```ts
// relizy.config.ts
export default {
  monorepo: {
    versionMode: 'selective', // 'unified' | 'selective' | 'independent'
  },
}
```

## Common Workflows

### Standard Release

```bash
# 1. Make changes and commit
git add .
git commit -m "feat: new feature"

# 2. Release
npx relizy release --minor

# Done! Version bumped, changelog updated, committed, and tagged
```

### Release with Publishing

```bash
# Complete release + npm publish + GitHub release
npx relizy release --minor --publish --provider-release
```

### Preview Before Release

```bash
# See what would happen
npx relizy release --minor --dry-run

# If satisfied, run for real
npx relizy release --minor
```

### Monorepo Selective Release

```bash
# Only release changed packages
npx relizy release --selective --minor
```

### Manual Control

```bash
# Step 1: Bump version
npx relizy bump --minor

# Step 2: Generate changelog
npx relizy changelog

# Step 3: Commit and tag manually
git add .
git commit -m "chore(release): v1.2.0"
git tag v1.2.0

# Step 4: Publish
npx relizy publish

# Step 5: Create provider release
npx relizy provider-release
```

## Command Chaining

While Relizy doesn't support chaining directly, you can use shell operators:

```bash
# Run multiple commands
npx relizy bump --patch && \
npx relizy changelog && \
npx relizy publish

# With error handling
npx relizy bump --patch || exit 1
npx relizy changelog || exit 1
npx relizy publish || exit 1
```

## Exit Codes

Relizy uses standard exit codes:

- `0` - Success
- `1` - Error occurred
- `2` - Invalid arguments

Use in scripts:

```bash
if npx relizy release --patch; then
  echo "Release successful"
else
  echo "Release failed"
  exit 1
fi
```

## Debug Mode

Get detailed output for troubleshooting:

```bash
npx relizy release --minor --log-level debug
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
npx relizy --help

# Command-specific help
npx relizy release --help
npx relizy bump --help
npx relizy changelog --help
npx relizy publish --help
npx relizy provider-release --help
```

## Next Steps

Dive deeper into each command:

- [release](/cli/release) - Full release workflow
- [bump](/cli/bump) - Version bumping
- [changelog](/cli/changelog) - Changelog generation
- [publish](/cli/publish) - NPM publishing
- [provider-release](/cli/provider-release) - GitHub/GitLab releases
