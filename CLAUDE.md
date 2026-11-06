# CLAUDE.md

## Overview

**Relizy** is a monorepo version management and release automation tool (versioning, changelog, npm publishing, GitHub/GitLab releases), inspired by [changelogen](https://github.com/unjs/changelogen) (no longer a dependency).

## Project Structure

- `src/commands/` - one file per CLI command (`init`, `bump`, `changelog`, `publish`, `provider-release`, `release`, `social`, `pr-comment`, `commitlint`)
- `src/core/` - business logic (see `src/core/CLAUDE.md`); package discovery is `getPackages()` in `repo.ts`, the defaults are `getDefaultConfig()` in `config.ts`
- `src/mcp/` - MCP server for AI agents, `relizy mcp` and `relizy mcp init` (see `src/mcp/CLAUDE.md`)
- `src/cli.ts` - Commander.js setup; `getReleaseType()` converts the CLI flags to semver bump types
- `src/types.ts` - types of all configuration and option objects
- `bin/relizy.mjs` - executable entry of the published package, it must keep its `#!/usr/bin/env node` shebang

## Commands

- `pnpm relizy <command>` (alias `pnpm rly`) runs the CLI from the sources, e.g. `pnpm relizy bump --patch --dry-run` to preview a bump without side effects (`--log-level debug` for the detailed flow)
- `pnpm typecheck`, `pnpm lint` (`lint:fix`), `pnpm build` (`pnpm dev` for the stub mode)
- `pnpm test:unit` (also `:watch`, `:coverage`; thresholds in `vitest.config.ts`); `test:unit` first generates the docs bundle of the MCP server (`agent-docs/`). One test file: `pnpm test:unit -- src/core/__tests__/version.spec.ts`

## Architecture

### Monorepo Version Modes

`monorepo.versionMode` in `relizy.config.ts`:

1. `unified` - all packages share one version, at the root
2. `selective` (recommended) - unified versioning, but only the packages with commits are bumped
3. `independent` - each package has its own version; the root version stays separate

`monorepo.groups` (replaces `versionMode` and `packages`) releases several sets of packages, each with its own mode, in one run.

The details of the core modules (groups, peer dependencies, moved packages, git cache, release overview and social posts, CLI output, changelog and tags) are in `src/core/CLAUDE.md`, loaded when you read files of `src/core/`. Read it before changing a command in `src/commands/` that uses them.

## Public API

`src/index.ts` lists the public API explicitly (the commands, `defineConfig`, `loadRelizyConfig`, the errors, `lintCommitMessage` and the types), never `export *`: a new export is a decision, guarded by `src/__tests__/index.spec.ts`, and shows up in the typedoc of the docs.
