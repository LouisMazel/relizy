---
title: Changelog Configuration
description: Reference of the changelog options - root changelog, commit bodies, format command, commit types and the contributors.
keywords: changelog config, rootChangelog, includeCommitBody, formatCmd, commit types, types, excludeAuthors, noAuthors, hideAuthorEmail, contributors
category: Configuration
tags: [config, changelog, commits, types, contributors]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }} The `changelog` key holds `rootChangelog`, `includeCommitBody` and `formatCmd`; the other options are top-level keys. For what a changelog contains and how it is built, see [Changelog](./../guide/changelog.md). The title of a changelog section and the text of an empty one are [templates](./commit-templates.md#changelogtitle).

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  changelog: {
    formatCmd: 'pnpm prettier --write "**/CHANGELOG.md"',
  },
  types: {
    feat: { title: '✨ Features', semver: 'minor' },
    chore: false,
  },
  excludeAuthors: ['renovate[bot]'],
})
```

## rootChangelog

- **Type:** `boolean`
- **Default:** `true`
- **CLI:** `--no-root-changelog`

Write the `CHANGELOG.md` of the root, with the changes of every package, in addition to the changelog of each package. A [version group](./monorepo.md#groups) can override it.

## includeCommitBody

- **Type:** `boolean`
- **Default:** `true`

Include the body of the commits in the entries, without its git trailers (`Co-authored-by:`, `Signed-off-by:`, `Closes #12`...) nor the "Generated with" line of the AI tools. A `BREAKING CHANGE:` footer is kept. A [version group](./monorepo.md#groups) can override it.

## formatCmd

- **Type:** `string`
- **Default:** none
- **CLI:** `--format-cmd <cmd>`

Command run from the root after the changelogs are written, e.g. to format them with Prettier (not run in dry-run).

## types

- **Type:** `Record<string, { title: string, semver?: 'major' | 'minor' | 'patch' } | false>`
- **Default:** see the table

The commit types: the title of their section in the changelog and the bump they trigger. A type without `semver` is listed in the changelog without triggering a bump; a type absent from `types` is ignored. A breaking commit (`!` or `BREAKING CHANGE:`) of a listed type triggers a major. See [Semver Convention](./../guide/semver-convention.md).

| Type       | Title              | Bump    |
| ---------- | ------------------ | ------- |
| `feat`     | `🚀 Enhancements`  | `minor` |
| `perf`     | `🔥 Performance`   | `patch` |
| `fix`      | `🩹 Fixes`         | `patch` |
| `refactor` | `💅 Refactors`     | `patch` |
| `docs`     | `📖 Documentation` | `patch` |
| `build`    | `📦 Build`         | `patch` |
| `types`    | `🌊 Types`         | `patch` |
| `chore`    | `🏡 Chore`         | none    |
| `examples` | `🏀 Examples`      | none    |
| `test`     | `✅ Tests`         | none    |
| `style`    | `🎨 Styles`        | none    |
| `ci`       | `🤖 CI`            | none    |

The entries are merged by type: an entry of the config replaces the default entry of its type entirely (`docs: { title: 'Docs' }` no longer bumps a patch), the other default types are kept. `false` leaves the commits of the type out of the changelog and of the bump. The sections follow the order of `types`: the default types first, then the types added by the config. `relizy commitlint` accepts these types (see [`type-enum`](./../commitlint/rules.md#type-enum)).

## excludeAuthors

- **Type:** `string[]`
- **Default:** `[]`

Names or emails (matched as substrings) left out of the contributors of the changelog and of the Slack posts. Their commits stay in the changelog. The bots (`[bot]`) and the AI tools co-authoring commits (`Claude <noreply@anthropic.com>`, Cursor, GitHub Copilot...) are never credited.

## noAuthors

- **Type:** `boolean`
- **Default:** `false`

Do not list the contributors in the changelogs, the provider releases and the Slack posts.

## hideAuthorEmail

- **Type:** `boolean`
- **Default:** `false`

Do not show the email of a contributor without GitHub profile in the changelog.

## repo

The repository of the links of the changelog (commits, compare links, issues) is [`repo`](./overview.md#repo).
