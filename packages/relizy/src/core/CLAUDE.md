# Core modules

Orchestration of `src/core/` of the relizy package (`packages/relizy/`), loaded on demand. Overview and conventions: root `CLAUDE.md`. The generic capabilities (git execution, refs, cache and commits, catalogs, moved packages, dependencies and peers, tags, changelog data and markdown, package manager and registries, GitHub/GitLab API and auth) live in `@relizy/core`, described in `packages/core/CLAUDE.md`: relizy imports them directly, and only the files that need the config or the logger stay here as adapters.

## Version Groups

`monorepo.groups` (replaces `versionMode` and `packages`) releases several sets of packages, each with its own version mode, in a single run. Implemented in `src/core/groups.ts`:

- `resolveVersionGroups()` assigns each package to one group (an exact path wins over a glob) and derives a full config per group, where the packages of the other groups are `ignored`. The single-mode code runs unchanged on these derived configs; `loadRelizyConfig()` applies the overrides to a resolved `baseConfig` without reloading it (a reload would bring `groups` back)
- At most one `unified`/`selective` group: it owns the root version and the repository tags
- `bump` plans every group (no write), propagates the bumps between groups (`externalBumps` of `getPackages()`) until no group changes, confirms, then writes
- Steps run once (bump confirmation, publish order, commit, push, canary rollback, social posts, PR comment) or per group (changelog, tags, provider release), from `BumpResultTruthy.groups`; a step run per group iterates `getReleaseTargets()`, which also gives the config without groups
- A group can override `bump`, `changelog`, `release` (`providerRelease`, `social`) and `ai` (`providerRelease`), and has a `title` shown in the outputs of a release

Before publishing, `src/core/workspace.ts` sorts the packages (dependencies, peer and optional ones), checks the `workspace:` dependencies against the registry and reports stale peer ranges.

## Release Overview and Social Posts

`src/core/release-overview.ts` builds, from a bump result, the `ReleaseOverview` of a release (its groups, the `unified`/`selective` one first, with their versions, tags and packages) and its version lines (`getReleaseLines()`: the root version, and each package of an `independent` group). The social posts (`src/commands/social.ts`), the PR comment and the hooks (`HookContext`, third parameter of the step hooks) use it:

- A release of a single version line keeps `<name> <version> is out!` (`{{releaseTitle}}`); several are posted **once** per platform, by group: `TweetSection[]` (`fitTweetSections()`, filled by priority, lengths counted as X does by `getTweetLength()`) and `SlackReleaseSection[]` (budget shared between the groups by `shareBudget()`).
- With AI, one call per platform: `generateAISocialReleases()` sends a `<release id>` element per version and reads them back, the raw changelog kept for a missing one.
- A refused or cancelled prompt throws a `RelizyCancelError` (`src/core/errors.ts`): the commands rethrow it without their `error:*` hooks, the CLI exits with code 0.

## Out-of-Range Peer Dependencies

`bump.outOfRangePeers` (`bump` by default) bumps, in `getPackages()` (`bumpPeerDependents()`), the packages whose published peer dependency range (see `getOutOfRangePeers()` in `@relizy/core`) rejects the new version of the dependency, until none is out of range. Independent of `bump.dependencyTypes`. `warn`/`error` only report them before publishing. With `bump.dependents: 'out-of-range'` (the default), the same fixpoint (`getOutOfRangeDependencies()`) also bumps the dependents of the `dependencyTypes` fields, nothing is expanded before (`planPackages()`), and a specifier that is not a semver range counts as out of range there; only a peer gives `breakingPeerDependency`.

- Whatever `outOfRangePeers`, a released package whose out-of-range peer makes a breaking change (`isBreakingVersionChange()`: not accepted by `^oldVersion`) gets `breakingPeerDependency`, and `determineReleaseType({ breakingPeer })` bumps it as for a breaking commit (`capZeroMajor` applies). In `unified`/`selective` mode, the packages get the root version: `getBreakingPeerRootVersion()` in `bump.ts` bumps the root as for a breaking commit when a released package has a peer dependency on a package of another group making a breaking change (`hasExternalBreakingPeer()`, the packages of the group are left out as their jumps to the root version are not breaking changes), then plans the packages again. Same for the canary versions (`planCanaryMode`, `planCanaryIndependentMode`).
- With version groups, `readGroupsDependencies()` always follows the peer dependencies across groups, so their ranges are checked against the bumps of the other groups.

