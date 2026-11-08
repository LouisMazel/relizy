# MCP server

Details of `src/mcp/`, loaded on demand.

`relizy mcp` (`src/mcp/`) is a read-only MCP server for AI coding agents, loaded on demand (`await import('./mcp')` in `cli.ts`, its SDK is inlined in that chunk by `build.config.ts`):

- **Tools** (`src/mcp/tools/`): `preview_release` and `preview_changelog` (built on `planBumps()` of `bump.ts`, which plans without confirmation nor write, and `generateChangelog()`), `lint_commit`, `get_project`, `get_config_option`, `search_docs`, `get_doc`, `check_migration` (what to change to upgrade from relizy 1, see `docs/src/guide/migration-v2.md`). Each returns markdown; a `ToolInputError` is an error the agent can fix.
- **Guarantees** (`src/mcp/runtime.ts`): the reporters of the logger are replaced so stdout only carries the protocol and the logs come back as notes; `loadProjectConfig()` removes the hooks and never prompts. Never call `bump()`/`release()` from the server.
- **Docs bundle** (`agent-docs/`, gitignored, shipped in the package): generated from `docs/src` and `src/types.ts` (config reference, extracted with oxc) by `src/mcp/knowledge/generate.ts`, at each build, test run and `success:bump` of the release. A renamed doc page cited by the server, an undocumented config key or a CLI command without its page fails `knowledge.spec.ts`.
- **Agents setup**: `relizy mcp init` and the `init` step use `setupAgents()` of `@maz-ui/node` with `RELIZY_AGENTS_TOOL` and the rules of `src/mcp/content/rules.md`. `relizy mcp update` (the `prepare` script added by init) only rewrites the existing relizy rules whose content changed, never creates one: `findOutdatedRules()` drives it and the outdated warnings (CLI, MCP instructions, `get_project`).
