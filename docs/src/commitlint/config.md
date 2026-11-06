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
    title: true,
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

- **Type:** `boolean`
- **Default:** `false`

In the CI of a pull or merge request, also lint its title. Enable it when your pull or merge requests are **squash merged**: the title becomes the message of the commit that lands on the target branch, the one Relizy reads for the bump and the changelog. With merge commits or rebases, the commits count and the title can stay free. `--title` and `--no-title` override it for a run.

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
