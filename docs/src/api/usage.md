---
title: Programmatic API
description: Run the relizy commands from Node.js - the exported functions, their shared options, their results and their errors.
keywords: relizy api, programmatic api, node.js api, release api, bump api, typescript, RelizyCancelError
category: API Reference
tags: [api, programmatic, node.js, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Exports

`relizy` exports one function per command, the config helpers, the commit linter, the errors, and the types of the config, the options and the results.

```ts
import {
  bump,
  changelog,
  commitlint,
  defineConfig,
  isRelizyCancelError,
  lintCommitMessage,
  loadRelizyConfig,
  prComment,
  providerRelease,
  publish,
  release,
  RelizyCancelError,
  social,
} from 'relizy'
```

| Export                                                     | Returns                                 | CLI                                                       |
| ---------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------- |
| [`release()`](./release.md)                                | `Promise<ReleaseReport>`                | [`relizy release`](./../cli/release.md)                   |
| [`bump()`](./bump.md)                                      | `Promise<BumpResult>`                   | [`relizy bump`](./../cli/bump.md)                         |
| [`changelog()`](./changelog.md)                            | `Promise<void>`                         | [`relizy changelog`](./../cli/changelog.md)               |
| [`publish()`](./publish.md)                                | `Promise<PublishResponse \| undefined>` | [`relizy publish`](./../cli/publish.md)                   |
| [`providerRelease()`](./provider-release.md)               | `Promise<ProviderReleaseResult>`        | [`relizy provider-release`](./../cli/provider-release.md) |
| [`social()`](./social.md)                                  | `Promise<SocialResult>`                 | [`relizy social`](./../cli/social.md)                     |
| [`prComment()`](./pr-comment.md)                           | `Promise<boolean>`                      | [`relizy pr-comment`](./../cli/pr-comment.md)             |
| [`commitlint()`](./commitlint.md)                          | `Promise<CommitlintRunResult>`          | [`relizy commitlint`](./../commitlint/cli.md)             |
| [`lintCommitMessage()`](./commitlint.md#lintcommitmessage) | `Promise<CommitlintResult>`             | -                                                         |
| [`loadRelizyConfig()`](./load-relizy-config.md)            | `Promise<ResolvedRelizyConfig>`         | -                                                         |
| `defineConfig()`                                           | Its argument, typed as `RelizyConfig`   | [Configuration](./../config/overview.md)                  |
| `RelizyCancelError`, `isRelizyCancelError()`               | See [Errors](#errors)                   | -                                                         |

The [typedoc](./../typedoc/index.md) lists every export and type.

## Shared Options

The commands take the options of their CLI command, camelCased (`--format-cmd` is `formatCmd`, `--no-push` is `push: false`), and these ones:

| Option       | Description                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `configName` | Config to load, as `--config`: `relizy.standalone` for `relizy.standalone.config.ts`                                       |
| `config`     | A config resolved by [`loadRelizyConfig()`](./load-relizy-config.md), see below. Not an option of `release()`              |
| `dryRun`     | Write nothing, as `--dry-run`                                                                                              |
| `logLevel`   | As `--log-level`                                                                                                           |
| `groups`     | Only these [version groups](./../guide/version-groups.md), as `--group` (an array of names), for the commands of `--group` |

`prComment()` and `commitlint()` use the given `config` as it is. `bump()`, `changelog()`, `publish()`, `providerRelease()` and `social()` still load the config file (`configName`, `relizy` by default) and put the given `config` over it, the options of the call on top: pass the same `configName` as the one of the config, or an option it leaves unset (a hook, `repo`, `bump.preid`) comes from `relizy.config.ts`.

The functions print the logs of the logger, not the output of the CLI, unless `RELIZY_REPORTER` is set (see [Output](./../cli/commands.md#output)).

`release()` and `bump()` ask to confirm the new versions: pass `yes: true` in a script. Without an interactive terminal, they throw instead of asking.

## Examples

```ts
import { release } from 'relizy'

const report = await release({ type: 'minor', yes: true, social: false })

if (report.released) {
  console.log(`Released ${report.version}: ${report.tags.join(', ')}`)
}
```

The steps one by one, the result of the bump given to the next ones:

```ts
import { bump, changelog, publish } from 'relizy'

const bumpResult = await bump({ yes: true })

if (bumpResult.bumped) {
  await changelog({ bumpResult })
  await publish({ bumpResult, tag: 'next' })
}
```

`bump()` returns `{ bumped: false }` when no commit triggers a bump: test `bumped` before reading `newVersion` or `bumpedPackages`.

## Errors

The functions throw when they fail. A refused or cancelled prompt (bump confirmation, uncommitted changes, rewritten tag) throws a `RelizyCancelError`: nothing was written, the `error:*` hooks did not run and `release()` did not post a failed PR comment.

```ts
import { isRelizyCancelError, release } from 'relizy'

try {
  await release({ yes: true })
}
catch (error) {
  if (!isRelizyCancelError(error)) {
    throw error
  }
}
```

`providerRelease()` and `social()` do not throw when the provider or a platform fails: the error is in their result (`error`, `hasErrors`). `providerRelease()` still throws on an error of the config.

## TypeScript

The types of the options and the results are exported (`ReleaseOptions`, `BumpOptions`, `BumpResult`, `ReleaseReport`, `RelizyConfig`...):

```ts
import type { ReleaseOptions } from 'relizy'

const options: ReleaseOptions = {
  type: 'patch',
  yes: true,
  publish: false,
}
```

## See Also

- [CLI commands](./../cli/commands.md)
- [Configuration](./../config/overview.md)
- [Hooks](./../config/hooks.md)
