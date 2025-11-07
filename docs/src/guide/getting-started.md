# Getting Started

Learn the basics of using Relizy to manage your releases.

## Your First Release

After [installing Relizy](/guide/installation), you're ready to create your first release.

### 1. Make Some Changes

First, make sure you have some commits following the [Conventional Commits](https://www.conventionalcommits.org/) format:

```bash
git commit -m "feat: add new feature"
git commit -m "fix: resolve bug in login"
git commit -m "docs: update README"
```

::: tip Conventional Commits
Relizy uses commit messages to determine version bumps:

- `feat:` → minor version bump (0.1.0 → 0.2.0)
- `fix:` → patch version bump (0.1.0 → 0.1.1)
- `feat!:` or `BREAKING CHANGE:` → major version bump (0.1.0 → 1.0.0)
  :::

### 2. Run the Release Command

Create a patch release:

```bash
npx relizy release --patch
```

Relizy will:

1. ✅ Bump the version in `package.json` to the next patch version
2. ✅ Generate or update `CHANGELOG.md` with your commits
3. ✅ Create a git commit with the changes
4. ✅ Create a git tag (e.g., `v1.0.1`)
5. ✅ Push changes to the remote repository

::: info
The first time you run Relizy, it will interactively ask for confirmation before making changes. Use `--yes` to skip confirmations in CI/CD.
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

## v1.0.1

### 🚀 Features

- Add new feature

### 🐛 Bug Fixes

- Resolve bug in login

### 📚 Documentation

- Update README
```

## Release Types

Relizy supports different release types:

### Patch Release

For bug fixes and small changes:

```bash
npx relizy release --patch
# 1.0.0 → 1.0.1
```

### Minor Release

For new features:

```bash
npx relizy release --minor
# 1.0.0 → 1.1.0
```

### Major Release

For breaking changes:

```bash
npx relizy release --major
# 1.0.0 → 2.0.0
```

### Automatic Detection

Let Relizy determine the version bump from your commits:

```bash
npx relizy release
```

::: tip
Without a release type flag, Relizy analyzes your commits and automatically chooses the appropriate bump (major/minor/patch) based on Conventional Commits.
:::

## Common Options

### Dry Run

Preview changes without actually making them:

```bash
npx relizy release --patch --dry-run
```

This shows you what would happen without modifying any files.

### Skip Git Operations

Bump version and generate changelog without git commit/tag:

```bash
npx relizy release --patch --no-commit --no-tag
```

### Publish to npm

Include publishing to npm in the release:

```bash
npx relizy release --patch --publish
```

::: warning
Make sure you're logged in to npm (`npm login`) before publishing.
:::

### Create Provider Release

Create a GitHub or GitLab release:

```bash
npx relizy release --patch --provider-release
```

You'll need a GitHub/GitLab token set in your environment.

### Skip Confirmations

Auto-accept all prompts (useful for CI/CD):

```bash
npx relizy release --patch --yes
```

## Monorepo Usage

For monorepos, Relizy automatically detects and manages multiple packages:

```bash
# Release all changed packages
npx relizy release --patch

# Release specific packages only
npx relizy release --patch --packages package-a,package-b
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
npx relizy release --minor --dry-run

# Create the release
npx relizy release --minor
```

### 3. Publish (Optional)

```bash
# Publish to npm
npx relizy publish

# Or combine release + publish
npx relizy release --minor --publish
```

### 4. Create Provider Release (Optional)

```bash
# Create GitHub/GitLab release
npx relizy provider-release
```

## Individual Commands

Relizy's `release` command is actually a combination of multiple commands. You can also run them individually:

### Bump Version Only

```bash
npx relizy bump --patch
```

Updates version in `package.json` without creating commits or tags.

### Generate Changelog Only

```bash
npx relizy changelog
```

Generates or updates `CHANGELOG.md` without changing version.

### Publish Only

```bash
npx relizy publish
```

Publishes current version to npm without bumping.

### Provider Release Only

```bash
npx relizy provider-release
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
npx relizy release --minor --dry-run
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
npx relizy release --minor
```

## Next Steps

Now that you understand the basics:

- [Version Modes](/guide/version-modes) - Learn about monorepo versioning strategies
- [CLI Commands](/cli/commands) - Explore all available commands
- [Configuration](/config/overview) - Customize Relizy for your project
- [CI/CD Setup](/guide/ci-cd) - Automate releases in your pipeline
