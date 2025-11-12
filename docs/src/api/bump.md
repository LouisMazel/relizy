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

```ts
import { bump } from 'relizy'

const result = await bump({
  type: 'minor',
})

console.log(`Bumped from ${result.oldVersion} to ${result.newVersion}`)
```

## See Also

- [CLI reference](../cli/bump.md)
- [API usage](usage.md)
