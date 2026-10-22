---
title: Commit linting rules
description: Every built-in rule of relizy commitlint, its default level and value, and how to configure it.
keywords: relizy commitlint rules, header format, type enum, scope enum, scope required, subject case, commit body, breaking change, changelog lint
category: Commitlint
tags: [commitlint, rules, conventional-commits, configuration]
---

# Rules

Each rule has a level, `'error'`, `'warn'` or `'off'`, and sometimes a value. Errors fail the check, warnings are only printed. Set them in `commitlint.rules`:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  commitlint: {
    rules: {
      'header-max-length': ['error', 100],
      'scope-required': ['error', 'when-bumping'],
      'subject-case': 'warn',
      'scope-matches-files': 'off',
    },
  },
})
```

The levels `0`, `1` and `2` and the commitlint tuples `[2, 'always', value]` are accepted too, to ease [migrations](./migration.md).

## Overview

| Rule                                            | Default | Value                            |
| ----------------------------------------------- | ------- | -------------------------------- |
| [`header-format`](#header-format)               | `error` |                                  |
| [`header-max-length`](#header-max-length)       | `error` | `500`                            |
| [`type-enum`](#type-enum)                       | `error` | Extra types                      |
| [`scope-enum`](#scope-enum)                     | `error` |                                  |
| [`scope-required`](#scope-required)             | `off`   | `'always'`                       |
| [`scope-matches-files`](#scope-matches-files)   | `warn`  |                                  |
| [`subject-case`](#subject-case)                 | `error` |                                  |
| [`subject-full-stop`](#subject-full-stop)       | `error` |                                  |
| [`subject-meaningful`](#subject-meaningful)     | `error` | `{ minWords: 2, minLength: 15 }` |
| [`body-leading-blank`](#body-leading-blank)     | `error` |                                  |
| [`body-no-headings`](#body-no-headings)         | `error` |                                  |
| [`body-markdown`](#body-markdown)               | `error` |                                  |
| [`body-changelog-lint`](#body-changelog-lint)   | `error` |                                  |
| [`body-breaking-change`](#body-breaking-change) | `error` |                                  |
| [`no-breaking`](#no-breaking)                   | `off`   |                                  |

The rules of the header, the type, the scope and the subject only run on conventional commits: a message that is not one only reports `header-format`. There is no length limit on the body, as there is none in the changelogs.

## Header

### `header-format`

The header must follow `type(scope)!: subject`: a lowercase type, an optional scope without spaces, an optional `!`, a colon followed by a space, and a subject. No leading emoji, and no whitespace at the start or the end.

```text
✔ feat(core): add the commitlint command
✖ Feat(core): add the commitlint command    → the type must be lowercase
✖ feat(core):add the commitlint command     → a space is required after the colon
✖ ✨ feat: add the commitlint command        → no emoji before the type
✖ Revert "feat: add the commitlint command" → write "revert: ..." (with a "revert" type)
```

### `header-max-length`

The maximum length of the header. Default: `500`.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  commitlint: {
    rules: { 'header-max-length': ['error', 100] },
  },
})
```

## Type

### `type-enum`

The type must be a key of your Relizy [`types`](/config/overview), including the types set to `false` (valid, but absent from the changelog). A type unknown to Relizy would be silently ignored by your release.

Accept extra types with the rule value:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  commitlint: {
    rules: { 'type-enum': ['error', ['wip']] },
  },
})
```

## Scope

### `scope-enum`

The scope must designate something. The allowed scopes are:

- the workspace packages, private and ignored ones included, by short name, full name or folder: `nuxt`, `@maz-ui/nuxt` or the name of its folder in `packages/`. Add directories Relizy does not release, such as apps, with [`commitlint.packages`](./config.md#packages);
- the keys of [`scopeMap`](/config/overview);
- the scopes listed in [`commitlint.scopes`](./config.md#scopes).

In standalone mode, any scope is allowed unless `commitlint.scopes` is set.

### `scope-required`

Require a scope. Off by default. The value is:

- `'always'` (default value): every commit needs a scope;
- `'never'`: no commit can have a scope;
- `'when-bumping'`: only the commits that bump a version and touch a workspace package need a scope. In standalone mode, every commit that bumps a version.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  commitlint: {
    rules: { 'scope-required': ['error', 'when-bumping'] },
  },
})
```

