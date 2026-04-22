---
title: Slack Integration Guide
description: Automatically send release notifications to Slack channels when you publish new versions with Relizy.
keywords: slack integration, slack bot, slack webhook, incoming webhook, release notifications, slack announcements, automated slack posting, relizy slack
category: Guide
tags: [slack, integration, notifications, social, automation, ci-cd, webhook]
---

# Slack Integration

Automatically send release notifications to Slack channels when you publish new versions.

## Choosing Your Setup: Webhook vs Bot Token

Relizy supports two ways to post to Slack. Pick whichever fits your needs:

|                             | Incoming Webhook                             | Bot Token                                         |
| --------------------------- | -------------------------------------------- | ------------------------------------------------- |
| Setup effort                | Paste a single URL                           | Create Slack app, add scopes, install, invite bot |
| Channel                     | Baked into the URL (one channel per webhook) | Configurable per run                              |
| `@slack/web-api` dependency | **Not required**                             | Required (peer dep)                               |
| Multiple channels           | Multiple webhooks needed                     | One token, multiple runs                          |
| Recommended for             | Simple use case, CI/CD announcements         | Flexibility, multi-channel setups                 |

Both modes support the same message formatting, contributors block, AI enhancement, and templates.

## Option A: Incoming Webhook (Recommended)

### 1. Create a webhook URL

