# Monorepo Configuration

Configure monorepo-specific behavior.

## versionMode

Choose how versions are managed:

```ts
export default {
  monorepo: {
    versionMode: 'selective', // 'unified' | 'selective' | 'independent'
  },
}
```

- **unified**: All packages share the same version
- **selective**: Only changed packages bumped (recommended)
- **independent**: Each package has its own version

Learn more: [Version Modes](/guide/version-modes)

## packageGlobs

Specify where packages are located:

```ts
export default {
  monorepo: {
    packageGlobs: [
      'packages/*',
      'apps/*',
      'libs/*',
    ],
  },
}
```

## dependencyTypes

Which dependency types trigger bumps:

```ts
export default {
  monorepo: {
    dependencyTypes: [
      'dependencies', // Production deps
      'devDependencies', // Dev deps
      'peerDependencies', // Peer deps
    ],
  },
}
```

## ignorePackageNames

Exclude specific packages:

```ts
export default {
  monorepo: {
    ignorePackageNames: [
      'example-*', // Glob patterns supported
      'docs',
      '@myorg/private',
    ],
  },
}
```

## Complete Example

```ts
export default {
  monorepo: {
    versionMode: 'selective',
    packageGlobs: ['packages/*', 'apps/*'],
    dependencyTypes: ['dependencies', 'peerDependencies'],
    ignorePackageNames: ['example-*', 'docs'],
  },
}
```
