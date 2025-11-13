---
title: Multiple Configurations
description: Use different configs for different workflows.
keywords: multiple configs, config management, environment configs, workflow configs, config file naming
category: Configuration
tags: [config, multiple-configs, environments, workflow]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Why Multiple Configs?

Different release strategies for:

- Production vs staging
- Different package sets
- Different versioning modes
- Different registries

## Creating Multiple Configs

Create config files with different names:

```text
.
├── relizy.config.ts          # Default
├── relizy.production.config.ts
├── relizy.staging.config.ts
└── relizy.standalone.config.ts
```

## Usage

### CLI

```bash
# Use default config
relizy release

# Use production config
relizy release --config relizy.production

# Use staging config
relizy release --config relizy.staging
```

### API

```ts
import { release } from 'relizy'

// Use custom config
await release({
  configName: 'relizy.staging',
  type: 'minor',
})
```

## Example Configs

### Production Config

```ts
// changelog.production.config.ts
export default defineConfig({
  monorepo: {
    versionMode: 'unified',
  },
  publish: {
    access: 'public',
    tag: 'latest',
  },
})
```

### Staging Config

```ts
// changelog.staging.config.ts
export default defineConfig({
  monorepo: {
    versionMode: 'independent',
  },
  publish: {
    access: 'public',
    tag: 'beta',
  },
})
```

### Standalone Package Config

```ts
// relizy.standalone.config.ts
export default defineConfig({
  // No monorepo settings
  publish: {
    access: 'public',
  },
})
```

## Best Practices

1. **Use descriptive names**: `production`, `staging`, `beta`
2. **Document usage**: Add comments to each config
3. **Share common settings**: Extract to shared file
4. **Version control**: Commit all configs to git

## Shared Configuration

Extract common settings:

```ts
// shared.config.ts
export const commonConfig = defineConfig({
  types: {
    feat: { title: '🚀 Features', semver: 'minor' },
    fix: { title: '🐛 Fixes', semver: 'patch' },
  },
})
```

```ts
// changelog.production.config.ts
import { commonConfig } from './shared.config'

export default defineConfig({
  ...commonConfig,
  publish: {
    tag: 'latest',
  },
})
```

```ts
// changelog.staging.config.ts
import { commonConfig } from './shared.config'

export default defineConfig({
  ...commonConfig,
  publish: {
    tag: 'beta',
  },
})
```
