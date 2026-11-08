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
  const rules = readFileSync(new URL('../../src/mcp/content/rules.md', import.meta.url), 'utf8').trim()
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
    skills: [{
      name: SKILL.name,
      type: 'skill-md',
      description: SKILL.description,
      url: `${siteUrl}/${skillPath}`,
      digest: `sha256:${createHash('sha256').update(skill).digest('hex')}`,
    }],
  }, null, 2)}\n`)
}
