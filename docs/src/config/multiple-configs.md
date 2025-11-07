# Multiple Configurations

Use different configs for different workflows.

## Why Multiple Configs?

Different release strategies for:

- Production vs staging
- Different package sets
- Different versioning modes
- Different registries

## Creating Multiple Configs

Create config files with different names:

```
.
├── relizy.config.ts          # Default
├── changelog.production.config.ts
├── changelog.staging.config.ts
└── changelog.standalone.config.ts
```

## Usage

### CLI

```bash
# Use default config
npx relizy release

# Use production config
npx relizy release --config production

# Use staging config
npx relizy release --config staging
```

### API

```ts
import { release } from 'relizy'

// Use custom config
await release({
  config: 'production',
  releaseType: 'minor',
})
```

## Example Configs

### Production Config

```ts
// changelog.production.config.ts
export default {
  monorepo: {
    versionMode: 'unified',
  },
  publish: {
    access: 'public',
    tag: 'latest',
  },
}
```

### Staging Config

```ts
// changelog.staging.config.ts
export default {
  monorepo: {
    versionMode: 'independent',
  },
  publish: {
    access: 'public',
    tag: 'beta',
  },
}
```

### Standalone Package Config

```ts
// changelog.standalone.config.ts
export default {
  // No monorepo settings
  publish: {
    access: 'public',
  },
}
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
export const commonConfig = {
  types: {
    feat: { title: '🚀 Features', semver: 'minor' },
    fix: { title: '🐛 Fixes', semver: 'patch' },
  },
}
```

```ts
// changelog.production.config.ts
import { commonConfig } from './shared.config'

export default {
  ...commonConfig,
  publish: {
    tag: 'latest',
  },
}
```

```ts
// changelog.staging.config.ts
import { commonConfig } from './shared.config'

export default {
  ...commonConfig,
  publish: {
    tag: 'beta',
  },
}
```
