---
title: Commit linting rules
description: Every built-in rule of relizy commitlint, its default level and value, what it reports and how to configure it.
keywords: relizy commitlint rules, header-format, header-max-length, type-enum, scope-enum, scope-required, scope-matches-files, subject-case, subject-full-stop, subject-meaningful, body-leading-blank, body-no-headings, body-markdown, body-changelog-lint, body-breaking-change, no-breaking, no-ai-attribution
category: Commitlint
tags: [commitlint, rules, conventional-commits, configuration]
---

# Rules

Set the level (`'error'`, `'warn'`, `'off'`) and the value of a rule in [`commitlint.rules`](./config.md#rules). Errors fail the check, warnings are only printed.

## Overview

| Rule                                            | Default | Value                            | Non-conventional messages |
| ----------------------------------------------- | ------- | -------------------------------- | ------------------------- |
| [`header-format`](#header-format)               | `error` |                                  | Yes                       |
| [`header-max-length`](#header-max-length)       | `error` | `500`                            | Yes                       |
| [`type-enum`](#type-enum)                       | `error` | Extra types                      |                           |
| [`scope-enum`](#scope-enum)                     | `error` |                                  |                           |
| [`scope-required`](#scope-required)             | `off`   | `'always'`                       |                           |
| [`scope-matches-files`](#scope-matches-files)   | `warn`  |                                  |                           |
| [`subject-case`](#subject-case)                 | `off`   |                                  |                           |
| [`subject-full-stop`](#subject-full-stop)       | `error` |                                  |                           |
| [`subject-meaningful`](#subject-meaningful)     | `error` | `{ minWords: 2, minLength: 15 }` |                           |
| [`body-leading-blank`](#body-leading-blank)     | `error` |                                  | Yes                       |
| [`body-no-headings`](#body-no-headings)         | `error` |                                  | Yes                       |
| [`body-markdown`](#body-markdown)               | `error` |                                  | Yes                       |
| [`body-changelog-lint`](#body-changelog-lint)   | `error` |                                  |                           |
| [`body-breaking-change`](#body-breaking-change) | `error` |                                  | Yes                       |
| [`no-breaking`](#no-breaking)                   | `off`   |                                  | Yes                       |
| [`no-ai-attribution`](#no-ai-attribution)       | `error` | Extra authors and trailers       | Yes                       |

A message whose header is not a conventional commit gets `header-format`, and only the rules marked "Yes" run on it, with the [custom rules](./custom-rules.md). There is no length limit on the body, as there is none in the changelogs.

## Header

### `header-format`

The header must follow `type(scope)!: subject`: a lowercase type, an optional scope without spaces, an optional `!`, a colon followed by a space, and a subject. Extra spaces after the colon are accepted, the changelog removes them. No whitespace at the start or the end of the header.

| Header                                      | Problem                                                                                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Feat(core): add the commitlint command`    | The type "Feat" is not lowercase                                                                                                                                                                  |
| `feat(core):add the commitlint command`     | A space is missing after the colon                                                                                                                                                                |
| `feat(core) : add the commitlint command`   | There is a space before the colon                                                                                                                                                                 |
| `feat(my core): add the command`            | The scope is empty or contains spaces                                                                                                                                                             |
| `✨ feat: add the commitlint command`       | The header is not a conventional commit                                                                                                                                                           |
| `Revert "feat: add the commitlint command"` | The header is the default revert message of git: write `revert: <reverted header>` (with a `revert` type in your `types`), or a conventional commit such as `fix(core): revert the parser change` |

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

The type must be a key of your Relizy [`types`](./../config/changelog.md#types), including the types set to `false` (valid, but absent from the changelog). A type unknown to Relizy would be silently ignored by your release. The fix suggests the closest type (`fature` → `feat`).

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

- the workspace packages, private and ignored ones included, by short name, full name or folder: `nuxt`, `@maz-ui/nuxt` or the name of its folder. The packages come from [`monorepo.packages`](./../config/monorepo.md), from the workspace of your tools (`workspaces` of the `package.json`, `pnpm-workspace.yaml`, `lerna.json`, `rush.json`, `deno.json`) and from [`commitlint.packages`](./config.md#packages);
- the keys of [`scopeMap`](./../config/overview.md#scopemap);
- the scopes of [`commitlint.scopes`](./config.md#scopes).

Without workspace package nor `commitlint.scopes` (a single package), any scope is allowed. The fix suggests the closest scope (`nuxtt` → `nuxt`).

### `scope-required`

Require a scope. Off by default. The value is:

- `'always'` (default value): every commit needs a scope;
- `'never'`: no commit can have a scope;
- `'when-bumping'`: only the commits that bump a version and touch a workspace package need a scope, and the fix gives the scope of the package. Without workspace package, every commit that bumps a version.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  commitlint: {
    rules: { 'scope-required': ['error', 'when-bumping'] },
  },
})
```

The bump is the one Relizy computes for your release (see [semver convention](./../guide/semver-convention.md)), breaking changes included. When the changed files are unknown (e.g. during a rebase), `when-bumping` does not require a scope.

### `scope-matches-files`

Warns when the scope designates a package that the commit does not touch. Relizy links a commit to a package by its changed files, not by its scope: a wrong scope gives a misleading changelog entry.

```text
✔ fix(nuxt) → patch bump, 🩹 Fixes

  ⚠ scope-matches-files  The scope "nuxt" designates packages/nuxt, but it touches @maz-ui/core
                         → use the scope of the touched package, or split the commit per package
```

The changed files are the staged files with `--edit` and `--message`, and the files of each commit in a range. Nothing is reported when they are unknown.

## Subject

### `subject-case`

The subject must not start with an uppercase letter. Off by default: Relizy capitalizes the subject in the changelog anyway, and names such as `MazChart` are legitimate. Acronyms such as `API` are allowed. When it reports an error, the suggested header starts lowercase.

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

Relizy copies the commit bodies into your `CHANGELOG.md` files, under the commit (see [`changelog.includeCommitBody`](./../config/changelog.md#includecommitbody)). These rules keep the changelogs valid.

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

Renders the commit as in your changelogs and checks the entry:

- **with the ESLint of your project**, when it is installed and lints the `CHANGELOG.md` files: the entry is linted with your config, the fixable problems are ignored and the remaining errors are reported;
- **otherwise, with a built-in parser** ([oxc](https://oxc.rs)): the `js`, `ts`, `jsx`, `tsx` and `json` code blocks must be valid code.

Choose one with [`commitlint.changelogLinter`](./config.md#changeloglinter).

```text
✖ feat: scope the AI guidelines per target

  ✖ body-changelog-lint  The body would break the changelog formatting: Invalid ts code block:
                         Unexpected token, on "}"
                         → make the code block a complete program, e.g. "export default
                           defineConfig({ ... })" rather than a bare object
```

A code block must be a complete program, not a fragment: write `export default defineConfig({ ai: { ... } })`, not a bare `ai: { ... }`. The rule only runs on a conventional commit whose body has a code block and whose type appears in the changelog, and never when `changelog.includeCommitBody` is `false`.

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

## AI attribution

### `no-ai-attribution`

Reject the commits crediting an AI tool: an AI co-author, a session trailer or the "Generated with" line some tools add.

```text
feat: add the parser

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Claude-Session: https://claude.ai/code/session_01
Co-authored-by: Claude <noreply@anthropic.com>
```

The tools are recognized by their email (`noreply@anthropic.com`, `cursoragent` or `copilot` on GitHub...) or by a full name (`Claude Opus 4.5`, `GitHub Copilot`): a person named Claude is a real co-author. The trailers are `Claude-Session:`, `Generated-by:` and `Assisted-by:`. Add your own, matched as substrings of `name <email>` for the authors:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  commitlint: {
    rules: {
      'no-ai-attribution': ['error', { authors: ['agent@acme.dev'], trailers: ['Agent-Session'] }],
    },
  },
})
```

Whatever this rule, the changelogs never show these lines nor credit the AI tools as contributors.

Merge, `fixup!`, `squash!`, `amend!` and release commits are never linted: see [`ignores`](./config.md#ignores).
