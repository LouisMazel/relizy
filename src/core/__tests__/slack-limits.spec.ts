import type { PackageBumpEntry } from '../packages'
import { validateSlackBlocks } from '../../../tests/slack-block-kit'
import { formatSlackMessage } from '../slack'

vi.mock('../social', () => ({
  extractChangelogSummary: vi.fn((changelog: string, opts?: { maxLength?: number }) => changelog.substring(0, opts?.maxLength ?? 2500)),
}))

function commit(index: number, body = ''): string {
  const line = `- **scope-${index % 7}:** ⚠️  Change number ${index} with \`code\` and a link ([#${index}](https://github.com/org/repo/pull/${index}))`
  const indentedBody = body.split('\n').map(bodyLine => `  ${bodyLine}`).join('\n')
  return body ? `${line}\n\n${indentedBody}\n` : line
}

const NASTY_BODY = [
  'A paragraph hard-wrapped at seventy-two columns, with <html> & "quotes",',
  'a [relative link](./docs/README.md), an [anchor](#usage), an autolink https://example.com/a?b=1&c=2',
  'and a [mail](mailto:dev@example.com).',
  '',
  '- nested **bold** item',
  '  - deeper _italic_ item',
  '    - deepest ~~strike~~ item',
  '      - level 4',
  '        - level 5',
  '          - level 6',
  '            - level 7',
  '              - level 8',
  '                - level 9',
  '                  - level 10',
  '1. ordered',
  '2. list',
  '- [x] done task',
  '- [ ] open task',
  '- ',
  '',
  '```diff',
  '- removed',
  '+ added',
  '```',
  '',
  '> a blockquote',
  '',
  '| a | b |',
  '| - | - |',
  '| 1 | 2 |',
  '',
  '# A heading in a body',
  '',
  '<details><summary>raw html</summary>content</details>',
  '',
  '![image](https://example.com/image.png) ![relative image](./image.png)',
  '',
  '---',
  '',
  'Footnote[^1].',
  '',
  '[^1]: The footnote.',
].join('\n')

function hugeChangelog({ sections = 6, commitsPerSection = 80, body = NASTY_BODY }: { sections?: number, commitsPerSection?: number, body?: string } = {}): string {
  return Array.from({ length: sections }, (_, section) => {
    const commits = Array.from({ length: commitsPerSection }, (_, index) => commit(section * commitsPerSection + index, index % 3 === 0 ? body : ''))
    return `### 🚀 Section ${section}\n\n${commits.join('\n')}`
  }).join('\n\n')
}

function independentChangelog(packageCount: number): string {
  return Array.from({ length: packageCount }, (_, index) => `## @scope/package-${index}@1.${index}.0\n\n### 🩹 Fixes\n\n${commit(index, NASTY_BODY)}`).join('\n\n')
}

const manyPackages: PackageBumpEntry[] = Array.from({ length: 400 }, (_, index) => ({
  name: `@very-long-organization-scope/package-with-a-long-name-${index}`,
  version: '10.20.30',
  oldVersion: '10.20.29',
  newVersion: '10.20.30',
  hasTransition: true,
}) as PackageBumpEntry)

const manyContributors = Array.from({ length: 300 }, (_, index) => `Contributor With A Long Name ${index}`)

