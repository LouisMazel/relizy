# Changelog

## v2.3.0-beta.1 (2026-11-14)

[compare changes](https://github.com/LouisMazel/relizy/compare/v2.3.0-beta.0...v2.3.0-beta.1)

### 🚀 Features

- Add release profiles ([1ebdb43](https://github.com/LouisMazel/relizy/commit/1ebdb43))

  A profile is a named way of releasing (beta, canary, latest...) defined once in `profiles` and selected with `--profile <name>`, instead of flags repeated in every CI job. It sets config sections (bump, changelog, publish, release, social, prComment, ai, safetyCheck) over the config file, and the flags of the run still win: defaults, config file, profile, then options.

  The two options that only existed as flags are now config options a profile can set: `release.canary` (`--canary`) and `bump.suffix` (`--suffix`). Without a release flag, `bump.type` of the config now applies instead of always being `release`.

  `loadRelizyConfig({ profile })` and the `profile` option of every command apply a profile, `listProfiles(config)` lists them with what they change, and an unknown profile fails with the profiles available.

- Preview the release of a profile with the MCP server ([b270084](https://github.com/LouisMazel/relizy/commit/b270084))

  `preview_release` and `preview_changelog` take a `profile` argument, as `--profile`: the preview follows the options of the profile, and a canary profile previews a canary version. `get_project` lists the profiles of the config with what they set, the secrets masked.

- Expose a structured preview, progress events, the option catalog and config overlays ([2d110f8](https://github.com/LouisMazel/relizy/commit/2d110f8))

  - previewRelease and previewChangelog return the planned release as data
  - onProgress option and RELIZY_REPORTER=json (NDJSON) report the steps of the commands
  - getConfigOptions lists the config options with their types and defaults
  - config accepts an absolute path (--config, configFile, configName)
  - release and mergePreview accept config and overrides, hooks are chained

- Let an application confirm the bump plan and give the npm one-time password ([edd19c4](https://github.com/LouisMazel/relizy/commit/edd19c4))

  - onConfirm on release() and bump() validates the computed versions instead of the prompt, before anything is written: false cancels the run as a refused prompt
  - onOtp on release() and publish() gives the one-time password the registry asks for, instead of the prompt

- Give what each step did as data in the progress events ([6c8d692](https://github.com/LouisMazel/relizy/commit/6c8d692))

  - step:done and step:failed carry data typed by step: the checks, the bumped versions, the changelog entries, the published packages, the release commit and its tags, the push, the provider releases, the posts and the pull request commented
  - step:item follows the publish package by package and the posts platform by platform
  - the safety checks of the release run to the end, so each one has its status

- Expose the check of the migration from relizy 1 in the API ([30c724e](https://github.com/LouisMazel/relizy/commit/30c724e))

  checkMigration() returns what check_migration of the MCP server lists as data: each finding with its severity, its files and lines, its fix and the page of the migration guide, and the version the project upgrades from. A config that relizy 2 cannot load gives a blocking finding, with the checks that do not need the config.

- Give the merge preview as data for an application ([a7b5d2d](https://github.com/LouisMazel/relizy/commit/a7b5d2d))

  - the report of mergePreview() gives the pull request detected, the branch, each released package with its versions, reason and commits, the packages of a squash merge, the publish, and what was posted
  - the changelog option adds the changelog entries of the release, without the hooks
  - a MergePreviewError carries the report with the problems
  - with comment and check false, the preview is only computed

- **core:** Add getGitPushTarget and getPosixRelativePath ([2fbefcc](https://github.com/LouisMazel/relizy/commit/2fbefcc))

  `getGitPushTarget(cwd)` tells where `git push` pushes the current branch (its upstream, else `origin`), and `getPosixRelativePath(from, to)` gives a relative path with `/` separators on every platform.

- Tell a simulated publish and simulated posts in the step data ([b349bbc](https://github.com/LouisMazel/relizy/commit/b349bbc))

  The data of the `publish` and `social` steps have `dryRun`: in a dry run, `published` and `posted` are what the run would do. The steps document that a name can come with several steps (the three `publish` steps of `relizy publish`, the `merge-preview` steps).

- Accept the path of a config in checkMigration ([348e78a](https://github.com/LouisMazel/relizy/commit/348e78a))

  `configName` of `checkMigration()` is a name or a path relative to the project, as `--config` and the other functions of the API.

### 🩹 Fixes

- Leave the skipped steps out of the markdown summary ([43f7990](https://github.com/LouisMazel/relizy/commit/43f7990))

  The comment of the pull request, the summary of the GitHub Actions run and `release.report.markdown` only list the steps that ran: a project that only versions no longer gets a table of skipped steps. The terminal still shows them.

- **relizy:** Apply bump.type of the config when the CLI gets no release type flag ([4e3ea91](https://github.com/LouisMazel/relizy/commit/4e3ea91))

  Without `--major`, `--minor`, `--prerelease`... the CLI no longer forces the `release` type: `bump.type` of the config, or of the profile, applies, as it already did through the API. A flag still wins over it.

  Impact: a config that sets `bump.type` to something else than `release` now releases that type on every `relizy release` and `relizy bump` without flag, and `release-type: auto` of the GitHub Action and of the GitLab component no longer follows the commits alone when the config sets a type. Remove `bump.type` from the config (or put it in a profile) to get the bump computed from the commits again.

- Mask the secrets of the profiles listed by listProfiles ([7d866ee](https://github.com/LouisMazel/relizy/commit/7d866ee))

  `listProfiles()` returned the tokens, API keys and webhook URLs a profile sets (`social.slack.credentials.token`, `social.twitter.credentials`, the keys of `ai.providers`) in clear in `options` and `settings`: they are now masked as in the debug logs of the config, so an app can show the profiles safely.

- Check the options of each section of a profile ([7bc3ea4](https://github.com/LouisMazel/relizy/commit/7bc3ea4))

  A profile only checked that it set known sections (`bump`, `publish`, `release`...). The options inside them are now checked too: an unknown one (`bump: { typo: 'beta' }`) is a warning naming the options of the section, and an invalid value (`bump: { type: 'beta' }`, `release: { canary: 'yes' }`) fails to load the config with the values expected.

- Take the preid and the dist-tag of a canary from a canary profile only ([071f22a](https://github.com/LouisMazel/relizy/commit/071f22a))

  `relizy release --profile beta --canary` published the canary with the preid and under the dist-tag of `beta`. A canary now takes the `bump.preid` and the `publish.tag` of its profile only when the profile is a canary one (it sets `release.canary`), else `canary` as without profile; `--preid` and `--tag` still win.

- Resolve release.canary to false by default ([377e41d](https://github.com/LouisMazel/relizy/commit/377e41d))

  `release.canary` was the only release step without a default in the resolved config, while the docs announce `false`: it is now `false` unless a profile or `--canary` turns it on.

- Keep the options of the run as set by the user when a profile is applied ([9580591](https://github.com/LouisMazel/relizy/commit/9580591))

  With a profile, the options of the run are merged after it, outside of the layers of the config file: they no longer counted as set by the user (`isSetInUserConfig`), e.g. the `commitlint` option given to the API was not seen by the merge preview. They count again, with the sections the profile sets, also when a profile is applied to a config already resolved.

- Report the canary of a merge preview ([0adedf7](https://github.com/LouisMazel/relizy/commit/0adedf7))

  The report of `relizy merge-preview` always said `canary: false`: with a canary profile, the preview computes a canary version and the report now says `canary: true`.

- Load a config importing relizy from a project that does not install it ([52bbfb9](https://github.com/LouisMazel/relizy/commit/52bbfb9))

  A config importing relizy (`import { defineConfig } from "relizy"`) gets the running relizy, so it loads when relizy is installed elsewhere and run by an application. The packages also export a default condition, for the loaders resolving with require.

- Count only the overrides with a value as set by the user with a profile or hooks ([a2da3b1](https://github.com/LouisMazel/relizy/commit/a2da3b1))
- Keep what each run records apart when an application runs several at once ([10505e0](https://github.com/LouisMazel/relizy/commit/10505e0))

  The data of the steps, the links and AI rewrites of a release and the files a release restores live in the state of the run (`runWithEvents`), shared with the commands it runs: two runs of an application at the same time never mix them.

- Never let an async event listener give an unhandled rejection ([d93513a](https://github.com/LouisMazel/relizy/commit/d93513a))

  A listener of the events can be async (`void | Promise<void>`): it is not awaited, and its rejection is ignored as a throw.

- Name the step of the link events as the other events ([3080106](https://github.com/LouisMazel/relizy/commit/3080106))

  The `step` of a `link` event is `provider-release` and `pr-comment`, as the other events and the hooks name them (the report of the release keeps its own names).

- Capture the logs per call and keep the log level of the application ([e1ba197](https://github.com/LouisMazel/relizy/commit/e1ba197))

  The previews, the MCP server, the output of the CLI and `RELIZY_REPORTER=json` route the logs through one capture: two previews running at the same time each get their own warnings. `previewRelease()`, `previewChangelog()` and `checkMigration()` put the level of the logger back once done, and the previews follow the `logLevel` of the overrides.

- Give the full hash of the commits of the release preview ([ffcd990](https://github.com/LouisMazel/relizy/commit/ffcd990))

  `PreviewCommit.hash` is the full hash of the commit (it was the short one), `shortHash` the short one. The squash commit simulated by a merge preview has no hash.

- Cancel the publish when the application gives no one-time password ([43a1d20](https://github.com/LouisMazel/relizy/commit/43a1d20))

  `onOtp` can answer with a string or a promise. An empty password (or none) cancels the publish with a `RelizyCancelError` instead of a failed publish of the registry; the packages published before stay published.

- Fail at once instead of prompting with RELIZY_REPORTER=json ([b078375](https://github.com/LouisMazel/relizy/commit/b078375))

  Stdout only carries the events: `relizy release` and `relizy bump` without `--yes` nor `onConfirm` fail before computing anything, as without a terminal, and any other prompt (a one-time password) fails with what to do instead of writing in the events.

- Rewrite only relizy and its exported subpaths in a config ([feffbdc](https://github.com/LouisMazel/relizy/commit/feffbdc))

  A config importing `relizy` gets the running relizy, and `relizy/cli` its bin: the other imports are left as they are. Without the running relizy or its build (relizy bundled in another program), the config gets the relizy of the project.

- Tell the real reason of a skipped step ([3773054](https://github.com/LouisMazel/relizy/commit/3773054))

  A skipped step (`step:skipped`, the skipped safety checks) tells the flag of the run (`--no-social`), canary mode (`canary`), or the option of the config or the profile (`release.social: false`), instead of a flag that was not passed.

- Leave the tag out of the bump plan of relizy bump ([475d063](https://github.com/LouisMazel/relizy/commit/475d063))

  `relizy bump` creates no tag: the packages of its `ConfirmPlan` have none, as a release without its release commit or `release.gitTag`.

- Mask the secrets of the defaults of the config options ([c27892e](https://github.com/LouisMazel/relizy/commit/c27892e))

  A default of `getConfigOptions()` read from the environment (a token, a webhook) is masked as `redactSecrets` of `@relizy/core` does, at its place in the config.

- **relizy:** Refuse a profile over a config resolved with another one ([4c54972](https://github.com/LouisMazel/relizy/commit/4c54972))

### 💅 Refactors

- Share isPlainObject between the config and the profiles ([716c9e4](https://github.com/LouisMazel/relizy/commit/716c9e4))
- Build the preview tools of the MCP server on previewRelease and previewChangelog ([b4e8ad7](https://github.com/LouisMazel/relizy/commit/b4e8ad7))

  `preview_release` and `preview_changelog` render the data of `previewRelease()` and `previewChangelog()`: one computation of the release for the API and the agents. The tools of the server import the package sets from their module.

- Give the command run to the output of the CLI ([fcf35dd](https://github.com/LouisMazel/relizy/commit/fcf35dd))

  `createCommandUi` takes the command run (`release`, `merge-preview`) instead of reading it from the title shown, for `command:start` and the prompts.

- Use the push target and the relative paths of @relizy/core ([42623c4](https://github.com/LouisMazel/relizy/commit/42623c4))

  The data of the push step reads `getGitPushTarget`, and the relative paths of relizy go through `getPosixRelativePath`.

### 📖 Documentation

- Document the answers of an application, the step names and the report of the merge preview ([b526d3e](https://github.com/LouisMazel/relizy/commit/b526d3e))

  An error thrown by `onConfirm` fails the run (a `RelizyCancelError` cancels it), and `onConfirm` is not called with `bump.yes`. The docs of the API tell the empty password of `onOtp`, the `dryRun` of the step data, the `merge-preview` steps, the full hash of `PreviewCommit`, the reasons of a skipped step, the config path of `checkMigration`, the relizy a config gets, `pullRequest` and `pullRequestDetails`, and the report written by a merge preview only computed.

- **relizy:** Document the sections a profile can set ([1f34b75](https://github.com/LouisMazel/relizy/commit/1f34b75))
- **relizy:** Document the types of the events, the steps and the merge preview ([447fa14](https://github.com/LouisMazel/relizy/commit/447fa14))

### 📦 Build

- **deps:** Update 6 of my packages ([a2506c5](https://github.com/LouisMazel/relizy/commit/a2506c5))

  - @maz-ui/eslint-config ^5.4.0 -> ^5.5.0
  - @maz-ui/icons ^5.5.0 -> ^5.6.0
  - @maz-ui/themes ^5.5.0 -> ^5.6.0
  - @maz-ui/translations ^5.5.0 -> ^5.6.0
  - @maz-ui/utils ^5.5.0 -> ^5.6.0
  - maz-ui ^5.5.0 -> ^5.6.0

### 🌊 Types

- Export the ProfileOptions type of the profiles ([36e80ef](https://github.com/LouisMazel/relizy/commit/36e80ef))

### 🧪 Tests

- Cover the errors of the command hooks ([4700ea2](https://github.com/LouisMazel/relizy/commit/4700ea2))
- **relizy:** Cover the release preview of unified and grouped monorepos ([abc8f05](https://github.com/LouisMazel/relizy/commit/abc8f05))
- Expect the canary preid when releasing a canary with a profile ([730a6fe](https://github.com/LouisMazel/relizy/commit/730a6fe))
- Cover an onConfirm that throws and bump.yes in the config ([46bb757](https://github.com/LouisMazel/relizy/commit/46bb757))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v2.3.0-beta.0 (2026-11-12)

[compare changes](https://github.com/LouisMazel/relizy/compare/v2.2.1...v2.3.0-beta.0)

### 🚀 Features

- Install relizy with relizy init ([a34383f](https://github.com/LouisMazel/relizy/commit/a34383f))

  `relizy init` now adds relizy to the devDependencies and installs it with the package manager of the project: start with `npx relizy init`, nothing to install before.

  It also asks which AI agents to set up, defaults the registry to the one of your npm config (`.npmrc`), and its next steps list the tokens to set in `.env` to release from your machine.

### 🩹 Fixes

- Detect the repository of an SSH remote in GitLab subgroups ([7c571d6](https://github.com/LouisMazel/relizy/commit/7c571d6))

  An `origin` remote like `git@gitlab.example.com:group/sub/project.git` is now read with its whole path: the compare links of the changelog and the merge request comments work without `repo` in the config.

  relizy warns when the `repository` field of `package.json` or the `origin` remote is found but cannot be read, instead of producing `https://undefined/...` links silently.

- Ask which AI agents to set up in relizy mcp init ([1c2e775](https://github.com/LouisMazel/relizy/commit/1c2e775))

  - In a terminal, `relizy mcp init` asks which AI agents to set up, the detected ones checked
  - `--targets` with an agent other than Claude Code also writes the rules in `AGENTS.md`, read by Codex, Cline and Zed
  - The output tells what changed for which agents, then the next steps

- Show the whole error of a failed release ([f836652](https://github.com/LouisMazel/relizy/commit/f836652))

  - The PR comment and the summary of the CI job give the step where the release stopped and its whole error, without the versions it did not release
  - They still list what already left the machine: the published packages, the pushed commit
  - The error of a hook names it: `before:publish hook failed: ...`

### 📦 Build

- **core:** Upgrade @maz-ui/node to 5.7.0-beta.0 ([c98f13d](https://github.com/LouisMazel/relizy/commit/c98f13d))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v2.2.1 (2026-11-11)

[compare changes](https://github.com/LouisMazel/relizy/compare/v2.2.0...v2.2.1)

### 🩹 Fixes

- Install the commit-msg hook on every clone without husky ([d1907fb](https://github.com/LouisMazel/relizy/commit/d1907fb))

  - Without husky, the hook lives in `.git/hooks`, which is not versioned: `relizy init` now adds `relizy commitlint --install` to the `prepare` script, so every clone gets it at install
  - `relizy commitlint --install` keeps an existing hook with a warning instead of failing, and installs nothing outside a git repository, so it never breaks an install
  - The hook of `.git/hooks` lets the commits through while relizy is not installed, instead of blocking them
  - Once husky is set up, the hook relizy wrote in `.git/hooks` before is removed

- **core:** Fail on a scope that designates an untouched package ([e52f336](https://github.com/LouisMazel/relizy/commit/e52f336))

  The `scope-matches-files` rule is now an error by default instead of a warning: a scope naming a package the commit does not touch gives a misleading changelog entry. Set `commitlint.rules['scope-matches-files']` to `'warn'` to keep the previous behavior, e.g. while a moved package is not released yet.

### 💅 Refactors

- **relizy:** Build on @relizy/core ([0ee8d80](https://github.com/LouisMazel/relizy/commit/0ee8d80))

  relizy now relies on the new `@relizy/core` package for its generic capabilities. Nothing changes for its users: same API, CLI, configuration and behavior, same `v*` tags, GitHub releases and changelog. The MCP server also documents the API of `@relizy/core`.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v2.2.1-beta.0 (2026-11-10)

[compare changes](https://github.com/LouisMazel/relizy/compare/v2.2.0...v2.2.1-beta.0)

### 🩹 Fixes

- Install the commit-msg hook on every clone without husky ([d1907fb](https://github.com/LouisMazel/relizy/commit/d1907fb))

  - Without husky, the hook lives in `.git/hooks`, which is not versioned: `relizy init` now adds `relizy commitlint --install` to the `prepare` script, so every clone gets it at install
  - `relizy commitlint --install` keeps an existing hook with a warning instead of failing, and installs nothing outside a git repository, so it never breaks an install
  - The hook of `.git/hooks` lets the commits through while relizy is not installed, instead of blocking them
  - Once husky is set up, the hook relizy wrote in `.git/hooks` before is removed

- **core:** Fail on a scope that designates an untouched package ([e52f336](https://github.com/LouisMazel/relizy/commit/e52f336))

  The `scope-matches-files` rule is now an error by default instead of a warning: a scope naming a package the commit does not touch gives a misleading changelog entry. Set `commitlint.rules['scope-matches-files']` to `'warn'` to keep the previous behavior, e.g. while a moved package is not released yet.

### 💅 Refactors

- **relizy:** Build on @relizy/core ([0ee8d80](https://github.com/LouisMazel/relizy/commit/0ee8d80))

  relizy now relies on the new `@relizy/core` package for its generic capabilities. Nothing changes for its users: same API, CLI, configuration and behavior, same `v*` tags, GitHub releases and changelog. The MCP server also documents the API of `@relizy/core`.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))
