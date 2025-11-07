# Dependency Management

Learn how Relizy handles dependencies between packages in monorepos.

## Overview

In monorepos, packages often depend on each other. When you update package A, any package that depends on A should also be updated. Relizy handles this automatically.

## How It Works

When you release a package:

1. **Detect Changes** - Relizy identifies which packages have commits
2. **Find Dependents** - It looks for packages that depend on changed packages
3. **Calculate Bumps** - Dependent packages are bumped appropriately
4. **Update Versions** - Dependencies in `package.json` are updated
5. **Transitive Updates** - The process repeats for transitive dependencies

## Simple Example

Imagine this dependency graph:

```
packages/ui
  └── depends on @myorg/core

packages/core
  └── no dependencies
```

When `core` is updated:

```bash
npx relizy release --minor

# What happens:
# 1. core: 1.0.0 → 1.1.0 (has commits)
# 2. ui: 1.0.0 → 1.1.0 (depends on core)
# 3. ui's package.json updated:
#    "@myorg/core": "^1.1.0"
```

## Transitive Dependencies

Relizy handles multi-level dependency chains automatically.

### Example

```
packages/app
  └── depends on @myorg/ui

packages/ui
  └── depends on @myorg/core

packages/core
  └── no dependencies
```

When `core` changes:

```bash
npx relizy release --minor

# What happens:
# 1. core: 1.0.0 → 1.1.0 (has commits)
# 2. ui: 1.0.0 → 1.1.0 (depends on core)
# 3. app: 1.0.0 → 1.1.0 (depends on ui)
```

All three packages are bumped and their dependencies are updated!

## Dependency Types

You can configure which dependency fields trigger updates:

```ts
// relizy.config.ts
export default {
  monorepo: {
    dependencyTypes: [
      'dependencies', // Production dependencies
      'devDependencies', // Development dependencies
      'peerDependencies', // Peer dependencies
    ],
  },
}
```

### Production Dependencies

Most common - used at runtime:

```json
{
  "dependencies": {
    "@myorg/core": "^1.0.0"
  }
}
```

If `core` is updated, any package listing it in `dependencies` will be bumped.

### Dev Dependencies

Used only during development:

```json
{
  "devDependencies": {
    "@myorg/test-utils": "^1.0.0"
  }
}
```

By default, changes to dev dependencies also trigger bumps. Disable if you want:

```ts
export default {
  monorepo: {
    dependencyTypes: ['dependencies'], // Only production deps
  },
}
```

### Peer Dependencies

Dependencies that consumers must provide:

```json
{
  "peerDependencies": {
    "@myorg/core": "^1.0.0"
  }
}
```

Peer dependency updates are tracked like regular dependencies.

## Version Mode Differences

How dependencies are handled varies by version mode:

### Unified Mode

All packages get the same version:

```
core: 1.0.0 → 1.1.0
ui: 1.0.0 → 1.1.0 (depends on core)
app: 1.0.0 → 1.1.0 (depends on ui)
```

Dependencies in `package.json` are updated to match:

```json
{
  "dependencies": {
    "@myorg/core": "^1.1.0"
  }
}
```

### Selective Mode

Only changed packages (and dependents) are bumped, but they share versions:

```
core: 1.0.0 → 1.1.0 (has commits)
ui: 1.0.0 → 1.1.0 (depends on core)
app: 1.2.0 → 1.2.0 (no changes, doesn't depend on core)
```

### Independent Mode

Each package has its own version. Dependents get minimum patch bump:

```
core: 2.0.0 → 2.1.0 (has feature commits)
ui: 1.5.0 → 1.5.1 (depends on core, gets patch bump)
```

If a dependent also has commits, it gets the appropriate bump:

```
core: 2.0.0 → 2.1.0 (has feature commits)
ui: 1.5.0 → 1.6.0 (has its own feature commits)
```

## Workspace Protocol

Relizy supports the workspace protocol used by pnpm and yarn:

```json
{
  "dependencies": {
    "@myorg/core": "workspace:*"
  }
}
```

After a release, this is updated to:

```json
{
  "dependencies": {
    "@myorg/core": "workspace:^1.1.0"
  }
}
```

## Version Ranges

Relizy respects and updates version ranges:

### Caret (^) - Default

```json
{
  "dependencies": {
    "@myorg/core": "^1.0.0" // → "^1.1.0"
  }
}
```

### Tilde (~)

```json
{
  "dependencies": {
    "@myorg/core": "~1.0.0" // → "~1.1.0"
  }
}
```

### Exact

```json
{
  "dependencies": {
    "@myorg/core": "1.0.0" // → "1.1.0"
  }
}
```

