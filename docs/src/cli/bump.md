# bump

Update version numbers in package.json files.

## Usage

```bash
npx relizy bump [options]
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
npx relizy bump --patch

# Minor (1.0.0 → 1.1.0)
npx relizy bump --minor

# Major (1.0.0 → 2.0.0)
npx relizy bump --major
```

### --packages

Bump specific packages:

```bash
npx relizy bump --minor --packages core,utils
```

### --dry-run

Preview version changes:

```bash
npx relizy bump --minor --dry-run
```

### --yes

Skip confirmations:

```bash
npx relizy bump --minor --yes
```

## Examples

### Single Package

```bash
npx relizy bump --patch

# Before: "version": "1.0.0"
# After:  "version": "1.0.1"
```

### Monorepo

```bash
npx relizy bump --minor

# packages/core: 1.0.0 → 1.1.0
# packages/ui: 1.0.0 → 1.1.0 (depends on core)
```

### Preview Changes

```bash
npx relizy bump --major --dry-run

# Output:
# Packages to bump:
# ✓ @myorg/core: 1.5.0 → 2.0.0
# ✓ @myorg/ui: 1.5.0 → 2.0.0
```

## See Also

- [release](/cli/release) - Full release workflow
- [Version Modes](/guide/version-modes) - Versioning strategies
