# Changelog

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
