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

## Inputs

| Input               | Default                | Description                                                                          |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| `stage`             | `deploy`               | Stage of the job                                                                     |
| `image`             | `node:lts`             | Node.js image of the job                                                             |
| `when`              | `manual`               | `manual` on demand, `on_success` at each push on the default branch                  |
| `release-type`      | `auto`                 | `auto`, `patch`, `minor`, `major`, `prerelease`... (`RELEASE_TYPE` takes precedence) |
| `args`              |                        | More arguments for `relizy release`, e.g. `--tag beta --preid beta`                  |
| `skip-commit`       | `^chore\(release\): `  | Regular expression of the release commit, which does not run the job again           |
| `setup`             | `true`                 | Install the package manager and the dependencies                                     |
| `package-manager`   | from the lockfile      | `npm`, `pnpm`, `yarn` or `bun`                                                       |
| `relizy-version`    | the one of the project | Version of relizy, else the one of the component                                     |
| `working-directory` | `.`                    | Directory of the project                                                             |

## Outputs

The `dotenv` artifact gives `RELIZY_RELEASED`, `RELIZY_STATUS`, `RELIZY_VERSION`, `RELIZY_TAGS`, `RELIZY_PACKAGES`, `RELIZY_URLS`... to the next jobs. See [the outputs](https://relizy.dev/guide/gitlab-ci#outputs-and-summary).

## Versions

`@2` follows the latest relizy 2, `@2.3.0` a given version. The component runs the relizy of your `package.json`, else the version of its tag.
