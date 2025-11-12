# Contributing to Relizy

Thank you for considering contributing to Relizy! We appreciate your interest in improving this project. This guide will help you get started with contributing.

## Table of Contents

- [Contributing to Relizy](#contributing-to-relizy)
  - [Table of Contents](#table-of-contents)
  - [Code of Conduct](#code-of-conduct)
  - [How Can I Contribute?](#how-can-i-contribute)
    - [Reporting Bugs](#reporting-bugs)
    - [Suggesting Features](#suggesting-features)
    - [Asking Questions](#asking-questions)
    - [Contributing Code](#contributing-code)
  - [Development Setup](#development-setup)
    - [Prerequisites](#prerequisites)
    - [Fork and Clone](#fork-and-clone)
    - [Install Dependencies](#install-dependencies)
    - [Development Workflow](#development-workflow)
      - [Build Commands](#build-commands)
      - [Testing Commands](#testing-commands)
      - [Linting Commands](#linting-commands)
      - [Testing the CLI Locally](#testing-the-cli-locally)
  - [Project Structure](#project-structure)
    - [Key Files to Know](#key-files-to-know)
  - [Testing](#testing)
    - [Unit Tests](#unit-tests)
    - [Writing Tests](#writing-tests)
    - [Manual Testing](#manual-testing)
  - [Code Style](#code-style)
    - [TypeScript](#typescript)
    - [ESLint](#eslint)
    - [Editor Setup](#editor-setup)
  - [Commit Guidelines](#commit-guidelines)
    - [Commit Format](#commit-format)
    - [Types](#types)
    - [Examples](#examples)
    - [Git Hooks](#git-hooks)
  - [Pull Request Process](#pull-request-process)
    - [Before Submitting](#before-submitting)
    - [Submitting the PR](#submitting-the-pr)
    - [PR Guidelines](#pr-guidelines)
    - [Review Process](#review-process)
  - [Additional Resources](#additional-resources)
    - [Documentation](#documentation)
    - [Useful Links](#useful-links)
    - [Getting Help](#getting-help)

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](.github/CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [me@loicmazuel.com](mailto:me@loicmazuel.com).

## How Can I Contribute?

### Reporting Bugs

If you find a bug, please [open an issue](https://github.com/LouisMazel/relizy/issues/new?template=bug_report.md) using the bug report template. Include:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- Your environment (OS, Node version, package manager)
- Relevant logs or error messages
- Minimal reproduction (if possible)

### Suggesting Features

Have an idea for a new feature? [Open a feature request](https://github.com/LouisMazel/relizy/issues/new?template=feature_request.md) with:

- A clear description of the feature
- The problem it solves
- Use cases and examples
- Alternative solutions you've considered

### Asking Questions

If you have questions about using Relizy, please [open a question issue](https://github.com/LouisMazel/relizy/issues/new?template=question.md). We're here to help!

### Contributing Code

We welcome code contributions! Here's how to get started:

## Development Setup

### Prerequisites

Before you begin, ensure you have:

- **Node.js** >= 20.0.0
- **pnpm** (this project uses pnpm exclusively)

  ```bash
  npm install -g pnpm
  ```

- **Git** installed and configured

### Fork and Clone

1. **Fork the repository** on GitHub by clicking the "Fork" button
2. **Clone your fork** locally:

   ```bash
   git clone https://github.com/YOUR_USERNAME/relizy.git
   cd relizy
   ```

### Install Dependencies

```bash
pnpm install
```

This will:

- Install all dependencies
- Set up Git hooks with Husky
- Prepare your development environment

### Development Workflow

#### Build Commands

```bash
# Build the distribution (production build)
pnpm build

# Build in stub mode (faster, for development)
pnpm dev

# Type-check without emitting files
pnpm typecheck
```

#### Testing Commands

```bash
# Run unit tests
pnpm test:unit

# Run tests in watch mode
pnpm test:unit:watch

# Run tests with coverage report
pnpm test:unit:coverage
```

#### Linting Commands

```bash
# Run ESLint
pnpm lint

# Fix linting issues automatically
pnpm lint:fix
```

#### Testing the CLI Locally

```bash
# Run the CLI during development
pnpm relizy <command> [options]
# or
pnpm rly <command> [options]
```

**Example:**

```bash
pnpm relizy bump --dry-run
pnpm relizy release --help
```

## Project Structure

Understanding the project structure will help you navigate the codebase:

```text
relizy/
├── src/
│   ├── cli.ts                  # CLI entry point with Commander.js
│   ├── types.ts                # TypeScript type definitions
│   ├── commands/               # CLI command implementations
│   │   ├── bump.ts             # Version bumping logic
│   │   ├── changelog.ts        # Changelog generation
│   │   ├── publish.ts          # NPM publishing
│   │   ├── provider-release.ts # GitHub/GitLab release creation
│   │   └── release.ts          # Complete release workflow
│   └── core/                   # Core business logic
│       ├── monorepo.ts         # Package discovery
│       ├── config.ts           # Configuration loading
│       ├── version.ts          # Version calculations (has tests)
│       ├── dependencies.ts     # Dependency graph traversal
│       ├── git.ts              # Git operations
│       ├── github.ts           # GitHub API integration
│       ├── gitlab.ts           # GitLab API integration
│       ├── npm.ts              # NPM registry operations
│       ├── changelog.ts        # Changelog generation
│       ├── tags.ts             # Git tag management
│       ├── utils.ts            # Utility functions
│       └── markdown.ts         # Markdown formatting
├── bin/
│   └── relizy.mjs              # CLI executable entry point
├── .github/                    # GitHub templates and workflows
├── docs/                       # VitePress documentation
└── tests/                      # Test files
```

### Key Files to Know

- **`src/cli.ts`**: CLI argument parsing and command routing
- **`src/core/version.ts`**: Core versioning logic (covered by tests)
- **`src/core/config.ts`**: Default configuration and config loading
- **`src/types.ts`**: All TypeScript interfaces and types
- **`vitest.config.ts`**: Test configuration

## Testing

### Unit Tests

Tests are written using [Vitest](https://vitest.dev/).

Currently, unit tests focus on `src/core/version.ts` (see `vitest.config.ts`).

```bash
# Run all tests
pnpm test:unit

# Watch mode for TDD
pnpm test:unit:watch

# Generate coverage report
pnpm test:unit:coverage
```

### Writing Tests

When adding new functionality:

1. Add tests in `/__tests__/` directory
2. Follow the existing test patterns
3. Ensure tests are deterministic and isolated
4. Aim for meaningful coverage, not just high percentages

**Example test:**

```typescript
import { describe, expect, it } from 'vitest'
import { someFunction } from '../version'

describe('someFunction', () => {
  it('should handle basic case', () => {
    expect(someFunction('1.0.0')).toBe('1.0.1')
  })
})
```

### Manual Testing

For end-to-end testing:

1. Create a test monorepo structure
2. Run the CLI with `--dry-run` to preview changes
3. Test with different version modes and configurations
4. Verify generated changelogs and version bumps

## Code Style

### TypeScript

- Use TypeScript for all new code
- Provide types for all exported functions and interfaces
- Avoid `any` type; use `unknown` or proper types
- Prefer explicit return types for public APIs

### ESLint

This project uses [@maz-ui/eslint-config](https://github.com/LouisMazel/maz-ui/tree/main/packages/eslint-config).

```bash
# Auto-fix linting issues
pnpm lint:fix
```

**Key rules:**

- No unused variables
- Consistent quote style (single quotes)
- Trailing commas where valid
- No console statements (use proper logging)

### Editor Setup

For the best development experience, use **Visual Studio Code** with:

- [ESLint extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [TypeScript + JavaScript](https://marketplace.visualstudio.com/items?itemName=ms-vscode.vscode-typescript-next)
- Enable "Format on Save" with ESLint

## Commit Guidelines

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

### Commit Format

```text
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **chore**: Maintenance tasks
- **refactor**: Code refactoring
- **test**: Adding or updating tests
- **perf**: Performance improvements
- **ci**: CI/CD changes
- **build**: Build system changes

### Examples

```bash
feat(bump): add support for custom suffix in prerelease versions
fix(publish): handle 2FA OTP prompt correctly
docs(readme): update installation instructions
refactor(git): extract tag resolution logic
test(version): add tests for semver calculations
```

### Git Hooks

Pre-commit hooks are set up with Husky and lint-staged:

- Lints staged files before commit
- Runs type-checking
- Validates commit message format

If your commit is rejected:

1. Fix linting issues: `pnpm lint:fix`
2. Fix type errors: `pnpm typecheck`
3. Follow commit message format

## Pull Request Process

### Before Submitting

1. **Update from upstream**:

   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Test your changes**:

   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test:unit
   pnpm build
   ```

3. **Update documentation** if needed:
   - Update README.md for user-facing changes
   - Add/update examples if introducing new features
   - Update docs/src/ if needed

### Submitting the PR

1. **Push to your fork**:

   ```bash
   git push origin your-branch-name
   ```

2. **Open a Pull Request** on GitHub

3. **Fill out the PR template** with:
   - Description of changes
   - Type of change (feature, bug fix, etc.)
   - Related issues
   - Testing performed

### PR Guidelines

- Keep PRs focused on a single concern
- Write clear PR titles following conventional commits format
- Reference related issues (e.g., "Closes #123")
- Respond to review feedback promptly
- Ensure CI checks pass

### Review Process

1. A maintainer will review your PR
2. Address any requested changes
3. Once approved, a maintainer will merge your PR
4. Your contribution will be included in the next release! 🎉

## Additional Resources

### Documentation

- [README.md](README.md) - Project overview and usage
- [Online Documentation](https://relizy.vercel.app/) - Full documentation site

### Useful Links

- [GitHub Repository](https://github.com/LouisMazel/relizy)
- [Issues](https://github.com/LouisMazel/relizy/issues)
- [Changelogen](https://github.com/unjs/changelogen) - Underlying changelog tool
- [Conventional Commits](https://www.conventionalcommits.org/)

### Getting Help

- **Questions?** [Open a question issue](https://github.com/LouisMazel/relizy/issues/new?template=question.md)
- **Found a bug?** [Report it](https://github.com/LouisMazel/relizy/issues/new?template=bug_report.md)
- **Have an idea?** [Suggest a feature](https://github.com/LouisMazel/relizy/issues/new?template=feature_request.md)

---

**Thank you for contributing to Relizy! Your efforts help make this project better for everyone.** 🚀
