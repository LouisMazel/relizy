---
title: Social Media Integration Overview
description: Automatically announce your releases on social media platforms with Relizy - Twitter, Slack, and more.
keywords: social media integration, automated announcements, twitter slack integration, release notifications, social automation, relizy social
category: Guide
tags: [social, twitter, slack, integration, automation, announcements, notifications]
---

# Social Media Integration

Relizy can automatically announce your releases on social media platforms, keeping your users and team informed without manual work.

## Prerequisites

**Important:** Social media integrations require platform-specific peer dependencies. Install the ones you need:

```bash
# For Twitter integration
pnpm add -D twitter-api-v2

# For Slack integration
pnpm add -D @slack/web-api
```

These dependencies are optional - install only the ones for platforms you want to use. Relizy will show helpful error messages if a required dependency is missing.

## Supported Platforms

- **Twitter (X)** - Post release announcements to your Twitter account
- **Slack** - Send release notifications to Slack channels

## How It Works

When you run the `release` command with social media configured, Relizy will:

1. Detect the new version and generate the changelog
2. Format a message appropriate for each platform
3. Post the announcement automatically

Social media posting is part of the release workflow and runs after:

- Version bumping
- Changelog generation
- Git commit and tag creation
- Provider release (GitHub/GitLab)
- npm publishing

## Quick Setup

Add social media configuration to your `relizy.config.ts`:

```typescript
import { defineConfig } from 'relizy'

export default defineConfig({
  // ... other config

  social: {
    changelogUrl: 'https://github.com/yourusername/yourrepo/blob/main/CHANGELOG.md',

    twitter: {
      enabled: true,
      onlyStable: true, // Only post for stable releases (not prereleases)
    },

    slack: {
      enabled: true,
      channel: '#releases', // or channel ID like 'C1234567890'
      onlyStable: true,
    },
  },
})
```

Set your credentials as environment variables:

```bash
# Twitter
export TWITTER_API_KEY="your-api-key"
export TWITTER_API_KEY_SECRET="your-api-secret"
export TWITTER_ACCESS_TOKEN="your-access-token"
export TWITTER_ACCESS_TOKEN_SECRET="your-access-token-secret"

# Slack
export SLACK_TOKEN="your-slack-bot-token"
```

That's it! Now when you run `relizy release`, your releases will be automatically announced.

## Standalone Social Command

You can also post to social media independently using the `social` command:

```bash
# Post about the latest release
relizy social

# Post about a specific release
relizy social --from v1.0.0 --to v1.1.0
```

## Configuration Options

### Global Options

| Option         | Type     | Description                                          |
| -------------- | -------- | ---------------------------------------------------- |
| `changelogUrl` | `string` | URL to your full changelog (shared across platforms) |

### Platform-Specific Options

Each platform has these common options:

| Option        | Type      | Default | Description                                         |
| ------------- | --------- | ------- | --------------------------------------------------- |
| `enabled`     | `boolean` | `false` | Enable posting to this platform                     |
| `onlyStable`  | `boolean` | `true`  | Only post for stable releases (skip prereleases)    |
| `credentials` | `object`  | -       | Platform credentials (alternative to env variables) |

## Credentials Priority

Credentials are resolved in this order:

1. `social.<platform>.credentials` - Platform-specific credentials in config
2. `tokens.<platform>` - Global tokens in config
3. Environment variables - Standard env vars (e.g., `TWITTER_API_KEY`, `SLACK_TOKEN`)

This allows you to configure credentials in the way that works best for your workflow.

## Skip Social Media Posting

To skip social media posting in the release workflow:

```bash
relizy release --no-social
```

Or disable it in your config:

```typescript
export default defineConfig({
  release: {
    social: false, // Disable social media posting
  },
})
```

## Learn More

- [Twitter Integration Guide](/guide/twitter-integration)
- [Slack Integration Guide](/guide/slack-integration)
- [Release Configuration](/config/release)
