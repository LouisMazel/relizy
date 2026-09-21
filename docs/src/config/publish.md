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

NPM token for authentication. Supported for `npm`, `pnpm` and `bun`:

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

::: info How the token is applied
Relizy writes the token (and, for scoped packages, the matching `@scope:registry`) to the project `.npmrc` only for the duration of each `whoami`/`publish`, then restores your `.npmrc` exactly as it was - creating no file if none existed. It never passes the token as a CLI flag, because the pnpm 10+ argument parser rejects rc-option flags like `--//host:_authToken=`. This makes authentication work identically across npm, pnpm (every version) and bun.

Any auth or registry you already set in your own `.npmrc` keeps working untouched: if you do not configure `publish.token`/`publish.registry`, relizy leaves your `.npmrc` alone. Yarn is not covered (it uses `.yarnrc.yml`) - configure its auth yourself.
:::

## registries

Publish to additional registries, on top of the one configured via `registry` (e.g. `https://registry.npmjs.org`). Each entry can be scoped to specific packages with a glob pattern matched against the package name; entries without a `packageFilter` are mirrored to every publishable package. You can also omit `registry` and list every target here - see [Listing every registry explicitly](#listing-every-registry-explicitly-no-default).

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
  packageFilter?: string[] // glob patterns - omitted = applies to every package
  exclusive?: boolean // skip the default `registry` for matching packages
}
```

::: tip Why `packageFilter` and not `packages`
`publish.packages` (top-level) controls _which packages get published at all_. `RegistryTarget.packageFilter` is a different concern: it only routes already-publishable packages to this specific registry. Distinct names avoid confusing the two.
:::

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
        packageFilter: ['@internal/*'],
      },
    ],
  },
})
```

Here, only packages whose name matches `@internal/*` are additionally published to the JFrog registry; every package still goes to the default `registry`.

### Excluding the default registry for specific packages

By default, entries in `registries` are purely additive: a matching package is published to that registry **on top of** the default `registry`. Set `exclusive: true` on an entry when matching packages should be published **only** to it (and any other matching registry), and never to the default one:

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
        packageFilter: ['@internal/*'],
        exclusive: true,
      },
    ],
  },
})
```

Here, `@internal/*` packages are published **only** to the JFrog registry; every other package still goes to `https://registry.npmjs.org` as usual. `exclusive` only suppresses the default registry - it has no effect on other, non-exclusive `registries` entries that also match the package (they still apply).

### Listing every registry explicitly (no default)

You can omit `registry` entirely and declare every target in `registries`. When no default `registry` is set but `registries` has entries, Relizy does **not** inject an implicit default target - packages are published only to their applicable `registries`. This makes "N registries, none of them the default" expressible directly, without having to mark one entry `exclusive` just to suppress the default.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: {
    // no `registry` - both targets are equal peers
    registries: [
      {
        name: 'nexus',
        registry: 'https://nexus.mycompany.com/repository/npm-internal/',
        token: process.env.NEXUS_TOKEN,
      },
      {
        name: 'jfrog',
        registry: 'https://mycompany.jfrog.io/artifactory/api/npm/npm-internal/',
        token: process.env.JFROG_TOKEN,
      },
    ],
  },
})
```

::: tip `.npmrc` fallback is preserved
Omitting `registry` when `registries` is **also** empty keeps the original single-registry behavior: Relizy resolves the effective registry from your environment (`.npmrc`). The implicit default is only dropped when explicit `registries` entries exist. Likewise, if a package is not covered by any `registries` entry (all of them are scoped via `packageFilter` and none match), that package still falls back to the `.npmrc`-resolved registry.
:::

::: tip Authentication safety check
When `publish.safetyCheck` is enabled, Relizy authenticates against every distinct registry actually needed by the packages being published this release (including the default registry, even if some of those packages exclude it via `exclusive`), so a misconfigured registry fails fast rather than mid-release. A `registries` entry scoped to packages that are not part of this release (via `packageFilter`) is **not** checked, so it cannot block an unrelated release.
:::

::: tip Failure behavior is fail-fast, not atomic
If a package fails to publish to one of its resolved registries, Relizy stops immediately: no further registry or package is attempted. This bounds how much of a broken release can happen, but publishing to a single package's multiple registries is **not transactional** - if a package already succeeded on registry A and then fails on registry B, A's publish is not rolled back.
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

## skipExistingVersions

Skip a package (per registry) instead of failing when its version already exists on the registry.

- **Type:** `boolean`
- **Default:** `false`

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: {
    skipExistingVersions: true,
  },
})
```

By default, if a package version is already published, the registry rejects the upload (npm returns `EPUBLISHCONFLICT`, Nexus returns `Repository does not allow updating assets`, etc.) and Relizy fails the release.

When `skipExistingVersions` is enabled, Relizy checks each package **before** publishing by querying the registry. If the version is already there, the package is skipped with a warning; only versions still missing from the registry are published.

This makes re-running a release **idempotent**: retrying a job whose version is already published succeeds and only publishes what is still missing, instead of crashing.

::: info How the check works
The proactive check relies on the standard registry metadata endpoint that every npm-compatible registry (npm, Nexus, JFrog, Verdaccio, GitHub/GitLab Packages) implements to serve `install` - so it does not depend on the wording of any error message.

The query works for **every package manager**: with npm/pnpm it uses the `view` command (inheriting your full `.npmrc` environment - proxy, CA, scoped auth), and for yarn/bun (which have no usable `view`) it falls back to a direct HTTPS request to the same metadata endpoint, authenticated with your configured registry token. The direct request is also used for npm/pnpm if `view` is inconclusive.

If the check cannot get a definitive answer (auth, network, or an unreachable registry), Relizy does **not** skip on a guess: it attempts the publish, and a "version already exists" error is still caught there as a safety net (which also covers the rare race where a version is published between the check and the upload). The check only runs when `skipExistingVersions` is enabled, so it adds no round-trip otherwise, and never runs in `--dry-run`.
:::

::: tip Canary reruns
This is especially useful for [canary releases](/guide/canary-releases): the canary version is derived from the commit hash, so re-running the pipeline on the **same commit** regenerates the exact same version. Without `skipExistingVersions`, that rerun fails on the first already-published package; with it, the rerun passes cleanly.
:::

::: info Clear error even when disabled
When `skipExistingVersions` is **disabled** (the default), an already-published version still fails the release - but Relizy replaces the raw registry error with a clear, actionable message pointing you to this option, instead of surfacing the cryptic underlying error.
:::

You can also enable it per-run from the CLI with `--skip-existing-versions` on the [`publish`](/cli/publish) and [`release`](/cli/release) commands.

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
    skipExistingVersions: false,
  },
})
```
