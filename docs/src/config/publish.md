---
title: Publish Configuration
description: Configure NPM publishing.
keywords: publish config, npm config, registry config, package access, npm publishing
category: Configuration
tags: [config, publish, npm, registry]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## access

Set package access level:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: {
    access: 'public', // or 'restricted'
  },
})
```

## tag

Set npm dist-tag:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: {
    tag: 'latest', // or 'beta', 'next', etc.
  },
})
```

## registry

Use custom npm registry:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: {
    registry: 'https://registry.npmjs.org',
  },
})
```

## Complete Example

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: {
    access: 'public',
    tag: 'latest',
    registry: 'https://registry.npmjs.org',
  },
})
```
