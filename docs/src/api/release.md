---
title: release()
description: Execute a complete release workflow programmatically.
keywords: relizy release api, programmatic release, automated release api, release workflow api
category: API Reference
tags: [api, release, workflow, automation, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Signature

```ts
function release(options: ReleaseOptions): Promise<void>
```

## Options

```ts
interface ReleaseOptions {
  // Release type
  releaseType?: 'major' | 'minor' | 'patch'

  // Git operations
  commit?: boolean
  tag?: boolean
  push?: boolean
  noGitChecks?: boolean

  // Publishing
  publish?: boolean
  providerRelease?: boolean

  // Monorepo
  packages?: string[]

  // Behavior
  yes?: boolean
  dryRun?: boolean
  logLevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug'

  // Configuration
  config?: string

  /**
   * Run without side effects
   * @default false
   */
  dryRun?: boolean
  /**
   * @default undefined
   */
  from?: string
  /**
   * @default undefined
   */
  to?: string
  /**
   * @default undefined
   */
  token?: string
  /**
   * @default undefined
   */
  logLevel?: LogLevel
  /**
   * @default 'relizy'
   */
  configName?: string
  /**
   * Bump even if there are no commits
   * @default false
   */
  force?: boolean
  /**
   * Custom suffix for prerelease versions - replace the last .X with .suffix (e.g. 1.0.0-beta.0 -> 1.0.0-beta.suffix)
   * @default undefined
   */
  suffix?: string
  /**
   * Enable/disable git tag creation
   * @default true
   */
  gitTag?: boolean

  /**
   * Enable/disable PR comment posting
   * @default true
   */
  prComment?: boolean

  /**
   * Override PR/MR number for PR comment
   * @default undefined
   */
  prNumber?: number

  /**
   * Enable canary release mode.
   * Publishes a temporary version with format {nextVersion}-{preid}.{sha}.0
   * Automatically disables: commit, push, changelog, providerRelease, social, gitTag
   * Keeps active: publish, prComment, safetyCheck, clean check
   * @default false
   */
  canary?: boolean
}
```

## Example

### Standard Release

```ts
import { release } from 'relizy'

await release({
  type: 'minor',
  commit: true,
  tag: true,
  push: true,
  publish: true,
  providerRelease: true,
  gitTag: true,
})
```

### Canary Release

```ts
import { release } from 'relizy'

await release({
  canary: true,
  yes: true,
  prNumber: 42,
})
```

When `canary` is `true`, the release function automatically disables `commit`, `push`, `changelog`, `providerRelease`, `social`, and `gitTag`. It publishes the canary version to npm with the `canary` dist-tag (or the value of `preid` if provided).

## See Also

- [Canary Releases guide](../guide/canary-releases.md)
- [CLI reference](../cli/release.md)
- [API usage](usage.md)
- [prComment() API](pr-comment.md)
