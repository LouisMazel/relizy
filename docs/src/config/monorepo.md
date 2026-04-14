---
title: Monorepo Configuration
description: Configure monorepo-specific behavior.
keywords: monorepo config, version mode, workspace packages, monorepo versioning, package management
category: Configuration
tags: [config, monorepo, versioning, workspace]
---

# {{ $frontmatter.title }}

> Optional for standalone package

{{ $frontmatter.description }}

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

Learn more: [Version Modes](../guide/version-modes.md)

::: tip Independent mode commit messages
In `independent` mode, Relizy uses shorter release commit titles by default
and moves the full package list into the commit body so you stay under
commitlint header limits. See [Commit Templates](./commit-templates.md) for
placeholders and examples.
:::

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

## includePrivates

Include private packages (packages with `"private": true` in their `package.json`)
in **bump** and **changelog** operations.

By default, private packages are excluded from every pipeline step. When this
option is enabled, they participate in version bumping and changelog generation:
they get their own version bump, their own `CHANGELOG.md`, and their commits
are included in the aggregated root changelog.

Private packages **remain excluded** from:

- `relizy publish` (they are never published to a registry)
- `relizy provider-release` (no GitHub/GitLab releases are created for them)
- `relizy pr-comment` (they are not listed in PR comments)

This is useful for monorepos that contain internal-only packages (apps,
examples, private libraries) that still need versioning and changelog tracking.

```ts
export default defineConfig({
  monorepo: {
    versionMode: 'selective',
    packages: ['packages/*', 'apps/*'],
    includePrivates: true,
  },
})
```

You can also enable it ad-hoc from the CLI with the `--include-private` flag on
`relizy bump`, `relizy changelog`, and `relizy release`.

> [!NOTE]
> `ignorePackageNames` still takes precedence. A private package listed in
> `ignorePackageNames` stays excluded even if `includePrivates` is `true`.

## Complete Example

```ts
export default defineConfig({
  monorepo: {
    versionMode: 'selective',
    packages: ['packages/*', 'apps/*'],
    ignorePackageNames: ['example-a', 'docs'],
    includePrivates: false,
  },
})
```
