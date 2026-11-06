---
title: Templates
description: Reference of the templates - release commit title and body, tag name and message, changelog section title, empty changelog text, and the social posts.
keywords: relizy templates, commitMessage, commitBody, tagMessage, tagBody, tag name, changelogTitle, emptyChangelogContent, twitterMessage, slackMessage, release commit, placeholders
category: Configuration
tags: [config, templates, commit, tags, changelog]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }} A template is a string with <code v-pre>{{variable}}</code> placeholders.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  templates: {
    commitMessage: 'chore(release): v{{newVersion}}',
    changelogTitle: '{{newVersion}} ({{date}})',
  },
})
```

## commitMessage

- **Type:** `string`
- **Default:** depends on the version mode, see the table

Title of the release commit.

| Version mode                                                  | Default `commitMessage`                                                                      | Default `commitBody`                                                       |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| standalone, `unified`, `selective`                            | <code v-pre>chore(release): bump version to {{newVersion}}</code>                            | none                                                                       |
| `independent`                                                 | <code v-pre>chore(release): bump {{packageCount}} packages</code>                            | <code v-pre>{{packageList}}</code>                                         |
| [version groups](./../guide/version-groups.md#release-commit) | the `unified`/`selective` title when that group is released, the `independent` one otherwise | <code v-pre>{{packageList}}</code> when an `independent` group is released |

A template set in the config is kept as is. The `independent` default body only applies when neither `commitMessage` nor `commitBody` is set.

| Placeholder                         | Value                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| <code v-pre>{{newVersion}}</code>   | The new version; in `independent` mode, the comma-separated `name@version` list |
| <code v-pre>{{rootVersion}}</code>  | The version of the root `package.json`                                          |
| <code v-pre>{{packageCount}}</code> | The number of bumped packages                                                   |
| <code v-pre>{{packageNames}}</code> | The comma-separated names of the bumped packages                                |
| <code v-pre>{{packageList}}</code>  | The comma-separated `name@version` of the bumped packages                       |

[`relizy commitlint`](./../commitlint/rules.md#header-max-length) ignores the release commits, whatever their length.

## commitBody

- **Type:** `string`
- **Default:** see [`commitMessage`](#commitmessage)

Body of the release commit (a second `git commit -m`), with the placeholders of `commitMessage`. An empty string gives no body.

```ts
export default defineConfig({
  monorepo: { versionMode: 'independent', packages: ['packages/*'] },
  templates: {
    commitMessage: 'chore(release): {{packageCount}} packages ({{rootVersion}})',
    commitBody: '{{packageList}}',
  },
})
```

## tagBody

- **Type:** `string`
- **Default:** <code v-pre>'v{{newVersion}}'</code>

Name of the repository tag, in a standalone project and in the `unified` and `selective` modes (the packages of an `independent` mode are tagged `<name>@<version>`). Relizy also reads it to find the previous release: the tags following it, and the tags `v1.2.3` and `1.2.3`, so the previous tags stay recognized when the template changes from the default. Keep <code v-pre>{{newVersion}}</code> in it. Relizy warns about the tags that look like a release but follow neither.

## tagMessage

- **Type:** `string`
- **Default:** <code v-pre>'Bump version to {{newVersion}}'</code>

Message of the annotated tags. <code v-pre>{{newVersion}}</code> is the version of the tag.

## changelogTitle

- **Type:** `string`
- **Default:** <code v-pre>'{{oldVersion}}...{{newVersion}}'</code>

Title of a section of the changelogs (`## v1.0.0...v1.1.0`).

| Placeholder                       | Value                           | Example      |
| --------------------------------- | ------------------------------- | ------------ |
| <code v-pre>{{oldVersion}}</code> | The tag of the previous release | `v1.0.0`     |
| <code v-pre>{{newVersion}}</code> | The tag of the new release      | `v1.1.0`     |
| <code v-pre>{{date}}</code>       | The date, `YYYY-MM-DD`          | `2026-03-14` |

Every occurrence of each placeholder is replaced.

## emptyChangelogContent

- **Type:** `string`
- **Default:** `'No relevant changes for this release'`

Text of a changelog section without commits, e.g. a package bumped for one of its dependencies. Only written in the `CHANGELOG.md` files: the provider releases and the social posts stay empty.

## twitterMessage

- **Type:** `string`
- **Default:** <code v-pre>'📣 {{releaseTitle}}\n\n{{changelog}}\n\n{{releaseUrl}}\n{{changelogUrl}}'</code>

Template of the tweet, overridden by `social.twitter.template`. Its variables are on [Social](./social.md).

## slackMessage

- **Type:** `string`
- **Default:** none (the rich blocks format)

Template of the Slack message, overridden by `social.slack.template`. Its variables are on [Social](./social.md).
