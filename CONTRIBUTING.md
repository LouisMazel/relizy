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
  - [Adding an AI Provider](#adding-an-ai-provider)
  - [Pull Request Process](#pull-request-process)
    - [Before Submitting](#before-submitting)
    - [Submitting the PR](#submitting-the-pr)
    - [PR Guidelines](#pr-guidelines)
      - [Code Coverage Requirements](#code-coverage-requirements)
    - [Review Process](#review-process)
  - [Additional Resources](#additional-resources)
    - [Documentation](#documentation)
    - [Useful Links](#useful-links)
    - [Getting Help](#getting-help)

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](https://github.com/LouisMazel/relizy/blob/main/.github/CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [me@loicmazuel.com](mailto:me@loicmazuel.com).

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

- **Node.js** `^22.23.4 || ^24.22.1 || >=26.12.1` (the `engines` of `package.json`, `.nvmrc` for the version of the CI)
- **pnpm**, the version of the `packageManager` field of `package.json`, through corepack (Node 25+ no longer ships it):

  ```bash
  npm install -g corepack && corepack enable
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
# Run unit tests (generates the docs bundle of the MCP server, agent-docs/, first)
pnpm test:unit

# Run tests in watch mode
pnpm test:unit:watch

# Run tests with coverage report
pnpm test:unit:coverage

# Run a single spec file
pnpm vitest run packages/relizy/src/core/__tests__/version.spec.ts
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
# Run the CLI from the sources, from the root of the repository (tsx packages/relizy/src/cli.ts)
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
├── packages/
│   ├── relizy/                 # The relizy package (CLI and API)
│   │   ├── src/
│   │   │   ├── cli.ts          # CLI entry point with Commander.js
│   │   │   ├── index.ts        # Public API (an explicit list, see src/__tests__/index.spec.ts)
│   │   │   ├── types.ts        # Types of the config, the options and the results
│   │   │   ├── commands/       # One file per command (bump, changelog, commitlint, init, mcp, merge-preview,
│   │   │   │                   #   pr-comment, provider-release, publish, release, social)
│   │   │   ├── core/           # Logic of the commands (git, tags, versions, npm, AI, commitlint...),
│   │   │   │                   #   with core/mcp/, the MCP server for the AI agents (relizy mcp)
│   │   │   └── **/__tests__/   # Specs, *.git.spec.ts on real git repositories
│   │   ├── agent-docs/         # Docs bundle of the MCP server, generated (gitignored, published)
│   │   ├── bin/relizy.mjs      # CLI executable entry point
│   │   ├── scripts/            # Generation of agent-docs, AI evaluations, peer dependency check
│   │   └── tests/              # Mocks and test helpers of relizy
│   └── core/                   # @relizy/core: the generic building blocks (workspaces, catalogs,
│       └── src/                #   registries, git helpers, GitHub/GitLab providers)
├── .github/                    # GitHub templates and workflows
├── docs/                       # VitePress documentation
└── tests/                      # Test helper shared by the packages (git repository)
```

The paths below are relative to `packages/relizy/`.

### Key Files to Know

- **`src/cli.ts`**: CLI argument parsing and command routing
- **`src/core/version.ts`**: Semver logic of the bumps
- **`src/core/config.ts`**: Default configuration (`getDefaultConfig()`) and config loading
- **`src/types.ts`**: All the types, with the JSDoc read by the API reference and the MCP server
- **`CLAUDE.md`**: Architecture of the codebase
- **`vitest.config.ts`** (root): Test configuration and coverage thresholds of both packages

## Testing

### Unit Tests

Tests are written using [Vitest](https://vitest.dev/), next to the code in `src/**/__tests__/`. The coverage covers the `src/` of both packages, with the thresholds of the root `vitest.config.ts`. The specs named `*.git.spec.ts` run on real git repositories, created in a temporary directory.

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

1. Add tests in the `__tests__/` directory of the module, with the `Given / When / Then` names of the existing specs
2. For a fix, write a test that fails without it
3. Ensure tests are deterministic and isolated
4. Aim for meaningful coverage, not just high percentages

The docs are checked too, by `src/core/mcp/__tests__/knowledge.spec.ts`: it fails when a page cited by the code or the MCP server is renamed, when a CLI flag or a config option is missing from its page, or when a documented default differs from `getDefaultConfig()`. The links between the pages of the docs are relative (`./../config/bump.md`).

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

The `types` of `relizy.config.ts`:

- **feat**: New feature (minor bump)
- **fix**, **perf**, **refactor**, **types**, **style**, **build**: patch bump
- **docs**, **test**: in the changelog, without bump
- **chore**, **examples**, **ci**: neither bump nor changelog

A commit has no scope, except `docs`, `release` and `deps` (`commitlint.scopes` of `relizy.config.ts`). The body of a commit can end up in the changelog: write it for the users of relizy.

### Examples

```bash
feat: add support for custom suffix in prerelease versions
fix: handle the 2FA OTP prompt of npm
docs: update the installation instructions
refactor: extract the tag resolution logic
build(deps): upgrade commander to v15
```

### Git Hooks

The git hooks are set up with Husky:

- `pre-commit` runs lint-staged: `eslint --fix` on the staged files
- `commit-msg` runs `pnpm relizy commitlint --edit "$1"`: the commit message is linted with the rules of relizy itself

The `no-ai-attribution` rule rejects the commits crediting an AI tool (an AI `Co-authored-by:` trailer, a "Generated with" line): turn off the attribution in the settings of your AI tools.

If your commit is rejected:

1. Fix linting issues: `pnpm lint:fix`
2. Follow the problems and the fix printed by commitlint

The hooks do not run the type-checking: run `pnpm typecheck` before opening the pull request.

## Adding an AI Provider

The AI rewrites go through a small registry of providers behind one interface (`src/core/ai/`), today `claude-code` and `ai-sdk`. To add one:

1. Implement `AIProvider` (`src/core/ai/provider.ts`) in `src/core/ai/providers/my-provider.ts`:

   ```ts
   import type { AIProvider } from '../provider'

   export const myProvider: AIProvider = {
     name: 'my-provider',
     async safetyCheck(config) {
       // Throw an actionable error when the auth or a dependency is missing
     },
     async generate(config, request) {
       // Call the model with request.systemPrompt and request.prompt (and request.context),
       // and return { text, usage? }
     },
   }
   ```

2. Register it in `src/core/ai/registry.ts`, in the `providers` map.
3. Add its name to `AIProviderName` and its options to `AIConfig.providers` in `src/types.ts`, then document them in `docs/src/config/ai.md` (`knowledge.spec.ts` checks it).

The prompts, the fallbacks and the call sites need no change.

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
- **Maintain code coverage**: Codecov will comment on your PR

#### Code Coverage Requirements

This project uses [Codecov](https://codecov.io/gh/LouisMazel/relizy) to track code coverage. When you submit a PR, Codecov will automatically:

- 📊 Comment with coverage diff
- 📁 Show coverage for each modified file
- ✅ Run status checks

**Coverage Requirements:**

- **Overall project**: Coverage must not decrease by more than 0.5%
- **New code (patch)**: Must have at least 80% coverage

If Codecov checks fail, add more tests to cover your code:

```bash
# Run tests with coverage locally
pnpm test:unit:coverage

# Open coverage report in browser
open coverage/index.html
```

### Review Process

1. A maintainer will review your PR
2. Address any requested changes
3. Once approved, a maintainer will merge your PR
4. Your contribution will be included in the next release! 🎉

## Additional Resources

### Documentation

- [README.md](https://github.com/LouisMazel/relizy/blob/main/README.md) - Project overview and usage
- [Online Documentation](https://relizy.dev) - Full documentation site

### Useful Links

- [GitHub Repository](https://github.com/LouisMazel/relizy)
- [Issues](https://github.com/LouisMazel/relizy/issues)
- [Changelogen](https://github.com/unjs/changelogen) - Inspiration of the changelog format
- [Conventional Commits](https://www.conventionalcommits.org/)

### Getting Help

- **Questions?** [Open a question issue](https://github.com/LouisMazel/relizy/issues/new?template=question.md)
- **Found a bug?** [Report it](https://github.com/LouisMazel/relizy/issues/new?template=bug_report.md)
- **Have an idea?** [Suggest a feature](https://github.com/LouisMazel/relizy/issues/new?template=feature_request.md)

---

**Thank you for contributing to Relizy! Your efforts help make this project better for everyone.** 🚀
