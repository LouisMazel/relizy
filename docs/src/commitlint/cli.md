---
title: commitlint
description: Reference of the relizy commitlint command and its flags, to lint the commit being created in a commit-msg hook, a message, or a range of commits and the pull request title in CI.
metaDescription: 'The relizy commitlint command and its flags: lint a commit in a commit-msg hook, a message, or a range of commits and the PR title in CI.'
keywords: relizy commitlint cli, commitlint command, commit-msg, --edit, --message, --from, --to, --title, --preview, --format json, --quiet, --install, exit code
category: Commitlint
tags: [commitlint, cli, reference]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

```bash
relizy commitlint [options]
```

## What is linted

The command lints, in this order of precedence:

1. the message given with `--message`;
2. the commit being created with `--edit`, in a `commit-msg` hook;
3. otherwise, a range of commits (`--from` / `--to`), and the title of the pull or merge request in CI when [`commitlint.title`](./config.md#title) or `--title` enables it.

With `--install`, nothing is linted: the command writes the hook. To set it up, see [Commit linting](./index.md#lint-the-commit-being-created).

The changed files, used by the [scope rules](./rules.md#scope-matches-files), are the staged files with `--message` and `--edit`, and the files of each commit in a range. The title of a pull request gets the files of all its commits.

## Options

| Flag                  | Description                                                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--message <message>` | Lint this message                                                                                                                                                                                    |
| `--edit [file]`       | Lint the message of the commit being created: the file given to the `commit-msg` hook, `.git/COMMIT_EDITMSG` by default. The comment lines of git and the diff of `git commit --verbose` are ignored |
| `--from <ref>`        | Lint the commits after this ref. Default: see [default range](#default-range)                                                                                                                        |
| `--to <ref>`          | Last commit of the range. Default: `HEAD`                                                                                                                                                            |
| `--title`             | In the CI of a pull or merge request, also lint its title. Default: [`commitlint.title`](./config.md#title)                                                                                          |
| `--no-title`          | Do not lint the title, whatever `commitlint.title`                                                                                                                                                   |
| `--preview`           | Print the changelog entry of each commit, as Relizy will write it                                                                                                                                    |
| `--quiet`             | Only print the commits with problems, and the summary (text format)                                                                                                                                  |
| `--format <format>`   | `text` (default) for people, `json` for programs and AI agents. See [JSON output](#json-output)                                                                                                      |
| `--install`           | Write the `commit-msg` hook running `relizy commitlint --edit "$1"`: in `.husky/` when husky is set up, otherwise in the hooks directory of git                                                      |
| `--force`             | With `--install`, replace an existing `commit-msg` hook                                                                                                                                              |

Global options: `--config <name>` loads `<name>.config.<ext>` (`--config relizy.standalone` for `relizy.standalone.config.ts`), `--log-level debug` shows how the range is resolved.

## Default range

Without `--from`, the range starts:

- in a GitHub Actions pull request: at the merge-base of `HEAD` and `origin/<GITHUB_BASE_REF>`, the base branch being fetched when missing;
- in a GitLab CI merge request: at `CI_MERGE_REQUEST_DIFF_BASE_SHA`;
- otherwise: at the last tag, or at the first commit without tag.

In CI, a shallow clone is fetched in full (`git fetch --unshallow --tags`). Outside CI, a shallow clone only prints a warning. A start ref that cannot be found is an error.

The title is read from `CI_MERGE_REQUEST_TITLE` on GitLab (without the `Draft:`, `[Draft]` and `(Draft)` markers) and from the event of the pull request on GitHub Actions.

## Output

The text output is colored in a terminal and in GitHub Actions or GitLab CI, and plain otherwise (`NO_COLOR` and `FORCE_COLOR` are honored). In GitHub Actions, each problem is also printed as an annotation. See [Read the output](./index.md#read-the-output) for an example.

When a range has errors, the summary ends with how to fix them: the `git rebase -i` command to reword the commits, and how to update the title.

```bash
$ relizy commitlint --message "feat(nuxt): add the module options" --preview
✔ feat(nuxt) → minor bump, 🚀 Enhancements

    ### 🚀 Enhancements

    - **nuxt:** Add the module options
```

### JSON output

`--format json` prints one JSON object: `valid`, `errorCount`, `warningCount`, `helpUrl` (when set), `entries` and `howToFix` (the fix lines of the text summary). Each entry has its `kind` (`message`, `commit` or `title`), `hash` (commits), `header`, `ignored`, `valid`, `type`, `scope`, `bump`, `changelogSection`, its `problems` (`rule`, `severity`, `message`, `fix`, `url` of the built-in rules), a `suggestion` (`header`, `remainingRules`) when the header can be fixed safely, and `changelogEntry` with `--preview`.

```bash
relizy commitlint --format json --message "fix(nuxtt): Typo."
```

An error that prevents the lint (e.g. a missing ref) prints `{ "valid": false, "error": "..." }`.

## Exit codes

- `0`: no error. Warnings never fail.
- `1`: a linted message has an error, or the command failed (missing ref, existing hook with `--install` and without `--force`...).

To lint from Node.js, see [`commitlint()` and `lintCommitMessage()`](./../api/commitlint.md).
