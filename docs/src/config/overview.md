# Configuration

Complete guide to configuring Relizy.

## Configuration File

Create a configuration file in your project root:

::: code-group

```ts [relizy.config.ts]
import { defineConfig } from 'relizy'

export default defineConfig({
  // Your configuration
})
```

```js [relizy.config.js]
export default {
  // Your configuration
}
```

```json [relizy.config.json]
{
  // Your configuration
}
```

:::

## Supported Formats

Relizy supports multiple configuration formats:

- `relizy.config.ts` (recommended)
- `relizy.config.js`
- `relizy.config.mjs`
- `relizy.config.json`
- `relizy.config.yaml`
- `relizy.config.toml`

## Zero Configuration

Relizy works out of the box without any configuration:

```bash
npx relizy release --patch
```

Configuration is only needed for:

- Custom monorepo settings
- Custom commit types
- Custom changelog formatting
- Multiple release strategies

## Quick Start

### Single Package

No configuration needed! Just run:

```bash
npx relizy release --minor
```

### Monorepo - Basic

```ts
// relizy.config.ts
export default {
  monorepo: {
    versionMode: 'selective',
    packageGlobs: ['packages/*'],
  },
}
```

### Monorepo - Advanced

```ts
// relizy.config.ts
export default {
  monorepo: {
    versionMode: 'selective',
    packageGlobs: ['packages/*'],
    dependencyTypes: ['dependencies', 'peerDependencies'],
    ignorePackageNames: ['example-*'],
  },
  types: {
    feat: { title: '🎉 Features', semver: 'minor' },
    fix: { title: '🐛 Fixes', semver: 'patch' },
  },
  publish: {
    access: 'public',
    tag: 'latest',
  },
}
```

## Configuration Sections

| Section                                 | Description                |
| --------------------------------------- | -------------------------- |
| [monorepo](/config/monorepo)            | Monorepo-specific settings |
| [types](/config/changelog#commit-types) | Commit type customization  |
| [bump](/config/bump)                    | Version bump settings      |
| [publish](/config/publish)              | NPM publishing options     |
| [release](/config/release)              | Release workflow settings  |

## TypeScript Support

Get full IntelliSense with TypeScript:

```ts
import type { RelizyConfig } from 'relizy'
import { defineConfig } from 'relizy'

export default defineConfig({
  // Full type checking and autocomplete
  monorepo: {
    versionMode: 'selective', // ← Autocompleted
  },
})
```

## Environment Variables

Override configuration with environment variables:

```bash
# Set version mode
export RELIZY_VERSION_MODE=independent

# Set log level
export RELIZY_LOG_LEVEL=debug

# Run release
npx relizy release
```

## Multiple Configurations

Use different configs for different workflows:

```bash
# Use default config
npx relizy release

# Use staging config
npx relizy release --config staging

# Uses changelog.staging.config.ts
```

Learn more in [Multiple Configs](/config/multiple-configs).

## Default Configuration

If no config file exists, Relizy uses these defaults:

```ts
const defaultConfig = {
  monorepo: {
    versionMode: 'unified',
    packageGlobs: ['packages/*'],
    dependencyTypes: ['dependencies', 'devDependencies', 'peerDependencies'],
    ignorePackageNames: [],
  },
  types: {
    feat: { title: '🚀 Features', semver: 'minor' },
    fix: { title: '🐛 Bug Fixes', semver: 'patch' },
    perf: { title: '⚡ Performance', semver: 'patch' },
    refactor: { title: '♻️ Refactors', semver: 'patch' },
    docs: { title: '📚 Documentation', semver: 'patch' },
    style: { title: '💅 Styles', semver: 'patch' },
    test: { title: '✅ Tests', semver: 'patch' },
    build: { title: '📦 Build', semver: 'patch' },
    ci: { title: '🤖 CI/CD', semver: 'patch' },
    chore: { title: '🏠 Chores', semver: 'patch' },
  },
  publish: {
    access: 'public',
    tag: 'latest',
  },
  release: {
    commit: true,
    tag: true,
    push: true,
  },
}
```

## Next Steps

Explore specific configuration sections:

- [Monorepo Options](/config/monorepo)
- [Changelog Options](/config/changelog)
- [Bump Options](/config/bump)
- [Publish Options](/config/publish)
- [Release Options](/config/release)
- [Multiple Configs](/config/multiple-configs)
