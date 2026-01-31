---
title: Social Media Configuration
description: Configure automatic release announcements on Twitter, Slack, and other social media platforms.
keywords: social media config, twitter config, slack config, release announcements, automated posting, social integration
category: Configuration
tags: [config, social, twitter, slack, automation, announcements]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Overview

The `social` configuration allows you to automatically post release announcements to social media platforms when publishing new versions. Relizy currently supports Twitter (X) and Slack, with more platforms planned for the future.

## Prerequisites

Social media integrations require platform-specific peer dependencies:

```bash
# For Twitter integration
pnpm add -D twitter-api-v2

# For Slack integration
pnpm add -D @slack/web-api
```

## Configuration Structure

```ts
interface SocialConfig {
  twitter?: {
    enabled?: boolean
    onlyStable?: boolean
    template?: string
    credentials?: {
      apiKey?: string
      apiKeySecret?: string
      accessToken?: string
      accessTokenSecret?: string
    }
  }
  slack?: {
    enabled?: boolean
    onlyStable?: boolean
    channel?: string
    template?: string
    credentials?: {
      token?: string
    }
  }
  changelogUrl?: string
}
```

## twitter

Configure Twitter (X) integration for posting release announcements.

### twitter.enabled

- **Type:** `boolean`
- **Default:** `false`

Enable or disable Twitter posting:

```ts
export default defineConfig({
  social: {
    twitter: {
      enabled: true,
    },
  },
})
```

### twitter.onlyStable

- **Type:** `boolean`
- **Default:** `true`

Skip Twitter posting for prerelease versions (alpha, beta, rc, etc.). Only stable versions will be posted:

```ts
export default defineConfig({
  social: {
    twitter: {
      enabled: true,
      onlyStable: true, // Don't post beta/alpha releases
    },
  },
})
```

### twitter.template

- **Type:** `string`
- **Default:** Auto-generated from version and changelog

Customize the tweet message template. Available variables:

- `{{projectName}}` - Project name
- `{{version}}` - Release version
- `{{changelog}}` - Changelog summary (truncated to fit Twitter's limit)
- `{{releaseUrl}}` - URL to GitHub/GitLab release
- `{{changelogUrl}}` - URL to full changelog (if configured)

```ts
export default defineConfig({
  social: {
    twitter: {
      enabled: true,
      template: '🚀 {{projectName}} v{{version}} is out!\n\n{{changelog}}\n\n{{releaseUrl}}',
    },
  },
})
```

### twitter.postMaxLength

- **Type:** `number`
- **Default:** `280`

Maximum length of the tweet. The message will be truncated if it exceeds this limit:

```ts
export default defineConfig({
  social: {
    twitter: {
      enabled: true,
      postMaxLength: 280,
    },
  },
})
```

### twitter.credentials

- **Type:** `TwitterCredentials`
- **Default:** Read from environment variables

Twitter API credentials. If not provided, falls back to environment variables:

```ts
export default defineConfig({
  social: {
    twitter: {
      enabled: true,
      credentials: {
        apiKey: process.env.TWITTER_API_KEY,
        apiKeySecret: process.env.TWITTER_API_KEY_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
      },
    },
  },
})
```

**Environment Variables:**

- `TWITTER_API_KEY` or `RELIZY_TWITTER_API_KEY`
- `TWITTER_API_KEY_SECRET` or `RELIZY_TWITTER_API_KEY_SECRET`
- `TWITTER_ACCESS_TOKEN` or `RELIZY_TWITTER_ACCESS_TOKEN`
- `TWITTER_ACCESS_TOKEN_SECRET` or `RELIZY_TWITTER_ACCESS_TOKEN_SECRET`

## slack

Configure Slack integration for posting release notifications to channels.

### slack.enabled

- **Type:** `boolean`
- **Default:** `false`

Enable or disable Slack posting:

```ts
export default defineConfig({
  social: {
    slack: {
      enabled: true,
    },
  },
})
```

### slack.onlyStable

- **Type:** `boolean`
- **Default:** `true`

Skip Slack posting for prerelease versions (alpha, beta, rc, etc.). Only stable versions will be posted:

```ts
export default defineConfig({
  social: {
    slack: {
      enabled: true,
      onlyStable: true, // Don't post beta/alpha releases
    },
  },
})
```

### slack.channel

- **Type:** `string`
- **Required:** Yes (when Slack is enabled)

Slack channel ID or name where release notifications will be posted:

```ts
export default defineConfig({
  social: {
    slack: {
      enabled: true,
      channel: '#releases', // Channel name
      // OR
      channel: 'C1234567890', // Channel ID
    },
  },
})
```

### slack.template

- **Type:** `string`
- **Default:** Auto-generated from version and changelog

Customize the Slack message template. Available variables:

- `{{projectName}}` - Project name
- `{{version}}` - Release version
- `{{changelog}}` - Changelog summary
- `{{releaseUrl}}` - URL to GitHub/GitLab release
- `{{changelogUrl}}` - URL to full changelog (if configured)

```ts
export default defineConfig({
  social: {
    slack: {
      enabled: true,
      channel: '#releases',
      template: '🚀 *{{projectName}} v{{version}}* is now available!\n\n{{changelog}}\n\n<{{releaseUrl}}|View Release>',
    },
  },
})
```

### slack.credentials

- **Type:** `SlackCredentials`
- **Default:** Read from environment variables

Slack Bot Token or User OAuth Token. If not provided, falls back to environment variables:

```ts
export default defineConfig({
  social: {
    slack: {
      enabled: true,
      channel: '#releases',
      credentials: {
        token: process.env.SLACK_TOKEN,
      },
    },
  },
})
```

**Environment Variables:**

- `SLACK_TOKEN` or `RELIZY_SLACK_TOKEN`

**Required Scopes:**

- `chat:write` - Post messages to channels
- `chat:write.public` - Post to public channels (if using public channels)

## changelogUrl

- **Type:** `string`
- **Optional**

URL to your full changelog (e.g., hosted documentation). This URL will be included in social media posts:

```ts
export default defineConfig({
  social: {
    changelogUrl: 'https://example.com/changelog',
    twitter: {
      enabled: true,
    },
    slack: {
      enabled: true,
      channel: '#releases',
    },
  },
})
```

## Complete Examples

### Twitter Only

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  social: {
    twitter: {
      enabled: true,
      onlyStable: true,
      template: '🎉 {{projectName}} v{{version}} released!\n\n{{changelog}}\n\n📖 {{releaseUrl}}',
    },
    changelogUrl: 'https://myproject.com/changelog',
  },
})
```

### Slack Only

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  social: {
    slack: {
      enabled: true,
      onlyStable: false, // Post all releases including prereleases
      channel: '#releases',
      template: '🚀 *{{projectName}} v{{version}}*\n\n{{changelog}}\n\n<{{releaseUrl}}|View on GitHub>',
    },
    changelogUrl: 'https://myproject.com/changelog',
  },
})
```

