---
title: Commit linting
description: Lint commit messages with your Relizy config, in a commit-msg hook (husky, simple-git-hooks, lefthook) and in CI (GitHub Actions, GitLab CI). Same parser, types and scopes as your releases, commit bodies checked as they will appear in your changelogs.
metaDescription: 'Lint commit messages with your Relizy config in a commit-msg hook (husky, lefthook) and in CI, with the same types and scopes as your releases.'
keywords: relizy commitlint, commit linter, commit message lint, conventional commits, commitlint alternative, commit-msg hook, husky, simple-git-hooks, lefthook, github actions, gitlab ci, squash merge, monorepo scopes
category: Commitlint
tags: [commitlint, conventional-commits, git-hooks, husky, ci-cd, github-actions, gitlab-ci, changelog]
---

# Commit linting

`relizy commitlint` checks commit messages **with your Relizy config**: the parser, the types and the packages of your releases. A commit that passes is the commit Relizy will bump, list and render in your changelogs.

## Why not commitlint?

- **One source of truth**: the types come from [`types`](./../config/changelog.md#types), the scopes from your workspace packages and `scopeMap`. No second config to keep in sync.
- **The release parser**: commitlint uses `conventional-commits-parser`, Relizy its own. A message accepted by commitlint can be ignored or classified differently by your release.
- **Bodies checked**: Relizy copies commit bodies into your changelogs and release notes. Each body is rendered as in the changelog, and its code blocks are checked with your ESLint or a built-in parser.
- **No extra dependency**: it ships with Relizy (`pnpm add -D relizy`), no `@commitlint/*` package needed.

## What it checks

| Area             | Checks                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| Header           | `type(scope)!: subject` format, known type, header length, subject period and meaning (and case, opt-in)         |
| Scopes           | Workspace packages, `scopeMap` keys and your list, required scope (opt-in), scope matching the changed files     |
| Body             | Blank line after the header, no markdown heading, valid markdown, changelog entry that keeps the changelog valid |
| Breaking changes | Only `!` or a `BREAKING CHANGE:` footer can trigger a major bump                                                 |
| AI attribution   | No AI co-author, session trailer or "Generated with" line                                                        |

Every rule can be tuned or disabled, and you can write your own: see [Rules](./rules.md) and [Custom Rules](./custom-rules.md). No config is required to start; see [Configuration](./config.md) to tune it.

## Lint the commit being created

```bash
npx relizy commitlint --install
```

It writes a `commit-msg` hook running `relizy commitlint --edit "$1"`: in `.husky/` when [husky](https://typicode.github.io/husky) is set up, otherwise in the hooks directory of git (`core.hooksPath` or `.git/hooks`). An existing hook is never replaced unless you add `--force`. [`relizy init`](./../cli/init.md) offers to install it too.

To write it by hand:

::: code-group

```bash [husky]
# .husky/commit-msg
npx --no -- relizy commitlint --edit "$1"
```

```json [simple-git-hooks]
{
  "simple-git-hooks": {
    "commit-msg": "npx --no -- relizy commitlint --edit \"$1\""
  }
}
```

```yaml [lefthook]
# lefthook.yml
commit-msg:
  commands:
    relizy-commitlint:
      run: npx --no -- relizy commitlint --edit {1}
```

:::

With simple-git-hooks, run `npx simple-git-hooks` to apply the config to git.

## Lint the commits of a pull request

A commit can skip the hook (`--no-verify`, the web interface of GitHub or GitLab). Lint the commits in CI too: without `--from`, Relizy lints the commits of the pull or merge request (see [default range](./cli.md#default-range)) and fetches the missing history of a shallow clone.

::: code-group

```yaml [GitHub Actions]
# .github/workflows/commitlint.yml
name: Commit messages

on:
  pull_request:
    # `edited`: lint again when the title changes, with commitlint.title
    types: [opened, synchronize, reopened, edited]

jobs:
  commitlint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22
      - run: npm ci
      - run: npx relizy commitlint
```

```yaml [GitLab CI]
# .gitlab-ci.yml
commitlint:
  image: node:22
  rules:
    - if: $CI_PIPELINE_SOURCE == 'merge_request_event'
  script:
    - npm ci
    - npx relizy commitlint
```

:::

If your pull or merge requests are **squash merged**, their title becomes the commit Relizy reads for the bump and the changelog: lint it too with [`commitlint.title: true`](./config.md#title) or `--title`. In GitHub Actions, each problem is also reported as an annotation on the pull request.

## Read the output

A valid commit prints one line with its effect on the next release:

```text
✔ feat(nuxt) → minor bump, 🚀 Enhancements
```

An invalid commit prints each problem with its rule and how to fix it, a suggested header when the mistakes can be fixed safely, the documentation of the failing rules and how to commit again. The hook stops the commit:

```text
✖ fix(nuxtt): Typo.

  ✖ scope-enum          The scope "nuxtt" is not allowed
                        → did you mean "nuxt"? use a workspace package or one of: core,
                          @maz-ui/core, nuxt, @maz-ui/nuxt
  ✖ subject-full-stop   The subject ends with a period
                        → remove the final period
  ✖ subject-meaningful  The subject "Typo." does not describe the change
                        → describe what changed, in at least 2 words or 15 characters

  Suggested header: fix(nuxt): Typo
                    still to fix: subject-meaningful

────────────────────────────────────────────────────────────────────────
✖ The commit message is invalid: 3 errors, 0 warnings
  Rules: scope-enum          https://relizy.dev/commitlint/rules#scope-enum
         subject-full-stop   https://relizy.dev/commitlint/rules#subject-full-stop
         subject-meaningful  https://relizy.dev/commitlint/rules#subject-meaningful
  Fix:   edit the message and commit again, it is kept in .git/COMMIT_EDITMSG:
           $ git commit --edit --file .git/COMMIT_EDITMSG
```

Warnings are printed but never fail. `--preview` adds the changelog entry of each commit, `--format json` prints the report for programs: see [CLI](./cli.md). AI agents can lint a message before committing with the `lint_commit` tool of the [MCP server](./../guide/ai-agents.md).

## Next steps

- [Rules](./rules.md): what is checked and how to tune it.
- [Custom Rules](./custom-rules.md): your own rules as functions.
- [Configuration](./config.md): the `commitlint` key of `relizy.config.ts`.
- [Migrating from commitlint](./migration.md): replace your commitlint config.
