---
title: commitlint
description: Reference of the relizy commitlint command, to lint commit messages in a commit-msg hook or a range of commits in CI.
keywords: relizy commitlint cli, commitlint command, commit-msg, --edit, --from, --preview, --install
category: Commitlint
tags: [commitlint, cli, reference]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Usage

```bash
relizy commitlint [options]
```

The command lints, in this order of precedence:

1. the commit being created with `--edit`, in a `commit-msg` hook;
2. the message given with `--message`;
3. otherwise, a range of commits (`--from` / `--to`).

It exits with `1` when a commit has an error, `0` otherwise. Warnings never fail.

## Options

### --edit [file]

Lint the message of the commit being created: the file given to the `commit-msg` hook, `.git/COMMIT_EDITMSG` by default. The comment lines added by git are ignored, and the staged files are used for the scope rules.

```bash
relizy commitlint --edit "$1"
```

### --message &lt;message&gt;

Lint a message.

```bash
relizy commitlint --message "feat(core): add the parser"
```

### --from &lt;ref&gt;

Lint the commits after this ref. Without it:

- in a GitHub Actions pull request: the merge-base with the target branch (`GITHUB_BASE_REF`). Fetch the history of the base branch, e.g. with `fetch-depth: 0` on `actions/checkout`;
- in a GitLab CI merge request: the base of the merge request (`CI_MERGE_REQUEST_DIFF_BASE_SHA`);
- otherwise: the last tag, or the whole history without tag.

```bash
relizy commitlint --from origin/main
```

### --to &lt;ref&gt;

Last commit of the range. Default: `HEAD`.

### --preview

Print the changelog entry of each commit, as Relizy will write it.

```bash
$ relizy commitlint --message "feat(nuxt): add the module options" --preview
✔ feat(nuxt) → minor bump, 🚀 Enhancements

    ### 🚀 Enhancements

    - **nuxt:** Add the module options
```

### --install

Write the `commit-msg` hook running `relizy commitlint --edit "$1"`, in `.husky/` when husky is set up, otherwise in the hooks directory of git. Nothing is linted.

### --force

With `--install`, replace an existing `commit-msg` hook.

### Global options

`--config <name>` selects a [config file](/config/multiple-configs), and `--log-level debug` shows how the range is resolved. The banner of Relizy is not printed by this command.

## Programmatic usage

```ts
import { commitlint, lintCommitMessage, loadRelizyConfig } from 'relizy'

// Like the CLI: prints the results and returns the counts
const { errorCount } = await commitlint({ from: 'origin/main' })

// A single message, without output
const config = await loadRelizyConfig()
const result = await lintCommitMessage('feat(core): add the parser', { config })

console.log(errorCount, result.valid, result.commit.bump, result.problems)
```
