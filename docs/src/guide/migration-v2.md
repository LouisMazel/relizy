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

| Change                                                        | Who is affected                                                                                  | Action                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| [Single bump confirmation](#single-bump-confirmation)         | `monorepo.groups`                                                                                | None                                                                          |
| [One social post per platform](#one-social-post-per-platform) | `monorepo.groups`, `independent` mode                                                            | Review the posts                                                              |
| [PR comment](#pr-comment)                                     | `monorepo.groups`                                                                                | None                                                                          |
| [Hooks run once](#hooks-run-once)                             | `monorepo.groups` with `social`, `twitter` or `slack` hooks                                      | Review the hooks                                                              |
| [Release title](#release-title)                               | Custom `twitterMessage`                                                                          | Use <code v-pre>{{releaseTitle}}</code>                                       |
| [New version variable](#new-version-variable)                 | Custom social templates with `monorepo.groups` or `independent` mode                             | Use <code v-pre>{{releaseTitle}}</code> or <code v-pre>{{packageList}}</code> |
| [Every occurrence is replaced](#every-occurrence-is-replaced) | Social templates repeating a variable                                                            | Check the templates                                                           |
| [Version placeholder](#version-placeholder)                   | Templates using <code v-pre>{{version}}</code>                                                   | Use <code v-pre>{{newVersion}}</code>                                         |
| [Prereleases with onlyStable](#prereleases-with-onlystable)   | `onlyStable` with several versions                                                               | None                                                                          |
| [Cancelled prompts](#cancelled-prompts)                       | Programmatic API                                                                                 | Catch `RelizyCancelError`                                                     |
| [Bump confirmation](#bump-confirmation)                       | `confirmBump()`, `planBumps()`                                                                   | Use `displayBump()`, `plan.display()`                                         |
| [Social functions](#social-functions)                         | `formatTweetMessage()`, `postReleaseToTwitter()`, `formatSlackMessage()`, `postReleaseToSlack()` | Pass `variables`                                                              |
| [Version group results](#version-group-results)               | `GroupBumpResult` objects                                                                        | Add `title`                                                                   |

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

### Bump Confirmation

`confirmBump()` only asks, once for every package of the run, and throws a `RelizyCancelError` when refused. `displayBump()` prints a bump. The plans of `planBumps()` have `display()` instead of `confirm()`:

```ts
// v1
for (const plan of plans) {
  await plan.confirm?.()
}

// v2
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

### Social Functions

`formatTweetMessage()`, `postReleaseToTwitter()`, `formatSlackMessage()` and `postReleaseToSlack()` take the `variables` of the template instead of `projectName`, `version`, `releaseUrl` and `changelogUrl`. Build them from the bump result:

```ts
import { formatTweetMessage, getReleaseOverview, getSocialTemplateVariables } from 'relizy'

const overview = getReleaseOverview({ config, bumpResult })
const variables = getSocialTemplateVariables({ overview, releaseUrl, changelogUrl })

const tweet = formatTweetMessage({ template, changelog, postMaxLength: 280, variables })
```

Their `changelog` is the markdown changelog of a single version, or the sections of a release of several versions (`TweetSection[]`, `SlackReleaseSection[]`).

### Version Group Results

`GroupBumpResult` (`bumpResult.groups`) has a `title`: add it to the objects you build yourself, e.g. in tests.

### Hook Context

The function hooks of the steps after the bump get a third parameter when the release is known: its `bumpResult`, and its `release` (the packages and versions by version group). Optional, nothing to change. See [Hooks](../config/hooks.md#parameters).

## Fixes

No action needed:

- The length of a tweet is counted as X counts it: every URL counts 23 characters, an emoji or a CJK character counts 2.
- `social()` applies its `safetyCheck` option: `relizy release` no longer checks the social config twice.
