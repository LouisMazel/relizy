# Programmatic API

Use Relizy programmatically in your Node.js scripts and tools.

## Installation

```bash
npm install relizy
```

## Import

```ts
import { bump, changelog, providerRelease, publish, release } from 'relizy'
```

## Quick Example

```ts
import { release } from 'relizy'

// Perform a minor release
await release({
  releaseType: 'minor',
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

| Function                                     | Description                   |
| -------------------------------------------- | ----------------------------- |
| [`release()`](/api/release)                  | Complete release workflow     |
| [`bump()`](/api/bump)                        | Bump package versions         |
| [`changelog()`](/api/changelog)              | Generate changelogs           |
| [`publish()`](/api/publish)                  | Publish to npm                |
| [`providerRelease()`](/api/provider-release) | Create GitHub/GitLab releases |

## Basic Usage

### Full Release

```ts
import { release } from 'relizy'

await release({
  releaseType: 'patch',
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
  releaseType: 'minor',
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
  releaseType: 'minor',
})
```

Or define inline:

```ts
await release({
  releaseType: 'minor',
  monorepo: {
    versionMode: 'selective',
    packageGlobs: ['packages/*'],
  },
  publish: true,
})
```

## Error Handling

```ts
import { release } from 'relizy'

try {
  await release({
    releaseType: 'minor',
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
  releaseType: 'minor',
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
  releaseType: 'minor',
  publish: isProduction, // Only publish in production
  providerRelease: isProduction,
})
```

### Multi-Stage Release

```ts
import { bump, changelog, providerRelease, publish } from 'relizy'

// Stage 1: Bump version
const { newVersion } = await bump({ releaseType: 'minor' })

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
  releaseType: 'minor',
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
await bump({ releaseType: 'minor' })
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
  releaseType: 'minor',
  yes: isCI, // Auto-confirm in CI
  noGitChecks: isCI, // Skip git checks in CI
  publish: isCI,
  providerRelease: isCI,
})
```

## Next Steps

Explore individual API functions:

- [release()](/api/release) - Complete release workflow
- [bump()](/api/bump) - Version bumping
- [changelog()](/api/changelog) - Changelog generation
- [publish()](/api/publish) - NPM publishing
- [providerRelease()](/api/provider-release) - Provider releases
