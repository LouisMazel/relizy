---
title: commitlint()
description: Lint commit messages from Node.js with the relizy config - a range of commits, a message file, or a single message.
keywords: relizy commitlint api, lintCommitMessage, programmatic commitlint, CommitlintResult, CommitlintRunResult, commit message linting
category: API Reference
tags: [api, commitlint, commits, typescript]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

```ts
function commitlint(options?: CommitlintOptions): Promise<CommitlintRunResult>
```

`commitlint()` runs [`relizy commitlint`](./../commitlint/cli.md): it lints the commits of a range, the message of the commit being created (`edit`) or a given `message`, **prints the report** to the standard output, and returns it. It does not exit: `errorCount` tells whether the messages pass. With `install`, it writes the `commit-msg` hook instead of linting.

## Options

The flags of [`relizy commitlint`](./../commitlint/cli.md), camelCased:

| Option                             | Description                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `message`                          | Lint this message                                                                                                  |
| `edit`                             | Lint the message of the commit being created: a file path, or `true` for `.git/COMMIT_EDITMSG`                     |
| `from`, `to`                       | The range to lint. Default: from the merge-base of the pull/merge request in CI, else from the last tag, to `HEAD` |
| `title`                            | In the CI of a pull/merge request, also lint its title. Default: [`commitlint.title`](./../commitlint/config.md)   |
| `preview`                          | Add the changelog entry of each commit to the report                                                               |
| `format`                           | `'text'` (default) or `'json'`                                                                                     |
| `quiet`                            | In the text format, only print the commits with problems, and the summary                                          |
| `install`                          | Write the `commit-msg` hook, `force` to replace an existing one                                                    |
| `configName`, `config`, `logLevel` | See the [shared options](./usage.md#shared-options)                                                                |

It returns `results` (one `CommitlintResult` per linted message), `errorCount`, `warningCount`, the `report` (unset with `install`) and the installed `hook` (with `install`). See [CommitlintOptions](./../typedoc/interfaces/CommitlintOptions.md) and [CommitlintRunResult](./../typedoc/interfaces/CommitlintRunResult.md).

```ts
import { commitlint } from 'relizy'

const { errorCount } = await commitlint({ from: 'origin/main', quiet: true })

if (errorCount > 0) {
  process.exitCode = 1
}
```

## lintCommitMessage()

```ts
function lintCommitMessage(message: string, options: LintCommitMessageOptions): Promise<CommitlintResult>
```

Lints a single message with the [rules](./../commitlint/rules.md) of the config, without output. `options.config` is required (from [`loadRelizyConfig()`](./load-relizy-config.md)); `files` (the changed files, relative to the root) decides the packages of the commit and its allowed scopes, `suggest: false` skips the suggested header.

The result has:

- `valid`: no error (warnings allowed), and `ignored` for a commit that is not linted (merge, fixup, release...);
- `problems`: each with its `rule`, `severity` (`'error'` or `'warn'`), `message`, and its `fix` when known;
- `suggestion`: a fixed `header`, when some errors can be fixed safely;
- `commit`: the parsed message (`type`, `scope`, `subject`, `isBreaking`, the `bump` it triggers, the `packages` it touches);
- `changelogTitle`: the changelog section of the commit, unset when it does not appear in the changelog.

See [LintCommitMessageOptions](./../typedoc/interfaces/LintCommitMessageOptions.md) and [CommitlintResult](./../typedoc/interfaces/CommitlintResult.md).

```ts
import { lintCommitMessage, loadRelizyConfig } from 'relizy'

const config = await loadRelizyConfig()
const result = await lintCommitMessage('feat(core): add the parser', {
  config,
  files: ['packages/core/src/parser.ts'],
})

if (!result.valid) {
  console.log(result.problems.map(problem => problem.message), result.suggestion?.header)
}
```

## See Also

- [Commitlint](./../commitlint/index.md)
- [`relizy commitlint`](./../commitlint/cli.md)
- [Custom rules](./../commitlint/custom-rules.md)
