---
title: social()
description: Post release announcements to social media platforms programmatically.
keywords: relizy social api, social media api, twitter api, slack api, programmatic posting, release announcements api
category: API Reference
tags: [api, social, twitter, slack, announcements, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Signature

```ts
function social(options?: SocialOptions): Promise<void>
```

## Description

The `social()` function posts release announcements to configured social media platforms (Twitter, Slack). It automatically:

1. Loads your Relizy configuration
2. Determines which releases to announce (from `bumpResult` or `postedReleases`)
3. Generates appropriate messages for each platform
4. Posts to enabled platforms
5. Handles errors gracefully with proper logging

## Options

```ts
interface SocialOptions {
  /**
   * Start tag/commit reference for changelog generation
   * @default undefined
   */
  from?: string

  /**
   * End tag/commit reference for changelog generation
   * @default undefined
   */
  to?: string

  /**
   * Pre-loaded Relizy configuration
   * If not provided, will load from config file
   * @default undefined
   */
  config?: ResolvedRelizyConfig

  /**
   * Custom config file name (without .config extension)
   * @example 'relizy.standalone' for 'relizy.standalone.config.ts'
   * @default 'relizy'
   */
  configName?: string

  /**
   * Bump result from bump command
   * Contains version and package information
   * @default undefined
   */
  bumpResult?: BumpResult

  /**
   * Posted releases from provider-release command
   * Contains release URLs from GitHub/GitLab
   * @default undefined
   */
  postedReleases?: PostedRelease[]

  /**
   * Log level for output
   * @default 'info'
   */
  logLevel?: LogLevel

  /**
   * Run in dry-run mode (no actual posting)
   * @default false
   */
  dryRun?: boolean

  /**
   * Skip safety checks
   * @default false
   */
  safetyCheck?: boolean
}
```

## Return Value

Returns a `Promise<void>` that resolves when all configured social media posts have been made successfully, or rejects if an error occurs.

## Error Handling

The function will throw an error if:

- Required peer dependencies are missing (`twitter-api-v2` or `@slack/web-api`)
- Credentials are not configured or invalid
- Social media API requests fail
- No releases are found to announce

Errors are logged with detailed messages to help troubleshoot configuration issues.

## Examples

### Basic Usage

Post about releases between two git tags:

```ts
import { social } from 'relizy'

await social({
  from: 'v1.0.0',
  to: 'v1.1.0',
})
```

### With Bump Result

Use after bumping versions:

```ts
import { bump, social } from 'relizy'

// Bump version first
const bumpResult = await bump({
  type: 'patch',
})

// Then post to social media
await social({
  bumpResult,
})
```

### With Posted Releases

Use after creating provider releases:

```ts
import { bump, providerRelease, social } from 'relizy'

// Bump and create GitHub release
const bumpResult = await bump({ type: 'minor' })
const postedReleases = await providerRelease({ bumpResult })

// Post to social media with release URLs
await social({
  bumpResult,
  postedReleases,
})
```

### Dry Run

Test social media posting without actually posting:

```ts
import { social } from 'relizy'

await social({
  from: 'v1.0.0',
  to: 'v1.1.0',
  dryRun: true, // Will log what would be posted
})
```

### Custom Configuration

Use a different config file:

```ts
import { social } from 'relizy'

await social({
  configName: 'relizy.production',
  from: 'v1.0.0',
  to: 'v1.1.0',
})
```

### With Pre-loaded Config

Pass configuration directly:

```ts
import { loadRelizyConfig, social } from 'relizy'

const config = await loadRelizyConfig({
  configName: 'relizy.custom',
})

await social({
  config,
  from: 'v1.0.0',
  to: 'v1.1.0',
})
```

### Custom Log Level

Control logging verbosity:

```ts
import { social } from 'relizy'

await social({
  from: 'v1.0.0',
  to: 'v1.1.0',
  logLevel: 'debug', // Show detailed logs
})
```

## Integration in Workflows

### Full Release Workflow

```ts
import { bump, changelog, createCommitAndTags, providerRelease, publish, social } from 'relizy'

async function completeRelease() {
  // 1. Bump versions
  const bumpResult = await bump({ type: 'minor' })

  // 2. Generate changelogs
  await changelog({ bumpResult })

  // 3. Create git commit and tags
  await createCommitAndTags({ bumpResult })

  // 4. Publish to npm
  await publish({ bumpResult })

  // 5. Create GitHub/GitLab release
  const postedReleases = await providerRelease({ bumpResult })

  // 6. Post to social media
  await social({
    bumpResult,
    postedReleases,
  })
}

completeRelease().catch(console.error)
```

### Monorepo - Independent Mode

In independent mode, `social()` will create separate posts for each package:

```ts
import { bump, social } from 'relizy'

// Configuration with independent mode
// monorepo: { versionMode: 'independent' }

const bumpResult = await bump({ type: 'patch' })

// Posts separate announcements for each bumped package
await social({ bumpResult })
```

### Conditional Posting

Only post for stable releases:

```ts
import { bump, isPrerelease, social } from 'relizy'

const bumpResult = await bump({ type: 'patch' })

// Only post if not a prerelease
if (!isPrerelease(bumpResult.newVersion)) {
  await social({ bumpResult })
}
```

## Configuration Requirements

For `social()` to work, you need to configure social media platforms in your `relizy.config.ts`:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  social: {
    twitter: {
      enabled: true,
      credentials: {
        apiKey: process.env.TWITTER_API_KEY,
        apiSecret: process.env.TWITTER_API_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
      },
    },
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

## Hooks

The `social()` function executes the following hooks:

- `before:social` - Before posting to social media
- `success:social` - After successful posting
- `error:social` - If posting fails

Example:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  hooks: {
    'before:social': (config, dryRun) => {
      console.log('About to post to social media...')
    },
    'success:social': (config, dryRun, result) => {
      console.log('Successfully posted to social media!')
    },
    'error:social': (config, dryRun, error) => {
      console.error('Failed to post:', error)
    },
  },
})
```

## Platform-Specific Behavior

### Twitter

- Tweets are automatically truncated to fit Twitter's 280-character limit
- URLs are shortened automatically by Twitter
- Changelog is summarized to fit the limit
- Prerelease versions are skipped by default (configurable with `onlyStable`)

### Slack

- Messages use Slack's mrkdwn formatting
- Links are formatted as `<url|text>`
- Rich formatting with bold, italic, and code blocks
- Channel must exist and bot must have access

## Type Definitions

```ts
interface BumpResult {
  newVersion: string
  bumpedPackages: PackageInfo[]
  rootPackage?: PackageInfo
}

interface PostedRelease {
  name: string
  tag: string
  version: string
  url?: string
  prerelease: boolean
}

interface PackageInfo {
  name: string
  version: string
  newVersion?: string
  path: string
  private: boolean
}

type LogLevel = 'silent' | 'error' | 'warn' | 'log' | 'info' | 'debug' | 'verbose'
```

## See Also

- [CLI reference](../cli/social.md)
- [Configuration reference](../config/social.md)
- [Twitter Integration Guide](../guide/twitter-integration.md)
- [Slack Integration Guide](../guide/slack-integration.md)
- [release() API](./release.md)
- [API Usage Guide](./usage.md)
