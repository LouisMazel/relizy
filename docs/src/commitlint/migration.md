---
title: Migrating from commitlint
description: Replace commitlint with relizy commitlint, the rules of @commitlint/config-conventional and their Relizy equivalent, and how to port function rules.
keywords: migrate from commitlint, commitlint alternative, config-conventional, commitlint-plugin-function-rules, relizy commitlint
category: Commitlint
tags: [commitlint, migration]
---

# Migrating from commitlint

## 1. Replace the hook

```bash
# .husky/commit-msg
npx --no -- relizy commitlint --edit "$1"
```

In CI, replace `commitlint --from <base> --to HEAD` with `relizy commitlint`: the range of the pull request is found automatically (see [Getting Started](./getting-started.md#lint-the-commits-of-a-pull-request)).

## 2. Move the config

Most of a commitlint config disappears: the types, the scopes and the bump logic come from your Relizy config. Move what remains to the `commitlint` key of `relizy.config.ts`, then remove the commitlint packages and config:

```bash
pnpm remove @commitlint/cli @commitlint/config-conventional @commitlint/types
rm commitlint.config.* .commitlintrc*
```

## Rules of `@commitlint/config-conventional`

| commitlint rule                                  | Relizy equivalent                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `type-enum`                                      | [`type-enum`](./rules.md#type-enum), from your Relizy `types`                                                       |
| `type-case`, `type-empty`                        | [`header-format`](./rules.md#header-format)                                                                         |
| `scope-case`                                     | [`header-format`](./rules.md#header-format) (no spaces) and [`scope-enum`](./rules.md#scope-enum)                   |
| `scope-enum`                                     | [`scope-enum`](./rules.md#scope-enum), from your packages, `scopeMap` and [`commitlint.scopes`](./config.md#scopes) |
| `scope-empty`                                    | [`scope-required`](./rules.md#scope-required)                                                                       |
| `subject-case`                                   | [`subject-case`](./rules.md#subject-case)                                                                           |
| `subject-empty`                                  | [`header-format`](./rules.md#header-format)                                                                         |
| `subject-full-stop`                              | [`subject-full-stop`](./rules.md#subject-full-stop)                                                                 |
| `header-max-length`                              | [`header-max-length`](./rules.md#header-max-length)                                                                 |
| `header-trim`                                    | [`header-format`](./rules.md#header-format)                                                                         |
| `body-leading-blank`                             | [`body-leading-blank`](./rules.md#body-leading-blank)                                                               |
| `body-max-line-length`, `footer-max-line-length` | No equivalent: the changelogs have no line length limit                                                             |
| `footer-leading-blank`                           | The footer is the last paragraph of the message                                                                     |
| Any other rule                                   | A [custom rule](./custom-rules.md)                                                                                  |

The rules use the ESLint format, `'error'` or `['error', value]`, but the commitlint tuples `[2, 'always', value]` are accepted to copy them as is. `'never'` is not supported.

Relizy also adds rules commitlint has no equivalent for: [`scope-matches-files`](./rules.md#scope-matches-files), [`subject-meaningful`](./rules.md#subject-meaningful), [`body-no-headings`](./rules.md#body-no-headings), [`body-markdown`](./rules.md#body-markdown), [`body-changelog-lint`](./rules.md#body-changelog-lint) and [`body-breaking-change`](./rules.md#body-breaking-change).

## Function rules

`commitlint-plugin-function-rules` rules become [custom rules](./custom-rules.md). The commit has the same field names, and the `[valid, message]` return value is accepted, so most rules can be copied as is. The `when` and `value` arguments become `context.value`.

Here is a real commitlint config of a monorepo: the types are copied from Relizy, the scope is required when a commit bumps a version (the bump logic and the changed files are recomputed by hand), and the subject must detail the ticket:

```ts
// .commitlintrc.ts (before)
import type { UserConfig } from '@commitlint/types'
import * as functionRules from 'commitlint-plugin-function-rules'
import { getDefaultConfig, mergeTypes } from 'relizy'
import relizyConfig from './relizy.config'

const types = Object.keys(mergeTypes(relizyConfig.types, getDefaultConfig().types))

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [functionRules],
  rules: {
    'type-enum': [2, 'always', types],
    'header-max-length': [2, 'always', 200],
    'body-max-line-length': [0],
    'scope-enum': [2, 'always', [...packageDirectories(), 'ci', 'deps', 'release']],
    'function-rules/scope-empty': [2, 'always', scopeRequiredWhenBumping],
    'function-rules/subject-min-length': [2, 'always', ticketWithDetails],
  },
} satisfies UserConfig
```

With Relizy, the types, the package scopes, the bump and the changed files are built in, and the CI script linting the title and the commits of the merge request becomes `relizy commitlint`:

```ts
// relizy.config.ts (after)
import { defineConfig } from 'relizy'

export default defineConfig({
  commitlint: {
    // The apps are not released by Relizy, but they are scopes
    packages: ['apps/*'],
    scopes: ['ci', 'deps', 'release'],
    rules: {
      'header-max-length': ['error', 200],
      'scope-required': ['error', 'when-bumping'],
    },
    customRules: {
      'subject-ticket-detail': ({ subject }) => {
        const match = /^\[(?:[A-Z]+-\d+|#\d+)\] (.*)$/.exec(subject)
        const content = match?.[1]?.trim() ?? ''
        return !match || content.split(/\s+/).length >= 2 || content.length >= 15
          || 'Please provide at least 2 words or 15 characters after the ticket ID'
      },
    },
  },
})
```

## Differences

- Reverts: commitlint ignores the `Revert "..."` messages of git, Relizy requires a conventional commit: `revert: <reverted header>` with a `revert` type in your Relizy `types`, or a commit of the type of the change, e.g. `fix(core): revert the parser change`.
- Stricter defaults: [`subject-meaningful`](./rules.md#subject-meaningful) and the body rules may report commits commitlint accepted. Tune or disable them in `commitlint.rules`.

## What is not supported

- `extends` and shareable configs: the defaults of Relizy replace `@commitlint/config-conventional`.
- commitlint plugins: write [custom rules](./custom-rules.md) instead.
- The interactive prompt of `@commitlint/cz-commitlint`.
