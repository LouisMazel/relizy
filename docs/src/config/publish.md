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

Use a custom npm registry:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: {
    registry: 'https://registry.npmjs.org',
  },
})
```

::: tip Registry resolution
When `registry` is **not** set, Relizy resolves the effective registry from your environment (`npm config get registry`), which respects the `registry=` value in your `.npmrc` and falls back to `https://registry.npmjs.org/`.

This means a custom registry (for example a corporate proxy) configured in your `.npmrc` is honored automatically. Set `publish.registry` explicitly only when you want to force a specific registry regardless of your `.npmrc`.
:::

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

## registries

Publish to additional registries, on top of the one configured via `registry` (e.g. `https://registry.npmjs.org`). Each entry can be scoped to specific packages with a glob pattern matched against the package name; entries without a `packages` filter are mirrored to every publishable package.

This is fully opt-in and additive: leaving `registries` unset keeps the exact single-registry behavior described above.

- **Type:** `RegistryTarget[]`

```ts
interface RegistryTarget {
  name?: string // label used in logs, e.g. 'nexus'
  registry: string // registry URL
  token?: string
  tag?: string
  access?: 'public' | 'restricted'
  otp?: string
  packages?: string[] // glob patterns - omitted = applies to every package
}
```

### Mirroring to every package

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: {
    registry: 'https://registry.npmjs.org',
    registries: [
      {
        name: 'nexus',
        registry: 'https://nexus.mycompany.com/repository/npm-internal/',
        token: process.env.NEXUS_TOKEN,
      },
    ],
  },
})
```

Every package is published to `https://registry.npmjs.org` **and** to the internal Nexus registry.

### Routing specific packages to a registry

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: {
    registry: 'https://registry.npmjs.org',
    registries: [
      {
        name: 'jfrog-internal',
        registry: 'https://mycompany.jfrog.io/artifactory/api/npm/npm-internal/',
        token: process.env.JFROG_TOKEN,
        packages: ['@internal/*'],
      },
    ],
  },
})
```

Here, only packages whose name matches `@internal/*` are additionally published to the JFrog registry; every package still goes to the default `registry`.

::: tip Authentication safety check
When `publish.safetyCheck` is enabled, Relizy authenticates against every distinct registry declared in `registry` and `registries` before publishing starts (not just the ones matching a given package), so a misconfigured registry fails fast rather than mid-release.
:::

::: tip Failure behavior
Publishing is fail-fast: if a package fails to publish to any of its resolved registries, the whole release stops immediately - it does not continue publishing the remaining registries or packages.
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

## safetyCheckTimeout

Maximum time, in milliseconds, allowed for the registry authentication safety check (`npm`/`pnpm whoami`) before it is aborted. This prevents the release from hanging indefinitely when the registry, or a proxy in front of it, never answers.

- **Type:** `number`
- **Default:** `15000`

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: {
    safetyCheckTimeout: 15000,
  },
})
```

::: tip
If your registry is behind a slow proxy and you hit timeouts, increase this value. To skip the authentication check entirely, run the command with `--no-safety-check`.
:::

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
    registries: [
      {
        name: 'nexus',
        registry: 'https://nexus.mycompany.com/repository/npm-internal/',
        token: process.env.NEXUS_TOKEN,
      },
    ],
    safetyCheck: true,
    safetyCheckTimeout: 15000,
  },
})
```
