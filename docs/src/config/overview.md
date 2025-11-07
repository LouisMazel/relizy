# Configuration

Complete guide to configuring Relizy.

## Configuration File

Create a configuration file in your project root:

::: code-group

```ts [relizy.config.ts]
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: {
    versionMode: 'selective',
    packageGlobs: ['packages/*'],
  },
})
```

```js [relizy.config.js]
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: {
    versionMode: 'selective',
    packageGlobs: ['packages/*'],
  },
})
```

```json [relizy.config.json]
{
  "monorepo": {
    "versionMode": "selective",
    "packageGlobs": ["packages/*"]
  }
}
```

```json [package.json]
{
  "name": "my-monorepo",
  "version": "1.0.0",
  "monorepo": {
    "versionMode": "selective",
    "packageGlobs": ["packages/*"]
  }
}
```

```yml [relizy.config.yml]
monorepo:
  versionMode: selective
  packageGlobs:
    - packages/*
```

```toml [relizy.config.toml]
[monorepo]
versionMode = "selective"
packageGlobs = [ "packages/*" ]
```

:::

## Supported Formats

Relizy supports multiple configuration formats. It loaded with [c12](https://github.com/unjs/c12), check the documentation for more details.

- `relizy.config.ts` (recommended)
- `relizy.config.js`
- `relizy.config.mjs`
- `relizy.config.json`
- `relizy.config.yaml`
- `relizy.config.yml`
- `relizy.config.toml`
- And more...

## Zero Configuration

Relizy works out of the box without any configuration (for single package):

```bash
relizy release
```

Configuration is only needed for:

- Monorepo settings (needs `monorepo` section with `versionMode` and `packages` glob patterns to find your packages)
- Custom commit types
- Multiple release strategies

## Quick Start

### Single Package

No configuration needed! Just run:

```bash
relizy release --minor
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
    dependencyTypes: ['dependencies', 'devDependencies'],
    ignorePackageNames: ['pacakge-a'],
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

| Section                            | Description                |
| ---------------------------------- | -------------------------- |
| [monorepo](monorepo.md)            | Monorepo-specific settings |
| [types](changelog.md#commit-types) | Commit type customization  |
| [bump](bump.md)                    | Version bump settings      |
| [publish](publish.md)              | NPM publishing options     |
| [release](release.md)              | Release workflow settings  |

## TypeScript Support

Get full IntelliSense with TypeScript:

```ts
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
export RELIZY_GITHUB_TOKEN=your-github-token

# Set log level
export RELIZY_LOG_LEVEL=debug

# Run release
relizy release
```

## Multiple Configurations

Use different configs for different workflows:

```bash
# Use default config
relizy release

# Use staging config
relizy release --config staging

# Uses changelog.staging.config.ts
```

Learn more in [Multiple Configs](/config/multiple-configs).

## Default Configuration

If no config file exists, Relizy uses these defaults:

```ts
const defaultConfig = {
  cwd: process.cwd(),
  types: {
    feat: { title: '🚀 Enhancements', semver: 'minor' },
    perf: { title: '🔥 Performance', semver: 'patch' },
    fix: { title: '🩹 Fixes', semver: 'patch' },
    refactor: { title: '💅 Refactors', semver: 'patch' },
    docs: { title: '📖 Documentation', semver: 'patch' },
    build: { title: '📦 Build', semver: 'patch' },
    types: { title: '🌊 Types', semver: 'patch' },
    chore: { title: '🏡 Chore' },
    examples: { title: '🏀 Examples' },
    test: { title: '✅ Tests' },
    style: { title: '🎨 Styles' },
    ci: { title: '🤖 CI' },
  },
  templates: {
    commitMessage: 'chore(release): bump version to {{newVersion}}',
    tagMessage: 'Bump version to v{{newVersion}}',
    tagBody: 'v{{newVersion}}',
    emptyChangelogContent: 'No relevant changes for this release',
  },
  excludeAuthors: [],
  noAuthors: false,
  bump: {
    type: 'release',
    clean: true,
    dependencyTypes: ['dependencies'],
    yes: false,
  },
  changelog: {
    rootChangelog: true,
    includeCommitBody: true,
  },
  publish: {
    private: false,
    args: [],
  },
  tokens: {
    gitlab:
        process.env.RELIZY_GITLAB_TOKEN
        || process.env.GITLAB_TOKEN
        || process.env.GITLAB_API_TOKEN
        || process.env.CI_JOB_TOKEN,
    github:
        process.env.RELIZY_GITHUB_TOKEN
        || process.env.GITHUB_TOKEN
        || process.env.GH_TOKEN,
  },
  scopeMap: {},
  release: {
    commit: true,
    publish: true,
    changelog: true,
    push: true,
    clean: true,
    providerRelease: true,
    noVerify: false,
  },
  logLevel: 'default',
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