### Both Twitter and Slack

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  social: {
    twitter: {
      enabled: true,
      onlyStable: true,
    },
    slack: {
      enabled: true,
      onlyStable: false,
      channel: '#releases',
    },
    changelogUrl: 'https://myproject.com/changelog',
  },
})
```

### Using Environment Variables

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  social: {
    twitter: {
      enabled: process.env.ENABLE_TWITTER === 'true',
      credentials: {
        apiKey: process.env.TWITTER_API_KEY,
        apiKeySecret: process.env.TWITTER_API_KEY_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
      },
    },
    slack: {
      enabled: process.env.ENABLE_SLACK === 'true',
      channel: process.env.SLACK_CHANNEL || '#releases',
      credentials: {
        token: process.env.SLACK_TOKEN,
      },
    },
  },
})
```

### With Alternative Token Configuration

Relizy also supports the `tokens` configuration for credentials:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  tokens: {
    twitter: {
      apiKey: process.env.TWITTER_API_KEY,
      apiKeySecret: process.env.TWITTER_API_KEY_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    },
    slack: process.env.SLACK_TOKEN,
  },
  social: {
    twitter: {
      enabled: true,
    },
    slack: {
      enabled: true,
      channel: '#releases',
    },
  },
})
```

## Integration with Release Workflow

Social media posting is automatically triggered when you enable it in the `release` configuration:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    social: true, // Enable social posting in release workflow
  },
  social: {
    twitter: {
      enabled: true,
    },
    slack: {
      enabled: true,
      channel: '#releases',
    },
  },
})
```

Then run:

```bash
relizy release --patch
```

This will:

1. Bump version
2. Generate changelog
3. Create git commit and tag
4. Push to remote
5. Create GitHub/GitLab release
6. Publish to npm
7. **Post to Twitter and Slack** ✨

## Standalone Usage

You can also post to social media independently using the `social` command:

```bash
relizy social --from v1.0.0 --to v1.1.0
```

See the [CLI reference](../cli/social.md) for more details.

## See Also

- [Twitter Integration Guide](../guide/twitter-integration.md)
- [Slack Integration Guide](../guide/slack-integration.md)
- [Social Media Overview](../guide/social-media.md)
- [Release Configuration](./release.md)
- [Hooks Configuration](./hooks.md)
