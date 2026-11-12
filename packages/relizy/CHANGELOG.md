# Changelog

## v2.3.0-beta.0 (2026-11-12)

[compare changes](https://github.com/LouisMazel/relizy/compare/v2.2.1...v2.3.0-beta.0)

### 🚀 Features

- Install relizy with relizy init ([a34383f](https://github.com/LouisMazel/relizy/commit/a34383f))

  `relizy init` now adds relizy to the devDependencies and installs it with the package manager of the project: start with `npx relizy init`, nothing to install before.

  It also asks which AI agents to set up, defaults the registry to the one of your npm config (`.npmrc`), and its next steps list the tokens to set in `.env` to release from your machine.

### 🩹 Fixes

- Detect the repository of an SSH remote in GitLab subgroups ([7c571d6](https://github.com/LouisMazel/relizy/commit/7c571d6))

  An `origin` remote like `git@gitlab.example.com:group/sub/project.git` is now read with its whole path: the compare links of the changelog and the merge request comments work without `repo` in the config.

  relizy warns when the `repository` field of `package.json` or the `origin` remote is found but cannot be read, instead of producing `https://undefined/...` links silently.

- Ask which AI agents to set up in relizy mcp init ([1c2e775](https://github.com/LouisMazel/relizy/commit/1c2e775))

  - In a terminal, `relizy mcp init` asks which AI agents to set up, the detected ones checked
  - `--targets` with an agent other than Claude Code also writes the rules in `AGENTS.md`, read by Codex, Cline and Zed
  - The output tells what changed for which agents, then the next steps

- Show the whole error of a failed release ([f836652](https://github.com/LouisMazel/relizy/commit/f836652))

  - The PR comment and the summary of the CI job give the step where the release stopped and its whole error, without the versions it did not release
  - They still list what already left the machine: the published packages, the pushed commit
  - The error of a hook names it: `before:publish hook failed: ...`

### 📦 Build

- **core:** Upgrade @maz-ui/node to 5.7.0-beta.0 ([c98f13d](https://github.com/LouisMazel/relizy/commit/c98f13d))

### ❤️ Contributors

- LouisMazel ([@LouisMazel](https://github.com/LouisMazel))

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
