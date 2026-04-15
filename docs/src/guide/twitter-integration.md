---
title: Twitter Integration Guide
description: Automatically post release announcements to Twitter (X) when you publish new versions with Relizy.
keywords: twitter integration, twitter api, tweet automation, release tweets, automated twitter posting, twitter announcements, relizy twitter, x platform
category: Guide
tags: [twitter, x, integration, social, automation, announcements, ci-cd]
---

# Twitter Integration

Automatically post release announcements to Twitter (X) when you publish new versions.

## Prerequisites

**Important:** Relizy requires the `twitter-api-v2` library as a peer dependency. You must install it in your project:

```bash
pnpm add -D twitter-api-v2
# or
npm install -D twitter-api-v2
# or
yarn add -D twitter-api-v2
```

If not installed, Relizy will show an error message when attempting to post to Twitter.

## Setup

### 1. Create a Twitter App

1. Go to the [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Create a new App (or use an existing one)
3. Navigate to "Keys and tokens"
4. Generate your API keys and access tokens

You'll need these credentials:

- API Key (Consumer Key)
- API Secret (Consumer Secret)
- Access Token
- Access Token Secret

### 2. Configure Relizy

Add Twitter configuration to your `relizy.config.ts`:

```typescript
import { defineConfig } from 'relizy'

export default defineConfig({
  social: {
    changelogUrl: 'https://github.com/yourusername/yourrepo/blob/main/CHANGELOG.md',

    twitter: {
      enabled: true,
      onlyStable: true, // Only tweet stable releases (not prereleases)
    },
  },
})
```

### 3. Set Environment Variables

The simplest way to provide credentials is via environment variables:

```bash
export TWITTER_API_KEY="your-api-key"
export TWITTER_API_KEY_SECRET="your-api-key-secret"
export TWITTER_ACCESS_TOKEN="your-access-token"
export TWITTER_ACCESS_TOKEN_SECRET="your-access-token-secret"
```

Or use the `RELIZY_` prefix:

```bash
export RELIZY_TWITTER_API_KEY="your-api-key"
export RELIZY_TWITTER_API_KEY_SECRET="your-api-key-secret"
export RELIZY_TWITTER_ACCESS_TOKEN="your-access-token"
export RELIZY_TWITTER_ACCESS_TOKEN_SECRET="your-access-token-secret"
```

## Configuration Options

### Basic Options

```typescript
interface TwitterConfig {
  enabled?: boolean // Enable Twitter posting (default: false)
  onlyStable?: boolean // Only post stable releases (default: true)
  credentials?: TwitterCredentials // Alternative to env variables
  template?: string // Custom tweet template
}
```

### Credentials in Config

Instead of environment variables, you can configure credentials directly:

```typescript
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

Or use global tokens:

```typescript
export default defineConfig({
  tokens: {
    twitter: {
      apiKey: process.env.TWITTER_API_KEY,
      apiKeySecret: process.env.TWITTER_API_KEY_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    },
  },

  social: {
    twitter: {
      enabled: true,
    },
  },
})
```

## Credential Priority

Credentials are resolved in this order:

1. `social.twitter.credentials` - Highest priority
2. `tokens.twitter` - Global tokens
3. Environment variables - Lowest priority

## Custom Tweet Template

Customize the tweet message with a template:

```typescript
export default defineConfig({
  social: {
    twitter: {
      enabled: true,
      template: '🚀 {{projectName}} {{version}} is out!\n\n{{changelog}}\n\n📦 {{releaseUrl}}\n📋 {{changelogUrl}}',
    },
  },
})
```

### Available Placeholders

- <code v-pre>{{projectName}}</code> - Package name from package.json
- <code v-pre>{{version}}</code> - New version number
- <code v-pre>{{changelog}}</code> - Auto-generated changelog summary
- <code v-pre>{{releaseUrl}}</code> - Link to the GitHub/GitLab release
- <code v-pre>{{changelogUrl}}</code> - Link to the full changelog (from `social.changelogUrl`)

### Template Notes

- Twitter has a 280 character limit - tweets are automatically truncated if too long
- The changelog summary is automatically condensed to fit
- URLs are included in the character count
- If no template is provided, a default format is used

## Skip Prereleases

By default, Relizy only tweets about stable releases. To tweet about prereleases too:

```typescript
export default defineConfig({
  social: {
    twitter: {
      enabled: true,
      onlyStable: false, // Post all releases including prereleases
    },
  },
})
```

## Dependencies

Relizy uses the `twitter-api-v2` library for Twitter integration. Install it as a peer dependency:

```bash
pnpm add -D twitter-api-v2
```

The dependency is optional - if not installed, Relizy will show a helpful error message.

## CI/CD Setup

In CI/CD environments, add your Twitter credentials as secret environment variables:

### GitHub Actions

```yaml
- name: Release
  env:
    TWITTER_API_KEY: ${{ secrets.TWITTER_API_KEY }}
    TWITTER_API_KEY_SECRET: ${{ secrets.TWITTER_API_KEY_SECRET }}
    TWITTER_ACCESS_TOKEN: ${{ secrets.TWITTER_ACCESS_TOKEN }}
    TWITTER_ACCESS_TOKEN_SECRET: ${{ secrets.TWITTER_ACCESS_TOKEN_SECRET }}
  run: pnpm relizy release --yes
```

### GitLab CI

```yaml
release:
  script:
    - pnpm relizy release --yes
  variables:
    TWITTER_API_KEY: $TWITTER_API_KEY
    TWITTER_API_KEY_SECRET: $TWITTER_API_KEY_SECRET
    TWITTER_ACCESS_TOKEN: $TWITTER_ACCESS_TOKEN
    TWITTER_ACCESS_TOKEN_SECRET: $TWITTER_ACCESS_TOKEN_SECRET
```

## Example Tweet

With the default template, your tweets will look like this:

```
🚀 my-awesome-package 2.1.0 is out!

- Add new feature X
- Fix bug in component Y
- Performance improvements

📦 https://github.com/user/repo/releases/tag/v2.1.0
```

## Troubleshooting

### Missing Credentials Error

If you see "Twitter credentials not found", verify:

- Environment variables are set correctly
- Variable names match exactly (case-sensitive)
- If using config credentials, they're not undefined

### 403 Forbidden Error

This usually means:

- Your API keys are incorrect
- Your app doesn't have write permissions
- Your access token was revoked

Go to the Twitter Developer Portal and verify your credentials.

### Dependency Not Found Error

Install the Twitter API library:

```bash
pnpm add -D twitter-api-v2
```

## AI-Enhanced Tweets

Relizy can use AI to transform your raw changelog into concise, impactful tweets that fit within Twitter's character limit. Enable AI for Twitter:

```typescript
export default defineConfig({
  ai: {
    social: {
      twitter: { enabled: true },
    },
  },
  social: {
    twitter: {
      enabled: true,
    },
  },
})
```

### Tuning with extraGuidelines

Customize the AI's tweet style with `extraGuidelines`:

```typescript
export default defineConfig({
  ai: {
    social: {
      twitter: { enabled: true },
    },
    extraGuidelines: 'Focus on developer impact. Mention breaking changes first. Keep the tone technical but approachable.',
  },
})
```

### Before/After

**Without AI:**

```
🚀 my-lib 3.0.0 is out!

### 🚀 Enhancements
- **core**: add streaming API support (abc123)
- **auth**: implement OAuth2 PKCE (#45)

### 🩹 Fixes
- **cache**: fix TTL expiration (def456)

https://github.com/user/my-lib/releases/tag/v3.0.0
```

**With AI:**

```
🚀 my-lib 3.0.0 is out!

Streaming API support, OAuth2 PKCE auth, and a cache TTL fix.

https://github.com/user/my-lib/releases/tag/v3.0.0
```

The AI respects the `postMaxLength` setting and automatically condenses content to fit.

You can also use `--ai` / `--no-ai` CLI flags to toggle AI per run:

```bash
relizy social --ai --from v2.0.0 --to v3.0.0
```

Learn more in the [AI-Enhanced Changelogs](/guide/ai-changelog) guide.

## Learn More

- [Social Media Integration Overview](/guide/social-media)
- [AI-Enhanced Changelogs](/guide/ai-changelog)
- [Slack Integration](/guide/slack-integration)
- [Twitter API v2 Documentation](https://developer.twitter.com/en/docs/twitter-api)
