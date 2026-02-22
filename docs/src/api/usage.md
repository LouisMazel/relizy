---
title: Programmatic API
description: Use Relizy programmatically in your Node.js scripts and tools.
keywords: [relizy api, programmatic api, node.js api, monorepo api, version management api, release automation api, typescript api]
category: API Reference
tags: [api, programmatic, node.js, typescript, integration]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Installation

::: code-group

```bash [pnpm]
pnpm add -D relizy
```

```bash [npm]
npm install -D relizy
```

```bash [yarn]
yarn add -D relizy
```

```bash [bun]
bun add -D relizy
```

:::

## Import

```ts
import { bump, changelog, prComment, providerRelease, publish, release } from 'relizy'
```

## Quick Example

```ts
import { release } from 'relizy'

// Perform a minor release
await release({
  type: 'minor',
  publish: true,
  providerRelease: true,
})
```

## Why Use the API?

The programmatic API is useful for:

- 🔧 Custom release workflows
- 🤖 Integration into build tools
- 📦 Custom monorepo tooling
- 🎯 Conditional release logic
- 📊 Release automation scripts

## Available Functions

| Function                                   | Description                          |
| ------------------------------------------ | ------------------------------------ |
| [`release()`](release.md)                  | Complete release workflow            |
| [`bump()`](bump.md)                        | Bump package versions                |
| [`changelog()`](changelog.md)              | Generate changelogs                  |
| [`publish()`](publish.md)                  | Publish to npm                       |
| [`providerRelease()`](provider-release.md) | Create GitHub or GitLab releases     |
| [`prComment()`](pr-comment.md)             | Post release info as a PR/MR comment |

## Basic Usage

### Full Release

```ts
import { release } from 'relizy'

await release({
  type: 'patch',
  commit: true,
  tag: true,
  push: true,
  publish: false,
})
```

### Version Bump Only

```ts
import { bump } from 'relizy'

const result = await bump({
  type: 'minor',
})

console.log(`New version: ${result.newVersion}`)
```

### Changelog Generation

```ts
import { changelog } from 'relizy'

await changelog({
  from: 'v1.0.0',
  to: 'HEAD',
})
```

### NPM Publishing

```ts
import { publish } from 'relizy'

await publish({
  packages: ['core', 'utils'],
  tag: 'latest',
  access: 'public',
})
```

### Provider Release

```ts
import { providerRelease } from 'relizy'

await providerRelease({
  draft: false,
  prerelease: false,
})
```

## Configuration

Load configuration from file:

```ts
import { loadConfig, release } from 'relizy'

const config = await loadConfig()

await release({
  ...config,
  type: 'minor',
})
```

Or define inline:

```ts
await release({
  type: 'minor',
  monorepo: {
    versionMode: 'selective',
    packages: ['packages/*'],
  },
  publish: true,
})
```

## Error Handling

```ts
import { release } from 'relizy'

try {
  await release({
    type: 'minor',
  })
  console.log('Release successful!')
}
catch (error) {
  console.error('Release failed:', error.message)
  process.exit(1)
}
```

## TypeScript Support

Relizy is written in TypeScript and provides full type definitions:

```ts
import type { BumpOptions, ReleaseOptions } from 'relizy'

const options: ReleaseOptions = {
  type: 'minor',
  publish: true,
  providerRelease: false,
}
```

## Custom Workflows

### Conditional Publishing

```ts
import { release } from 'relizy'

const isProduction = process.env.NODE_ENV === 'production'

await release({
  type: 'minor',
  publish: isProduction, // Only publish in production
  providerRelease: isProduction,
})
```

### Multi-Stage Release

```ts
import { bump, changelog, providerRelease, publish } from 'relizy'

// Stage 1: Bump version
const { newVersion } = await bump({ type: 'minor' })

// Stage 2: Generate changelog
await changelog()

// Stage 3: Run tests
await runTests()

// Stage 4: Publish if tests pass
await publish()

// Stage 5: Create release
await providerRelease()
```

### Monorepo Custom Logic

```ts
import { bump } from 'relizy'

// Get changed packages
const { packages } = await bump({
  type: 'minor',
  dryRun: true,
})

// Custom logic for each package
for (const pkg of packages) {
  console.log(`${pkg.name} will be bumped to ${pkg.newVersion}`)

  // Your custom logic here
  if (pkg.name === '@myorg/critical') {
    // Special handling for critical packages
  }
}

// Perform actual bump
await bump({ type: 'minor' })
```

## Examples

### Automated Release Script

```ts
#!/usr/bin/env node
import { release } from 'relizy'

async function main() {
  const releaseType = process.argv[2] || 'patch'

  console.log(`Starting ${releaseType} release...`)

  await release({
    releaseType,
    yes: true, // Skip prompts
    publish: true,
    providerRelease: true,
    logLevel: 'info',
  })

  console.log('Release complete!')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

### CI/CD Integration

```ts
import { release } from 'relizy'

const isCI = process.env.CI === 'true'

await release({
  type: 'minor',
  yes: isCI, // Auto-confirm in CI
  noGitChecks: isCI, // Skip git checks in CI
  publish: isCI,
  providerRelease: isCI,
})
```

## Next Steps

Explore individual API functions:

- [release()](release.md) - Complete release workflow
- [bump()](bump.md) - Version bumping
- [changelog()](changelog.md) - Changelog generation
- [publish()](publish.md) - NPM publishing
- [providerRelease()](provider-release.md) - Provider releases
- [createCommitAndTags()](create-commit-and-tags.md) - Create commit and tags
- [prComment()](pr-comment.md) - PR/MR comments
- [loadRelizyConfig()](load-relizy-config.md) - Load Relizy config
