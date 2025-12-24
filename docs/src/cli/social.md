---
title: social
description: Post release announcements to social media platforms from the command line.
keywords: relizy social, social media cli, twitter posting, slack notifications, release announcements, automated posting
category: CLI Reference
tags: [cli, social, twitter, slack, announcements, automation]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Usage

```bash
relizy social [options]
```

## What It Does

The `social` command posts release announcements to configured social media platforms (Twitter, Slack):

1. Loads release information from git tags or bump result
2. Generates changelog summaries
3. Formats messages for each platform
4. Posts to enabled platforms (Twitter, Slack)
5. Handles platform-specific requirements (character limits, formatting)

## Prerequisites

Install the required peer dependencies for the platforms you want to use:

```bash
# For Twitter
pnpm add -D twitter-api-v2

# For Slack
pnpm add -D @slack/web-api
```

## Options

### --from

Specify the starting git tag/commit reference for changelog generation:

```bash
relizy social --from v1.0.0
```

### --to

Specify the ending git tag/commit reference for changelog generation:

```bash
relizy social --to v1.1.0
```

### --config

Use a different configuration file:

```bash
relizy social --config relizy.production
```

This will load `relizy.production.config.ts` instead of `relizy.config.ts`.

### --dry-run

Test social media posting without actually posting:

```bash
relizy social --dry-run --from v1.0.0 --to v1.1.0
```

This will:

- Load configuration
- Generate messages
- Log what would be posted
- NOT make actual API calls

### --log-level

Control logging verbosity:

```bash
relizy social --log-level debug
```

Available levels:

- `silent` - No output
- `error` - Errors only
- `warn` - Warnings and errors
- `log` - Standard logs
- `info` - Informational messages (default)
- `debug` - Detailed debugging information
- `verbose` - Maximum verbosity

### --no-safety-check

Skip safety checks (credentials validation, configuration warnings):

```bash
relizy social --no-safety-check
```

::: warning
Use with caution. Safety checks help catch configuration issues before posting.
:::

## Examples

### Basic Usage

Post about the latest release:

```bash
relizy social --from v1.0.0 --to v1.1.0
```

This will:

- Generate changelog from v1.0.0 to v1.1.0
- Post to all enabled platforms (Twitter, Slack)

### Test Before Posting

Use dry-run to preview what will be posted:

```bash
relizy social --dry-run --from v1.0.0 --to v1.1.0
```

Output:

```bash
[dry-run] Would post to Twitter:
🎉 MyProject v1.1.0 released!

✨ Features
- Add new feature X
- Improve performance

🐛 Fixes
- Fix bug Y

https://github.com/user/myproject/releases/tag/v1.1.0

[dry-run] Would post to Slack (#releases):
🚀 *MyProject v1.1.0* is now available!
...
```

### With Custom Log Level

See detailed logs:

```bash
relizy social --from v1.0.0 --to v1.1.0 --log-level debug
```

### Using Different Config

Use production configuration:

```bash
relizy social --config relizy.production --from v1.0.0 --to v1.1.0
```

## Configuration

Configure social media platforms in `relizy.config.ts`:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  social: {
    twitter: {
      enabled: true,
      onlyStable: true, // Skip prerelease versions
      template: '🎉 {{projectName}} v{{version}} released!\n\n{{changelog}}\n\n{{releaseUrl}}',
      credentials: {
        apiKey: process.env.TWITTER_API_KEY,
        apiKeySecret: process.env.TWITTER_API_KEY_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
      },
    },
    slack: {
      enabled: true,
      onlyStable: false, // Post all releases
      channel: '#releases',
      template: '🚀 *{{projectName}} v{{version}}*\n\n{{changelog}}\n\n<{{releaseUrl}}|View Release>',
      credentials: {
        token: process.env.SLACK_TOKEN,
      },
    },
    changelogUrl: 'https://myproject.com/changelog',
  },
})
```

## Environment Variables

### Twitter

Set these environment variables for Twitter posting:

```bash
export TWITTER_API_KEY="your_api_key"
export TWITTER_API_KEY_SECRET="your_api_secret"
export TWITTER_ACCESS_TOKEN="your_access_token"
export TWITTER_ACCESS_TOKEN_SECRET="your_access_token_secret"
```

Or with `RELIZY_` prefix:

```bash
export RELIZY_TWITTER_API_KEY="your_api_key"
export RELIZY_TWITTER_API_KEY_SECRET="your_api_secret"
export RELIZY_TWITTER_ACCESS_TOKEN="your_access_token"
export RELIZY_TWITTER_ACCESS_TOKEN_SECRET="your_access_token_secret"
```

### Slack

Set this environment variable for Slack posting:

```bash
export SLACK_TOKEN="xoxb-your-bot-token"
```

Or with `RELIZY_` prefix:

```bash
export RELIZY_SLACK_TOKEN="xoxb-your-bot-token"
```

### Using .env File

Create a `.env` file in your project root:

```ini
# Twitter
TWITTER_API_KEY=your_api_key
TWITTER_API_KEY_SECRET=your_api_key_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_TOKEN_SECRET=your_access_token_secret

