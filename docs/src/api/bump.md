---
title: bump()
description: Compute and write the new versions from Node.js, and get the bumped packages.
keywords: relizy bump api, programmatic bump, BumpResult, BumpOptions, version groups, canary version, semver api
category: API Reference
tags: [api, bump, versioning, semver, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

```ts
function bump(options?: Partial<BumpOptions>): Promise<BumpResult>
```

`bump()` runs [`relizy bump`](./../cli/bump.md): it checks the working directory, computes the new versions, asks to confirm them (unless `yes`), and writes them to the `package.json` files.

## Options

The flags of [`relizy bump`](./../cli/bump.md#options), camelCased, and the [shared options](./usage.md#shared-options):

| Option            | Description                                                                                                                                                                                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`            | `BumpReleaseType`: `'release'` (default) computes the bump from the commits, or `'major'`, `'minor'`, `'patch'`, `'prerelease'`, `'premajor'`, `'preminor'`, `'prepatch'`                                                                                                                                                        |
| `preid`           | Prerelease identifier: `'beta'`, `'rc'`...                                                                                                                                                                                                                                                                                       |
| `suffix`          | With a prerelease type, replaces the last number of the version                                                                                                                                                                                                                                                                  |
| `canary`          | Writes a canary version, `{nextVersion}-0.canary-{sha}` (`preid` replaces `canary`)                                                                                                                                                                                                                                              |
| `force`           | Bumps the packages even without a commit triggering a bump                                                                                                                                                                                                                                                                       |
| `yes`             | Confirms the new versions without asking (default `false`). Without an interactive terminal, `bump()` throws unless `true` or `onConfirm`                                                                                                                                                                                        |
| `onConfirm`       | `(plan: ConfirmPlan) => boolean \| Promise<boolean>`: validates the versions instead of the prompt, once computed and before anything is written. `false` cancels as a refused prompt (a `RelizyCancelError`), an error it throws fails the run. Not called with `yes` nor `bump.yes`. See [below](#confirm-from-an-application) |
| `clean`           | `false` bumps with uncommitted changes                                                                                                                                                                                                                                                                                           |
| `dependencyTypes` | Overrides [`bump.dependencyTypes`](./../config/bump.md#dependencytypes)                                                                                                                                                                                                                                                          |
| `privatePackages` | Overrides [`monorepo.privatePackages`](./../config/monorepo.md#privatepackages)                                                                                                                                                                                                                                                  |
| `capZeroMajor`    | Overrides [`bump.capZeroMajor`](./../config/bump.md#capzeromajor)                                                                                                                                                                                                                                                                |
| `outOfRangePeers` | Overrides [`bump.outOfRangePeers`](./../config/bump.md#outofrangepeers)                                                                                                                                                                                                                                                          |

See [BumpOptions](./../typedoc/interfaces/BumpOptions.md) for the types.

## Result

`BumpResult` is `{ bumped: false }` when no commit triggers a bump. Otherwise, `bumped` is `true` and the result has:

- `bumpedPackages`: the bumped packages, with their `oldVersion` and `newVersion`;
- `oldVersion`, `newVersion`, `fromTag`, `rootPackage`: the root version before and after, and the previous release tag (`unified` and `selective` modes);
- `groups`: with [version groups](./../guide/version-groups.md), the result of each group that bumped (`GroupBumpResult`: `name`, `title`, `versionMode`, and the fields above). The other fields then aggregate them: `bumpedPackages` lists the packages of every group, `newVersion` is the one of the `unified`/`selective` group.

See [BumpResultTruthy](./../typedoc/interfaces/BumpResultTruthy.md) and [GroupBumpResult](./../typedoc/interfaces/GroupBumpResult.md).

## Examples

```ts
import { bump } from 'relizy'

const result = await bump({ yes: true })

if (result.bumped) {
  for (const pkg of result.bumpedPackages) {
    console.log(`${pkg.name}: ${pkg.oldVersion} -> ${pkg.newVersion}`)
  }
}
```

Preview the versions without writing them:

```ts
const preview = await bump({ type: 'minor', dryRun: true, yes: true })
```

The result is the `bumpResult` option of [`changelog()`](./changelog.md), [`publish()`](./publish.md), [`providerRelease()`](./provider-release.md) and [`social()`](./social.md).

## Confirm from an Application

An application asking in its own interface validates the versions with `onConfirm`, at the moment of the prompt: the versions are computed, nothing is written yet.

```ts
import { bump, isRelizyCancelError } from 'relizy'

try {
  await bump({
    onConfirm: plan => askInTheApp(plan.packages.map(pkg => `${pkg.name} ${pkg.oldVersion} -> ${pkg.newVersion}`)),
  })
}
catch (error) {
  if (!isRelizyCancelError(error)) {
    throw error
  }
  // Refused: nothing was written
}
```

`ConfirmPlan` holds `command` (`bump`, or `release` for the bump of a release), `dryRun`, `profile`, `canary`, and `packages`: `{ name, path, private, oldVersion, newVersion, tag?, group?, reason? }` for every package of every version group, with the git tag the release creates (none for `relizy bump`, which creates no tag, nor without the release commit or `release.gitTag`).

- With `yes`, or `bump.yes: true` in the config or the profile, the versions are confirmed in advance: `onConfirm` is not called.
- `false` cancels the run as a refused prompt: a `RelizyCancelError`, `cancelled: true` in the events, nothing written.
- An error thrown by `onConfirm` (or a rejected promise) fails the run with this error as is: a failure, not a cancellation (`cancelled: false`), nothing written. To cancel from the application, throw a `RelizyCancelError`.

## See Also

- [`relizy bump`](./../cli/bump.md)
- [Bump config](./../config/bump.md)
- [Prereleases](./../guide/prereleases.md)
