---
title: Publish Configuration
description: Configure NPM publishing.
keywords: publish config, npm config, registry config, package access, npm publishing, package manager
category: Configuration
tags: [config, publish, npm, registry]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## packageManager

Set the package manager to use for publishing:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: {
    packageManager: 'pnpm', // 'npm' | 'yarn' | 'pnpm' | 'bun'
  },
})
```

## registry

Use custom npm registry:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: {
    registry: 'https://registry.npmjs.org',
  },
})
```

## tag

Set npm dist-tag:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: {
    tag: 'latest', // or 'beta', 'next', etc.
  },
})
```

## access

Set package access level:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: {
    access: 'public', // or 'restricted'
  },
})
```

## otp

Provide OTP (One-Time Password) for npm publishing with 2FA enabled:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: {
    otp: '123456',
  },
})
```

## packages

Glob pattern matching for packages to publish (useful for monorepos):

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: {
    packages: ['packages/*'],
  },
})
```

## buildCmd

Command to build your packages before publishing:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: {
    buildCmd: 'pnpm build',
  },
})
```

## token

NPM token for authentication. Only supported for pnpm and npm:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: {
    token: process.env.NPM_TOKEN,
  },
})
```

::: tip
You can also configure the token in the `tokens.registry` field or via environment variables: `NPM_TOKEN`, `RELIZY_NPM_TOKEN`, or `NODE_AUTH_TOKEN`.
:::

## safetyCheck

Enable or disable the safety check before publishing. When enabled, Relizy will verify that the required tokens are set.

- **Type:** `boolean`
- **Default:** `true`

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: {
    safetyCheck: true,
  },
})
```

## Complete Example

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: {
    packageManager: 'pnpm',
    registry: 'https://registry.npmjs.org',
    tag: 'latest',
    access: 'public',
    packages: ['packages/*'],
    buildCmd: 'pnpm build',
    token: process.env.NPM_TOKEN,
    safetyCheck: true,
  },
})
```
