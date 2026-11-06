---
title: Migrating from v1 to v2
description: What changes in Relizy 2 (version groups released as one release, social templates, programmatic API) and how to upgrade a project from Relizy 1.
keywords: relizy migration, relizy v2, upgrade relizy, breaking changes, releaseTitle, RelizyCancelError, version groups social posts
category: Guide
tags: [guide, migration, upgrade]
---

# {{ $frontmatter.title }}

Relizy 2 releases [version groups](./version-groups.md) as **one** release, presented by group: one bump confirmation, one post per social platform, one PR comment with a table per group. It also fixes the social posts of the `independent` mode and cleans up the programmatic API.

Most projects only update their social templates, if they customized them. Without version groups, without custom social templates and without the programmatic API, nothing changes.

::: tip Let your AI agent do it
With the [MCP server](./ai-agents.md) of Relizy 2, ask your agent for the `migrate-to-v2` prompt, or let it call the `check_migration` tool: it lists what to change in your config and your code, file by file and line by line, with the fix of each place.
:::

## Upgrade

```bash
pnpm add -D relizy@^2
```

Then review the changes below, and check the next release with `relizy release --dry-run`.

| Change                                                        | Who is affected                                                      | Action                                                                        |
| ------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [Single bump confirmation](#single-bump-confirmation)         | `monorepo.groups`                                                    | None                                                                          |
| [One social post per platform](#one-social-post-per-platform) | `monorepo.groups`, `independent` mode                                | Review the posts                                                              |
| [PR comment](#pr-comment)                                     | `monorepo.groups`                                                    | None                                                                          |
| [Hooks run once](#hooks-run-once)                             | `monorepo.groups` with `social`, `twitter` or `slack` hooks          | Review the hooks                                                              |
| [Release title](#release-title)                               | Custom `twitterMessage`                                              | Use <code v-pre>{{releaseTitle}}</code>                                       |
| [New version variable](#new-version-variable)                 | Custom social templates with `monorepo.groups` or `independent` mode | Use <code v-pre>{{releaseTitle}}</code> or <code v-pre>{{packageList}}</code> |
| [Every occurrence is replaced](#every-occurrence-is-replaced) | Social templates repeating a variable                                | Check the templates                                                           |
| [Arrays replace the defaults](#arrays-replace-the-defaults)   | `bump.dependencyTypes` without `dependencies`                        | Add `dependencies` to keep the v1 bumps                                       |
| [Removed ignorePackageNames](#removed-ignorepackagenames)     | `monorepo.ignorePackageNames`                                        | Use `monorepo.ignored`                                                        |
| [AI attribution in commits](#ai-attribution-in-commits)       | `relizy commitlint`                                                  | Turn off the attribution of the AI tools, or the rule                         |
| [Version placeholder](#version-placeholder)                   | Templates using <code v-pre>{{version}}</code>                       | Use <code v-pre>{{newVersion}}</code>                                         |
| [Prereleases with onlyStable](#prereleases-with-onlystable)   | `onlyStable` with several versions                                   | None                                                                          |
| [Exit code of bump](#exit-code-of-bump)                       | `relizy bump` in scripts or CI                                       | None, or stop treating the exit code 1 as nothing to bump                     |
| [Cancelled prompts](#cancelled-prompts)                       | Programmatic API                                                     | Catch `RelizyCancelError`                                                     |
| [Public API](#public-api)                                     | Programmatic API                                                     | Replace the functions no longer exported                                      |
| [Release report](#release-report)                             | `release()` return value, `buildReleaseSummary()`                    | Use the report                                                                |
| [Version group results](#version-group-results)               | `GroupBumpResult` objects                                            | Add `title`                                                                   |

## Version Groups

### Single Bump Confirmation

The bump prompt lists the packages of every group, each under its `title`, and asks **once**, instead of once per group. Refusing it writes nothing, as before.

### One Social Post per Platform

A release of several versions (several version groups, or several packages of an `independent` release) is posted **once** per platform, with a section per group, instead of once per group. The AI rewrites the posts in **one** call per platform. See [One Release, Presented by Group](./version-groups.md#one-release-presented-by-group) for the posts and how they fit the limits of Twitter and Slack.

Give each group a `title`, shown in the posts, the PR comment and the bump prompt:

```ts
export default defineConfig({
  monorepo: {
    groups: [
      { name: 'ecosystem', title: 'maz-ui', versionMode: 'selective', packages: ['packages/*'] },
      { name: 'tooling', title: 'Tooling', versionMode: 'independent', packages: ['tooling/*'] },
    ],
  },
})
```

A group with `release: { social: false }` is left out of the posts.

### PR Comment

The PR comment has one table per group, titled with its `title`, its version and its version mode, instead of a single table, when several groups are released.

### Hooks Run Once

The `before`, `success` and `error` hooks of `social`, `twitter` and `slack` run **once** per release, with the config of the release, instead of once per group with the config of the group. A function hook reading `config.monorepo.versionMode` or `config.monorepo.packages` in these hooks now gets the global config: read the release from its third parameter instead (see [Hook Context](#hook-context)).

### Group Options

New options of a version group, all optional:

- `title`: name of the group in the outputs of a release (default: `name`)
- `release.providerRelease` and `release.social`: leave the group out of the provider releases or of the social posts
- `ai.providerRelease`: create the provider releases of the group with or without AI, e.g. to limit the AI calls of an `independent` group (one provider release per package)

## Social Templates

### Release Title

The new <code v-pre>{{releaseTitle}}</code> variable is `<name> <version> is out!` when a single version is released (the root version, or a single package of an `independent` release), and `New releases of <projectName>` when several are. The default `templates.twitterMessage` uses it:

```ts
// v1
'📣 {{projectName}} {{newVersion}} is out!\n\n{{changelog}}\n\n{{releaseUrl}}\n{{changelogUrl}}'
// v2
'📣 {{releaseTitle}}\n\n{{changelog}}\n\n{{releaseUrl}}\n{{changelogUrl}}'
```

Same text for a single version. In v1, an `independent` release posted "my-lib 3 packages is out!", or the project name with the version of its only package. Use <code v-pre>{{releaseTitle}}</code> in your own templates too.

The rich Slack message (without `slackMessage` template) uses <code v-pre>📣 {{releaseTitle}}</code> as header.

### New Version Variable

<code v-pre>{{newVersion}}</code> is the version released, and is **empty** when several versions are released, instead of `3 packages` (or the root version only, with version groups). With version groups or the `independent` mode, replace it in your social templates with <code v-pre>{{releaseTitle}}</code>, or with the new <code v-pre>{{packageList}}</code> (`@scope/a@1.2.0, @scope/b@2.0.1`) and <code v-pre>{{packageCount}}</code>:

```ts
export default defineConfig({
  social: {
    slack: {
      // v1: '*{{projectName}} v{{newVersion}}* is out!\n\n{{changelog}}'
      template: '*{{releaseTitle}}*\n\n{{changelog}}\n\n{{packageList}}',
    },
  },
})
```

### Every Occurrence Is Replaced

Every occurrence of a variable of a social template is replaced, instead of the first one only. A template repeating a variable now shows it each time.

### Version Placeholder

<code v-pre>{{version}}</code> was never a variable of the social templates (some examples of the docs used it): replace it with <code v-pre>{{newVersion}}</code> or <code v-pre>{{releaseTitle}}</code>.

### Prereleases with onlyStable

With `onlyStable` (the default of Slack), a post announcing several versions leaves its prereleases out, instead of posting every version as soon as one is stable. Nothing is posted when every version is a prerelease, as before.

## Config

### Arrays Replace the Defaults

An array of the config replaces the default one, and the array of the config file when it comes from the CLI or the programmatic API, instead of being concatenated with them. In v1, `bump.dependencyTypes: ['peerDependencies']` resolved to `['peerDependencies', 'dependencies']`, `loadRelizyConfig({ overrides: { bump: { dependencyTypes: ['devDependencies'] } } })` could only add to the list of the config file.

If you set `bump.dependencyTypes` (globally or on a version group) without `dependencies`, add it to keep bumping the packages on every bump of their `dependencies`, as v1 did:

```ts
export default defineConfig({
  bump: {
    // v1 resolved ['peerDependencies'] to ['peerDependencies', 'dependencies']
    dependencyTypes: ['dependencies', 'peerDependencies'],
  },
})
```

### Changelog Linter of commitlint

`commitlint.codeBlocksLinter` is renamed [`commitlint.changelogLinter`](./../commitlint/config.md#changeloglinter), with the same values: with ESLint, it checks the whole changelog entry of the commit, not only its code blocks. The type `CommitlintCodeBlocksLinter` is renamed `CommitlintChangelogLinter`.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  commitlint: {
    changelogLinter: 'oxc',
  },
})
```

### Private Packages

`monorepo.includePrivates` is renamed [`monorepo.privatePackages`](./../config/monorepo.md#privatepackages), with named values: `ignore` (default) or `release`. The `--include-private` flag of `bump`, `changelog` and `release` becomes `--private-packages <mode>`, and the `includePrivates` option of `bump()`, `changelog()` and `release()` becomes `privatePackages`.

```ts
import { defineConfig } from 'relizy'

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

### Removed ignorePackageNames

`monorepo.ignorePackageNames`, deprecated in v1, is removed: list the directories of these packages in [`monorepo.ignored`](./../config/monorepo.md#ignored), path globs matched as `monorepo.packages`. relizy 2 refuses to load a config that still sets it, rather than releasing the packages it left out.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: {
    packages: ['packages/*'],
    // ignorePackageNames: ['@scope/legacy'],
    ignored: ['packages/legacy'],
  },
})
```

### Removed publish.private

`publish.private` is removed: relizy never read it, the private packages are never published. Remove it from your config, and set [`monorepo.privatePackages: 'release'`](./../config/monorepo.md#privatepackages) to release them.

### AI Attribution in Commits

`relizy commitlint` has a new rule, [`no-ai-attribution`](./../commitlint/rules.md#no-ai-attribution), on by default (`error`): it rejects the commits crediting an AI tool, with an AI co-author (`Co-authored-by: Claude <noreply@anthropic.com>`), a `Claude-Session:` trailer or a "Generated with" line. Turn off the attribution in the settings of your AI tools, or turn off the rule:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  commitlint: {
    rules: { 'no-ai-attribution': 'off' },
  },
})
```

The changelogs no longer show the git trailers of the commit bodies (`Co-authored-by:`, `Signed-off-by:`, `Closes #12`...), only a `BREAKING CHANGE:` footer, and the AI tools are not credited as contributors.

## CLI

### Exit Code of bump

`relizy bump` exits with code `0` when there is nothing to bump, as `relizy release` does, instead of `1`: a CI job running it no longer fails when no commit triggers a bump. To run something only when a release happens, see [Run Something Only When a Release Happens](./ci-cd.md#run-something-only-when-a-release-happens).

### New Output

The commands show one line per step and end with what they did, the details only with `--log-level verbose` (see [Output](./../cli/commands.md#output)). In CI, the logs of each step are in a collapsible group. The banner is only shown by `relizy init`. A script reading the output of relizy 1 can set `RELIZY_REPORTER=classic`, or read the [report](./../config/release.md#report) of the release instead.

### Interactive Prompts

The prompts use [@clack/prompts](https://github.com/bombshell-dev/clack) instead of `@inquirer/prompts`: a cancelled prompt (Ctrl+C, Escape) still throws a `RelizyCancelError`.

### Release Summary

`relizy release` ends with a summary of the release: what it contains, what each step did, with the links of what it created (npm pages, provider releases, tweet, pull request), the AI rewrites and the install command. The PR comment of a release, the summary of the GitHub Actions run and the new [`release.report.markdown`](./../config/release.md#report) file are this summary, and the report gets the outputs `branch`, `commit`, `dist_tags`, `urls`, `install` and, on GitHub Actions, `summary`. Check the PR comment if a tool reads it.

### No AI Call in Dry Run

`--dry-run` no longer calls the AI provider (each call costs): the provider release and the social posts keep their raw text, and the output tells that the AI rewrite is simulated. To preview the AI output, add `--ai-preview`:

```bash
relizy release --dry-run --ai-preview
```

## Programmatic API

### Cancelled Prompts

A refused or cancelled prompt (bump confirmation, uncommitted changes, rewritten tag) throws a `RelizyCancelError` instead of calling `process.exit()`. Nothing was written, the commands do not run their `error:*` hooks for it and `release()` does not post a failed PR comment. The CLI still exits with code `0`.

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

### Public API

`relizy` only exports the functions of the [programmatic API](./../api/usage.md) and the types:

- The commands: `release()`, `bump()`, `changelog()`, `publish()`, `providerRelease()`, `social()`, `prComment()`, `commitlint()`
- The config: `defineConfig()`, `loadRelizyConfig()`
- The errors: `RelizyCancelError`, `isRelizyCancelError()`
- The commit linter: `lintCommitMessage()`
- The types of the config, of the options and of the results (`RelizyConfig`, `RelizyConfigOverrides`, `LoadRelizyConfigOptions`, `ReleaseOptions`, `BumpResult`, `ReleaseReport`, `HookContext`...)

The other functions were internal steps of the commands, and are no longer exported:

| Removed                                                                                                                                                  | Instead                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createCommitAndTags()`, `pushCommitAndTags()`                                                                                                           | `release()`, with its `commit`, `gitTag` and `push` options                                                                                          |
| `planBumps()`, `confirmBump()`, `displayBump()`, `getPackages()`                                                                                         | `bump()`, with `dryRun` to preview it                                                                                                                |
| `formatTweetMessage()`, `postReleaseToTwitter()`, `formatSlackMessage()`, `postReleaseToSlack()`, `getReleaseOverview()`, `getSocialTemplateVariables()` | `social()`, and the [templates](./../config/social.md) of the posts. A hook gets the packages and versions of the release in its `release` parameter |
| `buildReleaseSummary()`, `formatReleaseReportText()`, `formatReleaseReportMarkdown()`                                                                    | The report returned by `release()`, see [Release report](#release-report)                                                                            |
| `generateChangelog()`, `generateMarkDown()`                                                                                                              | `changelog()`                                                                                                                                        |
| `getDefaultConfig()`, `mergeTypes()`                                                                                                                     | `loadRelizyConfig()`, which returns the config with its defaults (`config.types`...)                                                                 |
| `isPrerelease()`                                                                                                                                         | `prerelease()` of [semver](https://github.com/npm/node-semver)                                                                                       |
| `init()`                                                                                                                                                 | `relizy init`                                                                                                                                        |
| The helpers of git, npm, the tags, the versions, the dependencies, Slack and X                                                                           | The commands, or the CLI                                                                                                                             |

```ts
// v1
const types = Object.keys(mergeTypes(relizyConfig.types, getDefaultConfig().types))

// v2
const config = await loadRelizyConfig()
const types = Object.keys(config.types)
```

### Release Report

`release()` returns the [report of the release](./../config/release.md#report) instead of nothing, and `buildReleaseSummary()` is removed. The summary of the release is written to the outputs and the summary of GitHub Actions, and with `release.report`, to a markdown, JSON or dotenv file (GitLab CI).

```ts
const report = await release({ yes: true })

if (report.released) {
  console.log(`Released ${report.version}: ${report.tags.join(', ')}`)
}
```

### Version Group Results

`GroupBumpResult` (`bumpResult.groups`) has a `title`: add it to the objects you build yourself, e.g. in tests.

### Hook Context

The function hooks of the steps after the bump get a third parameter when the release is known: its `bumpResult`, and its `release` (the packages and versions by version group). Optional, nothing to change. See [Hooks](./../config/hooks.md#parameters).

## Fixes

No action needed:

- The length of a tweet is counted as X counts it: every URL counts 23 characters, an emoji or a CJK character counts 2.
- `social()` applies its `safetyCheck` option: `relizy release` no longer checks the social config twice.
- [`publish.args`](../config/publish.md#args) is passed to the publish command: it was ignored.
- `bump.clean: false` applies to `relizy release` too, not only to `relizy bump`.
- The `logLevel` of the config applies when `--log-level` is not passed.
- `relizy publish --no-safety-check` skips the safety check of the publication.
- The messages of `templates.commitMessage`, `commitBody` and `tagMessage` are passed to git as they are: a quote, a `$` or a backtick is no longer run by a shell.
- A GitHub release authenticates with `repo.token` when `tokens.github` is not set.
