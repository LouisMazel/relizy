---
title: Bump Configuration
description: Configure version bumping behavior.
keywords: bump config, version bump settings, semver config, prerelease config, dependency bumping
category: Configuration
tags: [config, bump, versioning, semver]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## type

Set version type:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  bump: {
    type: 'minor', // 'major' | 'minor' | 'patch' | 'prerelease' | 'release' | 'prepatch' | 'preminor' | 'premajor'
  },
})
```

## preid

Set prerelease identifier:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  bump: {
    preid: 'beta', // For pre-releases like 1.0.0-beta.1
  },
})
```

## dependencyTypes

Set dependency types to consider for version bumping:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  bump: {
    dependencyTypes: ['dependencies', 'devDependencies', 'peerDependencies'],
  },
})
```

## clean

Check if there are any uncommitted changes before bumping. If the working directory is not clean, the bump will be aborted:

- **Type:** `boolean`
- **Default:** `true`

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  bump: {
    clean: true,
  },
})
```

## yes

Skip the confirmation prompt about bumping packages:

- **Type:** `boolean`
- **Default:** `false`

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  bump: {
    yes: true,
  },
})
```

## Canary Mode

When using `--canary`, the `preid` option is used as the canary prerelease identifier. If not set, it defaults to `canary`.

```bash
# Uses default preid "canary"
relizy release --canary
# → 1.3.0-canary.a3f4b2c.0

# Uses custom preid from config or CLI
relizy release --canary --preid snapshot
# → 1.3.0-snapshot.a3f4b2c.0
```

The `preid` value is also used as the npm dist-tag for canary releases. See the [Canary Releases guide](/guide/canary-releases) for full details.

## Complete Example

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  bump: {
    type: 'prerelease',
    preid: 'beta',
    dependencyTypes: ['dependencies', 'devDependencies', 'peerDependencies'],
    yes: true,
  },
})
```

Usage:

```bash
relizy bump
# Results in: 1.0.0 → 1.0.0-beta.0
```
