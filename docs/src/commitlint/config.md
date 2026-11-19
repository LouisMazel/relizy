---
title: Commit linting configuration
description: Configure relizy commitlint with the commitlint key of relizy.config.ts - packages, scopes, rule levels and values, custom rules, ignores, defaultIgnores, pull request title, changelogLinter and helpUrl.
metaDescription: 'Configure relizy commitlint in relizy.config.ts: scopes, rule levels and values, custom rules, ignores and the pull request title.'
keywords: relizy commitlint config, commitlint key, packages, scopes, rules, rule levels, customRules, ignores, defaultIgnores, title, changelogLinter, helpUrl
category: Commitlint
tags: [commitlint, configuration, reference]
---

# Configuration

The linter is configured with the `commitlint` key of `relizy.config.ts`. The rest comes from your Relizy config: the types from [`types`](./../config/changelog.md#types), the packages from [`monorepo.packages`](./../config/monorepo.md), the scopes from [`scopeMap`](./../config/overview.md#scopemap), the release commits from [`templates.commitMessage`](./../config/commit-templates.md). No key is required.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  commitlint: {
    packages: ['apps/*'],
    scopes: ['ci', 'deps', 'release'],
    rules: {
      'header-max-length': ['error', 200],
      'scope-required': ['error', 'when-bumping'],
    },
    ignores: [/^Initial commit$/],
    title: 'error',
    helpUrl: 'https://example.com/our-commit-guidelines',
  },
})
```

With [several config files](./../config/overview.md#multiple-configs), select one with `relizy commitlint --config <name>`.

## `packages`

- **Type:** `string[]`
- **Default:** `[]`

Glob patterns of directories to treat as workspace packages, in addition to `monorepo.packages` and to the workspace of your tools (`workspaces` of the `package.json`, `pnpm-workspace.yaml`, `lerna.json`, `rush.json`, `deno.json`). Use it for directories none of them declares, e.g. apps that Relizy never releases. A directory only needs a `package.json` with a `name`. Its package becomes a valid scope and counts for [`scope-required`](./rules.md#scope-required) and [`scope-matches-files`](./rules.md#scope-matches-files).

The packages excluded with `monorepo.ignored` and the private ones stay workspace packages for the linter.

## `scopes`

- **Type:** `string[]`
- **Default:** `[]`

Scopes allowed in addition to the workspace packages and the `scopeMap` keys, e.g. `ci`, `deps` or `release`. See [`scope-enum`](./rules.md#scope-enum).

Without workspace package (a single package) and without `scopes`, any scope is allowed and `scopeMap` is not checked. Set `scopes` to restrict them.

## `rules`

- **Type:** [`CommitlintRulesConfig`](./../typedoc/type-aliases/CommitlintRulesConfig.md)
- **Default:** `{}`

Level and value of the [built-in rules](./rules.md) and of the [custom rules](./custom-rules.md). The built-in rules are typed: your editor completes their names and checks their values. An unknown rule name is reported with a warning and ignored.

### Levels and values

A rule takes a level, or a level and a value:

| Form             | Example                               |
| ---------------- | ------------------------------------- |
| Level            | `'error'`, `'warn'`, `'off'`          |
| Numeric level    | `2` (error), `1` (warn), `0` (off)    |
| Level and value  | `['error', 200]`                      |
| commitlint tuple | `[2, 'always', 200]`, `[2, 'always']` |

The commitlint tuples ease a [migration](./migration.md). `'never'` is not supported in a commitlint tuple: the value is used as is, with a warning. `['error', 'never']` is the ESLint form, with `'never'` as value (e.g. for `scope-required`). A rule set without value (`'error'`, `2`) keeps its default value. In a commitlint tuple, the second item is the value of rules such as `scope-required` (`[2, 'always']`): a rule taking a number (`header-max-length`) needs it, `[2, 'always', 200]`, else linting a message fails with an error. See [`CommitlintRuleConfig`](./../typedoc/type-aliases/CommitlintRuleConfig.md).

## `customRules`

- **Type:** `Record<string, CommitlintCustomRule>`
- **Default:** `{}`

Rules written as functions, keyed by name. Their level is set in `rules` and defaults to `error`. See [Custom Rules](./custom-rules.md).

## `ignores`

- **Type:** `Array<RegExp | ((message: string) => boolean)>`
- **Default:** `[]`

Commits not to lint, in addition to the default ones: a regular expression tested against the header, or a function receiving the full message.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  commitlint: {
    ignores: [/^Initial commit$/, message => message.includes('[skip lint]')],
  },
})
```

