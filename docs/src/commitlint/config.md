---
title: Commit linting configuration
description: Configure relizy commitlint in relizy.config.ts with the commitlint key, scopes, rules, custom rules, ignores and help URL.
keywords: relizy commitlint config, commitlint key, scopes, rules, custom rules, ignores, help url
category: Commitlint
tags: [commitlint, configuration]
---

# Configuration

The linter is configured with the `commitlint` key of your `relizy.config.ts`. Everything else comes from your Relizy config: the types from [`types`](/config/overview), the packages from [`monorepo.packages`](/config/monorepo), the release commits from [`templates.commitMessage`](/config/commit-templates).

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
    customRules: {},
    ignores: [/^Initial commit$/],
    helpUrl: 'https://example.com/our-commit-guidelines',
  },
})
```

With [multiple configs](/config/multiple-configs), select one with `relizy commitlint --config <name>`.

## `packages`

- **Type:** `string[]`
- **Default:** `[]`

Glob patterns of directories to treat as workspace packages, in addition to [`monorepo.packages`](/config/monorepo), e.g. apps or playgrounds that Relizy never releases. Their packages become valid scopes, and count for [`scope-required`](./rules.md#scope-required) and [`scope-matches-files`](./rules.md#scope-matches-files).

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: {
    versionMode: 'selective',
    packages: ['packages/*'],
  },
  commitlint: {
    packages: ['apps/*'],
  },
})
```

A workspace package only needs a `package.json` with a `name`. The packages excluded with `monorepo.ignored` stay workspace packages for the linter: they are usually released by [another config](/config/multiple-configs).

## `scopes`

- **Type:** `string[]`
- **Default:** `[]`

Scopes allowed in addition to the workspace packages and the `scopeMap` keys, e.g. `ci`, `deps` or `release`. In standalone mode, any scope is allowed unless this list is set. See [`scope-enum`](./rules.md#scope-enum).

## `rules`

- **Type:** `Record<string, CommitlintRuleConfig>`
- **Default:** `{}`

Level and value of the [built-in rules](./rules.md) and of the [custom rules](./custom-rules.md):

```ts
type CommitlintRuleLevel = 'error' | 'warn' | 'off' | 0 | 1 | 2

type CommitlintRuleConfig
  = | CommitlintRuleLevel
    | [CommitlintRuleLevel]
    | [CommitlintRuleLevel, unknown]
    | [CommitlintRuleLevel, 'always' | 'never', unknown]
```

An unknown rule name is reported with a warning.

## `customRules`

- **Type:** `Record<string, CommitlintCustomRule>`
- **Default:** `{}`

Rules written as functions. See [Custom Rules](./custom-rules.md).

## `ignores`

- **Type:** `Array<RegExp | ((message: string) => boolean)>`
- **Default:** `[]`

Commits to ignore, in addition to the default ones: a regular expression tested against the header, or a function receiving the full message.

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

Ignore the merge commits, the `fixup!`, `squash!` and `amend!` commits, and the release commits of Relizy.

## `helpUrl`

- **Type:** `string`
- **Default:** `undefined`

A URL printed with the errors, e.g. the commit guidelines of your team.

```text
✖ 1 problem (1 error, 0 warnings)
ⓘ Get help: https://example.com/our-commit-guidelines
```
