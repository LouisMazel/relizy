# Changelog

## @relizy/core@2.4.0-beta.0 (2026-11-14)

[compare changes](https://github.com/LouisMazel/relizy/compare/@relizy/core@2.3.1-beta.0...@relizy/core@2.4.0-beta.0)

### 🚀 Features

- **core:** Read the full hash of each commit ([daeff68](https://github.com/LouisMazel/relizy/commit/daeff68))

  `getGitDiff` gives the full hash of each commit as `hash`, next to `shortHash`: a commit built by hand (the simulated squash commit) has none.

- **core:** Add getGitPushTarget and getPosixRelativePath ([2fbefcc](https://github.com/LouisMazel/relizy/commit/2fbefcc))

  `getGitPushTarget(cwd)` tells where `git push` pushes the current branch (its upstream, else `origin`), and `getPosixRelativePath(from, to)` gives a relative path with `/` separators on every platform.

### 🩹 Fixes

- Load a config importing relizy from a project that does not install it ([52bbfb9](https://github.com/LouisMazel/relizy/commit/52bbfb9))

  A config importing relizy (`import { defineConfig } from "relizy"`) gets the running relizy, so it loads when relizy is installed elsewhere and run by an application. The packages also export a default condition, for the loaders resolving with require.

- **core:** Never leave the registry token in the .npmrc of the project ([cdfef5f](https://github.com/LouisMazel/relizy/commit/cdfef5f))

  withRegistryNpmrc wrote the token in the .npmrc of the project, then wrote back what it read before. Two calls at the same time (the registry checks of several packages in a merge preview, or two relizy processes in the same project) took the file of each other for the original, and the last one wrote the token back, for good.

  The calls on the same .npmrc now run one after the other, and the injected lines sit between markers that are never taken for the original content: a block left by another process or a crash is removed instead.

- **core:** Never leave the registry token in the .npmrc of the project ([88cc61b](https://github.com/LouisMazel/relizy/commit/88cc61b))

  withRegistryNpmrc wrote the token in the .npmrc of the project, then wrote back what it read before. Two calls at the same time (the registry checks of several packages in a merge preview, or two relizy processes in the same project) took the file of each other for the original, and the last one wrote the token back, for good.

  The calls on the same .npmrc now run one after the other, and the injected lines sit between markers that are never taken for the original content: a block left by another process or a crash is removed instead.

### 📦 Build

- **deps:** Update 6 of my packages ([a2506c5](https://github.com/LouisMazel/relizy/commit/a2506c5))

  - @maz-ui/eslint-config ^5.4.0 -> ^5.5.0
  - @maz-ui/icons ^5.5.0 -> ^5.6.0
  - @maz-ui/themes ^5.5.0 -> ^5.6.0
  - @maz-ui/translations ^5.5.0 -> ^5.6.0
  - @maz-ui/utils ^5.5.0 -> ^5.6.0
  - maz-ui ^5.5.0 -> ^5.6.0

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## @relizy/core@2.3.1-beta.0 (2026-11-12)

[compare changes](https://github.com/LouisMazel/relizy/compare/@relizy/core@2.3.0...@relizy/core@2.3.1-beta.0)

### 🩹 Fixes

- Detect the repository of an SSH remote in GitLab subgroups ([7c571d6](https://github.com/LouisMazel/relizy/commit/7c571d6))

  An `origin` remote like `git@gitlab.example.com:group/sub/project.git` is now read with its whole path: the compare links of the changelog and the merge request comments work without `repo` in the config.

  relizy warns when the `repository` field of `package.json` or the `origin` remote is found but cannot be read, instead of producing `https://undefined/...` links silently.

### 📦 Build

- **core:** Upgrade @maz-ui/node to 5.7.0-beta.0 ([c98f13d](https://github.com/LouisMazel/relizy/commit/c98f13d))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## @relizy/core@2.3.0 (2026-11-11)

[compare changes](https://github.com/LouisMazel/relizy/compare/@relizy/core@2.3.0-beta.0...@relizy/core@2.3.0)

No relevant changes since last release

## @relizy/core@2.3.0-beta.0 (2026-11-10)

[compare changes](https://github.com/LouisMazel/relizy/compare/51c1ef18bda9171550303c11b1bae9d7c9a40571...@relizy/core@2.3.0-beta.0)

### 🚀 Features

- **core:** Add the @relizy/core package ([27b57c9](https://github.com/LouisMazel/relizy/commit/27b57c9))

  `@relizy/core` is the toolkit of relizy for versioned JavaScript repositories, usable on its own: git (commits, tags, refs, push), conventional commits and commit linting, workspace packages and catalogs, package managers, versions and bump types, tags and ranges, changelog generation, npm registries and publishing, GitHub and GitLab releases, CI environments.

  Its functions take plain inputs (a working directory, options) and an optional logger, without any relizy configuration. Its API follows semver, and the MCP server of relizy documents every export.

### 🩹 Fixes

- **core:** Fail on a scope that designates an untouched package ([e52f336](https://github.com/LouisMazel/relizy/commit/e52f336))

  The `scope-matches-files` rule is now an error by default instead of a warning: a scope naming a package the commit does not touch gives a misleading changelog entry. Set `commitlint.rules['scope-matches-files']` to `'warn'` to keep the previous behavior, e.g. while a moved package is not released yet.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))
