---
title: mcp
description: Start the Relizy MCP server for AI coding agents, and set up the agents of a project with its rules.
keywords: relizy mcp, mcp server, model context protocol, ai agents, claude code, cursor, copilot, codex, relizy mcp init
category: CLI Reference
tags: [cli, mcp, ai, agents]
---

# {{ $frontmatter.title }}

{{ $frontmatter.description }}

See the [AI agents guide](/guide/ai-agents) for what the server gives to your agents.

## Usage

```bash
relizy mcp [serve] [--cwd <dir>]   # Start the MCP server on stdio
relizy mcp init [options]          # Configure the AI agents of the project
```

## relizy mcp

Starts the MCP server on stdio: the command your AI agent runs, you do not run it yourself. stdout only carries the protocol (no banner, no log).

```bash
relizy mcp
```

### --cwd

Root of the project, the current directory by default:

```bash
relizy mcp --cwd apps/web
```

## relizy mcp init

Configures the AI agents of the project for Relizy:

- the **rules**: how to commit and release with Relizy, in `.claude/rules/relizy.md` for Claude Code and in a section of `AGENTS.md` (Codex, Cursor, Copilot, Windsurf, Zed, Gemini...);
- the **MCP server**: a `relizy` entry in `.mcp.json` (Claude Code), `.cursor/mcp.json` and `.vscode/mcp.json` (GitHub Copilot).

```bash
relizy mcp init
```

It configures the agents detected in the project (`CLAUDE.md`, `.claude/`, `AGENTS.md`, `.cursor/`, `.vscode/mcp.json`...), or Claude Code and `AGENTS.md` when none is detected. When the project installs Relizy, the MCP configs start the installed version through its package manager (`pnpm exec relizy mcp`); otherwise they run `npx -y relizy@<version> mcp`.

It only writes what it owns: an existing file it did not generate, rules edited by hand and MCP entries written by hand are left untouched. Run it again after each upgrade of Relizy to update the rules: it is idempotent.

### --targets

Comma-separated agents to configure: `claude`, `agents-md`, `cursor`, `vscode`.

```bash
relizy mcp init --targets claude,cursor
```

### --no-rules

Only register the MCP server.

### --no-mcp

Only write the rules.

### --remove

Remove what `relizy mcp init` added (other tools, such as maz-ui, keep their own rules and servers).

```bash
relizy mcp init --remove
```

### --dry-run

The global option: show the changes without writing them.

```bash
relizy mcp init --dry-run
```
