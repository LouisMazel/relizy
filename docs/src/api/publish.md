---
title: publish()
description: Publish packages to npm programmatically.
keywords: relizy publish api, npm publish api, programmatic publishing, package publishing api
category: API Reference
tags: [api, publish, npm, registry, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Signature

```ts
function publish(options?: PublishOptions): Promise<void>
```

## Options

```ts
interface PublishOptions {
  registry?: string
  tag?: string
  access?: 'public' | 'restricted'
  otp?: string
  /**
   * Glob pattern matching for packages to publish.
   * @default undefined
   */
  packages?: string[]
  /**
   * Command to build your packages before publishing.
   * @default undefined
   */
  buildCmd?: string

  dryRun?: boolean
  config?: ResolvedRelizyConfig
  bumpedPackages?: PackageInfo[]
  logLevel?: LogLevel
  configName?: string
}
```

## Example

```ts
import { publish } from 'relizy'

await publish({
  tag: 'latest',
  access: 'public',
  dryRun: false,
  buildCmd: 'pnpm build',
})
```

## See Also

- [CLI reference](../cli/publish.md)
- [API usage](usage.md)
