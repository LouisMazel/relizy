# release

Execute the complete release workflow in a single command.

## Usage

```bash
npx relizy release [options]
```

## What It Does

The `release` command combines multiple operations:

1. ✅ Bumps version in package.json
2. ✅ Generates/updates CHANGELOG.md
3. ✅ Creates a git commit
4. ✅ Creates a git tag
5. ✅ Publishes to npm (if `--publish` flag used)
6. ✅ Creates GitHub/GitLab release (if `--provider-release` flag used)

## Options

### Release Type

Specify the version bump type:

```bash
# Patch release (1.0.0 → 1.0.1)
npx relizy release --patch

# Minor release (1.0.0 → 1.1.0)
npx relizy release --minor

# Major release (1.0.0 → 2.0.0)
npx relizy release --major
```

If no type is specified, Relizy automatically detects it from commits.

### --publish

Publish to npm after releasing:

```bash
npx relizy release --minor --publish
```

### --provider-release

Create GitHub or GitLab release:

```bash
npx relizy release --minor --provider-release
```

### --packages

Release specific packages (monorepo):

```bash
npx relizy release --minor --packages core,utils
```

### --no-commit

Skip creating git commit:

```bash
npx relizy release --minor --no-commit
```

### --no-tag

Skip creating git tag:

```bash
npx relizy release --minor --no-tag
```

### --no-push

Skip pushing to remote:

```bash
npx relizy release --minor --no-push
```

### --dry-run

Preview changes without executing:

```bash
npx relizy release --minor --dry-run
```

### --yes

Skip all confirmations:

```bash
npx relizy release --minor --yes
```

## Examples

### Basic Release

```bash
# Interactive release
npx relizy release --patch

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
npx relizy release --minor --publish --provider-release

# This will:
# 1. Bump to 1.1.0
# 2. Update changelog
# 3. Commit and tag
# 4. Publish to npm
# 5. Create GitHub release
```

### Monorepo Selective Release

```bash
npx relizy release --selective --minor

# Only packages with changes are bumped
```

### CI/CD Usage

```bash
# Automated release in CI
npx relizy release --patch --yes --no-git-checks
```

## See Also

- [bump](/cli/bump) - Version bumping only
- [changelog](/cli/changelog) - Changelog generation only
- [publish](/cli/publish) - NPM publishing only
- [provider-release](/cli/provider-release) - Provider releases only
