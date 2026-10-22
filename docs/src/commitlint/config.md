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
    title: true,
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

- **Type:** `CommitlintRulesConfig`
- **Default:** `{}`

Level and value of the [built-in rules](./rules.md) and of the [custom rules](./custom-rules.md). The built-in rules are typed: your editor completes their names, documents them, and checks their values.

```ts
type CommitlintRuleLevel = 'error' | 'warn' | 'off' | 0 | 1 | 2

type CommitlintRuleConfig<Value = unknown>
  = | CommitlintRuleLevel
    | readonly [CommitlintRuleLevel]
    | readonly [CommitlintRuleLevel, Value]
    | readonly [CommitlintRuleLevel, 'always' | 'never', Value]

type CommitlintRulesConfig = {
  [Name in keyof CommitlintBuiltInRules]?: CommitlintRuleConfig<CommitlintBuiltInRules[Name]>
} & Record<string, CommitlintRuleConfig>
```

`CommitlintBuiltInRules` gives the type of the value of each built-in rule, e.g. `number` for `header-max-length`. A rule without value only takes a level, or the commitlint tuple `[level, 'always']`.

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

## `title`

- **Type:** `boolean`
- **Default:** `false`

In the CI of a pull or merge request, also lint its title. Enable it when your pull or merge requests are **squash merged**: the title becomes the message of the commit that lands on the target branch, so it is the one Relizy reads for the bump and the changelog. With merge commits or rebases, the commits are what count, and the title can stay free.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  commitlint: {
    title: true,
  },
})
```

`--title` and `--no-title` override it for a run. See [Lint the commits of a pull request](./getting-started.md#lint-the-commits-of-a-pull-request).

## `helpUrl`

- **Type:** `string`
- **Default:** `undefined`

A URL printed with the errors, e.g. the commit guidelines of your team.

```text
✖ 1 problem (1 error, 0 warnings)
ⓘ Get help: https://example.com/our-commit-guidelines
```