## `defaultIgnores`

- **Type:** `boolean`
- **Default:** `true`

Ignore the merge commits (`Merge ...`), the `fixup!`, `squash!` and `amend!` commits, and the release commits of Relizy, matched from `templates.commitMessage`.

## `title`

- **Type:** `'auto' | 'error' | 'warn' | 'off' | boolean`
- **Default:** `'auto'`

How to lint the title of a pull or merge request, in its CI. A **squash merge** turns the title into the commit that lands on the target branch, the one Relizy reads for the bump and the changelog, and drops the commits of the pull request. A merge commit or a rebase keeps the commits, and the title stays free.

| Value     | Title                                 | Commits                              |
| --------- | ------------------------------------- | ------------------------------------ |
| `'auto'`  | From the merge method, see below      | Errors, warnings with a squash merge |
| `'error'` | Linted, its problems fail the check   | Errors                               |
| `'warn'`  | Linted, its problems are only printed | Errors                               |
| `'off'`   | Not linted                            | Errors                               |

`true` is `'error'` and `false` is `'off'`. With `'auto'`, Relizy reads the merge method as the [merge preview](./../guide/merge-preview.md) does: [`mergePreview.squash`](./../config/merge-preview.md#squash) when it is set, otherwise the provider, with the token of the job (`GITHUB_TOKEN`, `GITLAB_TOKEN`):

| What Relizy knows of the merge                                                                  | Title      | Commits  |
| ----------------------------------------------------------------------------------------------- | ---------- | -------- |
| Squash merge: the repository only allows it, an auto-merge squashes, the merge request squashes | Errors     | Warnings |
| No squash merge: the repository does not allow it, the merge request does not squash            | Not linted | Errors   |
| Unknown: several merge methods allowed, chosen at the merge, or no token                        | Warnings   | Errors   |

What lands on the target branch fails the check, what may land is only reported: nobody is blocked by a title that will not be a commit, nor by commits a squash drops. On GitHub, the squash of a pull request with a single commit takes the message of this commit (the default `COMMIT_OR_PR_TITLE` setting), not the title: the title is not linted. The report tells why errors are printed as warnings:

```text
⚠ 2 commits checked, all valid, with 1 warning
  Note:  merge method unknown (the repository allows several merge methods): the pull request
         title becomes the commit of a squash merge, its problems are warnings
```

Set `'error'` when your pull requests are always squash merged and the job has no token, `'off'` when they never are. `--title [mode]` and `--no-title` override it for a run.

On GitHub Actions, add `edited` to the `pull_request` types so that a new title is linted: see [Lint the commits of a pull request](./index.md#lint-the-commits-of-a-pull-request).

## `changelogLinter`

- **Type:** `'auto' | 'eslint' | 'oxc'`
- **Default:** `'auto'`

Tool checking the changelog entry of a commit, as it will be written in your `CHANGELOG.md` files, for [`body-changelog-lint`](./rules.md#body-changelog-lint). In relizy 1, this option was `codeBlocksLinter` (see [the migration](./../guide/migration-v2.md#changelog-linter-of-commitlint)).

- `auto`: the ESLint of your project when it lints the `CHANGELOG.md` files, otherwise `oxc`;
- `eslint`: the ESLint of your project, on the whole entry (markdown and code blocks) with your config. The lint fails instead of falling back to `oxc` when ESLint is not usable;
- `oxc`: a syntax check of the `js`, `ts`, `jsx`, `tsx` and `json` code blocks, faster than ESLint. The markdown itself is checked by [`body-markdown`](./rules.md#body-markdown) in every mode.

For `eslint` (and for `auto` to pick ESLint), the project needs:

- `eslint` installed, resolvable from the root of the project;
- an ESLint config that lints `CHANGELOG.md`: a markdown plugin such as [`@eslint/markdown`](https://github.com/eslint/markdown), and the file not ignored.

The entry is linted with fixes applied: only the errors that remain are reported, the warnings are not.

## `helpUrl`

- **Type:** `string`
- **Default:** `undefined`

A URL printed in the summary when there are errors, e.g. the commit guidelines of your team. It comes after the documentation of the rules:

```text
✖ The commit message is invalid: 1 error, 0 warnings
  Rules: header-format  https://relizy.dev/commitlint/rules#header-format
  Help:  https://example.com/our-commit-guidelines
```

It is also the `helpUrl` field of the [JSON output](./cli.md#json-output).
