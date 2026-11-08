---
title: AI Agents (MCP)
description: Give your AI coding agents (Claude Code, Cursor, Copilot, Codex...) the release preview, the commit linting and the docs of the installed Relizy, through its MCP server.
metaDescription: 'Give your AI coding agents (Claude Code, Cursor, Copilot, Codex) the release preview, commit linting and docs of Relizy through its MCP server.'
keywords: relizy mcp, mcp server, model context protocol, ai agents, claude code, cursor, github copilot, codex, release preview, commitlint
category: Guide
tags: [guide, ai, mcp, agents]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

An agent cannot guess what the next release will do: which packages, which versions, why, which changelog. Relizy ships an [MCP](https://modelcontextprotocol.io) server that answers these questions from your repository, with the docs and the config reference of the version you installed.

## Quick Start

```bash
npx relizy mcp init
```

It writes the Relizy rules for your agents and registers the MCP server in their configs: see [`relizy mcp init`](./../cli/mcp.md#relizy-mcp-init) for the files and the options. `relizy init` offers the same step when the project already uses an AI agent.

Install Relizy as a devDependency of the project: the agents then start the installed version in about a second, at the version of your lockfile.

## What the Agents Get

| Tool                | What it answers                                                                                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preview_release`   | What the next release bumps: the version of each package and group, and why (its commits, a bumped dependency, a peer range rejecting the new version, another version group)                                                                       |
| `preview_changelog` | The changelog entries the release would write                                                                                                                                                                                                       |
| `lint_commit`       | Lints a message before committing: problems and fixes, suggested header, bump, packages and changelog entry. Also lints the commits of a branch                                                                                                     |
| `get_project`       | Config files, version mode or groups, packages, last tag, steps of the release and resolved config (secrets masked)                                                                                                                                 |
| `get_config_option` | Type, default and description of any option of `relizy.config.ts`                                                                                                                                                                                   |
| `search_docs`       | Search in the guides, the config, the CLI and commitlint docs                                                                                                                                                                                       |
| `get_doc`           | Read a page of the docs, or some of its sections                                                                                                                                                                                                    |
| `check_migration`   | What to change to upgrade from Relizy 1: the dependency, the removed and renamed options, the social templates, the version groups, the hooks, the CLI calls of the scripts and the CI, and the code calling the API, file by file and line by line |

It also provides prompts: `write-commit`, `prepare-release`, `setup-relizy`, `migrate-to-v2` and `setup-ci`. To upgrade from Relizy 1, ask your agent for `migrate-to-v2`: it reads the [migration guide](./migration-v2.md), runs `check_migration` and proposes the changes.

## Guarantees

- **Read-only**: the tools never write a file, commit, tag, push nor publish. The rules ask the agents to run `relizy release` (and the other writing commands) only with your approval, and `--dry-run` otherwise.
- **No hook**: the hooks of your config never run in the MCP server.
- **No network by default**: the local tags are used (`fetchTags: true` runs `git fetch --tags`), and the changelog previews leave the contributors out (`contributors: true` may query the GitHub API).
- **Version-matched**: the docs, the config reference and the rules come from the installed Relizy. Each release of Relizy ships them up to date.

## Manual Configuration

`relizy mcp init` writes these files for you. To configure another agent, register the `relizy mcp` command:

::: code-group

```json [.mcp.json (Claude Code)]
{
  "mcpServers": {
    "relizy": {
      "type": "stdio",
      "command": "pnpm",
      "args": ["exec", "relizy", "mcp"]
    }
  }
}
```

```json [.cursor/mcp.json]
{
  "mcpServers": {
    "relizy": {
      "command": "npx",
      "args": ["--no-install", "relizy", "mcp"]
    }
  }
}
```

```json [.vscode/mcp.json (Copilot)]
{
  "servers": {
    "relizy": {
      "type": "stdio",
      "command": "npx",
      "args": ["--no-install", "relizy", "mcp"]
    }
  }
}
```

```toml [~/.codex/config.toml]
[mcp_servers.relizy]
command = "npx"
args = [
  "-y",
  "relizy",
  "mcp"
]
```

:::

Without Relizy in the dependencies of the project, use `npx -y relizy@<version> mcp`: a pinned version starts faster than `relizy@latest`, which queries the registry at every start.

## Keeping the Agents Up to Date

The MCP server always serves the installed Relizy: upgrading Relizy upgrades the tools and the docs. The rules of the project are files in the repository, so they are updated by [`relizy mcp update`](./../cli/mcp.md#relizy-mcp-update) (or `relizy mcp init`, which also writes the missing files). When their content is older than the installed Relizy, `get_project` and the instructions of the MCP server tell the agent to propose it, and the CLI prints one line outside the CI.

To update them at each install, the root `package.json` runs `relizy mcp update` in its `prepare` script: `relizy mcp init` adds it (except with `--no-prepare`), and `relizy init` asks before adding it. To add it by hand:

```json
{
  "scripts": {
    "prepare": "relizy mcp update"
  }
}
```

`relizy mcp update` only rewrites the rule files that already exist: a rule you deleted (or an `AGENTS.md` without the Relizy section) is never recreated, and the MCP config you may have changed is never touched. With an existing `prepare` script, append the command: `"prepare": "husky && relizy mcp update"`. The files are only rewritten when the rules change, so a new release of Relizy that does not change them leaves the repository clean.

`prepare` also runs when you install without the devDependencies (`npm ci --omit=dev`, `pnpm install --prod`), where the `relizy` command is missing: add `--ignore-scripts` to these installs.

Rules you edited by hand are no longer updated: delete the file (or the `AGENTS.md` section) to get the new ones.

## The Rules

The rules written by `relizy mcp init`:

<!--@include: ./../../../src/mcp/content/rules.md-->

## Troubleshooting

- **The agent does not see the tools**: restart it after `relizy mcp init`, and check that `relizy mcp` starts from the root of the project (`npx relizy mcp` should wait for input without printing anything).
- **"The docs bundle of relizy is missing"**: reinstall Relizy. In the Relizy repository, run `pnpm build`.
- **A monorepo whose apps are released from a subfolder**: start the server with `relizy mcp --cwd <folder>`.