The bump is the one Relizy computes for your release, breaking changes included. When the changed files are unknown (e.g. during a rebase), `when-bumping` does not require a scope.

### `scope-matches-files`

Warns when the scope designates a package that the commit does not touch. Relizy links a commit to a package by its changed files, not by its scope: a wrong scope gives a misleading changelog entry.

```text
✔ fix(nuxt) → patch bump, 🩹 Fixes
  ⚠ The scope "nuxt" designates packages/nuxt, but it touches @maz-ui/core [scope-matches-files]
```

The changed files are the staged files with `--edit` and `--message`, and the files of each commit when linting a range.

## Subject

### `subject-case`

The subject must not start with an uppercase letter: Relizy capitalizes it in the changelog. Acronyms such as `API` are allowed.

### `subject-full-stop`

The subject must not end with a period (`...` is allowed).

### `subject-meaningful`

The subject must describe the change: at least `minWords` words or `minLength` characters, and not a generic word such as `wip`, `fix`, `update`, `changes` or `typo`.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  commitlint: {
    rules: { 'subject-meaningful': ['error', { minWords: 3, minLength: 20 }] },
  },
})
```

## Body

Relizy copies the commit bodies into your `CHANGELOG.md` files, under the commit (see [`changelog.includeCommitBody`](/config/changelog)). These rules keep the changelogs valid.

### `body-leading-blank`

A blank line must separate the header from the body.

### `body-no-headings`

No markdown heading (`#`, `##`, `===`...) in the body: copied under the commit in the changelog, it breaks the structure of the release sections.

::: tip
Git removes the lines starting with `#` from a message written in the editor: in the `commit-msg` hook, such headings are seen as comments. They are caught when linting the commits in CI.
:::

### `body-markdown`

The markdown of the body must be valid: code blocks closed, links with a URL.

### `body-changelog-lint`

Renders the commit as in your changelogs and checks it like your release formats them:

- **with the ESLint of your project**, when it is installed and lints the `CHANGELOG.md` files: the entry is linted with your config, the fixable problems are ignored and the remaining errors are reported;
- **otherwise, with a built-in parser**: the `js`, `ts`, `jsx`, `tsx` and `json` code blocks must be valid code.

```text
✖ feat: scope the AI guidelines per target
  ✖ The body would break the changelog formatting: Parsing error: ';' expected, on "slack: 'b'," [body-changelog-lint]
```

A code block must be a complete program, not a fragment. Write `export default defineConfig({ ai: { ... } })`, not a bare `ai: { ... }` object. The check only runs when the body has a code block and the commit appears in the changelog.

## Breaking changes

### `body-breaking-change`

Relizy bumps the major version when `breaking change:` appears **anywhere** in the message. To avoid accidental major releases, a breaking change can only be declared with `!` in the header or a `BREAKING CHANGE:` footer at the start of a line, as defined by [Conventional Commits](https://www.conventionalcommits.org).

```text
✔ feat!: drop the legacy option
✔ fix: change the output format

  BREAKING CHANGE: the output is now JSON
✖ fix: correct the parser

  This is not a breaking change: the output is the same.
```

### `no-breaking`

Forbid breaking changes. Off by default.

## Ignored commits

These commits are never linted:

- merge commits (`Merge ...`);
- `fixup!`, `squash!` and `amend!` commits, rewritten by `git rebase --autosquash`;
- the release commits of Relizy, matched from [`templates.commitMessage`](/config/commit-templates).

Disable it with [`defaultIgnores`](./config.md#defaultignores), or ignore more commits with [`ignores`](./config.md#ignores).
