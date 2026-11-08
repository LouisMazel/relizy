---
title: mcp
description: Start the Relizy MCP server for AI coding agents, and set up the agents of a project with its rules and its MCP server.
keywords: relizy mcp, relizy mcp init, relizy mcp update, mcp server, model context protocol, ai agents, claude code, cursor, copilot, codex, agents.md
category: CLI Reference
tags: [cli, mcp, ai, agents]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

What the server gives to your agents: [AI Agents (MCP)](./../guide/ai-agents.md).

## Usage

```bash
relizy mcp [serve] [--cwd <dir>]   # Start the MCP server on stdio
relizy mcp init [options]          # Configure the AI agents of the project
relizy mcp update                  # Update the rules already written, when they changed
```

## relizy mcp

Starts the MCP server on stdio (`serve` is the default subcommand). Your AI agent runs it, you do not: stdout only carries the protocol, without banner nor log.

### --cwd

Root of the project, the current directory by default:

```bash
relizy mcp --cwd apps/web
```

## relizy mcp init

Configures the AI agents of the project for Relizy:

- the **rules** (how to commit and release with Relizy): `.claude/rules/relizy.md` for Claude Code, and a `relizy` section of `AGENTS.md`, read by Codex, Cursor, Copilot and others;
- the **MCP server**: a `relizy` entry in `.mcp.json` (Claude Code), `.cursor/mcp.json` (Cursor) and `.vscode/mcp.json` (GitHub Copilot);
- the **`prepare` script** of the root `package.json`: [`relizy mcp update`](#relizy-mcp-update), appended to an existing script, so the rules are kept up to date at each install.

```bash
relizy mcp init
```

It configures the agents detected in the project (`.claude/`, `CLAUDE.md`, `.mcp.json`, `.cursor/`, `.vscode/mcp.json`, `.github/copilot-instructions.md`, `AGENTS.md`, `.codex/`, `.windsurf/`, `GEMINI.md`...), or Claude Code and `AGENTS.md` when none is detected.

The MCP entries start the installed Relizy through the package manager of the project (`pnpm exec relizy mcp`, `yarn run relizy mcp`, `bun x --no-install relizy mcp`, `npx --no-install relizy mcp`) when Relizy is a dependency of the project, else `npx -y relizy@<version> mcp`. Codex and Windsurf only read `AGENTS.md`: add the command printed by `relizy mcp init` to their MCP config.

It only writes what it owns: a file it did not generate, rules edited by hand and MCP entries written by hand are left untouched. The rules are only rewritten when their content changes: the `prepare` script updates them at each install (see [Keeping the Agents Up to Date](./../guide/ai-agents.md#keeping-the-agents-up-to-date)), or run `relizy mcp init` again after an upgrade.

### --targets

Comma-separated agents to configure: `claude`, `agents-md`, `cursor`, `vscode`.

```bash
relizy mcp init --targets claude,cursor
```

### --no-rules

Only register the MCP server.

### --no-mcp

Only write the rules.

### --no-prepare

Leave the `package.json` as is, without `relizy mcp update` in its `prepare` script. Also implied by `--no-rules`.

### --remove

Remove what `relizy mcp init` added, `relizy mcp update` of the `prepare` script included. The rules and servers of other tools (such as maz-ui) and the other commands of the `prepare` script are kept.

```bash
relizy mcp init --remove
```

### Dry Run

The global `--dry-run` lists the changes without writing them:

```bash
relizy mcp init --dry-run
```

## relizy mcp update

Rewrites the rules of Relizy that are already in the project (`.claude/rules/relizy.md`, the Relizy section of `AGENTS.md`) when their content changed with a new Relizy. Made for the `prepare` script (added by `relizy mcp init` and `relizy init`), so it prints nothing when everything is up to date, else one line per updated file.

```json
{
  "scripts": {
    "prepare": "relizy mcp update"
  }
}
```

With an existing `prepare` script, append the command: `"prepare": "husky && relizy mcp update"`.

What it does not do, unlike `relizy mcp init`:

- It never creates a file: a rule you deleted, or an `AGENTS.md` without the Relizy section, stays as is.
- It never touches the MCP config of the agents.
- It never rewrites rules edited by hand.
- It does not fail on a project without rules.

The global `--dry-run` lists the files it would update without writing them:

```bash
relizy mcp update --dry-run
```
