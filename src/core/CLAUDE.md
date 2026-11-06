# Core modules

Details of `src/core/`, loaded on demand. Overview and conventions: root `CLAUDE.md`.

## Version Groups

`monorepo.groups` (replaces `versionMode` and `packages`) releases several sets of packages, each with its own version mode, in a single run. Implemented in `src/core/groups.ts`:

- `resolveVersionGroups()` assigns each package to one group (an exact path wins over a glob) and derives a full config per group, where the packages of the other groups are `ignored`. The single-mode code runs unchanged on these derived configs; `loadRelizyConfig()` returns a derived config as is (no reload, which would bring `groups` back)
- At most one `unified`/`selective` group: it owns the root version and the repository tags
- `bump` plans every group (no write), propagates the bumps between groups (`externalBumps` of `getPackages()`) until no group changes, confirms, then writes
- Steps run once (bump confirmation, publish order, commit, push, canary rollback, social posts, PR comment) or per group (changelog, tags, provider release), from `BumpResultTruthy.groups`
- A group can override `bump`, `changelog`, `release` (`providerRelease`, `social`) and `ai` (`providerRelease`), and has a `title` shown in the outputs of a release

Before publishing, `src/core/workspace.ts` sorts the packages (dependencies, peer and optional ones), checks the `workspace:` dependencies against the registry and reports stale peer ranges.

## Release Overview and Social Posts

`src/core/release-overview.ts` builds, from a bump result, the `ReleaseOverview` of a release (its groups, the `unified`/`selective` one first, with their versions, tags and packages) and its version lines (`getReleaseLines()`: the root version, and each package of an `independent` group). The social posts (`src/commands/social.ts`), the PR comment and the hooks (`HookContext`, third parameter of the step hooks) use it:

- A release of a single version line keeps `<name> <version> is out!` (`{{releaseTitle}}`); several are posted **once** per platform, by group: `TweetSection[]` (`fitTweetSections()`, filled by priority, lengths counted as X does by `getTweetLength()`) and `SlackReleaseSection[]` (budget shared between the groups by `shareBudget()`).
- With AI, one call per platform: `generateAISocialReleases()` sends a `<release id>` element per version and reads them back, the raw changelog kept for a missing one.
- A refused or cancelled prompt throws a `RelizyCancelError` (`src/core/errors.ts`): the commands rethrow it without their `error:*` hooks, the CLI exits with code 0.

## Out-of-Range Peer Dependencies

`bump.outOfRangePeers` (`bump` by default) bumps, in `getPackages()` (`bumpPeerDependents()`), the packages whose published peer dependency range (computed from the `workspace:` specifier and the version before the bump, see `getOutOfRangePeers()` in `dependencies.ts`) rejects the new version of the dependency, until none is out of range. Independent of `bump.dependencyTypes`. `warn`/`error` only report them before publishing.

- The ranges are checked as npm does (no `includePrerelease`): `^6.19.1` rejects `6.20.0-beta.0`, so a prerelease of the dependency also releases the package.
- Whatever `outOfRangePeers`, a released package whose out-of-range peer makes a breaking change (`isBreakingVersionChange()`: not accepted by `^oldVersion`) gets `breakingPeerDependency`, and `determineReleaseType({ breakingPeer })` bumps it as for a breaking commit (`capZeroMajor` applies). In `unified`/`selective` mode, the packages get the root version: `getBreakingPeerRootVersion()` in `bump.ts` bumps the root as for a breaking commit when a released package has a peer dependency on a package of another group making a breaking change (`hasExternalBreakingPeer()`, the packages of the group are left out as their jumps to the root version are not breaking changes), then plans the packages again. Same for the canary versions (`planCanaryMode`, `planCanaryIndependentMode`).
- With version groups, `readGroupsDependencies()` always follows the peer dependencies across groups, so their ranges are checked against the bumps of the other groups.

## Dependency Handling

- `expandPackagesToBumpWithDependents()` in `dependencies.ts` detects the workspace dependents; transitive ones are bumped too
- `dependencyTypes` controls which dependency fields trigger bumps: `dependencies`, `devDependencies`, `peerDependencies`
- In independent mode, dependent packages get a minimum `patch` bump unless they have their own qualifying commits
- Catalogs (`src/core/catalogs.ts`): a commit changing an entry of a catalog (`pnpm-workspace.yaml`, `.yarnrc.yml`, bun's root `package.json`) belongs, in `getPackageCommits()`, to the packages referencing this entry with `catalog:` in any dependency field (their `package.json` at the commit), as an edit of their `package.json` would. The catalogs before and after the commits are read at once (`git cat-file --batch`)

## Moved Packages

A commit belongs to a package when a file of its `--name-status` list is under the package directory (`isCommitInPackage()` in `repo.ts`). `getPreviousPackagePaths()` (`src/core/moved-packages.ts`) adds the former directories of the package, so the commits made before a move keep counting:

- the moves detected in the commits of the range (`getDetectedPackageMoves()`: a renamed `package.json`, `R<score>\told/package.json\tnew/package.json`, as is for `R100`, only when the package keeps its `name` for an inexact rename since git pairs the look-alike `package.json` of a removed and an added package), read from the raw commits so a non-conventional commit of the move still counts, and skipped when a package lives in the old directory again;
- the moves of `monorepo.movedPackages` (`old path: new path`), for the moves git does not detect, applied as is;
- followed through the chains. Applied to the package commits, to the ignored paths of the root filter (`isCommitOnlyInIgnoredPackages()`) and to the first commit of a new package (`getFirstPackageCommitHash()`, which follows its `package.json` with `git log --follow`).

## Git Cache

`src/core/git-cache.ts` caches the git reads of a command run: the same branch, tags and commit ranges are read for each package and each step.

- Active only inside `withGitCache()`, opened by each command (`bump`, `release`...; a command run by another one shares the cache) and by each MCP tool call. Outside it, `cachedGitRead()` always runs git, so the low-level functions behave as before.
- Cached: `getCurrentGitBranch()`, `getFirstCommit()`, `tagExists()`, `isAncestor()`, `listTags()` and `getGitDiff()` (a copy of the commits is returned to each caller).
- A git write changing HEAD, a branch or a tag must call `clearGitCache()` (commit, tag, fetch, checkout, merge), as do the commands of the user (`executeHook()`, `formatCmd`, `buildCmd`).

## Package Discovery and Configuration

- Private packages are filtered out; `monorepo.ignored` excludes packages (path globs, as `packages`)
- Config files follow `<name>.config.<ext>` (several can coexist, `--config <name>`), loaded by c12 and merged with the defaults via `defu()`

## Changelog and Tags

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

