# Changelog

## v2.2.1 (2026-11-11)

[compare changes](https://github.com/LouisMazel/relizy/compare/v2.2.0...v2.2.1)

### 🩹 Fixes

- Install the commit-msg hook on every clone without husky ([d1907fb](https://github.com/LouisMazel/relizy/commit/d1907fb))

  - Without husky, the hook lives in `.git/hooks`, which is not versioned: `relizy init` now adds `relizy commitlint --install` to the `prepare` script, so every clone gets it at install
  - `relizy commitlint --install` keeps an existing hook with a warning instead of failing, and installs nothing outside a git repository, so it never breaks an install
  - The hook of `.git/hooks` lets the commits through while relizy is not installed, instead of blocking them
  - Once husky is set up, the hook relizy wrote in `.git/hooks` before is removed

- **core:** Fail on a scope that designates an untouched package ([e52f336](https://github.com/LouisMazel/relizy/commit/e52f336))

  The `scope-matches-files` rule is now an error by default instead of a warning: a scope naming a package the commit does not touch gives a misleading changelog entry. Set `commitlint.rules['scope-matches-files']` to `'warn'` to keep the previous behavior, e.g. while a moved package is not released yet.

### 💅 Refactors

- **relizy:** Build on @relizy/core ([0ee8d80](https://github.com/LouisMazel/relizy/commit/0ee8d80))

  relizy now relies on the new `@relizy/core` package for its generic capabilities. Nothing changes for its users: same API, CLI, configuration and behavior, same `v*` tags, GitHub releases and changelog. The MCP server also documents the API of `@relizy/core`.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

## v2.2.1-beta.0 (2026-11-10)

[compare changes](https://github.com/LouisMazel/relizy/compare/v2.2.0...v2.2.1-beta.0)

### 🩹 Fixes

- Install the commit-msg hook on every clone without husky ([d1907fb](https://github.com/LouisMazel/relizy/commit/d1907fb))

  - Without husky, the hook lives in `.git/hooks`, which is not versioned: `relizy init` now adds `relizy commitlint --install` to the `prepare` script, so every clone gets it at install
  - `relizy commitlint --install` keeps an existing hook with a warning instead of failing, and installs nothing outside a git repository, so it never breaks an install
  - The hook of `.git/hooks` lets the commits through while relizy is not installed, instead of blocking them
  - Once husky is set up, the hook relizy wrote in `.git/hooks` before is removed

- **core:** Fail on a scope that designates an untouched package ([e52f336](https://github.com/LouisMazel/relizy/commit/e52f336))

  The `scope-matches-files` rule is now an error by default instead of a warning: a scope naming a package the commit does not touch gives a misleading changelog entry. Set `commitlint.rules['scope-matches-files']` to `'warn'` to keep the previous behavior, e.g. while a moved package is not released yet.

### 💅 Refactors

- **relizy:** Build on @relizy/core ([0ee8d80](https://github.com/LouisMazel/relizy/commit/0ee8d80))

  relizy now relies on the new `@relizy/core` package for its generic capabilities. Nothing changes for its users: same API, CLI, configuration and behavior, same `v*` tags, GitHub releases and changelog. The MCP server also documents the API of `@relizy/core`.

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))
