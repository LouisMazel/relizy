---
title: changelog()
description: Generate changelogs programmatically.
keywords: relizy changelog api, programmatic changelog, changelog generation api, git commits api
category: API Reference
tags: [api, changelog, documentation, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Signature

```ts
function changelog(options?: ChangelogOptions): Promise<void>
```

## Options

```ts
interface ChangelogOptions {
  from?: string
  to?: string
  dryRun?: boolean
  bumpedPackages?: PackageInfo[]
  config?: ResolvedRelizyConfig
  logLevel?: LogLevel
  configName?: string
  formatCmd?: string
  rootChangelog?: boolean
  /**
   * Include commit body in the changelog.
   * @default true
   */
  includeCommitBody?: boolean
}
```

## Example

```ts
import { changelog } from 'relizy'

await changelog({
  from: 'v1.0.0',
  to: 'HEAD',
})
```

## See Also

- [CLI reference](../cli/changelog.md)
- [API usage](usage.md)
