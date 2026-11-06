---
title: Prereleases & Canary
description: Publish prerelease versions (alpha, beta, rc) that are part of the release history, and canary versions (snapshot, preview) to test a pull request, with their versions, npm dist-tags and graduation to stable.
metaDescription: 'Publish prereleases (alpha, beta, rc) and canary versions to test a pull request with Relizy: versions, npm dist-tags and graduation to stable.'
keywords: relizy prerelease, beta version, alpha version, release candidate, preid, canary release, snapshot release, preview version, npm dist-tag, next tag, graduate to stable, test a pull request
category: Guide
tags: [guide, prerelease, canary, snapshot, versioning, ci-cd]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

## Prerelease or Canary

|                       | Prerelease (`--prerelease --preid beta`)             | Canary (`--canary`)                                    |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| **Purpose**           | A milestone of the release history (alpha, beta, rc) | A throwaway version to test a branch or a pull request |
| **Version**           | `1.3.0-beta.0`, then `1.3.0-beta.1`...               | `1.3.0-0.canary-a3f4b2c` (commit SHA)                  |
| **npm dist-tag**      | `next` (change it with `--tag`)                      | `canary` (change it with `--tag`)                      |
| **`package.json`**    | Bumped and committed                                 | Bumped for the publish, then restored                  |
| **Changelog**         | Yes                                                  | No                                                     |
| **Commit, tag, push** | Yes                                                  | No                                                     |
| **Provider release**  | Yes                                                  | No                                                     |
| **Social posts**      | Skipped with `onlyStable` (the default)              | No                                                     |
| **PR comment**        | Yes                                                  | Yes                                                    |

## Prerelease Versions

### Starting a Prerelease

From a stable version, `--prerelease` computes the bump from the commits, and `--preid` names the prerelease:

```bash
relizy release --prerelease --preid beta
# fix commits:  1.0.0 → 1.0.1-beta.0
# feat commits: 1.0.0 → 1.1.0-beta.0
```

