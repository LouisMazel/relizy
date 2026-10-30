# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**Relizy** is a monorepo version management and release automation tool built on top of [changelogen](https://github.com/unjs/changelogen). It automates versioning, changelog generation, npm publishing, and git provider releases (GitHub/GitLab) for monorepo projects.

## Project Structure

- **`src/commands/`** - CLI command implementations: `bump`, `changelog`, `publish`, `provider-release`, `release`
- **`src/core/`** - Core business logic modules:
  - `monorepo.ts` - Package discovery and package info resolution
  - `config.ts` - Configuration loading via c12
  - `version.ts` - Version calculation and semver operations
  - `dependencies.ts` - Dependency graph traversal and dependent package identification
  - `git.ts`, `github.ts`, `gitlab.ts` - Git and provider integration
  - `npm.ts` - NPM registry operations
  - `changelog.ts`, `tags.ts`, `markdown.ts` - Changelog and tag management
- **`src/cli.ts`** - Commander.js CLI setup and argument parsing
- **`src/types.ts`** - TypeScript type definitions for all configuration and option objects
- **`bin/relizy.mjs`** - CLI entry point (shebang-enabled Node script)

## Build Commands

```bash
pnpm build          # Build distribution with unbuild
pnpm dev            # Build in stub mode (faster for development)
pnpm typecheck      # Run TypeScript type checking
pnpm lint           # Run ESLint
pnpm lint:fix       # Run ESLint with --fix
```

## Test Commands

```bash
pnpm test:unit                # Run unit tests with Vitest
pnpm test:unit:watch          # Run tests in watch mode
pnpm test:unit:coverage       # Run tests with coverage report
```

Coverage is configured to only report on `src/core/version.ts` (see `vitest.config.ts`).

## CLI Development

- The CLI is implemented with [Commander.js](https://github.com/tj/commander.js)
- Global options: `--config <name>`, `--log-level <level>`, `--dry-run`
- Main commands: `bump`, `changelog`, `publish`, `provider-release`, `release`
- Use `pnpm cli` to run the CLI locally during development
- Release type detection uses `getReleaseType()` helper in `cli.ts` to convert CLI flags to semver bump types

## Architecture Patterns

### Monorepo Version Modes

Three version management strategies are supported:

1. **`unified`** - All packages versioned together with a single version number at root
2. **`selective`** (recommended) - Unified versioning but only packages with commits are bumped
3. **`independent`** - Each package has its own independent version; root version stays separate

Version mode is configured in `relizy.config.ts` under `monorepo.versionMode`.

### Version Groups

`monorepo.groups` (replaces `versionMode` and `packages`) releases several sets of packages, each with its own version mode, in a single run. Implemented in `src/core/groups.ts`:

- `resolveVersionGroups()` assigns each package to one group (an exact path wins over a glob) and derives a full config per group, where the packages of the other groups are `ignored`. The single-mode code runs unchanged on these derived configs; `loadRelizyConfig()` returns a derived config as is (no reload, which would bring `groups` back)
- At most one `unified`/`selective` group: it owns the root version and the repository tags
- `bump` plans every group (no write), propagates the bumps between groups (`externalBumps` of `getPackages()`) until no group changes, confirms, then writes
- Steps run once (publish order, commit, push, canary rollback, PR comment) or per group (changelog, tags, provider release, social), from `BumpResultTruthy.groups`

Before publishing, `src/core/workspace.ts` sorts the packages (dependencies, peer and optional ones), checks the `workspace:` dependencies against the registry and reports stale peer ranges.

### Out-of-Range Peer Dependencies

`bump.outOfRangePeers` (`bump` by default) bumps, in `getPackages()`, the packages whose published peer dependency range (computed from the `workspace:` specifier and the version before the bump, see `getOutOfRangePeers()` in `dependencies.ts`) rejects the new version of the dependency, until none is out of range. Independent of `bump.dependencyTypes`. `warn`/`error` only report them before publishing.

### Dependency Handling

- Automatic detection of workspace package dependencies via `expandPackagesToBumpWithDependents()` in `dependencies.ts`
- Transitive dependencies are handled (if A→B→C and C updates, both B and A are bumped)
- `dependencyTypes` config option controls which dependency fields trigger bumps: `dependencies`, `devDependencies`, `peerDependencies`
- In independent mode, dependent packages get a minimum `patch` bump unless they have their own qualifying commits

### Configuration Loading

- Uses [c12](https://github.com/unjs/c12) for config file discovery and loading
- Supports multiple formats: `.ts`, `.js`, `.json`, `.yaml`, `.toml`
- Multiple config files can coexist with pattern `<name>.config.<ext>` (e.g., `relizy.standalone.config.ts`)
- Config is loaded with `loadConfig()` and merged with defaults via `defu()`
- The `--config` CLI flag specifies config name (without `.config` suffix)

### Package Discovery

- Uses [fast-glob](https://github.com/mrmlnc/fast-glob) to discover packages via glob patterns
- Package info is read from `package.json` files
- Private packages are automatically filtered out
- Packages can be excluded via `ignorePackageNames` config

### Changelog and Tags

- Leverages changelogen for commit parsing and changelog generation
- Git tags are resolved to determine version ranges (`from` → `to`)
- In unified mode, uses root package tags; in selective/independent modes, uses package-specific tags
- Supports commit type mapping via `types` config (e.g., `feat` → `minor` bump)

## Development Tips

1. **Config Changes**: The `src/core/config.ts` defines default configuration. Modify `getDefaultConfig()` to add new defaults.

2. **Versioning Logic**: `src/core/version.ts` contains core semver operations. It has test coverage via `version.spec.ts`.

3. **Testing Single Tests**: Run `pnpm test:unit -- src/core/__tests__/version.spec.ts` to test only version logic.

4. **Dry Run Testing**: Use `pnpm cli bump --patch --dry-run` to preview changes without side effects.

5. **Log Levels**: Use `--log-level debug` to see detailed execution flow for troubleshooting.

6. **Git Integration**: Git operations are abstracted in `src/core/git.ts`. All git commands are logged for debugging.

## Key Dependencies

- **changelogen** - Commit parsing, changelog generation, and semver detection
- **Commander.js** - CLI framework and argument parsing
- **c12** - Configuration file loading and environment variable handling
- **semver** - Semantic version parsing and comparison
- **fast-glob** - File pattern matching for package discovery
- **@inquirer/prompts** - Interactive CLI prompts for confirmations

## Output Files

- **`dist/index.mjs`** - Main library export (used for programmatic API)
- **`dist/index.d.ts`** - TypeScript type definitions
- **`bin/relizy.mjs`** - Executable CLI script (requires `#!/usr/bin/env node` shebang)
