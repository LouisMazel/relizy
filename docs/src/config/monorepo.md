---
title: Monorepo Configuration
description: Configure monorepo-specific behavior.
keywords: monorepo config, version mode, workspace packages, monorepo versioning, package management
category: Configuration
tags: [config, monorepo, versioning, workspace]
---

# {{ $frontmatter.title }}

> Optional for standalone package

{{ $frontmatter.description }}

## versionMode

Choose how versions are managed:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: {
    versionMode: 'selective', // 'unified' | 'selective' | 'independent'
  },
})
```

- **unified**: All packages share the same version
- **selective**: Only changed packages bumped (recommended)
- **independent**: Each package has its own version

Learn more: [Version Modes](../guide/version-modes.md)

## packages

Specify where packages are located:

```ts
export default defineConfig({
  monorepo: {
    packages: [
      'packages/*',
      'apps/*',
      'libs/*',
    ],
  },
})
```

## ignorePackageNames

Exclude specific packages:

```ts
export default defineConfig({
  monorepo: {
    ignorePackageNames: [
      'example-a',
      'docs',
      '@myorg/private',
    ],
  },
})
```

## Complete Example

```ts
export default defineConfig({
  monorepo: {
    versionMode: 'selective',
    packages: ['packages/*', 'apps/*'],
    ignorePackageNames: ['example-a', 'docs'],
  },
})
```
