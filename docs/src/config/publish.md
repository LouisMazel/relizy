---
title: Publish Configuration
description: Reference of the publish options - package manager, registry, dist-tag, access, OTP, token, build command, several registries, safety check, idempotent reruns and the check of the workspace dependencies.
metaDescription: 'Reference of the publish options: package manager, registry, dist-tag, access, OTP, token, build command, several registries and safety check.'
keywords: publish config, npm publish, registry, dist-tag, access, otp, npm token, buildCmd, registries, packageFilter, exclusive, skipExistingVersions, checkWorkspaceDependencies, safetyCheckTimeout
category: Configuration
tags: [config, publish, npm, registry]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: {
    access: 'public',
    buildCmd: 'pnpm build',
  },
})
```

The released packages are published in dependency order (see [`bump.dependencyTypes`](./bump.md#dependencytypes)), the private ones never (see [`monorepo.privatePackages`](./monorepo.md#privatepackages)). In `relizy release`, a failed publish restores the files the release wrote.

## packageManager

- **Type:** `'npm' | 'pnpm' | 'yarn' | 'bun'`
- **Default:** detected from the `packageManager` field of the root `package.json`, then the lockfile (`pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `bun.lockb`), then the package manager running relizy, else `npm`

Package manager of the publish command (`yarn npm publish` with Yarn Berry).

## registry

- **Type:** `string`
- **Default:** the registry of your npm config (`npm config get registry`, which reads `.npmrc`), else `https://registry.npmjs.org/`
- **CLI:** `--registry <url>`

Registry to publish to. Set it only to force a registry whatever the `.npmrc`. With [`registries`](#registries) and without `registry`, the packages are only published to the declared registries: the registry of your npm config is used only for a package that no entry covers.

## tag

- **Type:** `string`
- **Default:** `latest` for a stable version, `next` for a prerelease, `canary` with `--canary`
- **CLI:** `--tag <tag>`

npm dist-tag of the published versions. Relizy warns when a prerelease is published with `latest`.

## access

- **Type:** `'public' | 'restricted'`
- **Default:** none (the default of the registry: `restricted` for a new scoped package on npm)
- **CLI:** `--access <type>`

## otp

- **Type:** `string`
- **Default:** none
- **CLI:** `--otp <code>`

One-time password of a registry with 2FA. Without it, relizy asks for one when the registry requires it, and reuses it for the next packages of the same registry.

## Authentication

The registry token is [`tokens.registry`](./overview.md#tokens) (`RELIZY_NPM_TOKEN`, `NPM_TOKEN` or `NODE_AUTH_TOKEN` by default, `--publish-token <token>` from the CLI), or the `token` of each of the [`registries`](#registries). It works for npm, pnpm and bun: Yarn reads its auth from `.yarnrc.yml`, configure it yourself.

Relizy writes the token, with the `@scope:registry` of scoped packages, to the `.npmrc` of the project only during each `whoami` and `publish`, then restores the file as it was. Without token, your `.npmrc` is left untouched.

## buildCmd

- **Type:** `string`
- **Default:** none
- **CLI:** `--build-cmd <cmd>`

Command run once from the root before publishing (`pnpm build`), after the versions are written. Not run in dry-run.

## args

- **Type:** `string[]`
- **Default:** `[]`

Extra arguments of the publish command, added after the ones of relizy, for every package and every registry. Each item is one argument.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  publish: {
    args: ['--provenance'],
  },
})
```

## registries

- **Type:** `RegistryTarget[]`
- **Default:** none

Registries to publish to on top of `registry`. An entry without `packageFilter` applies to every package (a mirror), an entry with it only to the packages whose name matches. Without `registry`, only these registries are used, and a package that no entry covers is published to the registry of your npm config.

| Field           | Type                        | Effect                                                                             |
| --------------- | --------------------------- | ---------------------------------------------------------------------------------- |
| `registry`      | `string` (required)         | Registry URL                                                                       |
| `name`          | `string`                    | Label in the logs                                                                  |
| `token`         | `string`                    | Token of this registry, wins over `tokens.registry` (npm, pnpm, bun)               |
| `tag`           | `string`                    | Dist-tag on this registry, wins over `publish.tag`                                 |
| `access`        | `'public' \| 'restricted'`  | Access on this registry                                                            |
| `otp`           | `string`                    | OTP of this registry                                                               |
| `packageFilter` | `string[]`                  | Glob patterns of package names routed to this registry (all packages when omitted) |
| `exclusive`     | `boolean` (default `false`) | The matching packages are not published to the default `registry`                  |

```ts
export default defineConfig({
  publish: {
    registries: [
      // every package is also published to Nexus
      { name: 'nexus', registry: 'https://nexus.mycompany.com/repository/npm-internal/', token: process.env.NEXUS_TOKEN },
      // @internal/* goes to JFrog only
      { name: 'jfrog', registry: 'https://mycompany.jfrog.io/artifactory/api/npm/npm-internal/', token: process.env.JFROG_TOKEN, packageFilter: ['@internal/*'], exclusive: true },
    ],
  },
})
```

`exclusive` only removes the default registry: the other matching entries still apply. The publish stops at the first failure and is not transactional: a package already published to one registry is not unpublished when the next one fails.

## safetyCheck

- **Type:** `boolean`
- **Default:** `true`

Before publishing, authenticate (`whoami`, npm and pnpm) against each registry the released packages need. A registry scoped by `packageFilter` to packages outside of the release is not checked. Skipped with the global [`safetyCheck`](./overview.md#safetycheck) (`--no-safety-check`), and by `relizy release` when it does not publish (`release.publish: false`, `--no-publish`).

## safetyCheckTimeout

- **Type:** `number`
- **Default:** `15000`

Time, in milliseconds, after which the authentication check is aborted, so a registry or a proxy that never answers does not hang the release.

## skipExistingVersions

- **Type:** `boolean`
- **Default:** `false`
- **CLI:** `--skip-existing-versions`

Skip a package, per registry, when its version is already published, instead of failing: a rerun of a release (a [canary](./../guide/prereleases.md#canary-releases) on the same commit, a partial publish) only publishes what is missing. Relizy queries the registry metadata before each publish (`view` with npm and pnpm, an HTTPS request otherwise) and, when the answer is inconclusive, publishes and still catches the "version already exists" error. Never queried in dry-run. Disabled, an existing version fails the release with an explicit message.

## checkWorkspaceDependencies

- **Type:** `boolean`
- **Default:** `true`

Before publishing, check the internal dependencies declared with `workspace:*`, `workspace:^` or `workspace:~` in `dependencies`, `peerDependencies` and `optionalDependencies`: the version the package manager writes in their place must be published by the release or already be on the registry. The release fails, before publishing anything, when the registry confirms the version is missing (a private package, a package left out of the release), and warns when the registry cannot be queried. Explicit ranges (`workspace:^1.2.0`) are not checked.

The packages whose published peer dependency ranges reject a new version are handled by [`bump.outOfRangePeers`](./bump.md#outofrangepeers).