## Complex Dependency Graphs

Relizy handles complex scenarios automatically:

### Diamond Dependencies

```
       app
      /   \
    ui     admin
      \   /
       core
```

When `core` changes, all packages are updated in the correct order.

### Circular Dependencies

::: warning
Circular dependencies are detected and will cause an error. Refactor your packages to remove cycles:

```
ui → core → ui  // ❌ Not allowed
```

:::

## Ignoring Packages

You can exclude packages from dependency tracking:

```ts
// relizy.config.ts
export default {
  monorepo: {
    ignorePackageNames: [
      'example-*', // Ignore example packages
      'docs', // Ignore docs package
    ],
  },
}
```

Ignored packages:

- Won't trigger dependent updates
- Won't be bumped automatically
- Can still be manually released

## Dry Run for Dependency Testing

Use dry run to preview dependency updates:

```bash
npx relizy release --minor --dry-run
```

Output shows the full dependency tree:

```
Packages to bump:
✓ @myorg/core: 1.0.0 → 1.1.0 (has commits)
✓ @myorg/ui: 1.0.0 → 1.1.0 (depends on core)
✓ @myorg/app: 1.0.0 → 1.1.0 (depends on ui)
```

## Manual Package Selection

Override automatic dependency detection:

```bash
# Only release specific packages
npx relizy release --minor --packages core,ui

# Relizy will still bump dependents:
# ✓ core: 1.0.0 → 1.1.0
# ✓ ui: 1.0.0 → 1.1.0
# ✓ app: 1.0.0 → 1.1.0 (depends on ui)
```

## Best Practices

### 1. Use Workspace Protocol

For monorepos with pnpm or yarn:

```json
{
  "dependencies": {
    "@myorg/core": "workspace:^"
  }
}
```

This ensures packages always reference workspace versions during development.

### 2. Set Correct Dependency Types

Only track the dependency types that matter:

```ts
export default {
  monorepo: {
    // Don't bump for devDependency changes
    dependencyTypes: ['dependencies', 'peerDependencies'],
  },
}
```

### 3. Review Dry Run Output

Always check dependency updates before releasing:

```bash
npx relizy release --minor --dry-run
```

### 4. Keep Dependency Graphs Simple

Avoid complex dependency chains when possible. Flatter is better.

### 5. Use Consistent Version Ranges

Stick to one range style across your monorepo:

// Good ✅

```json
{
  "dependencies": {
    "@myorg/core": "^1.0.0",
    "@myorg/utils": "^2.0.0"
  }
}
```

// Mixed ❌

```json
{
  "dependencies": {
    "@myorg/core": "^1.0.0",
    "@myorg/utils": "~2.0.0"
  }
}
```

## Troubleshooting

### Dependent Packages Not Bumping

Check your `dependencyTypes` configuration:

```ts
export default {
  monorepo: {
    dependencyTypes: [
      'dependencies', // Add missing types
      'devDependencies',
    ],
  },
}
```

### Wrong Version in Dependencies

Ensure you're using the correct version range format:

```json
{
  "dependencies": {
    "@myorg/core": "^1.0.0" // ✅ Caret
    // not: "workspace:*"     // ❌ Will be replaced
  }
}
```

### Circular Dependency Error

Refactor packages to break the cycle:

```
Before (circular):
ui → core → ui

After (fixed):
ui → core
utils → core
```

## Examples

### Full Monorepo Release

```bash
# In a monorepo with:
# - packages/core (has commits)
# - packages/utils (depends on core)
# - packages/ui (depends on utils)
# - packages/app (depends on ui)

npx relizy release --minor

# Output:
# ✓ @myorg/core: 1.0.0 → 1.1.0
# ✓ @myorg/utils: 1.0.0 → 1.1.0 (depends on core)
# ✓ @myorg/ui: 1.0.0 → 1.1.0 (depends on utils)
# ✓ @myorg/app: 1.0.0 → 1.1.0 (depends on ui)
```

### Selective Release

```bash
# Only bump packages/core and its dependents

npx relizy release --minor --packages core

# Output:
# ✓ @myorg/core: 1.0.0 → 1.1.0
# ✓ @myorg/utils: 1.0.0 → 1.1.0 (depends on core)
# ✓ @myorg/ui: 1.0.0 → 1.1.0 (depends on utils)
# ○ @myorg/unrelated: 1.0.0 (no dependency)
```

## Next Steps

- [Version Modes](/guide/version-modes) - Understand versioning strategies
- [Configuration](/config/monorepo) - Configure dependency behavior
- [CLI Commands](/cli/release) - Learn about release options
