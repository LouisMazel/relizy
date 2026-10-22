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
3. otherwise, a range of commits (`--from` / `--to`), and the title of the pull or merge request in CI when [`commitlint.title`](./config.md#title) or `--title` enables it.

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

- in a GitHub Actions pull request: the merge-base with the target branch (`GITHUB_BASE_REF`);
- in a GitLab CI merge request: the base of the merge request (`CI_MERGE_REQUEST_DIFF_BASE_SHA`);
- otherwise: the last tag, or the whole history without tag.

In a shallow clone, the history, the tags and the target branch are fetched from `origin` when the start of the range is missing.

```bash
relizy commitlint --from origin/main
```

### --to &lt;ref&gt;

Last commit of the range. Default: `HEAD`.

### --title, --no-title

In the CI of a pull or merge request, also lint its title (`--title`) or not (`--no-title`): `CI_MERGE_REQUEST_TITLE` on GitLab (without the `Draft:` marker), the title of the pull request event on GitHub Actions. Default: [`commitlint.title`](./config.md#title), `false` unless set.

Enable it when your pull or merge requests are squash merged: the title becomes the commit message on the target branch.

When a range has errors, the output ends with how to fix them: the `git rebase -i` command to reword the commits, and how to update the title.

### --quiet

Only print the commits with problems, and the summary. Useful on large pull requests.

### --format &lt;format&gt;

- `text` (default): for people, colored in a terminal and in GitHub Actions or GitLab CI, plain otherwise (`NO_COLOR` and `FORCE_COLOR` are honored). In GitHub Actions, the problems are also reported as annotations.
- `json`: for programs and AI agents. Each entry has its effect on the release, its problems with how to fix them and the documentation of the rule, and a suggested header when the mistakes can be fixed safely.

```bash
relizy commitlint --format json --message "fix(nuxtt): Typo."
```

```json
{
  "valid": false,
  "errorCount": 4,
  "warningCount": 0,
  "entries": [
    {
      "kind": "message",
      "header": "fix(nuxtt): Typo.",
      "ignored": false,
      "valid": false,
      "type": "fix",
      "scope": "nuxtt",
      "bump": "patch",
      "changelogSection": "🩹 Fixes",
      "problems": [
        {
          "rule": "scope-enum",
          "severity": "error",
          "message": "The scope \"nuxtt\" is not allowed",
          "fix": "did you mean \"nuxt\"? use a workspace package or one of: nuxt, @maz-ui/nuxt, core",
          "url": "https://relizy.dev/commitlint/rules#scope-enum"
        }
      ],
      "suggestion": {
        "header": "fix(nuxt): typo",
        "remainingRules": ["subject-meaningful"]
      }
    }
  ],
  "howToFix": []
}
```

An error that prevents the lint (e.g. a missing ref) is printed as `{ "valid": false, "error": "..." }`.

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

// Like the CLI: prints the report and returns it with the counts
const { errorCount, report } = await commitlint({ from: 'origin/main', quiet: true })

// A single message, without output
const config = await loadRelizyConfig()
const result = await lintCommitMessage('feat(core): add the parser', { config })

console.log(errorCount, report?.entries.length, result.valid, result.commit.bump, result.problems, result.suggestion)
```
