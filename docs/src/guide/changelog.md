---
title: Changelog Generation
description: How Relizy writes the CHANGELOG.md files from the Conventional Commits - format, sections, breaking changes, commit bodies, contributors, files written per version mode and range of commits.
metaDescription: 'How Relizy writes the CHANGELOG.md files from Conventional Commits: format, sections, breaking changes, commit bodies and contributors.'
keywords: changelog generation, automatic changelog, conventional commits, CHANGELOG.md, breaking changes, contributors, commit body, changelog range, root changelog
category: Guide
tags: [guide, changelog, documentation, commits]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## When It Is Written

`relizy release` writes the changelogs after the bump (see [its steps](./../cli/release.md#steps)), and `relizy changelog` writes them alone, without bump nor commit (see [`relizy changelog`](./../cli/changelog.md)). `--no-changelog` skips the step of a release.

Each release adds a section at the top of the `CHANGELOG.md` of the package, under its `# ` title (created when the file does not exist).

## Format

```md
## v1.1.0...v1.2.0

[compare changes](https://github.com/acme/my-lib/compare/v1.1.0...v1.2.0)

### 🚀 Enhancements

- **auth:** Add OAuth2 login ([a1b2c3d](https://github.com/acme/my-lib/commit/a1b2c3d))
- ⚠️ Drop the `legacy` option ([e4f5a6b](https://github.com/acme/my-lib/commit/e4f5a6b))

  BREAKING CHANGE: use `modern` instead.

### 🩹 Fixes

- Resolve the memory leak of the event handlers ([#42](https://github.com/acme/my-lib/pull/42))

#### ⚠️ Breaking Changes

- ⚠️ Drop the `legacy` option ([e4f5a6b](https://github.com/acme/my-lib/commit/e4f5a6b))

  BREAKING CHANGE: use `modern` instead.

### ❤️ Contributors

- Jane Doe ([@jane](https://github.com/jane))
```

- **Title**: the previous and the new tag, `v0.0.0` for a first release. Change it with [`templates.changelogTitle`](./../config/commit-templates.md) (<code v-pre>{{oldVersion}}</code>, <code v-pre>{{newVersion}}</code>, <code v-pre>{{date}}</code>).
- **Compare link**: to the compare page of GitHub, GitLab or Bitbucket, when the repository is known (set with [`repo`](./../config/overview.md#repo), else read from the `repository` field of the closest `package.json`, else from the `origin` remote).
- **Sections**: one per commit type, in the order of [`types`](./../config/changelog.md#types), with the titles of the [default types](./semver-convention.md). A type without `semver` (`chore`, `test`, `ci`...) is listed without bumping, a type set to `false` is left out. The `chore(deps)` and `chore(release)` commits are left out, unless breaking.
- **Scope**: shown in bold before the description.
- **References**: the pull requests and issues of the commit message (`#42`), or else the commit hash, linked when the repository is known.
- **Breaking changes**: a commit with `!` or a `BREAKING CHANGE:` footer is prefixed with `⚠️`, and listed again, with its body, under `#### ⚠️ Breaking Changes`.
- **Contributors**: see [Contributors](#contributors).

A release without relevant commit gets the text of [`templates.emptyChangelogContent`](./../config/commit-templates.md) (`No relevant changes for this release`).

## Commit Bodies

With [`changelog.includeCommitBody`](./../config/changelog.md#includecommitbody) (`true` by default), the body of each commit is shown under its line, indented. The git trailers are removed (`Co-authored-by:`, `Signed-off-by:`, `Closes #12`, the `---` line GitHub adds before them in a squash merge) and so are the lines crediting an AI tool; a `BREAKING CHANGE:` footer is kept, as it tells how to migrate.

Write the body for the users of the package: it ends up in the changelog and in the provider release.

## Contributors

The section lists the authors of the commits and their co-authors (`Co-authored-by:` trailers), so the contributors of a squash-merged pull request are credited. With a GitHub repository, each name is linked to its GitHub profile when it is found.

- the bots (a name containing `[bot]`) and the AI tools are never listed;
- [`excludeAuthors`](./../config/changelog.md) removes more names from the list (a part of the name or of the email): it does not remove their commits from the changelog;
- [`noAuthors: true`](./../config/changelog.md) removes the section, [`hideAuthorEmail: true`](./../config/changelog.md) the emails.

## Files Written

| Mode                    | Package changelogs                        | Root `CHANGELOG.md`                                                                   |
| ----------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------- |
| Standalone              | -                                         | The changelog of the package                                                          |
| `unified` / `selective` | One per released package, its own commits | The commits of the released packages                                                  |
| `independent`           | One per released package, its own commits | The sections of the released packages, under `**Multiple Packages Updated** - <date>` |

[`changelog.rootChangelog: false`](./../config/changelog.md#rootchangelog) (or `--no-root-changelog`) skips the root `CHANGELOG.md` of a monorepo. With [version groups](./version-groups.md), each group writes its changelogs, and `changelog.rootChangelog: false` on a group keeps it out of the root one.

The formatter of the project (Biome, Prettier, oxfmt, dprint or ESLint, from the root `package.json`) formats the changelogs written. Choose the command with [`changelog.formatCmd`](./../config/changelog.md#formatcmd) (or `--format-cmd`), <code v-pre>{{files}}</code> replaced by their paths, e.g. <code v-pre>eslint --fix {{files}}</code>, or turn it off with `false`.

## Range of Commits

A changelog goes from the tag of the previous release to `HEAD`. The previous release is resolved from the versions, not from the creation date of the tags:

- In standalone, `unified` and `selective` mode, the release tags follow [`templates.tagBody`](./../config/commit-templates.md#tagbody) (<code v-pre>v{{newVersion}}</code> by default), plus the `v1.2.3` and `1.2.3` formats. The `name@1.2.3` tags of packages released independently in the same repository are never used.
- In `independent` mode, the release tags of a package are its `name@1.2.3` tags.
- The previous release is the highest version strictly below the version released, and not above its major: a hotfix of an older version or a prerelease of the next one, tagged later on another branch, is never picked instead.
- A stable release starts at the previous stable release: a graduation from `2.0.0-beta.3` to `2.0.0` starts at `v1.x`, not at the last beta.

::: tip Changing the tag template
After changing `templates.tagBody`, the `v1.2.3` tags are still recognized. If the previous tags followed another custom template, Relizy warns about it: pass the tag of the previous release with `--from` for the first release with the new template.
:::

Set the range by hand with `--from` and `--to` (a tag, a commit or a branch):

```bash
relizy changelog --from v1.0.0 --to v1.2.0
```

A tag orphaned by a rebase gives a wrong range: see [Rewritten Tags & Rebases](./rewritten-tags.md). A package moved to another directory keeps its commits: see [Moving & Renaming Packages](./moved-packages.md).

## Writing Good Entries

- One change per commit, with a description written for the users: `fix(auth): refresh the token before it expires`, not `fix: stuff`.
- The scope groups the entries of a package or a feature.
- A breaking change explains the migration in its `BREAKING CHANGE:` footer.
- `relizy commitlint` checks the messages and shows the changelog entry of a commit, see [Commitlint](./../commitlint/index.md).

To rewrite the release notes of the provider releases and of the social posts with AI, see [AI Changelog](./ai-changelog.md).