1. Go to [Slack API Apps](https://api.slack.com/apps) and pick (or create) an app for your workspace.
2. Navigate to **Features → Incoming Webhooks**.
3. Toggle **Activate Incoming Webhooks** ON.
4. Click **Add New Webhook to Workspace** and pick the target channel.
5. Copy the generated URL (looks like `https://hooks.slack.com/services/T.../B.../...`).

### 2. Configure Relizy

```typescript
import { defineConfig } from 'relizy'

export default defineConfig({
  social: {
    slack: {
      enabled: true,
      webhookUrl: process.env.SLACK_WEBHOOK_URL,
      // channel is NOT needed — it's baked into the URL
    },
  },
})
```

### 3. Set the environment variable

```bash
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
```

Also supported: `RELIZY_SLACK_WEBHOOK_URL` (takes priority over `SLACK_WEBHOOK_URL` when both are set).

That's it — no bot to install, no scopes to manage, no channel invite required.

## Option B: Bot Token

Use this mode if you need to post to multiple channels from one config, or if your Slack workspace doesn't allow incoming webhooks.

### 1. Install the peer dependency

```bash
pnpm add -D @slack/web-api
# or npm install -D @slack/web-api
# or yarn add -D @slack/web-api
```

This dependency is **not** required if you're only using webhook mode.

### 2. Create a Slack App

1. Go to [Slack API Apps](https://api.slack.com/apps) → **Create New App** → From scratch.
2. Give it a name (e.g., "Relizy Release Bot") and pick your workspace.
3. Navigate to **OAuth & Permissions**.
4. Under **Scopes → Bot Token Scopes**, add:
   - `chat:write` (required)
   - `chat:write.public` (optional — only if you want to post in public channels without inviting the bot)
5. Click **Install to Workspace** at the top.
6. Copy the **Bot User OAuth Token** (starts with `xoxb-`).

### 3. Invite the bot to your channel

In your Slack channel:

```
/invite @YourBotName
```

### 4. Configure Relizy

```typescript
import { defineConfig } from 'relizy'

export default defineConfig({
  social: {
    slack: {
      enabled: true,
      channel: '#releases', // or a channel ID like 'C1234567890'
      credentials: {
        token: process.env.SLACK_TOKEN,
      },
    },
  },
})
```

### 5. Set the environment variable

```bash
export SLACK_TOKEN="xoxb-your-bot-token"
```

Also supported: `RELIZY_SLACK_TOKEN`, or `tokens.slack` at config root.

## Priority When Both Are Configured

If **both** `webhookUrl` and `token` are resolved (from config or environment variables), **the webhook takes priority** and the token is ignored. A warning is logged at runtime:

```
⚠️  Slack token is ignored when webhookUrl is set (webhook takes priority).
```

This rule exists so that adding `SLACK_WEBHOOK_URL` to your CI environment is enough to switch from token mode to webhook mode — no config file change required.

```typescript
import { defineConfig } from 'relizy'

// webhookUrl takes priority; token and channel are ignored (with warnings)
export default defineConfig({
  social: {
    slack: {
      enabled: true,
      webhookUrl: process.env.SLACK_WEBHOOK_URL, //      ← used
      credentials: { token: process.env.SLACK_TOKEN }, // ← ignored
      channel: '#releases', //                           ← ignored
    },
  },
})
```

## Packages Block

In monorepo mode, Relizy appends a "📦 Packages" block listing every package bumped in the release with its before → after versions:

```text
📦 Packages

• `@acme/ui-core`: `5.8.0` → `5.9.0-beta.0`
• `@acme/ui-mobile`: `5.8.0` → `5.9.0-beta.0`
• `@acme/ui-nuxt`: `5.8.0` → `5.9.0-beta.0`
• `@acme/utils`: `5.8.0` → `5.9.0-beta.0`
```

Slack mrkdwn does not support tables, so Relizy uses a bullet list with inline code (backticks) — it scales to any number of packages, renders consistently on desktop and mobile, and stays readable when package names are long.

The data shared with the GitHub/GitLab PR comment table: Relizy uses the same internal helper (`collectPackageBumps`) to pick the data, so both views stay consistent — only the rendering differs (GFM table for PR comments, mrkdwn bullet list for Slack).

To hide the packages block:

```typescript
export default defineConfig({
  social: {
    slack: {
      enabled: true,
      webhookUrl: process.env.SLACK_WEBHOOK_URL,
      noPackages: true, // hide the 📦 Packages block
    },
  },
})
```

In standalone (single-package) mode, the block is skipped automatically since the header already shows the new version.

## Contributors Block

Relizy automatically appends a "❤️ Contributors" block to every Slack release message, listing the names of authors who contributed commits in the release range:

```text
❤️ Contributors

• Alice Martin
• Bob Dupont
```

Only names are shown — no emails, no GitHub handles. The block respects two gates:

1. **Global `config.noAuthors`** — if `true`, contributors are hidden everywhere (including GitHub/GitLab releases).
2. **Slack-specific `social.slack.noAuthors`** — if `true`, contributors are hidden **only** on Slack. This cannot override the global setting upward.

```typescript
export default defineConfig({
  noAuthors: false, // global (default): show contributors everywhere
  social: {
    slack: {
      enabled: true,
      webhookUrl: process.env.SLACK_WEBHOOK_URL,
      noAuthors: true, // hide contributors on Slack only
    },
  },
})
```

If you use a custom `template`, include the `{{contributors}}` placeholder to render them (see [Custom Message Template](#custom-message-template)).

## Message Length

By default, the changelog rendered in the Slack message is truncated to **2500 characters**. Slack's hard per-section-block limit is 3000 characters; the default leaves margin for mrkdwn conversion and emoji.

```typescript
import { defineConfig } from 'relizy'

export default defineConfig({
  social: {
    slack: {
      enabled: true,
      webhookUrl: process.env.SLACK_WEBHOOK_URL,
      postMaxLength: 1500, // shorter summary
    },
  },
})
```

Lower this value if you see `invalid_payload` errors in webhook mode.

## Configuration Reference

```typescript
interface SlackConfig {
  enabled?: boolean // default false
  onlyStable?: boolean // default true — skip prereleases
  channel?: string // required in token mode; ignored (with warning) in webhook mode
  webhookUrl?: string // Incoming Webhook URL; takes priority over token
  credentials?: SlackCredentials
  template?: string // custom mrkdwn template
  postMaxLength?: number // default 2500
  noAuthors?: boolean // default false — Slack-specific contributor gate
  noPackages?: boolean // default false — hide the 📦 Packages block
}

interface SlackCredentials {
  token?: string // Bot User OAuth Token (xoxb-...)
}
```

## Channel Format (Token Mode)

In token mode, you can specify the channel in two ways:

```typescript
// Channel name (must include #)
channel: '#releases'

// Channel ID (from Slack, no # needed)
channel: 'C1234567890'
```

To find a channel ID in Slack: Right-click channel → View channel details → Copy channel ID.

## Credential Priority

Credentials resolve in this order:

**For the webhook URL:**

1. `social.slack.webhookUrl` (config)
2. `RELIZY_SLACK_WEBHOOK_URL` (env)
3. `SLACK_WEBHOOK_URL` (env)

**For the bot token:**

1. `social.slack.credentials.token` (config)
2. `tokens.slack` (global config)
3. `RELIZY_SLACK_TOKEN` (env)
4. `SLACK_TOKEN` (env)

**Between modes:** if both a webhook URL and a token are resolved, the webhook wins.

## Message Formatting

Relizy sends rich, interactive messages using Slack Block Kit:

- **Header** — Release version and project name
- **Changelog** — Formatted changelog with markdown converted to mrkdwn
- **Contributors** — "❤️ Contributors" bullet list (unless hidden)
- **Buttons** — Links to the GitHub/GitLab release and the full changelog

### Default Format

Monorepo example (what a real message looks like):

```text
📣 my-awesome-lib 5.9.0-beta.0 is out!

🚀 Features

• [TICKET-1234] add loyalty variant to ListOption
• [TICKET-1234] emit event when card is clicked
• [TICKET-1234] propagate click event and improve a11y

🩹 Fixes

• [TICKET-1234] Fix showCounter on carousel
• Correct histoire setup configuration

📦 Packages

• `@acme/ui-core`: `5.8.0` → `5.9.0-beta.0`
• `@acme/ui-mobile`: `5.8.0` → `5.9.0-beta.0`
• `@acme/ui-nuxt`: `5.8.0` → `5.9.0-beta.0`
• `@acme/utils`: `5.8.0` → `5.9.0-beta.0`

❤️ Contributors

• Alice Martin
• Bob Dupont
• Charlie Nguyen

[View Release] [Full Changelog]
```

Standalone (single-package) example:

```text
📣 my-awesome-package 2.1.0 is out!

✨ Features

• Add new feature X
• Improve component Y

🩹 Fixes

• Fix bug in module Z

❤️ Contributors

• Alice Martin

[View Release] [Full Changelog]
```

### Custom Message Template

For simple text messages instead of rich blocks:

```typescript
export default defineConfig({
  social: {
    slack: {
      enabled: true,
      webhookUrl: process.env.SLACK_WEBHOOK_URL,
      template: '📣 *{{projectName}} {{newVersion}}* is out!\n\n{{changelog}}\n\n{{contributors}}\n\n📦 {{releaseUrl}}',
    },
  },
})
```

### Available Placeholders

- <code v-pre>{{projectName}}</code> — Package name from `package.json`
- <code v-pre>{{newVersion}}</code> — New version number
- <code v-pre>{{changelog}}</code> — Auto-generated changelog (truncated to `postMaxLength`)
- <code v-pre>{{releaseUrl}}</code> — Link to the GitHub/GitLab release
- <code v-pre>{{changelogUrl}}</code> — Link to the full changelog (from `social.changelogUrl`)
- <code v-pre>{{contributors}}</code> — Bullet list of contributor names (empty when `noAuthors` is active or none detected)
- <code v-pre>{{packages}}</code> — Bullet list of bumped packages with before → after versions (empty when `noPackages` is active or in standalone mode)

## Markdown Support

Slack uses mrkdwn. Relizy automatically converts:

- `**bold**` → `*bold*`
- `[link](url)` → `<url|link>`
- `# Header` → `*Header*`
- `## Subheader` → `*Subheader*`

## Skip Prereleases

By default, prereleases (alpha, beta, rc) are skipped. Override:

```typescript
export default defineConfig({
  social: {
    slack: {
      enabled: true,
      webhookUrl: process.env.SLACK_WEBHOOK_URL,
      onlyStable: false, // post all releases including prereleases
    },
  },
})
```

## CI/CD Setup

### GitHub Actions

```yaml
- name: Release
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
  run: pnpm relizy release --yes
```

### GitLab CI

```yaml
release:
  script:
    - pnpm relizy release --yes
  variables:
    SLACK_WEBHOOK_URL: $SLACK_WEBHOOK_URL
```

## Multiple Channels

To post to multiple channels, create multiple webhooks (one per channel) and use hooks to fan out, or combine webhook + token modes in separate runs. Relizy still supports a single channel per configuration.

You can work around this with hooks:

```typescript
export default defineConfig({
  hooks: {
    'success:slack': 'node scripts/notify-additional-channels.js',
  },
})
```

## Troubleshooting

### "Slack credentials not found"

Provide ONE of the following:

- `social.slack.webhookUrl` (or `SLACK_WEBHOOK_URL` env var) — simpler setup
- `social.slack.credentials.token` (or `SLACK_TOKEN` env var) + `social.slack.channel`

### "Slack webhook failed: 404" / `no_service`

The webhook URL is invalid or has been deactivated. Regenerate it from your Slack app's **Incoming Webhooks** settings.

### "Slack webhook failed: 400" / `invalid_payload`

Usually means the message exceeds 3000 characters in a single block. Lower `social.slack.postMaxLength`.

### "Channel Not Found Error" (token mode)

- Channel doesn't exist, or
- Bot hasn't been invited to the channel, or
- Channel name is missing the `#` prefix

Solution: `/invite @YourBotName` in the target channel.

### "Bot is not in the channel" (token mode)

```
/invite @YourBotName
```

### "Missing Scope" (token mode)

1. Go to Slack API Apps → Your App → **OAuth & Permissions**
2. Add `chat:write` under **Bot Token Scopes**
3. Reinstall the app to your workspace
4. Use the new token

### "@slack/web-api is not installed" (token mode only)

```bash
pnpm add -D @slack/web-api
```

Not needed in webhook mode.

## Enterprise Grid Support

Relizy works with Slack Enterprise Grid workspaces in both modes. For token mode, ensure your bot has access to the target workspace. For webhook mode, create the webhook in the relevant workspace.

## AI-Enhanced Slack Messages

Relizy can use AI to format your changelog into polished Slack messages with proper Slack markdown (`*bold*`, `•` bullet points, `code`). Enable AI for Slack:

```typescript
export default defineConfig({
  ai: {
    social: {
      slack: { enabled: true },
    },
  },
  social: {
    slack: {
      enabled: true,
      webhookUrl: process.env.SLACK_WEBHOOK_URL,
    },
  },
})
```

### Tuning with extraGuidelines

Customize the AI's Slack message style:

```typescript
export default defineConfig({
  ai: {
    social: {
      slack: { enabled: true },
    },
    extraGuidelines: 'Group changes by impact level. Highlight breaking changes with ⚠️ emoji. Keep messages scannable for busy developers.',
  },
})
```

### Before/After

**Without AI:**

```text
📣 my-lib 3.0.0 is out!

### 🚀 Enhancements
- **core**: add streaming API support (abc123)
- **auth**: implement OAuth2 PKCE (#45)

### 🩹 Fixes
- **cache**: fix TTL expiration (def456)
```

**With AI:**

```text
📣 *my-lib 3.0.0* is out!

• *Streaming API* — new streaming support in core module
• *OAuth2 PKCE* — improved auth flow security
• *Cache TTL fix* — resolved expiration timing issue
```

You can also use `--ai` / `--no-ai` CLI flags to toggle AI per run:

```bash
relizy social --ai --from v2.0.0 --to v3.0.0
```

Learn more in the [AI-Enhanced Changelogs](/guide/ai-changelog) guide.

## Learn More

- [Social Media Integration Overview](/guide/social-media)
- [Twitter Integration](/guide/twitter-integration)
- [AI-Enhanced Changelogs](/guide/ai-changelog)
- [Slack Incoming Webhooks](https://api.slack.com/messaging/webhooks)
- [Slack Block Kit](https://api.slack.com/block-kit)
