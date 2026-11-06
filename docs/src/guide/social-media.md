---
title: Social Media
description: Announce each release on Twitter (X) and Slack with Relizy, in one post per platform, with or without AI.
keywords: social media, release announcements, twitter, x, tweet, slack, slack webhook, slack bot, release notifications, relizy social
category: Guide
tags: [guide, social, twitter, x, slack, webhook, announcements, notifications]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## How It Works

`relizy release` posts the release once the provider release is created (see [the steps of a release](./../cli/release.md#steps)). `relizy social` posts it on its own (see [`relizy social`](./../cli/social.md)).

- A platform posts only when `social.<platform>.enabled` is `true`. [`release.social`](./../config/release.md#steps) (`true` by default) runs the step in `relizy release`; `--no-social` and `--canary` skip it.
- A release is announced in **one** post per platform, even when it ships several versions (see [Releases of Several Versions](#releases-of-several-versions)).
- With `onlyStable` (the default of both platforms), the prereleases are not announced.
- Before the bump, the safety check of `relizy release` checks the credentials, the dependencies and the AI provider of the enabled platforms: a missing one fails the release before anything is written. `--no-safety-check` skips it.
- A failed post does not stop the release: it is reported in the summary, and the next steps run.

The options are listed in [Social Configuration](./../config/social.md), the variables of the templates in [Template Variables](./../config/social.md#template-variables).

## Twitter

### 1. Create an X App

1. In the [X Developer Portal](https://developer.x.com), create a project and an app.
2. In the settings of the app, set the permissions to **Read and write**.
3. In **Keys and tokens**, generate the API key and secret, then the access token and secret (generate them after setting the permissions, or they stay read-only).

The X API is paid per use: each tweet consumes credits of your developer account. When they are depleted, X answers `402` and Relizy logs a hint to top them up.

### 2. Install and Enable

```bash
pnpm add -D twitter-api-v2
```

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  social: {
    twitter: {
      enabled: true,
    },
  },
})
```

### 3. Set the Credentials

Set the four credentials as environment variables (`TWITTER_API_KEY`, `TWITTER_API_KEY_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET`, or their `RELIZY_` variants), or in `tokens.twitter`: see [Tokens](./../config/overview.md#tokens). [`social.twitter.credentials`](./../config/social.md#twitter-credentials) overrides them field by field.

### The Tweet

The tweet is [`social.twitter.template`](./../config/social.md#twitter-template), else `templates.twitterMessage`:

```text
📣 {{releaseTitle}}

{{changelog}}

{{releaseUrl}}
{{changelogUrl}}
```

The changelog is the one of the release, without its section headings, its commit references and the bold of the scopes, one commit per line. It fills the space the rest of the template leaves within [`postMaxLength`](./../config/social.md#twitter-postmaxlength) (280 by default), counted as X counts it: a URL counts 23 characters, an emoji or a CJK character counts 2. What does not fit is cut with `...`. A URL not set (no release URL, no `social.changelogUrl`) is removed, with its line when it is alone on it. An `@` followed by a word (`@scope/pkg`) gets a zero-width space, so that X does not mention an account.

For a release of `my-lib` 3.0.0 with two features and a fix:

```text
📣 my-lib 3.0.0 is out!

- core: Add streaming API support
- auth: Implement OAuth2 PKCE
- cache: Fix TTL expiration

https://github.com/acme/my-lib/releases/tag/v3.0.0
```

With AI, the changelog is rewritten as plain text sentences within the same budget (see [AI-Written Posts](#ai-written-posts)).

## Slack

Relizy posts to Slack with an Incoming Webhook or with a bot token:

|                  | Incoming Webhook              | Bot token                                          |
| ---------------- | ----------------------------- | -------------------------------------------------- |
| Setup            | One URL                       | A Slack app, a scope, an invitation in the channel |
| Channel          | The one of the webhook        | `social.slack.channel`                             |
| `@slack/web-api` | Not needed                    | Required                                           |
| Priority         | Used when both are configured | Ignored (with a warning) when a webhook is set     |

Both post the same message.

### Option A: Incoming Webhook

1. In [Slack API Apps](https://api.slack.com/apps), pick or create an app of your workspace.
2. In **Features → Incoming Webhooks**, turn on **Activate Incoming Webhooks**.
3. Click **Add New Webhook to Workspace**, pick the channel, and copy the URL (`https://hooks.slack.com/services/...`).

Set it in `SLACK_WEBHOOK_URL` (or `RELIZY_SLACK_WEBHOOK_URL`, read first), or in [`social.slack.webhookUrl`](./../config/social.md#slack-webhookurl), then enable Slack:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  social: {
    slack: {
      enabled: true,
    },
  },
})
```

A `social.slack.channel` is ignored in this mode (with a warning): the channel is the one of the webhook.

### Option B: Bot Token

1. In [Slack API Apps](https://api.slack.com/apps), click **Create New App** → **From scratch**.
2. In **OAuth & Permissions → Bot Token Scopes**, add `chat:write` (and `chat:write.public` to post in a public channel without inviting the bot).
3. Click **Install to Workspace**, and copy the **Bot User OAuth Token** (`xoxb-...`).
4. Invite the bot in the channel: `/invite @YourBot`.

```bash
pnpm add -D @slack/web-api
```

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  social: {
    slack: {
      enabled: true,
      channel: '#releases', // or a channel ID: 'C1234567890'
    },
  },
})
```

Set the token in `SLACK_TOKEN` or `RELIZY_SLACK_TOKEN`, or in `tokens.slack` (see [Tokens](./../config/overview.md#tokens)). [`social.slack.credentials.token`](./../config/social.md#slack-credentials) overrides it.

### The Message

Without template, the message is made of Slack blocks, in this order:

1. a header, <code v-pre>📣 {{releaseTitle}}</code>;
2. the changelog, converted from markdown to Slack mrkdwn (bold, links as `<url|text>`, bullets as `•`, headings in bold);
3. **📦 Packages**: each released package with its old and new versions (hidden by [`noPackages`](./../config/social.md#slack-nopackages));
4. **❤️ Contributors**: the names of the authors of the commits, without bots nor AI tools (hidden by `noAuthors`, globally or in [`social.slack.noAuthors`](./../config/social.md#slack-noauthors));
5. the buttons **📦 View Release** and **📋 Full Changelog**, when the release URL and [`social.changelogUrl`](./../config/social.md#changelogurl) are known.

[`changelogFormat`](./../config/social.md#slack-changelogformat) sets how much of the changelog is shown:

- `summary` (default): the commit titles, in one block of at most [`postMaxLength`](./../config/social.md#slack-postmaxlength) characters (2500 by default). Beyond, the last commits are replaced with an "… and N more changes" line.
- `full`: the commit bodies (following [`changelog.includeCommitBody`](./../config/changelog.md#includecommitbody)) and the PR and issue links, as Slack rich text: one block per section, the body paragraphs as quotes, its lists as nested lists, its code as code blocks. Slack rejects a message of more than 50 blocks or about 13,200 characters of rich text: Relizy cuts the changelog at the limit (with `…`, even inside a commit body) and announces the commits left out with an "… and N more changes" line. Set `social.changelogUrl` so that **Full Changelog** links to the rest.

```bash
relizy social --slack-format full
```

With a [`template`](./../config/social.md#slack-template) (or `templates.slackMessage`), the message is a single mrkdwn block of at most 3000 characters, written with the mrkdwn syntax of Slack (`*bold*`, `<url|text>`):

```ts
export default defineConfig({
  social: {
    slack: {
      enabled: true,
      template: '*{{releaseTitle}}*\n\n{{changelog}}\n\n{{packages}}\n\n<{{releaseUrl}}|View the release>',
    },
  },
})
```

## Releases of Several Versions

A release ships several versions with [version groups](./version-groups.md), or several packages of an `independent` release. It is announced **once** per platform: <code v-pre>{{releaseTitle}}</code> is `New releases of <projectName>` and <code v-pre>{{newVersion}}</code> is empty, then the changelog has a section per group, the `unified`/`selective` group first. Each section is titled with the title of its group (`<title> <version>` for a `unified`/`selective` group), and lists the packages of an `independent` group with their versions.

**Twitter**: the tweet is filled by priority, so that it never exceeds `postMaxLength`:

1. the version line of every section. When the packages of an `independent` group do not fit, the group is collapsed to `<title>: N packages`, the last groups first;
2. the highlights of the changes, the first sections first: the bullets of a `unified`/`selective` group, the first change of each package of an `independent` group.

An `independent` release of two packages, without version groups:

```text
📣 New releases of acme

• @acme/core 1.3.0: Add streaming API support
• @acme/cli 0.4.1: Fix the exit code of the init command
```

**Slack**: the changelog has a block per section (`summary`), or its title and rich text blocks (`full`): each package of an `independent` group with its old and new versions, then its changelog. The budget of the message (`postMaxLength`, the 3000 characters of a block, the 50 blocks and the size of the payload) is shared between the sections: each one gets what it needs within an equal share, what the small ones leave goes to the others, and each one keeps at least its title and its version lines. The contributors of every group are listed once.

With `onlyStable`, the prereleases are left out of the post, and nothing is posted when every version is a prerelease. A version group with `release: { social: false }` is left out of the posts. See [One Release, Presented by Group](./version-groups.md#one-release-presented-by-group) for a release of several groups.

## AI-Written Posts

With [`ai.social`](./../config/ai.md#social), the AI rewrites the changelog of each enabled platform: plain sentences for Twitter, standard markdown for Slack (converted to mrkdwn by Relizy). The titles, the versions and the links stay as Relizy computes them. A release of several versions is rewritten in **one** call per platform. Setup, preview in dry run and tuning: [AI-Enhanced Changelogs](./ai-changelog.md).

```ts
export default defineConfig({
  ai: {
    social: {
      twitter: { enabled: true },
      slack: { enabled: true },
    },
  },
})
```

## Hooks

The hooks `before:social`, `success:social`, `error:social` run around the posts, and `before:twitter`, `success:twitter`, `error:twitter`, `before:slack`, `success:slack`, `error:slack` around each platform, once per release. A function hook gets the release as third parameter when it is known (in `relizy release`): its `release` lists the packages and versions by group, in the platform hooks what the post announces (without the prereleases left out by `onlyStable`).

```ts
export default defineConfig({
  hooks: {
    'success:slack': (config, dryRun, context) => {
      const packages = context?.release.groups.flatMap(group => group.packages) ?? []
      console.log(`Announced ${packages.length} packages on Slack`)
    },
  },
})
```

See [Hooks](./../config/hooks.md).

## In CI

Pass the credentials as secrets of the job running the release, under the environment variables of [Tokens](./../config/overview.md#tokens). Complete workflows: [GitHub Actions](./github-actions.md), [GitLab CI](./gitlab-ci.md).

```yaml
- run: pnpm exec relizy release --yes
  env:
    TWITTER_API_KEY: ${{ secrets.TWITTER_API_KEY }}
    TWITTER_API_KEY_SECRET: ${{ secrets.TWITTER_API_KEY_SECRET }}
    TWITTER_ACCESS_TOKEN: ${{ secrets.TWITTER_ACCESS_TOKEN }}
    TWITTER_ACCESS_TOKEN_SECRET: ${{ secrets.TWITTER_ACCESS_TOKEN_SECRET }}
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

## Troubleshooting

| Error                                         | Fix                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `Twitter credentials not found`               | Set the four Twitter credentials: the missing ones are listed above the error              |
| `twitter-api-v2 is not installed`             | `pnpm add -D twitter-api-v2`                                                               |
| `403` from X                                  | The app is not **Read and write**, or the access token was generated before: regenerate it |
| `402` from X                                  | The credits of the X developer account are depleted                                        |
| `Slack credentials not found`                 | Set a webhook URL, or a token and `social.slack.channel`                                   |
| `Slack channel not found` (token)             | Set `social.slack.channel`, with its `#`, or its ID                                        |
| `@slack/web-api is not installed` (token)     | `pnpm add -D @slack/web-api`, or use a webhook                                             |
| `Bot is not in the channel` (token)           | `/invite @YourBot` in the channel                                                          |
| `Missing required OAuth scope` (token)        | Add `chat:write` to the bot token scopes, reinstall the app, use the new token             |
| `Slack webhook failed: 404`                   | The webhook URL is invalid or deactivated: create a new one                                |
| `Slack webhook failed` with `invalid_payload` | The message exceeds the limits of Slack: lower `postMaxLength`, or shorten the template    |

To check a post without publishing it, run `relizy social --dry-run`: it shows the tweet with its length and the Slack message.

## See Also

- [Social Configuration](./../config/social.md)
- [`relizy social`](./../cli/social.md)
- [`social()`](./../api/social.md)
- [AI-Enhanced Changelogs](./ai-changelog.md)
