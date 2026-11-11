import type { ServerContext } from './context'

import { findOutdatedRules } from './agents'

/** Claude Code truncates the instructions of a server to 4096 characters */
export const MAX_INSTRUCTIONS_LENGTH = 4096

export function buildInstructions(context: ServerContext): string {
  const outdated = findOutdatedRules(context.cwd)
  const outdatedNote = outdated.length > 0
    ? `\n- The relizy rules of this project are outdated (${outdated.join(', ')}): propose to run \`relizy mcp update\`.`
    : ''

  return `relizy ${context.version}: release automation of this project (versions, changelogs, git tags, npm publishing, GitHub/GitLab releases, social posts) computed from Conventional Commits, for single packages and monorepos (unified, selective and independent version modes, version groups). These tools read the project and the docs of the installed relizy: they never write, commit, tag, push nor publish, and never run the hooks of the config.

Use them whenever you commit, prepare or explain a release, or change the relizy config:
1. lint_commit({ message }) BEFORE every commit: problems with their fix, a suggested header, the bump the commit triggers and its changelog entry. lint_commit({ from }) checks the commits of a branch.
2. preview_release() to know what the next release bumps and why (commits, dependents, peer ranges, version groups), then preview_changelog() for the changelog entries. Never guess a version.
3. get_project() for the config files, version mode, groups and packages; get_config_option({ path }) BEFORE writing or changing an option of relizy.config.ts (never invent one); search_docs("<need>") and get_doc({ id }) for the guides (CI, canary, prerelease, private projects...).
4. Code using @relizy/core: its API reference (signatures, options, examples by domain) is in the docs: search_docs("<function or need>"), then get_doc({ id: "core/<domain>", sections: ["<name>"] }) (core/overview lists the domains).

Rules:
- Never run relizy release, bump, publish, changelog, provider-release, social, pr-comment nor merge-preview without the explicit approval of the user: they write, commit, tag, push, publish or comment. Use --dry-run to show what they would do. Most projects release from their CI.
- Never edit the versions of the package.json files, the CHANGELOG.md files nor the release tags by hand: relizy computes them from the commits.
- One package (or one concern) per commit in a monorepo: the files of a commit decide the packages it bumps.
- Set up a project with \`relizy init\` (\`--yes\` without questions) and the agents with \`relizy mcp init\`.
- Upgrading from relizy 1: check_migration() lists what to change (config, templates, hooks, code), with get_doc({ id: "guide/migration-v2" }).${outdatedNote}`
}