## Dependency Handling

- `bump.dependents: 'always'` bumps the transitive dependents too (`expandPackagesToBumpWithDependents()` of `@relizy/core` finds them); `dependencyTypes` controls which dependency fields trigger bumps (`dependencies`, `devDependencies`, `peerDependencies`)
- In independent mode, dependent packages get a minimum `patch` bump unless they have their own qualifying commits
- A commit changing a catalog entry reaches the packages referencing it in `getPackageCommits()` (catalogs: `packages/core/CLAUDE.md`)

## Moved Packages

`monorepo.movedPackages` (`old path: new path`) is passed to the functions of `@relizy/core` that follow the moves of a package (`getPackageCommits()`, `getFirstPackageCommitHash()`, `findVersionCommit()`); the detection of the moves and how they are applied are described in `packages/core/CLAUDE.md`.

## Git Cache

Each command (`bump`, `release`...; a command run by another one shares the cache) and each MCP tool call runs inside `withGitCache()` of `@relizy/core`. The commands of the user (`executeHook()`, `formatCmd`, `buildCmd`) call `clearGitCache()` as they can change HEAD, a branch or a tag. Checks done once per run (`ensurePushAccess()`, `prepareCiRepository()`) go through `oncePerRun()`.

## Package Discovery and Configuration

- Private packages are filtered out; `monorepo.ignored` excludes packages (path globs, as `packages`)
- Config files follow `<name>.config.<ext>` (several can coexist, `--config <name>`), loaded by c12 and merged with the defaults via `defu()`

## Changelog and Tags

- `generateChangelog()` (`changelog.ts`) reads the commits through `getPackageCommits()` (`repo.ts`, which binds the config to the function of `@relizy/core`) and renders them with `resolveChangelogRange()` and `renderChangelog()` of `@relizy/core`; it adds the empty-changelog placeholder and the `generate:changelog` hook (full outputs only), and `writeChangelogToFile()` writes the `CHANGELOG.md`. `changelog-format.ts` runs the formatter (`changelog.formatCmd` or the one detected) on the changelogs written
- Git tags are resolved to determine version ranges (`from` → `to`); in unified mode the root package tags are used, in selective/independent modes the package-specific ones
- Supports commit type mapping via `types` config (e.g., `feat` → `minor` bump)
- The GitHub and GitLab releases share one flow, `postProviderReleases()` (`provider-releases.ts`): a provider is a `ReleaseProvider` adapter (`githubReleaseProvider`, `gitlabReleaseProvider`) that checks its config and creates a release

## Output of the CLI

`src/core/release-ui.ts` renders the commands of the CLI (enabled by `enableCliUi()` in `cli.ts`; the programmatic API keeps the logs of the logger, `classic`, unless `RELIZY_REPORTER`):

- `createCommandUi({ title, dryRun, logLevel, cwd })` starts the output of a command; `ui.step({ running, done, details, run })` runs a step (one line with its duration), `ui.complete()` ends a command, `ui.finish(report)` ends `release` with its summary, `ui.fail()` shows an error once (`markErrorReported()`). A command run by another one (`bump` in `release`) gets the nested output: its steps are the progress of the running step.
- `pretty` (clack: spinner, boxes) in a terminal, `ci` (lines, collapsible groups of GitHub Actions and GitLab CI, annotations, ANSI colors unless `NO_COLOR`) in CI. The logs are captured and written to `node_modules/.cache/relizy/release.log`, shown only with `--log-level verbose`.
- `src/core/progress.ts`, without dependency: `reportProgress()` (what a long step does, `{ ai: true }` for the AI), `reportStepNote()`, `showPreview()` (what a dry run generated, hidden by `--no-preview`), `recordLink()`/`recordAIRewrite()` (the facts of the release summary). The AI is not called in dry-run unless `--ai-preview`.
- The summary of a release (`getReleaseSummary()` and `formatReleaseReportMarkdown()` in `release-report.ts`, its data in `release-facts.ts`) is the end of the terminal output, the summary of the GitHub Actions run, the PR comment of the release and `release.report.markdown`.
