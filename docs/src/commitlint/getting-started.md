---
title: Getting started with commit linting
description: Lint your commit messages with Relizy in your commit-msg hook and in your CI, with husky, simple-git-hooks, lefthook, GitHub Actions or GitLab CI.
keywords: relizy commitlint, commit-msg hook, husky, simple-git-hooks, lefthook, github actions, gitlab ci, lint commits
category: Commitlint
tags: [commitlint, git-hooks, husky, ci-cd, github-actions, gitlab-ci]
---

# Getting started

`relizy commitlint` ships with Relizy: install Relizy and you are ready.

::: code-group

```bash [pnpm]
pnpm add -D relizy
```

```bash [npm]
npm install -D relizy
```

```bash [yarn]
yarn add -D relizy
```

```bash [bun]
bun add -D relizy
```

:::

No config is required: the linter reads your `relizy.config.ts`. See [Configuration](./config.md) to tune it.

## Lint the commit being created

The `commit-msg` hook lints every commit before it is created.

### With the install command

```bash
npx relizy commitlint --install
```

It writes the `commit-msg` hook:

- in `.husky/` when [husky](https://typicode.github.io/husky) is set up;
- otherwise in the hooks directory of git (`core.hooksPath` or `.git/hooks`).

An existing `commit-msg` hook is never replaced silently: add the command to it, or run `relizy commitlint --install --force`.

### By hand

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

`--edit` reads the message file given by git (`.git/COMMIT_EDITMSG` by default) and ignores the comment lines git adds in the editor. The staged files are used for the [scope rules](./rules.md#scope-matches-files).

## Read the output

A valid commit prints one line, with its effect on the next release:

```text
✔ feat(nuxt) → minor bump, 🚀 Enhancements
```

An invalid commit prints each problem with how to fix it, a corrected header when the mistakes can be fixed safely (case, spacing, typos in the type or the scope, final period), the documentation of the failing rules, and how to commit again. The hook stops the commit:

```text
✖ fix(nuxtt): Typo.

  ✖ scope-enum          The scope "nuxtt" is not allowed
                        → did you mean "nuxt"? use a workspace package or one of: nuxt,
                          @maz-ui/nuxt, core, @maz-ui/core
  ✖ subject-case        The subject starts with an uppercase letter
                        → start it lowercase, relizy capitalizes it in the changelog
  ✖ subject-full-stop   The subject ends with a period
                        → remove the final period
  ✖ subject-meaningful  The subject "Typo." does not describe the change
                        → describe what changed, in at least 2 words or 15 characters

  Suggested header: fix(nuxt): typo
                    still to fix: subject-meaningful

────────────────────────────────────────────────────────────────────────
✖ The commit message is invalid: 4 errors, 0 warnings
  Rules: scope-enum          https://relizy.dev/commitlint/rules#scope-enum
         subject-case        https://relizy.dev/commitlint/rules#subject-case
         subject-full-stop   https://relizy.dev/commitlint/rules#subject-full-stop
         subject-meaningful  https://relizy.dev/commitlint/rules#subject-meaningful
  Fix:   edit the message and commit again, it is kept in .git/COMMIT_EDITMSG:
           $ git commit --edit --file .git/COMMIT_EDITMSG
```

Warnings are printed but never stop the commit. Add `--preview` to also print the changelog entry of the commit.

The output is colored in a terminal and in GitHub Actions or GitLab CI, and plain text otherwise, e.g. when an AI agent runs the command. Set `NO_COLOR=1` or `FORCE_COLOR=1` to choose. For programs and AI agents, `--format json` prints the same report as JSON (see [CLI](./cli.md#format-lt-format-gt)).

## Lint the commits of a pull request

A commit can skip the hook: `--no-verify`, a commit made in the web interface of GitHub or GitLab, a squash merge... Lint the commits of your pull requests in CI as well:

```bash
npx relizy commitlint
```

Without `--from`, Relizy lints:

- in a GitHub Actions pull request, the commits after the merge-base with the target branch;
- in a GitLab CI merge request, the commits after the base of the merge request;
- otherwise, the commits after the last tag.

If your pull or merge requests are **squash merged**, lint their **title** too: it becomes the message of the commit that lands on the target branch, the one Relizy reads for the bump and the changelog. Enable it with [`commitlint.title`](./config.md#title) or `--title`. The draft markers of GitLab (`Draft:`, `[Draft]`) are removed.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  commitlint: {
    title: true,
  },
})
```

Merge commits, `fixup!`, `squash!` and `amend!` commits and the release commits of Relizy are ignored. See [CLI](./cli.md) for every option.

When a commit is invalid, the summary ends with how to fix it:

```text
────────────────────────────────────────────────────────────────────────
✖ 1 of 3 commits and the merge request title are invalid: 2 errors, 0 warnings
  Rules: subject-case   https://relizy.dev/commitlint/rules#subject-case
         header-format  https://relizy.dev/commitlint/rules#header-format
  Fix:   reword 1a2b3c4: mark it as "reword" in the rebase, then force-push:
           $ git rebase -i 9f8e7d6
           $ git push --force-with-lease
         edit the merge request title, then run a new pipeline (a retry keeps the old title)
```

Add `--quiet` to only print the commits with problems on large pull requests. In GitHub Actions, each problem is also reported as an annotation, visible in the summary of the job and on the pull request.

::: tip Shallow clones
The default checkout of the CI only has the last commits. Relizy fetches what it needs: the history and the target branch of the pull request. To skip this fetch, check out the full history: `fetch-depth: 0` on `actions/checkout`, `GIT_DEPTH: 0` on GitLab CI.
:::

::: code-group

```yaml [GitHub Actions]
# .github/workflows/commitlint.yml
name: Commit messages

on:
  pull_request:

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

## Next steps

- [Rules](./rules.md): what is checked and how to tune it.
- [Custom Rules](./custom-rules.md): write your own rules as functions.
- [Migrating from commitlint](./migration.md): replace your commitlint config.
