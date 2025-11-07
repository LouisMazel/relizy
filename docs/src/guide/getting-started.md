# Getting Started

Learn the basics of using Relizy to manage your releases.

## Your First Release

After [installing Relizy](/guide/installation), you're ready to create your first release.

### 1. Make Some Changes

First, make sure you have some commits following the [Conventional Commits](https://www.conventionalcommits.org/) format:

```bash
git commit -m "feat(package-a): add new feature"
git commit -m "fix(package-b): resolve bug in login"
git commit -m "docs: update README"
```

::: tip Conventional Commits
Relizy uses commit messages to determine version bumps:

- `feat:` → minor version bump (0.1.0 → 0.2.0)
- `fix:` → patch version bump (0.1.0 → 0.1.1)
- `feat!:` or `BREAKING CHANGE:` → major version bump (0.1.0 → 1.0.0)

This is the default behavior of Relizy. You can customize it by using the `types` option in the [config](../config/overview.md).
:::

### 2. Run the Release Command

Create a patch release:

```bash
relizy release --patch
```

Relizy will:

1. ✅ Bump the version in `package.json` to the next patch version
2. ✅ Generate or update `CHANGELOG.md` with your commits
3. ✅ Create a git commit with the changes
4. ✅ Create a git tag (e.g., `v1.0.1`)
5. ✅ Push changes to the remote repository

::: info
When you run Relizy, it will interactively ask for confirmation before bumping the versions. Use `--yes` to skip confirmations in CI/CD.
:::

### 3. View the Results

Check your updated `package.json`:

```json
{
  "name": "my-package",
  "version": "1.0.1" // ← Bumped!
}
```

And your new `CHANGELOG.md`:

```md
# Changelog

## v1.0.0...v1.0.1

### 🚀 Features

- Add new feature

### 🐛 Bug Fixes

- Resolve bug in login

### 📚 Documentation

- Update README
```

## Release Types

Relizy supports different release types:

### Stable Release

#### Patch Release

For bug fixes and small changes:

```bash
relizy release --patch
# 1.0.0 → 1.0.1
```

#### Minor Release

For new features:

```bash
relizy release --minor
# 1.0.0 → 1.1.0
```

#### Major Release

For breaking changes:

```bash
relizy release --major
# 1.0.0 → 2.0.0
```

### Pre-release

#### Pre-release

```bash
relizy release --prerelease --preid alpha --tag alpha
# 1.0.0 → 1.0.0-alpha.0
```

#### Premajor pre-release

```bash
relizy release --premajor --preid alpha --tag alpha
# 1.0.0 → 2.0.0-alpha.0
```

#### Preminor pre-release

```bash
relizy release --preminor --preid alpha --tag alpha
# 1.0.0 → 1.1.0-alpha.0
```

#### Prepatch pre-release

```bash
relizy release --prepatch --preid alpha --tag alpha
# 1.0.0 → 1.0.1-alpha.0
```

### Automatic Detection

Let Relizy determine the version bump from your commits:

```bash
relizy release
```

::: tip
Without a release type flag, Relizy analyzes your commits and automatically chooses the appropriate bump (major/minor/patch) based on Conventional Commits.
:::

## Common Options

### Dry Run

Preview changes without actually making them:

```bash
relizy release --patch --dry-run
```

This shows you what would happen without modifying any files.

### Skip Git Operations

Bump version and generate changelog without git commit:

```bash
relizy release --patch --no-commit
```

### Publish to npm

Include publishing to npm in the release:

```bash
relizy release --patch
```

::: warning
Make sure you're logged in to npm (`npm login`) before publishing.
:::

### Create Provider Release

Create a GitHub or GitLab release:

```bash
relizy release --patch
```

You'll need a GitHub/GitLab token set in your environment.

### Skip Confirmations

Auto-accept all prompts (useful for CI/CD):

```bash
relizy release --patch --yes
```

## Monorepo Usage

For monorepos, Relizy automatically detects and manages multiple packages:

```bash
# Release all changed packages
relizy release --patch
```

Relizy will:

- Detect which packages have changes
- Update dependent packages automatically
- Generate changelogs for each package
- Tag each package separately (or use a single tag for unified mode)

Learn more in the [Version Modes](/guide/version-modes) guide.

## Step-by-Step Workflow

Here's a complete workflow for a typical release:

### 1. Develop Features

```bash
# Work on your feature
git checkout -b feature/awesome-feature

# Make commits following conventional commits
git commit -m "feat: add awesome feature"
git commit -m "docs: add feature documentation"
git commit -m "test: add feature tests"

# Merge to main
git checkout main
git merge feature/awesome-feature
```

### 2. Create the Release

```bash
# Preview the release
relizy release --minor --dry-run

# Create the release
relizy release --minor
```

### 3. Publish (Optional)

```bash
# Publish to npm
relizy publish

# Or combine release + publish
relizy release --minor
```

### 4. Create Provider Release (Optional)

```bash
# Create GitHub/GitLab release
relizy provider-release
```

## Individual Commands

Relizy's `release` command is actually a combination of multiple commands. You can also run them individually:

### Bump Version Only

```bash
relizy bump --patch
```

Updates version in `package.json` without creating commits or tags.

### Generate Changelog Only

```bash
relizy changelog
```

Generates or updates `CHANGELOG.md` without changing version.

### Publish Only

```bash
relizy publish
```

Publishes current version to npm without bumping.

### Provider Release Only

```bash
relizy provider-release
```

Creates a GitHub/GitLab release for the current version.

## Best Practices

### 1. Use Conventional Commits

Always format your commits following the Conventional Commits specification:

```bash
# Good ✅
git commit -m "feat: add user authentication"
git commit -m "fix: resolve memory leak"
git commit -m "docs: update API documentation"

# Bad ❌
git commit -m "added stuff"
git commit -m "fixes"
```

### 2. Run Dry Run First

Before releasing, preview changes with `--dry-run`:

```bash
relizy release --minor --dry-run
```

### 3. Add to Package Scripts

Make releases easier by adding scripts to `package.json`:

```json
{
  "scripts": {
    "release": "relizy release",
    "release:patch": "relizy release --patch --yes",
    "release:minor": "relizy release --minor --yes",
    "release:major": "relizy release --major --yes"
  }
}
```

### 4. Use Version Control

Always commit and push your code before releasing:

```bash
git add .
git commit -m "feat: awesome feature"
git push
relizy release --minor
```

## Next Steps

Now that you understand the basics:

- [Version Modes](/guide/version-modes) - Learn about monorepo versioning strategies
- [CLI Commands](/cli/commands) - Explore all available commands
- [Configuration](/config/overview) - Customize Relizy for your project
- [CI/CD Setup](/guide/ci-cd) - Automate releases in your pipeline
