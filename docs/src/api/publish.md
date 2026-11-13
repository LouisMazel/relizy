---
title: publish()
description: Publish the packages to npm or another registry from Node.js with publish(), with registry checks, build command, dist-tag and dependency order.
keywords: relizy publish api, npm publish api, programmatic publishing, PublishOptions, PublishResponse, dist-tag
category: API Reference
tags: [api, publish, npm, registry, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

```ts
function publish(options?: Partial<PublishOptions>): Promise<PublishResponse | undefined>
```

`publish()` runs [`relizy publish`](./../cli/publish.md): it checks the registry access and the `workspace:` dependencies, runs the build command when one is set, and publishes the public packages in dependency order. It returns `{ publishedPackages }`, or `undefined` when there is no package to publish. With `onProgress`, each package is followed live (`step:item`) and the `publish` step gives the status of each one (`published`, `skipped`, `failed`) as [data](./progress-events.md#step-data).

## Options

The flags of [`relizy publish`](./../cli/publish.md#options), camelCased, and the [shared options](./usage.md#shared-options). Each overrides its [publish config](./../config/publish.md) option:

| Option                       | Description                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bumpResult`                 | `BumpResultTruthy`, the result of [`bump()`](./bump.md): publishes the bumped packages                                                               |
| `registry`, `registries`     | The registry, and the [additional registries](./../config/publish.md#registries)                                                                     |
| `tag`                        | The dist-tag: `latest` for a stable version, `next` for a prerelease by default                                                                      |
| `access`, `otp`              | `'public'` or `'restricted'`, and the one-time password of the registry                                                                              |
| `onOtp`                      | `({ registry, packageName }) => Promise<string>`: gives the one-time password the registry asks for, instead of the prompt (asked once per registry) |
| `buildCmd`                   | Command run before publishing                                                                                                                        |
| `token`                      | Registry token, for npm, pnpm and bun                                                                                                                |
| `skipExistingVersions`       | Skips the versions already on the registry instead of failing                                                                                        |
| `checkWorkspaceDependencies` | Overrides [`publish.checkWorkspaceDependencies`](./../config/publish.md#checkworkspacedependencies)                                                  |
| `safetyCheck`                | `false` skips the registry access check                                                                                                              |
| `args`                       | Overrides [`publish.args`](./../config/publish.md#args)                                                                                              |
| `packageManager`             | Overrides [`publish.packageManager`](./../config/publish.md#packagemanager)                                                                          |
| `safetyCheckTimeout`         | Overrides [`publish.safetyCheckTimeout`](./../config/publish.md#safetychecktimeout)                                                                  |
| `force`, `suffix`            | Without `bumpResult`, as for [`bump()`](./bump.md)                                                                                                   |

See [PublishOptions](./../typedoc/interfaces/PublishOptions.md).

## Examples

```ts
import { bump, publish } from 'relizy'

const bumpResult = await bump({ yes: true })

if (bumpResult.bumped) {
  const response = await publish({ bumpResult, tag: 'next', buildCmd: 'pnpm build' })

  console.log(response?.publishedPackages.map(pkg => pkg.name))
}
```

## See Also

- [`relizy publish`](./../cli/publish.md)
- [Publish config](./../config/publish.md)
