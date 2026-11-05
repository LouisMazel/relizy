---
title: Migrating from commitlint
description: Replace commitlint with relizy commitlint - the hook and the CI, the rules of @commitlint/config-conventional and their Relizy equivalent, function rules ported as custom rules.
keywords: migrate from commitlint, commitlint alternative, config-conventional, commitlint-plugin-function-rules, relizy commitlint, header-max-length, subject-case
category: Commitlint
tags: [commitlint, migration]
---

# Migrating from commitlint

## 1. Replace the hook and the CI

In the `commit-msg` hook, replace `commitlint --edit "$1"` with `relizy commitlint --edit "$1"`, or run `relizy commitlint --install` (see [Commit linting](./index.md#lint-the-commit-being-created)). In CI, replace `commitlint --from <base> --to HEAD` with `relizy commitlint`: the range of the pull or merge request is found automatically.

## 2. Move the config

Most of a commitlint config disappears: the types, the scopes and the bump come from your Relizy config. Move what remains to the [`commitlint` key](./config.md) of `relizy.config.ts`, then remove commitlint:

```bash
pnpm remove @commitlint/cli @commitlint/config-conventional @commitlint/types commitlint-plugin-function-rules
rm commitlint.config.* .commitlintrc*
```

The rules take the ESLint format, `'error'` or `['error', value]`, and accept the commitlint tuples `[2, 'always', value]` to copy them as is (see [levels and values](./config.md#levels-and-values)).

## Rules of `@commitlint/config-conventional`

| commitlint rule                                           | Relizy equivalent                                                                                                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type-enum`                                               | [`type-enum`](./rules.md#type-enum), from your Relizy `types`                                                                                        |
| `type-case`, `type-empty`, `subject-empty`, `header-trim` | [`header-format`](./rules.md#header-format)                                                                                                          |
| `subject-case`                                            | [`subject-case`](./rules.md#subject-case), off by default and narrower: it only rejects a subject starting with an uppercase letter (not an acronym) |
| `subject-full-stop`                                       | [`subject-full-stop`](./rules.md#subject-full-stop)                                                                                                  |
| `header-max-length` (`100`)                               | [`header-max-length`](./rules.md#header-max-length), `500` by default: set `['error', 100]` to keep the limit                                        |
| `body-leading-blank`                                      | [`body-leading-blank`](./rules.md#body-leading-blank), an error instead of a warning                                                                 |
| `body-max-line-length`, `footer-max-line-length`          | None: the changelogs have no line length limit                                                                                                       |
| `footer-leading-blank`                                    | None: the footer is the last paragraph of the message                                                                                                |

Other common rules:

| commitlint rule | Relizy equivalent                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `scope-enum`    | [`scope-enum`](./rules.md#scope-enum), from your packages, `scopeMap` and [`commitlint.scopes`](./config.md#scopes)        |
| `scope-case`    | [`header-format`](./rules.md#header-format) (no spaces) and [`scope-enum`](./rules.md#scope-enum)                          |
| `scope-empty`   | [`scope-required`](./rules.md#scope-required), with `'when-bumping'` to require it only on the commits that bump a version |
| Any other rule  | A [custom rule](./custom-rules.md)                                                                                         |

Relizy adds rules commitlint has no equivalent for: [`scope-matches-files`](./rules.md#scope-matches-files), [`subject-meaningful`](./rules.md#subject-meaningful), [`body-no-headings`](./rules.md#body-no-headings), [`body-markdown`](./rules.md#body-markdown), [`body-changelog-lint`](./rules.md#body-changelog-lint), [`body-breaking-change`](./rules.md#body-breaking-change), [`no-breaking`](./rules.md#no-breaking) and [`no-ai-attribution`](./rules.md#no-ai-attribution).

## Function rules

`commitlint-plugin-function-rules` rules become [custom rules](./custom-rules.md): the commit has the same field names and the `[valid, message]` return value is accepted, so the function can be copied as is. The `value` argument becomes `context.value`.

```ts
// commitlint.config.ts (before): the types and the scopes copied by hand
import type { UserConfig } from '@commitlint/types'
import * as functionRules from 'commitlint-plugin-function-rules'

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [functionRules],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'perf', 'refactor', 'docs', 'build', 'types', 'chore', 'test', 'ci']],
    'scope-enum': [2, 'always', ['core', 'nuxt', 'ci', 'deps', 'release']],
    'header-max-length': [2, 'always', 200],
    'function-rules/subject-min-length': [2, 'always', ({ subject }) => [/^\[[A-Z]+-\d+\] \S+ \S+/.test(subject ?? ''), 'Start with the ticket, then describe the change']],
  },
} satisfies UserConfig
```

```ts
// relizy.config.ts (after): the types and the package scopes are built in
import { defineConfig } from 'relizy'

export default defineConfig({
  commitlint: {
    scopes: ['ci', 'deps', 'release'],
    rules: { 'header-max-length': ['error', 200] },
    customRules: {
      'subject-ticket': ({ subject }) => [/^\[[A-Z]+-\d+\] \S+ \S+/.test(subject), 'Start with the ticket, then describe the change'],
    },
  },
})
```

## Differences

- Reverts: commitlint ignores the `Revert "..."` messages of git, Relizy requires a conventional commit: `revert: <reverted header>` with a `revert` type in your Relizy `types`, or a commit of the type of the change, e.g. `fix(core): revert the parser change`.
- Stricter defaults: [`subject-meaningful`](./rules.md#subject-meaningful), [`no-ai-attribution`](./rules.md#no-ai-attribution) and the body rules may report commits commitlint accepted. Tune or disable them in `commitlint.rules`.
- Not supported: `extends` and shareable configs (the defaults of Relizy replace `@commitlint/config-conventional`), commitlint plugins (write [custom rules](./custom-rules.md)), and the prompt of `@commitlint/cz-commitlint`.
