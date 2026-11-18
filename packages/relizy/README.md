<div align="center">
  <img src="https://raw.githubusercontent.com/LouisMazel/relizy/refs/heads/main/resources/logo.svg" alt="Relizy Logo" width="100">

  <h1>Relizy</h1>
  <p>
    <strong>
      Release automation for monorepos and single packages, driven by your commits.
    </strong>
  </p>

  <p>
    <a href="https://codecov.io/gh/LouisMazel/relizy">
      <img src="https://codecov.io/gh/LouisMazel/relizy/graph/badge.svg?token=KLWVQUN37O" alt="codecov" />
    </a>
    <a href="https://github.com/LouisMazel/relizy/actions/workflows/test-unit.yml">
      <img src="https://github.com/LouisMazel/relizy/actions/workflows/test-unit.yml/badge.svg" alt="Unit Tests" />
    </a>
    <a href="https://www.npmjs.com/package/relizy">
      <img src="https://img.shields.io/npm/v/relizy.svg" alt="npm version" />
    </a>
    <a href="https://www.npmjs.com/package/relizy">
      <img src="https://img.shields.io/npm/dm/relizy.svg" alt="npm downloads" />
    </a>
  </p>

<a href="https://relizy.dev">Documentation</a>

</div>

---

![Relizy Illustration](./resources/relizy-illustration.jpeg)

Relizy reads your [Conventional Commits](https://www.conventionalcommits.org) and releases in one command: it computes the versions, writes the changelogs, commits and tags, publishes to npm, creates the GitHub or GitLab releases, comments the pull request and announces the release on Twitter, Slack and Microsoft Teams.

## Features

- **Monorepos and single packages**: `unified`, `selective` (one version, only the changed packages) and `independent` version modes, and [version groups](https://relizy.dev/guide/version-groups) to release several sets of packages, each with its mode, in one run.
- **Dependencies handled**: the packages depending on a bumped package are bumped too, including through peer dependencies whose published range would reject the new version, and pnpm/yarn/bun catalogs.
- **Changelogs** per package and at the root, optionally rewritten by AI for the release notes and the posts.
- **Publishing** to npm or any registry (several registries, 2FA, `workspace:` checks, publish order), with npm, pnpm, yarn and bun.
- **Prereleases and canary releases** (`--prerelease --preid beta`, `--canary` from any commit).
- **Private apps**: a project marked `"private": true` is versioned, tagged and released, never published.
- **CI ready**: the official GitHub Action (`relizy/action@v2`) and GitLab CI component (`gitlab.com/relizy/relizy/release@2`) release in one step, `relizy init` writes them, and relizy handles shallow clones, detached HEADs, the git identity and the push access by itself.
- **Release summary** in the terminal, the GitHub Actions run, the PR comment and JSON or dotenv reports.
- **[Merge preview](https://relizy.dev/guide/merge-preview)**: each pull request tells what its merge releases, and its check fails when the release of the merge would fail (`relizy merge-preview`).
- **Commit linting** with your config (`relizy commitlint`), a commitlint replacement.
- **MCP server** for AI coding agents (`relizy mcp`): release preview, commit linting, config reference and docs of the installed version.

## Quick Start

Relizy requires Node.js `^22.23.4 || ^24.22.1 || >=26.12.1`.

```bash
npx relizy init
```

`relizy init` adds relizy to your devDependencies, detects your packages, package manager and git provider, asks a few questions and writes `relizy.config.ts`. It also offers the release workflow of your CI (GitHub Actions or GitLab CI, with the relizy action or component), the commit-msg hook and the setup of your AI agents.

Then preview the next release and run it:

```bash
pnpm exec relizy release --dry-run
pnpm exec relizy release
```

The bump comes from the commits since the last release (`feat` is a minor, `fix` a patch, `!` a major), unless you force one with `--patch`, `--minor` or `--major`. See [Getting Started](https://relizy.dev/guide/getting-started).

A monorepo config, if you write it yourself:

```ts
import { defineConfig } from 'relizy'

export default defineConfig({
  monorepo: {
    versionMode: 'selective',
    packages: ['packages/*'],
  },
})
```

## Commit Linting

Lint the commit messages with the same parser, types and packages as your releases, and check the commit bodies as they will appear in your changelogs:

```bash
pnpm exec relizy commitlint --install  # writes the commit-msg hook
pnpm exec relizy commitlint            # lints the commits of the pull request in CI
```

See [Commit Linting](https://relizy.dev/commitlint/).

## AI Coding Agents

Give your AI agents what the next release will do and why, the commit linting of your config and the docs of the installed Relizy, through its read-only MCP server:

```bash
pnpm exec relizy mcp init  # rules for Claude Code and AGENTS.md, MCP server for Claude Code, Cursor and VS Code
```

See [AI Agents](https://relizy.dev/guide/ai-agents).

## Documentation

[relizy.dev](https://relizy.dev): [version modes](https://relizy.dev/guide/version-modes), [CI setup](https://relizy.dev/guide/ci-cd), [configuration reference](https://relizy.dev/config/overview), [CLI reference](https://relizy.dev/cli/commands), [programmatic API](https://relizy.dev/api/usage), and the [migration guide from v1](https://relizy.dev/guide/migration-v2).

## Contributing

Read the [Contributing Guide](CONTRIBUTING.md) for the development setup, the tests and the commit conventions.

## Credits

Relizy was inspired by [changelogen](https://github.com/unjs/changelogen).

## License

MIT
