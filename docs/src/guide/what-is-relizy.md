# What is Relizy?

Relizy is a powerful, automated release management tool designed for modern JavaScript projects. It handles the entire release workflow from version bumping to publishing, with first-class support for both monorepos and single packages.

## The Problem

Managing releases in JavaScript projects—especially monorepos—involves many repetitive tasks:

- 📝 Writing changelogs manually
- 🔢 Updating version numbers in package.json files
- 🏷️ Creating and pushing git tags
- 📦 Publishing packages to npm
- 🚀 Creating releases on GitHub/GitLab
- 🔗 Managing dependencies between packages

Doing all this manually is tedious, error-prone, and time-consuming.

## The Solution

Relizy automates the entire release workflow with a single command:

```bash
npx relizy release --patch
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

## Key Features

### 🎯 Zero Configuration

Relizy works out of the box with sensible defaults. No complex configuration files or steep learning curve.

### 📦 Monorepo First

Built specifically to handle the complexity of monorepos:

- **Unified versioning** - All packages share the same version
- **Selective versioning** - Only bump packages with changes
- **Independent versioning** - Each package has its own version

### 🤖 Smart Automation

Automatically detects:

- Which packages need version bumps based on commits
- Dependent packages that need updates
- The appropriate semantic version bump (major/minor/patch)

### 🔄 Based on Standards

Built on top of proven tools and standards:

- [changelogen](https://github.com/unjs/changelogen) for changelog generation
- [Conventional Commits](https://www.conventionalcommits.org/) for commit parsing
- [Semantic Versioning](https://semver.org/) for version management

## Use Cases

### Monorepo Projects

Perfect for monorepos with multiple interconnected packages:

```
my-project/
├── packages/
│   ├── core/
│   ├── utils/
│   └── ui/
```

Relizy automatically handles dependency updates when one package depends on another.

### Single Package Projects

Works just as well for simple single-package projects:

```
my-library/
├── package.json
├── src/
└── CHANGELOG.md
```

### CI/CD Pipelines

Integrate seamlessly into your automation:

```yaml
# GitHub Actions example
- name: Release
  run: npx relizy release --patch --no-git-checks
```

## How It Works

1. **Analyze Commits** - Relizy scans your git history for Conventional Commits
2. **Calculate Versions** - Determines the new version based on commit types
3. **Update Files** - Updates package.json and generates CHANGELOG.md
4. **Git Operations** - Creates commits and tags
5. **Publish** - Optionally publishes to npm and creates provider releases

## Who Is It For?

Relizy is perfect for:

- 👥 **Teams** following Conventional Commits
- 📦 **Monorepo maintainers** managing multiple packages
- 🔧 **Library authors** publishing to npm
- 🤖 **DevOps engineers** building CI/CD pipelines
- 🚀 **Projects** that want automated, consistent releases

## Next Steps

Ready to get started? Check out:

- [Installation](/guide/installation) - Install Relizy in your project
- [Getting Started](/guide/getting-started) - Your first release
- [Version Modes](/guide/version-modes) - Choose the right versioning strategy
