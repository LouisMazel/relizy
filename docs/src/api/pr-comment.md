---
title: prComment()
description: Post release information as a PR/MR comment programmatically.
keywords: relizy pr comment api, pr comment api, pull request comment api, programmatic pr comment, release comment api
category: API Reference
tags: [api, pr-comment, pull-request, merge-request, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Signature

```ts
function prComment(options?: PrCommentOptions): Promise<void>
```

## Description

The `prComment()` function posts release information as a comment on a pull request or merge request. It automatically:

1. Loads your Relizy configuration
2. Detects the current PR/MR from the git branch (or uses the provided `prNumber`)
3. Builds a formatted comment based on the release context
4. Posts the comment via the provider's API (GitHub or GitLab)
5. Supports `append` and `update` modes for comment management

## Options

```ts
interface PrCommentOptions {
  /**
   * Override the auto-detected PR/MR number
   * @default undefined
   */
  prNumber?: number

  /**
   * Run in dry-run mode (no actual posting)
   * @default false
   */
  dryRun?: boolean

  /**
   * Log level for output
   * @default 'info'
   */
  logLevel?: LogLevel

  /**
   * Custom config file name (without .config extension)
   * @example 'relizy.standalone' for 'relizy.standalone.config.ts'
   * @default 'relizy'
   */
  configName?: string

  /**
   * Pre-loaded Relizy configuration
   * If not provided, will load from config file
   * @default undefined
   */
  config?: ResolvedRelizyConfig

  /**
   * Release context passed from the release flow
   * When absent, standalone mode is used (reads packages from disk)
   * @default undefined
   */
  releaseContext?: ReleaseContext
}
```

## ReleaseContext

When called from the release workflow, a `ReleaseContext` is passed to provide release information:

```ts
type PrCommentStatus = 'success' | 'no-release' | 'failed'

interface ReleaseContext {
  /**
   * Release status
   */
  status: PrCommentStatus

  /**
   * Bump result (available when status is 'success')
   */
  bumpResult?: BumpResult

  /**
   * Git tags created during release
   */
  tags?: string[]

  /**
   * Error message (available when status is 'failed')
   */
  error?: string
}
```

## Return Value

Returns a `Promise<void>` that resolves when the comment has been posted successfully, or rejects if an error occurs.

## Error Handling

The function will throw an error if:

- No PR/MR can be detected and no `prNumber` is provided
- Authentication token is missing or invalid
- The provider API request fails
- The PR/MR does not exist

Errors are logged with detailed messages to help troubleshoot configuration issues.

## Examples

### Basic Usage

Post a comment on the auto-detected PR:

```ts
import { prComment } from 'relizy'

await prComment()
```

### With PR Number

Specify the PR/MR number manually:

```ts
import { prComment } from 'relizy'

await prComment({
  prNumber: 42,
})
```

### With Pre-loaded Config

Pass configuration directly:

```ts
import { loadRelizyConfig, prComment } from 'relizy'

const config = await loadRelizyConfig()

await prComment({
  config,
  prNumber: 42,
})
```

### With Release Context

Pass release information for formatted comments:

```ts
import { prComment } from 'relizy'

await prComment({
  releaseContext: {
    status: 'success',
    bumpResult: {
      newVersion: '1.1.0',
      bumpedPackages: [
        { name: '@myorg/core', version: '1.0.0', newVersion: '1.1.0', path: 'packages/core', private: false },
      ],
    },
    tags: ['v1.1.0'],
  },
})
```

### Dry Run

Preview the comment without posting:

```ts
import { prComment } from 'relizy'

await prComment({
  dryRun: true,
})
```

### In Full Release Workflow

```ts
import { bump, changelog, createCommitAndTags, prComment, providerRelease, publish } from 'relizy'

async function completeRelease() {
  // 1. Bump versions
  const bumpResult = await bump({ type: 'minor' })

  // 2. Generate changelogs
  await changelog({ bumpResult })

  // 3. Create git commit and tags
  const tags = await createCommitAndTags({ bumpResult })

  // 4. Publish to npm
  await publish({ bumpResult })

  // 5. Create GitHub/GitLab release
  await providerRelease({ bumpResult })

  // 6. Post PR comment
  await prComment({
    releaseContext: {
      status: 'success',
      bumpResult,
      tags,
    },
  })
}

completeRelease().catch(console.error)
```

### Custom Log Level

Control logging verbosity:

```ts
import { prComment } from 'relizy'

await prComment({
  logLevel: 'debug',
  prNumber: 42,
})
```

## Type Definitions

```ts
type PrCommentMode = 'append' | 'update'

interface PrCommentConfig {
  mode?: PrCommentMode
}

type PrCommentStatus = 'success' | 'no-release' | 'failed'

interface ReleaseContext {
  status: PrCommentStatus
  bumpResult?: BumpResult
  tags?: string[]
  error?: string
}

interface BumpResult {
  newVersion: string
  bumpedPackages: PackageInfo[]
  rootPackage?: PackageInfo
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

- [CLI reference](../cli/pr-comment.md)
- [Configuration reference](../config/pr-comment.md)
- [PR Comments Guide](../guide/pr-comment.md)
- [release() API](./release.md)
- [API Usage Guide](./usage.md)
