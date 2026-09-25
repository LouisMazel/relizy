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

## ignored

Exclude packages by **path**, using the same glob syntax as [`packages`](#packages).
This is the recommended way to ignore packages, for consistency with `packages`.

```ts
export default defineConfig({
  monorepo: {
    packages: ['packages/*', 'shared-components/*'],
    ignored: [
      'shared-components/navigation', // a single package
      'packages/internal-*', // or a glob
    ],
  },
})
```

Ignored packages are excluded from **bump**, **changelog**, **publish**,
**provider-release** and **pr-comment**.

::: warning Root bump & changelog (unified / selective)
In `unified` and `selective` mode the root version is derived from **all**
commits in the repository. Commits whose changed files **all** live inside an
ignored package are excluded from the root version bump and the root changelog.

This means a **breaking change** scoped to an ignored package no longer bumps
the whole repository - as long as that change lives in its own commit. Keep
ignored-package changes in dedicated commits (do not mix them with changes to
released packages in the same commit), otherwise the commit still counts for the
root.
:::

## ignorePackageNames

::: warning Deprecated
`ignorePackageNames` is deprecated in favor of [`ignored`](#ignored) (path
globs), for consistency with `packages`. Both options are still honored and
**merged together**, so you can migrate incrementally.
:::

Exclude specific packages by their `package.json` **name**:

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
> `ignored` / `ignorePackageNames` still take precedence. A private package
> listed in `ignored` (or `ignorePackageNames`) stays excluded even if
> `includePrivates` is `true`.

## Complete Example

```ts
export default defineConfig({
  monorepo: {
    versionMode: 'selective',
    packages: ['packages/*', 'apps/*'],
    ignored: ['apps/docs'],
    includePrivates: false,
  },
})
```
