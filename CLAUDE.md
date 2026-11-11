# CLAUDE.md

## Overview

**Relizy** is a monorepo version management and release automation tool (versioning, changelog, npm publishing, GitHub/GitLab releases), inspired by [changelogen](https://github.com/unjs/changelogen) (no longer a dependency).

## Project Structure

pnpm monorepo, two published packages and the docs:

- `packages/relizy/` - the `relizy` CLI and API (what the sections below describe; the paths `src/...` are relative to it)
- `packages/core/` - `@relizy/core`, the capabilities relizy is built on (git, commits and commitlint, workspaces, versions, tags, changelog data and markdown, registries, GitHub/GitLab, CI; modules in `packages/core/CLAUDE.md`). The rule: capabilities in core, orchestration in relizy. Core takes plain parameters (`cwd`, paths, options, an optional `CoreLogger`) and never depends on the resolved config, clack, c12, the AI or the UI
- `docs/` - the VitePress site; `tests/git-repository.ts` - the git repository helper shared by the tests of both packages
- `relizy.config.ts` - releases both with two version groups: `relizy` (`selective`: owns the root version, the `v*` tags and the root `CHANGELOG.md`) and `core` (`independent`: `@relizy/core@x.y.z` tags)

In `packages/relizy/`:

- `src/commands/` - one file per CLI command (`init`, `bump`, `changelog`, `publish`, `provider-release`, `release`, `social`, `pr-comment`, `commitlint`)
- `src/core/` - orchestration (see `src/core/CLAUDE.md`); package discovery is `getPackages()` in `repo.ts`, the defaults are `getDefaultConfig()` in `config.ts`. Modules moved to `@relizy/core` are imported from it directly, with no re-exporting file; adapters bind it to the config and the logger (`npm-registry.ts`, `gitlab.ts`, `ci.ts`...), and `vi.mock` of a function called inside core must target the core file
- `src/mcp/` - MCP server for AI agents, `relizy mcp` and `relizy mcp init` (see `src/mcp/CLAUDE.md`)
- `src/cli.ts` - Commander.js setup; `getReleaseType()` converts the CLI flags to semver bump types
- `src/types.ts` - types of all configuration and option objects, and the source of the config reference of the docs; a type is declared once: the ones core also uses (`RepoConfig`, `RegistryTarget`, `PackageManager`...) are declared in core and re-exported from here, the extractor of the reference (`src/mcp/knowledge/generate.ts`) reads them from the sources of core
- `bin/relizy.mjs` - executable entry of the published package, it must keep its `#!/usr/bin/env node` shebang

## Commands

- `pnpm relizy <command>` (alias `pnpm rly`) runs the CLI from the sources, from the root, e.g. `pnpm relizy bump --patch --dry-run` to preview a bump without side effects (`--log-level debug` for the detailed flow)
- The root scripts (`pnpm build`, `dev`, `typecheck`, `lint`, `test:unit` and their variants) run cached Nx tasks (`nx.json`; the graph builds core before relizy and generates `packages/relizy/agent-docs/` first), `pnpm exec nx affected -t <target>` only what changed since `develop`; coverage is one root vitest run, for a single `coverage/lcov.info`. One test file: `pnpm vitest run <path>` (after a first `pnpm test:unit`). Never `nx release`: relizy owns the versions
- The packages read `@relizy/core` from its sources (`paths` of `tsconfig.json`, alias of the vitest config of relizy); the built `dist` is only needed to run the published bin

## Architecture

### Monorepo Version Modes

`monorepo.versionMode` in `relizy.config.ts`:

1. `unified` - all packages share one version, at the root
2. `selective` (recommended) - unified versioning, but only the packages with commits are bumped
3. `independent` - each package has its own version; the root version stays separate

`monorepo.groups` (replaces `versionMode` and `packages`) releases several sets of packages, each with its own mode, in one run.

The details of the orchestration (groups, peer dependencies, git cache use, release overview and social posts, CLI output, changelog and tags) are in `src/core/CLAUDE.md`, loaded when you read files of `src/core/`. Read it before changing a command in `src/commands/` that uses them.

## Public API

`packages/relizy/src/index.ts` lists the public API explicitly (the commands, `defineConfig`, `loadRelizyConfig`, the errors, `lintCommitMessage` and the types), never `export *`: a new export is a decision, guarded by `src/__tests__/index.spec.ts`, and shows up in the typedoc of the docs.

`@relizy/core` is a public API consumed by other projects: never change the signature or the behavior of an export without a major bump, and add a capability as an option or an extension of an existing function. Its `packages/core/src/index.ts` lists the exports explicitly (never `export *`), guarded by `packages/core/src/__tests__/index.spec.ts`; core only holds code relizy uses itself. Its API reference for agents is generated from `index.ts` and the JSDoc of the exports into the docs bundle of the MCP server (`core/*` pages).
