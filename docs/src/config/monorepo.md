# Monorepo Configuration

Configure monorepo-specific behavior.

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

Learn more: [Version Modes](/guide/version-modes)

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

## dependencyTypes

Which dependency types trigger bumps:

```ts
export default defineConfig({
  monorepo: {
    dependencyTypes: [
      'dependencies', // Production deps
      'devDependencies', // Dev deps
      'peerDependencies', // Peer deps
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
    dependencyTypes: ['dependencies', 'peerDependencies'],
    ignorePackageNames: ['example-a', 'docs'],
  },
})
```
