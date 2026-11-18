import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const SKILL = {
  name: 'relizy',
  description: 'Work in a project released with relizy: Conventional Commits that drive the versions and changelogs, preview of the next release, relizy config and monorepo version modes, and what never to run without the approval of the user.',
}

function write(outDir: string, path: string, content: string) {
  const file = resolve(outDir, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

/**
 * Agent Skills discovery index (https://github.com/cloudflare/agent-skills-discovery-rfc): the rules that
 * `relizy mcp init` writes in the projects, published as a skill
 */
export function writeAgentSkills(outDir: string, siteUrl: string) {
  const rules = readFileSync(new URL('../../packages/relizy/src/core/mcp/content/rules.md', import.meta.url), 'utf8').trim()
  const skill = [
    '---',
    `name: ${SKILL.name}`,
    // Quoted: the description contains ": "
    `description: ${JSON.stringify(SKILL.description)}`,
    '---',
    '',
    '# relizy',
    '',
    `The docs of relizy: ${siteUrl}/llms.txt (index) and ${siteUrl}/llms-full.txt (all the pages).`,
    '',
    rules,
    '',
  ].join('\n')
  const skillPath = `.well-known/agent-skills/${SKILL.name}/SKILL.md`

  write(outDir, skillPath, skill)
  write(outDir, '.well-known/agent-skills/index.json', `${JSON.stringify({
    $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    skills: [
      {
        name: SKILL.name,
        type: 'skill-md',
        description: SKILL.description,
        url: `${siteUrl}/${skillPath}`,
        digest: `sha256:${createHash('sha256').update(skill).digest('hex')}`,
      },
    ],
  }, null, 2)}\n`)
}

/**
 * ARD manifest (https://agenticresourcediscovery.org): the skill and the docs. The MCP server of relizy runs
 * locally (`relizy mcp`, stdio) and ARD only describes remote resources
 */
export function writeAiCatalog(outDir: string, siteUrl: string) {
  const domain = new URL(siteUrl).host

  write(outDir, '.well-known/ai-catalog.json', `${JSON.stringify({
    specVersion: '1.0',
    host: { displayName: 'Relizy', identifier: `did:web:${domain}` },
    entries: [
      {
        identifier: `urn:air:${domain}:skill:${SKILL.name}`,
        displayName: 'relizy skill',
        description: SKILL.description,
        type: 'application/agent-skills+md',
        url: `${siteUrl}/.well-known/agent-skills/${SKILL.name}/SKILL.md`,
        representativeQueries: [
          'how do I write a commit message for a project released with relizy',
          'preview the next release of a monorepo before bumping',
          'which version mode should a monorepo use with relizy',
        ],
      },
      {
        identifier: `urn:air:${domain}:docs:llms-txt`,
        displayName: 'Relizy documentation',
        description: 'Index of the docs of relizy in markdown: guides, configuration, CLI, commit linting and programmatic API.',
        type: 'text/markdown',
        url: `${siteUrl}/llms.txt`,
        representativeQueries: [
          'configure relizy to release a pnpm monorepo',
          'publish to npm and create GitHub releases from CI with relizy',
          'generate a changelog from Conventional Commits',
        ],
      },
    ],
  }, null, 2)}\n`)
}
