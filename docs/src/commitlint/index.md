---
title: Commit linting
description: Lint your commit messages with your Relizy config. The same parser, types and scopes as your releases, and commit bodies checked as they will appear in your changelogs.
keywords: relizy commitlint, commit linter, commit message lint, conventional commits, commitlint alternative, commit-msg hook, changelog, monorepo scopes
category: Commitlint
tags: [commitlint, conventional-commits, git-hooks, lint, changelog]
---

# Commit linting

`relizy commitlint` checks your commit messages **with your Relizy config**: the same parser, the same types and the same packages as your releases. A commit that passes the linter is exactly the commit Relizy will bump, list and render in your changelogs.

```bash
$ relizy commitlint --message "feat(nuxt): add the module options"
✔ feat(nuxt) → minor bump, 🚀 Enhancements
```

## Why not commitlint?

[commitlint](https://commitlint.js.org) is a great generic tool, but used with Relizy it has three gaps:

- **A second source of truth.** Your types, scopes and `scopeMap` are already defined in `relizy.config.ts`. A commitlint config duplicates them by hand and drifts from them.
- **Another parser.** commitlint parses messages with `conventional-commits-parser`, Relizy with its own parser. A message accepted by commitlint can be ignored, or classified differently, by your release.
- **Commit bodies are not checked.** Relizy copies the commit bodies into your `CHANGELOG.md` files and your release notes. A broken code block or heading in a body breaks the formatting of the changelog, or even the release itself.

`relizy commitlint` closes them:

- ✅ **No extra config**: the types come from `types`, the scopes from your workspace packages and `scopeMap`.
- ✅ **The release parser**: the bump and the changelog section shown for each commit are the ones of your next release.
- ✅ **Changelog-safe bodies**: each body is rendered as in your changelogs, and its code blocks are checked with your own ESLint (or a built-in parser).
- ✅ **Monorepo aware**: scopes are checked against the packages the commit really touches.
- ✅ **No new dependency**: it ships with Relizy, no `@commitlint/*` package needed.

## What it checks

| Area             | Checks                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| Header           | `type(scope)!: subject` format, known type, allowed scope, subject case and length, header length                |
| Scopes           | Workspace packages, `scopeMap` keys and your list, scope required when bumping, scope matching the changed files |
| Body             | Blank line after the header, no markdown heading, valid markdown, code blocks that keep the changelog valid      |
| Breaking changes | Only `!` or a `BREAKING CHANGE:` footer can trigger a major bump                                                 |

Every rule can be tuned or disabled, and you can add your own rules as functions. See [Rules](./rules.md) and [Custom Rules](./custom-rules.md).

## Quick start

Lint the commit being created in your `commit-msg` hook:

```bash
npx relizy commitlint --install
```

Lint the commits of your pull requests in CI:

```bash
npx relizy commitlint
```

That's it: no config is needed to start. Continue with [Getting Started](./getting-started.md), or [migrate from commitlint](./migration.md).
