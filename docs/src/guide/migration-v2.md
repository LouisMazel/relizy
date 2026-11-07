---
title: Migrating from v1 to v2
description: What changes in Relizy 2 (version groups released as one release, social templates, programmatic API) and how to upgrade a project from Relizy 1.
keywords: relizy migration, relizy v2, upgrade relizy, breaking changes, releaseTitle, RelizyCancelError, version groups social posts
category: Guide
tags: [guide, migration, upgrade]
---

# {{ $frontmatter.title }}

Relizy 2 releases [version groups](./version-groups.md) as **one** release, presented by group: one bump confirmation, one post per social platform, one PR comment with a table per group. It also fixes the social posts of the `independent` mode and cleans up the programmatic API.

Every project should read the [CLI](#cli) changes (confirmation in CI, push access, exit codes) the new commitlint rule ([AI attribution in commits](#ai-attribution-in-commits)) and the [formatting of the changelogs](#changelog-formatting). The other changes only concern the projects using version groups, custom social templates, renamed or removed options, or the programmatic API.

::: tip Let your AI agent do it
With the [MCP server](./ai-agents.md) of Relizy 2, ask your agent for the `migrate-to-v2` prompt, or let it call the `check_migration` tool: it lists what to change in your config and your code, file by file and line by line, with the fix of each place.
:::

## Upgrade

```bash
pnpm add -D relizy@^2
```

Then review the changes below, and check the next release with `relizy release --dry-run`.

| Change                                                                                | Who is affected                                                                       | Action                                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [Single bump confirmation](#single-bump-confirmation)                                 | `monorepo.groups`                                                                     | None                                                                          |
| [One social post per platform](#one-social-post-per-platform)                         | `monorepo.groups`, `independent` mode                                                 | Review the posts                                                              |
| [PR comment](#pr-comment)                                                             | `monorepo.groups`                                                                     | None                                                                          |
| [Hooks run once](#hooks-run-once)                                                     | `monorepo.groups` with `social`, `twitter` or `slack` hooks                           | Review the hooks                                                              |
| [Release title](#release-title)                                                       | Custom `twitterMessage` or `social.twitter.template`                                  | Use <code v-pre>{{releaseTitle}}</code>                                       |
| [New version variable](#new-version-variable)                                         | Custom social templates with `monorepo.groups` or `independent` mode                  | Use <code v-pre>{{releaseTitle}}</code> or <code v-pre>{{packageList}}</code> |
| [Every occurrence is replaced](#every-occurrence-is-replaced)                         | Templates repeating a variable                                                        | Check the templates                                                           |
| [Arrays replace the defaults](#arrays-replace-the-defaults)                           | Global `bump.dependencyTypes` without `dependencies`                                  | Add `dependencies` to keep the v1 bumps                                       |
| [Changelog linter of commitlint](#changelog-linter-of-commitlint)                     | `commitlint.codeBlocksLinter`                                                         | Rename it `changelogLinter`                                                   |
| [Private packages](#private-packages)                                                 | `monorepo.includePrivates`, `--include-private`, `includePrivates` of the API         | Use `privatePackages`, `--private-packages <mode>`                            |
| [Private app released](#private-app-released)                                         | A single `package.json` marked `private`                                              | Check `relizy release --dry-run`                                              |
| [Removed ignorePackageNames](#removed-ignorepackagenames)                             | `monorepo.ignorePackageNames`                                                         | Use `monorepo.ignored`                                                        |
| [Registry token](#registry-token)                                                     | `publish.token`                                                                       | Use `tokens.registry`                                                         |
| [Repository token](#repository-token)                                                 | `repo.token`                                                                          | Use `tokens.github` or `tokens.gitlab`                                        |
| [Options never read](#options-never-read)                                             | `newVersion`, `publish.packages`                                                      | Remove them                                                                   |
| [Removed publish.private](#removed-private-publish-option)                            | `publish.private`                                                                     | Remove it                                                                     |
| [AI attribution in commits](#ai-attribution-in-commits)                               | `relizy commitlint`                                                                   | Turn off the attribution of the AI tools, or the rule                         |
| [Version placeholder](#version-placeholder)                                           | Templates using <code v-pre>{{version}}</code>                                        | Use <code v-pre>{{newVersion}}</code>                                         |
| [Prereleases with onlyStable](#prereleases-with-onlystable)                           | `onlyStable` with several versions                                                    | None                                                                          |
| [AI on prereleases](#ai-on-prereleases)                                               | `ai.providerRelease` or `ai.social` on prereleases                                    | None, or set `ai.onlyStable: false`                                           |
| [Microsoft Teams](#microsoft-teams)                                                   | A script or a hook posting to Teams, an Office 365 connector                          | Use `social.teams`                                                            |
| [Slack and Twitter announcements](#slack-and-twitter-announcements)                   | A script or a hook posting some versions to Slack                                     | Use `social.slack.announcements` and `exclude`                                |
| [Changelog of the posts](#changelog-of-the-posts)                                     | `social.slack.changelogFormat`                                                        | Rename it `social.slack.changelog`                                            |
| [Confirmation in CI](#confirmation-in-ci)                                             | `relizy release` and `relizy bump` in CI, `release()` and `bump()` without a terminal | Add `--yes` (`yes: true`)                                                     |
| [Push access](#push-access)                                                           | `relizy release` that pushes, in CI                                                   | Give the job the right to push                                                |
| [Exit code of bump](#exit-code-of-bump)                                               | `relizy bump --yes` in scripts or CI                                                  | None, or stop treating the exit code 1 as nothing to bump                     |
| [Exit code of provider-release and social](#exit-code-of-provider-release-and-social) | `relizy provider-release`, `relizy social` in CI                                      | None, or let the step fail                                                    |
| [Cancelled prompts](#cancelled-prompts)                                               | Programmatic API                                                                      | Catch `RelizyCancelError`                                                     |
| [Public API](#public-api)                                                             | Programmatic API                                                                      | Replace the functions and types no longer exported                            |
| [Types entry](#types-entry)                                                           | `relizy/types` imports                                                                | Import from `relizy`                                                          |
| [Release report](#release-report)                                                     | `release()` return value, `buildReleaseSummary()`                                     | Use the report                                                                |
| [Version group results](#version-group-results)                                       | `GroupBumpResult` objects                                                             | Add `title`                                                                   |

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

Same text for the root version. In v1, an `independent` release posted "my-lib 3 packages is out!", or the project name with the version of its only package. Use <code v-pre>{{releaseTitle}}</code> in your own templates too.

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

Every occurrence of a variable of a social template, of `templates.changelogTitle` and of `templates.tagBody` is replaced, instead of the first one only. A template repeating a variable now shows it each time. A `tagBody` repeating <code v-pre>{{newVersion}}</code> is refused: relizy could not read the version back from the tags.

### Version Placeholder

<code v-pre>{{version}}</code> was never a variable of the social templates (some examples of the docs used it): replace it with <code v-pre>{{newVersion}}</code> or <code v-pre>{{releaseTitle}}</code>.

### Prereleases with onlyStable

With `onlyStable` (the default of Slack), a post announcing several versions leaves its prereleases out, instead of posting every version as soon as one is stable. Nothing is posted when every version is a prerelease, as before.

### Microsoft Teams

Relizy 2 posts the releases to Microsoft Teams ([`social.teams`](./../config/social.md#teams)): a card per version, or one per release, with the texts and the buttons of each group or package. A script or a hook posting to Teams can be replaced by it:

1. Map what the script posts to `social.teams`: its texts to [`title`](./../config/social.md#teams-title) and [`message`](./../config/social.md#teams-message), its buttons to [`links`](./../config/social.md#teams-links), its texts per group or package to [`announcements`](./../config/social.md#teams-announcements), the versions it skips to [`exclude`](./../config/social.md#teams-exclude).
2. Keep the URL of the workflow in the same variable: `TEAMS_WEBHOOK_URL`, or its base64 in `TEAMS_WEBHOOK_URL_B64` (both also read with the `RELIZY_` prefix).
3. Check the cards with `relizy social --dry-run`, then remove the script and its job or hook: else the release is announced twice.

Microsoft retired the Office 365 connectors (`https://*.webhook.office.com/...`): a script posting to one fails. Create a Teams workflow instead, see [Microsoft Teams](./social-media.md#microsoft-teams).

### Slack and Twitter Announcements

Relizy 1 announced every version on Slack and Twitter: a project announcing some versions only, or with its own texts, posted to Slack with a script or a hook. Relizy 2 does it:

1. Map what the script posts to `social.slack`: the versions it announces to [`announcements`](./../config/social.md#slack-announcements) (`{ group }` and `{ package }` entries), their texts and links to the `title`, `message` and `links` of each entry, the versions it skips to [`exclude`](./../config/social.md#slack-exclude). On Twitter, [`exclude`](./../config/social.md#twitter-exclude) leaves versions out.
2. Check the message with `relizy social --dry-run`, then remove the script and its job or hook: else the release is announced twice.

Without these options, the posts are unchanged.

### Changelog of the Posts

`social.slack.changelogFormat` is renamed `social.slack.changelog`, as the option of Teams, with the same values (`summary`, `full`): relizy 2 ignores `changelogFormat`. Both take `full`, `summary` and `none` (or `false`, no changelog in the post).

```ts
export default defineConfig({
  social: {
    slack: { enabled: true, changelog: 'full' },
  },
})
```

## Config

### Arrays Replace the Defaults

An array of the config replaces the default one, and the array of the config file when it comes from the CLI, the programmatic API or another layer of the config (the `relizy` key of `package.json`, a config it `extends`), instead of being concatenated with them. In v1, `bump.dependencyTypes: ['peerDependencies']` resolved to `['peerDependencies', 'dependencies']`, `loadRelizyConfig({ overrides: { bump: { dependencyTypes: ['devDependencies'] } } })` could only add to the list of the config file.

If you set the global `bump.dependencyTypes` without `dependencies`, add it to keep bumping the packages for their `dependencies`, as v1 did:

```ts
export default defineConfig({
  bump: {
    // v1 resolved ['peerDependencies'] to ['peerDependencies', 'dependencies']
    dependencyTypes: ['dependencies', 'peerDependencies'],
  },
})
```

### Dependents Only Out of Range

v1 released a dependent on every release of its dependencies. A dependent without commits of its own is now released only when the range it was published with rejects the new version of its dependency ([`bump.dependents`](./../config/bump.md#dependents)): with `workspace:^`, on a major, a minor in `0.x` or a prerelease of the dependency, instead of every release. Set `bump.dependents: 'always'` to keep the behavior of v1, e.g. for a package that bundles its dependency.

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

### Private App Released

A project with a single `package.json` marked `"private": true` (an app, an API) released nothing in v1: its package was skipped as a private package. It is now bumped, tagged, and gets its changelog and its provider release, but is never published, and no registry token is asked. Check what it does with `relizy release --dry-run`.

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

### Repository Token

`repo.token` is removed: set the token of the provider releases and of the PR comment in [`tokens.github` or `tokens.gitlab`](./../config/overview.md#tokens), read from `GITHUB_TOKEN`, `GH_TOKEN`, `GITLAB_TOKEN`... by default, or with `--token`.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  // repo: { provider: 'gitlab', domain: 'gitlab.mycompany.com', repo: 'team/app', token: process.env.MY_TOKEN },
  repo: { provider: 'gitlab', domain: 'gitlab.mycompany.com', repo: 'team/app' },
  tokens: { gitlab: process.env.MY_TOKEN },
})
```

### Registry Token

`publish.token` is removed: it read the same environment variables as [`tokens.registry`](./../config/overview.md#tokens) (`RELIZY_NPM_TOKEN`, `NPM_TOKEN`, `NODE_AUTH_TOKEN`). Set the registry token in `tokens.registry`, or per registry in [`publish.registries[].token`](./../config/publish.md#registries). `--publish-token` and the `token` option of `publish()` now set `tokens.registry`. In `ReleaseOptions`, `token` is only the git token.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  // publish: { token: process.env.MY_NPM_TOKEN },
  tokens: { registry: process.env.MY_NPM_TOKEN },
})
```

### Options Never Read

The root `newVersion` option and `publish.packages` are removed: relizy never read them. Remove them from your config. To leave a package out of the release, use [`monorepo.ignored`](./../config/monorepo.md#ignored).

### Removed Private Publish Option

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

### Changelog Formatting

Without [`changelog.formatCmd`](./../config/changelog.md#formatcmd), the formatter in the dependencies of the root `package.json` (Biome, Prettier, oxfmt, dprint, else ESLint) formats the changelogs written, and only them. If it fails, the release goes on with a warning. `formatCmd` replaces <code v-pre>{{files}}</code> by the paths of the changelogs written, so a command staging the files for lint-staged is no longer needed:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  changelog: {
    // v1: 'git add --all && pnpm lint-staged && git reset'
    formatCmd: 'eslint --fix {{files}}',
    // or false to keep the changelogs as written
  },
})
```

## CLI

### Exit Code of bump

`relizy bump --yes` exits with code `0` when there is nothing to bump, as `relizy release` does, instead of `1`: a CI job running it no longer fails when no commit triggers a bump. Without `--yes`, it fails in CI, see [Confirmation in CI](#confirmation-in-ci). To run something only when a release happens, see [Run Something Only When a Release Happens](./ci-cd.md#run-something-only-when-a-release-happens).

### Confirmation in CI

Without an interactive terminal (CI), the confirmation of the new versions was taken as refused in v1: `relizy release` and `relizy bump` exited with code `0` without releasing anything. They now fail right away with code `1`, `--dry-run` too, and tell to add `--yes`. The programmatic `release()` and `bump()` throw likewise without `yes: true`. The workflow generated by `relizy init` passes it.

```bash
relizy release --yes
```

### Push Access

In CI, Relizy prepares the clone of the job before a release: it fetches the history of a shallow clone, checks out the branch of a detached HEAD, and commits as the person who started the release when the job has no git identity (see [CI/CD](./ci-cd.md)). Before publishing, `relizy release` then checks that the release commit and the tags can be pushed (`git push --dry-run`), `--dry-run` too, and fails with the fix otherwise: give the job the right to push (`permissions: contents: write` on GitHub Actions, a `GITLAB_TOKEN` on GitLab CI). The dry run of a pull request only warns, as its token is read-only. It also only warns when new commits were pushed to the pull request after it started, as their own run previews the release. See [The Push Is Refused](./ci-cd.md#the-push-is-refused).

### Exit Code of provider-release and social

`relizy provider-release` and `relizy social` exit with code `1` when a provider release or a post fails, instead of `0`: a CI job running them now fails. A post that should not fail the job (an optional platform) can be disabled in the config, or the step allowed to fail in the CI (`continue-on-error` on GitHub Actions, `allow_failure` on GitLab CI).

### New Output

The commands show one line per step and end with what they did, the details only with `--log-level verbose` (see [Output](./../cli/commands.md#output)). In CI, the logs of each step are in a collapsible group. The banner is only shown by `relizy init`. A script reading the output can set `RELIZY_REPORTER=classic`, which keeps the logs of the logger, close to the output of relizy 1, or better, read the [report](./../config/release.md#report) of the release.

### Interactive Prompts

The prompts use [@clack/prompts](https://github.com/bombshell-dev/clack) instead of `@inquirer/prompts`: Escape cancels a prompt as Ctrl+C does, and a cancelled prompt throws a `RelizyCancelError` (see [Cancelled Prompts](#cancelled-prompts)).

### Release Summary

`relizy release` ends with a summary of the release: what it contains, what each step did, with the links of what it created (npm pages, provider releases, tweet, pull request), the AI rewrites and the install command. The PR comment of a release and the summary of the GitHub Actions run are this summary: check the PR comment if a tool reads it.

The new [report](./../config/release.md#report) of the release gives it to the CI: on GitHub Actions, by default and in dry-run too, the outputs of the step (`released`, `status`, `version`, `tags`, `packages`, `branch`, `commit`, `dist_tags`, `urls`, `install`, `report`, `summary`) and the summary of the run; with `release.report`, a markdown, JSON or dotenv file (GitLab CI).

### relizy init Writes the CI Workflow

On GitHub or GitLab, `relizy init` writes the release workflow of the CI (`.github/workflows/release.yml`, or a `release` job aside the `.gitlab-ci.yml`), with the permissions and the tokens the config needs. `--no-workflow` skips it. See [relizy init](./../cli/init.md).

### No AI Call in Dry Run

`--dry-run` no longer calls the AI provider (each call costs): the provider release and the social posts keep their raw text, and the output tells that the AI rewrite is simulated. To preview the AI output, add `--ai-preview`:

```bash
relizy release --dry-run --ai-preview
```

### AI on Prereleases

The AI no longer rewrites the prereleases (beta, canary...): their provider release notes and posts keep their raw changelog, without an AI call. To rewrite them as in v1, turn off [`ai.onlyStable`](./../config/ai.md#onlystable), for every target or for one:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  ai: {
    providerRelease: { enabled: true, onlyStable: false },
  },
})
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

| Removed                                                                                          | Instead                                                                                                                                              |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createCommitAndTags()`, `pushCommitAndTags()`                                                   | `release()`, with its `commit`, `gitTag` and `push` options                                                                                          |
| `planBumps()`, `confirmBump()`, `getPackages()`                                                  | `bump()`, with `dryRun` to preview it                                                                                                                |
| `formatTweetMessage()`, `postReleaseToTwitter()`, `formatSlackMessage()`, `postReleaseToSlack()` | `social()`, and the [templates](./../config/social.md) of the posts. A hook gets the packages and versions of the release in its `release` parameter |
| `buildReleaseSummary()`                                                                          | The report returned by `release()`, see [Release report](#release-report)                                                                            |
| `generateChangelog()`, `generateMarkDown()`                                                      | `changelog()`                                                                                                                                        |
| `getDefaultConfig()`, `mergeTypes()`                                                             | `loadRelizyConfig()`, which returns the config with its defaults (`config.types`...)                                                                 |
| `isPrerelease()`                                                                                 | `prerelease()` of [semver](https://github.com/npm/node-semver)                                                                                       |
| `init()`                                                                                         | `relizy init`                                                                                                                                        |
| The helpers of git, npm, the tags, the versions, the dependencies, Slack and X                   | The commands, or the CLI                                                                                                                             |

The types of these internal steps are no longer exported either (`BumpPlan`, `PlannedBumps`, `ResolvedVersionGroup`, `VersionChange`, `OutOfRangePeer`, `ResolvedTags`, `ReleaseTag`, `InitOptions`...). The types of the config, of the options and of the results stay, from `relizy`.

```ts
// v1
const types = Object.keys(mergeTypes(relizyConfig.types, getDefaultConfig().types))

// v2
const config = await loadRelizyConfig()
const types = Object.keys(config.types)
```

### Types Entry

The `relizy/types` entry is removed: import the types from `relizy`.

```ts
// import type { RelizyConfig } from 'relizy/types'
import type { RelizyConfig } from 'relizy'
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
- [`publish.args`](./../config/publish.md#args) is passed to the publish command: it was ignored.
- `bump.clean: false` applies to `relizy release` too, not only to `relizy bump`.
- The `logLevel` of the config applies when `--log-level` is not passed.
- `relizy publish --no-safety-check` skips the safety check of the publication.
- The messages of `templates.commitMessage`, `commitBody` and `tagMessage` are passed to git as they are: a quote, a `$` or a backtick is no longer run by a shell.
- The options given to `bump()`, `changelog()`, `publish()` and `release()` apply: `capZeroMajor`, `outOfRangePeers`, `dependencyTypes`, `includeCommitBody`, `args`, `packageManager`, `safetyCheckTimeout` and `checkWorkspaceDependencies` were ignored.
- `relizy release --provider` creates the provider releases on that provider: it only applied to the safety check. `relizy provider-release` reads `repo.provider`.
- The provider of a self-hosted repository (GitHub Enterprise, self-hosted GitLab) is read from its host when it names the provider, e.g. `gitlab.example.com`.
- The GitLab releases are created with the job token of the CI job (`CI_JOB_TOKEN`) when no other GitLab token is set (`tokens.gitlab`, `RELIZY_GITLAB_TOKEN`, `GITLAB_TOKEN`, `GITLAB_API_TOKEN`): it was sent as a personal access token and refused. A job token cannot comment a merge request: the PR comment asks for a `GITLAB_TOKEN`.
- The PR comment of a release run after the merge (on the push to `main`) comments the pull request it merged: without an open pull request of the branch, the pull request of the commit the release started from is commented. `prComment({ dryRun: true })` returns `false` when no pull request is found.
- `relizy publish` checks the access to the registry even when `release.publish` is `false`; `relizy release` only checks it when it publishes.
- With [`publish.registries`](./../config/publish.md#registries) and without `publish.registry`, the packages are only published to the declared registries: they were also published to the registry of the npm config. A package that no entry covers still goes to the registry of the npm config.
- The canary versions apply `bump.capZeroMajor`: a breaking change of `0.5.2` gives `0.6.0-0.canary-<sha>`, as a release does. `relizy release --canary --no-publish` restores the versions of the `package.json` files.
- A commitlint rule with a tuple without its number (`'header-max-length': [2, 'always']`) is an error of the config: the rule never reported anything.
- The social posts: the changelog of a Slack template is in Slack's format (mrkdwn), the summary without AI keeps the lines of the changelog instead of cutting it by sentences, a template line holding only a URL that is not set is removed, and a Slack post of several versions lists each package once.
- A repository without `origin` remote no longer shows the error of git.
