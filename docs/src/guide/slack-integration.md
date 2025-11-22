# Slack Integration

Automatically send release notifications to Slack channels when you publish new versions.

## Prerequisites

**Important:** Relizy requires the `@slack/web-api` library as a peer dependency. You must install it in your project:

```bash
pnpm add -D @slack/web-api
# or
npm install -D @slack/web-api
# or
yarn add -D @slack/web-api
```

If not installed, Relizy will show an error message when attempting to post to Slack.

## Setup

### 1. Create a Slack App

1. Go to [Slack API Apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Give it a name (e.g., "Relizy Release Bot") and select your workspace
4. Navigate to "OAuth & Permissions"
5. Add the `chat:write` OAuth scope under "Bot Token Scopes"
6. Click "Install to Workspace" at the top
7. Copy the "Bot User OAuth Token" (starts with `xoxb-`)

### 2. Invite Bot to Channel

In your Slack workspace:

```
/invite @YourBotName
```

Or add the bot through the channel settings.

### 3. Configure Relizy

Add Slack configuration to your `relizy.config.ts`:

```typescript
import { defineConfig } from 'relizy'

export default defineConfig({
  social: {
    changelogUrl: 'https://github.com/yourusername/yourrepo/blob/main/CHANGELOG.md',

    slack: {
      enabled: true,
      channel: '#releases', // or channel ID like 'C1234567890'
      onlyStable: true, // Only post stable releases (not prereleases)
    },
  },
})
```

### 4. Set Environment Variable

The simplest way to provide the bot token:

```bash
export SLACK_TOKEN="xoxb-your-bot-token"
```

Or use the `RELIZY_` prefix:

```bash
export RELIZY_SLACK_TOKEN="xoxb-your-bot-token"
```

## Configuration Options

### Basic Options

```typescript
interface SlackConfig {
  enabled?: boolean // Enable Slack posting (default: false)
  channel?: string // Slack channel (#channel-name or ID)
  onlyStable?: boolean // Only post stable releases (default: true)
  credentials?: SlackCredentials // Alternative to env variables
  messageTemplate?: string // Custom message template
}
```

### Channel Format

You can specify the channel in two ways:

```typescript
// Channel name (must include #)
channel: '#releases'

// Channel ID (from Slack, no # needed)
channel: 'C1234567890'
```

To find a channel ID in Slack: Right-click channel → View channel details → Copy channel ID.

### Credentials in Config

Instead of environment variables, you can configure the token directly:

```typescript
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

Or use global tokens:

```typescript
export default defineConfig({
  tokens: {
    slack: process.env.SLACK_TOKEN,
  },

  social: {
    slack: {
      enabled: true,
      channel: '#releases',
    },
  },
})
```

## Credential Priority

Credentials are resolved in this order:

1. `social.slack.credentials` - Highest priority
2. `tokens.slack` - Global tokens
3. Environment variables - Lowest priority

## Message Formatting

Relizy sends rich, interactive messages to Slack using Block Kit:

- **Header** - Release version and project name
- **Changelog** - Formatted changelog with markdown support
- **Buttons** - Links to the GitHub/GitLab release and full changelog

### Default Format

The default message looks like this:

```
🚀 my-awesome-package 2.1.0 is out!

✨ Features
- Add new feature X
- Improve component Y

🩹 Fixes
- Fix bug in module Z

[View Release] [Full Changelog]
```

### Custom Message Template

For simple text messages instead of rich blocks:

```typescript
export default defineConfig({
  social: {
    slack: {
      enabled: true,
      channel: '#releases',
      messageTemplate: '🚀 {{projectName}} {{version}} is out!\n\n{{changelog}}\n\n📦 {{releaseUrl}}\n📋 {{changelogUrl}}',
    },
  },
})
```

### Available Placeholders

- `{{projectName}}` - Package name from package.json
- `{{version}}` - New version number
- `{{changelog}}` - Auto-generated changelog
- `{{releaseUrl}}` - Link to the GitHub/GitLab release
- `{{changelogUrl}}` - Link to the full changelog (from `social.changelogUrl`)

## Markdown Support

Slack uses mrkdwn format. Relizy automatically converts:

- `**bold**` → `*bold*`
- `[link](url)` → `<url|link>`
- `# Header` → `*Header*`
- `## Subheader` → `*Subheader*`

## Skip Prereleases

By default, Relizy only posts about stable releases. To post about prereleases too:

```typescript
export default defineConfig({
  social: {
    slack: {
      enabled: true,
      channel: '#releases',
      onlyStable: false, // Post all releases including prereleases
    },
  },
})
```

## Dependencies

Relizy uses the `@slack/web-api` library for Slack integration. Install it as a peer dependency:

```bash
pnpm add -D @slack/web-api
```

The dependency is optional - if not installed, Relizy will show a helpful error message.

## CI/CD Setup

In CI/CD environments, add your Slack token as a secret environment variable:

### GitHub Actions

```yaml
- name: Release
  env:
    SLACK_TOKEN: ${{ secrets.SLACK_TOKEN }}
  run: pnpm relizy release --yes
```

### GitLab CI

```yaml
release:
  script:
    - pnpm relizy release --yes
  variables:
    SLACK_TOKEN: $SLACK_TOKEN
```

## Multiple Channels

To post to multiple channels, use Slack's workflow or create multiple bots. Relizy currently supports one channel per configuration.

You can work around this with hooks:

```typescript
export default defineConfig({
  hooks: {
    'success:slack': 'node scripts/notify-additional-channels.js',
  },
})
```

## Troubleshooting

### Missing Token Error

If you see "Slack token not found", verify:

- Environment variable is set: `echo $SLACK_TOKEN`
- Variable name is correct (case-sensitive)
- If using config credentials, they're not undefined

### Channel Not Found Error

This usually means:

- Channel doesn't exist
- Bot hasn't been invited to the channel
- Channel name is missing the `#` prefix (for channel names)

Solution: Invite the bot with `/invite @YourBotName`

### Not in Channel Error

The bot needs to be a member of the channel:

```
/invite @YourBotName
```

### Missing Scope Error

Your Slack app needs the `chat:write` scope:

1. Go to Slack API Apps → Your App → OAuth & Permissions
2. Add `chat:write` under "Bot Token Scopes"
3. Reinstall the app to your workspace
4. Use the new token

### Dependency Not Found Error

Install the Slack Web API library:

```bash
pnpm add -D @slack/web-api
```

## Enterprise Grid Support

Relizy works with Slack Enterprise Grid workspaces. Use the same setup process, but ensure your bot has access to the target workspace.

## Example Message

With the default rich blocks format, your Slack messages will look like this:

> **🚀 my-awesome-package 2.1.0 is out!**
>
> **✨ Features**
>
> - Add new feature X
> - Improve component Y
>
> **🩹 Fixes**
>
> - Fix bug in module Z
>
> [View Release] [Full Changelog]

## Learn More

- [Social Media Integration Overview](/guide/social-media)
- [Twitter Integration](/guide/twitter-integration)
- [Slack API Documentation](https://api.slack.com/)
- [Slack Block Kit](https://api.slack.com/block-kit)
