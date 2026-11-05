# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**Relizy** is a monorepo version management and release automation tool, inspired by [changelogen](https://github.com/unjs/changelogen) (no longer a dependency). It automates versioning, changelog generation, npm publishing, and git provider releases (GitHub/GitLab) for monorepo projects.

## Project Structure

- **`src/commands/`** - CLI command implementations: `init`, `bump`, `changelog`, `publish`, `provider-release`, `release`, `social`, `pr-comment`, `commitlint`
- **`src/mcp/`** - MCP server for AI agents (`relizy mcp`, `relizy mcp init`), see "MCP Server" below
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

Coverage covers `src/` (see the thresholds in `vitest.config.ts`). `test:unit` first generates the docs bundle of the MCP server (`agent-docs/`).

## CLI Development

- The CLI is implemented with [Commander.js](https://github.com/tj/commander.js)
- Global options: `--config <name>`, `--log-level <level>`, `--dry-run`
- Main commands: `init`, `release`, `bump`, `changelog`, `publish`, `provider-release`, `social`, `pr-comment`, `commitlint`, `mcp` (with the `init` subcommand)
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
- Steps run once (bump confirmation, publish order, commit, push, canary rollback, social posts, PR comment) or per group (changelog, tags, provider release), from `BumpResultTruthy.groups`
- A group can override `bump`, `changelog`, `release` (`providerRelease`, `social`) and `ai` (`providerRelease`), and has a `title` shown in the outputs of a release

Before publishing, `src/core/workspace.ts` sorts the packages (dependencies, peer and optional ones), checks the `workspace:` dependencies against the registry and reports stale peer ranges.

### Release Overview and Social Posts

`src/core/release-overview.ts` builds, from a bump result, the `ReleaseOverview` of a release (its groups, the `unified`/`selective` one first, with their versions, tags and packages) and its version lines (`getReleaseLines()`: the root version, and each package of an `independent` group). The social posts (`src/commands/social.ts`), the PR comment and the hooks (`HookContext`, third parameter of the step hooks) use it:

- A release of a single version line keeps `<name> <version> is out!` (`{{releaseTitle}}`); several are posted **once** per platform, by group: `TweetSection[]` (`fitTweetSections()`, filled by priority, lengths counted as X does by `getTweetLength()`) and `SlackReleaseSection[]` (budget shared between the groups by `shareBudget()`).
- With AI, one call per platform: `generateAISocialReleases()` sends a `<release id>` element per version and reads them back, the raw changelog kept for a missing one.
- A refused or cancelled prompt throws a `RelizyCancelError` (`src/core/errors.ts`): the commands rethrow it without their `error:*` hooks, the CLI exits with code 0.

### Out-of-Range Peer Dependencies

`bump.outOfRangePeers` (`bump` by default) bumps, in `getPackages()` (`bumpPeerDependents()`), the packages whose published peer dependency range (computed from the `workspace:` specifier and the version before the bump, see `getOutOfRangePeers()` in `dependencies.ts`) rejects the new version of the dependency, until none is out of range. Independent of `bump.dependencyTypes`. `warn`/`error` only report them before publishing.

- The ranges are checked as npm does (no `includePrerelease`): `^6.19.1` rejects `6.20.0-beta.0`, so a prerelease of the dependency also releases the package.
- Whatever `outOfRangePeers`, a released package whose out-of-range peer makes a breaking change (`isBreakingVersionChange()`: not accepted by `^oldVersion`) gets `breakingPeerDependency`, and `determineReleaseType({ breakingPeer })` bumps it as for a breaking commit (`capZeroMajor` applies). In `unified`/`selective` mode, the packages get the root version: `getBreakingPeerRootVersion()` in `bump.ts` bumps the root as for a breaking commit when a released package has a peer dependency on a package of another group making a breaking change (`hasExternalBreakingPeer()`, the packages of the group are left out as their jumps to the root version are not breaking changes), then plans the packages again. Same for the canary versions (`planCanaryMode`, `planCanaryIndependentMode`).
- With version groups, `readGroupsDependencies()` always follows the peer dependencies across groups, so their ranges are checked against the bumps of the other groups.

### Dependency Handling

- Automatic detection of workspace package dependencies via `expandPackagesToBumpWithDependents()` in `dependencies.ts`
- Transitive dependencies are handled (if A→B→C and C updates, both B and A are bumped)
- `dependencyTypes` config option controls which dependency fields trigger bumps: `dependencies`, `devDependencies`, `peerDependencies`
- In independent mode, dependent packages get a minimum `patch` bump unless they have their own qualifying commits
- Catalogs (`src/core/catalogs.ts`): a commit changing an entry of a catalog (`pnpm-workspace.yaml`, `.yarnrc.yml`, bun's root `package.json`) belongs, in `getPackageCommits()`, to the packages referencing this entry with `catalog:` in any dependency field (their `package.json` at the commit), as an edit of their `package.json` would. The catalogs before and after the commits are read at once (`git cat-file --batch`)

### Moved Packages

A commit belongs to a package when a file of its `--name-status` list is under the package directory (`isCommitInPackage()` in `repo.ts`). `getPreviousPackagePaths()` (`src/core/moved-packages.ts`) adds the former directories of the package, so the commits made before a move keep counting:

- the moves detected in the commits of the range (`getDetectedPackageMoves()`: a renamed `package.json`, `R<score>\told/package.json\tnew/package.json`, as is for `R100`, only when the package keeps its `name` for an inexact rename since git pairs the look-alike `package.json` of a removed and an added package), read from the raw commits so a non-conventional commit of the move still counts, and skipped when a package lives in the old directory again;
- the moves of `monorepo.movedPackages` (`old path: new path`), for the moves git does not detect, applied as is;
- followed through the chains. Applied to the package commits, to the ignored paths of the root filter (`isCommitOnlyInIgnoredPackages()`) and to the first commit of a new package (`getFirstPackageCommitHash()`, which follows its `package.json` with `git log --follow`).

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

- Commits read by `getGitDiff()` (`git-refs.ts`) and parsed by `parseCommits()` (`commits.ts`), the repository resolved by `repo-config.ts` and the GitHub releases created by `github-api.ts`: ported from changelogen 0.6.2 without behavior change (keep it so, a fix goes in a separate commit), its cases are in `commits.spec.ts` and `repo-config.spec.ts`
- Git tags are resolved to determine version ranges (`from` → `to`)
- In unified mode, uses root package tags; in selective/independent modes, uses package-specific tags
- An independent package without a tag of its current version starts at the commit that set this version in its `package.json` (`findVersionCommit()` in `tags.ts`, through its moves), named after its tag (`v6.18.0` when it was released by the selective group); a package created with this version is new (`NEW_PACKAGE_MARKER`)
- Supports commit type mapping via `types` config (e.g., `feat` → `minor` bump)

## Output of the CLI

`src/core/release-ui.ts` renders the commands of the CLI (enabled by `enableCliUi()` in `cli.ts`; the programmatic API keeps the logs of the logger, `classic`, unless `RELIZY_REPORTER`):

- `createCommandUi({ title, dryRun, logLevel, cwd })` starts the output of a command; `ui.step({ running, done, details, run })` runs a step (one line with its duration), `ui.complete()` ends a command, `ui.finish(report)` ends `release` with its summary, `ui.fail()` shows an error once (`markErrorReported()`). A command run by another one (`bump` in `release`) gets the nested output: its steps are the progress of the running step.
- `pretty` (clack: spinner, boxes) in a terminal, `ci` (lines, collapsible groups of GitHub Actions and GitLab CI, annotations, ANSI colors unless `NO_COLOR`) in CI. The logs are captured and written to `node_modules/.cache/relizy/release.log`, shown only with `--log-level verbose`.
- `src/core/progress.ts`, without dependency: `reportProgress()` (what a long step does, `{ ai: true }` for the AI), `reportStepNote()`, `showPreview()` (what a dry run generated, hidden by `--no-preview`), `recordLink()`/`recordAIRewrite()` (the facts of the release summary). The AI is not called in dry-run unless `--ai-preview`.
- The summary of a release (`getReleaseSummary()` and `formatReleaseReportMarkdown()` in `release-report.ts`, its data in `release-facts.ts`) is the end of the terminal output, the summary of the GitHub Actions run, the PR comment of the release and `release.report.markdown`.

## MCP Server

`relizy mcp` (`src/mcp/`) is a read-only MCP server for AI coding agents, loaded on demand (`await import('./mcp')` in `cli.ts`, its SDK is inlined in that chunk by `build.config.ts`):

- **Tools** (`src/mcp/tools/`): `preview_release` and `preview_changelog` (built on `planBumps()` of `bump.ts`, which plans without confirmation nor write, and `generateChangelog()`), `lint_commit`, `get_project`, `get_config_option`, `search_docs`, `get_doc`, `check_migration` (what to change to upgrade from relizy 1, see `docs/src/guide/migration-v2.md`). Each returns markdown; a `ToolInputError` is an error the agent can fix.
- **Guarantees** (`src/mcp/runtime.ts`): the reporters of the logger are replaced so stdout only carries the protocol and the logs come back as notes; `loadProjectConfig()` removes the hooks and never prompts. Never call `bump()`/`release()` from the server.
- **Docs bundle** (`agent-docs/`, gitignored, shipped in the package): generated from `docs/src` and `src/types.ts` (config reference, extracted with oxc) by `src/mcp/knowledge/generate.ts`, at each build, test run and `success:bump` of the release. A renamed doc page cited by the server, an undocumented config key or a CLI command without its page fails `knowledge.spec.ts`.
- **Agents setup**: `relizy mcp init` and the `init` step use `setupAgents()` of `@maz-ui/node` with `RELIZY_AGENTS_TOOL` and the rules of `src/mcp/content/rules.md`.

## Development Tips

1. **Config Changes**: The `src/core/config.ts` defines default configuration. Modify `getDefaultConfig()` to add new defaults.

2. **Versioning Logic**: `src/core/version.ts` contains core semver operations. It has test coverage via `version.spec.ts`.

3. **Testing Single Tests**: Run `pnpm test:unit -- src/core/__tests__/version.spec.ts` to test only version logic.

4. **Dry Run Testing**: Use `pnpm cli bump --patch --dry-run` to preview changes without side effects.

5. **Log Levels**: Use `--log-level debug` to see detailed execution flow for troubleshooting.

6. **Git Integration**: Git operations are abstracted in `src/core/git.ts`. All git commands are logged for debugging.

## Key Dependencies

- **Commander.js** - CLI framework and argument parsing
- **c12** - Configuration file loading and environment variable handling
- **semver** - Semantic version parsing and comparison
- **fast-glob** - File pattern matching for package discovery
- **@clack/prompts** - Interactive output and prompts of the CLI (`src/core/release-ui.ts`, `src/core/prompts.ts`)

## Output Files

- **`dist/index.mjs`** - Main library export (used for programmatic API)
- **`dist/index.d.ts`** - TypeScript type definitions
- **`bin/relizy.mjs`** - Executable CLI script (requires `#!/usr/bin/env node` shebang)
