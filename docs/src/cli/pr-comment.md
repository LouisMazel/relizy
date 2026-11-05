---
title: pr-comment
description: Post the release comment on the open pull request or merge request of the current branch.
keywords: relizy pr-comment, pr comment cli, pull request comment, merge request comment, pr-number
category: CLI Reference
tags: [cli, pr-comment, pull-request, merge-request, github, gitlab]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Usage

```bash
relizy pr-comment
```

Comments the versions, the tags, the packages and the install commands of the project, read from the `package.json` files (see [The Comment of `relizy pr-comment`](./../guide/pr-comment.md#the-comment-of-relizy-pr-comment)). `relizy release` posts the summary of the release instead. Without pull request, the command warns and posts nothing.

The command has no option of its own. The [global options](./commands.md) apply:

- `--pr-number <number>`: the pull request or merge request to comment, when it is not the open one of the current branch (after a merge, on a detached `HEAD`, from a fork);
- `--dry-run`: find the pull request (the API of the provider is called) and show the comment, without posting it;
- `--config`, `--log-level`.

```bash
relizy pr-comment --pr-number 42 --dry-run
```

It needs a GitHub or GitLab token: see [Tokens](./../guide/pr-comment.md#tokens).

## See Also

- [PR Comments](./../guide/pr-comment.md)
- [PR Comment Configuration](./../config/pr-comment.md)
- [`prComment()`](./../api/pr-comment.md)
