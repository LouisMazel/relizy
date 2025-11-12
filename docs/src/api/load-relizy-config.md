---
title: loadRelizyConfig()
description: Load Relizy configuration programmatically.
keywords: relizy config, load config, programmatic config, configuration api, relizy api
category: API Reference
tags: [api, config, configuration, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Signature

```ts
async function loadRelizyConfig(options?: {
  configName?: string
  baseConfig?: RelizyConfig
  overrides?: Partial<RelizyConfig>
}): Promise<ResolvedRelizyConfig>
```

## Example

```ts
import { loadRelizyConfig } from 'relizy'

const config = await loadRelizyConfig({
  configName: 'relizy',
  overrides: {
    bump: {
      type: 'prerelease',
    },
  },
})
```

## See Also

- [API usage](usage.md)
