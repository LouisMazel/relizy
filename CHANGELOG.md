# Changelog

## v2.3.0-beta.2 (2026-11-14)

[compare changes](https://github.com/LouisMazel/relizy/compare/v2.3.0-beta.1...v2.3.0-beta.2)

### 🩹 Fixes

- **relizy:** Pin the workspace dependencies of a canary to the exact version ([5478ed8](https://github.com/LouisMazel/relizy/commit/5478ed8))

  A canary published `^2.3.0-0.canary-<sha>` ranges for its workspace dependencies, which also match older canaries (the sha compares as text), so installing a canary could pull an older canary of its dependencies. The workspace ranges of a canary are now published as the exact version, and restored after the release.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

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

## v2.2.0 (2026-11-08)

[compare changes](https://github.com/LouisMazel/relizy/compare/v2.1.0...v2.2.0)

### 🚀 Features

- Keep the agent rules up to date with relizy mcp update ([cfd3654](https://github.com/LouisMazel/relizy/commit/cfd3654))

  `relizy mcp update` rewrites the relizy rules of the AI agents already set up
  in the project when their content changed: it never creates a rule, never
  touches the MCP config nor the rules edited by hand. `relizy init` adds it to
  the `prepare` script of the root package.json when the agents step is accepted.

  The rules are reported as outdated only when their content changed, not at
  every release: the CLI, the instructions of the MCP server and get_project
  then propose `relizy mcp update`.

### 🩹 Fixes

- Count the released packages in the title of a release, not the versions ([f229801](https://github.com/LouisMazel/relizy/commit/f229801))

  Beyond two versions, the title of the release (PR comment, summary of the run, terminal) counts the released packages: a version of a selective group can ship several packages, so "Released 5 versions of maz-ui" becomes "Released 11 packages of maz-ui".

### 🧪 Tests

- Hide the GitHub workflow from the CLI specs ([aeba7c0](https://github.com/LouisMazel/relizy/commit/aeba7c0))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v2.1.0 (2026-11-08)

[compare changes](https://github.com/LouisMazel/relizy/compare/v2.0.2...v2.1.0)

### 🚀 Features

- Preview the release of a merge in its pull request ([d2dfd68](https://github.com/LouisMazel/relizy/commit/d2dfd68))

  `relizy merge-preview` runs in the pipeline of a pull request (GitHub) or a merge request (GitLab), with the options of the release job, and computes the release of the merge without writing anything: no version, changelog, commit, tag, push, publish nor hook.

  - it comments the pull request with the versions, the tags and the dist-tag the merge releases, and what the pull request brings, updated at each push and rewritten by the release of the merge;
  - it sets the commit status `relizy/merge-preview`, failed when the release of the merge would fail: a version or a tag already taken, a squash commit that is not a Conventional Commit, the commitlint of the project;
  - a squash merge is detected from the provider (`mergePreview.squash`), both outcomes shown when they differ.

  ```yaml
  - uses: relizy/action@v2
    with:
      merge-preview: true
  ```

  The `merge-preview` component does the same on GitLab, `relizy init` offers it, and `mergePreview()` runs it from code. The comments of the pull requests are now listed by pages of 100.

- Add the merge preview to a project already set up ([e305360](https://github.com/LouisMazel/relizy/commit/e305360))

  `relizy init` offers the merge preview on its own, also when the release workflow is not generated or already exists, and `--only` runs some of its steps only (`config`, `commitlint`, `scripts`, `agents`, `workflow`, `merge-preview`). `relizy merge-preview init` is the shortcut to add the merge preview workflow:

  ```bash
  npx relizy merge-preview init
  # The same
  npx relizy init --only merge-preview
  ```

  Without the `config` step, the existing config is kept without asking. The result of `init()` tells the merge preview workflow written in `mergePreview`.

- Use the token of the GitHub CLI on a local run ([63275bd](https://github.com/LouisMazel/relizy/commit/63275bd))

  Without `RELIZY_GITHUB_TOKEN`, `GITHUB_TOKEN` nor `GH_TOKEN`, a local run of relizy takes the token of the GitHub CLI when it is logged in (`gh auth token`, for the host of the repository): the GitHub releases and the PR comments need no token to create.

  ```bash
  gh auth login
  relizy release
  ```

  The environment variables still win, and a CI never asks the GitHub CLI.

- Choose between the relizy integration and its CLI in the workflows of relizy init ([5479bcc](https://github.com/LouisMazel/relizy/commit/5479bcc))

  `relizy init` asks how the CI runs relizy, on GitHub and gitlab.com: with the relizy action or component (the default, and with `--yes`), or with the relizy CLI, whose steps are written out in the workflow (the package manager, Node.js, the install, `relizy release`). The choice applies to the release workflow and to the merge preview. A self-managed GitLab always gets the job written out.

### 🩹 Fixes

- Only bump the root version from the commits of the released packages ([03ce66c](https://github.com/LouisMazel/relizy/commit/03ce66c))

  In `unified` and `selective` mode, the root version and the root changelog now only count the commits of the released packages: their directories (and former directories) and the catalog entries they use. A commit changing no package (a CI workflow, a script, a private app left out by `privatePackages`, the packages of another version group) no longer releases every package of a `unified` group.

  A private package still counts with `privatePackages: 'release'`, and the root of a project without workspace packages keeps every commit.

### 📖 Documentation

- Declare the AI usage preferences of the docs in robots.txt ([8dc69a0](https://github.com/LouisMazel/relizy/commit/8dc69a0))

  Content Signals (https://contentsignals.org): the docs can be used to train, to index and to answer in the AI tools.

- Serve the markdown of the pages to the agents that ask for it ([b0da034](https://github.com/LouisMazel/relizy/commit/b0da034))

  A Cloudflare Pages worker answers the requests with `Accept: text/markdown` with the .md version of the page (llms.txt for the homepage), the browsers keep the HTML. The homepage also gets `Link` headers (RFC 8288) to llms.txt and the getting started guide.

- Publish the rules of relizy for the agents as a discoverable skill ([a1c89c1](https://github.com/LouisMazel/relizy/commit/a1c89c1))

  The build writes /.well-known/agent-skills/index.json (Agent Skills Discovery RFC v0.2.0) and the relizy skill: the rules that `relizy mcp init` writes in the projects, with the links to llms.txt, so an agent finds them without installing relizy.

- Publish an ARD manifest of the resources for the agents ([e79a990](https://github.com/LouisMazel/relizy/commit/e79a990))

  /.well-known/ai-catalog.json (Agentic Resource Discovery) lists the relizy skill and llms.txt, the homepage links to it. The MCP server is left out: it runs locally and ARD describes remote resources.

- Expose the docs as WebMCP tools to the agents of the browser ([1890820](https://github.com/LouisMazel/relizy/commit/1890820))

  When the browser supports WebMCP (document.modelContext), the docs register three read-only tools: list_docs (llms.txt), search_docs (the titles and descriptions of the pages) and get_doc (the markdown of a page, the current one by default).

- Present the merge preview on the homepage, the README and the AI agents ([bbc6776](https://github.com/LouisMazel/relizy/commit/bbc6776))

  The AI agents set up by `relizy mcp init` never run `relizy merge-preview` without the approval of the user: it comments the pull request and sets a commit status.

### 🧪 Tests

- Clear the variables of the CI run in the merge preview spec ([46589fe](https://github.com/LouisMazel/relizy/commit/46589fe))
- Lower the coverage thresholds of the functions and branches ([6a68aa0](https://github.com/LouisMazel/relizy/commit/6a68aa0))
- Run the GitHub CLI token spec outside a CI, whatever runs it ([5ff255c](https://github.com/LouisMazel/relizy/commit/5ff255c))
- Check the root commits of a selective group too ([d470d10](https://github.com/LouisMazel/relizy/commit/d470d10))
- Lower the coverage threshold of the branches ([ee44327](https://github.com/LouisMazel/relizy/commit/ee44327))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v2.0.2 (2026-11-07)

[compare changes](https://github.com/LouisMazel/relizy/compare/v2.0.1...v2.0.2)

### 🩹 Fixes

- Only release the dependents whose published range rejects the new version ([607e955](https://github.com/LouisMazel/relizy/commit/607e955))

  A package listed in `bump.dependencyTypes` was released on every bump of its internal dependency, even when its published range already accepted the new version: same code, same ranges, an empty changelog entry.

  A dependent without commits of its own is now released only when the range it was published with rejects the new version of its dependency: with `workspace:^`, on a major, a minor in `0.x` or a prerelease; with `workspace:*`, on every bump. A specifier that is not a semver range (`catalog:`, `link:`) counts as out of range. The dependents are checked in turn, across the version groups too.

  To release the dependents on every bump of their dependencies, as before (e.g. for a package that bundles its dependency):

  ```ts
  export default defineConfig({
    bump: {
      dependents: 'always',
    },
  })
  ```

  The option can also be set per version group (`monorepo.groups[].bump.dependents`).

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v2.0.1 (2026-11-06)

[compare changes](https://github.com/LouisMazel/relizy/compare/v2.0.0...v2.0.1)

### 🩹 Fixes

- Keep the release summary short when it releases many versions ([f85bd99](https://github.com/LouisMazel/relizy/commit/f85bd99))

  Beyond two versions, the title of the summary counts them (`🚀 Released 13 versions of acme`) instead of listing every package. In the PR comment, the summary of the GitHub Actions run and `release.report.markdown`, the first table becomes a short recap: the versions and the tags are left to the tables of the packages, and a step creating more than two releases or tags counts them instead of listing their links.

  The end of the terminal output keeps a line per version group, `Version (<title>)`, counting the packages of an `independent` group and the tags beyond two.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v2.0.1-beta.0 (2026-11-06)

[compare changes](https://github.com/LouisMazel/relizy/compare/v2.0.0...v2.0.1-beta.0)

### 🩹 Fixes

- Keep the release summary short when it releases many versions ([f85bd99](https://github.com/LouisMazel/relizy/commit/f85bd99))

  Beyond two versions, the title of the summary counts them (`🚀 Released 13 versions of acme`) instead of listing every package. In the PR comment, the summary of the GitHub Actions run and `release.report.markdown`, the first table becomes a short recap: the versions and the tags are left to the tables of the packages, and a step creating more than two releases or tags counts them instead of listing their links.

  The end of the terminal output keeps a line per version group, `Version (<title>)`, counting the packages of an `independent` group and the tags beyond two.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v2.0.0 (2026-11-06)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.14.4...v2.0.0)

### 🚀 Features

- ⚠️ Throw a RelizyCancelError on a refused prompt instead of exiting the process ([ac14ad2](https://github.com/LouisMazel/relizy/commit/ac14ad2))

  A refused or cancelled prompt (bump confirmation, uncommitted changes, rewritten tag) no longer calls `process.exit()`: the commands throw a `RelizyCancelError` before writing anything, without their `error:*` hooks nor a failed PR comment. The CLI still exits with code 0.

  ```ts
  import { isRelizyCancelError, release } from 'relizy'

  try {
    await release()
  }
  catch (error) {
    if (!isRelizyCancelError(error)) {
      throw error
    }
  }
  ```

- Add the title, release and ai options to the version groups ([3393af4](https://github.com/LouisMazel/relizy/commit/3393af4))

  A version group gets a `title`, shown in the outputs of a release, and can override `release.providerRelease`, `release.social` and `ai.providerRelease`, e.g. to create the provider releases of an `independent` group (one per package) without AI:

  ```ts
  export default defineConfig({
    monorepo: {
      groups: [
        { name: 'ecosystem', title: 'maz-ui', versionMode: 'selective', packages: ['packages/*'] },
        { name: 'tooling', title: 'Tooling', versionMode: 'independent', packages: ['tooling/*'], ai: { providerRelease: { enabled: false } } },
      ],
    },
  })
  ```

  The `--ai`/`--no-ai` options still apply to every group.

- ⚠️ Confirm the bump once for every version group ([985a5f7](https://github.com/LouisMazel/relizy/commit/985a5f7))

  With `monorepo.groups`, the bump prompt lists the packages of every group, each under its `title`, and asks once instead of once per group.

  `confirmBump()` only asks, `displayBump()` prints a bump, and the plans of `planBumps()` get `display()` instead of `confirm()`:

  ```ts
  const { plans } = await planBumps({ config })

  await confirmBump({
    packages: plans.flatMap(plan => plan.result.bumped ? plan.result.bumpedPackages : []),
    display: () => {
      for (const plan of plans) {
        plan.display?.()
      }
    },
    dryRun: false,
  })
  ```

- ⚠️ Add releaseTitle, packageList and packageCount to the social templates ([99cd9c8](https://github.com/LouisMazel/relizy/commit/99cd9c8))

  The social posts are built from a model of the release (`getReleaseOverview()`), which fixes the posts of the `independent` mode: no more "my-lib 3 packages is out!", nor the project name with the version of its only package.

  - `{{releaseTitle}}`: `<name> <version> is out!` for a single version (`@scope/pkg 5.1.0 is out!` for a single package), `New releases of <project>` for several
  - `{{packageList}}` and `{{packageCount}}`, as in the commit templates
  - `{{newVersion}}` is empty when several versions are released
  - every occurrence of a variable is replaced, not only the first one

  The default `templates.twitterMessage` uses `{{releaseTitle}}`, same text for a single version:

  ```ts
  export default defineConfig({
    templates: {
      twitterMessage: '📣 {{releaseTitle}}\n\n{{changelog}}\n\n{{releaseUrl}}\n{{changelogUrl}}',
    },
  })
  ```

  `formatTweetMessage()`, `postReleaseToTwitter()`, `formatSlackMessage()` and `postReleaseToSlack()` take the `variables` of the template instead of `projectName`, `version`, `releaseUrl` and `changelogUrl`:

  ```ts
  const variables = getSocialTemplateVariables({ overview: getReleaseOverview({ config, bumpResult }), releaseUrl })

  formatTweetMessage({ template, changelog, postMaxLength: 280, variables })
  ```

- ⚠️ Post a release of several versions once per platform, by group ([6e30ca4](https://github.com/LouisMazel/relizy/commit/6e30ca4))

  With `monorepo.groups`, a release is announced as one release: one post per platform instead of one per group, one AI call per platform instead of one per group and platform, and the `social`, `twitter` and `slack` hooks run once. Same for several packages released in `independent` mode.

  - the post is titled `New releases of <project>`, then a section per group (its `title`), the `unified`/`selective` group first
  - Twitter: filled by priority within `postMaxLength`, every group keeps its version line (an `independent` group collapses to `Tooling: 3 packages` when needed)
  - Slack: a section per group, the budget of the message shared between them, the contributors once
  - `onlyStable` leaves the prereleases out of the post instead of posting all the versions or none

  ```text
  📣 New releases of maz-ui

  maz-ui 5.2.1
  • mcp: label the bundled docs with their maz-ui version

  Tooling
  • @maz-ui/eslint-config 5.1.0: stop enforcing the pnpm catalog
  • @maz-ui/upgrade 5.2.1
  ```

- List the packages of each version group in its own table in the PR comment ([3190f36](https://github.com/LouisMazel/relizy/commit/3190f36))

  With several version groups released, the PR comment has one table per group, titled with its `title`, its version and its version mode, the `unified`/`selective` group first:

  ```text
  ### maz-ui `5.2.1` (selective)
  | `@maz-ui/mcp` | `5.2.0` → `5.2.1` |

  ### Tooling (independent)
  | `@maz-ui/eslint-config` | `5.0.0` → `5.1.0` |
  ```

- Give the release to the hooks of the steps after the bump ([b06146b](https://github.com/LouisMazel/relizy/commit/b06146b))

  The function hooks of the steps after the bump get a third parameter when the release is known (in `relizy release`, ...

  ```ts
  export default defineConfig({
    hooks: {
      'success:release': (config, dryRun, context) => {
        for (const group of context?.release.groups ?? []) {
          console.log(group.title, group.version)
        }
      },
    },
  })
  ```

- Check the migration from relizy 1 with the MCP server ([8c734b3](https://github.com/LouisMazel/relizy/commit/8c734b3))

  The `check_migration` tool lists what to change in the project to upgrade from relizy 1, with the file and line of each place, the fix and the section of the migration guide: the relizy dependency, the social templates, the version groups (titles, hooks, AI provider releases) and the code calling the relizy API. The `migrate-to-v2` prompt drives the whole migration.

  ```ts
  check_migration({ config: 'relizy' })
  ```

- List the values of the union types in get_config_option ([bfc1d4a](https://github.com/LouisMazel/relizy/commit/bfc1d4a))

  `get_config_option` lists the values an option accepts when its type hides them behind an alias, so the agents no longer need the docs to know them. `bump.type` and `logLevel` are typed with `BumpReleaseType` and `RelizyLogLevel`, the same types as the ones of semver and `@maz-ui/node`, declared by relizy.

  ```text
  # `monorepo.versionMode`

  - **Type:** `VersionMode`
  - **Values:** `"unified"`, `"independent"`, `"selective"`
  ```

- List every commit with preview_release({ full: true }) ([0b0f16b](https://github.com/LouisMazel/relizy/commit/0b0f16b))

  `preview_release` lists the first 10 commits of a version and the first 5 of a package, and says how to list them all: with `full: true`, every commit explaining a bump is listed. A preview longer than a tool result can be is cut with a note.

  ```ts
  preview_release({ full: true })
  ```

- ⚠️ Report the outcome of the release to the CI ([53c44a9](https://github.com/LouisMazel/relizy/commit/53c44a9))

  `relizy release` reports what it did (released, nothing to release or failed, the versions by group, the tags, and the outcome of each step), to run something only when a release happens:

  - in GitHub Actions, the outputs of the step (`released`, `status`, `version`, `tags`, `packages`, `report`) and the summary of the run, without option
  - `release.report.dotenv` (`--report-dotenv`): a dotenv file for the `artifacts:reports:dotenv` of GitLab CI (`RELIZY_RELEASED`, `RELIZY_VERSION`...)
  - `release.report.json` (`--report-json`): the whole report as JSON
  - `release()` returns it, and `formatReleaseReportText()` replaces `buildReleaseSummary()`

  ```yaml
  - id: release
    run: pnpm relizy release --yes
  - if: steps.release.outputs.released == 'true'
    run: ./scripts/notify-teams.sh
  ```

- ⚠️ Show each command step by step, with previews and a summary of the release ([dbc523b](https://github.com/LouisMazel/relizy/commit/dbc523b))

  Every command shows one line per step, with its duration and what it did, the details only with `--log-level verbose`. In CI, each step is a collapsible group of GitHub Actions or GitLab CI. `RELIZY_REPORTER=classic` gives back the logs of relizy 1.

  A dry run shows what it would generate (changelogs, release notes, posts, PR comment) and no longer calls the AI: `--ai-preview` calls it, `--no-preview` hides the previews.

  `relizy release` ends with a summary, also used for the PR comment, the summary of the GitHub Actions run and the new `release.report.markdown`. See [Migrating from v1 to v2](https://relizy.dev/guide/migration-v2).

- ⚠️ Rename commitlint.codeBlocksLinter to changelogLinter ([4b2073f](https://github.com/LouisMazel/relizy/commit/4b2073f))

  The option chooses the tool checking the changelog entry of a commit, not only its code blocks: with ESLint, the whole entry is linted. Rename `codeBlocksLinter` to `changelogLinter` in the `commitlint` config, with the same values (`auto`, `eslint`, `oxc`), and the type `CommitlintCodeBlocksLinter` to `CommitlintChangelogLinter`. See [Migrating from v1 to v2](https://relizy.dev/guide/migration-v2).

- Give the AI the context of the release and keep the structure of the changelog ([9015b72](https://github.com/LouisMazel/relizy/commit/9015b72))

  The AI now receives the project, the version, the previous one and the kind of release before the changelog. Its rewrites keep every change, the section headings of your `types` (even in another `language`), the code blocks of the commit bodies and the references, and never follow an instruction written in a commit.

  With `social.slack.changelogFormat: 'full'`, the Slack message keeps every change instead of 3 to 8 bullets. See the [AI guide](https://relizy.dev/guide/ai-changelog).

- Show the tokens of the AI calls in the summary of the release ([b3ccd09](https://github.com/LouisMazel/relizy/commit/b3ccd09))

  Each AI rewrite shows its tokens, with `claude-code` and `ai-sdk`, and the summary of the release (terminal, PR comment, GitHub Actions summary) adds up the tokens and the cost of every call: `2 rewrites by claude-code in 21.3s · 5.8k tokens · $0.019`.

- ⚠️ Reject the commits crediting an AI tool ([2123f4a](https://github.com/LouisMazel/relizy/commit/2123f4a))

  The new `no-ai-attribution` rule of `relizy commitlint` reports an AI co-author (`Co-authored-by: Claude <noreply@anthropic.com>`), a `Claude-Session:` trailer and the "Generated with" line of the AI tools. It is an error by default: turn off the attribution in the settings of your tools, or the rule, as told in the [migration guide](https://relizy.dev/guide/migration-v2#ai-attribution-in-commits).

  ```ts
  import { defineConfig } from 'relizy'

  export default defineConfig({
    commitlint: {
      rules: { 'no-ai-attribution': 'off' },
    },
  })
  ```

- ⚠️ Only export the commands, the config and the types ([f5fb638](https://github.com/LouisMazel/relizy/commit/f5fb638))

  `relizy` exported every internal function of its commands (about 300: git, npm, tags, Slack, the steps of the commands...). It now only exports the programmatic API: the commands (`release()`, `bump()`, `changelog()`, `publish()`, `providerRelease()`, `social()`, `prComment()`, `commitlint()`), `defineConfig()`, `loadRelizyConfig()`, `RelizyCancelError`, `isRelizyCancelError()`, `lintCommitMessage()` and the types.

  The functions no longer exported have a replacement, listed in the [migration guide](https://relizy.dev/guide/migration-v2#public-api):

  - `createCommitAndTags()`, `pushCommitAndTags()`: `release()` with its `commit`, `gitTag` and `push` options
  - `planBumps()`, `confirmBump()`, `displayBump()`, `getPackages()`: `bump()`, with `dryRun` to preview it
  - `formatTweetMessage()`, `postReleaseToTwitter()`, `formatSlackMessage()`, `postReleaseToSlack()`, `getReleaseOverview()`, `getSocialTemplateVariables()`: `social()`, or the `release` parameter of a hook
  - `buildReleaseSummary()`, `formatReleaseReportText()`, `formatReleaseReportMarkdown()`: the report returned by `release()`
  - `generateChangelog()`, `generateMarkDown()`: `changelog()`
  - `getDefaultConfig()`, `mergeTypes()`: `loadRelizyConfig()`, which returns the config with its defaults
  - `isPrerelease()`: `prerelease()` of semver
  - `init()`: `relizy init`

  ```ts
  // v1
  const types = Object.keys(mergeTypes(relizyConfig.types, getDefaultConfig().types))

  // v2
  const config = await loadRelizyConfig()
  const types = Object.keys(config.types)
  ```

  The `check_migration` tool of the MCP server lists the imports to change.

- Prepare the git clone of the CI job for the release ([aa78eeb](https://github.com/LouisMazel/relizy/commit/aa78eeb))

  In CI, Relizy fetches the history of a shallow clone, checks out the branch of a detached HEAD, and makes the release commit and tags as the person who started the release, with their noreply email, when the job sets no git identity.

  Before publishing, it checks that the release can be pushed and fails with the fix otherwise. On GitLab, it pushes with `GITLAB_TOKEN` when the job token cannot. See [CI/CD](https://relizy.dev/guide/ci-cd#what-relizy-handles-in-ci).

- Generate the release workflow of the CI with relizy init ([1bb3686](https://github.com/LouisMazel/relizy/commit/1bb3686))

  On GitHub or GitLab, `relizy init` writes the release workflow (`.github/workflows/release.yml`, or the `release` job of `.gitlab-ci.yml`): run on demand with the release type, or at each push, with the permissions, the secrets of your config and the outputs of the release. Skip it with `--no-workflow`, see [relizy init](https://relizy.dev/cli/init#release-workflow).

- ⚠️ Rename monorepo.includePrivates to privatePackages ([26b4711](https://github.com/LouisMazel/relizy/commit/26b4711))

  The option says what relizy does with the private packages of the
  workspace, with named values: `ignore` (default) or `release` (released as
  the other packages, never published). The flag and the options of the
  commands follow:

  ```ts
  export default defineConfig({
    monorepo: {
      // includePrivates: true,
      privatePackages: 'release',
    },
  })
  ```

  ```bash
  relizy release --private-packages release
  ```

  `check_migration` points out `includePrivates` in the config.

- ⚠️ Remove monorepo.ignorePackageNames, replaced by monorepo.ignored ([798faeb](https://github.com/LouisMazel/relizy/commit/798faeb))

  `monorepo.ignorePackageNames`, deprecated, is removed: list the directories of these packages in `monorepo.ignored`, path globs matched as `monorepo.packages`. A config that still sets it fails to load with the fix, rather than releasing the packages it left out, and `check_migration` points it out first.

  ```ts
  export default defineConfig({
    monorepo: {
      packages: ['packages/*'],
      // ignorePackageNames: ['@scope/legacy'],
      ignored: ['packages/legacy'],
    },
  })
  ```

- ⚠️ Remove publish.token, replaced by tokens.registry ([1e8eb42](https://github.com/LouisMazel/relizy/commit/1e8eb42))

  `publish.token` read the same environment variables as `tokens.registry` (`RELIZY_NPM_TOKEN`, `NPM_TOKEN`, `NODE_AUTH_TOKEN`). Set the registry token in `tokens.registry`, or per registry in `publish.registries[].token`. `--publish-token` and the `token` option of `publish()` now set `tokens.registry`, and `token` of `ReleaseOptions` is only the git token.

  ```ts
  export default defineConfig({
    // publish: { token: process.env.MY_NPM_TOKEN },
    tokens: { registry: process.env.MY_NPM_TOKEN },
  })
  ```

- ⚠️ Remove repo.token, replaced by tokens.github and tokens.gitlab ([6d6c280](https://github.com/LouisMazel/relizy/commit/6d6c280))

  `repo.token` was a fallback of `tokens.github` and `tokens.gitlab`, which read `GITHUB_TOKEN`, `GH_TOKEN`, `GITLAB_TOKEN`... by default and are set by `--token`. Set the token of the provider releases and of the PR comment there. A PR comment on Bitbucket now says the provider is not supported, instead of asking for a GitLab token.

  ```ts
  export default defineConfig({
    repo: { provider: 'gitlab', domain: 'gitlab.mycompany.com', repo: 'team/app' },
    tokens: { gitlab: process.env.MY_TOKEN },
  })
  ```

- ⚠️ Remove the relizy/types entry of the package ([ae17dae](https://github.com/LouisMazel/relizy/commit/ae17dae))

  The entry pointed straight at a declaration file, so a runtime import of it failed. Import the types from `relizy`.

  ```ts
  // import type { RelizyConfig } from 'relizy/types'
  import type { RelizyConfig } from 'relizy'
  ```

- ⚠️ Remove the newVersion and publish.packages options, never read ([1d57afc](https://github.com/LouisMazel/relizy/commit/1d57afc))

  relizy never read the root `newVersion` option nor `publish.packages`: remove them from the config. To leave a package out of the release, use `monorepo.ignored`.

- ⚠️ Format the changelogs written with the formatter of the project ([7009491](https://github.com/LouisMazel/relizy/commit/7009491))

  Without `changelog.formatCmd`, the formatter in the dependencies of the root `package.json` (Biome, Prettier, oxfmt, dprint, else ESLint) formats the changelogs written, and only them. If it fails, the release goes on with a warning.

  To choose the command, set `formatCmd`: its files placeholder is replaced by the paths of the changelogs written. `false` (or `--no-format-cmd`) turns the formatting off:

  ```ts
  import { defineConfig } from 'relizy'

  export default defineConfig({
    changelog: { formatCmd: 'eslint --fix {{files}}' },
  })
  ```

- Give the version of each released group and package in the release report ([f6c17e9](https://github.com/LouisMazel/relizy/commit/f6c17e9))

  The report of `relizy release` now has `group_<name>_version` for each released `unified`/`selective` version group and `package_<name>_version` for each released package, only when the release happened (not in dry-run). A CI job can run something for one package without parsing the list of packages:

  ```yaml
  script:
    - '[ -n "$RELIZY_PACKAGE_ACME_UI_VERSION" ] && ./scripts/notify.sh'
  ```

  The dotenv file no longer has `RELIZY_INSTALL`: none of its values has a space, so it can be sourced (`. ./relizy.env`). The install command stays in the GitHub Actions outputs, the JSON report and the summary.

- Publish to npm with trusted publishing (OIDC), without token ([f749167](https://github.com/LouisMazel/relizy/commit/f749167))

  In a GitHub Actions job with the `id-token: write` permission, or a GitLab CI job with the `NPM_ID_TOKEN` id token, relizy publishes to npmjs.org without npm token: npm authenticates the job with OIDC and adds the provenance of the packages. The safety check no longer requires a token there (`npm whoami` does not work with OIDC): it checks that the npm of the job does the OIDC exchange (11.5.1 or later), and warns about the packages that are not on npm yet, which still need a first publish with a token.

  ```yaml
  permissions:
    contents: write
    id-token: write
  ```

  The placeholder token that `actions/setup-node` writes to `NODE_AUTH_TOKEN` is no longer taken for an npm token. Without token nor OIDC in CI, the authentication error tells both ways to publish.

- Generate release workflows ready for npm trusted publishing ([1643a11](https://github.com/LouisMazel/relizy/commit/1643a11))

  When the project publishes to npm, the workflow of `relizy init` gives the job its OIDC token (`id-token: write` on GitHub Actions, the `NPM_ID_TOKEN` id token on GitLab CI) and updates npm to a version doing the OIDC exchange. Once the trusted publisher of the packages is set up on npmjs.com, the `NPM_TOKEN` secret is no longer needed; it stays the fallback, for the first publish of a package. The next steps of `relizy init` link to the guide.

- Give the steps that failed without stopping the release in its outputs ([c895165](https://github.com/LouisMazel/relizy/commit/c895165))

  A failed social post, provider release or PR comment does not stop the release: the `failed_steps` output (`RELIZY_FAILED_STEPS` in the dotenv file) now lists them, comma-separated, so a next step or job can react without reading the JSON report.

- Post the releases to Microsoft Teams ([ee5bbf3](https://github.com/LouisMazel/relizy/commit/ee5bbf3))

  `social.teams` posts Adaptive Cards to a Teams workflow (trigger "When a Teams webhook request is received"), the Office 365 connectors being retired. A card announces a version: a badge, its title and message, its version and date, and the buttons of its release notes, its changelog and the `links`.

  ```ts
  export default defineConfig({
    social: {
      teams: {
        enabled: true,
        cards: 'version', // or 'release': one card with a section per version
        changelog: 'summary', // the commit titles, rewritten with ai.social.teams
        locale: 'fr-FR',
        announcements: [
          { group: 'shared', links: [{ title: '🎨 Storybook', url: 'https://{{shortName}}.acme.dev' }] },
          { package: '@acme/login', title: '🔐 Login {{newVersion}}' },
        ],
        exclude: { packages: ['@acme/*-mock'] },
      },
    },
  })
  ```

  Without `announcements`, every version is announced; with it, only the versions of its groups and packages, a package entry over its group entry. The URL comes from `TEAMS_WEBHOOK_URL`, or its base64 in `TEAMS_WEBHOOK_URL_B64` (a masked GitLab variable refuses its characters).

  A refused card does not stop the release: it is in the logs, the summary and `failed_steps`, with the hooks `before:teams`, `success:teams` and `error:teams`. `relizy init` sets it up, and `check_migration` points out the scripts posting to Teams and the retired connectors.

- Choose the versions announced on Slack and Twitter ([cd1973a](https://github.com/LouisMazel/relizy/commit/cd1973a))

  `social.slack.announcements` takes the entries of `social.teams.announcements`: without it, every version is announced and the message is unchanged; with it, only the versions matching a `{ group }` or `{ package }` entry. The `title` of an entry replaces the name of its version, its `message` and its links (release notes, changelog, `links`) are shown under it, as the buttons for a single version. `exclude` leaves groups and packages out of Slack, and of Twitter.

  ```ts
  export default defineConfig({
    social: {
      slack: {
        enabled: true,
        announcements: [
          { group: 'ecosystem', title: 'Design System', message: 'Update `@acme/ui` to get it.', links: [{ title: '📚 Docs', url: 'https://design.acme.dev' }] },
          { package: '@acme/login', title: 'Login' },
        ],
        exclude: { packages: ['@acme/*-mock'] },
      },
      twitter: { enabled: true, exclude: { groups: ['internal'] } },
    },
  })
  ```

  `check_migration` points to these options for a script posting to Slack.

- ⚠️ Name the changelog of Slack and Teams posts changelog ([1fb6dc2](https://github.com/LouisMazel/relizy/commit/1fb6dc2))

  `social.slack.changelog` and `social.teams.changelog` take the same values: `full` (the commit bodies included), `summary` (the commit titles) or `none` (or `false`, no changelog). Slack gains `none`, Teams gains `full`: the changelogs of a card share what its other texts leave of its 28 KB, each one cut between two changes with an `… and N more changes` line, instead of refusing the card.

  ```ts
  export default defineConfig({
    social: {
      slack: { enabled: true, changelog: 'full' },
      teams: { enabled: true, changelog: 'summary' },
    },
  })
  ```

  BREAKING CHANGE: `social.slack.changelogFormat` is renamed `social.slack.changelog`, with the same values; relizy 2 ignores `changelogFormat`. `check_migration` finds it.

- Release from the relizy GitHub Action and GitLab CI component ([18e640d](https://github.com/LouisMazel/relizy/commit/18e640d))

  `relizy/action@v2` sets up Node.js and your package manager, installs your dependencies, runs `relizy release` with your tokens and gives its outputs to the next steps. On gitlab.com, the `release` component of the CI/CD catalog (`gitlab.com/relizy/relizy/release@2`) does the same, and `relizy init` now writes them. See [GitHub Actions](https://relizy.dev/guide/github-actions#the-relizy-action) and [GitLab CI](https://relizy.dev/guide/gitlab-ci#the-relizy-component).

  ```yaml
  - id: release
    uses: relizy/action@v2
    with:
      npm-token: ${{ secrets.NPM_TOKEN }}
  ```

- Keep an existing config in relizy init and set up the rest ([8a32fcb](https://github.com/LouisMazel/relizy/commit/8a32fcb))

  When a config already exists, `relizy init` now offers to keep it and set up the rest: the `commit-msg` hook, the `release` script, the AI agents and the release workflow, whose secrets follow the kept config. Without questions (`--yes`, CI), the config is kept, `--force` still replaces it.

- ⚠️ Rewrite only the stable versions with the AI ([08a18d0](https://github.com/LouisMazel/relizy/commit/08a18d0))

  The AI no longer rewrites the prereleases (beta, canary...): their provider release notes and social posts keep their raw changelog, without an AI call. In a post announcing several versions, only the stable ones are rewritten.

  Turn it off with `ai.onlyStable: false`, or for one target with its own `onlyStable`:

  ```ts
  import { defineConfig } from 'relizy'

  export default defineConfig({
    ai: {
      providerRelease: { enabled: true, onlyStable: false },
    },
  })
  ```

  See the [migration guide](https://relizy.dev/guide/migration-v2#ai-on-prereleases).

### 🔥 Performance

- Read each git ref and range once per release ([853dbef](https://github.com/LouisMazel/relizy/commit/853dbef))

  The branch, the tags and the commits of a range were read again for each package and each step of a release. They are now read once per command run (and per MCP tool call), and read again after each git write of relizy (commit, tag, fetch, checkout) and after the hooks, the format and the build commands.

  A dry-run release of the maz-ui monorepo (11 packages, version groups) spawns 78 git processes instead of 207, and takes 7s instead of 15s.

### 🩹 Fixes

- Apply the safetyCheck option in social() ([c91ed9a](https://github.com/LouisMazel/relizy/commit/c91ed9a))

  `social()` ignored `safetyCheck`, so `release` checked the social config (and the AI provider) twice, and `social({ safetyCheck: false })` still ran the check.

- Count the length of the tweets as X does ([d9f9a2c](https://github.com/LouisMazel/relizy/commit/d9f9a2c))

  Every URL counts 23 characters (X shortens them to t.co links), an emoji or a CJK character counts 2. The long release and changelog URLs no longer eat the changelog of the tweet, and a tweet with CJK text no longer exceeds the limit.

- ⚠️ Replace the arrays of the config instead of concatenating them ([f2aca2a](https://github.com/LouisMazel/relizy/commit/f2aca2a))

  An array of the config replaces the default one, and the array of the config file when it comes from the CLI or the programmatic API. Before, `bump.dependencyTypes: ['dependencies', 'peerDependencies']` resolved to `['dependencies', 'peerDependencies', 'dependencies']`, `--dependency-types devDependencies` could only add to the list of the config, and `relizy release` passed every `publish.args` twice.

  A `bump.dependencyTypes` without `dependencies` no longer bumps the packages on every bump of their `dependencies`: add it to keep them.

  ```ts
  export default defineConfig({
    bump: {
      dependencyTypes: ['dependencies', 'peerDependencies'],
    },
  })
  ```

- Mask the secrets without revealing their first characters ([46813e0](https://github.com/LouisMazel/relizy/commit/46813e0))

  A masked secret keeps its known prefix and its last 4 characters, instead of its first and last 4 characters: the first characters of a secret without fixed prefix (Twitter keys, OAuth tokens) no longer end up in the debug logs nor in the context of the AI agents. A secret URL keeps its origin only.

  ```text
  npm_***2Hwk
  ***wYv3
  https://hooks.slack.com/***
  ```

- ⚠️ Exit with code 0 when there is nothing to bump ([8c11e3f](https://github.com/LouisMazel/relizy/commit/8c11e3f))

  `relizy bump` exits with code 0 when no commit triggers a bump, as `relizy release` does, instead of 1: a CI job running it no longer fails for nothing. To run something only when a release happens, use a `success:release` hook.

- Only warn about the uncommitted changes of the files a release commits ([b7d53da](https://github.com/LouisMazel/relizy/commit/b7d53da))

  With `--no-clean`, the uncommitted changes are kept as they are, so they no longer print a warning with the raw `git status`: only the changes of the files a release writes and commits (`package.json`, `CHANGELOG.md`, `lerna.json`) are worth one, and their confirmation. The other files are listed with `--log-level debug`.

  ```text
  Uncommitted changes in files the release commits: packages/core/package.json (modified)
  ```

- Tell which files are uncommitted when the release needs a clean working directory ([628c29d](https://github.com/LouisMazel/relizy/commit/628c29d))

  The error lists the uncommitted files with what changed, instead of the raw `git status`, and says how to go on.

  ```text
  Uncommitted changes: plans/v2.md (modified), src/new.ts (new)
  Commit or stash them first, or keep them with --no-clean.
  ```

- Remove the npm token from .npmrc when a publish is interrupted ([1c3a004](https://github.com/LouisMazel/relizy/commit/1c3a004))

  The token written to `.npmrc` for a publish, its dry-run too, stayed on disk when the run was stopped (Ctrl+C, kill, closed terminal): the `.npmrc` is now removed, or restored as it was.

- Hide the git trailers of the commit bodies in the changelogs ([6058672](https://github.com/LouisMazel/relizy/commit/6058672))

  The changelog entries no longer show the trailers ending a commit body (`Co-authored-by:`, `Signed-off-by:`, `Claude-Session:`, `Closes #12`...) nor the "Generated with" line of the AI tools. The breaking change footer is kept, as it tells how to migrate.

- Stop crediting the AI tools as contributors in the changelogs ([4eff863](https://github.com/LouisMazel/relizy/commit/4eff863))

  A co-author such as `Claude <noreply@anthropic.com>` or the Cursor agent is no longer listed in the contributors, as the bots already were. The people are still credited, even when named like a tool.

- Fail a release in CI without --yes instead of exiting with code 0 ([3c1be07](https://github.com/LouisMazel/relizy/commit/3c1be07))

  Without an interactive terminal, the confirmation of the new versions was taken as cancelled: the CI job succeeded without releasing anything. `relizy release` and `relizy bump` now fail right away with the exit code 1 and the fix: run them with `--yes`.

- Correct the defaults of the release options in the config reference ([7c8187b](https://github.com/LouisMazel/relizy/commit/7c8187b))

  `release.noVerify`, `clean`, `social` and `prComment` documented the opposite
  of their real default, in the typedoc and in `get_config_option` of the MCP
  server. A test now checks every `@default` against the default config.

- Name the options of loadRelizyConfig in the API docs ([0f6f630](https://github.com/LouisMazel/relizy/commit/0f6f630))

  The typedoc page of `loadRelizyConfig()` expanded the whole config inline
  (1 800 lines). Its options are now named types, exported for the callers:

  ```ts
  import type { LoadRelizyConfigOptions, RelizyConfigOverrides } from 'relizy'
  ```

  The README is no longer copied as the index of the typedoc.

- ⚠️ Remove the publish.private option ([acb3416](https://github.com/LouisMazel/relizy/commit/acb3416))

  relizy never read it: the private packages are never published. A config
  setting it no longer type-checks, `check_migration` points it out:

  ```ts
  export default defineConfig({
    // publish: { private: false }, removed
    monorepo: { privatePackages: 'release' }, // to version the private packages
  })
  ```

- Release a private app without workspace packages ([232b42a](https://github.com/LouisMazel/relizy/commit/232b42a))

  A project with a single `package.json` marked `"private": true` (an app,
  an API) released nothing: its root package was skipped as a private
  package. It is now bumped, tagged and released as a library, never
  published, and the safety check no longer asks for a registry token when
  no package can be published.

- Run the git and package manager checks in the project directory ([9ea2e38](https://github.com/LouisMazel/relizy/commit/9ea2e38))

  The uncommitted changes check, the staging of the release files, the detection of the git provider, of Yarn Berry and of the default package manager now run in the `cwd` of the config, instead of the current directory of the process. A release run from the programmatic API with another `cwd` checked and staged the files of the wrong directory.

- Pass the commit and tag messages to git without shell ([c35b9d8](https://github.com/LouisMazel/relizy/commit/c35b9d8))

  The release commit, its tags and the staging of its files run git with their arguments as they are, instead of a shell command. A `$`, a backtick or a quote in `templates.commitMessage`, `commitBody` or `tagMessage` was run or broke the command, and a tag message was not escaped at all.

- Skip the safety check of relizy publish with --no-safety-check ([25aa365](https://github.com/LouisMazel/relizy/commit/25aa365))

  `relizy publish` ignored the global `--no-safety-check` flag and still checked the authentication to the registry. `relizy release`, `provider-release` and `social` already applied it.

- Apply the logLevel of the config without --log-level ([6dd9f31](https://github.com/LouisMazel/relizy/commit/6dd9f31))

  The `--log-level` flag defaulted to `default` and always replaced the `logLevel` of the config, even when it was not passed. The flag now only applies when it is given.

- Apply bump.clean during relizy release ([6e82878](https://github.com/LouisMazel/relizy/commit/6e82878))

  `relizy release` replaced `bump.clean` with `release.clean`, so a release still failed on uncommitted changes with `bump: { clean: false }` in the config. The uncommitted changes are checked when both are enabled, as `relizy bump` does, and `--no-clean` still turns off both.

- List the steps of the release in their order in preview_release ([880ada2](https://github.com/LouisMazel/relizy/commit/880ada2))

  The `preview_release` tool of the MCP server listed the commit, the tags and the push before the publication, while `relizy release` publishes first, and listed the tags and the push without the release commit, which they need.

- Preview the root changelog of an independent release in preview_changelog ([cd594d3](https://github.com/LouisMazel/relizy/commit/cd594d3))

  The `preview_changelog` tool of the MCP server left out the root changelog that `relizy changelog` writes in `independent` mode (the changelogs of the released packages, with `changelog.rootChangelog`). Both now build it the same way.

- Authenticate the GitHub releases with repo.token ([3d4b2b5](https://github.com/LouisMazel/relizy/commit/3d4b2b5))

  A GitHub release with `repo.token` and without `tokens.github` passed the token check but was sent to the GitHub API without authentication. The token now falls back to `repo.token`, as for GitLab and the PR comment.

- Link to the current pages of the docs ([84d2ad5](https://github.com/LouisMazel/relizy/commit/84d2ad5))

  The error of a provider release without token links to the tokens of the config (`config/overview#tokens`), and the `get_doc` tool of the MCP server names the `guide/prereleases` page, instead of pages removed from the docs.

- Pass publish.args to the publish command ([37942a5](https://github.com/LouisMazel/relizy/commit/37942a5))

  `publish.args` was declared but never read: its arguments are now added to the publish command of every package and registry, after the ones of relizy, and left out of the authentication check.

  ```ts
  export default defineConfig({
    publish: {
      args: ['--provenance'],
    },
  })
  ```

- Type publish.args of the resolved config as strings ([af2518a](https://github.com/LouisMazel/relizy/commit/af2518a))

  Its default, an empty array, typed it as `never[]` in the config returned by `loadRelizyConfig()`.

- Read the provider of a self-hosted repository from its host ([f95ea81](https://github.com/LouisMazel/relizy/commit/f95ea81))

  The repository of a GitHub Enterprise or self-hosted GitLab host (`git@gitlab.example.com:team/app.git`, `https://github.mycompany.com/team/app`) gets the provider its host names, as the detection of the git provider does, and keeps its host as domain. The provider was the host itself (`gitlab.example.com`) for an ssh URL, and undefined for an https one: the references of the changelogs had no links and `relizy release` could not create the provider releases. An unknown host gives no provider.

- Use repo.provider in relizy provider-release ([afe4189](https://github.com/LouisMazel/relizy/commit/afe4189))

  `relizy provider-release` ignored the `repo.provider` of the config and only detected the provider from the `origin` remote, unlike `relizy release` and its safety check.

- Apply the config options given to bump(), changelog(), publish() and release() ([2be2f56](https://github.com/LouisMazel/relizy/commit/2be2f56))

  Their options types declared every option of their config section, but some were ignored: `capZeroMajor` and `outOfRangePeers` of `bump()`, `includeCommitBody` of `changelog()`, `args`, `packageManager` and `safetyCheckTimeout` of `publish()`, and all of them plus `dependencyTypes` and `checkWorkspaceDependencies` for `release()`. They now override the config, as the other options do.

  ```ts
  await release({ capZeroMajor: false, includeCommitBody: true, args: ['--provenance'] })
  ```

- Exit with code 1 when relizy provider-release or relizy social fails ([706585e](https://github.com/LouisMazel/relizy/commit/706585e))

  Both commands showed the failure of a provider release or of a post, then exited with code `0`, so a CI job running them never failed. They now exit with code `1`, after the other posts. In `relizy release`, a failed provider release or post still does not stop the release.

- Check out the branch of a GitHub pull request in its CI job ([61bfcb4](https://github.com/LouisMazel/relizy/commit/61bfcb4))

  On a `pull_request` event, relizy put the detached HEAD on a branch named after `GITHUB_REF_NAME`, `<number>/merge`, so it could not detect the pull request of the branch. It now uses the branch of the pull request (`GITHUB_HEAD_REF`).

- Authenticate the GitLab releases with the job token of the CI job ([815ded5](https://github.com/LouisMazel/relizy/commit/815ded5))

  `tokens.gitlab` falls back to `CI_JOB_TOKEN`, but relizy sent it as a personal access token (`PRIVATE-TOKEN`), so GitLab refused the release. The job token is now sent in the `JOB-TOKEN` header. It cannot comment merge requests: instead of a failed request, the MR comment tells to set `GITLAB_TOKEN`.

- Create the provider releases of relizy release --provider on that provider ([50316d1](https://github.com/LouisMazel/relizy/commit/50316d1))

  `--provider` only applied to the safety check of `relizy release`: the provider releases used `repo.provider`, or the provider detected from the remote. They now use the given provider.

- Check the registry access of relizy publish whatever release.publish ([d13954d](https://github.com/LouisMazel/relizy/commit/d13954d))

  The safety check of the publication was skipped as soon as `release.publish` was `false`, also when running `relizy publish` alone, which then published without checking the access to the registries first. Only `relizy release` skips it, when it does not publish.

- Replace every occurrence of the variables of changelogTitle and tagBody ([a2ea161](https://github.com/LouisMazel/relizy/commit/a2ea161))

  `templates.changelogTitle` and `templates.tagBody` only replaced the first occurrence of a variable, unlike the other templates. A `tagBody` repeating `{{newVersion}}` also gave a tag name to the release commit and another one to the changelog and the provider release: they now render it the same way.

- Apply bump.capZeroMajor to the canary versions ([0e2c1a8](https://github.com/LouisMazel/relizy/commit/0e2c1a8))

  A canary computed its version without `bump.capZeroMajor`: a breaking change of `0.5.2` gave `1.0.0-0.canary-<sha>` while the release gives `0.6.0`, and a breaking change of a peer dependency always gave a major. The canary versions now follow the release.

- Restore the canary versions of relizy release --canary --no-publish ([53f7229](https://github.com/LouisMazel/relizy/commit/53f7229))

  The canary versions were restored after their publish only: without it, they stayed in the `package.json` files. A canary is never committed, so they are now restored either way. `relizy bump --canary` still leaves them, to publish them yourself.

- Reject a commitlint tuple without the number of its rule ([87f5800](https://github.com/LouisMazel/relizy/commit/87f5800))

  `'header-max-length': [2, 'always']` set the length to `'always'`, so the rule never reported anything. relizy commitlint now fails with the expected form, `[2, 'always', 200]` or `['error', 200]`.

- Comment the merged pull request of a release run after the merge ([8cf5dbf](https://github.com/LouisMazel/relizy/commit/8cf5dbf))

  The PR comment only looked for an open pull request of the current branch, so a release run on the push to `main` after a merge never found the pull request it merged. Without an open one, the pull request of the commit the release started from is now commented, on GitHub and GitLab, from a detached HEAD too. `ReleaseContext` gets this commit in `sha`.

- Install corepack in the GitLab CI job generated by relizy init ([f2d76ea](https://github.com/LouisMazel/relizy/commit/f2d76ea))

  Node 25+ no longer ships corepack, so `corepack enable` failed on the `node:lts` image (Node 26). The generated job now installs it first, `npm install -g corepack && corepack enable`, which keeps the version of pnpm or yarn pinned by the `packageManager` field.

- Post the changelog of a Slack template in mrkdwn ([9f0a11d](https://github.com/LouisMazel/relizy/commit/9f0a11d))

  With `social.slack.template` and the `summary` format, `{{changelog}}` was a summary cut by sentences, in markdown: the bold scopes and the links arrived as `**scope:**` and `[text](url)`. It is now converted to mrkdwn as without template, within what the template leaves of the block.

- Summarize the changelog of a post without AI by its lines ([a5fec87](https://github.com/LouisMazel/relizy/commit/a5fec87))

  The summary of a tweet without AI was cut by sentences: a commit ending with a period was merged with the next one, and a period was added at the end. It now keeps the first commits that fit, one per line, as they are.

- Remove the line of a URL not set from a social post ([4acda96](https://github.com/LouisMazel/relizy/commit/4acda96))

  A social template line holding only `{{releaseUrl}}` or `{{changelogUrl}}` left an empty line when the URL was not set: the default tweet of an `independent` release, without release URL, had two blank lines before the changelog link. The line is now removed.

- List each package once in a Slack post of several versions ([be2b788](https://github.com/LouisMazel/relizy/commit/be2b788))

  The Slack post of a release of several versions, without template, listed the packages of an `independent` group in their section, then again in the "📦 Packages" block. The block now only lists the packages the sections do not, such as the packages of a `selective` group.

- Return false from a dry-run PR comment without pull request ([518e880](https://github.com/LouisMazel/relizy/commit/518e880))

  `prComment({ dryRun: true })` returned `true` even when no pull request was detected, and `relizy pr-comment --dry-run` then said it would comment. It shows the preview and returns `false`.

- Hide the git error of a repository without origin remote ([9320043](https://github.com/LouisMazel/relizy/commit/9320043))

  Resolving the repository of a project without `origin` remote printed `error: No such remote 'origin'` on stderr, at each `relizy commitlint` for example. The lookup is now silent, as the other git reads of relizy.

- Correct the JSDoc of the options and the help of --publish-token ([48364b1](https://github.com/LouisMazel/relizy/commit/48364b1))

  The `safetyCheck` options said "Skip safety check" while `true` runs the checks, the tokens listed their environment variables out of their reading order (`RELIZY_*` is read first), `publish.registries[].packageFilter` named a removed option, and `--publish-token` said only npm and pnpm while bun is supported too. The JSDoc feeds the API reference and the `get_config_option` tool of the MCP server. The long dashes of the code, the logs and the JSDoc are now simple dashes.

- Name the commitlint pages of the docs in the get_doc tool ([25c2ff1](https://github.com/LouisMazel/relizy/commit/25c2ff1))

  The description of the `get_doc` tool of the MCP server listed `commitlint` among the CLI pages, while its page is `commitlint/cli`. The tests now check the pages it names, and that every `relizy.dev` link of the code reaches an existing page and heading.

- Publish only to the declared registries without publish.registry ([a7c9c3f](https://github.com/LouisMazel/relizy/commit/a7c9c3f))

  With `publish.registries` and without `publish.registry`, the registry of the npm config (`.npmrc`) was always added as the default registry, so every package was also published there. The packages now only go to the declared registries, and a package that no entry covers to the registry of the npm config.

  ```ts
  export default defineConfig({
    publish: {
      // @acme/* only goes to GitHub Packages, the other packages to the .npmrc registry
      registries: [{ registry: 'https://npm.pkg.github.com/', packageFilter: ['@acme/*'] }],
    },
  })
  ```

- Show the dry-run badge in the light theme of the CI logs ([92d4493](https://github.com/LouisMazel/relizy/commit/92d4493))

  The yellow background of the `DRY RUN` badge turned dark brown in the light theme of the GitHub logs, hiding its black text. In CI, the badge now has fixed colors, a gold background and a black text, readable in the light and dark themes of GitHub and GitLab.

- Only warn about the push in the dry run of a pull request ([45f8a9e](https://github.com/LouisMazel/relizy/commit/45f8a9e))

  The dry run of a pull request (`pull_request` on GitHub Actions, a merge request pipeline on GitLab CI) failed because its token is read-only, while the release never runs there: it now warns that the release job checks the push. Every other dry run still fails when the release cannot be pushed.

  The error of a refused push now tells how to fix it where it runs: the `permissions` to give to a GitHub Actions workflow, the `GITLAB_TOKEN` variable of GitLab CI, or the git credentials outside of a CI.

- Check the registries of every publishable package before a release ([a210b06](https://github.com/LouisMazel/relizy/commit/a210b06))

  With `publish.registries` and without `publish.registry`, a package that no entry covers is published to the registry of the npm config, but `relizy release` did not check the access to this registry before publishing: the release could publish some packages, then fail on the others. The registries the publishable packages need are now all checked before the bump.

- Quote the branch of a pull request in the git commands ([d3a3f91](https://github.com/LouisMazel/relizy/commit/d3a3f91))

  The branch of a GitHub pull request, named by its author, reached `git log` and `git config` through a shell: a branch name such as `feat/a$(cmd)`, valid for git, ran its command during the release of the pull request. The values that are not plain refs are now quoted.

- Report a release whose checks fail ([0e1b584](https://github.com/LouisMazel/relizy/commit/0e1b584))

  When a check of `relizy release` failed (a token, the registry, the push access, `--yes` missing in CI), the release stopped without its report, its PR comment nor its `error:release` hook. A failed check now writes the failed report, comments the pull request and runs `error:release`, as any other error of the release.

- Ignore the release commits of the version groups in relizy commitlint ([ff0b75e](https://github.com/LouisMazel/relizy/commit/ff0b75e))

  With `monorepo.groups` and without `templates.commitMessage`, the release commits (`chore(release): bump version to 2.0.0`, `chore(release): bump 3 packages`) were linted like any commit. They are ignored, as in a project without version groups.

- Read the scopes of the version groups in relizy commitlint ([b86a08a](https://github.com/LouisMazel/relizy/commit/b86a08a))

  The packages of `monorepo.groups` are valid scopes of the commits, as the packages of `monorepo.packages`.

- Run generate:changelog once per package in independent mode ([54d235f](https://github.com/LouisMazel/relizy/commit/54d235f))

  With `changelog.rootChangelog`, the changelog of each package was generated twice in `independent` mode, for its file and for the root changelog: a `generate:changelog` hook (an AI rewrite) ran twice, and the two texts could differ. Each changelog is generated once, and the root changelog gathers them.

- Align check_migration with the migration guide ([783a928](https://github.com/LouisMazel/relizy/commit/783a928))

  The `check_migration` tool of the MCP server no longer flags the `dependencyTypes` of a version group, used as is by relizy 1, nor functions relizy 1 never exported. It also finds `includePrivates` in the code, `--include-private` in the scripts, the `relizy release` and `relizy bump` of a CI without `--yes`, and the variables repeated in `templates.changelogTitle` and `templates.tagBody`.

- Only warn when the dry run of a pull request is outdated ([c588a39](https://github.com/LouisMazel/relizy/commit/c588a39))

  The dry run of a pull request no longer fails when new commits were pushed to the pull request after it started: it warns that the run is outdated, as the run of the latest commit previews the release with them. The release, and the dry run outside a pull request or a merge request, still stop on a branch behind its remote.

- Run the error hook of the push and of twitter when their before hook fails ([7de320d](https://github.com/LouisMazel/relizy/commit/7de320d))

  A failing `before:push` or `before:twitter` hook now runs `error:push` or `error:twitter`, like the other steps.

- Refuse a tagBody template that repeats {{newVersion}} ([5ab1026](https://github.com/LouisMazel/relizy/commit/5ab1026))

  relizy reads the version of a repository tag back between the text before and after `{{newVersion}}` in `templates.tagBody`. A template that repeats it, like `v{{newVersion}}-{{newVersion}}`, created tags relizy could not find again: it silently restarted from the first commit. The config now fails to load with a clear error, and `check_migration` points it out first.

- Point out only the removed token lines in check_migration ([d7721ad](https://github.com/LouisMazel/relizy/commit/d7721ad))

  `check_migration` pointed out every `token:` line of the config for `repo.token` and `publish.token`, so also the tokens to keep (`publish.registries[].token`, `social.slack.token`). It now only points out the `token` key of the `repo` or `publish` block, and no line when it cannot tell.

- Check the push access again in each release run of the same process ([6abe906](https://github.com/LouisMazel/relizy/commit/6abe906))

  The push access check and the preparation of the CI repository were cached for the whole process: a program calling `release()` several times reused the first result, a refused push stayed refused after fixing the token or the remote. They are now done once per run, like the git reads.

- Detect the CI the same way for the output and for the checks ([b3c02eb](https://github.com/LouisMazel/relizy/commit/b3c02eb))

  The output of the CLI and the checks of relizy (prompts, CI clone, npm) did not read the same variables: `CI=1` was a CI for the output only, Vercel, Netlify or Jenkins for the checks only. Both now use the same detection, which accepts any value of a CI flag but `false` and `0`.

- Check the push and the branch in the dry run of a GitLab merge request ([54233f6](https://github.com/LouisMazel/relizy/commit/54233f6))

  A merge request pipeline has no `CI_COMMIT_BRANCH`: relizy left its HEAD detached and silently skipped the checks of the push access and of the remote branch, without their warnings. It now checks out the source branch of the merge request (`CI_MERGE_REQUEST_SOURCE_BRANCH_NAME`), like the head branch of a GitHub pull request.

- Leave a blank line between the command typed and the output of the CLI ([ea408d7](https://github.com/LouisMazel/relizy/commit/ea408d7))
- Run the error:social hook when the social step itself fails ([9c41eb4](https://github.com/LouisMazel/relizy/commit/9c41eb4))

  `relizy social` only ran `error:social` when a post failed: an error of the step itself (reading the release, a failing hook) skipped it. It now runs it, like the other steps.

  The commands share their run (config, output, CI clone, error handling and `error:*` hook) in `runCommand()`. `provider-release` and `social` still report their errors in their result, so a release goes on without them.

- Name the GitHub release after its version, not after `--to` ([25bd378](https://github.com/LouisMazel/relizy/commit/25bd378))

  `--to` is the end of the commit range: `relizy release --to <commit>` created a GitHub release named after the commit. The release is now named after the version and `templates.tagBody`, as on GitLab. In unified mode, the version also comes from the root package when there is no bump result.

- Mark a GitHub release as a prerelease from its version ([043feb3](https://github.com/LouisMazel/relizy/commit/043feb3))

  In unified mode, the prerelease flag of the GitHub release was read from the tag: with a custom `templates.tagBody` (`release-{{newVersion}}`), a prerelease was published as the latest stable release. It is now read from the version, as on GitLab and in independent mode.

- Skip the GitHub release of a package without changes ([9db0c84](https://github.com/LouisMazel/relizy/commit/9db0c84))

  In independent mode, a package without commit in its range (released with `--force`) got a GitHub release holding only the empty changelog text. It is now skipped with a warning, as on GitLab.

- List the GitLab releases of a dry run in independent mode ([768876d](https://github.com/LouisMazel/relizy/commit/768876d))

  A dry run on GitLab returned no release in independent mode, so its summary said "No release to create". It now lists the releases it would create, as on GitHub.

- Encode the tag of a package in the release links ([ad5cbc0](https://github.com/LouisMazel/relizy/commit/ad5cbc0))

  The links to the release of a package (`@scope/name@1.0.0`) put its `/` as is in the URL: GitLab answered 404 to `/-/releases/@scope/name@1.0.0`. The tag is now a single segment of the URL, `/-/releases/@scope%2Fname@1.0.0`, on GitHub, GitLab and Bitbucket; the tags without `/` are unchanged.

- Keep every package of a group in the full Slack message ([33164d3](https://github.com/LouisMazel/relizy/commit/33164d3))

  In the `full` format, the budget of the message (blocks, payload, `postMaxLength`) was shared between the groups: the first long package of an `independent` group took the share of its group, and the next packages were left out of the message. The budget is now shared between the versions, so each package keeps at least its version line.

- Ask for any access token when GitLab CI cannot push the release ([7fb644a](https://github.com/LouisMazel/relizy/commit/7fb644a))

  On the Free tier of gitlab.com, project access tokens need Premium: the error of a refused push now asks for an access token with the `write_repository` and `api` scopes, a personal one on the Free tier, or for the push of the job token.

- Frame the release plan, previews and summary like relizy init ([0e3fe69](https://github.com/LouisMazel/relizy/commit/0e3fe69))
- Title the columns of the release summary table ([fa5f49b](https://github.com/LouisMazel/relizy/commit/fa5f49b))
- Show the social posts skipped for a prerelease in the release summary ([1e5437c](https://github.com/LouisMazel/relizy/commit/1e5437c))

  A platform that posts nothing, a prerelease with `onlyStable` or no version left to announce, is no longer shown as posted: the summary of the release, the PR comment and the summary of the GitHub Actions run say `skipped (twitter: prerelease)`, and `SocialNetworkResult.skipped` gives why.

- Skip the AI checks of a prerelease bump with onlyStable ([b29d361](https://github.com/LouisMazel/relizy/commit/b29d361))

  A release with `--prerelease`, `--prepatch`, `--preminor` or `--premajor` no longer checks the AI provider (credentials, `claude` CLI) of the targets with `onlyStable`, whose AI never runs: a beta job no longer needs to install the `claude` CLI.

- Skip the safety checks of the steps that do nothing in the release ([eca5cb0](https://github.com/LouisMazel/relizy/commit/eca5cb0))

  A release no longer fails on what it will not use: the credentials of a social platform that leaves the prereleases out (`onlyStable`) in a release of prereleases only, the AI of a platform that posts nothing, and the token or the AI of the provider releases and the social posts when every version group leaves them out (`release: { providerRelease: false }`, `release: { social: false }`).

  `relizy social` and `relizy provider-release` run alone also skip these checks when the versions they announce are all prereleases.

- Tell why the release cannot be pushed, and report a branch behind its remote as such ([3f50e48](https://github.com/LouisMazel/relizy/commit/3f50e48))

  A branch behind its remote no longer fails the release as if the git credentials could not push: the check of the branch reports how many commits are missing, with the fix (`git pull --rebase` locally, run the job again in CI).

  When git really refuses the push, the error shows why (permission denied, protected branch, unreachable host...), without the credentials of the remote.

### 💅 Refactors

- Read the last tag of the repository from the cached tag list ([c3dff38](https://github.com/LouisMazel/relizy/commit/c3dff38))

  The tag lookups with shell pipes (`git tag | grep | head`) are removed: they only served code paths no package could reach, as every package has a version. The last tag used by `relizy commitlint` and the MCP server comes from the cached list of tags.

- Remove the dead package selection of relizy publish ([60c17a1](https://github.com/LouisMazel/relizy/commit/60c17a1))

  Its fallbacks by version mode only ran without package, so they always published nothing.

- Stop reading the packages of planBumps for a debug log ([9d96fe8](https://github.com/LouisMazel/relizy/commit/9d96fe8))

  The bump read every package of the project only to log their count.

- Remove the unread maxLength of the AI requests ([d8d39ee](https://github.com/LouisMazel/relizy/commit/d8d39ee))

  The length budget reaches the model through its prompt: no provider read the field.

- Remove the unused options of the PR comment of a release ([d94573a](https://github.com/LouisMazel/relizy/commit/d94573a))

  The comment posted by `relizy release` uses its config: the log level and the config name were never read.

- Remove the dead functions and the internal-only exports ([67e23d7](https://github.com/LouisMazel/relizy/commit/67e23d7))

  `parseChangelogMarkdown()`, `parseGitRemoteUrl()` and `extractVersionFromPackageTag()` were never called, and about thirty functions and constants were exported without being imported anywhere else. None of them is part of the public API listed by `src/index.ts`.

- Share the text helpers of the outputs ([fe83e3b](https://github.com/LouisMazel/relizy/commit/fe83e3b))

  The pluralized counts, the durations, the UTC dates, the name of a release and the entries of its summary were written several times across the terminal output, the report, the PR comment, commitlint and the AI: one helper each.

- Iterate the version groups of a release step with getReleaseTargets ([3767f27](https://github.com/LouisMazel/relizy/commit/3767f27))
- Apply the overrides to a resolved config without loading the config file again ([3e952cf](https://github.com/LouisMazel/relizy/commit/3e952cf))

  A command given a resolved config (`release` gives its own to its steps, or `loadRelizyConfig()` in a script) no longer loads the config file and the `.env` file again: the overrides are merged over it, as for the configs of the version groups. A command changing its config still leaves the given one untouched.

- Move the display and the confirmation of a bump to bump-confirm.ts ([52d277c](https://github.com/LouisMazel/relizy/commit/52d277c))
- Split npm.ts into the registries, the published versions and the publication ([c02725d](https://github.com/LouisMazel/relizy/commit/c02725d))
- Split createCommitAndTags into the staging, the commit message and the tags ([66d1b63](https://github.com/LouisMazel/relizy/commit/66d1b63))
- Move the planning of the bumps out of repo.ts to bump-plan.ts ([9a8d4fa](https://github.com/LouisMazel/relizy/commit/9a8d4fa))
- Run git through a single module without shell ([cbb4c26](https://github.com/LouisMazel/relizy/commit/cbb4c26))

  `git-exec.ts` runs git with `execFile`: the arguments are an array, without shell, so a branch, a tag, a path or a commit message is passed as is, without escaping. It replaces the copies of `git()` / `tryGit()` (`ci.ts`, `commitlint/git.ts`, `ci-workflow.ts`, `git.ts`) and the `execSync` / `execPromise` git command strings; `shell.ts` is removed. The stderr of git is captured, in the error when git fails, instead of being written to the terminal.

- Share the flow of the GitHub and GitLab releases ([6810d4c](https://github.com/LouisMazel/relizy/commit/6810d4c))

  `github.ts` and `gitlab.ts` repeated the tags, the notes (changelog, AI), the empty release check, the dry-run preview and the summary, in unified and independent modes. `postProviderReleases()` (`provider-releases.ts`) runs this flow once; a provider is a `ReleaseProvider` adapter that checks its config and creates a release.

### 📖 Documentation

- Add the migration guide from v1 to v2 ([8064cb6](https://github.com/LouisMazel/relizy/commit/8064cb6))

  What changes in Relizy 2 and how to upgrade: the version groups released as one release, the social templates (`{{releaseTitle}}`, `{{newVersion}}` with several versions), the programmatic API (`RelizyCancelError`, `confirmBump`, the social functions). Listed in the "Guide" menu, the version menu and the sidebar.

- Explain how to run something only when a release happens ([4013d48](https://github.com/LouisMazel/relizy/commit/4013d48))
- Redesign the homepage ([39f13ed](https://github.com/LouisMazel/relizy/commit/39f13ed))

  The homepage presents Relizy with an animated terminal playing a release, a dry run and a GitHub Actions run, then the steps of a release and the features, each one linked to its page of the docs.

  The docs follow a maz-ui theme preset with the colors of Relizy, with Tailwind for the custom pages.

- Rewrite the documentation for relizy 2 ([3253dea](https://github.com/LouisMazel/relizy/commit/3253dea))

  One page per topic, checked against the code, from 16 000 to 6 600 lines:
  the guides explain, the config, CLI and API pages are an exact reference
  with every option and flag.

  - `guide/getting-started` absorbs `guide/installation` and starts from
    `relizy init`
  - `guide/prereleases` merges the canary and prerelease guides
  - `guide/social-media` merges the Twitter and Slack guides
  - `config/overview` absorbs `config/multiple-configs` and lists the tokens
  - `commitlint/index` absorbs `commitlint/getting-started`
  - the CI guides follow the workflow generated by `relizy init`
  - new `api/commitlint` page, README rewritten for v2

- List the fixes of relizy 2 in the migration guide ([4ead599](https://github.com/LouisMazel/relizy/commit/4ead599))

  Also drop the claim that relizy release passed publish.args twice: they never reached the publish command.

- Generate llms.txt for the AI assistants ([2263d91](https://github.com/LouisMazel/relizy/commit/2263d91))

  The docs publish llms.txt (the index of the pages with their descriptions), llms-full.txt (the whole docs in one markdown file) and a .md file per page, so the AI assistants read the docs without running the site.

- Name every template in the migration entry of the replaced variables ([cd004a1](https://github.com/LouisMazel/relizy/commit/cd004a1))
- Update the contributing guide ([ec7fd01](https://github.com/LouisMazel/relizy/commit/ec7fd01))

  Node and pnpm versions, the git hooks as they run, the commit types and scopes of the repository, the specs next to the code and the checks of the docs, the no-ai-attribution rule, and how to add an AI provider, moved here from the user docs.

- Complete the fixes and the exit codes of the migration guide ([3931bb3](https://github.com/LouisMazel/relizy/commit/3931bb3))
- Update the illustration of the README ([647e2ed](https://github.com/LouisMazel/relizy/commit/647e2ed))
- Keep the 404 page out of the search engines ([e1c4771](https://github.com/LouisMazel/relizy/commit/e1c4771))

  The 404 page also answers with a 200 at /404, with a canonical to itself and "index, follow": the search engines could index it. It now has a noindex and no canonical.

- Point the canonical url of the index pages to their served url ([03992eb](https://github.com/LouisMazel/relizy/commit/03992eb))

  commitlint/index.md declared https://relizy.dev/commitlint/index as canonical url, which redirects to /commitlint/. The index pages now declare the url they are served at.

- Link the breadcrumbs of the pages to existing pages ([3a8b2d1](https://github.com/LouisMazel/relizy/commit/3a8b2d1))

  The BreadcrumbList of each page linked its section to /guide, /config, /cli or /api, which answer with a 404, and named the page after its slug. The section now links to its first page and the page is named after its title.

- Keep the typedoc reference out of the search engines ([cc85e3e](https://github.com/LouisMazel/relizy/commit/cc85e3e))

  The 124 pages of the typedoc reference were indexable with the description of the site, out of the sitemap, and covered by the pages of the API section. They now have a noindex: they stay in the docs and in llms-full.txt.

- Cache the hashed assets of the docs for a year ([9b7ff48](https://github.com/LouisMazel/relizy/commit/9b7ff48))

  Cloudflare Pages served the files of /assets with max-age=14400 and must-revalidate. Their name holds a hash of their content, so a _headers file caches them for a year as immutable.

- Serve the logo of the header from the docs ([728ace2](https://github.com/LouisMazel/relizy/commit/728ace2))

  The logo of the header was loaded from raw.githubusercontent.com, an extra connection on each visit. The same logo.svg is in the public files of the docs.

- Give the pages of the commands and the homepage searchable titles ([597f878](https://github.com/LouisMazel/relizy/commit/597f878))

  The pages of the commands were titled "bump | Relizy", "init | Relizy", and "changelog | Relizy" twice with the changelog page. They are now titled "relizy bump command | Relizy", the changelog page "Changelog | Relizy", and the homepage starts with the name of Relizy: "Relizy - Release automation for monorepos and packages".

- Describe the API pages and the changelog page in full ([200eecc](https://github.com/LouisMazel/relizy/commit/200eecc))

  Their descriptions, shown in the search results, in llms.txt and at the top of the API pages, were 25 to 54 characters long. They now say what each function does and returns.

- Stop repeating the head of the site in each page ([34e6f26](https://github.com/LouisMazel/relizy/commit/34e6f26))

  transformHead returned the head of the site with the tags of the page, and VitePress adds what transformHead returns to this head: each page had its JSON-LD WebSite and SoftwareApplication, its favicon and its font preload twice.

- Drop the changefreq and priority of the sitemap ([fc61776](https://github.com/LouisMazel/relizy/commit/fc61776))

  Every page was "daily" with priority 1, values the search engines ignore. The sitemap keeps the lastmod of each page, read from git.

- Drop the published time of the pages ([4e0749d](https://github.com/LouisMazel/relizy/commit/4e0749d))

  article:published_time held the date of the last update of the page, as article:modified_time. The pages keep their modified time.

- Give the version, license and repository of Relizy to the search engines ([af05e25](https://github.com/LouisMazel/relizy/commit/af05e25))

  The JSON-LD SoftwareApplication of the docs now has the softwareVersion, the license and the GitHub and npm pages of Relizy (sameAs).

- Give the long pages a shorter description for the search results ([9974946](https://github.com/LouisMazel/relizy/commit/9974946))

  21 pages had a description of 161 to 251 characters, cut by the search results. Their metaDescription, at most 155 characters, is used for the meta description and the og and twitter descriptions, while the page, llms.txt and the docs of the MCP server keep the full description.

- Correct the migration guide of relizy 2 ([6c59769](https://github.com/LouisMazel/relizy/commit/6c59769))
- Correct the documentation against the code ([a1f05a9](https://github.com/LouisMazel/relizy/commit/a1f05a9))
- Update plans ([eafff08](https://github.com/LouisMazel/relizy/commit/eafff08))
- Update plans ([aaa1976](https://github.com/LouisMazel/relizy/commit/aaa1976))
- Update plans ([36f16e5](https://github.com/LouisMazel/relizy/commit/36f16e5))
- Update plans ([d4d46dd](https://github.com/LouisMazel/relizy/commit/d4d46dd))
- Update plans ([af35044](https://github.com/LouisMazel/relizy/commit/af35044))
- Run a CI step only when a release happens, from the report ([3a6b480](https://github.com/LouisMazel/relizy/commit/3a6b480))
- Add the guide of npm trusted publishing ([23f5fcb](https://github.com/LouisMazel/relizy/commit/23f5fcb))
- Point to the version groups for a root version next to independent packages ([b4750d9](https://github.com/LouisMazel/relizy/commit/b4750d9))
- Show the Microsoft Teams posts on the homepage ([2e3dc99](https://github.com/LouisMazel/relizy/commit/2e3dc99))
- Use the relizy illustration as the social preview image ([d7dbb89](https://github.com/LouisMazel/relizy/commit/d7dbb89))
- Add maz-ui translations ([37a7408](https://github.com/LouisMazel/relizy/commit/37a7408))
- Fix the build of the GitHub Actions guide ([8894546](https://github.com/LouisMazel/relizy/commit/8894546))

### 📦 Build

- **deps:** Remove @maz-ui/upgrade from the docs ([1db29ea](https://github.com/LouisMazel/relizy/commit/1db29ea))
- **deps:** Accept the minor versions of @maz-ui/node and @maz-ui/utils ([f6b8375](https://github.com/LouisMazel/relizy/commit/f6b8375))
- **deps:** Update ai version ([b70d391](https://github.com/LouisMazel/relizy/commit/b70d391))

### 🧪 Tests

- Give the slow git tests more time ([fb6421b](https://github.com/LouisMazel/relizy/commit/fb6421b))
- Type the cancelled prompts of the tests ([a756f4f](https://github.com/LouisMazel/relizy/commit/a756f4f))
- Confirm the bump in the release e2e tests ([1ca1d6f](https://github.com/LouisMazel/relizy/commit/1ca1d6f))

  The release now fails without --yes when the terminal is not interactive, as in the workers of vitest.

- Check that the docs name every CLI flag and config option ([269a2fb](https://github.com/LouisMazel/relizy/commit/269a2fb))

  A flag of `src/cli.ts` missing from the page of its command (the global
  ones from `cli/commands`), or a config option missing from its doc page,
  now fails `knowledge.spec.ts`, as an undocumented command already did.

- Search the prereleases page of the docs ([c421e2a](https://github.com/LouisMazel/relizy/commit/c421e2a))

  The canary releases and the prerelease versioning are now documented on one page, guide/prereleases.

- Check the order of the release steps ([bae9d3c](https://github.com/LouisMazel/relizy/commit/bae9d3c))

  The test named after the order only checked that each step ran, and its e2e twin pushed the names in a fixed order, so neither could fail.

- Stop loading the source code in the vitest config ([d386bf7](https://github.com/LouisMazel/relizy/commit/d386bf7))
- Pass the tests of init and of the release report in CI ([04fd1a5](https://github.com/LouisMazel/relizy/commit/04fd1a5))
- Check the push of a dry run outside of a pull request in CI ([c779dd6](https://github.com/LouisMazel/relizy/commit/c779dd6))
- Check the links between the doc pages ([5dbf050](https://github.com/LouisMazel/relizy/commit/5dbf050))
- Replace the e2e specs of the release with a unit test ([ecf91a8](https://github.com/LouisMazel/relizy/commit/ecf91a8))

  The specs of `tests/e2e` mocked everything but `release.ts` and only covered the check of the remote branch with the publish disabled and the push enabled. This case is now tested in `release.spec.ts`.

- Toggle the interactive terminal with setInteractiveTerminal ([0233a0e](https://github.com/LouisMazel/relizy/commit/0233a0e))
- Create the temporary git repositories with a shared helper ([7a5a41d](https://github.com/LouisMazel/relizy/commit/7a5a41d))
- Share the commit and version group config factories ([6a1fae2](https://github.com/LouisMazel/relizy/commit/6a1fae2))
- Ignore the OIDC token of the CI job running the tests ([caa6a7e](https://github.com/LouisMazel/relizy/commit/caa6a7e))
- Split the slow specs so that vitest runs them in parallel ([44f313f](https://github.com/LouisMazel/relizy/commit/44f313f))

  The release-groups specs are split in three files sharing their repository (tests/release-groups.ts), the Slack messages of slack-limits are formatted once per scenario, and the commitlint CLI tests join cli.spec.ts.

- Ignore the colors of the init notes in CI ([a5e27e4](https://github.com/LouisMazel/relizy/commit/a5e27e4))
- Keep the release reports of the tests out of the CI summary ([b8552d0](https://github.com/LouisMazel/relizy/commit/b8552d0))

#### ⚠️ Breaking Changes

- ⚠️ Throw a RelizyCancelError on a refused prompt instead of exiting the process ([ac14ad2](https://github.com/LouisMazel/relizy/commit/ac14ad2))

  A refused or cancelled prompt (bump confirmation, uncommitted changes, rewritten tag) no longer calls `process.exit()`: the commands throw a `RelizyCancelError` before writing anything, without their `error:*` hooks nor a failed PR comment. The CLI still exits with code 0.

  ```ts
  import { isRelizyCancelError, release } from 'relizy'

  try {
    await release()
  }
  catch (error) {
    if (!isRelizyCancelError(error)) {
      throw error
    }
  }
  ```

- ⚠️ Confirm the bump once for every version group ([985a5f7](https://github.com/LouisMazel/relizy/commit/985a5f7))

  With `monorepo.groups`, the bump prompt lists the packages of every group, each under its `title`, and asks once instead of once per group.

  `confirmBump()` only asks, `displayBump()` prints a bump, and the plans of `planBumps()` get `display()` instead of `confirm()`:

  ```ts
  const { plans } = await planBumps({ config })

  await confirmBump({
    packages: plans.flatMap(plan => plan.result.bumped ? plan.result.bumpedPackages : []),
    display: () => {
      for (const plan of plans) {
        plan.display?.()
      }
    },
    dryRun: false,
  })
  ```

- ⚠️ Add releaseTitle, packageList and packageCount to the social templates ([99cd9c8](https://github.com/LouisMazel/relizy/commit/99cd9c8))

  The social posts are built from a model of the release (`getReleaseOverview()`), which fixes the posts of the `independent` mode: no more "my-lib 3 packages is out!", nor the project name with the version of its only package.

  - `{{releaseTitle}}`: `<name> <version> is out!` for a single version (`@scope/pkg 5.1.0 is out!` for a single package), `New releases of <project>` for several
  - `{{packageList}}` and `{{packageCount}}`, as in the commit templates
  - `{{newVersion}}` is empty when several versions are released
  - every occurrence of a variable is replaced, not only the first one

  The default `templates.twitterMessage` uses `{{releaseTitle}}`, same text for a single version:

  ```ts
  export default defineConfig({
    templates: {
      twitterMessage: '📣 {{releaseTitle}}\n\n{{changelog}}\n\n{{releaseUrl}}\n{{changelogUrl}}',
    },
  })
  ```

  `formatTweetMessage()`, `postReleaseToTwitter()`, `formatSlackMessage()` and `postReleaseToSlack()` take the `variables` of the template instead of `projectName`, `version`, `releaseUrl` and `changelogUrl`:

  ```ts
  const variables = getSocialTemplateVariables({ overview: getReleaseOverview({ config, bumpResult }), releaseUrl })

  formatTweetMessage({ template, changelog, postMaxLength: 280, variables })
  ```

- ⚠️ Post a release of several versions once per platform, by group ([6e30ca4](https://github.com/LouisMazel/relizy/commit/6e30ca4))

  With `monorepo.groups`, a release is announced as one release: one post per platform instead of one per group, one AI call per platform instead of one per group and platform, and the `social`, `twitter` and `slack` hooks run once. Same for several packages released in `independent` mode.

  - the post is titled `New releases of <project>`, then a section per group (its `title`), the `unified`/`selective` group first
  - Twitter: filled by priority within `postMaxLength`, every group keeps its version line (an `independent` group collapses to `Tooling: 3 packages` when needed)
  - Slack: a section per group, the budget of the message shared between them, the contributors once
  - `onlyStable` leaves the prereleases out of the post instead of posting all the versions or none

  ```text
  📣 New releases of maz-ui

  maz-ui 5.2.1
  • mcp: label the bundled docs with their maz-ui version

  Tooling
  • @maz-ui/eslint-config 5.1.0: stop enforcing the pnpm catalog
  • @maz-ui/upgrade 5.2.1
  ```

- ⚠️ Report the outcome of the release to the CI ([53c44a9](https://github.com/LouisMazel/relizy/commit/53c44a9))

  `relizy release` reports what it did (released, nothing to release or failed, the versions by group, the tags, and the outcome of each step), to run something only when a release happens:

  - in GitHub Actions, the outputs of the step (`released`, `status`, `version`, `tags`, `packages`, `report`) and the summary of the run, without option
  - `release.report.dotenv` (`--report-dotenv`): a dotenv file for the `artifacts:reports:dotenv` of GitLab CI (`RELIZY_RELEASED`, `RELIZY_VERSION`...)
  - `release.report.json` (`--report-json`): the whole report as JSON
  - `release()` returns it, and `formatReleaseReportText()` replaces `buildReleaseSummary()`

  ```yaml
  - id: release
    run: pnpm relizy release --yes
  - if: steps.release.outputs.released == 'true'
    run: ./scripts/notify-teams.sh
  ```

- ⚠️ Show each command step by step, with previews and a summary of the release ([dbc523b](https://github.com/LouisMazel/relizy/commit/dbc523b))

  Every command shows one line per step, with its duration and what it did, the details only with `--log-level verbose`. In CI, each step is a collapsible group of GitHub Actions or GitLab CI. `RELIZY_REPORTER=classic` gives back the logs of relizy 1.

  A dry run shows what it would generate (changelogs, release notes, posts, PR comment) and no longer calls the AI: `--ai-preview` calls it, `--no-preview` hides the previews.

  `relizy release` ends with a summary, also used for the PR comment, the summary of the GitHub Actions run and the new `release.report.markdown`. See [Migrating from v1 to v2](https://relizy.dev/guide/migration-v2).

- ⚠️ Rename commitlint.codeBlocksLinter to changelogLinter ([4b2073f](https://github.com/LouisMazel/relizy/commit/4b2073f))

  The option chooses the tool checking the changelog entry of a commit, not only its code blocks: with ESLint, the whole entry is linted. Rename `codeBlocksLinter` to `changelogLinter` in the `commitlint` config, with the same values (`auto`, `eslint`, `oxc`), and the type `CommitlintCodeBlocksLinter` to `CommitlintChangelogLinter`. See [Migrating from v1 to v2](https://relizy.dev/guide/migration-v2).

- ⚠️ Reject the commits crediting an AI tool ([2123f4a](https://github.com/LouisMazel/relizy/commit/2123f4a))

  The new `no-ai-attribution` rule of `relizy commitlint` reports an AI co-author (`Co-authored-by: Claude <noreply@anthropic.com>`), a `Claude-Session:` trailer and the "Generated with" line of the AI tools. It is an error by default: turn off the attribution in the settings of your tools, or the rule, as told in the [migration guide](https://relizy.dev/guide/migration-v2#ai-attribution-in-commits).

  ```ts
  import { defineConfig } from 'relizy'

  export default defineConfig({
    commitlint: {
      rules: { 'no-ai-attribution': 'off' },
    },
  })
  ```

- ⚠️ Only export the commands, the config and the types ([f5fb638](https://github.com/LouisMazel/relizy/commit/f5fb638))

  `relizy` exported every internal function of its commands (about 300: git, npm, tags, Slack, the steps of the commands...). It now only exports the programmatic API: the commands (`release()`, `bump()`, `changelog()`, `publish()`, `providerRelease()`, `social()`, `prComment()`, `commitlint()`), `defineConfig()`, `loadRelizyConfig()`, `RelizyCancelError`, `isRelizyCancelError()`, `lintCommitMessage()` and the types.

  The functions no longer exported have a replacement, listed in the [migration guide](https://relizy.dev/guide/migration-v2#public-api):

  - `createCommitAndTags()`, `pushCommitAndTags()`: `release()` with its `commit`, `gitTag` and `push` options
  - `planBumps()`, `confirmBump()`, `displayBump()`, `getPackages()`: `bump()`, with `dryRun` to preview it
  - `formatTweetMessage()`, `postReleaseToTwitter()`, `formatSlackMessage()`, `postReleaseToSlack()`, `getReleaseOverview()`, `getSocialTemplateVariables()`: `social()`, or the `release` parameter of a hook
  - `buildReleaseSummary()`, `formatReleaseReportText()`, `formatReleaseReportMarkdown()`: the report returned by `release()`
  - `generateChangelog()`, `generateMarkDown()`: `changelog()`
  - `getDefaultConfig()`, `mergeTypes()`: `loadRelizyConfig()`, which returns the config with its defaults
  - `isPrerelease()`: `prerelease()` of semver
  - `init()`: `relizy init`

  ```ts
  // v1
  const types = Object.keys(mergeTypes(relizyConfig.types, getDefaultConfig().types))

  // v2
  const config = await loadRelizyConfig()
  const types = Object.keys(config.types)
  ```

  The `check_migration` tool of the MCP server lists the imports to change.

- ⚠️ Rename monorepo.includePrivates to privatePackages ([26b4711](https://github.com/LouisMazel/relizy/commit/26b4711))

  The option says what relizy does with the private packages of the
  workspace, with named values: `ignore` (default) or `release` (released as
  the other packages, never published). The flag and the options of the
  commands follow:

  ```ts
  export default defineConfig({
    monorepo: {
      // includePrivates: true,
      privatePackages: 'release',
    },
  })
  ```

  ```bash
  relizy release --private-packages release
  ```

  `check_migration` points out `includePrivates` in the config.

- ⚠️ Remove monorepo.ignorePackageNames, replaced by monorepo.ignored ([798faeb](https://github.com/LouisMazel/relizy/commit/798faeb))

  `monorepo.ignorePackageNames`, deprecated, is removed: list the directories of these packages in `monorepo.ignored`, path globs matched as `monorepo.packages`. A config that still sets it fails to load with the fix, rather than releasing the packages it left out, and `check_migration` points it out first.

  ```ts
  export default defineConfig({
    monorepo: {
      packages: ['packages/*'],
      // ignorePackageNames: ['@scope/legacy'],
      ignored: ['packages/legacy'],
    },
  })
  ```

- ⚠️ Remove publish.token, replaced by tokens.registry ([1e8eb42](https://github.com/LouisMazel/relizy/commit/1e8eb42))

  `publish.token` read the same environment variables as `tokens.registry` (`RELIZY_NPM_TOKEN`, `NPM_TOKEN`, `NODE_AUTH_TOKEN`). Set the registry token in `tokens.registry`, or per registry in `publish.registries[].token`. `--publish-token` and the `token` option of `publish()` now set `tokens.registry`, and `token` of `ReleaseOptions` is only the git token.

  ```ts
  export default defineConfig({
    // publish: { token: process.env.MY_NPM_TOKEN },
    tokens: { registry: process.env.MY_NPM_TOKEN },
  })
  ```

- ⚠️ Remove repo.token, replaced by tokens.github and tokens.gitlab ([6d6c280](https://github.com/LouisMazel/relizy/commit/6d6c280))

  `repo.token` was a fallback of `tokens.github` and `tokens.gitlab`, which read `GITHUB_TOKEN`, `GH_TOKEN`, `GITLAB_TOKEN`... by default and are set by `--token`. Set the token of the provider releases and of the PR comment there. A PR comment on Bitbucket now says the provider is not supported, instead of asking for a GitLab token.

  ```ts
  export default defineConfig({
    repo: { provider: 'gitlab', domain: 'gitlab.mycompany.com', repo: 'team/app' },
    tokens: { gitlab: process.env.MY_TOKEN },
  })
  ```

- ⚠️ Remove the relizy/types entry of the package ([ae17dae](https://github.com/LouisMazel/relizy/commit/ae17dae))

  The entry pointed straight at a declaration file, so a runtime import of it failed. Import the types from `relizy`.

  ```ts
  // import type { RelizyConfig } from 'relizy/types'
  import type { RelizyConfig } from 'relizy'
  ```

- ⚠️ Remove the newVersion and publish.packages options, never read ([1d57afc](https://github.com/LouisMazel/relizy/commit/1d57afc))

  relizy never read the root `newVersion` option nor `publish.packages`: remove them from the config. To leave a package out of the release, use `monorepo.ignored`.

- ⚠️ Format the changelogs written with the formatter of the project ([7009491](https://github.com/LouisMazel/relizy/commit/7009491))

  Without `changelog.formatCmd`, the formatter in the dependencies of the root `package.json` (Biome, Prettier, oxfmt, dprint, else ESLint) formats the changelogs written, and only them. If it fails, the release goes on with a warning.

  To choose the command, set `formatCmd`: its files placeholder is replaced by the paths of the changelogs written. `false` (or `--no-format-cmd`) turns the formatting off:

  ```ts
  import { defineConfig } from 'relizy'

  export default defineConfig({
    changelog: { formatCmd: 'eslint --fix {{files}}' },
  })
  ```

- ⚠️ Name the changelog of Slack and Teams posts changelog ([1fb6dc2](https://github.com/LouisMazel/relizy/commit/1fb6dc2))

  `social.slack.changelog` and `social.teams.changelog` take the same values: `full` (the commit bodies included), `summary` (the commit titles) or `none` (or `false`, no changelog). Slack gains `none`, Teams gains `full`: the changelogs of a card share what its other texts leave of its 28 KB, each one cut between two changes with an `… and N more changes` line, instead of refusing the card.

  ```ts
  export default defineConfig({
    social: {
      slack: { enabled: true, changelog: 'full' },
      teams: { enabled: true, changelog: 'summary' },
    },
  })
  ```

  BREAKING CHANGE: `social.slack.changelogFormat` is renamed `social.slack.changelog`, with the same values; relizy 2 ignores `changelogFormat`. `check_migration` finds it.

- ⚠️ Rewrite only the stable versions with the AI ([08a18d0](https://github.com/LouisMazel/relizy/commit/08a18d0))

  The AI no longer rewrites the prereleases (beta, canary...): their provider release notes and social posts keep their raw changelog, without an AI call. In a post announcing several versions, only the stable ones are rewritten.

  Turn it off with `ai.onlyStable: false`, or for one target with its own `onlyStable`:

  ```ts
  import { defineConfig } from 'relizy'

  export default defineConfig({
    ai: {
      providerRelease: { enabled: true, onlyStable: false },
    },
  })
  ```

  See the [migration guide](https://relizy.dev/guide/migration-v2#ai-on-prereleases).

- ⚠️ Replace the arrays of the config instead of concatenating them ([f2aca2a](https://github.com/LouisMazel/relizy/commit/f2aca2a))

  An array of the config replaces the default one, and the array of the config file when it comes from the CLI or the programmatic API. Before, `bump.dependencyTypes: ['dependencies', 'peerDependencies']` resolved to `['dependencies', 'peerDependencies', 'dependencies']`, `--dependency-types devDependencies` could only add to the list of the config, and `relizy release` passed every `publish.args` twice.

  A `bump.dependencyTypes` without `dependencies` no longer bumps the packages on every bump of their `dependencies`: add it to keep them.

  ```ts
  export default defineConfig({
    bump: {
      dependencyTypes: ['dependencies', 'peerDependencies'],
    },
  })
  ```

- ⚠️ Exit with code 0 when there is nothing to bump ([8c11e3f](https://github.com/LouisMazel/relizy/commit/8c11e3f))

  `relizy bump` exits with code 0 when no commit triggers a bump, as `relizy release` does, instead of 1: a CI job running it no longer fails for nothing. To run something only when a release happens, use a `success:release` hook.

- ⚠️ Remove the publish.private option ([acb3416](https://github.com/LouisMazel/relizy/commit/acb3416))

  relizy never read it: the private packages are never published. A config
  setting it no longer type-checks, `check_migration` points it out:

  ```ts
  export default defineConfig({
    // publish: { private: false }, removed
    monorepo: { privatePackages: 'release' }, // to version the private packages
  })
  ```

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v2.0.0-beta.5 (2026-11-06)

[compare changes](https://github.com/LouisMazel/relizy/compare/v2.0.0-beta.4...v2.0.0-beta.5)

### 🩹 Fixes

- Tell why the release cannot be pushed, and report a branch behind its remote as such ([3f50e48](https://github.com/LouisMazel/relizy/commit/3f50e48))

  A branch behind its remote no longer fails the release as if the git credentials could not push: the check of the branch reports how many commits are missing, with the fix (`git pull --rebase` locally, run the job again in CI).

  When git really refuses the push, the error shows why (permission denied, protected branch, unreachable host...), without the credentials of the remote.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v2.0.0-beta.4 (2026-11-06)

[compare changes](https://github.com/LouisMazel/relizy/compare/v2.0.0-beta.3...v2.0.0-beta.4)

### 🩹 Fixes

- Skip the safety checks of the steps that do nothing in the release ([eca5cb0](https://github.com/LouisMazel/relizy/commit/eca5cb0))

  A release no longer fails on what it will not use: the credentials of a social platform that leaves the prereleases out (`onlyStable`) in a release of prereleases only, the AI of a platform that posts nothing, and the token or the AI of the provider releases and the social posts when every version group leaves them out (`release: { providerRelease: false }`, `release: { social: false }`).

  `relizy social` and `relizy provider-release` run alone also skip these checks when the versions they announce are all prereleases.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v2.0.0-beta.3 (2026-11-06)

[compare changes](https://github.com/LouisMazel/relizy/compare/v2.0.0-beta.2...v2.0.0-beta.3)

### 🩹 Fixes

- Skip the AI checks of a prerelease bump with onlyStable ([b29d361](https://github.com/LouisMazel/relizy/commit/b29d361))

  A release with `--prerelease`, `--prepatch`, `--preminor` or `--premajor` no longer checks the AI provider (credentials, `claude` CLI) of the targets with `onlyStable`, whose AI never runs: a beta job no longer needs to install the `claude` CLI.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v2.0.0-beta.2 (2026-11-06)

[compare changes](https://github.com/LouisMazel/relizy/compare/v2.0.0-beta.1...v2.0.0-beta.2)

### 🚀 Features

- ⚠️ Rewrite only the stable versions with the AI ([08a18d0](https://github.com/LouisMazel/relizy/commit/08a18d0))

  The AI no longer rewrites the prereleases (beta, canary...): their provider release notes and social posts keep their raw changelog, without an AI call. In a post announcing several versions, only the stable ones are rewritten.

  Turn it off with `ai.onlyStable: false`, or for one target with its own `onlyStable`:

  ```ts
  import { defineConfig } from 'relizy'

  export default defineConfig({
    ai: {
      providerRelease: { enabled: true, onlyStable: false },
    },
  })
  ```

  See the [migration guide](https://relizy.dev/guide/migration-v2#ai-on-prereleases).

#### ⚠️ Breaking Changes

- ⚠️ Rewrite only the stable versions with the AI ([08a18d0](https://github.com/LouisMazel/relizy/commit/08a18d0))

  The AI no longer rewrites the prereleases (beta, canary...): their provider release notes and social posts keep their raw changelog, without an AI call. In a post announcing several versions, only the stable ones are rewritten.

  Turn it off with `ai.onlyStable: false`, or for one target with its own `onlyStable`:

  ```ts
  import { defineConfig } from 'relizy'

  export default defineConfig({
    ai: {
      providerRelease: { enabled: true, onlyStable: false },
    },
  })
  ```

  See the [migration guide](https://relizy.dev/guide/migration-v2#ai-on-prereleases).

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v2.0.0-beta.1 (2026-11-06)

[compare changes](https://github.com/LouisMazel/relizy/compare/v2.0.0-beta.0...v2.0.0-beta.1)

### 🩹 Fixes

- Title the columns of the release summary table ([fa5f49b](https://github.com/LouisMazel/relizy/commit/fa5f49b))
- Show the social posts skipped for a prerelease in the release summary ([1e5437c](https://github.com/LouisMazel/relizy/commit/1e5437c))

  A platform that posts nothing, a prerelease with `onlyStable` or no version left to announce, is no longer shown as posted: the summary of the release, the PR comment and the summary of the GitHub Actions run say `skipped (twitter: prerelease)`, and `SocialNetworkResult.skipped` gives why.

### 🧪 Tests

- Keep the release reports of the tests out of the CI summary ([b8552d0](https://github.com/LouisMazel/relizy/commit/b8552d0))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v2.0.0-beta.0 (2026-11-06)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.14.4-beta.0...v2.0.0-beta.0)

### 🚀 Features

- ⚠️ Throw a RelizyCancelError on a refused prompt instead of exiting the process ([ac14ad2](https://github.com/LouisMazel/relizy/commit/ac14ad2))

  A refused or cancelled prompt (bump confirmation, uncommitted changes, rewritten tag) no longer calls `process.exit()`: the commands throw a `RelizyCancelError` before writing anything, without their `error:*` hooks nor a failed PR comment. The CLI still exits with code 0.

  ```ts
  import { isRelizyCancelError, release } from 'relizy'

  try {
    await release()
  }
  catch (error) {
    if (!isRelizyCancelError(error)) {
      throw error
    }
  }
  ```

- Add the title, release and ai options to the version groups ([3393af4](https://github.com/LouisMazel/relizy/commit/3393af4))

  A version group gets a `title`, shown in the outputs of a release, and can override `release.providerRelease`, `release.social` and `ai.providerRelease`, e.g. to create the provider releases of an `independent` group (one per package) without AI:

  ```ts
  export default defineConfig({
    monorepo: {
      groups: [
        { name: 'ecosystem', title: 'maz-ui', versionMode: 'selective', packages: ['packages/*'] },
        { name: 'tooling', title: 'Tooling', versionMode: 'independent', packages: ['tooling/*'], ai: { providerRelease: { enabled: false } } },
      ],
    },
  })
  ```

  The `--ai`/`--no-ai` options still apply to every group.

- ⚠️ Confirm the bump once for every version group ([985a5f7](https://github.com/LouisMazel/relizy/commit/985a5f7))

  With `monorepo.groups`, the bump prompt lists the packages of every group, each under its `title`, and asks once instead of once per group.

  `confirmBump()` only asks, `displayBump()` prints a bump, and the plans of `planBumps()` get `display()` instead of `confirm()`:

  ```ts
  const { plans } = await planBumps({ config })

  await confirmBump({
    packages: plans.flatMap(plan => plan.result.bumped ? plan.result.bumpedPackages : []),
    display: () => {
      for (const plan of plans) {
        plan.display?.()
      }
    },
    dryRun: false,
  })
  ```

- ⚠️ Add releaseTitle, packageList and packageCount to the social templates ([99cd9c8](https://github.com/LouisMazel/relizy/commit/99cd9c8))

  The social posts are built from a model of the release (`getReleaseOverview()`), which fixes the posts of the `independent` mode: no more "my-lib 3 packages is out!", nor the project name with the version of its only package.

  - `{{releaseTitle}}`: `<name> <version> is out!` for a single version (`@scope/pkg 5.1.0 is out!` for a single package), `New releases of <project>` for several
  - `{{packageList}}` and `{{packageCount}}`, as in the commit templates
  - `{{newVersion}}` is empty when several versions are released
  - every occurrence of a variable is replaced, not only the first one

  The default `templates.twitterMessage` uses `{{releaseTitle}}`, same text for a single version:

  ```ts
  export default defineConfig({
    templates: {
      twitterMessage: '📣 {{releaseTitle}}\n\n{{changelog}}\n\n{{releaseUrl}}\n{{changelogUrl}}',
    },
  })
  ```

  `formatTweetMessage()`, `postReleaseToTwitter()`, `formatSlackMessage()` and `postReleaseToSlack()` take the `variables` of the template instead of `projectName`, `version`, `releaseUrl` and `changelogUrl`:

  ```ts
  const variables = getSocialTemplateVariables({ overview: getReleaseOverview({ config, bumpResult }), releaseUrl })

  formatTweetMessage({ template, changelog, postMaxLength: 280, variables })
  ```

- ⚠️ Post a release of several versions once per platform, by group ([6e30ca4](https://github.com/LouisMazel/relizy/commit/6e30ca4))

  With `monorepo.groups`, a release is announced as one release: one post per platform instead of one per group, one AI call per platform instead of one per group and platform, and the `social`, `twitter` and `slack` hooks run once. Same for several packages released in `independent` mode.

  - the post is titled `New releases of <project>`, then a section per group (its `title`), the `unified`/`selective` group first
  - Twitter: filled by priority within `postMaxLength`, every group keeps its version line (an `independent` group collapses to `Tooling: 3 packages` when needed)
  - Slack: a section per group, the budget of the message shared between them, the contributors once
  - `onlyStable` leaves the prereleases out of the post instead of posting all the versions or none

  ```text
  📣 New releases of maz-ui

  maz-ui 5.2.1
  • mcp: label the bundled docs with their maz-ui version

  Tooling
  • @maz-ui/eslint-config 5.1.0: stop enforcing the pnpm catalog
  • @maz-ui/upgrade 5.2.1
  ```

- List the packages of each version group in its own table in the PR comment ([3190f36](https://github.com/LouisMazel/relizy/commit/3190f36))

  With several version groups released, the PR comment has one table per group, titled with its `title`, its version and its version mode, the `unified`/`selective` group first:

  ```text
  ### maz-ui `5.2.1` (selective)
  | `@maz-ui/mcp` | `5.2.0` → `5.2.1` |

  ### Tooling (independent)
  | `@maz-ui/eslint-config` | `5.0.0` → `5.1.0` |
  ```

- Give the release to the hooks of the steps after the bump ([b06146b](https://github.com/LouisMazel/relizy/commit/b06146b))

  The function hooks of the steps after the bump get a third parameter when the release is known (in `relizy release`, ...

  ```ts
  export default defineConfig({
    hooks: {
      'success:release': (config, dryRun, context) => {
        for (const group of context?.release.groups ?? []) {
          console.log(group.title, group.version)
        }
      },
    },
  })
  ```

- Check the migration from relizy 1 with the MCP server ([8c734b3](https://github.com/LouisMazel/relizy/commit/8c734b3))

  The `check_migration` tool lists what to change in the project to upgrade from relizy 1, with the file and line of each place, the fix and the section of the migration guide: the relizy dependency, the social templates, the version groups (titles, hooks, AI provider releases) and the code calling the relizy API. The `migrate-to-v2` prompt drives the whole migration.

  ```ts
  check_migration({ config: 'relizy' })
  ```

- List the values of the union types in get_config_option ([bfc1d4a](https://github.com/LouisMazel/relizy/commit/bfc1d4a))

  `get_config_option` lists the values an option accepts when its type hides them behind an alias, so the agents no longer need the docs to know them. `bump.type` and `logLevel` are typed with `BumpReleaseType` and `RelizyLogLevel`, the same types as the ones of semver and `@maz-ui/node`, declared by relizy.

  ```text
  # `monorepo.versionMode`

  - **Type:** `VersionMode`
  - **Values:** `"unified"`, `"independent"`, `"selective"`
  ```

- List every commit with preview_release({ full: true }) ([0b0f16b](https://github.com/LouisMazel/relizy/commit/0b0f16b))

  `preview_release` lists the first 10 commits of a version and the first 5 of a package, and says how to list them all: with `full: true`, every commit explaining a bump is listed. A preview longer than a tool result can be is cut with a note.

  ```ts
  preview_release({ full: true })
  ```

- ⚠️ Report the outcome of the release to the CI ([53c44a9](https://github.com/LouisMazel/relizy/commit/53c44a9))

  `relizy release` reports what it did (released, nothing to release or failed, the versions by group, the tags, and the outcome of each step), to run something only when a release happens:

  - in GitHub Actions, the outputs of the step (`released`, `status`, `version`, `tags`, `packages`, `report`) and the summary of the run, without option
  - `release.report.dotenv` (`--report-dotenv`): a dotenv file for the `artifacts:reports:dotenv` of GitLab CI (`RELIZY_RELEASED`, `RELIZY_VERSION`...)
  - `release.report.json` (`--report-json`): the whole report as JSON
  - `release()` returns it, and `formatReleaseReportText()` replaces `buildReleaseSummary()`

  ```yaml
  - id: release
    run: pnpm relizy release --yes
  - if: steps.release.outputs.released == 'true'
    run: ./scripts/notify-teams.sh
  ```

- ⚠️ Show each command step by step, with previews and a summary of the release ([dbc523b](https://github.com/LouisMazel/relizy/commit/dbc523b))

  Every command shows one line per step, with its duration and what it did, the details only with `--log-level verbose`. In CI, each step is a collapsible group of GitHub Actions or GitLab CI. `RELIZY_REPORTER=classic` gives back the logs of relizy 1.

  A dry run shows what it would generate (changelogs, release notes, posts, PR comment) and no longer calls the AI: `--ai-preview` calls it, `--no-preview` hides the previews.

  `relizy release` ends with a summary, also used for the PR comment, the summary of the GitHub Actions run and the new `release.report.markdown`. See [Migrating from v1 to v2](https://relizy.dev/guide/migration-v2).

- ⚠️ Rename commitlint.codeBlocksLinter to changelogLinter ([4b2073f](https://github.com/LouisMazel/relizy/commit/4b2073f))

  The option chooses the tool checking the changelog entry of a commit, not only its code blocks: with ESLint, the whole entry is linted. Rename `codeBlocksLinter` to `changelogLinter` in the `commitlint` config, with the same values (`auto`, `eslint`, `oxc`), and the type `CommitlintCodeBlocksLinter` to `CommitlintChangelogLinter`. See [Migrating from v1 to v2](https://relizy.dev/guide/migration-v2).

- Give the AI the context of the release and keep the structure of the changelog ([9015b72](https://github.com/LouisMazel/relizy/commit/9015b72))

  The AI now receives the project, the version, the previous one and the kind of release before the changelog. Its rewrites keep every change, the section headings of your `types` (even in another `language`), the code blocks of the commit bodies and the references, and never follow an instruction written in a commit.

  With `social.slack.changelogFormat: 'full'`, the Slack message keeps every change instead of 3 to 8 bullets. See the [AI guide](https://relizy.dev/guide/ai-changelog).

- Show the tokens of the AI calls in the summary of the release ([b3ccd09](https://github.com/LouisMazel/relizy/commit/b3ccd09))

  Each AI rewrite shows its tokens, with `claude-code` and `ai-sdk`, and the summary of the release (terminal, PR comment, GitHub Actions summary) adds up the tokens and the cost of every call: `2 rewrites by claude-code in 21.3s · 5.8k tokens · $0.019`.

- ⚠️ Reject the commits crediting an AI tool ([2123f4a](https://github.com/LouisMazel/relizy/commit/2123f4a))

  The new `no-ai-attribution` rule of `relizy commitlint` reports an AI co-author (`Co-authored-by: Claude <noreply@anthropic.com>`), a `Claude-Session:` trailer and the "Generated with" line of the AI tools. It is an error by default: turn off the attribution in the settings of your tools, or the rule, as told in the [migration guide](https://relizy.dev/guide/migration-v2#ai-attribution-in-commits).

  ```ts
  import { defineConfig } from 'relizy'

  export default defineConfig({
    commitlint: {
      rules: { 'no-ai-attribution': 'off' },
    },
  })
  ```

- ⚠️ Only export the commands, the config and the types ([f5fb638](https://github.com/LouisMazel/relizy/commit/f5fb638))

  `relizy` exported every internal function of its commands (about 300: git, npm, tags, Slack, the steps of the commands...). It now only exports the programmatic API: the commands (`release()`, `bump()`, `changelog()`, `publish()`, `providerRelease()`, `social()`, `prComment()`, `commitlint()`), `defineConfig()`, `loadRelizyConfig()`, `RelizyCancelError`, `isRelizyCancelError()`, `lintCommitMessage()` and the types.

  The functions no longer exported have a replacement, listed in the [migration guide](https://relizy.dev/guide/migration-v2#public-api):

  - `createCommitAndTags()`, `pushCommitAndTags()`: `release()` with its `commit`, `gitTag` and `push` options
  - `planBumps()`, `confirmBump()`, `displayBump()`, `getPackages()`: `bump()`, with `dryRun` to preview it
  - `formatTweetMessage()`, `postReleaseToTwitter()`, `formatSlackMessage()`, `postReleaseToSlack()`, `getReleaseOverview()`, `getSocialTemplateVariables()`: `social()`, or the `release` parameter of a hook
  - `buildReleaseSummary()`, `formatReleaseReportText()`, `formatReleaseReportMarkdown()`: the report returned by `release()`
  - `generateChangelog()`, `generateMarkDown()`: `changelog()`
  - `getDefaultConfig()`, `mergeTypes()`: `loadRelizyConfig()`, which returns the config with its defaults
  - `isPrerelease()`: `prerelease()` of semver
  - `init()`: `relizy init`

  ```ts
  // v1
  const types = Object.keys(mergeTypes(relizyConfig.types, getDefaultConfig().types))

  // v2
  const config = await loadRelizyConfig()
  const types = Object.keys(config.types)
  ```

  The `check_migration` tool of the MCP server lists the imports to change.

- Prepare the git clone of the CI job for the release ([aa78eeb](https://github.com/LouisMazel/relizy/commit/aa78eeb))

  In CI, Relizy fetches the history of a shallow clone, checks out the branch of a detached HEAD, and makes the release commit and tags as the person who started the release, with their noreply email, when the job sets no git identity.

  Before publishing, it checks that the release can be pushed and fails with the fix otherwise. On GitLab, it pushes with `GITLAB_TOKEN` when the job token cannot. See [CI/CD](https://relizy.dev/guide/ci-cd#what-relizy-handles-in-ci).

- Generate the release workflow of the CI with relizy init ([1bb3686](https://github.com/LouisMazel/relizy/commit/1bb3686))

  On GitHub or GitLab, `relizy init` writes the release workflow (`.github/workflows/release.yml`, or the `release` job of `.gitlab-ci.yml`): run on demand with the release type, or at each push, with the permissions, the secrets of your config and the outputs of the release. Skip it with `--no-workflow`, see [relizy init](https://relizy.dev/cli/init#release-workflow).

- ⚠️ Rename monorepo.includePrivates to privatePackages ([26b4711](https://github.com/LouisMazel/relizy/commit/26b4711))

  The option says what relizy does with the private packages of the
  workspace, with named values: `ignore` (default) or `release` (released as
  the other packages, never published). The flag and the options of the
  commands follow:

  ```ts
  export default defineConfig({
    monorepo: {
      // includePrivates: true,
      privatePackages: 'release',
    },
  })
  ```

  ```bash
  relizy release --private-packages release
  ```

  `check_migration` points out `includePrivates` in the config.

- ⚠️ Remove monorepo.ignorePackageNames, replaced by monorepo.ignored ([798faeb](https://github.com/LouisMazel/relizy/commit/798faeb))

  `monorepo.ignorePackageNames`, deprecated, is removed: list the directories of these packages in `monorepo.ignored`, path globs matched as `monorepo.packages`. A config that still sets it fails to load with the fix, rather than releasing the packages it left out, and `check_migration` points it out first.

  ```ts
  export default defineConfig({
    monorepo: {
      packages: ['packages/*'],
      // ignorePackageNames: ['@scope/legacy'],
      ignored: ['packages/legacy'],
    },
  })
  ```

- ⚠️ Remove publish.token, replaced by tokens.registry ([1e8eb42](https://github.com/LouisMazel/relizy/commit/1e8eb42))

  `publish.token` read the same environment variables as `tokens.registry` (`RELIZY_NPM_TOKEN`, `NPM_TOKEN`, `NODE_AUTH_TOKEN`). Set the registry token in `tokens.registry`, or per registry in `publish.registries[].token`. `--publish-token` and the `token` option of `publish()` now set `tokens.registry`, and `token` of `ReleaseOptions` is only the git token.

  ```ts
  export default defineConfig({
    // publish: { token: process.env.MY_NPM_TOKEN },
    tokens: { registry: process.env.MY_NPM_TOKEN },
  })
  ```

- ⚠️ Remove repo.token, replaced by tokens.github and tokens.gitlab ([6d6c280](https://github.com/LouisMazel/relizy/commit/6d6c280))

  `repo.token` was a fallback of `tokens.github` and `tokens.gitlab`, which read `GITHUB_TOKEN`, `GH_TOKEN`, `GITLAB_TOKEN`... by default and are set by `--token`. Set the token of the provider releases and of the PR comment there. A PR comment on Bitbucket now says the provider is not supported, instead of asking for a GitLab token.

  ```ts
  export default defineConfig({
    repo: { provider: 'gitlab', domain: 'gitlab.mycompany.com', repo: 'team/app' },
    tokens: { gitlab: process.env.MY_TOKEN },
  })
  ```

- ⚠️ Remove the relizy/types entry of the package ([ae17dae](https://github.com/LouisMazel/relizy/commit/ae17dae))

  The entry pointed straight at a declaration file, so a runtime import of it failed. Import the types from `relizy`.

  ```ts
  // import type { RelizyConfig } from 'relizy/types'
  import type { RelizyConfig } from 'relizy'
  ```

- ⚠️ Remove the newVersion and publish.packages options, never read ([1d57afc](https://github.com/LouisMazel/relizy/commit/1d57afc))

  relizy never read the root `newVersion` option nor `publish.packages`: remove them from the config. To leave a package out of the release, use `monorepo.ignored`.

- ⚠️ Format the changelogs written with the formatter of the project ([7009491](https://github.com/LouisMazel/relizy/commit/7009491))

  Without `changelog.formatCmd`, the formatter in the dependencies of the root `package.json` (Biome, Prettier, oxfmt, dprint, else ESLint) formats the changelogs written, and only them. If it fails, the release goes on with a warning.

  To choose the command, set `formatCmd`: its files placeholder is replaced by the paths of the changelogs written. `false` (or `--no-format-cmd`) turns the formatting off:

  ```ts
  import { defineConfig } from 'relizy'

  export default defineConfig({
    changelog: { formatCmd: 'eslint --fix {{files}}' },
  })
  ```

- Give the version of each released group and package in the release report ([f6c17e9](https://github.com/LouisMazel/relizy/commit/f6c17e9))

  The report of `relizy release` now has `group_<name>_version` for each released `unified`/`selective` version group and `package_<name>_version` for each released package, only when the release happened (not in dry-run). A CI job can run something for one package without parsing the list of packages:

  ```yaml
  script:
    - '[ -n "$RELIZY_PACKAGE_ACME_UI_VERSION" ] && ./scripts/notify.sh'
  ```

  The dotenv file no longer has `RELIZY_INSTALL`: none of its values has a space, so it can be sourced (`. ./relizy.env`). The install command stays in the GitHub Actions outputs, the JSON report and the summary.

- Publish to npm with trusted publishing (OIDC), without token ([f749167](https://github.com/LouisMazel/relizy/commit/f749167))

  In a GitHub Actions job with the `id-token: write` permission, or a GitLab CI job with the `NPM_ID_TOKEN` id token, relizy publishes to npmjs.org without npm token: npm authenticates the job with OIDC and adds the provenance of the packages. The safety check no longer requires a token there (`npm whoami` does not work with OIDC): it checks that the npm of the job does the OIDC exchange (11.5.1 or later), and warns about the packages that are not on npm yet, which still need a first publish with a token.

  ```yaml
  permissions:
    contents: write
    id-token: write
  ```

  The placeholder token that `actions/setup-node` writes to `NODE_AUTH_TOKEN` is no longer taken for an npm token. Without token nor OIDC in CI, the authentication error tells both ways to publish.

- Generate release workflows ready for npm trusted publishing ([1643a11](https://github.com/LouisMazel/relizy/commit/1643a11))

  When the project publishes to npm, the workflow of `relizy init` gives the job its OIDC token (`id-token: write` on GitHub Actions, the `NPM_ID_TOKEN` id token on GitLab CI) and updates npm to a version doing the OIDC exchange. Once the trusted publisher of the packages is set up on npmjs.com, the `NPM_TOKEN` secret is no longer needed; it stays the fallback, for the first publish of a package. The next steps of `relizy init` link to the guide.

- Give the steps that failed without stopping the release in its outputs ([c895165](https://github.com/LouisMazel/relizy/commit/c895165))

  A failed social post, provider release or PR comment does not stop the release: the `failed_steps` output (`RELIZY_FAILED_STEPS` in the dotenv file) now lists them, comma-separated, so a next step or job can react without reading the JSON report.

- Post the releases to Microsoft Teams ([ee5bbf3](https://github.com/LouisMazel/relizy/commit/ee5bbf3))

  `social.teams` posts Adaptive Cards to a Teams workflow (trigger "When a Teams webhook request is received"), the Office 365 connectors being retired. A card announces a version: a badge, its title and message, its version and date, and the buttons of its release notes, its changelog and the `links`.

  ```ts
  export default defineConfig({
    social: {
      teams: {
        enabled: true,
        cards: 'version', // or 'release': one card with a section per version
        changelog: 'summary', // the commit titles, rewritten with ai.social.teams
        locale: 'fr-FR',
        announcements: [
          { group: 'shared', links: [{ title: '🎨 Storybook', url: 'https://{{shortName}}.acme.dev' }] },
          { package: '@acme/login', title: '🔐 Login {{newVersion}}' },
        ],
        exclude: { packages: ['@acme/*-mock'] },
      },
    },
  })
  ```

  Without `announcements`, every version is announced; with it, only the versions of its groups and packages, a package entry over its group entry. The URL comes from `TEAMS_WEBHOOK_URL`, or its base64 in `TEAMS_WEBHOOK_URL_B64` (a masked GitLab variable refuses its characters).

  A refused card does not stop the release: it is in the logs, the summary and `failed_steps`, with the hooks `before:teams`, `success:teams` and `error:teams`. `relizy init` sets it up, and `check_migration` points out the scripts posting to Teams and the retired connectors.

- Choose the versions announced on Slack and Twitter ([cd1973a](https://github.com/LouisMazel/relizy/commit/cd1973a))

  `social.slack.announcements` takes the entries of `social.teams.announcements`: without it, every version is announced and the message is unchanged; with it, only the versions matching a `{ group }` or `{ package }` entry. The `title` of an entry replaces the name of its version, its `message` and its links (release notes, changelog, `links`) are shown under it, as the buttons for a single version. `exclude` leaves groups and packages out of Slack, and of Twitter.

  ```ts
  export default defineConfig({
    social: {
      slack: {
        enabled: true,
        announcements: [
          { group: 'ecosystem', title: 'Design System', message: 'Update `@acme/ui` to get it.', links: [{ title: '📚 Docs', url: 'https://design.acme.dev' }] },
          { package: '@acme/login', title: 'Login' },
        ],
        exclude: { packages: ['@acme/*-mock'] },
      },
      twitter: { enabled: true, exclude: { groups: ['internal'] } },
    },
  })
  ```

  `check_migration` points to these options for a script posting to Slack.

- ⚠️ Name the changelog of Slack and Teams posts changelog ([1fb6dc2](https://github.com/LouisMazel/relizy/commit/1fb6dc2))

  `social.slack.changelog` and `social.teams.changelog` take the same values: `full` (the commit bodies included), `summary` (the commit titles) or `none` (or `false`, no changelog). Slack gains `none`, Teams gains `full`: the changelogs of a card share what its other texts leave of its 28 KB, each one cut between two changes with an `… and N more changes` line, instead of refusing the card.

  ```ts
  export default defineConfig({
    social: {
      slack: { enabled: true, changelog: 'full' },
      teams: { enabled: true, changelog: 'summary' },
    },
  })
  ```

  BREAKING CHANGE: `social.slack.changelogFormat` is renamed `social.slack.changelog`, with the same values; relizy 2 ignores `changelogFormat`. `check_migration` finds it.

- Release from the relizy GitHub Action and GitLab CI component ([18e640d](https://github.com/LouisMazel/relizy/commit/18e640d))

  `relizy/action@v2` sets up Node.js and your package manager, installs your dependencies, runs `relizy release` with your tokens and gives its outputs to the next steps. On gitlab.com, the `release` component of the CI/CD catalog (`gitlab.com/relizy/relizy/release@2`) does the same, and `relizy init` now writes them. See [GitHub Actions](https://relizy.dev/guide/github-actions#the-relizy-action) and [GitLab CI](https://relizy.dev/guide/gitlab-ci#the-relizy-component).

  ```yaml
  - id: release
    uses: relizy/action@v2
    with:
      npm-token: ${{ secrets.NPM_TOKEN }}
  ```

- Keep an existing config in relizy init and set up the rest ([8a32fcb](https://github.com/LouisMazel/relizy/commit/8a32fcb))

  When a config already exists, `relizy init` now offers to keep it and set up the rest: the `commit-msg` hook, the `release` script, the AI agents and the release workflow, whose secrets follow the kept config. Without questions (`--yes`, CI), the config is kept, `--force` still replaces it.

### 🔥 Performance

- Read each git ref and range once per release ([853dbef](https://github.com/LouisMazel/relizy/commit/853dbef))

  The branch, the tags and the commits of a range were read again for each package and each step of a release. They are now read once per command run (and per MCP tool call), and read again after each git write of relizy (commit, tag, fetch, checkout) and after the hooks, the format and the build commands.

  A dry-run release of the maz-ui monorepo (11 packages, version groups) spawns 78 git processes instead of 207, and takes 7s instead of 15s.

### 🩹 Fixes

- Apply the safetyCheck option in social() ([c91ed9a](https://github.com/LouisMazel/relizy/commit/c91ed9a))

  `social()` ignored `safetyCheck`, so `release` checked the social config (and the AI provider) twice, and `social({ safetyCheck: false })` still ran the check.

- Count the length of the tweets as X does ([d9f9a2c](https://github.com/LouisMazel/relizy/commit/d9f9a2c))

  Every URL counts 23 characters (X shortens them to t.co links), an emoji or a CJK character counts 2. The long release and changelog URLs no longer eat the changelog of the tweet, and a tweet with CJK text no longer exceeds the limit.

- ⚠️ Replace the arrays of the config instead of concatenating them ([f2aca2a](https://github.com/LouisMazel/relizy/commit/f2aca2a))

  An array of the config replaces the default one, and the array of the config file when it comes from the CLI or the programmatic API. Before, `bump.dependencyTypes: ['dependencies', 'peerDependencies']` resolved to `['dependencies', 'peerDependencies', 'dependencies']`, `--dependency-types devDependencies` could only add to the list of the config, and `relizy release` passed every `publish.args` twice.

  A `bump.dependencyTypes` without `dependencies` no longer bumps the packages on every bump of their `dependencies`: add it to keep them.

  ```ts
  export default defineConfig({
    bump: {
      dependencyTypes: ['dependencies', 'peerDependencies'],
    },
  })
  ```

- Mask the secrets without revealing their first characters ([46813e0](https://github.com/LouisMazel/relizy/commit/46813e0))

  A masked secret keeps its known prefix and its last 4 characters, instead of its first and last 4 characters: the first characters of a secret without fixed prefix (Twitter keys, OAuth tokens) no longer end up in the debug logs nor in the context of the AI agents. A secret URL keeps its origin only.

  ```text
  npm_***2Hwk
  ***wYv3
  https://hooks.slack.com/***
  ```

- ⚠️ Exit with code 0 when there is nothing to bump ([8c11e3f](https://github.com/LouisMazel/relizy/commit/8c11e3f))

  `relizy bump` exits with code 0 when no commit triggers a bump, as `relizy release` does, instead of 1: a CI job running it no longer fails for nothing. To run something only when a release happens, use a `success:release` hook.

- Only warn about the uncommitted changes of the files a release commits ([b7d53da](https://github.com/LouisMazel/relizy/commit/b7d53da))

  With `--no-clean`, the uncommitted changes are kept as they are, so they no longer print a warning with the raw `git status`: only the changes of the files a release writes and commits (`package.json`, `CHANGELOG.md`, `lerna.json`) are worth one, and their confirmation. The other files are listed with `--log-level debug`.

  ```text
  Uncommitted changes in files the release commits: packages/core/package.json (modified)
  ```

- Tell which files are uncommitted when the release needs a clean working directory ([628c29d](https://github.com/LouisMazel/relizy/commit/628c29d))

  The error lists the uncommitted files with what changed, instead of the raw `git status`, and says how to go on.

  ```text
  Uncommitted changes: plans/v2.md (modified), src/new.ts (new)
  Commit or stash them first, or keep them with --no-clean.
  ```

- Remove the npm token from .npmrc when a publish is interrupted ([1c3a004](https://github.com/LouisMazel/relizy/commit/1c3a004))

  The token written to `.npmrc` for a publish, its dry-run too, stayed on disk when the run was stopped (Ctrl+C, kill, closed terminal): the `.npmrc` is now removed, or restored as it was.

- Hide the git trailers of the commit bodies in the changelogs ([6058672](https://github.com/LouisMazel/relizy/commit/6058672))

  The changelog entries no longer show the trailers ending a commit body (`Co-authored-by:`, `Signed-off-by:`, `Claude-Session:`, `Closes #12`...) nor the "Generated with" line of the AI tools. The breaking change footer is kept, as it tells how to migrate.

- Stop crediting the AI tools as contributors in the changelogs ([4eff863](https://github.com/LouisMazel/relizy/commit/4eff863))

  A co-author such as `Claude <noreply@anthropic.com>` or the Cursor agent is no longer listed in the contributors, as the bots already were. The people are still credited, even when named like a tool.

- Fail a release in CI without --yes instead of exiting with code 0 ([3c1be07](https://github.com/LouisMazel/relizy/commit/3c1be07))

  Without an interactive terminal, the confirmation of the new versions was taken as cancelled: the CI job succeeded without releasing anything. `relizy release` and `relizy bump` now fail right away with the exit code 1 and the fix: run them with `--yes`.

- Correct the defaults of the release options in the config reference ([7c8187b](https://github.com/LouisMazel/relizy/commit/7c8187b))

  `release.noVerify`, `clean`, `social` and `prComment` documented the opposite
  of their real default, in the typedoc and in `get_config_option` of the MCP
  server. A test now checks every `@default` against the default config.

- Name the options of loadRelizyConfig in the API docs ([0f6f630](https://github.com/LouisMazel/relizy/commit/0f6f630))

  The typedoc page of `loadRelizyConfig()` expanded the whole config inline
  (1 800 lines). Its options are now named types, exported for the callers:

  ```ts
  import type { LoadRelizyConfigOptions, RelizyConfigOverrides } from 'relizy'
  ```

  The README is no longer copied as the index of the typedoc.

- ⚠️ Remove the publish.private option ([acb3416](https://github.com/LouisMazel/relizy/commit/acb3416))

  relizy never read it: the private packages are never published. A config
  setting it no longer type-checks, `check_migration` points it out:

  ```ts
  export default defineConfig({
    // publish: { private: false }, removed
    monorepo: { privatePackages: 'release' }, // to version the private packages
  })
  ```

- Release a private app without workspace packages ([232b42a](https://github.com/LouisMazel/relizy/commit/232b42a))

  A project with a single `package.json` marked `"private": true` (an app,
  an API) released nothing: its root package was skipped as a private
  package. It is now bumped, tagged and released as a library, never
  published, and the safety check no longer asks for a registry token when
  no package can be published.

- Run the git and package manager checks in the project directory ([9ea2e38](https://github.com/LouisMazel/relizy/commit/9ea2e38))

  The uncommitted changes check, the staging of the release files, the detection of the git provider, of Yarn Berry and of the default package manager now run in the `cwd` of the config, instead of the current directory of the process. A release run from the programmatic API with another `cwd` checked and staged the files of the wrong directory.

- Pass the commit and tag messages to git without shell ([c35b9d8](https://github.com/LouisMazel/relizy/commit/c35b9d8))

  The release commit, its tags and the staging of its files run git with their arguments as they are, instead of a shell command. A `$`, a backtick or a quote in `templates.commitMessage`, `commitBody` or `tagMessage` was run or broke the command, and a tag message was not escaped at all.

- Skip the safety check of relizy publish with --no-safety-check ([25aa365](https://github.com/LouisMazel/relizy/commit/25aa365))

  `relizy publish` ignored the global `--no-safety-check` flag and still checked the authentication to the registry. `relizy release`, `provider-release` and `social` already applied it.

- Apply the logLevel of the config without --log-level ([6dd9f31](https://github.com/LouisMazel/relizy/commit/6dd9f31))

  The `--log-level` flag defaulted to `default` and always replaced the `logLevel` of the config, even when it was not passed. The flag now only applies when it is given.

- Apply bump.clean during relizy release ([6e82878](https://github.com/LouisMazel/relizy/commit/6e82878))

  `relizy release` replaced `bump.clean` with `release.clean`, so a release still failed on uncommitted changes with `bump: { clean: false }` in the config. The uncommitted changes are checked when both are enabled, as `relizy bump` does, and `--no-clean` still turns off both.

- List the steps of the release in their order in preview_release ([880ada2](https://github.com/LouisMazel/relizy/commit/880ada2))

  The `preview_release` tool of the MCP server listed the commit, the tags and the push before the publication, while `relizy release` publishes first, and listed the tags and the push without the release commit, which they need.

- Preview the root changelog of an independent release in preview_changelog ([cd594d3](https://github.com/LouisMazel/relizy/commit/cd594d3))

  The `preview_changelog` tool of the MCP server left out the root changelog that `relizy changelog` writes in `independent` mode (the changelogs of the released packages, with `changelog.rootChangelog`). Both now build it the same way.

- Authenticate the GitHub releases with repo.token ([3d4b2b5](https://github.com/LouisMazel/relizy/commit/3d4b2b5))

  A GitHub release with `repo.token` and without `tokens.github` passed the token check but was sent to the GitHub API without authentication. The token now falls back to `repo.token`, as for GitLab and the PR comment.

- Link to the current pages of the docs ([84d2ad5](https://github.com/LouisMazel/relizy/commit/84d2ad5))

  The error of a provider release without token links to the tokens of the config (`config/overview#tokens`), and the `get_doc` tool of the MCP server names the `guide/prereleases` page, instead of pages removed from the docs.

- Pass publish.args to the publish command ([37942a5](https://github.com/LouisMazel/relizy/commit/37942a5))

  `publish.args` was declared but never read: its arguments are now added to the publish command of every package and registry, after the ones of relizy, and left out of the authentication check.

  ```ts
  export default defineConfig({
    publish: {
      args: ['--provenance'],
    },
  })
  ```

- Type publish.args of the resolved config as strings ([af2518a](https://github.com/LouisMazel/relizy/commit/af2518a))

  Its default, an empty array, typed it as `never[]` in the config returned by `loadRelizyConfig()`.

- Read the provider of a self-hosted repository from its host ([f95ea81](https://github.com/LouisMazel/relizy/commit/f95ea81))

  The repository of a GitHub Enterprise or self-hosted GitLab host (`git@gitlab.example.com:team/app.git`, `https://github.mycompany.com/team/app`) gets the provider its host names, as the detection of the git provider does, and keeps its host as domain. The provider was the host itself (`gitlab.example.com`) for an ssh URL, and undefined for an https one: the references of the changelogs had no links and `relizy release` could not create the provider releases. An unknown host gives no provider.

- Use repo.provider in relizy provider-release ([afe4189](https://github.com/LouisMazel/relizy/commit/afe4189))

  `relizy provider-release` ignored the `repo.provider` of the config and only detected the provider from the `origin` remote, unlike `relizy release` and its safety check.

- Apply the config options given to bump(), changelog(), publish() and release() ([2be2f56](https://github.com/LouisMazel/relizy/commit/2be2f56))

  Their options types declared every option of their config section, but some were ignored: `capZeroMajor` and `outOfRangePeers` of `bump()`, `includeCommitBody` of `changelog()`, `args`, `packageManager` and `safetyCheckTimeout` of `publish()`, and all of them plus `dependencyTypes` and `checkWorkspaceDependencies` for `release()`. They now override the config, as the other options do.

  ```ts
  await release({ capZeroMajor: false, includeCommitBody: true, args: ['--provenance'] })
  ```

- Exit with code 1 when relizy provider-release or relizy social fails ([706585e](https://github.com/LouisMazel/relizy/commit/706585e))

  Both commands showed the failure of a provider release or of a post, then exited with code `0`, so a CI job running them never failed. They now exit with code `1`, after the other posts. In `relizy release`, a failed provider release or post still does not stop the release.

- Check out the branch of a GitHub pull request in its CI job ([61bfcb4](https://github.com/LouisMazel/relizy/commit/61bfcb4))

  On a `pull_request` event, relizy put the detached HEAD on a branch named after `GITHUB_REF_NAME`, `<number>/merge`, so it could not detect the pull request of the branch. It now uses the branch of the pull request (`GITHUB_HEAD_REF`).

- Authenticate the GitLab releases with the job token of the CI job ([815ded5](https://github.com/LouisMazel/relizy/commit/815ded5))

  `tokens.gitlab` falls back to `CI_JOB_TOKEN`, but relizy sent it as a personal access token (`PRIVATE-TOKEN`), so GitLab refused the release. The job token is now sent in the `JOB-TOKEN` header. It cannot comment merge requests: instead of a failed request, the MR comment tells to set `GITLAB_TOKEN`.

- Create the provider releases of relizy release --provider on that provider ([50316d1](https://github.com/LouisMazel/relizy/commit/50316d1))

  `--provider` only applied to the safety check of `relizy release`: the provider releases used `repo.provider`, or the provider detected from the remote. They now use the given provider.

- Check the registry access of relizy publish whatever release.publish ([d13954d](https://github.com/LouisMazel/relizy/commit/d13954d))

  The safety check of the publication was skipped as soon as `release.publish` was `false`, also when running `relizy publish` alone, which then published without checking the access to the registries first. Only `relizy release` skips it, when it does not publish.

- Replace every occurrence of the variables of changelogTitle and tagBody ([a2ea161](https://github.com/LouisMazel/relizy/commit/a2ea161))

  `templates.changelogTitle` and `templates.tagBody` only replaced the first occurrence of a variable, unlike the other templates. A `tagBody` repeating `{{newVersion}}` also gave a tag name to the release commit and another one to the changelog and the provider release: they now render it the same way.

- Apply bump.capZeroMajor to the canary versions ([0e2c1a8](https://github.com/LouisMazel/relizy/commit/0e2c1a8))

  A canary computed its version without `bump.capZeroMajor`: a breaking change of `0.5.2` gave `1.0.0-0.canary-<sha>` while the release gives `0.6.0`, and a breaking change of a peer dependency always gave a major. The canary versions now follow the release.

- Restore the canary versions of relizy release --canary --no-publish ([53f7229](https://github.com/LouisMazel/relizy/commit/53f7229))

  The canary versions were restored after their publish only: without it, they stayed in the `package.json` files. A canary is never committed, so they are now restored either way. `relizy bump --canary` still leaves them, to publish them yourself.

- Reject a commitlint tuple without the number of its rule ([87f5800](https://github.com/LouisMazel/relizy/commit/87f5800))

  `'header-max-length': [2, 'always']` set the length to `'always'`, so the rule never reported anything. relizy commitlint now fails with the expected form, `[2, 'always', 200]` or `['error', 200]`.

- Comment the merged pull request of a release run after the merge ([8cf5dbf](https://github.com/LouisMazel/relizy/commit/8cf5dbf))

  The PR comment only looked for an open pull request of the current branch, so a release run on the push to `main` after a merge never found the pull request it merged. Without an open one, the pull request of the commit the release started from is now commented, on GitHub and GitLab, from a detached HEAD too. `ReleaseContext` gets this commit in `sha`.

- Install corepack in the GitLab CI job generated by relizy init ([f2d76ea](https://github.com/LouisMazel/relizy/commit/f2d76ea))

  Node 25+ no longer ships corepack, so `corepack enable` failed on the `node:lts` image (Node 26). The generated job now installs it first, `npm install -g corepack && corepack enable`, which keeps the version of pnpm or yarn pinned by the `packageManager` field.

- Post the changelog of a Slack template in mrkdwn ([9f0a11d](https://github.com/LouisMazel/relizy/commit/9f0a11d))

  With `social.slack.template` and the `summary` format, `{{changelog}}` was a summary cut by sentences, in markdown: the bold scopes and the links arrived as `**scope:**` and `[text](url)`. It is now converted to mrkdwn as without template, within what the template leaves of the block.

- Summarize the changelog of a post without AI by its lines ([a5fec87](https://github.com/LouisMazel/relizy/commit/a5fec87))

  The summary of a tweet without AI was cut by sentences: a commit ending with a period was merged with the next one, and a period was added at the end. It now keeps the first commits that fit, one per line, as they are.

- Remove the line of a URL not set from a social post ([4acda96](https://github.com/LouisMazel/relizy/commit/4acda96))

  A social template line holding only `{{releaseUrl}}` or `{{changelogUrl}}` left an empty line when the URL was not set: the default tweet of an `independent` release, without release URL, had two blank lines before the changelog link. The line is now removed.

- List each package once in a Slack post of several versions ([be2b788](https://github.com/LouisMazel/relizy/commit/be2b788))

  The Slack post of a release of several versions, without template, listed the packages of an `independent` group in their section, then again in the "📦 Packages" block. The block now only lists the packages the sections do not, such as the packages of a `selective` group.

- Return false from a dry-run PR comment without pull request ([518e880](https://github.com/LouisMazel/relizy/commit/518e880))

  `prComment({ dryRun: true })` returned `true` even when no pull request was detected, and `relizy pr-comment --dry-run` then said it would comment. It shows the preview and returns `false`.

- Hide the git error of a repository without origin remote ([9320043](https://github.com/LouisMazel/relizy/commit/9320043))

  Resolving the repository of a project without `origin` remote printed `error: No such remote 'origin'` on stderr, at each `relizy commitlint` for example. The lookup is now silent, as the other git reads of relizy.

- Correct the JSDoc of the options and the help of --publish-token ([48364b1](https://github.com/LouisMazel/relizy/commit/48364b1))

  The `safetyCheck` options said "Skip safety check" while `true` runs the checks, the tokens listed their environment variables out of their reading order (`RELIZY_*` is read first), `publish.registries[].packageFilter` named a removed option, and `--publish-token` said only npm and pnpm while bun is supported too. The JSDoc feeds the API reference and the `get_config_option` tool of the MCP server. The long dashes of the code, the logs and the JSDoc are now simple dashes.

- Name the commitlint pages of the docs in the get_doc tool ([25c2ff1](https://github.com/LouisMazel/relizy/commit/25c2ff1))

  The description of the `get_doc` tool of the MCP server listed `commitlint` among the CLI pages, while its page is `commitlint/cli`. The tests now check the pages it names, and that every `relizy.dev` link of the code reaches an existing page and heading.

- Publish only to the declared registries without publish.registry ([a7c9c3f](https://github.com/LouisMazel/relizy/commit/a7c9c3f))

  With `publish.registries` and without `publish.registry`, the registry of the npm config (`.npmrc`) was always added as the default registry, so every package was also published there. The packages now only go to the declared registries, and a package that no entry covers to the registry of the npm config.

  ```ts
  export default defineConfig({
    publish: {
      // @acme/* only goes to GitHub Packages, the other packages to the .npmrc registry
      registries: [{ registry: 'https://npm.pkg.github.com/', packageFilter: ['@acme/*'] }],
    },
  })
  ```

- Show the dry-run badge in the light theme of the CI logs ([92d4493](https://github.com/LouisMazel/relizy/commit/92d4493))

  The yellow background of the `DRY RUN` badge turned dark brown in the light theme of the GitHub logs, hiding its black text. In CI, the badge now has fixed colors, a gold background and a black text, readable in the light and dark themes of GitHub and GitLab.

- Only warn about the push in the dry run of a pull request ([45f8a9e](https://github.com/LouisMazel/relizy/commit/45f8a9e))

  The dry run of a pull request (`pull_request` on GitHub Actions, a merge request pipeline on GitLab CI) failed because its token is read-only, while the release never runs there: it now warns that the release job checks the push. Every other dry run still fails when the release cannot be pushed.

  The error of a refused push now tells how to fix it where it runs: the `permissions` to give to a GitHub Actions workflow, the `GITLAB_TOKEN` variable of GitLab CI, or the git credentials outside of a CI.

- Check the registries of every publishable package before a release ([a210b06](https://github.com/LouisMazel/relizy/commit/a210b06))

  With `publish.registries` and without `publish.registry`, a package that no entry covers is published to the registry of the npm config, but `relizy release` did not check the access to this registry before publishing: the release could publish some packages, then fail on the others. The registries the publishable packages need are now all checked before the bump.

- Quote the branch of a pull request in the git commands ([d3a3f91](https://github.com/LouisMazel/relizy/commit/d3a3f91))

  The branch of a GitHub pull request, named by its author, reached `git log` and `git config` through a shell: a branch name such as `feat/a$(cmd)`, valid for git, ran its command during the release of the pull request. The values that are not plain refs are now quoted.

- Report a release whose checks fail ([0e1b584](https://github.com/LouisMazel/relizy/commit/0e1b584))

  When a check of `relizy release` failed (a token, the registry, the push access, `--yes` missing in CI), the release stopped without its report, its PR comment nor its `error:release` hook. A failed check now writes the failed report, comments the pull request and runs `error:release`, as any other error of the release.

- Ignore the release commits of the version groups in relizy commitlint ([ff0b75e](https://github.com/LouisMazel/relizy/commit/ff0b75e))

  With `monorepo.groups` and without `templates.commitMessage`, the release commits (`chore(release): bump version to 2.0.0`, `chore(release): bump 3 packages`) were linted like any commit. They are ignored, as in a project without version groups.

- Read the scopes of the version groups in relizy commitlint ([b86a08a](https://github.com/LouisMazel/relizy/commit/b86a08a))

  The packages of `monorepo.groups` are valid scopes of the commits, as the packages of `monorepo.packages`.

- Run generate:changelog once per package in independent mode ([54d235f](https://github.com/LouisMazel/relizy/commit/54d235f))

  With `changelog.rootChangelog`, the changelog of each package was generated twice in `independent` mode, for its file and for the root changelog: a `generate:changelog` hook (an AI rewrite) ran twice, and the two texts could differ. Each changelog is generated once, and the root changelog gathers them.

- Align check_migration with the migration guide ([783a928](https://github.com/LouisMazel/relizy/commit/783a928))

  The `check_migration` tool of the MCP server no longer flags the `dependencyTypes` of a version group, used as is by relizy 1, nor functions relizy 1 never exported. It also finds `includePrivates` in the code, `--include-private` in the scripts, the `relizy release` and `relizy bump` of a CI without `--yes`, and the variables repeated in `templates.changelogTitle` and `templates.tagBody`.

- Only warn when the dry run of a pull request is outdated ([c588a39](https://github.com/LouisMazel/relizy/commit/c588a39))

  The dry run of a pull request no longer fails when new commits were pushed to the pull request after it started: it warns that the run is outdated, as the run of the latest commit previews the release with them. The release, and the dry run outside a pull request or a merge request, still stop on a branch behind its remote.

- Run the error hook of the push and of twitter when their before hook fails ([7de320d](https://github.com/LouisMazel/relizy/commit/7de320d))

  A failing `before:push` or `before:twitter` hook now runs `error:push` or `error:twitter`, like the other steps.

- Refuse a tagBody template that repeats {{newVersion}} ([5ab1026](https://github.com/LouisMazel/relizy/commit/5ab1026))

  relizy reads the version of a repository tag back between the text before and after `{{newVersion}}` in `templates.tagBody`. A template that repeats it, like `v{{newVersion}}-{{newVersion}}`, created tags relizy could not find again: it silently restarted from the first commit. The config now fails to load with a clear error, and `check_migration` points it out first.

- Point out only the removed token lines in check_migration ([d7721ad](https://github.com/LouisMazel/relizy/commit/d7721ad))

  `check_migration` pointed out every `token:` line of the config for `repo.token` and `publish.token`, so also the tokens to keep (`publish.registries[].token`, `social.slack.token`). It now only points out the `token` key of the `repo` or `publish` block, and no line when it cannot tell.

- Check the push access again in each release run of the same process ([6abe906](https://github.com/LouisMazel/relizy/commit/6abe906))

  The push access check and the preparation of the CI repository were cached for the whole process: a program calling `release()` several times reused the first result, a refused push stayed refused after fixing the token or the remote. They are now done once per run, like the git reads.

- Detect the CI the same way for the output and for the checks ([b3c02eb](https://github.com/LouisMazel/relizy/commit/b3c02eb))

  The output of the CLI and the checks of relizy (prompts, CI clone, npm) did not read the same variables: `CI=1` was a CI for the output only, Vercel, Netlify or Jenkins for the checks only. Both now use the same detection, which accepts any value of a CI flag but `false` and `0`.

- Check the push and the branch in the dry run of a GitLab merge request ([54233f6](https://github.com/LouisMazel/relizy/commit/54233f6))

  A merge request pipeline has no `CI_COMMIT_BRANCH`: relizy left its HEAD detached and silently skipped the checks of the push access and of the remote branch, without their warnings. It now checks out the source branch of the merge request (`CI_MERGE_REQUEST_SOURCE_BRANCH_NAME`), like the head branch of a GitHub pull request.

- Leave a blank line between the command typed and the output of the CLI ([ea408d7](https://github.com/LouisMazel/relizy/commit/ea408d7))
- Run the error:social hook when the social step itself fails ([9c41eb4](https://github.com/LouisMazel/relizy/commit/9c41eb4))

  `relizy social` only ran `error:social` when a post failed: an error of the step itself (reading the release, a failing hook) skipped it. It now runs it, like the other steps.

  The commands share their run (config, output, CI clone, error handling and `error:*` hook) in `runCommand()`. `provider-release` and `social` still report their errors in their result, so a release goes on without them.

- Name the GitHub release after its version, not after `--to` ([25bd378](https://github.com/LouisMazel/relizy/commit/25bd378))

  `--to` is the end of the commit range: `relizy release --to <commit>` created a GitHub release named after the commit. The release is now named after the version and `templates.tagBody`, as on GitLab. In unified mode, the version also comes from the root package when there is no bump result.

- Mark a GitHub release as a prerelease from its version ([043feb3](https://github.com/LouisMazel/relizy/commit/043feb3))

  In unified mode, the prerelease flag of the GitHub release was read from the tag: with a custom `templates.tagBody` (`release-{{newVersion}}`), a prerelease was published as the latest stable release. It is now read from the version, as on GitLab and in independent mode.

- Skip the GitHub release of a package without changes ([9db0c84](https://github.com/LouisMazel/relizy/commit/9db0c84))

  In independent mode, a package without commit in its range (released with `--force`) got a GitHub release holding only the empty changelog text. It is now skipped with a warning, as on GitLab.

- List the GitLab releases of a dry run in independent mode ([768876d](https://github.com/LouisMazel/relizy/commit/768876d))

  A dry run on GitLab returned no release in independent mode, so its summary said "No release to create". It now lists the releases it would create, as on GitHub.

- Encode the tag of a package in the release links ([ad5cbc0](https://github.com/LouisMazel/relizy/commit/ad5cbc0))

  The links to the release of a package (`@scope/name@1.0.0`) put its `/` as is in the URL: GitLab answered 404 to `/-/releases/@scope/name@1.0.0`. The tag is now a single segment of the URL, `/-/releases/@scope%2Fname@1.0.0`, on GitHub, GitLab and Bitbucket; the tags without `/` are unchanged.

- Keep every package of a group in the full Slack message ([33164d3](https://github.com/LouisMazel/relizy/commit/33164d3))

  In the `full` format, the budget of the message (blocks, payload, `postMaxLength`) was shared between the groups: the first long package of an `independent` group took the share of its group, and the next packages were left out of the message. The budget is now shared between the versions, so each package keeps at least its version line.

- Ask for any access token when GitLab CI cannot push the release ([7fb644a](https://github.com/LouisMazel/relizy/commit/7fb644a))

  On the Free tier of gitlab.com, project access tokens need Premium: the error of a refused push now asks for an access token with the `write_repository` and `api` scopes, a personal one on the Free tier, or for the push of the job token.

- Frame the release plan, previews and summary like relizy init ([0e3fe69](https://github.com/LouisMazel/relizy/commit/0e3fe69))

### 💅 Refactors

- Read the last tag of the repository from the cached tag list ([c3dff38](https://github.com/LouisMazel/relizy/commit/c3dff38))

  The tag lookups with shell pipes (`git tag | grep | head`) are removed: they only served code paths no package could reach, as every package has a version. The last tag used by `relizy commitlint` and the MCP server comes from the cached list of tags.

- Remove the dead package selection of relizy publish ([60c17a1](https://github.com/LouisMazel/relizy/commit/60c17a1))

  Its fallbacks by version mode only ran without package, so they always published nothing.

- Stop reading the packages of planBumps for a debug log ([9d96fe8](https://github.com/LouisMazel/relizy/commit/9d96fe8))

  The bump read every package of the project only to log their count.

- Remove the unread maxLength of the AI requests ([d8d39ee](https://github.com/LouisMazel/relizy/commit/d8d39ee))

  The length budget reaches the model through its prompt: no provider read the field.

- Remove the unused options of the PR comment of a release ([d94573a](https://github.com/LouisMazel/relizy/commit/d94573a))

  The comment posted by `relizy release` uses its config: the log level and the config name were never read.

- Remove the dead functions and the internal-only exports ([67e23d7](https://github.com/LouisMazel/relizy/commit/67e23d7))

  `parseChangelogMarkdown()`, `parseGitRemoteUrl()` and `extractVersionFromPackageTag()` were never called, and about thirty functions and constants were exported without being imported anywhere else. None of them is part of the public API listed by `src/index.ts`.

- Share the text helpers of the outputs ([fe83e3b](https://github.com/LouisMazel/relizy/commit/fe83e3b))

  The pluralized counts, the durations, the UTC dates, the name of a release and the entries of its summary were written several times across the terminal output, the report, the PR comment, commitlint and the AI: one helper each.

- Iterate the version groups of a release step with getReleaseTargets ([3767f27](https://github.com/LouisMazel/relizy/commit/3767f27))
- Apply the overrides to a resolved config without loading the config file again ([3e952cf](https://github.com/LouisMazel/relizy/commit/3e952cf))

  A command given a resolved config (`release` gives its own to its steps, or `loadRelizyConfig()` in a script) no longer loads the config file and the `.env` file again: the overrides are merged over it, as for the configs of the version groups. A command changing its config still leaves the given one untouched.

- Move the display and the confirmation of a bump to bump-confirm.ts ([52d277c](https://github.com/LouisMazel/relizy/commit/52d277c))
- Split npm.ts into the registries, the published versions and the publication ([c02725d](https://github.com/LouisMazel/relizy/commit/c02725d))
- Split createCommitAndTags into the staging, the commit message and the tags ([66d1b63](https://github.com/LouisMazel/relizy/commit/66d1b63))
- Move the planning of the bumps out of repo.ts to bump-plan.ts ([9a8d4fa](https://github.com/LouisMazel/relizy/commit/9a8d4fa))
- Run git through a single module without shell ([cbb4c26](https://github.com/LouisMazel/relizy/commit/cbb4c26))

  `git-exec.ts` runs git with `execFile`: the arguments are an array, without shell, so a branch, a tag, a path or a commit message is passed as is, without escaping. It replaces the copies of `git()` / `tryGit()` (`ci.ts`, `commitlint/git.ts`, `ci-workflow.ts`, `git.ts`) and the `execSync` / `execPromise` git command strings; `shell.ts` is removed. The stderr of git is captured, in the error when git fails, instead of being written to the terminal.

- Share the flow of the GitHub and GitLab releases ([6810d4c](https://github.com/LouisMazel/relizy/commit/6810d4c))

  `github.ts` and `gitlab.ts` repeated the tags, the notes (changelog, AI), the empty release check, the dry-run preview and the summary, in unified and independent modes. `postProviderReleases()` (`provider-releases.ts`) runs this flow once; a provider is a `ReleaseProvider` adapter that checks its config and creates a release.

### 📖 Documentation

- Add the migration guide from v1 to v2 ([8064cb6](https://github.com/LouisMazel/relizy/commit/8064cb6))

  What changes in Relizy 2 and how to upgrade: the version groups released as one release, the social templates (`{{releaseTitle}}`, `{{newVersion}}` with several versions), the programmatic API (`RelizyCancelError`, `confirmBump`, the social functions). Listed in the "Guide" menu, the version menu and the sidebar.

- Explain how to run something only when a release happens ([4013d48](https://github.com/LouisMazel/relizy/commit/4013d48))
- Redesign the homepage ([39f13ed](https://github.com/LouisMazel/relizy/commit/39f13ed))

  The homepage presents Relizy with an animated terminal playing a release, a dry run and a GitHub Actions run, then the steps of a release and the features, each one linked to its page of the docs.

  The docs follow a maz-ui theme preset with the colors of Relizy, with Tailwind for the custom pages.

- Rewrite the documentation for relizy 2 ([3253dea](https://github.com/LouisMazel/relizy/commit/3253dea))

  One page per topic, checked against the code, from 16 000 to 6 600 lines:
  the guides explain, the config, CLI and API pages are an exact reference
  with every option and flag.

  - `guide/getting-started` absorbs `guide/installation` and starts from
    `relizy init`
  - `guide/prereleases` merges the canary and prerelease guides
  - `guide/social-media` merges the Twitter and Slack guides
  - `config/overview` absorbs `config/multiple-configs` and lists the tokens
  - `commitlint/index` absorbs `commitlint/getting-started`
  - the CI guides follow the workflow generated by `relizy init`
  - new `api/commitlint` page, README rewritten for v2

- List the fixes of relizy 2 in the migration guide ([4ead599](https://github.com/LouisMazel/relizy/commit/4ead599))

  Also drop the claim that relizy release passed publish.args twice: they never reached the publish command.

- Generate llms.txt for the AI assistants ([2263d91](https://github.com/LouisMazel/relizy/commit/2263d91))

  The docs publish llms.txt (the index of the pages with their descriptions), llms-full.txt (the whole docs in one markdown file) and a .md file per page, so the AI assistants read the docs without running the site.

- Name every template in the migration entry of the replaced variables ([cd004a1](https://github.com/LouisMazel/relizy/commit/cd004a1))
- Update the contributing guide ([ec7fd01](https://github.com/LouisMazel/relizy/commit/ec7fd01))

  Node and pnpm versions, the git hooks as they run, the commit types and scopes of the repository, the specs next to the code and the checks of the docs, the no-ai-attribution rule, and how to add an AI provider, moved here from the user docs.

- Complete the fixes and the exit codes of the migration guide ([3931bb3](https://github.com/LouisMazel/relizy/commit/3931bb3))
- Update the illustration of the README ([647e2ed](https://github.com/LouisMazel/relizy/commit/647e2ed))
- Keep the 404 page out of the search engines ([e1c4771](https://github.com/LouisMazel/relizy/commit/e1c4771))

  The 404 page also answers with a 200 at /404, with a canonical to itself and "index, follow": the search engines could index it. It now has a noindex and no canonical.

- Point the canonical url of the index pages to their served url ([03992eb](https://github.com/LouisMazel/relizy/commit/03992eb))

  commitlint/index.md declared https://relizy.dev/commitlint/index as canonical url, which redirects to /commitlint/. The index pages now declare the url they are served at.

- Link the breadcrumbs of the pages to existing pages ([3a8b2d1](https://github.com/LouisMazel/relizy/commit/3a8b2d1))

  The BreadcrumbList of each page linked its section to /guide, /config, /cli or /api, which answer with a 404, and named the page after its slug. The section now links to its first page and the page is named after its title.

- Keep the typedoc reference out of the search engines ([cc85e3e](https://github.com/LouisMazel/relizy/commit/cc85e3e))

  The 124 pages of the typedoc reference were indexable with the description of the site, out of the sitemap, and covered by the pages of the API section. They now have a noindex: they stay in the docs and in llms-full.txt.

- Cache the hashed assets of the docs for a year ([9b7ff48](https://github.com/LouisMazel/relizy/commit/9b7ff48))

  Cloudflare Pages served the files of /assets with max-age=14400 and must-revalidate. Their name holds a hash of their content, so a _headers file caches them for a year as immutable.

- Serve the logo of the header from the docs ([728ace2](https://github.com/LouisMazel/relizy/commit/728ace2))

  The logo of the header was loaded from raw.githubusercontent.com, an extra connection on each visit. The same logo.svg is in the public files of the docs.

- Give the pages of the commands and the homepage searchable titles ([597f878](https://github.com/LouisMazel/relizy/commit/597f878))

  The pages of the commands were titled "bump | Relizy", "init | Relizy", and "changelog | Relizy" twice with the changelog page. They are now titled "relizy bump command | Relizy", the changelog page "Changelog | Relizy", and the homepage starts with the name of Relizy: "Relizy - Release automation for monorepos and packages".

- Describe the API pages and the changelog page in full ([200eecc](https://github.com/LouisMazel/relizy/commit/200eecc))

  Their descriptions, shown in the search results, in llms.txt and at the top of the API pages, were 25 to 54 characters long. They now say what each function does and returns.

- Stop repeating the head of the site in each page ([34e6f26](https://github.com/LouisMazel/relizy/commit/34e6f26))

  transformHead returned the head of the site with the tags of the page, and VitePress adds what transformHead returns to this head: each page had its JSON-LD WebSite and SoftwareApplication, its favicon and its font preload twice.

- Drop the changefreq and priority of the sitemap ([fc61776](https://github.com/LouisMazel/relizy/commit/fc61776))

  Every page was "daily" with priority 1, values the search engines ignore. The sitemap keeps the lastmod of each page, read from git.

- Drop the published time of the pages ([4e0749d](https://github.com/LouisMazel/relizy/commit/4e0749d))

  article:published_time held the date of the last update of the page, as article:modified_time. The pages keep their modified time.

- Give the version, license and repository of Relizy to the search engines ([af05e25](https://github.com/LouisMazel/relizy/commit/af05e25))

  The JSON-LD SoftwareApplication of the docs now has the softwareVersion, the license and the GitHub and npm pages of Relizy (sameAs).

- Give the long pages a shorter description for the search results ([9974946](https://github.com/LouisMazel/relizy/commit/9974946))

  21 pages had a description of 161 to 251 characters, cut by the search results. Their metaDescription, at most 155 characters, is used for the meta description and the og and twitter descriptions, while the page, llms.txt and the docs of the MCP server keep the full description.

- Correct the migration guide of relizy 2 ([6c59769](https://github.com/LouisMazel/relizy/commit/6c59769))
- Correct the documentation against the code ([a1f05a9](https://github.com/LouisMazel/relizy/commit/a1f05a9))
- Update plans ([eafff08](https://github.com/LouisMazel/relizy/commit/eafff08))
- Update plans ([aaa1976](https://github.com/LouisMazel/relizy/commit/aaa1976))
- Update plans ([36f16e5](https://github.com/LouisMazel/relizy/commit/36f16e5))
- Update plans ([d4d46dd](https://github.com/LouisMazel/relizy/commit/d4d46dd))
- Update plans ([af35044](https://github.com/LouisMazel/relizy/commit/af35044))
- Run a CI step only when a release happens, from the report ([3a6b480](https://github.com/LouisMazel/relizy/commit/3a6b480))
- Add the guide of npm trusted publishing ([23f5fcb](https://github.com/LouisMazel/relizy/commit/23f5fcb))
- Point to the version groups for a root version next to independent packages ([b4750d9](https://github.com/LouisMazel/relizy/commit/b4750d9))
- Show the Microsoft Teams posts on the homepage ([2e3dc99](https://github.com/LouisMazel/relizy/commit/2e3dc99))
- Use the relizy illustration as the social preview image ([d7dbb89](https://github.com/LouisMazel/relizy/commit/d7dbb89))
- Add maz-ui translations ([37a7408](https://github.com/LouisMazel/relizy/commit/37a7408))
- Fix the build of the GitHub Actions guide ([8894546](https://github.com/LouisMazel/relizy/commit/8894546))

### 📦 Build

- **deps:** Remove @maz-ui/upgrade from the docs ([1db29ea](https://github.com/LouisMazel/relizy/commit/1db29ea))
- **deps:** Accept the minor versions of @maz-ui/node and @maz-ui/utils ([f6b8375](https://github.com/LouisMazel/relizy/commit/f6b8375))
- **deps:** Update ai version ([b70d391](https://github.com/LouisMazel/relizy/commit/b70d391))

### 🧪 Tests

- Give the slow git tests more time ([fb6421b](https://github.com/LouisMazel/relizy/commit/fb6421b))
- Type the cancelled prompts of the tests ([a756f4f](https://github.com/LouisMazel/relizy/commit/a756f4f))
- Confirm the bump in the release e2e tests ([1ca1d6f](https://github.com/LouisMazel/relizy/commit/1ca1d6f))

  The release now fails without --yes when the terminal is not interactive, as in the workers of vitest.

- Check that the docs name every CLI flag and config option ([269a2fb](https://github.com/LouisMazel/relizy/commit/269a2fb))

  A flag of `src/cli.ts` missing from the page of its command (the global
  ones from `cli/commands`), or a config option missing from its doc page,
  now fails `knowledge.spec.ts`, as an undocumented command already did.

- Search the prereleases page of the docs ([c421e2a](https://github.com/LouisMazel/relizy/commit/c421e2a))

  The canary releases and the prerelease versioning are now documented on one page, guide/prereleases.

- Check the order of the release steps ([bae9d3c](https://github.com/LouisMazel/relizy/commit/bae9d3c))

  The test named after the order only checked that each step ran, and its e2e twin pushed the names in a fixed order, so neither could fail.

- Stop loading the source code in the vitest config ([d386bf7](https://github.com/LouisMazel/relizy/commit/d386bf7))
- Pass the tests of init and of the release report in CI ([04fd1a5](https://github.com/LouisMazel/relizy/commit/04fd1a5))
- Check the push of a dry run outside of a pull request in CI ([c779dd6](https://github.com/LouisMazel/relizy/commit/c779dd6))
- Check the links between the doc pages ([5dbf050](https://github.com/LouisMazel/relizy/commit/5dbf050))
- Replace the e2e specs of the release with a unit test ([ecf91a8](https://github.com/LouisMazel/relizy/commit/ecf91a8))

  The specs of `tests/e2e` mocked everything but `release.ts` and only covered the check of the remote branch with the publish disabled and the push enabled. This case is now tested in `release.spec.ts`.

- Toggle the interactive terminal with setInteractiveTerminal ([0233a0e](https://github.com/LouisMazel/relizy/commit/0233a0e))
- Create the temporary git repositories with a shared helper ([7a5a41d](https://github.com/LouisMazel/relizy/commit/7a5a41d))
- Share the commit and version group config factories ([6a1fae2](https://github.com/LouisMazel/relizy/commit/6a1fae2))
- Ignore the OIDC token of the CI job running the tests ([caa6a7e](https://github.com/LouisMazel/relizy/commit/caa6a7e))
- Split the slow specs so that vitest runs them in parallel ([44f313f](https://github.com/LouisMazel/relizy/commit/44f313f))

  The release-groups specs are split in three files sharing their repository (tests/release-groups.ts), the Slack messages of slack-limits are formatted once per scenario, and the commitlint CLI tests join cli.spec.ts.

- Ignore the colors of the init notes in CI ([a5e27e4](https://github.com/LouisMazel/relizy/commit/a5e27e4))

#### ⚠️ Breaking Changes

- ⚠️ Throw a RelizyCancelError on a refused prompt instead of exiting the process ([ac14ad2](https://github.com/LouisMazel/relizy/commit/ac14ad2))

  A refused or cancelled prompt (bump confirmation, uncommitted changes, rewritten tag) no longer calls `process.exit()`: the commands throw a `RelizyCancelError` before writing anything, without their `error:*` hooks nor a failed PR comment. The CLI still exits with code 0.

  ```ts
  import { isRelizyCancelError, release } from 'relizy'

  try {
    await release()
  }
  catch (error) {
    if (!isRelizyCancelError(error)) {
      throw error
    }
  }
  ```

- ⚠️ Confirm the bump once for every version group ([985a5f7](https://github.com/LouisMazel/relizy/commit/985a5f7))

  With `monorepo.groups`, the bump prompt lists the packages of every group, each under its `title`, and asks once instead of once per group.

  `confirmBump()` only asks, `displayBump()` prints a bump, and the plans of `planBumps()` get `display()` instead of `confirm()`:

  ```ts
  const { plans } = await planBumps({ config })

  await confirmBump({
    packages: plans.flatMap(plan => plan.result.bumped ? plan.result.bumpedPackages : []),
    display: () => {
      for (const plan of plans) {
        plan.display?.()
      }
    },
    dryRun: false,
  })
  ```

- ⚠️ Add releaseTitle, packageList and packageCount to the social templates ([99cd9c8](https://github.com/LouisMazel/relizy/commit/99cd9c8))

  The social posts are built from a model of the release (`getReleaseOverview()`), which fixes the posts of the `independent` mode: no more "my-lib 3 packages is out!", nor the project name with the version of its only package.

  - `{{releaseTitle}}`: `<name> <version> is out!` for a single version (`@scope/pkg 5.1.0 is out!` for a single package), `New releases of <project>` for several
  - `{{packageList}}` and `{{packageCount}}`, as in the commit templates
  - `{{newVersion}}` is empty when several versions are released
  - every occurrence of a variable is replaced, not only the first one

  The default `templates.twitterMessage` uses `{{releaseTitle}}`, same text for a single version:

  ```ts
  export default defineConfig({
    templates: {
      twitterMessage: '📣 {{releaseTitle}}\n\n{{changelog}}\n\n{{releaseUrl}}\n{{changelogUrl}}',
    },
  })
  ```

  `formatTweetMessage()`, `postReleaseToTwitter()`, `formatSlackMessage()` and `postReleaseToSlack()` take the `variables` of the template instead of `projectName`, `version`, `releaseUrl` and `changelogUrl`:

  ```ts
  const variables = getSocialTemplateVariables({ overview: getReleaseOverview({ config, bumpResult }), releaseUrl })

  formatTweetMessage({ template, changelog, postMaxLength: 280, variables })
  ```

- ⚠️ Post a release of several versions once per platform, by group ([6e30ca4](https://github.com/LouisMazel/relizy/commit/6e30ca4))

  With `monorepo.groups`, a release is announced as one release: one post per platform instead of one per group, one AI call per platform instead of one per group and platform, and the `social`, `twitter` and `slack` hooks run once. Same for several packages released in `independent` mode.

  - the post is titled `New releases of <project>`, then a section per group (its `title`), the `unified`/`selective` group first
  - Twitter: filled by priority within `postMaxLength`, every group keeps its version line (an `independent` group collapses to `Tooling: 3 packages` when needed)
  - Slack: a section per group, the budget of the message shared between them, the contributors once
  - `onlyStable` leaves the prereleases out of the post instead of posting all the versions or none

  ```text
  📣 New releases of maz-ui

  maz-ui 5.2.1
  • mcp: label the bundled docs with their maz-ui version

  Tooling
  • @maz-ui/eslint-config 5.1.0: stop enforcing the pnpm catalog
  • @maz-ui/upgrade 5.2.1
  ```

- ⚠️ Report the outcome of the release to the CI ([53c44a9](https://github.com/LouisMazel/relizy/commit/53c44a9))

  `relizy release` reports what it did (released, nothing to release or failed, the versions by group, the tags, and the outcome of each step), to run something only when a release happens:

  - in GitHub Actions, the outputs of the step (`released`, `status`, `version`, `tags`, `packages`, `report`) and the summary of the run, without option
  - `release.report.dotenv` (`--report-dotenv`): a dotenv file for the `artifacts:reports:dotenv` of GitLab CI (`RELIZY_RELEASED`, `RELIZY_VERSION`...)
  - `release.report.json` (`--report-json`): the whole report as JSON
  - `release()` returns it, and `formatReleaseReportText()` replaces `buildReleaseSummary()`

  ```yaml
  - id: release
    run: pnpm relizy release --yes
  - if: steps.release.outputs.released == 'true'
    run: ./scripts/notify-teams.sh
  ```

- ⚠️ Show each command step by step, with previews and a summary of the release ([dbc523b](https://github.com/LouisMazel/relizy/commit/dbc523b))

  Every command shows one line per step, with its duration and what it did, the details only with `--log-level verbose`. In CI, each step is a collapsible group of GitHub Actions or GitLab CI. `RELIZY_REPORTER=classic` gives back the logs of relizy 1.

  A dry run shows what it would generate (changelogs, release notes, posts, PR comment) and no longer calls the AI: `--ai-preview` calls it, `--no-preview` hides the previews.

  `relizy release` ends with a summary, also used for the PR comment, the summary of the GitHub Actions run and the new `release.report.markdown`. See [Migrating from v1 to v2](https://relizy.dev/guide/migration-v2).

- ⚠️ Rename commitlint.codeBlocksLinter to changelogLinter ([4b2073f](https://github.com/LouisMazel/relizy/commit/4b2073f))

  The option chooses the tool checking the changelog entry of a commit, not only its code blocks: with ESLint, the whole entry is linted. Rename `codeBlocksLinter` to `changelogLinter` in the `commitlint` config, with the same values (`auto`, `eslint`, `oxc`), and the type `CommitlintCodeBlocksLinter` to `CommitlintChangelogLinter`. See [Migrating from v1 to v2](https://relizy.dev/guide/migration-v2).

- ⚠️ Reject the commits crediting an AI tool ([2123f4a](https://github.com/LouisMazel/relizy/commit/2123f4a))

  The new `no-ai-attribution` rule of `relizy commitlint` reports an AI co-author (`Co-authored-by: Claude <noreply@anthropic.com>`), a `Claude-Session:` trailer and the "Generated with" line of the AI tools. It is an error by default: turn off the attribution in the settings of your tools, or the rule, as told in the [migration guide](https://relizy.dev/guide/migration-v2#ai-attribution-in-commits).

  ```ts
  import { defineConfig } from 'relizy'

  export default defineConfig({
    commitlint: {
      rules: { 'no-ai-attribution': 'off' },
    },
  })
  ```

- ⚠️ Only export the commands, the config and the types ([f5fb638](https://github.com/LouisMazel/relizy/commit/f5fb638))

  `relizy` exported every internal function of its commands (about 300: git, npm, tags, Slack, the steps of the commands...). It now only exports the programmatic API: the commands (`release()`, `bump()`, `changelog()`, `publish()`, `providerRelease()`, `social()`, `prComment()`, `commitlint()`), `defineConfig()`, `loadRelizyConfig()`, `RelizyCancelError`, `isRelizyCancelError()`, `lintCommitMessage()` and the types.

  The functions no longer exported have a replacement, listed in the [migration guide](https://relizy.dev/guide/migration-v2#public-api):

  - `createCommitAndTags()`, `pushCommitAndTags()`: `release()` with its `commit`, `gitTag` and `push` options
  - `planBumps()`, `confirmBump()`, `displayBump()`, `getPackages()`: `bump()`, with `dryRun` to preview it
  - `formatTweetMessage()`, `postReleaseToTwitter()`, `formatSlackMessage()`, `postReleaseToSlack()`, `getReleaseOverview()`, `getSocialTemplateVariables()`: `social()`, or the `release` parameter of a hook
  - `buildReleaseSummary()`, `formatReleaseReportText()`, `formatReleaseReportMarkdown()`: the report returned by `release()`
  - `generateChangelog()`, `generateMarkDown()`: `changelog()`
  - `getDefaultConfig()`, `mergeTypes()`: `loadRelizyConfig()`, which returns the config with its defaults
  - `isPrerelease()`: `prerelease()` of semver
  - `init()`: `relizy init`

  ```ts
  // v1
  const types = Object.keys(mergeTypes(relizyConfig.types, getDefaultConfig().types))

  // v2
  const config = await loadRelizyConfig()
  const types = Object.keys(config.types)
  ```

  The `check_migration` tool of the MCP server lists the imports to change.

- ⚠️ Rename monorepo.includePrivates to privatePackages ([26b4711](https://github.com/LouisMazel/relizy/commit/26b4711))

  The option says what relizy does with the private packages of the
  workspace, with named values: `ignore` (default) or `release` (released as
  the other packages, never published). The flag and the options of the
  commands follow:

  ```ts
  export default defineConfig({
    monorepo: {
      // includePrivates: true,
      privatePackages: 'release',
    },
  })
  ```

  ```bash
  relizy release --private-packages release
  ```

  `check_migration` points out `includePrivates` in the config.

- ⚠️ Remove monorepo.ignorePackageNames, replaced by monorepo.ignored ([798faeb](https://github.com/LouisMazel/relizy/commit/798faeb))

  `monorepo.ignorePackageNames`, deprecated, is removed: list the directories of these packages in `monorepo.ignored`, path globs matched as `monorepo.packages`. A config that still sets it fails to load with the fix, rather than releasing the packages it left out, and `check_migration` points it out first.

  ```ts
  export default defineConfig({
    monorepo: {
      packages: ['packages/*'],
      // ignorePackageNames: ['@scope/legacy'],
      ignored: ['packages/legacy'],
    },
  })
  ```

- ⚠️ Remove publish.token, replaced by tokens.registry ([1e8eb42](https://github.com/LouisMazel/relizy/commit/1e8eb42))

  `publish.token` read the same environment variables as `tokens.registry` (`RELIZY_NPM_TOKEN`, `NPM_TOKEN`, `NODE_AUTH_TOKEN`). Set the registry token in `tokens.registry`, or per registry in `publish.registries[].token`. `--publish-token` and the `token` option of `publish()` now set `tokens.registry`, and `token` of `ReleaseOptions` is only the git token.

  ```ts
  export default defineConfig({
    // publish: { token: process.env.MY_NPM_TOKEN },
    tokens: { registry: process.env.MY_NPM_TOKEN },
  })
  ```

- ⚠️ Remove repo.token, replaced by tokens.github and tokens.gitlab ([6d6c280](https://github.com/LouisMazel/relizy/commit/6d6c280))

  `repo.token` was a fallback of `tokens.github` and `tokens.gitlab`, which read `GITHUB_TOKEN`, `GH_TOKEN`, `GITLAB_TOKEN`... by default and are set by `--token`. Set the token of the provider releases and of the PR comment there. A PR comment on Bitbucket now says the provider is not supported, instead of asking for a GitLab token.

  ```ts
  export default defineConfig({
    repo: { provider: 'gitlab', domain: 'gitlab.mycompany.com', repo: 'team/app' },
    tokens: { gitlab: process.env.MY_TOKEN },
  })
  ```

- ⚠️ Remove the relizy/types entry of the package ([ae17dae](https://github.com/LouisMazel/relizy/commit/ae17dae))

  The entry pointed straight at a declaration file, so a runtime import of it failed. Import the types from `relizy`.

  ```ts
  // import type { RelizyConfig } from 'relizy/types'
  import type { RelizyConfig } from 'relizy'
  ```

- ⚠️ Remove the newVersion and publish.packages options, never read ([1d57afc](https://github.com/LouisMazel/relizy/commit/1d57afc))

  relizy never read the root `newVersion` option nor `publish.packages`: remove them from the config. To leave a package out of the release, use `monorepo.ignored`.

- ⚠️ Format the changelogs written with the formatter of the project ([7009491](https://github.com/LouisMazel/relizy/commit/7009491))

  Without `changelog.formatCmd`, the formatter in the dependencies of the root `package.json` (Biome, Prettier, oxfmt, dprint, else ESLint) formats the changelogs written, and only them. If it fails, the release goes on with a warning.

  To choose the command, set `formatCmd`: its files placeholder is replaced by the paths of the changelogs written. `false` (or `--no-format-cmd`) turns the formatting off:

  ```ts
  import { defineConfig } from 'relizy'

  export default defineConfig({
    changelog: { formatCmd: 'eslint --fix {{files}}' },
  })
  ```

- ⚠️ Name the changelog of Slack and Teams posts changelog ([1fb6dc2](https://github.com/LouisMazel/relizy/commit/1fb6dc2))

  `social.slack.changelog` and `social.teams.changelog` take the same values: `full` (the commit bodies included), `summary` (the commit titles) or `none` (or `false`, no changelog). Slack gains `none`, Teams gains `full`: the changelogs of a card share what its other texts leave of its 28 KB, each one cut between two changes with an `… and N more changes` line, instead of refusing the card.

  ```ts
  export default defineConfig({
    social: {
      slack: { enabled: true, changelog: 'full' },
      teams: { enabled: true, changelog: 'summary' },
    },
  })
  ```

  BREAKING CHANGE: `social.slack.changelogFormat` is renamed `social.slack.changelog`, with the same values; relizy 2 ignores `changelogFormat`. `check_migration` finds it.

- ⚠️ Replace the arrays of the config instead of concatenating them ([f2aca2a](https://github.com/LouisMazel/relizy/commit/f2aca2a))

  An array of the config replaces the default one, and the array of the config file when it comes from the CLI or the programmatic API. Before, `bump.dependencyTypes: ['dependencies', 'peerDependencies']` resolved to `['dependencies', 'peerDependencies', 'dependencies']`, `--dependency-types devDependencies` could only add to the list of the config, and `relizy release` passed every `publish.args` twice.

  A `bump.dependencyTypes` without `dependencies` no longer bumps the packages on every bump of their `dependencies`: add it to keep them.

  ```ts
  export default defineConfig({
    bump: {
      dependencyTypes: ['dependencies', 'peerDependencies'],
    },
  })
  ```

- ⚠️ Exit with code 0 when there is nothing to bump ([8c11e3f](https://github.com/LouisMazel/relizy/commit/8c11e3f))

  `relizy bump` exits with code 0 when no commit triggers a bump, as `relizy release` does, instead of 1: a CI job running it no longer fails for nothing. To run something only when a release happens, use a `success:release` hook.

- ⚠️ Remove the publish.private option ([acb3416](https://github.com/LouisMazel/relizy/commit/acb3416))

  relizy never read it: the private packages are never published. A config
  setting it no longer type-checks, `check_migration` points it out:

  ```ts
  export default defineConfig({
    // publish: { private: false }, removed
    monorepo: { privatePackages: 'release' }, // to version the private packages
  })
  ```

## v1.14.4 (2026-11-05)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.14.3...v1.14.4)

### 📦 Build

- **deps:** Upgrade minor and patch dependencies ([368c80f](https://github.com/LouisMazel/relizy/commit/368c80f))

  - `c12` from 3.3.3 to 3.3.4
  - `fast-glob` from 3.3.2 to 3.3.3

- **deps:** Upgrade oxc-parser to v0.157 ([49de24e](https://github.com/LouisMazel/relizy/commit/49de24e))

  - `oxc-parser` from 0.156.0 to 0.157.0

- Require node versions patched by the october 2026 security releases ([329237e](https://github.com/LouisMazel/relizy/commit/329237e))

  `engines.node` goes from `>=22.12.0` to `^22.23.4 || ^24.22.1 || >=26.12.1`, the releases that fix the 10 CVEs of the Node.js October 2026 security releases (including the Brotli decoder RCE, CVE-2026-111497).

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.14.4-beta.0 (2026-11-05)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.14.3...v1.14.4-beta.0)

### 📦 Build

- **deps:** Upgrade minor and patch dependencies ([d15b26d](https://github.com/LouisMazel/relizy/commit/d15b26d))

  - `c12` from 3.3.3 to 3.3.4
  - `fast-glob` from 3.3.2 to 3.3.3

- **deps:** Upgrade oxc-parser to v0.157 ([001efa3](https://github.com/LouisMazel/relizy/commit/001efa3))

  - `oxc-parser` from 0.156.0 to 0.157.0

- Require node versions patched by the october 2026 security releases ([a4fca4f](https://github.com/LouisMazel/relizy/commit/a4fca4f))

  `engines.node` goes from `>=22.12.0` to `^22.23.4 || ^24.22.1 || >=26.12.1`, the releases that fix the 10 CVEs of the Node.js October 2026 security releases (including the Brotli decoder RCE, CVE-2026-111497).

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.14.3 (2026-11-04)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.14.2...v1.14.3)

### 🩹 Fixes

- Read the git log of a long range without overflowing the exec buffer ([e48ad14](https://github.com/LouisMazel/relizy/commit/e48ad14))

  The `git log` of a new package in a large repository (its whole history) overflowed the 1 MB default buffer of execSync and failed the bump with ENOBUFS.

- Start an independent package without a tag of its version at the release of this version ([d0da83e](https://github.com/LouisMazel/relizy/commit/d0da83e))

  A package moved from the unified or selective group to an independent group has no tag of its own yet (its releases were tagged v6.18.0): it started at an old tag of the package, or at its first commit. It now starts at the commit that set its current version in its package.json, followed through its moves, named after its tag (v6.18.0). The same applies to a package released by hand or whose tag push failed. A package created with its current version is released as a new package.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.14.3-beta.0 (2026-11-04)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.14.2...v1.14.3-beta.0)

### 🩹 Fixes

- Read the git log of a long range without overflowing the exec buffer ([e48ad14](https://github.com/LouisMazel/relizy/commit/e48ad14))

  The `git log` of a new package in a large repository (its whole history) overflowed the 1 MB default buffer of execSync and failed the bump with ENOBUFS.

- Start an independent package without a tag of its version at the release of this version ([d0da83e](https://github.com/LouisMazel/relizy/commit/d0da83e))

  A package moved from the unified or selective group to an independent group has no tag of its own yet (its releases were tagged v6.18.0): it started at an old tag of the package, or at its first commit. It now starts at the commit that set its current version in its package.json, followed through its moves, named after its tag (v6.18.0). The same applies to a package released by hand or whose tag push failed. A package created with its current version is released as a new package.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.14.2 (2026-11-03)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.14.1...v1.14.2)

### 📦 Build

- **deps:** Update minor and patch versions ([900fc44](https://github.com/LouisMazel/relizy/commit/900fc44))
- **deps:** Update major versions ([ac0073d](https://github.com/LouisMazel/relizy/commit/ac0073d))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.14.1 (2026-11-03)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.14.0...v1.14.1)

### 💅 Refactors

- Drop the changelogen dependency ([b21457c](https://github.com/LouisMazel/relizy/commit/b21457c))

  Relizy no longer depends on changelogen: the commit parsing, the repository resolution and the GitHub release creation are ported from changelogen 0.6.2 without behavior change, along with its tests. The config options it brought (`scopeMap`, `excludeAuthors`, `noAuthors`, `hideAuthorEmail`, `signTags`) are now declared by relizy, unchanged.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.14.0 (2026-11-03)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.13.2...v1.14.0)

### 🚀 Features

- Keep the commits made before a package directory moved ([0b7a5e2](https://github.com/LouisMazel/relizy/commit/0b7a5e2))

  The commits of the old directory of a moved package (renamed `package.json`) now count for its changelog and its bump. Declare the moves git cannot detect with `monorepo.movedPackages`.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.13.2 (2026-11-01)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.13.1...v1.13.2)

### 🩹 Fixes

- Graduate a prerelease to the version its commits imply ([bf3a9c2](https://github.com/LouisMazel/relizy/commit/bf3a9c2))

  Releasing a stable version from a prerelease always gave its base version (`1.13.1-beta.0` gave `1.13.1`), even when the commits since the prerelease implied a bigger bump: a `feat` was released in a patch. The stable version now follows the same rule as between two prereleases: the base version, unless the commits imply a bigger bump than this base (`1.13.1-beta.0` with a `feat` gives `1.14.0`, with only fixes `1.13.1`). Breaking peer dependencies and `capZeroMajor` apply, and an explicit `--patch`, `--minor` or `--major` is unchanged.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.13.1 (2026-11-01)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.13.0...v1.13.1)

### 🚀 Features

- Update a single PR comment by default ([f2b4219](https://github.com/LouisMazel/relizy/commit/f2b4219))

  `prComment.mode` is now `update` by default: relizy updates its comment on the pull or merge request at each release instead of adding a new one, so only one relizy comment appears on it. Set `prComment: { mode: 'append' }` to keep a comment per release.

- Plan a bump without writing anything with planBumps ([5f9925e](https://github.com/LouisMazel/relizy/commit/5f9925e))

  `planBumps({ config })` computes the bump of the packages like `bump()`, with the version groups, without asking for any confirmation nor writing anything, and without running the hooks: it returns the result of the bump and the plans that `bump()` then confirms and writes. A package bumped because the published range of one of its peer dependencies rejects the new version of this dependency gets `outOfRangePeer`, the name of this dependency.

- Give AI coding agents the release preview and the docs with relizy mcp ([7e14609](https://github.com/LouisMazel/relizy/commit/7e14609))

  `relizy mcp` starts an MCP server for AI coding agents (Claude Code, Cursor, Copilot, Codex...). Its tools only read the project, never run the hooks of the config and never write, commit, tag, push nor publish:

  - `preview_release`: the version of each package and version group of the next release, and why (its commits, a bumped dependency, a peer range rejecting the new version, a package of another group, a graduation), with the tags
  - `preview_changelog`: the changelog entries the release would write
  - `lint_commit`: lints a message before committing, or the commits of a branch, with the fixes, a suggested header, the bump and the changelog entry
  - `get_project`, `get_config_option`, `search_docs` and `get_doc`: the config of the project, the reference of the options and the docs of the installed relizy, shipped in the package (`agent-docs/`)

  `relizy mcp init` writes the relizy rules for the agents (`.claude/rules/relizy.md`, a section of `AGENTS.md`) and registers the server in `.mcp.json`, `.cursor/mcp.json` and `.vscode/mcp.json`. `relizy init` offers the same step when the project already uses an AI agent. Run it again after an upgrade of relizy to update the rules.

  relizy now requires Node.js 22.12 or higher.

### 🩹 Fixes

- Check the peer dependency ranges as npm does and bump a major on a breaking peer dependency ([59dd54f](https://github.com/LouisMazel/relizy/commit/59dd54f))

  `bump.outOfRangePeers` checks the published ranges as npm does (`^6.19.1` rejects `6.20.0-beta.0`), so a canary or a beta of a dependency also releases its dependents declared with `workspace:^`. In the `independent` mode, a package released while its peer dependency makes a breaking change that its published range rejects (`6.19.1` to `7.0.0`) gets a major instead of a patch, as for a breaking commit: a minor in `0.x` (see `bump.capZeroMajor`), a premajor for a prerelease.

- Bump the major of a unified or selective group whose package has a breaking peer dependency of another group ([6e3544d](https://github.com/LouisMazel/relizy/commit/6e3544d))

  In the `unified` and `selective` modes, a package released while its peer dependency on a package of another version group makes a breaking change that its published range rejects now gives a major to the root version (a minor in `0.x`, a premajor for a prerelease), so to every package released by the group, instead of a patch. The canary versions follow the same rule, in every version mode.

- Only restore and commit the files written by the release, never in dry-run ([61bd0ab](https://github.com/LouisMazel/relizy/commit/61bd0ab))

  A canary release, or a release failing before its commit, restored the release files with `git checkout HEAD`, even in dry-run: the uncommitted changes of every modified `package.json` and `CHANGELOG.md` were lost, and an untracked `package.json` was removed. Relizy now records the files it writes and restores their exact content before the release, the release commit only stages them, and a dry-run writes nothing. With `--no-clean`, Relizy warns about the uncommitted changes and asks for a confirmation in an interactive terminal outside of the CI.

- Release the packages whose catalog dependencies a commit updates ([13928d9](https://github.com/LouisMazel/relizy/commit/13928d9))

  A commit that only updated an entry of a catalog (`catalog:` dependencies) belonged to no package: in selective and independent modes, the packages using this entry were not released, and their changelogs did not mention the update, although their published dependencies changed. Such a commit now belongs to the packages referencing the updated entry, in any dependency field, as if it had edited their `package.json`: its type decides the bump, `chore(deps)` releases nothing. The catalogs of pnpm (`pnpm-workspace.yaml`), yarn (`.yarnrc.yml`) and bun (root `package.json`) are supported.

- Keep the lines of a commit body that start like a file of the commit ([0c36df1](https://github.com/LouisMazel/relizy/commit/0c36df1))

  A line of a commit body starting with a capital letter such as `A`, `M` or `D` followed by a space ("A new option sets the size.") was taken for a file of the commit and left out of the changelog. Only the list of files git writes after the body is now left out, and a line of this list is recognized as git writes it: a status letter, an optional similarity score, then a tab. The files used to attribute the commits to the packages are unchanged.

- Load the config of a repository without origin remote nor repository field ([40a82a1](https://github.com/LouisMazel/relizy/commit/40a82a1))

  Loading the config failed with "Cannot read properties of undefined (reading 'provider')" in a local repository: without an `origin` remote nor a `repository` field in the package.json, the repository is not resolved and the config is now loaded without it.

### 💅 Refactors

- Read the default values of the config instead of repeating them ([79e396e](https://github.com/LouisMazel/relizy/commit/79e396e))

  The fallbacks of `prComment.mode` and `ai.language` repeated the defaults of `getDefaultConfig()`, although the resolved config always has them. `relizy init` now takes its default answers, and the values it leaves out of the generated config, from `getDefaultConfig()` too: changing a default no longer needs to change them.

### 🧪 Tests

- Cover the cancelled confirmation of a run with uncommitted changes ([91b7997](https://github.com/LouisMazel/relizy/commit/91b7997))
- Cover the cancelled confirmation of a run with uncommitted changes ([3f7ad19](https://github.com/LouisMazel/relizy/commit/3f7ad19))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.13.1-beta.0 (2026-11-01)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.13.0...v1.13.1-beta.0)

### 🩹 Fixes

- Check the peer dependency ranges as npm does and bump a major on a breaking peer dependency ([59dd54f](https://github.com/LouisMazel/relizy/commit/59dd54f))

  `bump.outOfRangePeers` checks the published ranges as npm does (`^6.19.1` rejects `6.20.0-beta.0`), so a canary or a beta of a dependency also releases its dependents declared with `workspace:^`. In the `independent` mode, a package released while its peer dependency makes a breaking change that its published range rejects (`6.19.1` to `7.0.0`) gets a major instead of a patch, as for a breaking commit: a minor in `0.x` (see `bump.capZeroMajor`), a premajor for a prerelease.

- Bump the major of a unified or selective group whose package has a breaking peer dependency of another group ([6e3544d](https://github.com/LouisMazel/relizy/commit/6e3544d))

  In the `unified` and `selective` modes, a package released while its peer dependency on a package of another version group makes a breaking change that its published range rejects now gives a major to the root version (a minor in `0.x`, a premajor for a prerelease), so to every package released by the group, instead of a patch. The canary versions follow the same rule, in every version mode.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.13.0 (2026-10-30)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.12.0...v1.13.0)

### 🚀 Features

- Release several version groups in a single run ([5ae4569](https://github.com/LouisMazel/relizy/commit/5ae4569))

  Set `monorepo.groups` instead of `monorepo.versionMode` and `monorepo.packages` to release several sets of packages, each with its own version mode, in a single run: one release commit with the tags of every group, one publish order and one canary rollback, so the `workspace:` dependencies between groups resolve to the versions of the run.

  ```ts
  import { defineConfig } from 'relizy'

  export default defineConfig({
    monorepo: {
      groups: [
        { name: 'main', versionMode: 'selective', packages: ['packages/*'] },
        { name: 'header', versionMode: 'independent', packages: ['shared/navigation'] },
      ],
    },
  })
  ```

  The packages whose published peer dependency range rejects the new version of their dependency (`workspace:*` on any release, `workspace:^` on a major) are now bumped with it, with or without groups. Set `bump.outOfRangePeers` to `warn` or `error` to only report them.

  The packages are now published after their peer and optional dependencies too, and their `workspace:` dependencies must resolve to versions published by the release or already on the registry (`publish.checkWorkspaceDependencies`).

  Closes #164

### 🩹 Fixes

- Skip the social safety check when the release does not post ([dd4c668](https://github.com/LouisMazel/relizy/commit/dd4c668))

  `relizy release --canary` and `relizy release --no-social` no longer require the Twitter, Slack or AI credentials of the social posts.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.12.0 (2026-10-25)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.11.1...v1.12.0)

### 🚀 Features

- Add the relizy init command ([d474bf1](https://github.com/LouisMazel/relizy/commit/d474bf1))

  Run `npx relizy init` to create the `relizy.config.ts` of your project: the packages, their versions, the package manager and the git provider are detected, and only a few questions are asked (publish or version only, folders to release, version mode, optional advanced options). It can also install the `commit-msg` hook of `relizy commitlint` and add a `release` script to the `package.json`.

  Use `--yes` to accept the detected values without questions, `--force` to replace an existing config and `--dry-run` to preview the generated config.

### 🩹 Fixes

- Stop printing git errors when detecting the provider of a repository without remote ([43d72e7](https://github.com/LouisMazel/relizy/commit/43d72e7))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.11.1 (2026-10-23)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.11.0...v1.11.1)

### 🩹 Fixes

- Only attribute a commit to the packages whose folder it changes ([f6a9435](https://github.com/LouisMazel/relizy/commit/f6a9435))

### ❤️ Contributors

- LouisMazel <me@loicmazuel.com>

## v1.11.0 (2026-10-22)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.10.0...v1.11.0)

### 🚀 Features

- Read the workspaces of the monorepo tools for the scopes of relizy commitlint ([c0d9e2b](https://github.com/LouisMazel/relizy/commit/c0d9e2b))

  The packages declared by the tools of the monorepo become valid scopes, without `commitlint.packages`, e.g. apps that relizy never releases. Relizy reads the `workspaces` of the `package.json` (npm, yarn, bun, and Turborepo or Nx on top of them), `pnpm-workspace.yaml`, `lerna.json`, `rush.json` and the `workspace` of `deno.json`.

- Add the codeBlocksLinter option to relizy commitlint ([a5a3e5f](https://github.com/LouisMazel/relizy/commit/a5a3e5f))

  `commitlint.codeBlocksLinter` chooses the tool checking the code blocks of the commit bodies (`body-changelog-lint`): `auto` by default (the ESLint of the project when it lints the `CHANGELOG.md` files, otherwise oxc), `eslint` to fail instead of falling back to oxc, or `oxc` for a faster syntax check.

- Disable subject-case by default in relizy commitlint ([3079c2d](https://github.com/LouisMazel/relizy/commit/3079c2d))

  Relizy capitalizes the subject in the changelog, so its case changes nothing, and names such as `MazChart` were rejected. The rule stays available for a lowercase style. The suggested header only lowercases the subject when the rule is enabled.

### 🩹 Fixes

- Fetch the missing history of the shallow clones of the CI in relizy commitlint ([ef69cf5](https://github.com/LouisMazel/relizy/commit/ef69cf5))

  The default checkout of GitHub Actions and GitLab CI only has the last commits, so `relizy commitlint` could not find the start of the range. In a shallow clone, it now fetches the history and the target branch of the pull request from `origin`, and the tags for `--from`. `fetch-depth: 0` and `GIT_DEPTH: 0` are no longer required.

- Accept extra spaces after the colon of the header in relizy commitlint ([d99867e](https://github.com/LouisMazel/relizy/commit/d99867e))

  `chore:  upgrade dependencies` was rejected by `header-format`, while the changelog removes the extra spaces. A missing space is still an error.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.10.0 (2026-10-22)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.9.0...v1.10.0)

### 🚀 Features

- Add the relizy commitlint command ([c3ae8ac](https://github.com/LouisMazel/relizy/commit/c3ae8ac))

  `relizy commitlint` lints the commit messages with the relizy config, as a replacement for commitlint: the same parser, types and workspace packages as the release, and the commit bodies checked as they will appear in the changelogs.

  - In the `commit-msg` hook: `relizy commitlint --edit "$1"`, or run `relizy commitlint --install` once to write the hook.
  - In CI: `relizy commitlint` lints the commits of the pull request (merge-base with the base branch on GitHub Actions and GitLab CI, otherwise since the last tag).
  - Each valid commit prints its effect on the next release, e.g. `✔ feat(nuxt) → minor bump, 🚀 Features`.
  - The body is rendered like in the changelogs: its code blocks are linted with the ESLint of the project, or checked with a built-in parser.

  Configure it with the `commitlint` key, rules can be tuned and added as functions:

  ```ts
  import { defineConfig } from 'relizy'

  export default defineConfig({
    commitlint: {
      scopes: ['ci', 'deps'],
      rules: { 'scope-required': ['error', 'when-bumping'] },
      customRules: {
        ticket: ({ subject }) => /^\[[A-Z]+-\d+\] /.test(subject) || 'Start the subject with the ticket',
      },
    },
  })
  ```

  See https://relizy.dev/commitlint/ for the rules and the migration from commitlint.

- Explain how to fix the commits and cover the apps in relizy commitlint ([7a143b8](https://github.com/LouisMazel/relizy/commit/7a143b8))

  Each problem now comes with how to fix it, a corrected header is suggested when the mistakes can be fixed safely (case, spacing, typos in the type or the scope, final period), and the summary links the documentation of the failing rules and gives the commands to fix the commits. The output is colored in a terminal and in CI, and plain for AI agents.

  - `--format json` prints the report for programs and AI agents, `--quiet` only prints the commits with problems.
  - In GitHub Actions, the problems are also reported as annotations.
  - In the CI of a pull or merge request, its title is linted too, as it becomes the commit message of a squash merge (`--no-title` to disable).
  - `commitlint.packages` adds directories that relizy does not release, such as apps, to the scopes. The packages excluded with `monorepo.ignored` and the packages without version are valid scopes too.
  - A shallow clone of the CI is reported with how to fetch the history.

  ```ts
  import { defineConfig } from 'relizy'

  export default defineConfig({
    commitlint: {
      packages: ['apps/*'],
    },
  })
  ```

- Type the rules of relizy commitlint in the config ([9cfd89b](https://github.com/LouisMazel/relizy/commit/9cfd89b))
- Lint the pull request title only when commitlint.title enables it ([7b68369](https://github.com/LouisMazel/relizy/commit/7b68369))

### 🔥 Performance

- Speed up the truncation of long Slack changelogs ([51cbb8f](https://github.com/LouisMazel/relizy/commit/51cbb8f))

  The summary format of the Slack posts rebuilt the whole changelog for each commit it tried to drop: a release of hundreds of commits with bodies took tens of seconds to format. The truncation is now linear, and the full format searches its cut within the limits only.

### 🩹 Fixes

- Treat an empty FORCE_COLOR as unset in relizy commitlint ([b5688cc](https://github.com/LouisMazel/relizy/commit/b5688cc))

### 📦 Build

- Upgrade dependencies ([3a09855](https://github.com/LouisMazel/relizy/commit/3a09855))

### 🧪 Tests

- Run the commitlint CLI tests without the colors of the CI ([472164b](https://github.com/LouisMazel/relizy/commit/472164b))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.9.0 (2026-10-22)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.8.0...v1.9.0)

### 🚀 Features

- Add a full changelog format to the Slack posts ([c46107d](https://github.com/LouisMazel/relizy/commit/c46107d))

  New `social.slack.changelogFormat` option, `'summary'` by default (unchanged posts). Set it to `'full'` to post the complete changelog, with the commit bodies and the PR/issue links, rendered as native Slack rich text: a block per changelog section, commits as bullets, body paragraphs as quotes, body lists as nested lists and code as code blocks. With a custom template, `{{changelog}}` receives the complete changelog in mrkdwn.

  Override it for a single run with `relizy release --slack-format full` or `relizy social --slack-format full`. Commit bodies follow `changelog.includeCommitBody`.

  `social.slack.postMaxLength` now defaults to 2500 characters in `summary` format and to no limit in `full` format. Every post stays within the Slack limits (50 blocks, 3000 characters per section, about 13,200 characters for a message with rich text, 150 for the header): the commits that do not fit are replaced with an "… and N more changes" line, and long packages or contributors lists with an "… and N more" line, instead of a rejected post.

- Refine the AI prompts of the social posts ([70ee3db](https://github.com/LouisMazel/relizy/commit/70ee3db))

  The AI now writes the Slack posts in standard markdown, rendered with the chosen `social.slack.changelogFormat`, and keeps the PR/issue links and the package headings of independent releases. Breaking changes come first in both Slack and Twitter posts. The Twitter posts drop the scope markers, and the Slack posts in `summary` format get the 2500 characters budget.

  The prompts also use the commit bodies to describe each change instead of listing them as separate changes.

- Scope the AI extra guidelines per target ([22035e0](https://github.com/LouisMazel/relizy/commit/22035e0))

  `ai.extraGuidelines` still accepts a string applied to every target, and now also an object to add directives per target: `{ global, providerRelease, twitter, slack }`. The `global` directives come first, then the ones of the target.

  ```ts
  export default defineConfig({
    ai: {
      extraGuidelines: {
        global: 'Never mention the internal codename.',
        slack: 'Mention the team owning each change.',
      },
    },
  })
  ```

### 🩹 Fixes

- Keep the paragraphs of the commit bodies in the changelog ([e2369e0](https://github.com/LouisMazel/relizy/commit/e2369e0))

  The blank lines of a commit body were dropped, so its paragraphs were merged into one block and a paragraph following a list was glued to its last item. A single blank line is now kept between the paragraphs of a body, in the CHANGELOG files, the provider releases and the social posts.

- Cut the full Slack changelog where its limit is reached ([d3a24b5](https://github.com/LouisMazel/relizy/commit/d3a24b5))

  In `full` format, a changelog longer than `social.slack.postMaxLength` or than the Slack limits was truncated by whole commits: when the first commit and its body did not fit, the post only showed "… and N more changes". The changelog is now shown up to the limit, commit bodies included, cut with "…" where the limit is reached, even inside a commit body, and the commits left out entirely are still announced with "… and N more changes". The limit counts the characters of the post as shown by the `--dry-run` preview, bullets included.

  The `summary` format still drops whole commits.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.8.0 (2026-10-20)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.7.0...v1.8.0)

### 🚀 Features

- Add the ai-sdk provider for AI release notes ([f199679](https://github.com/LouisMazel/relizy/commit/f199679))

  New `ai.provider: 'ai-sdk'` option: release notes and social posts can be rewritten with any Vercel AI SDK model (OpenAI, Google, Mistral, ...) instead of Claude Code.
  Install `ai` and your provider package (e.g. `pnpm add -D ai @ai-sdk/openai`), then set `ai.providers['ai-sdk'].model` to a model such as `openai('gpt-5-mini')`, or to a Vercel AI Gateway model id such as `'openai/gpt-5-mini'`. The credentials are read by the provider package (e.g. `OPENAI_API_KEY`). The optional `reasoning` option sets the reasoning effort of the models that support it.

### 🩹 Fixes

- Resolve the previous release from the versions of the release tags ([d18543c](https://github.com/LouisMazel/relizy/commit/d18543c))

  When a package was released independently in the same monorepo (e.g. a selective config plus an independent config), its `name@version` tag could become the start of the next release range, and the commits made before it were lost from the bump and the changelog.
  The previous release is now the release tag with the highest version up to the current version, instead of the most recent tag. In unified, selective and standalone modes, the release tags follow `templates.tagBody` (or the `v1.2.3` and `1.2.3` formats) and a package tag never matches. In independent mode, they are the `name@version` tags of the package. A hotfix of an older version or a release of a branch not merged yet is no longer picked either.

### ❤️ Contributors

- Favour Emeka ([@favorodera](https://github.com/favorodera))
- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.7.0 (2026-10-10)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.6.0...v1.7.0)

### 🚀 Features

- Create GitHub and GitLab releases for private packages when `includePrivates` is enabled ([02d7c47](https://github.com/LouisMazel/relizy/commit/02d7c47))

  Private packages versioned with `monorepo.includePrivates: true` now get their own GitHub or GitLab release in `independent` mode, next to their git tag. They are still never published to a registry.

### 🩹 Fixes

- Render a working compare link and title for new packages in the changelog ([a1e6c03](https://github.com/LouisMazel/relizy/commit/a1e6c03))
- Read commits of a new package created in the repository root commit ([6700387](https://github.com/LouisMazel/relizy/commit/6700387))
- Hide install commands and the unknown version in PR comments when nothing is published ([9ad58f1](https://github.com/LouisMazel/relizy/commit/9ad58f1))

  The installation section is omitted when `release.publish` is `false` and never lists private packages. In `independent` mode, the global version line is replaced by the packages table, which also lists private packages when `monorepo.includePrivates` is enabled.

### 📖 Documentation

- **docs:** Document versioning private projects without publishing ([a825dab](https://github.com/LouisMazel/relizy/commit/a825dab))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.7.0-beta.0 (2026-10-10)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.6.0...v1.7.0-beta.0)

### 🚀 Features

- Create GitHub and GitLab releases for private packages when `includePrivates` is enabled ([02d7c47](https://github.com/LouisMazel/relizy/commit/02d7c47))

  Private packages versioned with `monorepo.includePrivates: true` now get their own GitHub or GitLab release in `independent` mode, next to their git tag. They are still never published to a registry.

### 🩹 Fixes

- Render a working compare link and title for new packages in the changelog ([a1e6c03](https://github.com/LouisMazel/relizy/commit/a1e6c03))
- Read commits of a new package created in the repository root commit ([6700387](https://github.com/LouisMazel/relizy/commit/6700387))
- Hide install commands and the unknown version in PR comments when nothing is published ([9ad58f1](https://github.com/LouisMazel/relizy/commit/9ad58f1))

  The installation section is omitted when `release.publish` is `false` and never lists private packages. In `independent` mode, the global version line is replaced by the packages table, which also lists private packages when `monorepo.includePrivates` is enabled.

### 📖 Documentation

- **docs:** Document versioning private projects without publishing ([a825dab](https://github.com/LouisMazel/relizy/commit/a825dab))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.6.0 (2026-10-07)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.5.1...v1.6.0)

### 🚀 Features

- **relizy:** Guard releases against commits pushed during the release ([812ee2c](https://github.com/LouisMazel/relizy/commit/812ee2c))

  `relizy release` now protects the release commit when the branch moves while
  the release runs:
  - When `push` and `commit` are enabled, the release stops before publishing if
    the upstream branch received new commits, and restores the release files.
  - The release fails right after the bump if one of its tags already exists,
    with the command to recover.
  - A push rejected as non-fast-forward is recovered by merging the upstream
    branch into the release commit, then pushing again.

### 🩹 Fixes

- **relizy:** Mention rejected pushes in orphan tag and already published errors ([ba3592a](https://github.com/LouisMazel/relizy/commit/ba3592a))

### 📖 Documentation

- **docs:** Document the release branch safety guards ([e504b9e](https://github.com/LouisMazel/relizy/commit/e504b9e))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.5.1 (2026-10-06)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.5.0...v1.5.1)

### 🩹 Fixes

- Sort canary versions below every prerelease and stable release ([cf939c9](https://github.com/LouisMazel/relizy/commit/cf939c9))

  Canary versions now use the `{nextVersion}-0.{preid}-{sha}` format
  (e.g. `5.0.0-0.canary-a3f4b2c` instead of `5.0.0-canary.a3f4b2c.0`).
  They no longer match semver ranges like `^5.0.0-beta.0` and are never
  suggested by `pnpm outdated`, `pnpm update` or Renovate. Install a canary
  by pinning its exact version or using the `canary` dist-tag.

- Keep co-author trailers and changed files of squash-merged commits ([45e0d78](https://github.com/LouisMazel/relizy/commit/45e0d78))

  Commits whose body contains a `----` line, like the `---------` GitHub adds
  before `Co-authored-by:` trailers when squash merging, lost their trailers and
  their changed files. In a monorepo they could be left out of a package
  changelog and bump. Commit subjects containing `|` are no longer truncated.

- Credit co-authors in the changelog contributors ([caed2da](https://github.com/LouisMazel/relizy/commit/caed2da))

  The contributors section now lists the co-authors read from `Co-authored-by:`
  trailers, so contributors of a squash-merged pull request are credited.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.5.0 (2026-09-25)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.4.9...v1.5.0)

### 🚀 Features

- Support publishing to multiple registries ([#113](https://github.com/LouisMazel/relizy/pull/113))

  - refactor(relizy): use deep imports for @maz-ui/utils helpers
    Closes #100, #105
  - feat: support publishing to multiple registries (#112)
  - feat(relizy): support publishing to multiple registries
  - test(relizy): add per-registry OTP caching coverage
  - feat(relizy): allow excluding the default registry per package
  - fix(relizy): normalize registry URLs before deduplication and OTP caching
  - fix(relizy): scope the publish safety check to registries actually needed by the release
  - refactor(relizy): rename RegistryTarget.packages to packageFilter

  ***

- Skip or clearly report already-published versions on publish ([1442386](https://github.com/LouisMazel/relizy/commit/1442386))

  Add `publish.skipExistingVersions` (and the `--skip-existing-versions` flag
  on `publish` and `release`) to make re-running a release idempotent: packages
  whose version already exists on the registry are skipped, and only what is
  still missing gets published.
  When enabled, Relizy checks each package before publishing by querying the
  registry. This relies on the standard registry metadata endpoint that every
  npm-compatible registry implements, so it does not depend on the wording of
  any error message. The check works for every package manager: npm/pnpm use
  the `view` command (reusing your `.npmrc` auth), and yarn/bun fall back to a
  direct HTTPS request to the same endpoint. When the option is disabled (the
  default), an already-published version still fails the release, but with a
  clear message pointing to the option instead of the raw registry error.
  Especially useful for canary reruns on the same commit, where the version is
  regenerated identically.

- **relizy:** Add bump.capZeroMajor option to control 0.x graduation ([de74327](https://github.com/LouisMazel/relizy/commit/de74327))

  By default relizy caps commit-detected `major` bumps to `minor` while the
  current version is in the `0.x.y` range (semver §4), so a breaking change
  never graduates a `0.x` package to `1.0.0` automatically.
  `bump.capZeroMajor: false` opts out: a breaking commit then bumps `0.x.y`
  straight to `1.0.0`, useful for a production-ready `0.x` package released via
  CI without passing `--major`. It only affects commit-based detection (explicit
  CLI release types are never capped) and is a no-op once the package is `1.x`.
  Defaults to `true`, so existing behavior is unchanged. No breaking change.

### 🩹 Fixes

- Aggregate per-package changelog for social posts in independent mode ([#114](https://github.com/LouisMazel/relizy/pull/114))
- Omit implicit default registry when only `registries` is configured ([3ee4a1c](https://github.com/LouisMazel/relizy/commit/3ee4a1c))

  You can now list every publish target in `registries` without setting a
  top-level `registry`. When no default `registry` is configured, Relizy no
  longer adds an implicit target pointing at the ambient `.npmrc` registry, so
  packages are published only to the registries you declare.
  Setting neither `registry` nor `registries` still falls back to the
  `.npmrc`-resolved registry, and a package matched by no `registries` entry
  falls back to it too.

- Authenticate and publish through .npmrc for pnpm 10+ compatibility ([72876ad](https://github.com/LouisMazel/relizy/commit/72876ad))

  The auth token (and, for scoped packages, the matching `@scope:registry`) is
  now written to `.npmrc` for the duration of each publish/whoami instead of
  being passed as CLI flags, which the pnpm 10+ parser rejects. Authentication
  and multi-registry publishing now behave identically on npm, pnpm (every
  version) and bun; your `.npmrc` is preserved and restored, and left untouched
  when no token/registry is configured. Yarn is not covered (set its auth in
  `.yarnrc.yml`).
  Scoped packages are now published to their configured registry instead of the
  one the ambient `.npmrc` points at, and additional `registries` without their
  own `tag` inherit the global publish tag, so a canary release keeps its tag on
  every registry.

- Base release announcements on the previous stable version ([9647125](https://github.com/LouisMazel/relizy/commit/9647125))

  Release announcements (Slack messages and PR comments) now compare against the
  previous stable version instead of the last prerelease. A graduation is shown as
  `6.15.0 → 6.16.0` instead of `6.16.0-beta.5 → 6.16.0`, matching the changelog.
  Prereleases are unaffected.

- **relizy:** Honor ignored packages in root bump and changelog ([50147a0](https://github.com/LouisMazel/relizy/commit/50147a0))

  In unified/selective mode the root version and changelog aggregated every
  commit, so a breaking change scoped to an ignored package (typically one
  released independently) bumped the whole repository. `ignorePackageNames`
  only removed the package from the published set, not from the root
  aggregation.
  Root commits are now filtered: a commit whose changed files all live inside
  an ignored package is excluded from the root version bump and the root
  changelog. Commits that mix ignored and released packages still count.
  Also add `monorepo.ignored` (path globs, same syntax as `packages`) as the
  recommended, path-based replacement for `ignorePackageNames`, which is now
  deprecated. Both options are honored and merged, so migration is incremental.
  No breaking change.

### 💅 Refactors

- Relocate tryPostPrComment and extract the release summary builder ([3c700fa](https://github.com/LouisMazel/relizy/commit/3c700fa))

### 📖 Documentation

- Document listing every registry without a default ([f0239a1](https://github.com/LouisMazel/relizy/commit/f0239a1))

### 📦 Build

- Upgrade dependencies ([#116](https://github.com/LouisMazel/relizy/pull/116))

  - build: upgrade dependencies minor
  - build: upgrade vitest

- **deps:** Upgrade minor and patch dependencies ([ce973e5](https://github.com/LouisMazel/relizy/commit/ce973e5))
- **deps:** Upgrade typescript to v6 ([416f69a](https://github.com/LouisMazel/relizy/commit/416f69a))
- **deps:** Upgrade @slack/web-api to v8 ([3695ac2](https://github.com/LouisMazel/relizy/commit/3695ac2))
- **deps:** Upgrade vitepress to v2.0.0-alpha.20 ([256dbf2](https://github.com/LouisMazel/relizy/commit/256dbf2))
- **deps:** Upgrade maz-ui deps ([6dc947e](https://github.com/LouisMazel/relizy/commit/6dc947e))

### 🧪 Tests

- **relizy:** Keep isVersionPublished tests hermetic from registry token env ([82ea63c](https://github.com/LouisMazel/relizy/commit/82ea63c))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))
- Mazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.5.0-beta.4 (2026-09-22)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.5.0-beta.3...v1.5.0-beta.4)

### 🚀 Features

- **relizy:** Add bump.capZeroMajor option to control 0.x graduation ([de74327](https://github.com/LouisMazel/relizy/commit/de74327))

  By default relizy caps commit-detected `major` bumps to `minor` while the
  current version is in the `0.x.y` range (semver §4), so a breaking change
  never graduates a `0.x` package to `1.0.0` automatically.
  `bump.capZeroMajor: false` opts out: a breaking commit then bumps `0.x.y`
  straight to `1.0.0`, useful for a production-ready `0.x` package released via
  CI without passing `--major`. It only affects commit-based detection (explicit
  CLI release types are never capped) and is a no-op once the package is `1.x`.
  Defaults to `true`, so existing behavior is unchanged. No breaking change.

### 🩹 Fixes

- **relizy:** Honor ignored packages in root bump and changelog ([50147a0](https://github.com/LouisMazel/relizy/commit/50147a0))

  In unified/selective mode the root version and changelog aggregated every
  commit, so a breaking change scoped to an ignored package (typically one
  released independently) bumped the whole repository. `ignorePackageNames`
  only removed the package from the published set, not from the root
  aggregation.
  Root commits are now filtered: a commit whose changed files all live inside
  an ignored package is excluded from the root version bump and the root
  changelog. Commits that mix ignored and released packages still count.
  Also add `monorepo.ignored` (path globs, same syntax as `packages`) as the
  recommended, path-based replacement for `ignorePackageNames`, which is now
  deprecated. Both options are honored and merged, so migration is incremental.
  No breaking change.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.5.0-beta.3 (2026-09-22)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.5.0-beta.2...v1.5.0-beta.3)

### 🚀 Features

- Skip or clearly report already-published versions on publish ([1442386](https://github.com/LouisMazel/relizy/commit/1442386))

  Add `publish.skipExistingVersions` (and the `--skip-existing-versions` flag
  on `publish` and `release`) to make re-running a release idempotent: packages
  whose version already exists on the registry are skipped, and only what is
  still missing gets published.
  When enabled, Relizy checks each package before publishing by querying the
  registry. This relies on the standard registry metadata endpoint that every
  npm-compatible registry implements, so it does not depend on the wording of
  any error message. The check works for every package manager: npm/pnpm use
  the `view` command (reusing your `.npmrc` auth), and yarn/bun fall back to a
  direct HTTPS request to the same endpoint. When the option is disabled (the
  default), an already-published version still fails the release, but with a
  clear message pointing to the option instead of the raw registry error.
  Especially useful for canary reruns on the same commit, where the version is
  regenerated identically.

### 🩹 Fixes

- Base release announcements on the previous stable version ([9647125](https://github.com/LouisMazel/relizy/commit/9647125))

  Release announcements (Slack messages and PR comments) now compare against the
  previous stable version instead of the last prerelease. A graduation is shown as
  `6.15.0 → 6.16.0` instead of `6.16.0-beta.5 → 6.16.0`, matching the changelog.
  Prereleases are unaffected.

### 💅 Refactors

- Relocate tryPostPrComment and extract the release summary builder ([3c700fa](https://github.com/LouisMazel/relizy/commit/3c700fa))

### 📦 Build

- **deps:** Upgrade minor and patch dependencies ([ce973e5](https://github.com/LouisMazel/relizy/commit/ce973e5))
- **deps:** Upgrade typescript to v6 ([416f69a](https://github.com/LouisMazel/relizy/commit/416f69a))
- **deps:** Upgrade @slack/web-api to v8 ([3695ac2](https://github.com/LouisMazel/relizy/commit/3695ac2))
- **deps:** Upgrade vitepress to v2.0.0-alpha.20 ([256dbf2](https://github.com/LouisMazel/relizy/commit/256dbf2))
- **deps:** Upgrade maz-ui deps ([6dc947e](https://github.com/LouisMazel/relizy/commit/6dc947e))

### 🧪 Tests

- **relizy:** Keep isVersionPublished tests hermetic from registry token env ([82ea63c](https://github.com/LouisMazel/relizy/commit/82ea63c))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.5.0-beta.2 (2026-09-15)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.5.0-beta.1...v1.5.0-beta.2)

### 🩹 Fixes

- Authenticate and publish through .npmrc for pnpm 10+ compatibility ([72876ad](https://github.com/LouisMazel/relizy/commit/72876ad))

  The auth token (and, for scoped packages, the matching `@scope:registry`) is
  now written to `.npmrc` for the duration of each publish/whoami instead of
  being passed as CLI flags, which the pnpm 10+ parser rejects. Authentication
  and multi-registry publishing now behave identically on npm, pnpm (every
  version) and bun; your `.npmrc` is preserved and restored, and left untouched
  when no token/registry is configured. Yarn is not covered (set its auth in
  `.yarnrc.yml`).
  Scoped packages are now published to their configured registry instead of the
  one the ambient `.npmrc` points at, and additional `registries` without their
  own `tag` inherit the global publish tag, so a canary release keeps its tag on
  every registry.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.5.0-beta.1 (2026-09-14)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.5.0-beta.0...v1.5.0-beta.1)

### 🩹 Fixes

- Omit implicit default registry when only `registries` is configured ([3ee4a1c](https://github.com/LouisMazel/relizy/commit/3ee4a1c))

  You can now list every publish target in `registries` without setting a
  top-level `registry`. When no default `registry` is configured, Relizy no
  longer adds an implicit target pointing at the ambient `.npmrc` registry, so
  packages are published only to the registries you declare.
  Setting neither `registry` nor `registries` still falls back to the
  `.npmrc`-resolved registry, and a package matched by no `registries` entry
  falls back to it too.

### 📖 Documentation

- Document listing every registry without a default ([f0239a1](https://github.com/LouisMazel/relizy/commit/f0239a1))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.5.0-beta.0 (2026-09-14)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.4.9...v1.5.0-beta.0)

### 🚀 Features

- Support publishing to multiple registries ([#113](https://github.com/LouisMazel/relizy/pull/113))
  - refactor(relizy): use deep imports for @maz-ui/utils helpers
    Closes #100, #105
  - feat: support publishing to multiple registries (#112)
  - feat(relizy): support publishing to multiple registries
  - test(relizy): add per-registry OTP caching coverage
  - feat(relizy): allow excluding the default registry per package
  - fix(relizy): normalize registry URLs before deduplication and OTP caching
  - fix(relizy): scope the publish safety check to registries actually needed by the release
  - refactor(relizy): rename RegistryTarget.packages to packageFilter

  ***

### 🩹 Fixes

- Aggregate per-package changelog for social posts in independent mode ([#114](https://github.com/LouisMazel/relizy/pull/114))

### 📦 Build

- Upgrade dependencies ([#116](https://github.com/LouisMazel/relizy/pull/116))
  - build: upgrade dependencies minor
  - build: upgrade vitest

### ❤️ Contributors

- Mazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.4.9 (2026-06-21)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.4.8...v1.4.9)

### 💅 Refactors

- **relizy:** Use deep imports for @maz-ui/utils helpers ([#106](https://github.com/LouisMazel/relizy/pull/106))

  Closes #100, #105

### ❤️ Contributors

- Mazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.4.8 (2026-06-10)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.4.7...v1.4.8)

### 🩹 Fixes

- **relizy:** Include title-only commit types in changelog and release outputs ([cb3dc6a](https://github.com/LouisMazel/relizy/commit/cb3dc6a))

  Commits whose configured type defines a `title` without a `semver`
  (e.g. `docs: { title: '📖 Documentation' }`) now appear in the
  CHANGELOG, GitHub/GitLab release notes, and Slack/Twitter posts.
  Such types still do not trigger a version bump — only types with a
  `semver` field do. Set the type to `false` to exclude it from both
  the changelog and the bump.

- Detect and recover from rewritten (orphaned) release tags ([b4d6478](https://github.com/LouisMazel/relizy/commit/b4d6478))

  When a branch is rebased after a release, its tag points to a commit
  that is no longer in the history. The changelog then spanned everything
  since the last stable release (with duplicated commits) and bumped every
  package. Relizy now detects this and uses the right commit range, while
  leaving the tag name in the changelog untouched.
  In CI / non-interactive it auto-corrects for the run and warns; in a TTY
  it prompts. No commit is ever rewritten and nothing is mutated in dry-run.

  ## New config options

  ```ts
  export default defineConfig({
    // Enabled by default. Set to false to opt out.
    detectRewrittenTags: true,
    // Override the auto behaviour (prompt on TTY, ephemeral on CI):
    // 'prompt' | 'ephemeral' | 'rebind' | 'error'
    onRewrittenTag: 'ephemeral',
  })
  ```

- Redact secrets in logs to prevent token leakage ([d2d9ed9](https://github.com/LouisMazel/relizy/commit/d2d9ed9))

  Tokens (npm, GitHub and others) could appear in clear text in Relizy's
  debug logs. They are now hidden, so sharing your logs no longer risks
  exposing your secrets.

- Prevent release hang on registry auth safety check ([52cc132](https://github.com/LouisMazel/relizy/commit/52cc132))

  registry authentication when the registry did not respond.
  It now stops after a short delay and shows a clear error instead of
  hanging. You can adjust the delay with `publish.safetyCheckTimeout`
  (15s by default) or skip the check with `--no-safety-check`.

- Honor the registry from .npmrc instead of forcing the public one ([345f09b](https://github.com/LouisMazel/relizy/commit/345f09b))

  Relizy always targeted the public npm registry for the authentication
  check and publishing, ignoring a custom registry set in your `.npmrc`
  (for example a corporate proxy). On networks where the public registry
  is only reachable through that proxy, this caused the registry check to
  hang.
  When `publish.registry` is not set, Relizy now resolves the registry
  from your npm config, so a proxy or private registry configured in
  `.npmrc` is respected. Set `publish.registry` only to force a specific
  registry.

- Keep a recognizable extract when masking secrets in logs ([216f5f8](https://github.com/LouisMazel/relizy/commit/216f5f8))

  Masked secrets in the resolved-config debug output now keep their first
  and last few characters (e.g. `npm_***2Hwk`) instead of being fully
  replaced by `[redacted]`, so you can still tell which token is which
  without exposing it. Secrets shorter than 16 characters are still masked
  entirely.

### 📦 Build

- Upgrade maz-ui dependencies ([d827532](https://github.com/LouisMazel/relizy/commit/d827532))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.4.8-beta.1 (2026-06-10)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.4.8-beta.0...v1.4.8-beta.1)

### 🩹 Fixes

- Keep a recognizable extract when masking secrets in logs ([216f5f8](https://github.com/LouisMazel/relizy/commit/216f5f8))

  Masked secrets in the resolved-config debug output now keep their first
  and last few characters (e.g. `npm_***2Hwk`) instead of being fully
  replaced by `[redacted]`, so you can still tell which token is which
  without exposing it. Secrets shorter than 16 characters are still masked
  entirely.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.4.8-beta.0 (2026-06-10)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.4.7...v1.4.8-beta.0)

### 🩹 Fixes

- **relizy:** Include title-only commit types in changelog and release outputs ([cb3dc6a](https://github.com/LouisMazel/relizy/commit/cb3dc6a))

  Commits whose configured type defines a `title` without a `semver`
  (e.g. `docs: { title: '📖 Documentation' }`) now appear in the
  CHANGELOG, GitHub/GitLab release notes, and Slack/Twitter posts.
  Such types still do not trigger a version bump — only types with a
  `semver` field do. Set the type to `false` to exclude it from both
  the changelog and the bump.

- Detect and recover from rewritten (orphaned) release tags ([b4d6478](https://github.com/LouisMazel/relizy/commit/b4d6478))

  When a branch is rebased after a release, its tag points to a commit
  that is no longer in the history. The changelog then spanned everything
  since the last stable release (with duplicated commits) and bumped every
  package. Relizy now detects this and uses the right commit range, while
  leaving the tag name in the changelog untouched.
  In CI / non-interactive it auto-corrects for the run and warns; in a TTY
  it prompts. No commit is ever rewritten and nothing is mutated in dry-run.

  ## New config options

  ```ts
  export default defineConfig({
    // Enabled by default. Set to false to opt out.
    detectRewrittenTags: true,
    // Override the auto behaviour (prompt on TTY, ephemeral on CI):
    // 'prompt' | 'ephemeral' | 'rebind' | 'error'
    onRewrittenTag: 'ephemeral',
  })
  ```

- Redact secrets in logs to prevent token leakage ([d2d9ed9](https://github.com/LouisMazel/relizy/commit/d2d9ed9))

  Tokens (npm, GitHub and others) could appear in clear text in Relizy's
  debug logs. They are now hidden, so sharing your logs no longer risks
  exposing your secrets.

- Prevent release hang on registry auth safety check ([52cc132](https://github.com/LouisMazel/relizy/commit/52cc132))

  registry authentication when the registry did not respond.
  It now stops after a short delay and shows a clear error instead of
  hanging. You can adjust the delay with `publish.safetyCheckTimeout`
  (15s by default) or skip the check with `--no-safety-check`.

- Honor the registry from .npmrc instead of forcing the public one ([345f09b](https://github.com/LouisMazel/relizy/commit/345f09b))

  Relizy always targeted the public npm registry for the authentication
  check and publishing, ignoring a custom registry set in your `.npmrc`
  (for example a corporate proxy). On networks where the public registry
  is only reachable through that proxy, this caused the registry check to
  hang.
  When `publish.registry` is not set, Relizy now resolves the registry
  from your npm config, so a proxy or private registry configured in
  `.npmrc` is respected. Set `publish.registry` only to force a specific
  registry.

### 📦 Build

- Upgrade maz-ui dependencies ([d827532](https://github.com/LouisMazel/relizy/commit/d827532))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.4.7 (2026-06-09)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.4.6...v1.4.7)

### 🩹 Fixes

- Detect and recover from rewritten (orphaned) release tags ([3000559](https://github.com/LouisMazel/relizy/commit/3000559))

  When a branch is rebased after a release, its tag points to a commit
  that is no longer in the history. The changelog then spanned everything
  since the last stable release (with duplicated commits) and bumped every
  package. Relizy now detects this and uses the right commit range, while
  leaving the tag name in the changelog untouched.
  In CI / non-interactive it auto-corrects for the run and warns; in a TTY
  it prompts. No commit is ever rewritten and nothing is mutated in dry-run.

  ## New config options

  ```ts
  export default defineConfig({
    // Enabled by default. Set to false to opt out.
    detectRewrittenTags: true,
    // Override the auto behaviour (prompt on TTY, ephemeral on CI):
    // 'prompt' | 'ephemeral' | 'rebind' | 'error'
    onRewrittenTag: 'ephemeral',
  })
  ```

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.4.6 (2026-05-29)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.4.5...v1.4.6)

### 🩹 Fixes

- **relizy:** Include title-only commit types in changelog and release outputs ([b487aef](https://github.com/LouisMazel/relizy/commit/b487aef))

  Commits whose configured type defines a `title` without a `semver`
  (e.g. `docs: { title: '📖 Documentation' }`) now appear in the
  CHANGELOG, GitHub/GitLab release notes, and Slack/Twitter posts.
  Such types still do not trigger a version bump — only types with a
  `semver` field do. Set the type to `false` to exclude it from both
  the changelog and the bump.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.4.5 (2026-05-12)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.4.4...v1.4.5)

### 🩹 Fixes

- Fall back to last prerelease tag when no stable tag exists ([8f8fce0](https://github.com/LouisMazel/relizy/commit/8f8fce0))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.4.4 (2026-05-12)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.4.3...v1.4.4)

### 🩹 Fixes

- Use bumped version during npm/pnpm dry-run publish ([bde2272](https://github.com/LouisMazel/relizy/commit/bde2272))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.4.3 (2026-05-05)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.4.2...v1.4.3)

### 🩹 Fixes

- **relizy:** Prevent ENOBUFS for new sub-packages in unified/selective mode ([f9fcc87](https://github.com/LouisMazel/relizy/commit/f9fcc87))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.4.2 (2026-05-04)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.4.1...v1.4.2)

### 🩹 Fixes

- **relizy:** Bump all packages in unified mode regardless of commits ([919705e](https://github.com/LouisMazel/relizy/commit/919705e))

  Fixes: #81

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.4.1 (2026-04-24)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.4.0...v1.4.1)

### 🩹 Fixes

- **relizy:** Skip AI safety check when social platform is disabled ([6a69084](https://github.com/LouisMazel/relizy/commit/6a69084))

  AI social credentials are no longer required when `ai.social.<platform>.enabled` is true
  but the matching `social.<platform>.enabled` is false or unset.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.4.0 (2026-04-22)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.3.3...v1.4.0)

### 🚀 Features

- **relizy:** Add Slack webhook support, contributors block, configurable truncation ([962603a](https://github.com/LouisMazel/relizy/commit/962603a))

  Slack integration now supports two transports: Bot Token (existing) and
  Incoming Webhook URL (new). When both are configured, the webhook takes
  priority and @slack/web-api is not required at all. A contributors block
  is auto-appended (names only, no emails, no GitHub handles) respecting the
  global `noAuthors` gate and an optional Slack-specific override. The
  hardcoded 500-char truncation is now configurable via `postMaxLength`
  (default 2500). No breaking changes — existing token+channel configs
  keep working.
  Example (webhook mode, simplest setup):

  ```ts
  import { defineConfig } from 'relizy'

  export default defineConfig({
    social: {
      slack: {
        enabled: true,
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
        // postMaxLength: 2500   // optional, default 2500
        // noAuthors: false      // optional, hide contributors on Slack only
      },
    },
  })
  ```

- **relizy:** Add package list to slack release messages ([7958aac](https://github.com/LouisMazel/relizy/commit/7958aac))

  Slack release messages now include a `📦 Packages` block listing every
  bumped package with its before → after version.
  Disable it with `social.slack.noPackages: true`:

  ```ts
  import { defineConfig } from 'relizy'

  export default defineConfig({
    social: {
      slack: {
        enabled: true,
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
        noPackages: true,
      },
    },
  })
  ```

### 🩹 Fixes

- **relizy:** Include root-only commits in root package changelog ([2aeaf27](https://github.com/LouisMazel/relizy/commit/2aeaf27))

### 📦 Build

- Upgrade dependencies ([ada24b0](https://github.com/LouisMazel/relizy/commit/ada24b0))

### 💄 Styles

- **relizy:** Bold package names in slack release messages ([2f72640](https://github.com/LouisMazel/relizy/commit/2f72640))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.4.0-beta.1 (2026-04-22)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.4.0-beta.0...v1.4.0-beta.1)

### 🚀 Features

- **relizy:** Add package list to slack release messages ([333ff34](https://github.com/LouisMazel/relizy/commit/333ff34))

  Slack release messages now include a `📦 Packages` block listing every
  bumped package with its before → after version.
  Disable it with `social.slack.noPackages: true`:

  ```ts
  import { defineConfig } from 'relizy'

  export default defineConfig({
    social: {
      slack: {
        enabled: true,
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
        noPackages: true,
      },
    },
  })
  ```

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.4.0-beta.0 (2026-04-22)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.3.3...v1.4.0-beta.0)

### 🚀 Features

- **relizy:** Add Slack webhook support, contributors block, configurable truncation ([6101168](https://github.com/LouisMazel/relizy/commit/6101168))

  Slack integration now supports two transports: Bot Token (existing) and
  Incoming Webhook URL (new). When both are configured, the webhook takes
  priority and @slack/web-api is not required at all. A contributors block
  is auto-appended (names only, no emails, no GitHub handles) respecting the
  global `noAuthors` gate and an optional Slack-specific override. The
  hardcoded 500-char truncation is now configurable via `postMaxLength`
  (default 2500). No breaking changes — existing token+channel configs
  keep working.
  Example (webhook mode, simplest setup):

  ```ts
  import { defineConfig } from 'relizy'

  export default defineConfig({
    social: {
      slack: {
        enabled: true,
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
        // postMaxLength: 2500   // optional, default 2500
        // noAuthors: false      // optional, hide contributors on Slack only
      },
    },
  })
  ```

### 📦 Build

- Upgrade dependencies ([a31a8cc](https://github.com/LouisMazel/relizy/commit/a31a8cc))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.3.3 (2026-04-16)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.3.2...v1.3.3)

### 💅 Refactors

- Improve AI prompts for social and provider release posts ([b169432](https://github.com/LouisMazel/relizy/commit/b169432))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.3.2 (2026-04-16)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.3.1...v1.3.2)

### 🩹 Fixes

- Prevent defu deep merge from overriding user-defined commit types ([aabf96b](https://github.com/LouisMazel/relizy/commit/aabf96b))

  User-defined `types` entries were deep-merged with defaults by defu.
  Omitted properties like `semver` were filled from defaults, triggering
  unwanted version bumps (e.g. `docs` without `semver` got `semver: 'patch'`).

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.3.1 (2026-04-16)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.3.0...v1.3.1)

### 📖 Documentation

- Update changelog ([f82f43f](https://github.com/LouisMazel/relizy/commit/f82f43f))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.3.0 (2026-04-15)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.2.1...v1.3.0)

### 🚀 Features

- **relizy:** Support private packages in bump and changelog ([c08ab50](https://github.com/LouisMazel/relizy/commit/c08ab50))

  Add a new `monorepo.includePrivates` option that lets internal, non-published
  packages participate in versioning and changelog generation. Private packages
  get bumped alongside public ones, receive their own `CHANGELOG.md`, and their
  commits land in the aggregated root changelog.
  They remain safely excluded from `publish`, `provider-release`, and
  `pr-comment` — versioned and documented, never pushed to a registry or
  announced.

  #### Why

  Monorepos often contain internal apps, examples, or private libraries that
  still need proper version tracking and changelog history without ever being
  published. Until now, relizy filtered those packages out of every pipeline
  step. With `includePrivates`, you get full versioning and changelog coverage
  for your private packages while keeping them out of the publish flow.

  #### Usage

  Enable it in `relizy.config.ts`:

  ```ts
  export default defineConfig({
    monorepo: {
      versionMode: 'selective',
      packages: ['packages/*', 'apps/*'],
      includePrivates: true,
    },
  })
  ```

  Or from the CLI on `bump`, `changelog`, or `release`:

  ```bash
  relizy release --minor --include-private
  ```

  #### Notes
  - Opt-in: default behavior is unchanged.
  - `ignorePackageNames` still takes precedence over `includePrivates`.
  - The bump confirmation prompt marks private packages with a 🔒 badge.
  - `publish`, `provider-release`, and `pr-comment` always ignore private
    packages — this is a safety guarantee, not a toggle.

- Smart prerelease base version recalculation ([8eefe31](https://github.com/LouisMazel/relizy/commit/8eefe31))

  When in a prerelease cycle, Relizy now analyzes conventional commits
  to determine if the base version should increase.
  Previously, prerelease bumps always incremented the counter
  (e.g. 1.2.2-beta.0 → 1.2.2-beta.1) regardless of commit types.
  Now, if a `feat` commit is pushed after a patch-based beta,
  the base version correctly bumps to the next minor
  (e.g. 1.2.2-beta.1 → 1.3.0-beta.0). Similarly, a breaking change
  bumps to the next major (e.g. 1.3.0-beta.1 → 2.0.0-beta.0).
  The base version only goes up, never down — a `fix` after a
  minor-level beta simply increments the counter.

- Customizable release commit message and body + smart defaults for independent ([ac2c9fc](https://github.com/LouisMazel/relizy/commit/ac2c9fc))
- AI-enhanced release notes and social posts ([5f461f3](https://github.com/LouisMazel/relizy/commit/5f461f3))

  Rewrite GitHub/GitLab release bodies and Twitter/Slack posts with Claude
  via the optional `@yoloship/claude-sdk` integration. Opt-in per target.
  The raw changelog stays the source of truth — AI never touches the
  compare link, contributors, or PR/issue references.

  #### Usage

  ```ts
  // relizy.config.ts
  export default defineConfig({
    ai: {
      providerRelease: { enabled: true },
      social: {
        twitter: { enabled: true },
        slack: { enabled: true },
      },
    },
  })
  ```

  Set `ANTHROPIC_API_KEY` (or `CLAUDE_CODE_OAUTH_TOKEN`) and install the
  SDK: `pnpm add -D @yoloship/claude-sdk`. Toggle at runtime with
  `--ai` / `--no-ai` on `release`, `provider-release`, and `social`.
  Defaults to Claude Haiku. Fails safely (`fallback: 'raw'`) and preserves
  the release on AI errors.
  Full guide: https://relizy.dev/guide/ai-changelog

### 🩹 Fixes

- **repo:** Normalize path separators to POSIX before commit body matching ([0253f7e](https://github.com/LouisMazel/relizy/commit/0253f7e))

  On Windows, `path.relative()` returns backslash-separated paths (e.g.
  `packages\admin`) while `git log --name-status` always outputs forward
  slashes (e.g. `packages/admin/src/main.ts`). The `String.includes()`
  check therefore always returned `false` on win32, causing every package's
  commit list to be empty in independent monorepo mode and relizy to report
  "No packages to bump, no relevant commits found".
  Fix both affected sites in `isCommitOfTrackedPackages` and `getPackageCommits`
  by normalizing the `path.relative()` result with `.split(sep).join('/')`
  before the `includes` comparison.
  Fixes #52

- **relizy:** Compute per-package canary versions in independent mode ([a3fe0a5](https://github.com/LouisMazel/relizy/commit/a3fe0a5))

  Closes #51

- Rollback untracked files when publish fail ([5555aa3](https://github.com/LouisMazel/relizy/commit/5555aa3))
- Respect semver 0.x convention on breaking changes ([0fca747](https://github.com/LouisMazel/relizy/commit/0fca747))

  Breaking changes on a `0.x.y` version no longer bump the package
  to `1.0.0` automatically. They now bump the minor version instead,
  following the semver convention for initial development.
  **What changes for you**
  - A commit like `feat!: rewrite api` on version `0.5.2` now produces `0.6.0`
    (previously `1.0.0`).
  - Same logic for prereleases: `0.5.2-beta.1` + breaking change → `0.6.0-beta.0`.
  - Non-breaking commits are unchanged: `feat` still bumps the minor,
    `fix` still bumps the patch.
    **Graduating to `1.0.0` is now an explicit choice**
    When your API is ready to be declared stable, graduate to `1.0.0` by
    passing `--major` explicitly:

  ```bash
  relizy release --major
  ```

  This matches what established tools (changesets, semantic-release,
  release-please) already do, and what the semver spec recommends for
  packages still in their initial development phase.
  Fix: #29

- Detect missing claude CLI binary before spawn ([9701f50](https://github.com/LouisMazel/relizy/commit/9701f50))

  Previously, when the `claude` CLI was not on PATH, the Node child process
  emitted an unhandled `error` event and crashed the release mid-flight with
  `spawn claude ENOENT`. The Claude Code provider's safety check now probes
  the binary with `spawnSync` and throws an actionable error listing the
  install paths (npm, brew, script), so the failure surfaces early and
  points users to the fix.
  Also installs `@anthropic-ai/claude-code` in the beta release workflow,
  and documents the binary requirement in the Installation guide, Getting
  Started, AI-Enhanced Changelogs guide, and AI config reference.

### 📦 Build

- Upgrade dependencies ([2a55929](https://github.com/LouisMazel/relizy/commit/2a55929))
- Upgrade dependencies ([bbc0e30](https://github.com/LouisMazel/relizy/commit/bbc0e30))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))
- Ruan-cat ([@ruan-cat](https://github.com/ruan-cat))

## v1.3.0-beta.4 (2026-04-15)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.3.0-beta.3...v1.3.0-beta.4)

### 🩹 Fixes

- Detect missing claude CLI binary before spawn ([0a43432](https://github.com/LouisMazel/relizy/commit/0a43432))

  Previously, when the `claude` CLI was not on PATH, the Node child process
  emitted an unhandled `error` event and crashed the release mid-flight with
  `spawn claude ENOENT`. The Claude Code provider's safety check now probes
  the binary with `spawnSync` and throws an actionable error listing the
  install paths (npm, brew, script), so the failure surfaces early and
  points users to the fix.
  Also installs `@anthropic-ai/claude-code` in the beta release workflow,
  and documents the binary requirement in the Installation guide, Getting
  Started, AI-Enhanced Changelogs guide, and AI config reference.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.3.0-beta.3 (2026-04-15)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.3.0-beta.2...v1.3.0-beta.3)

### 🚀 Features

- AI-enhanced release notes and social posts ([f46b2aa](https://github.com/LouisMazel/relizy/commit/f46b2aa))

  Rewrite GitHub/GitLab release bodies and Twitter/Slack posts with Claude
  via the optional `@yoloship/claude-sdk` integration. Opt-in per target.
  The raw changelog stays the source of truth — AI never touches the
  compare link, contributors, or PR/issue references.

  #### Usage

  ```ts
  // relizy.config.ts
  export default defineConfig({
    ai: {
      providerRelease: { enabled: true },
      social: {
        twitter: { enabled: true },
        slack: { enabled: true },
      },
    },
  })
  ```

  Set `ANTHROPIC_API_KEY` (or `CLAUDE_CODE_OAUTH_TOKEN`) and install the
  SDK: `pnpm add -D @yoloship/claude-sdk`. Toggle at runtime with
  `--ai` / `--no-ai` on `release`, `provider-release`, and `social`.
  Defaults to Claude Haiku. Fails safely (`fallback: 'raw'`) and preserves
  the release on AI errors.
  Full guide: https://relizy.dev/guide/ai-changelog

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.3.0-beta.2 (2026-04-14)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.3.0-beta.1...v1.3.0-beta.2)

### 🚀 Features

- Customizable release commit message and body + smart defaults for independent ([3a164a5](https://github.com/LouisMazel/relizy/commit/3a164a5))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.3.0-beta.1 (2026-04-14)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.3.0-beta.0...v1.3.0-beta.1)

### 🚀 Features

- **relizy:** Support private packages in bump and changelog ([d0f45a0](https://github.com/LouisMazel/relizy/commit/d0f45a0))

  Add a new `monorepo.includePrivates` option that lets internal, non-published
  packages participate in versioning and changelog generation. Private packages
  get bumped alongside public ones, receive their own `CHANGELOG.md`, and their
  commits land in the aggregated root changelog.
  They remain safely excluded from `publish`, `provider-release`, and
  `pr-comment` — versioned and documented, never pushed to a registry or
  announced.

  #### Why

  Monorepos often contain internal apps, examples, or private libraries that
  still need proper version tracking and changelog history without ever being
  published. Until now, relizy filtered those packages out of every pipeline
  step. With `includePrivates`, you get full versioning and changelog coverage
  for your private packages while keeping them out of the publish flow.

  #### Usage

  Enable it in `relizy.config.ts`:

  ```ts
  export default defineConfig({
    monorepo: {
      versionMode: 'selective',
      packages: ['packages/*', 'apps/*'],
      includePrivates: true,
    },
  })
  ```

  Or from the CLI on `bump`, `changelog`, or `release`:

  ```bash
  relizy release --minor --include-private
  ```

  #### Notes
  - Opt-in: default behavior is unchanged.
  - `ignorePackageNames` still takes precedence over `includePrivates`.
  - The bump confirmation prompt marks private packages with a 🔒 badge.
  - `publish`, `provider-release`, and `pr-comment` always ignore private
    packages — this is a safety guarantee, not a toggle.

- **relizy:** Support private packages in bump and changelog ([24a55ec](https://github.com/LouisMazel/relizy/commit/24a55ec))

  Add a new `monorepo.includePrivates` option that lets internal, non-published
  packages participate in versioning and changelog generation. Private packages
  get bumped alongside public ones, receive their own `CHANGELOG.md`, and their
  commits land in the aggregated root changelog.
  They remain safely excluded from `publish`, `provider-release`, and
  `pr-comment` — versioned and documented, never pushed to a registry or
  announced.

  #### Why

  Monorepos often contain internal apps, examples, or private libraries that
  still need proper version tracking and changelog history without ever being
  published. Until now, relizy filtered those packages out of every pipeline
  step. With `includePrivates`, you get full versioning and changelog coverage
  for your private packages while keeping them out of the publish flow.

  #### Usage

  Enable it in `relizy.config.ts`:

  ```ts
  export default defineConfig({
    monorepo: {
      versionMode: 'selective',
      packages: ['packages/*', 'apps/*'],
      includePrivates: true,
    },
  })
  ```

  Or from the CLI on `bump`, `changelog`, or `release`:

  ```bash
  relizy release --minor --include-private
  ```

  #### Notes
  - Opt-in: default behavior is unchanged.
  - `ignorePackageNames` still takes precedence over `includePrivates`.
  - The bump confirmation prompt marks private packages with a 🔒 badge.
  - `publish`, `provider-release`, and `pr-comment` always ignore private
    packages — this is a safety guarantee, not a toggle.

- Smart prerelease base version recalculation ([fadb1df](https://github.com/LouisMazel/relizy/commit/fadb1df))

  When in a prerelease cycle, Relizy now analyzes conventional commits
  to determine if the base version should increase.
  Previously, prerelease bumps always incremented the counter
  (e.g. 1.2.2-beta.0 → 1.2.2-beta.1) regardless of commit types.
  Now, if a `feat` commit is pushed after a patch-based beta,
  the base version correctly bumps to the next minor
  (e.g. 1.2.2-beta.1 → 1.3.0-beta.0). Similarly, a breaking change
  bumps to the next major (e.g. 1.3.0-beta.1 → 2.0.0-beta.0).
  The base version only goes up, never down — a `fix` after a
  minor-level beta simply increments the counter.

- Smart prerelease base version recalculation ([c518a14](https://github.com/LouisMazel/relizy/commit/c518a14))

  When in a prerelease cycle, Relizy now analyzes conventional commits
  to determine if the base version should increase.
  Previously, prerelease bumps always incremented the counter
  (e.g. 1.2.2-beta.0 → 1.2.2-beta.1) regardless of commit types.
  Now, if a `feat` commit is pushed after a patch-based beta,
  the base version correctly bumps to the next minor
  (e.g. 1.2.2-beta.1 → 1.3.0-beta.0). Similarly, a breaking change
  bumps to the next major (e.g. 1.3.0-beta.1 → 2.0.0-beta.0).
  The base version only goes up, never down — a `fix` after a
  minor-level beta simply increments the counter.

### 🩹 Fixes

- **repo:** Normalize path separators to POSIX before commit body matching ([59f2984](https://github.com/LouisMazel/relizy/commit/59f2984))

  On Windows, `path.relative()` returns backslash-separated paths (e.g.
  `packages\admin`) while `git log --name-status` always outputs forward
  slashes (e.g. `packages/admin/src/main.ts`). The `String.includes()`
  check therefore always returned `false` on win32, causing every package's
  commit list to be empty in independent monorepo mode and relizy to report
  "No packages to bump, no relevant commits found".
  Fix both affected sites in `isCommitOfTrackedPackages` and `getPackageCommits`
  by normalizing the `path.relative()` result with `.split(sep).join('/')`
  before the `includes` comparison.
  Fixes #52

- **repo:** Normalize path separators to POSIX before commit body matching ([5bd83d3](https://github.com/LouisMazel/relizy/commit/5bd83d3))

  On Windows, `path.relative()` returns backslash-separated paths (e.g.
  `packages\admin`) while `git log --name-status` always outputs forward
  slashes (e.g. `packages/admin/src/main.ts`). The `String.includes()`
  check therefore always returned `false` on win32, causing every package's
  commit list to be empty in independent monorepo mode and relizy to report
  "No packages to bump, no relevant commits found".
  Fix both affected sites in `isCommitOfTrackedPackages` and `getPackageCommits`
  by normalizing the `path.relative()` result with `.split(sep).join('/')`
  before the `includes` comparison.
  Fixes #52
  Co-authored-by: Cursor <199161495+cursoragent@users.noreply.github.com>

- **relizy:** Compute per-package canary versions in independent mode ([b293295](https://github.com/LouisMazel/relizy/commit/b293295))

  Closes #51

- **relizy:** Compute per-package canary versions in independent mode ([1e3df0d](https://github.com/LouisMazel/relizy/commit/1e3df0d))

  Closes #51

- Rollback untracked files when publish fail ([2fa73a2](https://github.com/LouisMazel/relizy/commit/2fa73a2))
- Rollback untracked files when publish fail ([3479f02](https://github.com/LouisMazel/relizy/commit/3479f02))
- Respect semver 0.x convention on breaking changes ([e3536e8](https://github.com/LouisMazel/relizy/commit/e3536e8))

  Breaking changes on a `0.x.y` version no longer bump the package
  to `1.0.0` automatically. They now bump the minor version instead,
  following the semver convention for initial development.
  **What changes for you**
  - A commit like `feat!: rewrite api` on version `0.5.2` now produces `0.6.0`
    (previously `1.0.0`).
  - Same logic for prereleases: `0.5.2-beta.1` + breaking change → `0.6.0-beta.0`.
  - Non-breaking commits are unchanged: `feat` still bumps the minor,
    `fix` still bumps the patch.
    **Graduating to `1.0.0` is now an explicit choice**
    When your API is ready to be declared stable, graduate to `1.0.0` by
    passing `--major` explicitly:

  ```bash
  relizy release --major
  ```

  This matches what established tools (changesets, semantic-release,
  release-please) already do, and what the semver spec recommends for
  packages still in their initial development phase.
  Fix: #29

### 📦 Build

- Upgrade dependencies ([1f6c0c1](https://github.com/LouisMazel/relizy/commit/1f6c0c1))
- Upgrade dependencies ([0b0d65c](https://github.com/LouisMazel/relizy/commit/0b0d65c))
- Upgrade dependencies ([494b290](https://github.com/LouisMazel/relizy/commit/494b290))
- Upgrade dependencies ([a9e82f3](https://github.com/LouisMazel/relizy/commit/a9e82f3))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))
- Ruan-cat ([@ruan-cat](https://github.com/ruan-cat))

## v1.3.0-beta.0 (2026-04-13)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.2.2-beta.2...v1.3.0-beta.0)

### 🚀 Features

- Smart prerelease base version recalculation ([c518a14](https://github.com/LouisMazel/relizy/commit/c518a14))

  When in a prerelease cycle, Relizy now analyzes conventional commits
  to determine if the base version should increase.
  Previously, prerelease bumps always incremented the counter
  (e.g. 1.2.2-beta.0 → 1.2.2-beta.1) regardless of commit types.
  Now, if a `feat` commit is pushed after a patch-based beta,
  the base version correctly bumps to the next minor
  (e.g. 1.2.2-beta.1 → 1.3.0-beta.0). Similarly, a breaking change
  bumps to the next major (e.g. 1.3.0-beta.1 → 2.0.0-beta.0).
  The base version only goes up, never down — a `fix` after a
  minor-level beta simply increments the counter.

### 🩹 Fixes

- Rollback untracked files when publish fail ([3479f02](https://github.com/LouisMazel/relizy/commit/3479f02))

### 📦 Build

- Upgrade dependencies ([a9e82f3](https://github.com/LouisMazel/relizy/commit/a9e82f3))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.2.2-beta.2 (2026-04-10)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.2.2-beta.1...v1.2.2-beta.2)

### 🚀 Features

- **relizy:** Support private packages in bump and changelog ([24a55ec](https://github.com/LouisMazel/relizy/commit/24a55ec))

  Add a new `monorepo.includePrivates` option that lets internal, non-published
  packages participate in versioning and changelog generation. Private packages
  get bumped alongside public ones, receive their own `CHANGELOG.md`, and their
  commits land in the aggregated root changelog.
  They remain safely excluded from `publish`, `provider-release`, and
  `pr-comment` — versioned and documented, never pushed to a registry or
  announced.

  #### Why

  Monorepos often contain internal apps, examples, or private libraries that
  still need proper version tracking and changelog history without ever being
  published. Until now, relizy filtered those packages out of every pipeline
  step. With `includePrivates`, you get full versioning and changelog coverage
  for your private packages while keeping them out of the publish flow.

  #### Usage

  Enable it in `relizy.config.ts`:

  ```ts
  export default defineConfig({
    monorepo: {
      versionMode: 'selective',
      packages: ['packages/*', 'apps/*'],
      includePrivates: true,
    },
  })
  ```

  Or from the CLI on `bump`, `changelog`, or `release`:

  ```bash
  relizy release --minor --include-private
  ```

  #### Notes
  - Opt-in: default behavior is unchanged.
  - `ignorePackageNames` still takes precedence over `includePrivates`.
  - The bump confirmation prompt marks private packages with a 🔒 badge.
  - `publish`, `provider-release`, and `pr-comment` always ignore private
    packages — this is a safety guarantee, not a toggle.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.2.2-beta.1 (2026-03-24)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.2.2-beta.0...v1.2.2-beta.1)

### 🩹 Fixes

- **relizy:** Compute per-package canary versions in independent mode ([1e3df0d](https://github.com/LouisMazel/relizy/commit/1e3df0d))

  Closes #51

### 📦 Build

- Upgrade dependencies ([0b0d65c](https://github.com/LouisMazel/relizy/commit/0b0d65c))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.2.2-beta.0 (2026-03-24)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.2.1...v1.2.2-beta.0)

### 🩹 Fixes

- **repo:** Normalize path separators to POSIX before commit body matching ([5bd83d3](https://github.com/LouisMazel/relizy/commit/5bd83d3))

  On Windows, `path.relative()` returns backslash-separated paths (e.g.
  `packages\admin`) while `git log --name-status` always outputs forward
  slashes (e.g. `packages/admin/src/main.ts`). The `String.includes()`
  check therefore always returned `false` on win32, causing every package's
  commit list to be empty in independent monorepo mode and relizy to report
  "No packages to bump, no relevant commits found".
  Fix both affected sites in `isCommitOfTrackedPackages` and `getPackageCommits`
  by normalizing the `path.relative()` result with `.split(sep).join('/')`
  before the `includes` comparison.
  Fixes #52
  Co-authored-by: Cursor <199161495+cursoragent@users.noreply.github.com>

### ❤️ Contributors

- Ruan-cat ([@ruan-cat](https://github.com/ruan-cat))

## v1.2.1 (2026-03-19)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.2.0...v1.2.1)

### 🩹 Fixes

- **relizy:** Escape @ mentions in changelog to prevent unintended Twitter user tags ([7222aec](https://github.com/LouisMazel/relizy/commit/7222aec))

### ❤️ Contributors

- LouisMazel <me@loicmazuel.com>

## v1.2.0 (2026-03-14)

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.1.0...v1.2.0)

### 🚀 Features

- Add stripBoldMarkers option to extractChangelogSummary ([8badf30](https://github.com/LouisMazel/relizy/commit/8badf30))
- Add changelogTitle template option ([223026e](https://github.com/LouisMazel/relizy/commit/223026e))

  Customize changelog section titles via `templates.changelogTitle` in your config.
  Available variables: `{{oldVersion}}`, `{{newVersion}}`, `{{date}}`.

  ```ts
  export default defineConfig({
    templates: {
      changelogTitle: '{{newVersion}} - {{date}}',
    },
  })
  ```

### 💅 Refactors

- Add dry-run preview with logger.box for social and provider releases ([a93e711](https://github.com/LouisMazel/relizy/commit/a93e711))

### 📖 Documentation

- Document changelogTitle template and stripBoldMarkers ([a760ecf](https://github.com/LouisMazel/relizy/commit/a760ecf))

### 📦 Build

- Upgrade dependencies ([67b1f4f](https://github.com/LouisMazel/relizy/commit/67b1f4f))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.0.1...v1.1.0

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.0.1...v1.1.0)

### 🚀 Features

- Add PR/MR comment with release information ([1d3a800](https://github.com/LouisMazel/relizy/commit/1d3a800))

  Automatically post a comment on your pull request or merge request
  after `relizy release` with release status, version transitions,
  package table, and install commands.
  Supports 3 statuses: ✅ success, ⏭️ no-release, ❌ failed.

  #### Highlights
  - **Two modes**: `append` (new comment each time) or `update`
    (finds and updates existing comment via hidden marker)
  - **GitHub & GitLab** support (including enterprise/self-hosted)
  - **Auto-detection** of PR/MR from current branch, or manual
    override with `--pr-number`
  - **Standalone command**: `relizy pr-comment`
  - **Integrated in release workflow** (enabled by default)

  #### Configuration

  ```ts
  // relizy.config.ts
  export default defineConfig({
    prComment: {
      mode: 'append', // or 'update'
    },
    release: {
      prComment: true, // enabled by default, set false to disable
    },
  })
  ```

  #### CLI

  ```bash
  # As part of release
  relizy release --patch
  # Standalone
  relizy pr-comment
  # Skip during release
  relizy release --patch --no-pr-comment
  # Override PR number (useful in CI)
  relizy release --patch --pr-number 42
  ```

- Add canary release mode ([aaa49bf](https://github.com/LouisMazel/relizy/commit/aaa49bf))

  Publish temporary test versions from any branch with `--canary`.
  Canary versions use the format `{nextVersion}-{preid}.{sha}.0`
  (e.g., `1.3.0-canary.a3f4b2c.0`). The next version is auto-detected
  from commits, then the canary suffix is appended.
  - Bumps all packages to a canary version
  - Publishes to npm with a `canary` dist-tag (or custom preid)
  - Posts a PR/MR comment with the canary version details
  - Skips changelog, git commit, git tag, git push, provider release,
    and social media posting

  ```bash
  relizy release --canary
  relizy release --canary --preid snapshot
  relizy release --canary --yes --pr-number 42
  relizy bump --canary
  ```

### 🩹 Fixes

- Prevent ENOBUFS error on new packages in independent mode ([4aee6a3](https://github.com/LouisMazel/relizy/commit/4aee6a3))

  New packages without tags now use the first commit that touched the package
  directory instead of the repository's first commit.

- Report PR comment post status accurately in release summary ([df2fa1e](https://github.com/LouisMazel/relizy/commit/df2fa1e))

  Propagate success/failure boolean through the entire
  posting chain so the summary shows "Failed" when needed.

### 💅 Refactors

- Show one install command per package in PR comments ([f997136](https://github.com/LouisMazel/relizy/commit/f997136))

### 📖 Documentation

- **docs:** Add project name config in overview ([cfe000e](https://github.com/LouisMazel/relizy/commit/cfe000e))
- Update config docs ([5fc4513](https://github.com/LouisMazel/relizy/commit/5fc4513))

### 📦 Build

- Upgrade dependencies ([0362261](https://github.com/LouisMazel/relizy/commit/0362261))
- Upgrade dependencies ([2f86a38](https://github.com/LouisMazel/relizy/commit/2f86a38))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.1.0-beta.2...v1.1.0-beta.3

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.1.0-beta.2...v1.1.0-beta.3)

### 🩹 Fixes

- Report PR comment post status accurately in release summary ([080437c](https://github.com/LouisMazel/relizy/commit/080437c))

  Propagate success/failure boolean through the entire
  posting chain so the summary shows "Failed" when needed.

### 💅 Refactors

- Show one install command per package in PR comments ([ebef38b](https://github.com/LouisMazel/relizy/commit/ebef38b))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.1.0-beta.1...v1.1.0-beta.2

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.1.0-beta.1...v1.1.0-beta.2)

### 🚀 Features

- Add canary release mode ([c01b812](https://github.com/LouisMazel/relizy/commit/c01b812))

  Publish temporary test versions from any branch with `--canary`.
  Canary versions use the format `{nextVersion}-{preid}.{sha}.0`
  (e.g., `1.3.0-canary.a3f4b2c.0`). The next version is auto-detected
  from commits, then the canary suffix is appended.

  #### What it does
  - Bumps all packages to a canary version
  - Publishes to npm with a `canary` dist-tag (or custom preid)
  - Posts a PR/MR comment with the canary version details
  - Skips changelog, git commit, git tag, git push, provider release,
    and social media posting

  #### CLI

  ```bash
  # Canary release
  relizy release --canary
  # Custom preid
  relizy release --canary --preid snapshot
  # → 1.3.0-snapshot.a3f4b2c.0
  # In CI with PR comment
  relizy release --canary --yes --pr-number 42
  # Bump only (no publish)
  relizy bump --canary
  ```

- Add canary release mode ([bdfae3d](https://github.com/LouisMazel/relizy/commit/bdfae3d))

  Publish temporary test versions from any branch with `--canary`.
  Canary versions use the format `{nextVersion}-{preid}.{sha}.0`
  (e.g., `1.3.0-canary.a3f4b2c.0`). The next version is auto-detected
  from commits, then the canary suffix is appended.
  - Bumps all packages to a canary version
  - Publishes to npm with a `canary` dist-tag (or custom preid)
  - Posts a PR/MR comment with the canary version details
  - Skips changelog, git commit, git tag, git push, provider release,
    and social media posting

  ```bash
  relizy release --canary
  relizy release --canary --preid snapshot
  relizy release --canary --yes --pr-number 42
  relizy bump --canary
  ```

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.1.0-beta.0...v1.1.0-beta.1

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.1.0-beta.0...v1.1.0-beta.1)

### 🚀 Features

- Add canary release mode ([c01b812](https://github.com/LouisMazel/relizy/commit/c01b812))

  Publish temporary test versions from any branch with `--canary`.
  Canary versions use the format `{nextVersion}-{preid}.{sha}.0`
  (e.g., `1.3.0-canary.a3f4b2c.0`). The next version is auto-detected
  from commits, then the canary suffix is appended.

  ### What it does
  - Bumps all packages to a canary version
  - Publishes to npm with a `canary` dist-tag (or custom preid)
  - Posts a PR/MR comment with the canary version details
  - Skips changelog, git commit, git tag, git push, provider release,
    and social media posting

  ### CLI

  ```bash
  # Canary release
  relizy release --canary
  # Custom preid
  relizy release --canary --preid snapshot
  # → 1.3.0-snapshot.a3f4b2c.0
  # In CI with PR comment
  relizy release --canary --yes --pr-number 42
  # Bump only (no publish)
  relizy bump --canary
  ```

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.0.2-beta.1...v1.1.0-beta.0

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.0.2-beta.1...v1.1.0-beta.0)

### 🚀 Features

- Add PR/MR comment with release information ([fefaa3b](https://github.com/LouisMazel/relizy/commit/fefaa3b))

  Automatically post a comment on your pull request or merge request
  after `relizy release` with release status, version transitions,
  package table, and install commands.
  Supports 3 statuses: ✅ success, ⏭️ no-release, ❌ failed.

  ### Highlights
  - **Two modes**: `append` (new comment each time) or `update`
    (finds and updates existing comment via hidden marker)
  - **GitHub & GitLab** support (including enterprise/self-hosted)
  - **Auto-detection** of PR/MR from current branch, or manual
    override with `--pr-number`
  - **Standalone command**: `relizy pr-comment`
  - **Integrated in release workflow** (enabled by default)

  ### Configuration

  ```ts
  // relizy.config.ts
  export default defineConfig({
    prComment: {
      mode: 'append', // or 'update'
    },
    release: {
      prComment: true, // enabled by default, set false to disable
    },
  })
  ```

  ### CLI

  ```bash
  # As part of release
  relizy release --patch
  # Standalone
  relizy pr-comment
  # Skip during release
  relizy release --patch --no-pr-comment
  # Override PR number (useful in CI)
  relizy release --patch --pr-number 42
  ```

### 📦 Build

- Upgrade dependencies ([0b00262](https://github.com/LouisMazel/relizy/commit/0b00262))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.0.2-beta.0...v1.0.2-beta.1

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.0.2-beta.0...v1.0.2-beta.1)

### 🚀 Features

- Add release PR comment ([462147f](https://github.com/LouisMazel/relizy/commit/462147f))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.0.1...v1.0.2-beta.0

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.0.1...v1.0.2-beta.0)

### 🩹 Fixes

- Prevent ENOBUFS error on new packages in independent mode ([fca172f](https://github.com/LouisMazel/relizy/commit/fca172f))

  New packages without tags now use the first commit that touched the package
  directory instead of the repository's first commit.

### 📖 Documentation

- **docs:** Add project name config in overview ([cfe000e](https://github.com/LouisMazel/relizy/commit/cfe000e))
- Update config docs ([5fc4513](https://github.com/LouisMazel/relizy/commit/5fc4513))

### 📦 Build

- Upgrade dependencies ([1ef5a67](https://github.com/LouisMazel/relizy/commit/1ef5a67))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.0.0...v1.0.1

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.0.0...v1.0.1)

### 💅 Refactors

- Add projectName config option ([08ca6a5](https://github.com/LouisMazel/relizy/commit/08ca6a5))

  Allows overriding the package name from root package.json for Twitter (X) and Slack posts.
  Use `projectName` in your config to customize the displayed name in social notifications.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.3.0...v1.0.0

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.3.0...v1.0.0)

### 🚀 Features

- Add automatic Twitter posting for releases ([0e2062a](https://github.com/LouisMazel/relizy/commit/0e2062a))

  Add functionality to automatically post release announcements
  to Twitter when a new version is published.
  - New Twitter integration module (src/core/twitter.ts) with:
    - Twitter credentials management from environment variables
    - Tweet message formatting with customizable templates
    - Release URL generation for GitHub/GitLab
    - Changelog summary extraction
    - Smart truncation to fit Twitter's 280 character limit
  - Configuration support:
    - release.twitter option to enable/disable Twitter posting
    - templates.twitterMessage for custom tweet templates
    - Environment variables for Twitter API credentials:
      - TWITTER_API_KEY / RELIZY_TWITTER_API_KEY
      - TWITTER_API_SECRET / RELIZY_TWITTER_API_SECRET
      - TWITTER_ACCESS_TOKEN / RELIZY_TWITTER_ACCESS_TOKEN
      - TWITTER_ACCESS_TOKEN_SECRET / RELIZY_TWITTER_ACCESS_TOKEN_SECRET
  - CLI support:
    - --twitter flag for the release command to enable Twitter posting
    - Hooks support: before:twitter, success:twitter, error:twitter
  - Integration:
    - Added as Step 7/7 in the release workflow
    - Non-blocking: Twitter posting failures won't fail the release
    - Dry-run support for testing
  - Added twitter-api-v2 for Twitter API integration
    Enable Twitter posting with environment variables set:
    relizy release --twitter
    Or configure in relizy.config.ts:
    export default defineConfig({
    release: {
    twitter: true
    }
    })

- Add option to skip Twitter posts for prerelease versions ([d068175](https://github.com/LouisMazel/relizy/commit/d068175))

  Add twitterOnlyStable option to control whether prerelease versions
  (alpha, beta, rc, etc.) should be posted to Twitter.
  - New configuration option release.twitterOnlyStable (default: true)
    - When enabled, only stable versions will be posted to Twitter
    - Prerelease versions will be skipped automatically
  - CLI flag --no-twitter-only-stable to allow Twitter posts for
    prerelease versions when needed
  - Updated handleTwitterPost function to check if version is
    a prerelease before posting
    By default, Twitter posting is now limited to stable versions only.
    Users can override this with:
    - Config: release.twitterOnlyStable: false
    - CLI: --no-twitter-only-stable flag
      Stable release (v1.0.0): Will be posted to Twitter
      Prerelease (v1.0.0-beta.1): Will be skipped (unless configured)

- **release:** ⚠️ Add Slack integration to social media posting ([5cb4fb6](https://github.com/LouisMazel/relizy/commit/5cb4fb6))

  BREAKING CHANGE: Add comprehensive Slack support to social command
  - Add SlackSocialConfig, SlackCredentials, SlackOptions types
  - Install @slack/web-api dependency for Slack Web API integration
  - Create src/core/slack.ts with Slack posting functionality
    - Support for rich blocks format (default) or custom templates
    - Automatic markdown to Slack mrkdwn conversion
    - Channel and token configuration with environment variable fallback
  - Create src/core/social-utils.ts for shared utilities
    - extractChangelogSummary() for changelog condensing
    - getReleaseUrl() for release URL generation
    - Shared between Twitter and Slack implementations
  - Add changelogUrl to SocialConfig for full changelog links
  - Update Twitter integration to support changelogUrl
  - Integrate Slack into social.ts with handleSlackPost()
    - Add safety checks for Slack credentials and channel
    - Support for before:slack, success:slack, error:slack hooks
    - Skip prerelease versions with onlyStable option
  - Add default Slack configuration and templates
  - Add 'slack' to HookStep type for hook support
    Features:
  - Post release announcements to any Slack workspace
  - Rich interactive messages with buttons (View Release, Full Changelog)
  - Configurable channel (supports both names and IDs)
  - Template support for custom message formatting
  - Smart changelog condensing with full changelog links
  - Dry-run support for testing

- **release:** Add partial Bitbucket support ([b7f1d3c](https://github.com/LouisMazel/relizy/commit/b7f1d3c))

  Add Bitbucket as a supported Git provider with limited functionality.
  Bitbucket does not have a releases API like GitHub/GitLab, so releases
  are skipped for Bitbucket repositories.
  Changes:
  - Add 'bitbucket' to GitProvider type
  - Update detectGitProvider() to detect Bitbucket repositories
    - Checks for 'bitbucket.org' or 'bitbucket' in remote URL
  - Update getReleaseUrl() to generate Bitbucket tag URLs
    - Format: https://{domain}/{repo}/commits/tag/{tag}
  - Update providerReleaseSafetyCheck() to handle Bitbucket
    - Shows informative warning that releases are not supported
    - Allows other features (versioning, changelog, publishing, social) to work
  - Update providerRelease() to skip release creation for Bitbucket
    - Returns empty postedReleases array
    - Logs clear warning messages
    - Still triggers success hooks
      Bitbucket support includes:
      ✅ Git provider detection
      ✅ Tag URLs for social media posts
      ✅ Compare URLs in changelog (via changelogen 0.6.2+)
      ✅ Versioning, changelog generation
      ✅ NPM publishing
      ✅ Social media posting (Twitter/Slack)
      ❌ Release creation (not available in Bitbucket API)
      The compare URLs in changelogs are automatically handled by changelogen
      which supports Bitbucket format: /branches/compare/{tag2}..{tag1}

- **relizy:** Add global tokens configuration for Twitter and Slack ([0492d3c](https://github.com/LouisMazel/relizy/commit/0492d3c))

  Add centralized token management in the global config.tokens object,
  with priority system for credential resolution.
  Changes:
  - Create Tokens interface in types.ts with support for:
    - github: GitHub token
    - gitlab: GitLab token
    - twitter: Twitter API credentials (apiKey, apiSecret, accessToken, accessTokenSecret)
    - slack: Slack bot token
  - Update RelizyConfig to:
    - Omit 'tokens' from IChangelogConfig (avoid conflict)
    - Add tokens?: Tokens property
  - Update config.ts to populate tokens from environment variables:
    - twitter.apiKey: TWITTER_API_KEY or RELIZY_TWITTER_API_KEY
    - twitter.apiSecret: TWITTER_API_SECRET or RELIZY_TWITTER_API_SECRET
    - twitter.accessToken: TWITTER_ACCESS_TOKEN or RELIZY_TWITTER_ACCESS_TOKEN
    - twitter.accessTokenSecret: TWITTER_ACCESS_TOKEN_SECRET or RELIZY_TWITTER_ACCESS_TOKEN_SECRET
    - slack: SLACK_TOKEN or RELIZY_SLACK_TOKEN
  - Update getTwitterCredentials() to use priority system:
    1. social.twitter.credentials (specific config)
    2. config.tokens.twitter (global config)
    3. Environment variables (handled in config.ts)
  - Update getSlackToken() to use priority system:
    1. social.slack.credentials (specific config)
    2. config.tokens.slack (global config)
    3. Environment variables (handled in config.ts)
  - Update social.ts to pass both credential sources to helpers
    Benefits:
  - Centralized token management
  - Clear priority system (specific > global > env)
  - Consistent with GitHub/GitLab token pattern
  - Users can configure tokens once in config.tokens or per-platform in social.\*
  - Better developer experience with multiple configuration options

- **relizy:** Add Codecov integration with optimal configuration ([810b21c](https://github.com/LouisMazel/relizy/commit/810b21c))
- **docs:** Add contributors section ([38425bd](https://github.com/LouisMazel/relizy/commit/38425bd))
- Improve error reporting for social and provider-release steps ([6d85e7a](https://github.com/LouisMazel/relizy/commit/6d85e7a))

  Social media and provider release failures are now non-blocking and
  provide detailed feedback in the final release summary.
  Changes:
  - Social command returns SocialResult with per-platform details
  - Provider-release returns errors in result instead of throwing
  - Release workflow displays detailed status in final log box
    Example output:
    Social media: 1 succeeded, 1 failed (slack)
    Provider release: Failed: Invalid token
    This allows releases to continue even if external services fail,
    while giving users full visibility into what succeeded or failed.

- `safetyCheck` is enable by default ([aea2dec](https://github.com/LouisMazel/relizy/commit/aea2dec))
- Add config to choose the max length of the twitter post ([7c98abb](https://github.com/LouisMazel/relizy/commit/7c98abb))

### 🩹 Fixes

- **release:** Add optional chaining for createdTags in success logger ([aa7928b](https://github.com/LouisMazel/relizy/commit/aa7928b))
  - Fix TypeError when createdTags is undefined in tests
  - Use optional chaining (createdTags?.length) to safely access length
  - Change fallback text from 'No' to 'None' for clarity
  - Resolves 41 E2E test failures
  - Progress: 692/862 tests passing (80.3%)

- Remove postinstall script ([ac8187a](https://github.com/LouisMazel/relizy/commit/ac8187a))

### 💅 Refactors

- Restructure social media configuration ([064cefb](https://github.com/LouisMazel/relizy/commit/064cefb))

  Refactor the social media posting configuration to be more
  modular and extensible for future platforms.
  - Removed twitter and twitterOnlyStable from ReleaseConfig
  - Added new release.social flag to enable all social media posting
  - Created new SocialConfig interface with platform-specific configs
  - Added social.twitter configuration section with:
    - enabled: Enable/disable Twitter posting
    - onlyStable: Skip prereleases (default: true)
    - messageTemplate: Custom tweet template
    - credentials: Optional Twitter API credentials (falls back to env vars)
  - More scalable architecture for adding new platforms
    (LinkedIn, Slack, Discord, etc.)
  - Cleaner separation of concerns
  - Platform-specific configuration
  - Credentials can be in config or environment variables
    Before:
    release: {
    twitter: true,
    twitterOnlyStable: true
    }
    After:
    release: {
    social: true
    },
    social: {
    twitter: {
    enabled: true,
    onlyStable: true
    }
    }
  - Replaced --twitter flag with --social
  - Removed --no-twitter-only-stable flag (use config instead)
  - Created ResolvedTwitterCredentials type for type safety
  - Updated getTwitterCredentials to accept config credentials
  - Refactored handleTwitterPost to use new config structure
  - Updated release workflow step label to "social media"

- Create standalone social command ([f3bdcd4](https://github.com/LouisMazel/relizy/commit/f3bdcd4))

  Create a dedicated social command that can be used independently
  or as part of the release workflow.
  - Created src/commands/social.ts with:
    - social() function - Main command implementation
    - socialSafetyCheck() - Validates social media credentials
    - handleTwitterPost() - Handles Twitter posting logic
    - Full changelog generation from git commits
  - Added new command: relizy social --from x.x.x --to x.x.x
  - Changed release flag from --social to --no-social
  - Default behavior: social posting is enabled (disable with --no-social)
  - Updated release.ts to call social() command instead of inline logic
  - Integrated socialSafetyCheck() in releaseSafetyCheck()
  - Removed handleTwitterPost from release.ts (moved to social.ts)
  - Changed release.social default from false to true
  - Social posting now enabled by default in release workflow
  - Use --no-social flag to disable during release
  - Added SocialOptions interface for command options
  - Added 'social' to HookStep type for hooks support
  - Modular: Social posting can be used independently
  - Reusable: Same logic in release and standalone command
  - Testable: Easier to test social posting in isolation
  - Extensible: Easy to add new social platforms
  - Safety: Validates credentials before attempting to post
    Standalone:
    relizy social --from v1.0.0 --to v1.1.0
    In release workflow:
    relizy release # Social posting enabled by default
    relizy release --no-social # Disable social posting

- **release:** Use bumpResult fallback when postedReleases unavailable ([f11e75f](https://github.com/LouisMazel/relizy/commit/f11e75f))
  - Add buildPostedReleasesFromBumpResult() to create releases from bump result
  - Implement priority system: postedReleases first, then bumpResult fallback
  - Handle independent, unified, and selective version modes
  - Add comprehensive logging with [social] and [social:twitter] prefixes
  - Ensure social posting works even when GitHub/GitLab releases are disabled
    This allows the social command to function independently of provider releases,
    making it more flexible and reliable in various release configurations.

- Put social dependencies in peerDependencies ([b51c011](https://github.com/LouisMazel/relizy/commit/b51c011))
- **docs:** Add social features to sidebar and navbar ([424cf33](https://github.com/LouisMazel/relizy/commit/424cf33))
- Social - improve format of twitter post ([bea4991](https://github.com/LouisMazel/relizy/commit/bea4991))
- Improve logs of safety check methods ([3c25d6d](https://github.com/LouisMazel/relizy/commit/3c25d6d))
- Improve logs of safety check methods ([e0601d8](https://github.com/LouisMazel/relizy/commit/e0601d8))
- Improve social safety check Checking if twitter-api-v2 and/or @slack/web-api are installed if needed ([d24c49c](https://github.com/LouisMazel/relizy/commit/d24c49c))

### 📖 Documentation

- Add social media integration documentation ([266da58](https://github.com/LouisMazel/relizy/commit/266da58))
  - Simplified README.md with social media features
  - Added comprehensive social media guides (overview, Twitter, Slack)
  - Updated provider-release docs with Bitbucket limitations
  - Fixed release config documentation (providerRelease property)
  - Updated config overview with social tokens

- Add link to CONTRIBUTING.md in README PR guidelines ([af862de](https://github.com/LouisMazel/relizy/commit/af862de))
- Add complete social media documentation and SEO metadata ([9101672](https://github.com/LouisMazel/relizy/commit/9101672))
  - Create docs/src/config/social.md with detailed configuration reference
  - Create docs/src/api/social.md with API documentation and examples
  - Create docs/src/cli/social.md with CLI usage guide
  - Add SEO frontmatter metadata to slack-integration.md guide
  - Add SEO frontmatter metadata to social-media.md guide
  - Add SEO frontmatter metadata to twitter-integration.md guide
  - Document Twitter and Slack configuration options, credentials, templates
  - Include CI/CD integration examples for GitHub Actions and GitLab CI
  - Add troubleshooting sections and complete usage examples

### 📦 Build

- Upgrade dependencies ([e2b07e8](https://github.com/LouisMazel/relizy/commit/e2b07e8))

#### ⚠️ Breaking Changes

- **release:** ⚠️ Add Slack integration to social media posting ([5cb4fb6](https://github.com/LouisMazel/relizy/commit/5cb4fb6))

  BREAKING CHANGE: Add comprehensive Slack support to social command
  - Add SlackSocialConfig, SlackCredentials, SlackOptions types
  - Install @slack/web-api dependency for Slack Web API integration
  - Create src/core/slack.ts with Slack posting functionality
    - Support for rich blocks format (default) or custom templates
    - Automatic markdown to Slack mrkdwn conversion
    - Channel and token configuration with environment variable fallback
  - Create src/core/social-utils.ts for shared utilities
    - extractChangelogSummary() for changelog condensing
    - getReleaseUrl() for release URL generation
    - Shared between Twitter and Slack implementations
  - Add changelogUrl to SocialConfig for full changelog links
  - Update Twitter integration to support changelogUrl
  - Integrate Slack into social.ts with handleSlackPost()
    - Add safety checks for Slack credentials and channel
    - Support for before:slack, success:slack, error:slack hooks
    - Skip prerelease versions with onlyStable option
  - Add default Slack configuration and templates
  - Add 'slack' to HookStep type for hook support
    Features:
  - Post release announcements to any Slack workspace
  - Rich interactive messages with buttons (View Release, Full Changelog)
  - Configurable channel (supports both names and IDs)
  - Template support for custom message formatting
  - Smart changelog condensing with full changelog links
  - Dry-run support for testing

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.0.0-beta.2...v1.0.0-beta.3

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.0.0-beta.2...v1.0.0-beta.3)

### 💅 Refactors

- Improve logs of safety check methods ([0bb788a](https://github.com/LouisMazel/relizy/commit/0bb788a))

### 📦 Build

- Upgrade dependencies ([5336e48](https://github.com/LouisMazel/relizy/commit/5336e48))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.0.0-beta.1...v1.0.0-beta.2

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.0.0-beta.1...v1.0.0-beta.2)

### 🚀 Features

- Add config to choose the max length of the twitter post ([da73a00](https://github.com/LouisMazel/relizy/commit/da73a00))

### 💅 Refactors

- Social - improve format of twitter post ([1043d2a](https://github.com/LouisMazel/relizy/commit/1043d2a))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v1.0.0-beta.0...v1.0.0-beta.1

[compare changes](https://github.com/LouisMazel/relizy/compare/v1.0.0-beta.0...v1.0.0-beta.1)

### 🚀 Features

- `safetyCheck` is enable by default ([075dc4e](https://github.com/LouisMazel/relizy/commit/075dc4e))

### 🩹 Fixes

- Remove postinstall script ([ea98dff](https://github.com/LouisMazel/relizy/commit/ea98dff))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.3.0...v1.0.0-beta.0

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.3.0...v1.0.0-beta.0)

### 🚀 Features

- Add automatic Twitter posting for releases ([684f92b](https://github.com/LouisMazel/relizy/commit/684f92b))

  Add functionality to automatically post release announcements
  to Twitter when a new version is published.
  - New Twitter integration module (src/core/twitter.ts) with:
    - Twitter credentials management from environment variables
    - Tweet message formatting with customizable templates
    - Release URL generation for GitHub/GitLab
    - Changelog summary extraction
    - Smart truncation to fit Twitter's 280 character limit
  - Configuration support:
    - release.twitter option to enable/disable Twitter posting
    - templates.twitterMessage for custom tweet templates
    - Environment variables for Twitter API credentials:
      - TWITTER_API_KEY / RELIZY_TWITTER_API_KEY
      - TWITTER_API_SECRET / RELIZY_TWITTER_API_SECRET
      - TWITTER_ACCESS_TOKEN / RELIZY_TWITTER_ACCESS_TOKEN
      - TWITTER_ACCESS_TOKEN_SECRET / RELIZY_TWITTER_ACCESS_TOKEN_SECRET
  - CLI support:
    - --twitter flag for the release command to enable Twitter posting
    - Hooks support: before:twitter, success:twitter, error:twitter
  - Integration:
    - Added as Step 7/7 in the release workflow
    - Non-blocking: Twitter posting failures won't fail the release
    - Dry-run support for testing
  - Added twitter-api-v2 for Twitter API integration
    Enable Twitter posting with environment variables set:
    relizy release --twitter
    Or configure in relizy.config.ts:
    export default defineConfig({
    release: {
    twitter: true
    }
    })

- Add option to skip Twitter posts for prerelease versions ([e263972](https://github.com/LouisMazel/relizy/commit/e263972))

  Add twitterOnlyStable option to control whether prerelease versions
  (alpha, beta, rc, etc.) should be posted to Twitter.
  - New configuration option release.twitterOnlyStable (default: true)
    - When enabled, only stable versions will be posted to Twitter
    - Prerelease versions will be skipped automatically
  - CLI flag --no-twitter-only-stable to allow Twitter posts for
    prerelease versions when needed
  - Updated handleTwitterPost function to check if version is
    a prerelease before posting
    By default, Twitter posting is now limited to stable versions only.
    Users can override this with:
    - Config: release.twitterOnlyStable: false
    - CLI: --no-twitter-only-stable flag
      Stable release (v1.0.0): Will be posted to Twitter
      Prerelease (v1.0.0-beta.1): Will be skipped (unless configured)

- **release:** ⚠️ Add Slack integration to social media posting ([7a32114](https://github.com/LouisMazel/relizy/commit/7a32114))

  BREAKING CHANGE: Add comprehensive Slack support to social command
  - Add SlackSocialConfig, SlackCredentials, SlackOptions types
  - Install @slack/web-api dependency for Slack Web API integration
  - Create src/core/slack.ts with Slack posting functionality
    - Support for rich blocks format (default) or custom templates
    - Automatic markdown to Slack mrkdwn conversion
    - Channel and token configuration with environment variable fallback
  - Create src/core/social-utils.ts for shared utilities
    - extractChangelogSummary() for changelog condensing
    - getReleaseUrl() for release URL generation
    - Shared between Twitter and Slack implementations
  - Add changelogUrl to SocialConfig for full changelog links
  - Update Twitter integration to support changelogUrl
  - Integrate Slack into social.ts with handleSlackPost()
    - Add safety checks for Slack credentials and channel
    - Support for before:slack, success:slack, error:slack hooks
    - Skip prerelease versions with onlyStable option
  - Add default Slack configuration and templates
  - Add 'slack' to HookStep type for hook support
    Features:
  - Post release announcements to any Slack workspace
  - Rich interactive messages with buttons (View Release, Full Changelog)
  - Configurable channel (supports both names and IDs)
  - Template support for custom message formatting
  - Smart changelog condensing with full changelog links
  - Dry-run support for testing

- **release:** Add partial Bitbucket support ([ff5cd79](https://github.com/LouisMazel/relizy/commit/ff5cd79))

  Add Bitbucket as a supported Git provider with limited functionality.
  Bitbucket does not have a releases API like GitHub/GitLab, so releases
  are skipped for Bitbucket repositories.
  Changes:
  - Add 'bitbucket' to GitProvider type
  - Update detectGitProvider() to detect Bitbucket repositories
    - Checks for 'bitbucket.org' or 'bitbucket' in remote URL
  - Update getReleaseUrl() to generate Bitbucket tag URLs
    - Format: https://{domain}/{repo}/commits/tag/{tag}
  - Update providerReleaseSafetyCheck() to handle Bitbucket
    - Shows informative warning that releases are not supported
    - Allows other features (versioning, changelog, publishing, social) to work
  - Update providerRelease() to skip release creation for Bitbucket
    - Returns empty postedReleases array
    - Logs clear warning messages
    - Still triggers success hooks
      Bitbucket support includes:
      ✅ Git provider detection
      ✅ Tag URLs for social media posts
      ✅ Compare URLs in changelog (via changelogen 0.6.2+)
      ✅ Versioning, changelog generation
      ✅ NPM publishing
      ✅ Social media posting (Twitter/Slack)
      ❌ Release creation (not available in Bitbucket API)
      The compare URLs in changelogs are automatically handled by changelogen
      which supports Bitbucket format: /branches/compare/{tag2}..{tag1}

- **relizy:** Add global tokens configuration for Twitter and Slack ([caf16c4](https://github.com/LouisMazel/relizy/commit/caf16c4))

  Add centralized token management in the global config.tokens object,
  with priority system for credential resolution.
  Changes:
  - Create Tokens interface in types.ts with support for:
    - github: GitHub token
    - gitlab: GitLab token
    - twitter: Twitter API credentials (apiKey, apiSecret, accessToken, accessTokenSecret)
    - slack: Slack bot token
  - Update RelizyConfig to:
    - Omit 'tokens' from IChangelogConfig (avoid conflict)
    - Add tokens?: Tokens property
  - Update config.ts to populate tokens from environment variables:
    - twitter.apiKey: TWITTER_API_KEY or RELIZY_TWITTER_API_KEY
    - twitter.apiSecret: TWITTER_API_SECRET or RELIZY_TWITTER_API_SECRET
    - twitter.accessToken: TWITTER_ACCESS_TOKEN or RELIZY_TWITTER_ACCESS_TOKEN
    - twitter.accessTokenSecret: TWITTER_ACCESS_TOKEN_SECRET or RELIZY_TWITTER_ACCESS_TOKEN_SECRET
    - slack: SLACK_TOKEN or RELIZY_SLACK_TOKEN
  - Update getTwitterCredentials() to use priority system:
    1. social.twitter.credentials (specific config)
    2. config.tokens.twitter (global config)
    3. Environment variables (handled in config.ts)
  - Update getSlackToken() to use priority system:
    1. social.slack.credentials (specific config)
    2. config.tokens.slack (global config)
    3. Environment variables (handled in config.ts)
  - Update social.ts to pass both credential sources to helpers
    Benefits:
  - Centralized token management
  - Clear priority system (specific > global > env)
  - Consistent with GitHub/GitLab token pattern
  - Users can configure tokens once in config.tokens or per-platform in social.\*
  - Better developer experience with multiple configuration options

- **relizy:** Add Codecov integration with optimal configuration ([71f5226](https://github.com/LouisMazel/relizy/commit/71f5226))
- **docs:** Add contributors section ([b5a2a70](https://github.com/LouisMazel/relizy/commit/b5a2a70))
- Improve error reporting for social and provider-release steps ([2c17127](https://github.com/LouisMazel/relizy/commit/2c17127))

  Social media and provider release failures are now non-blocking and
  provide detailed feedback in the final release summary.
  Changes:
  - Social command returns SocialResult with per-platform details
  - Provider-release returns errors in result instead of throwing
  - Release workflow displays detailed status in final log box
    Example output:
    Social media: 1 succeeded, 1 failed (slack)
    Provider release: Failed: Invalid token
    This allows releases to continue even if external services fail,
    while giving users full visibility into what succeeded or failed.

### 🩹 Fixes

- **release:** Add optional chaining for createdTags in success logger ([886b3cd](https://github.com/LouisMazel/relizy/commit/886b3cd))
  - Fix TypeError when createdTags is undefined in tests
  - Use optional chaining (createdTags?.length) to safely access length
  - Change fallback text from 'No' to 'None' for clarity
  - Resolves 41 E2E test failures
  - Progress: 692/862 tests passing (80.3%)

### 💅 Refactors

- Restructure social media configuration ([f6b8384](https://github.com/LouisMazel/relizy/commit/f6b8384))

  Refactor the social media posting configuration to be more
  modular and extensible for future platforms.
  - Removed twitter and twitterOnlyStable from ReleaseConfig
  - Added new release.social flag to enable all social media posting
  - Created new SocialConfig interface with platform-specific configs
  - Added social.twitter configuration section with:
    - enabled: Enable/disable Twitter posting
    - onlyStable: Skip prereleases (default: true)
    - messageTemplate: Custom tweet template
    - credentials: Optional Twitter API credentials (falls back to env vars)
  - More scalable architecture for adding new platforms
    (LinkedIn, Slack, Discord, etc.)
  - Cleaner separation of concerns
  - Platform-specific configuration
  - Credentials can be in config or environment variables
    Before:
    release: {
    twitter: true,
    twitterOnlyStable: true
    }
    After:
    release: {
    social: true
    },
    social: {
    twitter: {
    enabled: true,
    onlyStable: true
    }
    }
  - Replaced --twitter flag with --social
  - Removed --no-twitter-only-stable flag (use config instead)
  - Created ResolvedTwitterCredentials type for type safety
  - Updated getTwitterCredentials to accept config credentials
  - Refactored handleTwitterPost to use new config structure
  - Updated release workflow step label to "social media"

- Create standalone social command ([4c8f20a](https://github.com/LouisMazel/relizy/commit/4c8f20a))

  Create a dedicated social command that can be used independently
  or as part of the release workflow.
  - Created src/commands/social.ts with:
    - social() function - Main command implementation
    - socialSafetyCheck() - Validates social media credentials
    - handleTwitterPost() - Handles Twitter posting logic
    - Full changelog generation from git commits
  - Added new command: relizy social --from x.x.x --to x.x.x
  - Changed release flag from --social to --no-social
  - Default behavior: social posting is enabled (disable with --no-social)
  - Updated release.ts to call social() command instead of inline logic
  - Integrated socialSafetyCheck() in releaseSafetyCheck()
  - Removed handleTwitterPost from release.ts (moved to social.ts)
  - Changed release.social default from false to true
  - Social posting now enabled by default in release workflow
  - Use --no-social flag to disable during release
  - Added SocialOptions interface for command options
  - Added 'social' to HookStep type for hooks support
  - Modular: Social posting can be used independently
  - Reusable: Same logic in release and standalone command
  - Testable: Easier to test social posting in isolation
  - Extensible: Easy to add new social platforms
  - Safety: Validates credentials before attempting to post
    Standalone:
    relizy social --from v1.0.0 --to v1.1.0
    In release workflow:
    relizy release # Social posting enabled by default
    relizy release --no-social # Disable social posting

- **release:** Use bumpResult fallback when postedReleases unavailable ([06909f8](https://github.com/LouisMazel/relizy/commit/06909f8))
  - Add buildPostedReleasesFromBumpResult() to create releases from bump result
  - Implement priority system: postedReleases first, then bumpResult fallback
  - Handle independent, unified, and selective version modes
  - Add comprehensive logging with [social] and [social:twitter] prefixes
  - Ensure social posting works even when GitHub/GitLab releases are disabled
    This allows the social command to function independently of provider releases,
    making it more flexible and reliable in various release configurations.

- Put social dependencies in peerDependencies ([6fcc1cb](https://github.com/LouisMazel/relizy/commit/6fcc1cb))
- **docs:** Add social features to sidebar and navbar ([1e61610](https://github.com/LouisMazel/relizy/commit/1e61610))

### 📖 Documentation

- Add social media integration documentation ([9e72531](https://github.com/LouisMazel/relizy/commit/9e72531))
  - Simplified README.md with social media features
  - Added comprehensive social media guides (overview, Twitter, Slack)
  - Updated provider-release docs with Bitbucket limitations
  - Fixed release config documentation (providerRelease property)
  - Updated config overview with social tokens

- Add link to CONTRIBUTING.md in README PR guidelines ([fe9b08f](https://github.com/LouisMazel/relizy/commit/fe9b08f))
- Add complete social media documentation and SEO metadata ([2548a2c](https://github.com/LouisMazel/relizy/commit/2548a2c))
  - Create docs/src/config/social.md with detailed configuration reference
  - Create docs/src/api/social.md with API documentation and examples
  - Create docs/src/cli/social.md with CLI usage guide
  - Add SEO frontmatter metadata to slack-integration.md guide
  - Add SEO frontmatter metadata to social-media.md guide
  - Add SEO frontmatter metadata to twitter-integration.md guide
  - Document Twitter and Slack configuration options, credentials, templates
  - Include CI/CD integration examples for GitHub Actions and GitLab CI
  - Add troubleshooting sections and complete usage examples

#### ⚠️ Breaking Changes

- **release:** ⚠️ Add Slack integration to social media posting ([7a32114](https://github.com/LouisMazel/relizy/commit/7a32114))

  BREAKING CHANGE: Add comprehensive Slack support to social command
  - Add SlackSocialConfig, SlackCredentials, SlackOptions types
  - Install @slack/web-api dependency for Slack Web API integration
  - Create src/core/slack.ts with Slack posting functionality
    - Support for rich blocks format (default) or custom templates
    - Automatic markdown to Slack mrkdwn conversion
    - Channel and token configuration with environment variable fallback
  - Create src/core/social-utils.ts for shared utilities
    - extractChangelogSummary() for changelog condensing
    - getReleaseUrl() for release URL generation
    - Shared between Twitter and Slack implementations
  - Add changelogUrl to SocialConfig for full changelog links
  - Update Twitter integration to support changelogUrl
  - Integrate Slack into social.ts with handleSlackPost()
    - Add safety checks for Slack credentials and channel
    - Support for before:slack, success:slack, error:slack hooks
    - Skip prerelease versions with onlyStable option
  - Add default Slack configuration and templates
  - Add 'slack' to HookStep type for hook support
    Features:
  - Post release announcements to any Slack workspace
  - Rich interactive messages with buttons (View Release, Full Changelog)
  - Configurable channel (supports both names and IDs)
  - Template support for custom message formatting
  - Smart changelog condensing with full changelog links
  - Dry-run support for testing

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.8...v0.3.0

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.8...v0.3.0)

### 🚀 Features

- Add support of registry token in config.tokens.registry and config.publish.token ([54b2d26](https://github.com/LouisMazel/relizy/commit/54b2d26))

### 🩹 Fixes

- Prevent git state pollution on publish failure ([444006e](https://github.com/LouisMazel/relizy/commit/444006e))

  The release workflow now publishes packages BEFORE creating git commits and tags,
  preventing state pollution when npm publish fails.
  **What changed:**
  - Step order reorganized: Bump → Changelog → Publish → Commit → Tag → Push
  - Automatic rollback of modified files if publish fails (package.json, CHANGELOG.md)
  - Only release-related files are restored, preserving any other local changes
    **Why this matters:**
    Previously, if publish failed (e.g., authentication error, OTP required), the git
    commit and tags were already created and pushed to remote, making it impossible to
    retry cleanly. Now, if publish fails, your repository stays in a clean state and
    you can simply retry the command.
    The rollback is smart: it only restores files that were modified by the bump and
    changelog steps, leaving your other work untouched.

- Detect OTP errors from npm two-factor authentication messages ([596dcfe](https://github.com/LouisMazel/relizy/commit/596dcfe))

  The interactive OTP prompt now works correctly when publishing to npm with
  two-factor authentication enabled. Previously, it would fail to detect OTP
  requirements and throw an error instead of asking for your code.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.7...v0.2.8

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.7...v0.2.8)

### 🩹 Fixes

- Prevent incorrect version bumps from incompatible future tags ([2ca91e4](https://github.com/LouisMazel/relizy/commit/2ca91e4))

  When bumping a stable version (e.g., 4.1.1 → 4.1.2), the system could
  incorrectly use tags from future major versions (e.g., v5.0.0-beta.0) as
  reference points, causing version calculation errors.
  This fix introduces intelligent tag filtering that:
  - Filters out tags with major versions higher than the current version
  - Filters out prerelease tags when bumping stable to stable
  - Preserves prerelease tags when working with prerelease versions
    Usage: No changes required - the filtering is automatic based on your
    current package version.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.6...v0.2.7

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.6...v0.2.7)

### 💅 Refactors

- Log errors in cli ([63d6418](https://github.com/LouisMazel/relizy/commit/63d6418))
- Rename option configName of loadRelizyConfig to configFile ([a720569](https://github.com/LouisMazel/relizy/commit/a720569))

### 📦 Build

- Upgrade dependencies ([16da2f1](https://github.com/LouisMazel/relizy/commit/16da2f1))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5...v0.2.6

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5...v0.2.6)

### 🩹 Fixes

- **docs:** Correct config examples ([07248ad](https://github.com/LouisMazel/relizy/commit/07248ad))
- Config type declaration - types is not required - #11 ([#11](https://github.com/LouisMazel/relizy/issues/11))
- Exclude commits for untracked packages to avoid incorrect version updates ([27e3d91](https://github.com/LouisMazel/relizy/commit/27e3d91))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.6-beta.1...v0.2.6-beta.2

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.6-beta.1...v0.2.6-beta.2)

### 🩹 Fixes

- **docs:** Correct config examples ([50d1998](https://github.com/LouisMazel/relizy/commit/50d1998))
- Config type declaration - types is not required - #11 ([#11](https://github.com/LouisMazel/relizy/issues/11))
- **docs:** Correct config examples ([07248ad](https://github.com/LouisMazel/relizy/commit/07248ad))
- Config type declaration - types is not required - #11 ([#11](https://github.com/LouisMazel/relizy/issues/11))
- Exclude commits for untracked packages to avoid incorrect version updates ([27e3d91](https://github.com/LouisMazel/relizy/commit/27e3d91))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.6-beta.0...v0.2.6-beta.1

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.6-beta.0...v0.2.6-beta.1)

No relevant changes since last release

## v0.2.5...v0.2.6-beta.0

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5...v0.2.6-beta.0)

### 🩹 Fixes

- **docs:** Correct config examples ([50d1998](https://github.com/LouisMazel/relizy/commit/50d1998))
- Config type declaration - types is not required - #11 ([#11](https://github.com/LouisMazel/relizy/issues/11))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.4...v0.2.5

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.4...v0.2.5)

### 🚀 Features

- Add option to skip git tag creation during release ([5fe056d](https://github.com/LouisMazel/relizy/commit/5fe056d))

  Allow users to disable tag creation during release using the
  `--no-git-tag` flag. Useful when you want to publish and push
  commits without creating git tags.
  Usage: relizy release --no-git-tag

- **docs:** Document gitTag option and improve release examples ([13f9d32](https://github.com/LouisMazel/relizy/commit/13f9d32))
- Publish - add optional safety check to check package registry authentication ([0d9c2e0](https://github.com/LouisMazel/relizy/commit/0d9c2e0))
  - Only for npm and pnpm (not yarn and bun)
  - Is disabled by default
  - To enable it, set 'config.publish.safety' to true

### 🩹 Fixes

- Changelog generation with wrong tags ([15154ad](https://github.com/LouisMazel/relizy/commit/15154ad))
- Exclude modify files from commit body ([9f60547](https://github.com/LouisMazel/relizy/commit/9f60547))
- Improve checking of package to bump before running release ([f70e1eb](https://github.com/LouisMazel/relizy/commit/f70e1eb))
- Do not compute new version of root package in independent mode ([17a6ff2](https://github.com/LouisMazel/relizy/commit/17a6ff2))
- Get github user profiles only if its github release ([d38e61e](https://github.com/LouisMazel/relizy/commit/d38e61e))
- **docs:** Correct package.json config example ([0ac9b1b](https://github.com/LouisMazel/relizy/commit/0ac9b1b))
- Publish - print new version instead the old in publish log ([ead28af](https://github.com/LouisMazel/relizy/commit/ead28af))
- Don't throw an error when a folder in glob patterns has not package.json, ignore the package instead ([0f341aa](https://github.com/LouisMazel/relizy/commit/0f341aa))
- Don't throw an error when a folder in glob patterns has not package.json, ignore the package instead ([271ce5f](https://github.com/LouisMazel/relizy/commit/271ce5f))
- Bump - don't exit with error when no relevant commits to bump ([a5a58f5](https://github.com/LouisMazel/relizy/commit/a5a58f5))
- Release - errors when release stable version from prerelease ([a86a2e4](https://github.com/LouisMazel/relizy/commit/a86a2e4))

### 💅 Refactors

- Use a log debug when version has changed preid" ([f0e658c](https://github.com/LouisMazel/relizy/commit/f0e658c))
- Improve circular dependencies detection ([bde3725](https://github.com/LouisMazel/relizy/commit/bde3725))
- Bump - improve confirm prompt with data ([c49f111](https://github.com/LouisMazel/relizy/commit/c49f111))
- Improve logs while bumping package version ([89f5f73](https://github.com/LouisMazel/relizy/commit/89f5f73))
- Improve publication logs to know exactly what is being published ([aa602ba](https://github.com/LouisMazel/relizy/commit/aa602ba))

### 📖 Documentation

- **docs:** Improve SEO meta ([06d094c](https://github.com/LouisMazel/relizy/commit/06d094c))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.13...v0.2.5-beta.14

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.13...v0.2.5-beta.14)

### 💅 Refactors

- Improve publication logs to know exactly what is being published ([56e0a9b](https://github.com/LouisMazel/relizy/commit/56e0a9b))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.12...v0.2.5-beta.13

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.12...v0.2.5-beta.13)

### 🚀 Features

- Publish - add optional safety check to check package registry authentication ([ff81c7a](https://github.com/LouisMazel/relizy/commit/ff81c7a))
  - Only for npm and pnpm (not yarn and bun)
  - Is disabled by default
  - To enable it, set 'config.publish.safety' to true

### 💅 Refactors

- Improve logs while bumping package version ([493d403](https://github.com/LouisMazel/relizy/commit/493d403))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.6...v0.2.5-beta.12

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.6...v0.2.5-beta.12)

### 🚀 Features

- Add option to skip git tag creation during release ([9700ccf](https://github.com/LouisMazel/relizy/commit/9700ccf))

  Allow users to disable tag creation during release using the
  `--no-git-tag` flag. Useful when you want to publish and push
  commits without creating git tags.
  Usage: relizy release --no-git-tag

- **docs:** Document gitTag option and improve release examples ([91ee4c3](https://github.com/LouisMazel/relizy/commit/91ee4c3))

### 🩹 Fixes

- **docs:** Correct package.json config example ([2294e31](https://github.com/LouisMazel/relizy/commit/2294e31))
- Publish - print new version instead the old in publish log ([3fc5c07](https://github.com/LouisMazel/relizy/commit/3fc5c07))
- Don't throw an error when a folder in glob patterns has not package.json, ignore the package instead ([757acae](https://github.com/LouisMazel/relizy/commit/757acae))
- Don't throw an error when a folder in glob patterns has not package.json, ignore the package instead ([337303f](https://github.com/LouisMazel/relizy/commit/337303f))
- Bump - don't exit with error when no relevant commits to bump ([f0cf9ce](https://github.com/LouisMazel/relizy/commit/f0cf9ce))
- Release - errors when release stable version from prerelease ([ee87638](https://github.com/LouisMazel/relizy/commit/ee87638))

### 💅 Refactors

- Bump - improve confirm prompt with data ([d8b5788](https://github.com/LouisMazel/relizy/commit/d8b5788))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.6...v0.2.5-beta.10

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.6...v0.2.5-beta.10)

### 🚀 Features

- Add option to skip git tag creation during release ([9700ccf](https://github.com/LouisMazel/relizy/commit/9700ccf))

  Allow users to disable tag creation during release using the
  `--no-git-tag` flag. Useful when you want to publish and push
  commits without creating git tags.
  Usage: relizy release --no-git-tag

- **docs:** Document gitTag option and improve release examples ([91ee4c3](https://github.com/LouisMazel/relizy/commit/91ee4c3))

### 🩹 Fixes

- **docs:** Correct package.json config example ([2294e31](https://github.com/LouisMazel/relizy/commit/2294e31))
- Publish - print new version instead the old in publish log ([3fc5c07](https://github.com/LouisMazel/relizy/commit/3fc5c07))
- Don't throw an error when a folder in glob patterns has not package.json, ignore the package instead ([757acae](https://github.com/LouisMazel/relizy/commit/757acae))
- Don't throw an error when a folder in glob patterns has not package.json, ignore the package instead ([337303f](https://github.com/LouisMazel/relizy/commit/337303f))

### 💅 Refactors

- Bump - improve confirm prompt with data ([d8b5788](https://github.com/LouisMazel/relizy/commit/d8b5788))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.6...v0.2.5-beta.9

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.6...v0.2.5-beta.9)

### 🚀 Features

- Add option to skip git tag creation during release ([9700ccf](https://github.com/LouisMazel/relizy/commit/9700ccf))

  Allow users to disable tag creation during release using the
  `--no-git-tag` flag. Useful when you want to publish and push
  commits without creating git tags.
  Usage: relizy release --no-git-tag

- **docs:** Document gitTag option and improve release examples ([91ee4c3](https://github.com/LouisMazel/relizy/commit/91ee4c3))

### 🩹 Fixes

- **docs:** Correct package.json config example ([2294e31](https://github.com/LouisMazel/relizy/commit/2294e31))
- Publish - print new version instead the old in publish log ([3fc5c07](https://github.com/LouisMazel/relizy/commit/3fc5c07))
- Don't throw an error when a folder in glob patterns has not package.json, ignore the package instead ([757acae](https://github.com/LouisMazel/relizy/commit/757acae))

### 💅 Refactors

- Bump - improve confirm prompt with data ([d8b5788](https://github.com/LouisMazel/relizy/commit/d8b5788))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.6...v0.2.5-beta.8

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.6...v0.2.5-beta.8)

### 🚀 Features

- Add option to skip git tag creation during release ([9700ccf](https://github.com/LouisMazel/relizy/commit/9700ccf))

  Allow users to disable tag creation during release using the
  `--no-git-tag` flag. Useful when you want to publish and push
  commits without creating git tags.
  Usage: relizy release --no-git-tag

- **docs:** Document gitTag option and improve release examples ([91ee4c3](https://github.com/LouisMazel/relizy/commit/91ee4c3))

### 🩹 Fixes

- **docs:** Correct package.json config example ([2294e31](https://github.com/LouisMazel/relizy/commit/2294e31))
- Publish - print new version instead the old in publish log ([3fc5c07](https://github.com/LouisMazel/relizy/commit/3fc5c07))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.6...v0.2.5-beta.7

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.6...v0.2.5-beta.7)

### 🚀 Features

- Add option to skip git tag creation during release ([9700ccf](https://github.com/LouisMazel/relizy/commit/9700ccf))

  Allow users to disable tag creation during release using the
  `--no-git-tag` flag. Useful when you want to publish and push
  commits without creating git tags.
  Usage: relizy release --no-git-tag

- **docs:** Document gitTag option and improve release examples ([91ee4c3](https://github.com/LouisMazel/relizy/commit/91ee4c3))

### 🩹 Fixes

- **docs:** Correct package.json config example ([2294e31](https://github.com/LouisMazel/relizy/commit/2294e31))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.5...v0.2.5-beta.6

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.5...v0.2.5-beta.6)

### 🩹 Fixes

- Get github user profiles only if its github release ([9f7c67c](https://github.com/LouisMazel/relizy/commit/9f7c67c))

### 📖 Documentation

- **docs:** Improve SEO meta ([df629e6](https://github.com/LouisMazel/relizy/commit/df629e6))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.4...v0.2.5-beta.5

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.4...v0.2.5-beta.5)

### 🩹 Fixes

- Do not compute new version of root package in independent mode ([3be33db](https://github.com/LouisMazel/relizy/commit/3be33db))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.3...v0.2.5-beta.4

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.3...v0.2.5-beta.4)

### 💅 Refactors

- Improve circular dependencies detection ([1cd0ec7](https://github.com/LouisMazel/relizy/commit/1cd0ec7))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.2...v0.2.5-beta.3

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.2...v0.2.5-beta.3)

### 🩹 Fixes

- Improve checking of package to bump before running release ([560dbe1](https://github.com/LouisMazel/relizy/commit/560dbe1))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.1...v0.2.5-beta.2

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.1...v0.2.5-beta.2)

### 💅 Refactors

- Use a log debug when version has changed preid" ([1350fc4](https://github.com/LouisMazel/relizy/commit/1350fc4))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.5-beta.0...v0.2.5-beta.1

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.5-beta.0...v0.2.5-beta.1)

### 🩹 Fixes

- Exclude modify files from commit body ([e51fab7](https://github.com/LouisMazel/relizy/commit/e51fab7))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.4...v0.2.5-beta.0

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.4...v0.2.5-beta.0)

### 🩹 Fixes

- Changelog generation with wrong tags ([03f3959](https://github.com/LouisMazel/relizy/commit/03f3959))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.4

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.3...v0.2.4)

### 💅 Refactors

- Add missing 'v' charac before version in default commit message template ([57f5376](https://github.com/LouisMazel/relizy/commit/57f5376))

### 📖 Documentation

- Update README with documentation links ([458ab03](https://github.com/LouisMazel/relizy/commit/458ab03))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.3

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.3-alpha.0...v0.2.3)

### 💅 Refactors

- Use isInCI utility method to disable OTP prompt (npm) ([171f957](https://github.com/LouisMazel/relizy/commit/171f957))
- Use isInCI utility method to disable OTP prompt (npm) ([34f3262](https://github.com/LouisMazel/relizy/commit/34f3262))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.3-alpha.0

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.2...v0.2.3-alpha.0)

### 💅 Refactors

- Use isInCI utility method to disable OTP prompt (npm) ([171f957](https://github.com/LouisMazel/relizy/commit/171f957))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.2

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.2-beta.1...v0.2.2)

### 🩹 Fixes

- Changelog title and compare link generation ([690dcaf](https://github.com/LouisMazel/relizy/commit/690dcaf))
- Handle prerelease version preid changes correctly ([31ab35e](https://github.com/LouisMazel/relizy/commit/31ab35e))

  When changing prerelease preid (e.g. alpha → beta), the function was
  incorrectly detecting the release type from commits and bumping the
  version (e.g. 1.0.0-alpha.5 → 1.1.0-beta.0 instead of 1.0.0-beta.0).
  Now it correctly returns 'prerelease' to keep the version in the same
  release line while only updating the preid identifier.

- Changelog title and compare link generation ([9b8fcfc](https://github.com/LouisMazel/relizy/commit/9b8fcfc))
- Handle prerelease version preid changes correctly ([1e566a9](https://github.com/LouisMazel/relizy/commit/1e566a9))

  When changing prerelease preid (e.g. alpha → beta), the function was
  incorrectly detecting the release type from commits and bumping the
  version (e.g. 1.0.0-alpha.5 → 1.1.0-beta.0 instead of 1.0.0-beta.0).
  Now it correctly returns 'prerelease' to keep the version in the same
  release line while only updating the preid identifier.

### 💅 Refactors

- Rename 'after' hook to 'success' ([a0fe54c](https://github.com/LouisMazel/relizy/commit/a0fe54c))

  The 'after' prefix was ambiguous and could be confused with timing.
  'success' is more explicit and clearly indicates that the hook is
  executed when a step completes successfully. This aligns with the
  existing 'error' hook for failed steps.

- Rename 'after' hook to 'success' ([b238ad5](https://github.com/LouisMazel/relizy/commit/b238ad5))

  The 'after' prefix was ambiguous and could be confused with timing.
  'success' is more explicit and clearly indicates that the hook is
  executed when a step completes successfully. This aligns with the
  existing 'error' hook for failed steps.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.2-beta.1

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.2-beta.0...v0.2.2-beta.1)

### 🩹 Fixes

- Handle prerelease version preid changes correctly ([31ab35e](https://github.com/LouisMazel/relizy/commit/31ab35e))

  When changing prerelease preid (e.g. alpha → beta), the function was
  incorrectly detecting the release type from commits and bumping the
  version (e.g. 1.0.0-alpha.5 → 1.1.0-beta.0 instead of 1.0.0-beta.0).
  Now it correctly returns 'prerelease' to keep the version in the same
  release line while only updating the preid identifier.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.2.2-beta.0

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.1-alpha.0...v0.2.2-beta.0)

No relevant changes since last release

## v0.2.1-alpha.0

[compare changes](https://github.com/LouisMazel/relizy/compare/v0.2.0...v0.2.1-alpha.0)

### 🩹 Fixes

- Changelog title and compare link generation ([690dcaf](https://github.com/LouisMazel/relizy/commit/690dcaf))

### 💅 Refactors

- Rename 'after' hook to 'success' ([a0fe54c](https://github.com/LouisMazel/relizy/commit/a0fe54c))

  The 'after' prefix was ambiguous and could be confused with timing.
  'success' is more explicit and clearly indicates that the hook is
  executed when a step completes successfully. This aligns with the
  existing 'error' hook for failed steps.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.1.0...v0.2.0

### 🚀 Features

- **relizy:** Add lifecycle hooks system ([20633be](https://github.com/LouisMazel/relizy/commit/20633be))

  Implement comprehensive lifecycle hooks system allowing users to execute
  custom scripts at specific stages of the release workflow.
  Hooks support:
  - String commands (shell scripts)
  - JavaScript/TypeScript functions
  - Three hook types: before, after, error
  - Six lifecycle steps: bump, changelog, commit-and-tag, push, publish, provider-release
  - Special hook: generate:changelog for customizing changelog generation
    Add CI environment detection utilities (isInCI, getCIName) to support
    conditional hook execution in CI/CD pipelines.

- **relizy:** Add lifecycle hooks system ([eedda3a](https://github.com/LouisMazel/relizy/commit/eedda3a))

  Implement comprehensive lifecycle hooks system allowing users to execute
  custom scripts at specific stages of the release workflow.
  Hooks support:
  - String commands (shell scripts)
  - JavaScript/TypeScript functions
  - Three hook types: before, after, error
  - Six lifecycle steps: bump, changelog, commit-and-tag, push, publish, provider-release
  - Special hook: generate:changelog for customizing changelog generation
    Add CI environment detection utilities (isInCI, getCIName) to support
    conditional hook execution in CI/CD pipelines.

### 💅 Refactors

- **relizy:** Improve type definitions and documentation ([ddd2d82](https://github.com/LouisMazel/relizy/commit/ddd2d82))

  Improve TypeScript type definitions and JSDoc documentation across core modules.
  Export utility types (HookType, HookStep) for external use.
  Clarify configuration interfaces with better naming and comments.

- **relizy:** Improve type definitions and documentation ([4a3792f](https://github.com/LouisMazel/relizy/commit/4a3792f))

  Improve TypeScript type definitions and JSDoc documentation across core modules.
  Export utility types (HookType, HookStep) for external use.
  Clarify configuration interfaces with better naming and comments.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.1.0...v0.2.0-beta.0

### 🚀 Features

- **relizy:** Add lifecycle hooks system ([20633be](https://github.com/LouisMazel/relizy/commit/20633be))

  Implement comprehensive lifecycle hooks system allowing users to execute
  custom scripts at specific stages of the release workflow.
  Hooks support:
  - String commands (shell scripts)
  - JavaScript/TypeScript functions
  - Three hook types: before, after, error
  - Six lifecycle steps: bump, changelog, commit-and-tag, push, publish, provider-release
  - Special hook: generate:changelog for customizing changelog generation
    Add CI environment detection utilities (isInCI, getCIName) to support
    conditional hook execution in CI/CD pipelines.

### 🩹 Fixes

- Exclude resources files (svg, png, etc) from commit body in generated changelog ([6094991](https://github.com/LouisMazel/relizy/commit/6094991))

### 💅 Refactors

- **relizy:** Add lifecycle hooks system ([5b090f6](https://github.com/LouisMazel/relizy/commit/5b090f6))

  Add comprehensive hook system for all release lifecycle events:
  - New hooks: before/after/error for bump, changelog, commit-and-tag, push, publish, provider-release
  - Support both function and shell command hooks
  - Hooks configurable in relizy.config.ts under `hooks` property
  - Automatic hook execution at each lifecycle step

- **relizy:** Add safety checks for provider releases ([c7c37b5](https://github.com/LouisMazel/relizy/commit/c7c37b5))

  Add safety validation before executing provider releases:
  - Check Git provider token availability before release
  - Validate provider type (github/gitlab)
  - New CLI flag: --no-safety-check to disable checks
  - Safety checks configurable via safetyCheck option in config
  - Fail fast with clear error messages when tokens missing

- **relizy:** Make monorepo config optional for standalone packages ([6b3f7ef](https://github.com/LouisMazel/relizy/commit/6b3f7ef))

  Allow relizy to work without monorepo configuration for standalone packages:
  - Config file now optional - falls back to standalone mode
  - loadRelizyConfig renamed from loadMonorepoConfig
  - No error when config file missing (unless --config explicitly provided)
  - Display "standalone" when no versionMode defined
  - Update all imports and type references across codebase

- **relizy:** Improve CLI options and naming consistency ([2473280](https://github.com/LouisMazel/relizy/commit/2473280))

  Improve CLI interface with better naming and new options:
  - Rename --no-release to --no-provider-release for clarity
  - Add --provider flag to manually specify git provider (github/gitlab)
  - Make --config flag optional (defaults to standalone mode)
  - Update all related config properties: release.release → release.providerRelease
  - Consistent option naming across all commands

- **relizy:** Add interactive OTP prompt for npm publish ([cc8233a](https://github.com/LouisMazel/relizy/commit/cc8233a))

  Add automatic OTP handling for npm packages requiring 2FA:
  - Prompt user for OTP when npm returns OTP error
  - Store OTP in session to reuse across multiple package publishes
  - 90-second timeout on OTP input prompt
  - Detect CI environment and fail gracefully without prompting
  - Retry publish with --otp flag after receiving code
  - Support OTP priority: dynamic > session > config

- **relizy:** Extract OTP logic into focused functions ([73eae0b](https://github.com/LouisMazel/relizy/commit/73eae0b))

  Improve code maintainability by breaking down publishPackage:
  - Extract isOtpError(): detect OTP-related errors
  - Extract promptOtpWithTimeout(): handle OTP input with timeout
  - Extract handleOtpError(): manage CI detection and OTP prompting
  - Extract executePublishCommand(): execute npm publish command
  - Reduce complexity of main publishPackage function

- **relizy:** Improve type definitions and documentation ([ddd2d82](https://github.com/LouisMazel/relizy/commit/ddd2d82))

  Improve TypeScript type definitions and JSDoc documentation across core modules.
  Export utility types (HookType, HookStep) for external use.
  Clarify configuration interfaces with better naming and comments.

### 📖 Documentation

- **docs:** Global documentation improvements ([d8572dd](https://github.com/LouisMazel/relizy/commit/d8572dd))
- Update configuration examples and references ([748140a](https://github.com/LouisMazel/relizy/commit/748140a))

  Update documentation to reflect new naming conventions:
  - Replace changelog.config.ts references with relizy.config.ts
  - Update CLAUDE.md config references

- **docs:** Update and improve documentation ([e1eb533](https://github.com/LouisMazel/relizy/commit/e1eb533))
- Add CONTRIBUTING.md doc ([1ec1bea](https://github.com/LouisMazel/relizy/commit/1ec1bea))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v0.0.0...v0.1.0

### 🚀 Features

- Relizy - release manager ([5c41ba1](https://github.com/LouisMazel/relizy/commit/5c41ba1))

### 📖 Documentation

- Add documentation website of Relizy ([ec156b0](https://github.com/LouisMazel/relizy/commit/ec156b0))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))
