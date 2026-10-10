---
title: What is Relizy?
description: Relizy is a powerful, automated release management tool designed for modern projects (monorepos or single packages).
keywords: relizy, release management, monorepo tool, version management, automated releases, npm publishing, changelog generator
category: Guide
tags: [guide, introduction, overview, features]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }} It handles the entire release workflow from version bumping to publishing, with first-class support for both monorepos and single packages.

## The Problem

Managing releases in JavaScript projects—especially monorepos—involves many repetitive tasks:

- 📝 Writing changelogs manually
- 🔢 Updating version numbers in package.json files
- 🏷️ Creating and pushing git tags
- 📦 Publishing packages to npm
- 🚀 Creating releases on GitHub/GitLab
- 🔗 Managing dependencies between packages
- 🐦 Posting release announcements to Twitter (X) and/or Slack

Doing all this manually is tedious, error-prone, and time-consuming.

## The Solution

Relizy automates the entire release workflow with a single command:

```bash
relizy release
```

This one command will:

- ✅ Analyze your commits using Conventional Commits
- ✅ Determine which packages need updates
- ✅ Bump versions in package.json files
- ✅ Update dependencies between packages
- ✅ Generate beautiful changelogs
- ✅ Create git commits and tags
- ✅ Publish to npm (optional)
- ✅ Create GitHub/GitLab releases (optional)
- ✅ Post release announcements to Twitter (X) and/or Slack (optional)

## Key Features

### 🎯 Zero Configuration

No configuration needed for standalone / single packages.

Relizy works out of the box with sensible defaults. No complex configuration files or steep learning curve.

For monorepos, you must use the `monorepo` configuration option.

### 📦 Monorepo First

Built specifically to handle the complexity of monorepos:

- **Unified versioning** - All packages share the same version
- **Selective versioning** - Only bump packages with changes and packages that depend on them
- **Independent versioning** - Each package has its own version and tags

### 🐤 Canary Releases

Publish temporary test versions from any branch:

- **Quick testing** - Publish a canary version from a pull request
- **No side effects** - No git commits, tags, or changelog entries
- **npm dist-tag** - Canary versions use the `canary` dist-tag, so `latest` is never affected
- **CI/CD ready** - Automate canary releases on every pull request

Learn more in the [Canary Releases](/guide/canary-releases) guide.

### 🤖 Smart Automation

Automatically detects:

- Which packages need version bumps based on commits
- Dependent packages that need updates
- The appropriate semantic version bump (major/minor/patch)
- Auto detect your git provider (GitHub or GitLab)

### 🔄 Based on Standards

Built on top of proven tools and standards:

- [changelogen](https://github.com/unjs/changelogen) for changelog generation
- [Conventional Commits](https://www.conventionalcommits.org/) for commit parsing
- [Semantic Versioning](https://semver.org/) for version management

## Use Cases

### Monorepo Projects

Perfect for monorepos with multiple interconnected packages:

```text
my-project/
├── packages/
│   ├── core/
│   ├── utils/
│   └── ui/
├── relizy.config.ts
└── package.json
```

Relizy automatically handles dependency updates when one package depends on another.

### Private Apps and Internal Projects

Relizy is not only for packages published to npm. Web apps, APIs, workers and internal monorepos get the same versions, changelogs, git tags and GitHub/GitLab releases, with publishing turned off:

```text
my-platform/
├── apps/
│   ├── web/        (private)
│   └── api/        (private)
├── packages/
│   └── shared/     (private)
└── relizy.config.ts
```

Nothing is ever published: private packages are always skipped by the publish step. Learn more in [Private Projects & Apps](/guide/private-projects).

### Single Package Projects

Works just as well for simple single-package projects:

```text
my-library/
├── package.json
├── src/
├── CHANGELOG.md
└── relizy.config.ts (optional)
```

### CI/CD Pipelines

Integrate seamlessly into your automation:

```yaml
# GitHub Actions example
- name: Release
  run: relizy release --yes
```

## How It Works

1. **Analyze Commits** - Relizy scans your git history for Conventional Commits
2. **Calculate Versions** - Determines the new version based on commit types
3. **Update Files** - Updates package.json and generates CHANGELOG.md
4. **Git Operations** - Creates commits and tags
5. **Publish** - Publishes to npm
6. **Provider Release** - Creates releases on GitHub/GitLab

> Each step is optional and can be disabled using the corresponding configuration option.

## Who Is It For?

Relizy is perfect for:

- 👥 **Teams** following Conventional Commits
- 📦 **Monorepo maintainers** managing multiple packages
- 🔧 **Library authors** publishing to npm
- 🔒 **Product teams** versioning private apps and services that are never published
- 🤖 **DevOps engineers** building CI/CD pipelines
- 🚀 **Projects** that want automated, consistent releases

## Next Steps

Ready to get started? Check out:

- [Installation](installation.md) - Install Relizy in your project
- [Getting Started](getting-started.md) - Your first release
- [Version Modes](version-modes.md) - Choose the right versioning strategy
- [Canary Releases](canary-releases.md) - Publish test versions from pull requests
