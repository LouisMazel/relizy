<div align="center">
  <img src="https://raw.githubusercontent.com/LouisMazel/relizy/refs/heads/main/resources/logo.svg" alt="Relizy Logo" width="100">

  <h1>Relizy</h1>
  <p>
    <strong>
      A tool to manage releases for monorepos and single packages.
    </strong>
  </p>

  <p>
    <a href="https://codecov.io/gh/LouisMazel/relizy">
      <img src="https://codecov.io/gh/LouisMazel/relizy/branch/main/graph/badge.svg?token=YOUR_TOKEN_HERE" alt="codecov" />
    </a>
    <a href="https://github.com/LouisMazel/relizy/actions/workflows/test-unit.yml">
      <img src="https://github.com/LouisMazel/relizy/actions/workflows/test-unit.yml/badge.svg" alt="Unit Tests" />
    </a>
    <a href="https://www.npmjs.com/package/relizy">
      <img src="https://img.shields.io/npm/v/relizy.svg" alt="npm version" />
    </a>
    <a href="https://www.npmjs.com/package/relizy">
      <img src="https://img.shields.io/npm/dm/relizy.svg" alt="npm downloads" />
    </a>
  </p>

<a href="https://louismazel.github.io/relizy/">Documentation</a>

</div>

---

Seamless and automated release manager with elegant changelog generation based on Conventional Commits, supporting both monorepos and single packages. Handles version bumping, changelog generation, Git tagging, and publishing to npm, GitHub & GitLab effortlessly.

## 🎯 Why use this tool?

Imagine you have multiple packages in your project (like a box with several toys). With **one command**, this tool helps you to:

1. **Update version numbers** of your packages automatically
2. **Create changelogs** to explain what changed
3. **Publish your packages** to npm so others can use them
4. **Create releases** on GitHub or GitLab
5. **Announce releases** automatically on Twitter and Slack

## ✨ Features

- 🚀 Built on top of [changelogen](https://github.com/unjs/changelogen)
- 📦 Monorepo support with glob pattern matching
- 🔄 Three versioning modes: unified, selective, independent
- 📝 Generate changelogs per package + root aggregate
- 🏷️ Pre-release support (alpha, beta, rc)
- 📢 NPM publish with smart tag detection
- 🔗 Automatic dependency bumping for workspace dependencies
- 🐙 GitHub, GitLab & Bitbucket support
- 🔐 2FA/OTP support for npm publishing
- 🎛️ Custom registry support (private registries, GitHub Packages, etc.)
- ⚙️ Multiple configuration files support for different release workflows
- 🔧 Support for npm, yarn, pnpm, and bun (auto-detected)
- 📱 Social media integration (Twitter & Slack) for release announcements

## 📚 Documentation

You can [find the documentation here](https://louismazel.github.io/relizy/).

## 📦 Installation

```bash
pnpm add -D relizy
```

## 🚀 Quick Start

Install Relizy in your project:

```bash
pnpm add -D relizy
# or npm install -D relizy
# or yarn add -D relizy
```

Create a simple configuration file `relizy.config.ts`:

```typescript
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: {
    versionMode: 'selective',
    packages: ['packages/*'],
  },
})
```

That's it! Now you can release with a single command:

```bash
relizy release
```

This will automatically:

- Detect the version bump from your commits
- Update all package versions
- Generate changelogs
- Commit and tag your changes
- Push to your git repository
- Create a release on GitHub/GitLab
- Publish to npm

## 💡 What Can You Use This For?

Relizy isn't just for publishing npm packages. You can use it for any project where you need version tracking and changelogs:

### Publishing npm Packages

Perfect for managing npm packages in a monorepo or single package repository. Automate the entire release workflow and let your team focus on building features.

```bash
relizy release --minor
```

### Versioning Private Applications

Use Relizy to version your private web applications, mobile apps, or internal tools. Keep track of what changed in each version with automatic changelog generation.

```bash
relizy release --patch --no-publish
```

### Release Announcements

Automatically post release announcements to Twitter and Slack when you ship new versions. Keep your users and team informed without manual work.

```bash
relizy release --minor  # Automatically posts to configured social channels
```

## 📖 Learn More

This README covers the basics to get you started quickly. For detailed documentation, configuration options, and advanced features, visit our full documentation:

**[📚 Full Documentation](https://louismazel.github.io/relizy/)**

Topics covered in the documentation:

- Complete configuration reference
- Monorepo versioning strategies (unified, selective, independent)
- CI/CD integration (GitHub Actions, GitLab CI)
- Social media integration (Twitter & Slack)
- Custom registries and private packages
- Multiple configuration files
- And much more...

## 🎨 Common Use Cases

Here are some quick examples to get you started:

### Release a Patch Version

```bash
relizy release --patch
```

This bumps the version (e.g., 1.0.0 → 1.0.1), generates the changelog, commits, tags, pushes, and publishes to npm.

### Try Before You Commit (Dry Run)

```bash
relizy release --minor --dry-run
```

Preview exactly what will happen without making any changes.

### Skip Publishing for Private Apps

```bash
relizy release --patch --no-publish
```

Perfect for versioning private applications where you don't need to publish to npm.

### Pre-release Versions

```bash
relizy release --prerelease --preid beta
```

Creates beta versions like 1.0.0-beta.0 for testing before stable releases.

### Control What Runs

```bash
# Skip git push
relizy release --patch --no-push

# Skip GitHub/GitLab release
relizy release --patch --no-provider-release

# Just bump and commit
relizy release --patch --no-publish --no-push
```

For detailed CLI reference, configuration options, and advanced features, check out the [full documentation](https://louismazel.github.io/relizy/).

## 🧑‍💻 Development & Contributing

### Running Tests

```bash
# Run all tests
pnpm test:unit

# Run tests in watch mode
pnpm test:unit:watch

# Run tests with coverage
pnpm test:unit:coverage
```

### Code Coverage

This project uses [Codecov](https://codecov.io) to track code coverage. Coverage reports are automatically generated and uploaded when you push to `main` or `develop` branches, or when you create a pull request.

**Coverage Requirements:**

- **Overall project**: Coverage should not decrease by more than 0.5%
- **New code (patches)**: Must have at least 80% coverage

You can view detailed coverage reports on [Codecov](https://codecov.io/gh/LouisMazel/relizy).

To see coverage locally:

```bash
pnpm test:unit:coverage
# Open coverage/index.html in your browser
```

### Pull Request Guidelines

When submitting a PR:

1. Ensure all tests pass (`pnpm test:unit`)
2. Check TypeScript types (`pnpm typecheck`)
3. Lint your code (`pnpm lint`)
4. Add tests for new features
5. Maintain or improve code coverage (Codecov will comment on your PR)

The Codecov bot will automatically comment on your PR with coverage details and changes.

For detailed contribution guidelines, including development setup, testing workflows, commit conventions, and the complete PR process, please read our **[Contributing Guide](CONTRIBUTING.md)**.

## License

MIT
