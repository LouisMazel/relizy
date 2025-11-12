---
title: providerRelease()
description: Create GitHub or GitLab releases programmatically.
keywords: relizy provider release api, github release api, gitlab release api, programmatic release
category: API Reference
tags: [api, provider-release, github, gitlab, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Signature

```ts
function providerRelease(options?: ProviderReleaseOptions): Promise<void>
```

## Options

```ts
export interface ProviderReleaseOptions {
  from?: string
  to?: string
  token?: string
  config?: ResolvedRelizyConfig
  configName?: string
  provider?: GitProvider
  bumpResult?: BumpResult
  logLevel?: LogLevel
  dryRun?: boolean
}
```

## Example

```ts
import { providerRelease } from 'relizy'

await providerRelease({
  draft: false,
  prerelease: false,
})
```

## See Also

- [CLI reference](../cli/provider-release.md)
- [API usage](usage.md)
