---
title: Social Configuration
description: Options of the release posts on Twitter (X) and Slack - enabling, prereleases, templates and their variables, credentials, Slack format and length.
keywords: social config, twitter config, slack config, social template variables, releaseTitle, slack webhook, slack changelogFormat, postMaxLength, onlyStable, changelogUrl
category: Configuration
tags: [config, social, twitter, slack, templates]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

Setup of the platforms, shape of the posts and troubleshooting: [Social Media](./../guide/social-media.md). In `relizy release`, the posts also need [`release.social`](./release.md#steps) (`true` by default). The credentials can come from the environment or from [`tokens`](./overview.md#tokens).

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  social: {
    changelogUrl: 'https://my-lib.dev/changelog',
    twitter: { enabled: true },
    slack: { enabled: true, changelogFormat: 'full' },
  },
})
```

## twitter

### enabled {#twitter-enabled}

- **Type:** `boolean`
- **Default:** `false`

Post the releases on Twitter (X). Requires `twitter-api-v2`.

### onlyStable {#twitter-onlystable}

- **Type:** `boolean`
- **Default:** `true`

Do not announce the prereleases (`alpha`, `beta`, `rc`...). A post announcing several versions leaves its prereleases out, and nothing is posted when every version is a prerelease.

### template {#twitter-template}

- **Type:** `string`
- **Default:** [`templates.twitterMessage`](#templates): <code v-pre>'📣 {{releaseTitle}}\n\n{{changelog}}\n\n{{releaseUrl}}\n{{changelogUrl}}'</code>

Text of the tweet, with the [template variables](#template-variables). <code v-pre>{{changelog}}</code> gets the space the rest of the template leaves within `postMaxLength`.

### postMaxLength {#twitter-postmaxlength}

- **Type:** `number`
- **Default:** `280`

Maximum length of the tweet, counted as X counts it: a URL counts 23 characters, an emoji or a CJK character counts 2.

### credentials {#twitter-credentials}

- **Type:** `{ apiKey?: string, apiKeySecret?: string, accessToken?: string, accessTokenSecret?: string }`
- **Default:** [`tokens.twitter`](./overview.md#tokens), read from the environment

The `apiKey`, `apiKeySecret`, `accessToken` and `accessTokenSecret` of the X app. Each field set here overrides the one of `tokens.twitter`.

## slack

### enabled {#slack-enabled}

- **Type:** `boolean`
- **Default:** `false`

Post the releases on Slack, through a webhook or a bot token.

### onlyStable {#slack-onlystable}

- **Type:** `boolean`
- **Default:** `true`

Same as [`twitter.onlyStable`](#twitter-onlystable).

### webhookUrl {#slack-webhookurl}

- **Type:** `string`
- **Default:** `RELIZY_SLACK_WEBHOOK_URL`, else `SLACK_WEBHOOK_URL`

[Incoming Webhook](https://api.slack.com/messaging/webhooks) of the channel. When a webhook URL is set, it is used even if a token is set (the token and `channel` are ignored, with a warning), and `@slack/web-api` is not needed.

### channel {#slack-channel}

- **Type:** `string`

Channel of the bot token mode, by name (`#releases`) or by ID (`C1234567890`). Required in this mode, ignored with a webhook.

### credentials {#slack-credentials}

- **Type:** `{ token?: string }`
- **Default:** [`tokens.slack`](./overview.md#tokens), read from the environment

`token`: the Bot User OAuth Token (`xoxb-...`), with the `chat:write` scope. Requires `@slack/web-api` and `channel`.

### changelogFormat {#slack-changelogformat}

- **Type:** `'summary' | 'full'`
- **Default:** `'summary'`
- **CLI:** `--slack-format <format>` of `relizy social` and `relizy release`

- `summary`: the commit titles, in a single mrkdwn block.
- `full`: the commit bodies (following [`changelog.includeCommitBody`](./changelog.md#includecommitbody)) and the PR and issue links, as Slack rich text, cut to the limits of Slack.

### postMaxLength {#slack-postmaxlength}

- **Type:** `number`
- **Default:** `2500` in `summary` format, no limit in `full` format

Maximum length of the changelog in the message. Beyond, `summary` drops the last commits, `full` cuts the changelog where the limit is reached (even inside a commit body); the commits left out are announced with an "… and N more changes" line. In `summary` format, a block never exceeds the 3000 characters of Slack.

### template {#slack-template}

- **Type:** `string`
- **Default:** [`templates.slackMessage`](#templates) (none: the message is made of rich blocks)

Text of the message, in Slack mrkdwn (`*bold*`, `<url|text>`), with the [template variables](#template-variables). The message is then a single block of at most 3000 characters. Without template, the header of the rich blocks is <code v-pre>📣 {{releaseTitle}}</code>.

### noAuthors {#slack-noauthors}

- **Type:** `boolean`
- **Default:** `false`

Hide the contributors on Slack. The global `noAuthors` hides them everywhere, whatever this option.

### noPackages {#slack-nopackages}

- **Type:** `boolean`
- **Default:** `false`

Hide the block listing the released packages with their old and new versions.

## changelogUrl

- **Type:** `string`

URL of the full changelog: <code v-pre>{{changelogUrl}}</code> of the templates, and the **Full Changelog** button of Slack. Not set, the variable is empty.

## Templates

`social.twitter.template` falls back to `templates.twitterMessage`, and `social.slack.template` to `templates.slackMessage`: set the `templates` ones to share them between several configs. See [Commit Templates](./commit-templates.md).

## Template Variables

Every occurrence of a variable is replaced. A URL not known is replaced with an empty string.

| Variable                            | Value                                                                                                                                                                       | Slack only |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| <code v-pre>{{releaseTitle}}</code> | `<name> <version> is out!` when a single version is released (the root version, or a single package of an `independent` release), `New releases of <projectName>` otherwise |            |
| <code v-pre>{{projectName}}</code>  | `projectName` of the config, else the name of the root `package.json`                                                                                                       |            |
| <code v-pre>{{newVersion}}</code>   | The version released, **empty** when several versions are released                                                                                                          |            |
| <code v-pre>{{packageList}}</code>  | `name@version` of the released packages, comma-separated                                                                                                                    |            |
| <code v-pre>{{packageCount}}</code> | Number of released packages                                                                                                                                                 |            |
| <code v-pre>{{changelog}}</code>    | The changelog, fitted to the post; the sections of the versions when several are released                                                                                   |            |
| <code v-pre>{{releaseUrl}}</code>   | The GitHub/GitLab release of the only version, else of the `unified`/`selective` group                                                                                      |            |
| <code v-pre>{{changelogUrl}}</code> | [`social.changelogUrl`](#changelogurl)                                                                                                                                      |            |
| <code v-pre>{{contributors}}</code> | Names of the contributors, one bullet each (empty with `noAuthors`)                                                                                                         | Yes        |
| <code v-pre>{{packages}}</code>     | Released packages with their old and new versions, one bullet each (empty with `noPackages`)                                                                                | Yes        |

Use <code v-pre>{{releaseTitle}}</code> rather than <code v-pre>{{projectName}} {{newVersion}}</code>: it stays right when a release ships several versions.

## Version Groups

A [version group](./monorepo.md#groups) with `release: { social: false }` is left out of the posts. The `social` options are global: one post per platform announces every group.

```ts
export default defineConfig({
  monorepo: {
    groups: [
      { name: 'main', versionMode: 'selective', packages: ['packages/*'] },
      { name: 'internal', versionMode: 'independent', packages: ['internal/*'], release: { social: false } },
    ],
  },
  social: { slack: { enabled: true } },
})
```
