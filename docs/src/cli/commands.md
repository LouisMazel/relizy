---
title: CLI commands
description: The commands of the relizy CLI, their global options, their output and their exit codes.
keywords: relizy cli, cli commands, global options, log level, dry run, exit codes, relizy reporter, command line
category: CLI Reference
tags: [cli, commands, options, reference]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Commands

| Command                                     | Description                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [`init`](./init.md)                         | Create the config of the project: detect the packages, ask the rest, set up commitlint        |
| [`release`](./release.md)                   | Run the whole release: bump, changelog, publish, commit, tag, push, provider release and more |
| [`bump`](./bump.md)                         | Compute and write the new versions                                                            |
| [`changelog`](./changelog.md)               | Write the `CHANGELOG.md` files                                                                |
| [`publish`](./publish.md)                   | Publish the packages to the registry                                                          |
| [`provider-release`](./provider-release.md) | Create the GitHub or GitLab releases                                                          |
| [`social`](./social.md)                     | Post the release on X (Twitter) and Slack                                                     |
| [`pr-comment`](./pr-comment.md)             | Post the release on its pull request or merge request                                         |
| [`merge-preview`](./merge-preview.md)       | In a pull request, preview what its merge releases, and fail when its release would fail      |
| [`commitlint`](./../commitlint/cli.md)      | Lint commit messages with the relizy config                                                   |
| [`mcp`](./mcp.md)                           | Start the MCP server for the AI coding agents, and set them up (`relizy mcp init`)            |

`relizy --help` lists them, `relizy <command> --help` lists the options of a command, `relizy --version` prints the version.

## Global Options

These options go before or after the command name.

| Flag                   | Description                                                                                                                                                                                                                                                                                                   | Config                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `--config <name>`      | Load `<name>.config.<ext>` instead of `relizy.config.<ext>` (e.g. `relizy.standalone`), or the config file at this path (absolute, or relative to the project, with its extension). Fails when the file does not exist                                                                                        | [Multiple configs](./../config/overview.md#multiple-configs) |
| `--profile <name>`     | Apply the [profile](./../config/profiles.md) `<name>` of the config: its options come over the config file and under the flags. Fails with the list of the profiles when it does not exist. Used by `release`, `bump`, `changelog`, `publish`, `provider-release`, `social`, `pr-comment` and `merge-preview` | [`profiles`](./../config/profiles.md)                        |
| `--log-level <level>`  | `silent`, `error`, `warning`, `normal`, `default`, `debug`, `trace` or `verbose`, instead of the `logLevel` of the config (`default` by default). `verbose`, `debug` and `trace` show the details of each step                                                                                                | [`logLevel`](./../config/overview.md#loglevel)               |
| `--dry-run`            | Preview the run: no file written but the [report](./../config/release.md#report), no commit, tag, push, publication nor post. Shows what would be generated (changelogs, release notes, posts, PR comment). The AI is not called, its rewrites are simulated                                                  | -                                                            |
| `--no-preview`         | With `--dry-run`, do not show what would be generated (still shown with `--log-level verbose`)                                                                                                                                                                                                                | -                                                            |
| `--ai-preview`         | With `--dry-run`, call the AI to preview its rewrites of the release notes and the posts. Each call costs, as in a real release                                                                                                                                                                               | [AI](./../config/ai.md)                                      |
| `--group <names>`      | Only process these [version groups](./../guide/version-groups.md), comma-separated names. Used by `release`, `bump`, `changelog`, `publish`, `provider-release` and `social`                                                                                                                                  | [`monorepo.groups`](./../config/monorepo.md#groups)          |
| `--pr-number <number>` | Number of the pull request or merge request to comment, instead of the detected one. Used by `release`, `pr-comment` and `merge-preview`                                                                                                                                                                      | [PR comment](./../config/pr-comment.md)                      |
| `--no-safety-check`    | Skip the checks run before writing anything (tokens, registry access, branch up to date, push access). The branch is still checked right before publishing, the release tags before the commit, and the push access by the push. Used by `release`, `publish`, `provider-release` and `social`                | [`safetyCheck`](./../config/overview.md#safetycheck)         |

With `--group`, only the targeted groups are bumped, published and tagged, in a single release commit. Without it, every group is processed:

```bash
relizy release --group header
relizy bump --group main,header --dry-run
```

`--yes` is not a global option: only [`release`](./release.md), [`bump`](./bump.md) and [`init`](./init.md) have it.

## Output

Each command shows one line per step, with its duration, and ends with what it did (`relizy release` with a summary of the release). The details of the steps are only shown with `--log-level verbose`, and always written to `node_modules/.cache/relizy/release.log` (not with `RELIZY_REPORTER=classic`, which prints them).

- **In a terminal**: an interactive output, with a spinner telling what the running step does (the AI rewrites included).
- **In CI**, or when the output is not a terminal: lines only, the logs of each step in a collapsible group of GitHub Actions or GitLab CI, the warnings and errors as annotations on GitHub. Colored, unless `NO_COLOR` is set.

`RELIZY_REPORTER` forces the output: `pretty` (terminal), `ci`, `classic` (the plain logs of the logger) or `json` (one JSON event per line on stdout, for a program following the run: see [Progress events](./../api/progress-events.md)). The [programmatic API](./../api/usage.md) uses `classic` unless `RELIZY_REPORTER` is set.

```bash
RELIZY_REPORTER=ci relizy release --dry-run --yes
```

## Exit Codes

| Code | When                                                                                                                                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | Success, or nothing to release (`release` and `bump` without a commit triggering a bump)                                                                                |
| `0`  | A prompt refused or cancelled (bump confirmation, uncommitted changes, rewritten tag): nothing was written, the `error:*` hooks do not run                              |
| `1`  | An error, an unknown option or an invalid value, commit messages with errors (`commitlint`), a failed provider release (`provider-release`) or a failed post (`social`) |

`release` and `bump` ask to confirm the new versions. Without an interactive terminal (CI), they fail right away with code `1` unless `--yes` is given:

```bash
relizy release --yes
```

To run something only when a release happens, read its [report](./../config/release.md#report) rather than the exit code, see [CI/CD](./../guide/ci-cd.md#run-something-only-when-a-release-happens).

## Examples

```bash
# Preview the next release, then run it
relizy release --dry-run
relizy release

# Force the bump type, without the confirmation (CI)
relizy release --minor --yes

# Canary version of a pull request, commented on it
relizy release --canary --yes --pr-number 42

# Another config file: relizy.standalone.config.ts
relizy release --config relizy.standalone

# Every detail of the run
relizy release --dry-run --log-level verbose
```

`relizy release` runs the steps in order (see [Steps](./release.md#steps)). To run them one by one:

```bash
relizy bump --yes
relizy changelog
relizy publish
# Commit, tag and push yourself, then
relizy provider-release
relizy social
relizy pr-comment
```

## See Also

- [release](./release.md), [bump](./bump.md), [changelog](./changelog.md), [publish](./publish.md), [provider-release](./provider-release.md)
- [social](./social.md), [pr-comment](./pr-comment.md), [merge-preview](./merge-preview.md), [init](./init.md), [mcp](./mcp.md), [commitlint](./../commitlint/cli.md)
- [CI/CD](./../guide/ci-cd.md)
- [Programmatic API](./../api/usage.md)
