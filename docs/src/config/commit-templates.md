---
title: Commit Templates
description: Customize the release commit title and body with placeholders, and take advantage of smart defaults in independent monorepo mode.
keywords: relizy commit message, commit body, independent mode commit, release commit template, monorepo commit, commitlint
category: Configuration
tags: [config, commit, templates, monorepo, independent]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

When Relizy bumps versions, it creates a single release commit containing the
version changes and the updated changelogs. The **title** of that commit is
controlled by `templates.commitMessage`, and you can optionally populate the
**body** with `templates.commitBody`.

## Why a separate body?

In `independent` monorepos, the legacy single-line title
(<code v-pre>chore(release): bump version to {{newVersion}}</code> where <code v-pre>{{newVersion}}</code>
expands to the full list of `name@version` pairs) can quickly exceed commitlint
`header-max-length` limits once a release touches many packages:

```text
chore(release): bump version to @scope/a@1.0.0, @scope/b@1.0.0, @scope/c@1.0.0, …
```

Relizy now keeps titles short by default in `independent` mode and pushes the
full list into the commit body.

## Smart defaults

Defaults are resolved based on `monorepo.versionMode`:

| Version mode            | Default `commitMessage`                                           | Default `commitBody`               |
| ----------------------- | ----------------------------------------------------------------- | ---------------------------------- |
| `unified` / `selective` | <code v-pre>chore(release): bump version to {{newVersion}}</code> | _(none)_                           |
| `independent`           | <code v-pre>chore(release): bump {{packageCount}} packages</code> | <code v-pre>{{packageList}}</code> |

If you set either `commitMessage` or `commitBody` yourself, your value is
preserved — Relizy only fills in `undefined` fields.

## `templates.commitMessage`

- **Config key:** `templates.commitMessage`
- **Type:** `string`

The commit title. Must stay within your commitlint `header-max-length` when
using linting (typically 72 or 100 characters).

## `templates.commitBody`

- **Config key:** `templates.commitBody`
- **Type:** `string | undefined`

Optional commit body. When defined, it is passed to `git commit` as a second
`-m` argument, producing a proper commit body (blank line separator handled by
git).

## Available placeholders

Both `commitMessage` and `commitBody` support the same placeholders:

| Placeholder                         | Description                                                                                                           | Example                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| <code v-pre>{{newVersion}}</code>   | In `independent` mode, comma-separated `name@version` list. In other modes, the new root version.                     | `1.2.0` or `@scope/a@1.2.0, @scope/b@1.0.1` |
| <code v-pre>{{rootVersion}}</code>  | Version from the root `package.json`. Useful in `independent` mode where <code v-pre>{{newVersion}}</code> is a list. | `1.2.0`                                     |
| <code v-pre>{{packageCount}}</code> | Number of packages bumped in this release.                                                                            | `7`                                         |
| <code v-pre>{{packageNames}}</code> | Comma-separated list of bumped package **names**.                                                                     | `@scope/a, @scope/b`                        |
| <code v-pre>{{packageList}}</code>  | Comma-separated list of bumped `name@version`.                                                                        | `@scope/a@1.2.0, @scope/b@1.0.1`            |

In non-monorepo and `unified`/`selective` setups, <code v-pre>{{packageCount}}</code>,
<code v-pre>{{packageNames}}</code>, and <code v-pre>{{packageList}}</code> still work and reflect the bumped
packages resolved for that release.

## Examples

### Short title with a detailed body (independent mode default)

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: { versionMode: 'independent', packages: ['packages/*'] },
  // Equivalent to the built-in default for independent mode:
  templates: {
    commitMessage: 'chore(release): bump {{packageCount}} packages',
    commitBody: '{{packageList}}',
  },
})
```

Produces:

```text
chore(release): bump 3 packages

@scope/a@1.2.0, @scope/b@1.0.1, @scope/c@1.0.1
```

### Include the root version in the title

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: { versionMode: 'independent', packages: ['packages/*'] },
  templates: {
    commitMessage: 'chore(release): release {{rootVersion}} ({{packageCount}} packages)',
    commitBody: '{{packageList}}',
  },
})
```

### Opt out of the body

Set `commitBody` to an empty string to force an empty body, or simply override
`commitMessage` and leave `commitBody` unset if you want to rely entirely on
the title.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: { versionMode: 'independent', packages: ['packages/*'] },
  templates: {
    commitMessage: 'release: {{packageCount}} packages',
    // commitBody stays undefined → no body
  },
})
```

::: warning
If you customize `commitMessage` but leave `commitBody` undefined, Relizy will
**not** auto-apply the independent-mode body default. Smart defaults only
trigger when both fields are unset.
:::

### Unified / selective mode

Defaults are unchanged — no body, single-line title:

```text
chore(release): bump version to 1.2.0
```

You can still opt into the placeholders if you want a richer message:

```ts
export default defineConfig({
  monorepo: { versionMode: 'selective', packages: ['packages/*'] },
  templates: {
    commitMessage: 'chore(release): v{{newVersion}} ({{packageCount}} packages)',
    commitBody: '{{packageList}}',
  },
})
```

## Tips for commitlint users

If your project uses commitlint with `header-max-length`, the independent-mode
default is designed to stay well under 72 characters. If you customize
`commitMessage`, double-check with:

```bash
echo "chore(release): bump 12 packages" | wc -c
```

And push long listings to `commitBody` where length is unrestricted.