`--premajor`, `--preminor` and `--prepatch` set the bump instead: `relizy release --preminor --preid beta` gives `1.1.0-beta.0`. The preid can also be set in the config with [`bump.preid`](./../config/bump.md#preid).

`--preid` needs a prerelease type: `relizy release --preid beta` alone fails with `You cannot use a "release" type with a "preid"`.

### Continuing a Prerelease

Keep running `--prerelease` with the same preid. Relizy compares the commits since the last prerelease with the level of its base version (`1.3.0` in `1.3.0-beta.2`):

| Step | Commits since the last prerelease | Result         | Why                                          |
| ---- | --------------------------------- | -------------- | -------------------------------------------- |
| 1    | `fix: resolve bug` (from `1.2.1`) | `1.2.2-beta.0` | First prerelease, a fix is a patch           |
| 2    | `fix: another fix`                | `1.2.2-beta.1` | Same level: the counter increments           |
| 3    | `feat: new feature`               | `1.3.0-beta.0` | A minor is above the patch base: base bumps  |
| 4    | `fix: small fix`                  | `1.3.0-beta.1` | Below the minor base: the counter increments |
| 5    | `feat!: breaking`                 | `2.0.0-beta.0` | A major is above the minor base: base bumps  |

The base version only goes up, and the counter restarts at `0` when it does. Without new commits, nothing is released. In `0.x`, a breaking change bumps the minor (`0.5.2` to `0.6.0-beta.0`), see [Semver Convention](./semver-convention.md).

### Changing the Preid

Move to the next stage with another preid, even without new commits:

```bash
# 1.2.0-beta.3
relizy release --prerelease --preid rc
# → 1.2.0-rc.0
```

A preid sorting lower (`rc` to `beta`) is refused: the new version would not be greater than the current one.

### Graduating to Stable

Run a release without prerelease type:

```bash
relizy release
```

The stable version is the base version of the prerelease, unless the commits since the prerelease imply a bigger bump than this base:

| Prerelease      | Commits since the prerelease | Stable version |
| --------------- | ---------------------------- | -------------- |
| `1.13.1-beta.0` | `fix: resolve bug`           | `1.13.1`       |
| `1.13.1-beta.0` | `feat: new feature`          | `1.14.0`       |
| `1.3.0-beta.2`  | `feat: another feature`      | `1.3.0`        |
| `1.3.0-beta.2`  | `feat!: breaking`            | `2.0.0`        |
| `1.13.1-beta.0` | none, or `chore: tooling`    | `1.13.1`       |

An explicit type applies as is: `--patch` on `1.3.0-beta.5` gives `1.3.0`. In a monorepo, a package on a prerelease version is released when it graduates (to stable or to a new preid), even without new commits. The changelog of a stable release starts at the previous stable release, see [Range of Commits](./changelog.md#range-of-commits).

### Dist-Tag, Suffix and Dependents

- **Dist-tag**: a prerelease is published with the `next` dist-tag, unless `--tag` (or [`publish.tag`](./../config/publish.md)) sets another one: `relizy release --prerelease --preid beta --tag beta`. Publishing a prerelease with `--tag latest` warns.
- **Suffix**: `--suffix` replaces the counter of the prerelease: `--prerelease --preid beta --suffix pr-42` gives `1.3.0-beta.pr-42` instead of `1.3.0-beta.0`. The version must still be greater than the current one.
- **Dependents**: a dependent without commits of its own gets a `prepatch` (`1.4.0` to `1.4.1-beta.0`), or the next `prerelease` when it already is a prerelease. In `selective` mode, it gets the root version, as always (see [Dependency Management](./dependency-management.md#version-of-a-dependent)).

## Canary Releases

A canary is a version published from the current commit, to install and test a branch before it is merged:

```bash
relizy release --canary --yes
```

### What `--canary` Does

`--canary` forces these settings of `relizy release`, whatever the other flags and the config:

- the type is `prerelease` and the preid `canary` (unless `--preid`);
- the dist-tag is `canary` (unless `--tag`), whatever `--preid`;
- no changelog, commit, git tag, push, provider release nor social post.

The other steps run as usual: the safety checks, the check of uncommitted changes (`--no-clean` skips it), the bump confirmation (`--yes` in CI), the publish (`--no-publish` skips it) and the PR comment (`--no-pr-comment` skips it).

The canary versions are written to the `package.json` files for the publish, then restored once the packages are published, when the publish fails, or right away with `--no-publish`. With `relizy bump --canary`, the canary versions stay in the files.

### Version Format

```text
{next version}-0.{preid}-{short sha}
1.3.0-0.canary-a3f4b2c
```

The next version is computed from the commits (`patch` when no commit sets a bump), the short SHA is the one of the current commit. The leading `0` sorts the canary below every other prerelease of the same version: `1.3.0-0.canary-a3f4b2c` < `1.3.0-alpha.0` < `1.3.0-beta.0` < `1.3.0`. A semver range (`^1.3.0-beta.0`) never matches it, and update tools never suggest it: a canary is only installed on purpose.

| Current version | Commits      | Canary version           |
| --------------- | ------------ | ------------------------ |
| `1.2.3`         | `feat: ...`  | `1.3.0-0.canary-a3f4b2c` |
| `1.2.3`         | `fix: ...`   | `1.2.4-0.canary-a3f4b2c` |
| `1.2.3`         | `feat!: ...` | `2.0.0-0.canary-a3f4b2c` |
| `2.0.0-beta.1`  | `feat: ...`  | `2.0.0-0.canary-a3f4b2c` |
| `0.5.2`         | `feat!: ...` | `0.6.0-0.canary-a3f4b2c` |

As for a release, a breaking change of a `0.x` version bumps the minor with [`bump.capZeroMajor`](./../config/bump.md#capzeromajor) (the default).

`--preid snapshot` gives `1.3.0-0.snapshot-a3f4b2c`, still published with the `canary` dist-tag.

### Packages Released

- **Standalone and `unified`**: every package gets the canary version, a `patch` canary when no commit sets a bump.
- **`selective`**: the packages with commits and their dependents get the canary version of the root; without commits, nothing is released.
- **`independent`**: each package with commits, and each dependent, gets a canary of its own version.

With [version groups](./version-groups.md), the canary versions of every group are written before anything is published, and restored once, after the last package is published: the `workspace:` dependencies between groups resolve to the canary versions of the same run.

### Installing a Canary

```bash
npm install my-package@canary
npm install my-package@1.3.0-0.canary-a3f4b2c
```

The `latest` dist-tag is never changed by a canary.

### Canary in CI

A canary job on each pull request publishes the version and comments it on the pull request:

```yaml
- name: Canary release
  run: pnpm exec relizy release --canary --yes --skip-existing-versions
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

The canary version comes from the commit SHA: a rerun on the same commit regenerates the same version, which the registry refuses to publish again. [`--skip-existing-versions`](./../config/publish.md#skipexistingversions) skips the packages already published, so a rerun passes.

For the complete workflows (permissions, tokens, PR number), see [GitHub Actions](./github-actions.md) and [GitLab CI](./gitlab-ci.md); for the comment, see [PR Comment](./pr-comment.md).
