---
title: Custom commit linting rules
description: Write your own commit linting rules as functions in your Relizy config, with the bump, the changed files and the packages of each commit.
keywords: relizy commitlint custom rules, function rules, commitlint-plugin-function-rules, jira ticket, commit rules
category: Commitlint
tags: [commitlint, custom-rules, configuration]
---

# Custom Rules

Write the rules your team needs as functions in `commitlint.customRules`. A rule receives the parsed commit and returns:

- `true` when the commit is valid;
- an error message (or `false`) otherwise;
- or a `[valid, message?]` tuple, the format of [`commitlint-plugin-function-rules`](https://github.com/vidavidorra/commitlint-plugin-function-rules), so its rules can be copied as is.

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  commitlint: {
    customRules: {
      'subject-ticket': ({ subject }) => /^\[[A-Z]+-\d+\] /.test(subject) || 'Start the subject with the ticket, e.g. "[ABC-123] add the parser"',
    },
  },
})
```

A custom rule is an error by default. Set its level, and its value, in `commitlint.rules` like a built-in rule:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  commitlint: {
    rules: {
      'subject-ticket': ['warn', { project: 'ABC' }],
    },
    customRules: {
      'subject-ticket': ({ subject }, { value }) => {
        const { project } = value as { project: string }
        return subject.startsWith(`[${project}-`) || `Start the subject with a ${project} ticket`
      },
    },
  },
})
```

Custom rules can be `async`, and they run on every commit, conventional or not.

## The commit

The commit has the field names of commitlint, plus what Relizy knows about it:

| Field        | Description                                                                     |
| ------------ | ------------------------------------------------------------------------------- |
| `raw`        | Full message, git comments removed                                              |
| `header`     | First line                                                                      |
| `body`       | Text between the header and the footer                                          |
| `footer`     | Trailing `Token: value` lines (`BREAKING CHANGE:`, `Closes #12`...)             |
| `type`       | Type, empty when the header is not a conventional commit                        |
| `scope`      | Scope, as written                                                               |
| `subject`    | Description of the header                                                       |
| `isBreaking` | Breaking change, as detected by Relizy                                          |
| `bump`       | `'major'`, `'minor'`, `'patch'` or `undefined`: the bump of your release        |
| `references` | Pull request, issue and hash references                                         |
| `files`      | Changed files (staged files, or the files of the commit in a range), when known |
| `packages`   | Names of the workspace packages touched by `files`                              |
| `hash`       | Hash of the commit, when linting a range                                        |

The second argument holds the `value` of the rule and the resolved Relizy `config`.

## Examples

### Require a ticket for the commits that bump a version

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  commitlint: {
    customRules: {
      'ticket-when-bumping': ({ bump, subject }) =>
        !bump || /^\[(?:[A-Z]+-\d+|#\d+)\] /.test(subject) || 'Commits that bump a version must reference a ticket',
    },
  },
})
```

### Keep a commit in a single package

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  commitlint: {
    rules: { 'single-package': 'warn' },
    customRules: {
      'single-package': ({ packages = [] }) =>
        packages.length <= 1 || `This commit touches ${packages.length} packages (${packages.join(', ')}), split it per package`,
    },
  },
})
```
