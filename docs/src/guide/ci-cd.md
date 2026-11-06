---
title: CI/CD Integration
description: Release from your CI with one command - what relizy init generates, what Relizy handles in a CI job, the tokens, running a step only when a release happens, and troubleshooting.
metaDescription: 'Release from your CI with one command: what relizy init generates, the tokens, running a step only on a release, and troubleshooting.'
keywords: ci cd, continuous integration, release from ci, relizy init workflow, shallow clone, git identity, push access, release outputs, troubleshooting ci release
category: Guide
tags: [guide, ci-cd, automation, github-actions, gitlab-ci]
---

# {{ $frontmatter.title }}

A CI job releases with a single command: `relizy release --yes`. Relizy prepares the clone, checks the tokens and the push access before writing anything, and writes a report the next steps can read.

## Start with relizy init

```bash
npx relizy init
```

On GitHub and GitLab, [`relizy init`](./../cli/init.md#release-workflow) writes the release workflow next to the config: run on demand (choosing the release type) or at each push on the default branch, with the permissions and only the secrets your config needs. The generated files are explained in [GitHub Actions](./github-actions.md) and [GitLab CI](./gitlab-ci.md).

On another CI, the job needs Node `^22.23.4 || ^24.22.1 || >=26.12.1`, the install of the dependencies, the [tokens](#tokens), credentials allowed to push, and `npx relizy release --yes`. Relizy reads the branch of a detached HEAD from the variables of CircleCI, Bitbucket Pipelines, Buildkite, Drone, Travis CI, Azure Pipelines and Jenkins too.

## What Relizy Handles in CI

- **Confirmation**: without `--yes`, `relizy release` and `relizy bump` fail right away, with exit code 1, as nobody can confirm the new versions. `--dry-run` needs it too.

  ```text
  relizy release asks to confirm the new versions, but the terminal is not interactive (GitHub Actions): run "relizy release --yes" to confirm them in advance
  ```

- **Shallow clone**: the full history and the tags are fetched (`git fetch --unshallow --tags`), as the versions and the changelogs need every commit since the last release. `fetch-depth: 0` (GitHub) or `GIT_DEPTH: 0` (GitLab) only saves this fetch.
- **Detached HEAD**: GitLab CI and others check out the commit. Relizy checks out the branch of the job (the source branch of a merge request), tracking the remote one, so the release commit can be pushed and the branch checked against the remote.
- **Git identity**: without `user.name` and `user.email` in the git config of the job, nor `GIT_AUTHOR_NAME`/`GIT_COMMITTER_NAME`, the release commit and the tags are made by the person who started the release, with the noreply email their provider links to their profile (`12446546+octocat@users.noreply.github.com`, `42-jdoe@users.noreply.gitlab.com`). A bot, an access token, or a CI that does not tell, gets `relizy[bot] <noreply@relizy.dev>`. Set the git config or the `GIT_AUTHOR_*` and `GIT_COMMITTER_*` variables to choose another identity.
- **npm token**: Relizy writes it to a temporary `.npmrc` of the project (restored right after) for npm, pnpm and bun, and checks it (`whoami`, npm and pnpm) before the bump. Nothing to write by hand.
- **Push access**: before publishing anything, Relizy checks that the release commit and the tags can be pushed (`git push --dry-run`), as a push failing after the publish would leave versions on the registry without their commit nor their tags. A dry run checks it too, except on a pull request, see [The Push Is Refused](#the-push-is-refused). On GitLab, it pushes with `GITLAB_TOKEN` when the job token cannot. The rules of protected branches are only checked by the real push: see [Protected Branches](#protected-branches).
- **Concurrent pushes**: commits pushed to the branch during the release are handled, see [Branch Safety](./../cli/release.md#branch-safety). The dry run of a pull request whose branch received new commits after it started only warns: the run of the latest commit previews the release with them.

## Tokens

| Needed for                        | Variable read by Relizy                                        |
| --------------------------------- | -------------------------------------------------------------- |
| npm publish                       | `RELIZY_NPM_TOKEN`                                             |
| GitHub release, PR comment        | `GITHUB_TOKEN`                                                 |
| GitLab release, MR comment, push  | `GITLAB_TOKEN`                                                 |
| [Social posts](./social-media.md) | `RELIZY_TWITTER_*`, `RELIZY_SLACK_TOKEN`                       |
| [AI rewrites](./ai-changelog.md)  | `RELIZY_CLAUDE_CODE_OAUTH_TOKEN` or `RELIZY_ANTHROPIC_API_KEY` |

Every variable has aliases (`NPM_TOKEN`, `NODE_AUTH_TOKEN`, `GH_TOKEN`...): see [Tokens](./../config/overview.md#tokens). The secrets to create on each CI are listed in [GitHub Actions](./github-actions.md#secrets-and-permissions) and [GitLab CI](./gitlab-ci.md#ci-cd-variables).

## Output in CI

In CI (or without a terminal), each step is a line with its duration, its logs in a collapsible group (GitHub Actions and GitLab CI). On GitHub Actions, the warnings and the error are annotations of the run. `--log-level verbose` shows every log; they are also written to `node_modules/.cache/relizy/release.log`. `RELIZY_REPORTER` forces the output: `ci`, `pretty` (the terminal one) or `classic` (the plain logs of the logger). See [Output](./../cli/commands.md#output).

## Run Something Only When a Release Happens

`relizy release` exits with code `0` whether it released or there was nothing to release. To run what follows a release (a message to the team, a deployment of the docs), either read the [report](#from-the-report) of the release, from a Node.js script or a next step of the pipeline, visible in the CI, or use a **hook**, which only runs when a release happens.

```ts
export default defineConfig({
  hooks: {
    // A command, run after a successful release only
    'success:release': 'node ./scripts/notify-teams.mjs',
  },
})
```

The hooks also run with `--dry-run`: a command hook would then notify for nothing. A function hook gets `dryRun`, and the release as third parameter (see [Hooks](./../config/hooks.md#parameters)), to tell what was released:

```ts
export default defineConfig({
  hooks: {
    'success:release': async (config, dryRun, context) => {
      if (dryRun || !context) {
        return
      }

      const versions = context.release.groups.flatMap(group => group.version
        ? [`${group.title} ${group.version}`]
        : group.packages.map(pkg => `${pkg.name} ${pkg.newVersion}`))

      await fetch(process.env.TEAMS_WEBHOOK_URL!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `Released: ${versions.join(', ')}` }),
      })
    },
  },
})
```

### From the Report

The [report](./../config/release.md#report) of the release tells what was released: written for a release, when there is nothing to release, when it fails, and in dry-run (`released` is then `false`). Read it in the next steps or jobs: the outputs of the step on GitHub Actions ([example](./github-actions.md#outputs-and-summary)), the dotenv artifact on GitLab CI ([example](./gitlab-ci.md#outputs-and-summary)). In a monorepo, `package_<name>_version` and `group_<name>_version` are only set for what was released, to run something for one package only.

From a Node.js script, [`release()`](./../api/release.md) returns the same report, and `--report-json relizy.json` writes it to a file.

For the announcements, prefer [social posts](./social-media.md) and the [PR comment](./pr-comment.md) to a message written by hand.

## Troubleshooting

### The Push Is Refused

The release stops before publishing, `--dry-run` too:

```text
relizy cannot push the release commit and tags to "origin" from GitHub Actions: the token of the job cannot push.
Fix: give the release job write access in your workflow:

  permissions:
    contents: write

or check out the repository with a token allowed to push (actions/checkout, input "token").
```

The dry run of a pull request (`pull_request` on GitHub, a merge request pipeline on GitLab) only warns: its token is read-only, and the release never runs there. The release job checks the push.

On GitLab, the fix is a `GITLAB_TOKEN` variable (a project access token with the `write_repository` and `api` scopes), or allowing the job token to push: see [Push Access](./gitlab-ci.md#push-access).

### Protected Branches

A branch requiring pull requests or status checks rejects the push of the release commit, after the publish. Push with a token allowed to bypass the rule: see [Protected Branches and Rulesets](./github-actions.md#protected-branches-and-rulesets) on GitHub, [Protected Branches and Tags](./gitlab-ci.md#protected-branches-and-tags) on GitLab. Then re-run the release from the latest commit: Relizy stops on the tags already created and prints how to recover (see [Branch Safety](./../cli/release.md#branch-safety)).

### npm Publish Fails

- **Authentication**: the token check before the bump fails. Check the secret is passed to the step, as `RELIZY_NPM_TOKEN` or `NPM_TOKEN`, and that the token can publish the packages.
- **OTP required**: a CI cannot type a one-time password. Use a token allowed to publish without 2FA.
- **Version already published**: a previous run published it but did not push. Follow the recovery printed by Relizy, or add `--skip-existing-versions`.

### Nothing to Release

`Nothing to release`: no commit since the last release tag triggers a bump (by default, `chore`, `test`, `ci`, `style` and `examples` do not, see [Semver Convention](./semver-convention.md)), or the commits do not touch the released packages. Preview with `relizy release --dry-run --yes`, force a type with `--patch`, `--minor` or `--major`, or release without commits with `--force`.

### Uncommitted Changes

```text
Uncommitted changes: dist/index.js (new)
Commit or stash them first, or keep them with --no-clean.
```

A step of the job wrote files that git tracks or does not ignore: add them to `.gitignore`, or keep them with `--no-clean`. They are not committed, except the changes of the files the release writes (`package.json`, `CHANGELOG.md`), which go in the release commit.