# Slack
SLACK_TOKEN=xoxb-your-bot-token
```

Relizy will automatically load these variables.

## CI/CD Integration

### GitHub Actions

```yaml
name: Social Media Announcements

on:
  release:
    types: [published]

jobs:
  announce:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install

      - name: Post to social media
        env:
          TWITTER_API_KEY: ${{ secrets.TWITTER_API_KEY }}
          TWITTER_API_KEY_SECRET: ${{ secrets.TWITTER_API_KEY_SECRET }}
          TWITTER_ACCESS_TOKEN: ${{ secrets.TWITTER_ACCESS_TOKEN }}
          TWITTER_ACCESS_TOKEN_SECRET: ${{ secrets.TWITTER_ACCESS_TOKEN_SECRET }}
          SLACK_TOKEN: ${{ secrets.SLACK_TOKEN }}
        run: |
          # Get the latest two tags
          LATEST_TAG=$(git describe --tags --abbrev=0)
          PREVIOUS_TAG=$(git describe --tags --abbrev=0 $LATEST_TAG^)

          # Post to social media
          pnpm relizy social --from $PREVIOUS_TAG --to $LATEST_TAG
```

### GitLab CI

```yaml
social:
  stage: announce
  only:
    - tags
  script:
    - pnpm install
    - |
      LATEST_TAG=$(git describe --tags --abbrev=0)
      PREVIOUS_TAG=$(git describe --tags --abbrev=0 $LATEST_TAG^)
      pnpm relizy social --from $PREVIOUS_TAG --to $LATEST_TAG
  variables:
    TWITTER_API_KEY: $TWITTER_API_KEY
    TWITTER_API_KEY_SECRET: $TWITTER_API_KEY_SECRET
    TWITTER_ACCESS_TOKEN: $TWITTER_ACCESS_TOKEN
    TWITTER_ACCESS_TOKEN_SECRET: $TWITTER_ACCESS_TOKEN_SECRET
    SLACK_TOKEN: $SLACK_TOKEN
```

## Troubleshooting

### Missing Credentials

**Error:**

```bash
Twitter is enabled but credentials are missing.
Set the following environment variables...
```

**Solution:**
Set the required environment variables or configure credentials in your config file.

### Missing Peer Dependency

**Error:**

```bash
Missing dependency: twitter-api-v2
Please install it: pnpm add -D twitter-api-v2
```

**Solution:**
Install the required peer dependency:

```bash
pnpm add -D twitter-api-v2
```

### Slack Channel Not Found

**Error:**

```bash
Slack API error: channel_not_found
```

**Solution:**

- Verify the channel name/ID is correct
- Ensure your Slack bot has been invited to the channel
- For public channels, add the `chat:write.public` scope

### Twitter Character Limit

**Error:**

```bash
Tweet exceeds 280 characters
```

**Solution:**
Relizy automatically truncates tweets, but you can customize the template to make it shorter:

```ts
template: '🎉 {{projectName}} v{{version}}\n{{releaseUrl}}'
```

## Integration with release Command

The `social` command is automatically run as part of the `release` workflow when enabled:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  release: {
    social: true, // Enable social posting in release workflow
  },
  social: {
    twitter: { enabled: true },
    slack: { enabled: true, channel: '#releases' },
  },
})
```

Then:

```bash
relizy release --patch
```

This will run the complete workflow including social media posting.

## Monorepo Behavior

### Independent Mode

In independent mode, separate posts are created for each package:

```bash
relizy social --from v1.0.0 --to v1.1.0
```

If `package-a` and `package-b` were both released, you'll get:

- One tweet for package-a
- One tweet for package-b
- One Slack message for package-a
- One Slack message for package-b

### Unified/Selective Mode

In unified or selective mode, a single post is created for all packages:

```bash
relizy social --from v1.0.0 --to v1.1.0
```

You'll get:

- One tweet for the release
- One Slack message for the release

## See Also

- [release](/cli/release) - Full release workflow (includes social posting)
- [Configuration reference](../config/social.md) - Social media configuration
- [API reference](../api/social.md) - Programmatic usage
- [Twitter Integration Guide](../guide/twitter-integration.md) - Twitter setup
- [Slack Integration Guide](../guide/slack-integration.md) - Slack setup
- [Social Media Overview](../guide/social-media.md) - General overview
