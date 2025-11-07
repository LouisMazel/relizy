# changelog

Generate or update CHANGELOG.md files.

## Usage

```bash
relizy changelog [options]
```

## What It Does

The `changelog` command:

1. ✅ Analyzes git commits
2. ✅ Groups commits by type
3. ✅ Generates markdown changelog
4. ✅ Updates CHANGELOG.md
5. ❌ Does NOT bump versions
6. ❌ Does NOT create commits

## Options

### --from

Start changelog from specific version:

```bash
relizy changelog --from v1.0.0
```

### --to

End changelog at specific version:

```bash
relizy changelog --to v2.0.0
```

## Examples

### Basic Usage

```bash
relizy changelog

# Generates changelog from last tag to HEAD
```

### Custom Range

```bash
relizy changelog --from v1.0.0 --to v2.0.0

# Generates changelog for specific version range
```

### Monorepo

```bash
relizy changelog

# Generates changelogs for all packages
```

## Output Format

```md
# Changelog

## v1.2.0

### 🚀 Features

- Add authentication ([a1b2c3d](https://github.com/user/repo/commit/a1b2c3d))

### 🐛 Bug Fixes

- Fix memory leak ([e4f5g6h](https://github.com/user/repo/commit/e4f5g6h))
```

## See Also

- [release](release.md) - Full release workflow
- [Changelog Guide](../guide/changelog.md) - Detailed changelog documentation
