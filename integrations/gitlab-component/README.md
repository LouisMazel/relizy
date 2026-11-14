# relizy

Ship every release in one job: versions, changelogs, npm publishing and GitLab releases, from your commits, with [relizy](https://relizy.dev).

The `release` component adds a `release` job: it installs your package manager and your dependencies, runs `relizy release` and gives its outputs to the next jobs.

> This project is synced from [LouisMazel/relizy](https://github.com/LouisMazel/relizy/tree/main/integrations/gitlab-component) at each release: open issues and merge requests there.

## Usage

```yaml
include:
  - component: gitlab.com/relizy/relizy/release@2
```

Add the masked CI/CD variables (Settings > CI/CD > Variables): `GITLAB_TOKEN` (a project access token with the `api` and `write_repository` scopes), and `NPM_TOKEN` without npm trusted publishing. The other tokens (`SLACK_TOKEN`, `TEAMS_WEBHOOK_URL_B64`, `TWITTER_*`, `CLAUDE_CODE_OAUTH_TOKEN`) are read under the same names.

To choose the release type in Build > Pipelines > Run pipeline:

```yaml
variables:
  RELEASE_TYPE:
    value: auto
    options: [auto, patch, minor, major]
    description: Release type (auto follows the commits)

include:
  - component: gitlab.com/relizy/relizy/release@2
```

The guide: [GitLab CI](https://relizy.dev/guide/gitlab-ci).

### Preview the release before the merge

The `merge-preview` component adds a `merge-preview` job to the merge request pipelines: a comment tells what the merge releases (versions, tags, dist-tag, what the merge request brings), and the commit status `relizy/merge-preview` fails when the release of the merge would fail. Nothing is written nor published. It runs [`relizy merge-preview`](https://relizy.dev/cli/merge-preview): give it the `release-type` of the release job and, in `args`, its options that change the release (`--preid`, `--tag`, `--no-publish`...). `GITLAB_TOKEN` is needed: the `CI_JOB_TOKEN` cannot comment nor set a status.

```yaml
include:
  - component: gitlab.com/relizy/relizy/release@2
  - component: gitlab.com/relizy/relizy/merge-preview@2
```

Its inputs: `stage` (`test`), `image`, `release-type`, `profile`, `args`, `setup`, `package-manager`, `relizy-version` and `working-directory`, as the ones of `release`. The guide: [Merge preview](https://relizy.dev/guide/merge-preview).

## Inputs

| Input               | Default                | Description                                                                                                                         |
| ------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `stage`             | `deploy`               | Stage of the job                                                                                                                    |
| `image`             | `node:lts`             | Node.js image of the job                                                                                                            |
| `when`              | `manual`               | `manual` on demand, `on_success` at each push on the default branch                                                                 |
| `release-type`      | `auto`                 | `auto`, `patch`, `minor`, `major`, `prerelease`... (`RELEASE_TYPE` takes precedence)                                                |
| `profile`           |                        | A [release profile](https://relizy.dev/config/profiles) of the config (`beta`, `canary`...), as `--profile` (relizy 2.3.0 or later) |
| `args`              |                        | More arguments for `relizy release`, e.g. `--tag beta --preid beta`                                                                 |
| `skip-commit`       | `^chore\(release\): `  | Regular expression of the release commit, which does not run the job again                                                          |
| `setup`             | `true`                 | Install the package manager and the dependencies                                                                                    |
| `package-manager`   | from the lockfile      | `npm`, `pnpm`, `yarn` or `bun`                                                                                                      |
| `relizy-version`    | the one of the project | Version of relizy, else the one of the component                                                                                    |
| `working-directory` | `.`                    | Directory of the project                                                                                                            |

## Outputs

The `dotenv` artifact gives `RELIZY_RELEASED`, `RELIZY_STATUS`, `RELIZY_VERSION`, `RELIZY_TAGS`, `RELIZY_PACKAGES`, `RELIZY_URLS`... to the next jobs. See [the outputs](https://relizy.dev/guide/gitlab-ci#outputs-and-summary).

## Versions

`@2` follows the latest relizy 2, `@2.3.0` a given version. The component runs the relizy of your `package.json`, else the version of its tag.
