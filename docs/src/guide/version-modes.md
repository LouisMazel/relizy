---
title: Version Modes
description: Relizy supports three different versioning strategies for monorepos, each designed for different use cases.
keywords: version modes, monorepo versioning, unified mode, selective mode, independent mode, versioning strategies
category: Guide
tags: [guide, versioning, monorepo, strategies]
---

# {{ $frontmatter.title }}

> Only for monorepo with multiple packages

{{ $frontmatter.description }}

## Overview

When working with monorepos, you need to decide how to manage versions across multiple packages. Relizy provides three modes:

| Mode                                                       | Description                                                                            | Best For                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **[Selective](#selective-mode-recommended) (recommended)** | Only changed packages and their dependents are bumped (but all share the same version) | Projects with many packages but not all change every release                  |
| **[Unified](#unified-mode)**                               | All packages share the same version                                                    | Projects where all packages are released together to keep version consistency |
| **[Independent](#independent-mode)**                       | Each package has its own version                                                       | Projects where packages evolve independently                                  |

## Selective Mode (Recommended)

Selective mode is like unified mode, but only packages with actual changes are bumped.

### How It Works

When you run a release:

1. Relizy analyzes git commits to find changed packages
2. Only packages with changes (and their dependents) are bumped
3. All bumped packages share the same version number
4. Individual package changelogs are generated
5. A single tag is created (e.g. `v1.2.0`)

### Configuration

```ts
// relizy.config.ts
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: {
    versionMode: 'selective', // ← Recommended!
    packages: ['packages/*'],
  },
})
```

### Example

```text
Before:
  root: 1.0.0
  packages/core: 1.0.0
  packages/utils: 1.0.0
  packages/ui: 1.0.0    ← has commits

After release --minor:
  root: 1.0.0           ← Not bumped
  packages/core: 1.0.0  ← Not bumped (no changes)
  packages/utils: 1.0.0 ← Not bumped (no changes)
  packages/ui: 1.1.0    ← Bumped (has changes)
```

### Dependency Handling

If a package depends on a changed package, it's automatically bumped:

```text
packages/core: has changes → bumped to 1.1.0
packages/ui: depends on core → also bumped to 1.1.0
```

### When to Use

✅ **Use selective mode when:**

- You have multiple packages in a monorepo
- Not all packages change with every release
- You want to avoid unnecessary version bumps
- You still want consistent versioning across updated packages

❌ **Avoid selective mode when:**

- You want every package to always have the same version
- You prefer completely independent package versions

### Real-World Example

```bash
# Only changed packages get bumped
relizy release --minor

# Output:
# ✓ packages/core: 1.2.0 → 1.3.0 (has commits)
# ✓ packages/ui: 1.2.0 → 1.3.0 (depends on core)
# ○ packages/utils: 1.2.0 (no changes)
# ✓ Created tags: core-v1.3.0, ui-v1.3.0
```

## Unified Mode

In unified mode, all packages in your monorepo share a single version number.

### How It Works

When you run a release:

1. The version is read from the root `package.json`
2. ALL packages are bumped to the new version
3. A single git tag is created (e.g., `v1.2.0`)
4. The root `CHANGELOG.md` and all package changelogs are updated

### Configuration

```ts
// relizy.config.ts
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: {
    versionMode: 'unified',
    packages: ['packages/*'],
  },
})
```

### Example

```bash
Before:
  root: 1.0.0
  packages/core: 1.0.0
  packages/utils: 1.0.0
  packages/ui: 1.0.0

After release --minor:
  root: 1.1.0
  packages/core: 1.1.0      ← Bumped (even without changes)
  packages/utils: 1.1.0     ← Bumped (even without changes)
  packages/ui: 1.1.0        ← Bumped (even without changes)
```

### When to Use

✅ **Use unified mode when:**

- All packages are tightly coupled
- You want simple, synchronized versioning
- Packages are always released together
- You want a single changelog for the entire project

❌ **Avoid unified mode when:**

- Packages evolve independently
- You have many packages with infrequent changes
- You want granular version control per package

### Real-World Example

```bash
# All packages get version 2.0.0
relizy release --major

# Output:
# ✓ packages/core: 1.5.0 → 2.0.0
# ✓ packages/utils: 1.5.0 → 2.0.0
# ✓ packages/ui: 1.5.0 → 2.0.0
# ✓ Created tag: v2.0.0
```

## Independent Mode

In independent mode, each package maintains its own version number and evolves independently.

### How It Works

When you run a release:

1. Each package is analyzed separately
2. Packages are bumped based on their own commits
3. Each package can have a different version
4. Individual changelogs are created per package
5. Separate git tags are created (e.g., `core@v2.1.0`, `ui@v1.5.3`)

### Configuration

```ts
// relizy.config.ts
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: {
    versionMode: 'independent',
    packages: ['packages/*'],
  },
})
```

### Example

```text
Before:
  root: 1.0.0
  packages/core: 2.0.0
  packages/utils: 1.3.5
  packages/ui: 0.8.0    ← has commits

After release --minor:
  root: 1.0.0           ← Not changed
  packages/core: 2.0.0  ← Not changed
  packages/utils: 1.3.5 ← Not changed
  packages/ui: 0.9.0    ← Bumped based on its commits
```

### Dependency Handling

When a package changes, its dependents get a minimum patch bump:

```text
packages/core: 2.0.0 → 2.1.0 (has feature commits)
packages/ui: 1.5.0 → 1.5.1 (depends on core, gets patch bump)
```

If a dependent also has qualifying commits, it gets the appropriate bump:

```text
packages/core: 2.0.0 → 2.1.0 (has feature commits)
packages/ui: 1.5.0 → 1.6.0 (has its own feature commits)
```

### When to Use

✅ **Use independent mode when:**

- Packages have different lifecycles
- Some packages are stable while others evolve quickly
- You want maximum flexibility
- Packages are published separately

❌ **Avoid independent mode when:**

- You want simple, synchronized versioning
- Packages are tightly coupled
- You prefer consistent versions across the monorepo

### Real-World Example

```bash
# Each package bumped independently
relizy release

# Output:
# ✓ packages/core: 2.1.0 → 2.2.0 (minor - has feat commits)
# ✓ packages/utils: 1.3.5 → 1.3.6 (patch - has fix commits)
# ✓ packages/ui: 0.8.0 → 0.8.0 (no changes)
# ✓ Created tags: core-v2.2.0, utils-v1.3.6
```

## Comparison Table

| Feature                 | Unified                                        | Selective                                      | Independent            |
| ----------------------- | ---------------------------------------------- | ---------------------------------------------- | ---------------------- |
| **Version Consistency** | All packages always match                      | Changed packages match                         | Each package unique    |
| **Tags**                | Single root tag                                | Single root tag                                | Per-package tags       |
| **Changelog**           | Single root changelog + Per-package changelogs | Single root changelog + Per-package changelogs | Per-package changelogs |
| **Bump All Packages**   | ✅ Yes                                         | ❌ No                                          | ❌ No                  |
| **Bump Only Changed**   | ❌ No                                          | ✅ Yes                                         | ✅ Yes                 |
| **Different Versions**  | ❌ No                                          | ❌ No                                          | ✅ Yes                 |

## Switching Modes

You can change the version mode at any time by updating your config:

```ts
// relizy.config.ts
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: {
    versionMode: 'selective', // Change this value
    packages: ['packages/*'],
  },
})
```

::: warning
Switching from independent to unified/selective will align all packages to a common version on the next release.
:::

## Best Practices

### For Small Monorepos (2-5 packages)

Use **selective mode** - it provides a good balance of simplicity and flexibility.

### For Large Monorepos (10+ packages)

Use **independent mode** - it prevents version number inflation and gives fine-grained control.

### For Tightly Coupled Packages

Use **unified mode** - it keeps everything in sync and is the simplest to manage.

## Dependency Configuration

Control which dependency types trigger bumps:

```ts
export default defineConfig({
  monorepo: {
    versionMode: 'selective',
  },
  bump: {
    dependencyTypes: [
      'dependencies', // Bump when production deps change
      'devDependencies', // Bump when dev deps change
      'peerDependencies', // Bump when peer deps change
    ],
  }
})
```

## Next Steps

- [Dependency Management](/guide/dependency-management) - Learn how dependencies are handled
- [Configuration](/config/monorepo) - Detailed monorepo configuration options
- [CLI Commands](/cli/release) - Learn about release command options
