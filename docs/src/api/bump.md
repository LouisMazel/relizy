---
title: bump()
description: Bump package versions programmatically.
keywords: relizy bump api, version bump api, programmatic bump, semver api, monorepo versioning api
category: API Reference
tags: [api, bump, versioning, semver, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Signature

```ts
function bump(options: BumpOptions): Promise<BumpResult>
```

## Options

```ts
interface BumpOptions {
  /**
   * Release type (e.g. 'major', 'minor', 'patch', 'prerelease', 'prepatch', 'preminor', 'premajor')
   * @default 'release'
   */
  type?: ReleaseType
  /**
   * Prerelease identifier (e.g. 'beta', 'alpha')
   * @default undefined
   */
  preid?: string
  /**
   * Check if there are any changes to commit before bumping.
   * @default true
   */
  clean?: boolean
  /**
   * Include dependencies when bumping.
   * @default ['dependencies']
   */
  dependencyTypes?: ('dependencies' | 'devDependencies' | 'peerDependencies')[]
  /**
   * Skip confirmation prompt about bumping packages
   * @default true
   */
  yes?: boolean
  /**
   * Run without side effects
   * @default false
   */
  dryRun?: boolean
  /**
   * Use custom config
   * @default undefined
   */
  config?: ResolvedRelizyConfig
  /**
   * Set log level
   * @default undefined
   */
  logLevel?: LogLevel
  /**
   * Bump all packages even if there are no commits
   * @default false
   */
  force?: boolean
  /**
   * Custom config file name (e.g. `relizy.standalone` for `relizy.standalone.config.ts`)
   * @default 'relizy'
   */
  configName?: string
  /**
   * Custom suffix for prerelease versions - replace the last .X with .suffix (e.g. 1.0.0-beta.0 -> 1.0.0-beta.suffix)
   * @default undefined
   */
  suffix?: string

  /**
   * Enable canary bump mode.
   * Computes a canary version with format {nextVersion}-{preid}.{sha}.0
   * The next version is auto-detected from commits, then the canary suffix is appended.
   * @default false
   */
  canary?: boolean
}
```

## Returns

```ts
interface BumpResult {
  oldVersion: string
  newVersion: string
  packages?: PackageInfo[]
}
```

## Example

### Standard Bump

```ts
import { bump } from 'relizy'

const result = await bump({
  type: 'minor',
})

console.log(`Bumped from ${result.oldVersion} to ${result.newVersion}`)
```

### Canary Bump

```ts
import { bump } from 'relizy'

const result = await bump({
  canary: true,
  preid: 'snapshot', // optional, defaults to 'canary'
})

console.log(`Canary version: ${result.newVersion}`)
// e.g., "1.3.0-snapshot.a3f4b2c.0"
```

## See Also

- [Canary Releases guide](../guide/canary-releases.md)
- [CLI reference](../cli/bump.md)
- [API usage](usage.md)
