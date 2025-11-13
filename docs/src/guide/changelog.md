---
title: Changelog Generation
description: Relizy automatically generates beautiful, SEO-friendly changelogs from your git commits.
keywords: changelog generation, automatic changelog, conventional commits, git changelog, changelog format
category: Guide
tags: [guide, changelog, documentation, commits]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Overview

Changelogs are generated based on [Conventional Commits](https://www.conventionalcommits.org/) using the powerful [changelogen](https://github.com/unjs/changelogen) library.

## Automatic Generation

Changelogs are created automatically when you run a release:

```bash
relizy release --minor
```

This generates or updates `CHANGELOG.md` in your package directory.

## Changelog Format

A typical generated changelog looks like this:

```md
# Changelog

## v0.0.0...v0.1.0

### 🚀 Features

- Relizy - release manager ([5c41ba1](https://github.com/LouisMazel/relizy/commit/5c41ba1))

### 📖 Documentation

- Add documentation website of Relizy ([ec156b0](https://github.com/LouisMazel/relizy/commit/ec156b0))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))
```

## Commit Types

Relizy organizes commits by type:

| Type       | Emoji | Section       | Version Bump          |
| ---------- | ----- | ------------- | --------------------- |
| `feat`     | 🚀    | Features      | Minor (0.1.0 → 0.2.0) |
| `fix`      | 🐛    | Bug Fixes     | Patch (0.1.0 → 0.1.1) |
| `perf`     | ⚡    | Performance   | Patch                 |
| `docs`     | 📚    | Documentation | None                  |
| `style`    | 💅    | Styles        | None                  |
| `refactor` | ♻️    | Refactors     | None                  |
| `test`     | ✅    | Tests         | None                  |
| `build`    | 📦    | Build         | None                  |
| `ci`       | 🤖    | CI/CD         | None                  |
| `chore`    | 🏠    | Chores        | None                  |

### Breaking Changes

Any commit with `!` or `BREAKING CHANGE:` triggers a major version bump:

```bash
git commit -m "feat!: redesign API"
# or
git commit -m "feat: redesign API

BREAKING CHANGE: The API has been completely redesigned"
```

## Conventional Commits

To generate meaningful changelogs, follow the Conventional Commits specification:

### Basic Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Examples

```bash
# Feature
git commit -m "feat: add user authentication"

# Bug fix
git commit -m "fix: resolve memory leak in event handlers"

# With scope
git commit -m "feat(auth): implement OAuth2 login"

# With body
git commit -m "fix: resolve navigation issue

The navigation was broken on mobile devices.
This fix ensures it works correctly on all screen sizes."

# Breaking change
git commit -m "feat!: redesign API

BREAKING CHANGE: The API endpoints have changed.
See migration guide for details."
```

## Customizing Commit Types

You can customize which commit types appear in changelogs and how they're labeled:

```ts
// relizy.config.ts
export default defineConfig({
  types: {
    feat: { title: '🎉 New Features', semver: 'minor' },
    fix: { title: '🔧 Bug Fixes', semver: 'patch' },
    perf: { title: '⚡ Performance', semver: 'patch' },
    docs: { title: '📖 Documentation', semver: 'patch' },
    style: { title: '💄 Styling', semver: 'patch' },
    refactor: { title: '🔨 Refactors', semver: 'patch' },
    test: { title: '🧪 Tests', semver: 'patch' },
    build: { title: '📦 Build', semver: 'patch' },
    ci: { title: '🤖 CI/CD', semver: 'patch' },
    chore: { title: '🧹 Chores', semver: 'patch' },
  },
})
```

## Changelog Locations

### Single Package

For single packages, the changelog is created at the root:

```text
my-package/
├── package.json
├── CHANGELOG.md  ← Generated here
└── src/
```

### Monorepo - Unified Mode

In unified mode, a single changelog is created at the root:

```text
my-monorepo/
├── package.json
├── CHANGELOG.md (all changes)
└── packages/
    ├── core/
    │   ├── package.json
    │   └── CHANGELOG.md ← Package-specific
    ├── utils/
    │   ├── package.json
    │   └── CHANGELOG.md ← Package-specific
    └── ui/
        ├── package.json
        └── CHANGELOG.md ← Package-specific
```

### Monorepo - Selective/Independent Mode

In selective or independent modes, each package gets its own changelog:

```text
my-monorepo/
├── package.json
├── CHANGELOG.md (all changes)
└── packages/
    ├── core/
    │   ├── package.json
    │   └── CHANGELOG.md  ← Package-specific
    ├── utils/
    │   ├── package.json
    │   └── CHANGELOG.md  ← Package-specific
    └── ui/
        ├── package.json
        └── CHANGELOG.md  ← Package-specific
```

## Generate Changelog Only

You can generate a changelog without bumping versions:

```bash
relizy changelog
```

This is useful for:

- Previewing what will be in the next release
- Generating changelogs for documentation
- Updating changelogs after manual version changes

## Version Range

By default, Relizy generates the changelog from the last tag to HEAD. You can customize this:

```bash
# From specific version to HEAD
relizy changelog --from v1.0.0

# Between two versions
relizy changelog --from v1.0.0 --to v1.2.0
```

## Excluding Commits

### By Type

Exclude specific commit types from changelogs:

```ts
// relizy.config.ts
export default defineConfig({
  types: {
    chore: false, // Don't include chores in changelog
    ci: false, // Don't include CI commits
  },
})
```

### By Pattern

Exclude commits matching patterns:

```ts
// relizy.config.ts
export default defineConfig({
  excludeAuthors: [
    'dependabot[bot]',
    'renovate[bot]',
  ],
})
```

## GitHub/GitLab Integration

Relizy automatically creates clickable links to commits and comparisons:

```md
### 🚀 Features

- Add authentication ([a1b2c3d](https://github.com/user/repo/commit/a1b2c3d))
```

The git remote is auto-detected from your repository.

## Changelog Output

### Markdown Files

Changelogs are written to `CHANGELOG.md`:

```md
# Changelog

## v1.1.0...v1.2.0

[compare](https://github.com/user/repo/compare/v1.1.0...v1.2.0)

...
```

### JSON Output

You can also output changelogs as JSON:

```bash
relizy changelog
```

```json
{
  "releases": [
    {
      "version": "1.2.0",
      "date": "2024-03-15",
      "commits": [
        {
          "type": "feat",
          "scope": "auth",
          "message": "add user authentication",
          "sha": "a1b2c3d"
        }
      ]
    }
  ]
}
```

## Best Practices

### 1. Write Good Commit Messages

```bash
# Good ✅
git commit -m "feat(auth): implement OAuth2 login"
git commit -m "fix: resolve memory leak in event handlers"

# Bad ❌
git commit -m "stuff"
git commit -m "fixes"
git commit -m "updated things"
```

### 2. Use Scopes for Organization

Scopes help group related changes:

```bash
git commit -m "feat(ui): add dark mode"
git commit -m "feat(api): add REST endpoints"
git commit -m "fix(database): resolve connection pooling issue"
```

### 3. Add Descriptive Bodies

For complex changes, add details:

```bash
git commit -m "feat: implement caching layer

Added Redis caching for API responses to improve performance.
Cache TTL is configurable via environment variables."
```

### 4. Mark Breaking Changes Clearly

Always document breaking changes:

```bash
git commit -m "feat!: redesign authentication API

BREAKING CHANGE: The authentication endpoints have changed.
Old endpoint: POST /login
New endpoint: POST /api/v2/auth/login

Migration guide: docs/migration.md"
```

### 5. Keep Changelogs Clean

Exclude noise from changelogs:

```ts
// relizy.config.ts
export default defineConfig({
  types: {
    ci: false, // Skip CI commits
    chore: false, // Skip chores
  },
  excludeAuthors: [
    'dependabot[bot]',
  ],
})
```

## Examples

### Basic Usage

```bash
# Generate changelog as part of release
relizy release --minor

# Generate changelog without version bump
relizy changelog
```

### Custom Range

```bash
# Changelog from v1.0.0 to v2.0.0
relizy changelog --from v1.0.0 --to v2.0.0

# Changelog for last 10 commits
relizy changelog --from HEAD~10
```

### Monorepo

```bash
# Generate changelogs for all packages
relizy changelog
```

## Configuration

Full changelog configuration options:

```ts
// relizy.config.ts
export default defineConfig({
  // Commit types
  types: {
    feat: { title: '🚀 Features', semver: 'minor' },
    fix: { title: '🐛 Bug Fixes', semver: 'patch' },
  },

  // Excluded authors
  excludeAuthors: ['dependabot[bot]'],

  // GitHub/GitLab URLs
  github: 'user/repo',
  // or
  gitlab: 'user/repo',

  // Version range
  from: 'v1.0.0',
  to: 'HEAD',
})
```

## Next Steps

- [Getting Started](/guide/getting-started) - Learn basic usage
- [CLI Reference](/cli/changelog) - Changelog command details
- [Configuration](/config/changelog) - Advanced changelog options