const SCENARIOS: Array<{ name: string, input: Parameters<typeof formatSlackMessage>[0] }> = [
  { name: 'a huge changelog with nasty bodies', input: { projectName: 'big-project', version: '12.0.0', changelog: hugeChangelog() } },
  { name: 'an independent release of 60 packages', input: { projectName: 'monorepo', version: '60 packages', changelog: independentChangelog(60) } },
  { name: 'hundreds of packages and contributors', input: { projectName: 'monorepo', version: '400 packages', changelog: hugeChangelog({ sections: 2 }), packages: manyPackages, contributors: manyContributors } },
  { name: 'a single 50k chars commit body', input: { projectName: 'p', version: '1.0.0', changelog: commit(1, 'word '.repeat(10000)) } },
  { name: 'a 20k chars code block', input: { projectName: 'p', version: '1.0.0', changelog: commit(1, `\`\`\`\n${'x = 1\n'.repeat(4000)}\`\`\``) } },
  { name: 'only headings', input: { projectName: 'p', version: '1.0.0', changelog: '### Features\n\n### Fixes' } },
  { name: 'an empty changelog', input: { projectName: 'p', version: '1.0.0', changelog: '' } },
  { name: 'an emoji project name cut at the header limit', input: { projectName: `x${'🚀'.repeat(200)}`, version: '1.0.0', changelog: hugeChangelog({ sections: 1, commitsPerSection: 3 }) } },
  { name: 'a single emoji-only body cut at the section limit', input: { projectName: 'p', version: '1.0.0', changelog: `- ${'🎉'.repeat(5000)}`, template: '{{changelog}}' } },
  { name: 'a long project name', input: { projectName: 'x'.repeat(300), version: '1.0.0', changelog: hugeChangelog({ sections: 1, commitsPerSection: 3 }) } },
  { name: 'a large postMaxLength', input: { projectName: 'p', version: '1.0.0', changelog: hugeChangelog(), postMaxLength: 100000 } },
  { name: 'a tiny postMaxLength', input: { projectName: 'p', version: '1.0.0', changelog: hugeChangelog(), postMaxLength: 10 } },
  { name: 'every surrounding block', input: { projectName: 'p', version: '1.0.0', changelog: hugeChangelog(), packages: manyPackages.slice(0, 20), contributors: manyContributors.slice(0, 20), releaseUrl: 'https://example.com/r', changelogUrl: 'https://example.com/c' } },
  { name: 'a template', input: { projectName: 'p', version: '1.0.0', changelog: hugeChangelog(), template: '*{{projectName}} {{newVersion}}*\n{{changelog}}\n{{packages}}\n{{contributors}}\n{{releaseUrl}}', packages: manyPackages, contributors: manyContributors, releaseUrl: 'https://example.com/r' } },
]

describe('Given the Block Kit validator', () => {
  it('Then reports the payloads Slack rejects', () => {
    const errors = validateSlackBlocks([
      { type: 'header', text: { type: 'plain_text', text: 'x'.repeat(151) } },
      { type: 'section', text: { type: 'mrkdwn', text: 'x'.repeat(3001) } },
      {
        type: 'rich_text',
        elements: [
          { type: 'rich_text_section', elements: [{ type: 'text', text: '' }] },
          { type: 'rich_text_list', style: 'bullet', indent: 9, elements: [{ type: 'rich_text_list', elements: [] }] },
          { type: 'rich_text_quote', elements: [{ type: 'link', url: './README.md' }] },
          { type: 'rich_text_preformatted', language: 'ts', elements: [{ type: 'text', text: 'x', style: { color: true } }] },
        ],
      },
    ])

    expect(errors).toEqual([
      'blocks[0]: header text must be 1 to 150 characters (151)',
      'blocks[1]: section text must be 1 to 3000 characters (3001)',
      'blocks[2].elements[0].elements[0]: text must be more than 0 characters',
      'blocks[2].elements[1]: indent must be an integer between 0 and 8',
      'blocks[2].elements[1].elements[0]: list items must be rich_text_section',
      'blocks[2].elements[1].elements[0].elements: inline elements must be a non-empty array',
      'blocks[2].elements[2].elements[0]: link url must be absolute, got ./README.md',
      'blocks[2].elements[3].elements[0]: invalid style color',
      'blocks[2].elements[3]: invalid additional property language',
    ])
  })
})

describe('Given formatSlackMessage against the Slack limits', () => {
  describe.each(['summary', 'full'] as const)('When the changelog format is %s', (changelogFormat) => {
    it.each(SCENARIOS)('Then produces a valid message for $name', ({ input }) => {
      const blocks = formatSlackMessage({ ...input, changelogFormat })

      expect(validateSlackBlocks(blocks)).toEqual([])
    })
  })

  describe('When the full changelog is truncated', () => {
    it('Then announces the omitted changes', () => {
      const blocks = formatSlackMessage({ projectName: 'p', version: '1.0.0', changelog: hugeChangelog(), changelogFormat: 'full' })

      expect(JSON.stringify(blocks)).toMatch(/… and \d+ more changes/)
    })

    it('Then keeps the surrounding blocks', () => {
      const blocks = formatSlackMessage({
        projectName: 'p',
        version: '1.0.0',
        changelog: hugeChangelog(),
        changelogFormat: 'full',
        packages: manyPackages,
        contributors: manyContributors,
        releaseUrl: 'https://example.com/r',
      })

      expect(blocks[0].type).toBe('header')
      expect(blocks.slice(-4).map((block: any) => block.type)).toEqual(['section', 'section', 'divider', 'actions'])
      expect(blocks.at(-4).text.text).toMatch(/_… and \d+ more packages_$/)
      expect(blocks.at(-3).text.text).toMatch(/_… and \d+ more contributors_$/)
    })
  })
})
