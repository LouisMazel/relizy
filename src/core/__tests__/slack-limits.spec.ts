import type { SlackReleaseSection } from '../../types'
import type { PackageBumpEntry } from '../packages'
import { socialVariables } from '../../../tests/mocks'
import { validateSlackBlocks } from '../../../tests/slack-block-kit'
import { formatSlackMessage } from '../slack'
import { richTextToPlainText } from '../slack-markdown'

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

const SCENARIOS: Array<{ name: string, input: Parameters<typeof formatSlackMessage>[0] & { changelog: string } }> = [
  { name: 'a huge changelog with nasty bodies', input: { changelog: hugeChangelog(), variables: socialVariables({ projectName: 'big-project', newVersion: '12.0.0' }) } },
  { name: 'an independent release of 60 packages', input: { changelog: independentChangelog(60), variables: socialVariables({ projectName: 'monorepo', newVersion: '', releaseTitle: 'New releases of monorepo' }) } },
  { name: 'hundreds of packages and contributors', input: { changelog: hugeChangelog({ sections: 2 }), packages: manyPackages, contributors: manyContributors, variables: socialVariables({ projectName: 'monorepo', newVersion: '', releaseTitle: 'New releases of monorepo' }) } },
  { name: 'a single 50k chars commit body', input: { changelog: commit(1, 'word '.repeat(10000)), variables: socialVariables({ projectName: 'p', newVersion: '1.0.0' }) } },
  { name: 'a 20k chars code block', input: { changelog: commit(1, `\`\`\`\n${'x = 1\n'.repeat(4000)}\`\`\``), variables: socialVariables({ projectName: 'p', newVersion: '1.0.0' }) } },
  { name: 'only headings', input: { changelog: '### Features\n\n### Fixes', variables: socialVariables({ projectName: 'p', newVersion: '1.0.0' }) } },
  { name: 'an empty changelog', input: { changelog: '', variables: socialVariables({ projectName: 'p', newVersion: '1.0.0' }) } },
  { name: 'an emoji project name cut at the header limit', input: { changelog: hugeChangelog({ sections: 1, commitsPerSection: 3 }), variables: socialVariables({ projectName: `x${'🚀'.repeat(200)}`, newVersion: '1.0.0' }) } },
  { name: 'a single emoji-only body cut at the section limit', input: { changelog: `- ${'🎉'.repeat(5000)}`, template: '{{changelog}}', variables: socialVariables({ projectName: 'p', newVersion: '1.0.0' }) } },
  { name: 'a long project name', input: { changelog: hugeChangelog({ sections: 1, commitsPerSection: 3 }), variables: socialVariables({ projectName: 'x'.repeat(300), newVersion: '1.0.0' }) } },
  { name: 'a large postMaxLength', input: { changelog: hugeChangelog(), postMaxLength: 100000, variables: socialVariables({ projectName: 'p', newVersion: '1.0.0' }) } },
  { name: 'a tiny postMaxLength', input: { changelog: hugeChangelog(), postMaxLength: 10, variables: socialVariables({ projectName: 'p', newVersion: '1.0.0' }) } },
  { name: 'every surrounding block', input: { changelog: hugeChangelog(), packages: manyPackages.slice(0, 20), contributors: manyContributors.slice(0, 20), variables: socialVariables({ projectName: 'p', newVersion: '1.0.0', releaseUrl: 'https://example.com/r', changelogUrl: 'https://example.com/c' }) } },
  { name: 'a template', input: { changelog: hugeChangelog(), template: '*{{projectName}} {{newVersion}}*\n{{changelog}}\n{{packages}}\n{{contributors}}\n{{releaseUrl}}', packages: manyPackages, contributors: manyContributors, variables: socialVariables({ projectName: 'p', newVersion: '1.0.0', releaseUrl: 'https://example.com/r' }) } },
]

const formatted = new Map<object, Partial<Record<'summary' | 'full', ReturnType<typeof formatSlackMessage>>>>()

/**
 * The message of a scenario, formatted once per format: several tests check it,
 * and formatting a huge changelog is slow
 */
function formatOnce(input: Parameters<typeof formatSlackMessage>[0], changelogFormat: 'summary' | 'full'): ReturnType<typeof formatSlackMessage> {
  const byFormat = formatted.get(input) ?? {}
  formatted.set(input, byFormat)
  byFormat[changelogFormat] ??= formatSlackMessage({ ...input, changelogFormat })
  return byFormat[changelogFormat]
}

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

const SEVERAL_VERSIONS = socialVariables({ projectName: 'monorepo', newVersion: '', releaseTitle: 'New releases of monorepo' })

function independentSection(packageCount: number, body = commit(1, NASTY_BODY)): SlackReleaseSection {
  return {
    title: 'Tooling',
    packages: Array.from({ length: packageCount }, (_, index) => ({ name: `@scope/package-${index}`, oldVersion: '1.0.0', newVersion: `1.${index + 1}.0`, changelog: `### 🩹 Fixes\n\n${body}` })),
  }
}

const SECTION_SCENARIOS: Array<{ name: string, input: Parameters<typeof formatSlackMessage>[0] & { changelog: SlackReleaseSection[] } }> = [
  { name: 'a huge root changelog and a small group', input: { changelog: [{ title: 'Maz UI 7.0.0', changelog: hugeChangelog({ sections: 2 }) }, independentSection(2)], variables: SEVERAL_VERSIONS } },
  { name: 'an independent group of 80 packages', input: { changelog: [{ title: 'Maz UI 7.0.0', changelog: hugeChangelog({ sections: 1 }) }, independentSection(80)], variables: SEVERAL_VERSIONS } },
  { name: 'many groups', input: { changelog: Array.from({ length: 30 }, () => independentSection(3)), variables: SEVERAL_VERSIONS, packages: manyPackages, contributors: manyContributors } },
  { name: 'a tiny postMaxLength', input: { changelog: [{ title: 'Maz UI 7.0.0', changelog: hugeChangelog({ sections: 2 }) }, independentSection(5)], postMaxLength: 50, variables: SEVERAL_VERSIONS } },
  { name: 'a template', input: { changelog: [{ title: 'Maz UI 7.0.0', changelog: hugeChangelog({ sections: 2 }) }, independentSection(5)], template: '*{{releaseTitle}}*\n{{changelog}}', variables: SEVERAL_VERSIONS } },
]

describe('Given formatSlackMessage against the Slack limits', () => {
  describe.each(['summary', 'full'] as const)('When the changelog of several versions is in %s format', (changelogFormat) => {
    it.each(SECTION_SCENARIOS)('Then produces a valid message for $name', ({ input }) => {
      const blocks = formatOnce(input, changelogFormat)

      expect(validateSlackBlocks(blocks)).toEqual([])
    })

    it('Then keeps the title of every section and the version of every package, whatever the size of the others', () => {
      const blocks = formatSlackMessage({ changelog: [{ title: 'Maz UI 7.0.0', changelog: hugeChangelog({ sections: 2 }) }, independentSection(3)], changelogFormat, variables: SEVERAL_VERSIONS })

      const text = blocks.map((block: any) => block.type === 'rich_text' ? richTextToPlainText(block) : block.text?.text ?? '').join('\n')
      expect(text).toContain('Maz UI 7.0.0')
      expect(text).toContain('Tooling')
      if (changelogFormat === 'summary') {
        for (const index of [0, 1, 2]) {
          expect(text).toContain(`*@scope/package-${index}* \`1.0.0\` → \`1.${index + 1}.0\``)
        }
      }
    })
  })

  describe.each(['summary', 'full'] as const)('When the changelog format is %s', (changelogFormat) => {
    it.each(SCENARIOS)('Then produces a valid message for $name', ({ input }) => {
      const blocks = formatOnce(input, changelogFormat)

      expect(validateSlackBlocks(blocks)).toEqual([])
    })

    it.each(SCENARIOS.filter(({ input }) => input.changelog.split('\n').some(line => !line.startsWith('#') && /\w/.test(line)) && (input.postMaxLength ?? Infinity) >= 100))('Then shows the beginning of the changelog for $name', ({ input }) => {
      const blocks = formatOnce(input, changelogFormat)

      const changelogText = blocks
        .map((block: any) => block.type === 'rich_text' ? richTextToPlainText(block) : block.type === 'section' ? block.text.text : '')
        .join('\n')
      // Never a message reduced to the omitted changes note
      expect(changelogText.replace(/_?… and \d+ more changes?_?/g, '').trim().length).toBeGreaterThan(20)
    })
  })

  describe('When a realistic postMaxLength bounds the full changelog', () => {
    it.each([1000, 2000])('Then fills the changelog up to %i characters, commit bodies included', (postMaxLength) => {
      const blocks = formatSlackMessage({ changelog: hugeChangelog(), changelogFormat: 'full', postMaxLength, variables: socialVariables({ projectName: 'p', newVersion: '1.0.0' }) })

      const text = blocks.filter((block: any) => block.type === 'rich_text').map(richTextToPlainText).join('\n\n')
      expect(text.length).toBeLessThanOrEqual(postMaxLength)
      expect(text.length).toBeGreaterThan(postMaxLength * 0.95)
      expect(text).toContain('> A paragraph hard-wrapped at seventy-two columns')
      expect(text).toMatch(/…\n… and \d+ more changes$/)
    })

    it('Then fills the message up to the Slack payload limit when it is reached first', () => {
      const blocks = formatSlackMessage({ changelog: hugeChangelog(), changelogFormat: 'full', postMaxLength: 5000, variables: socialVariables({ projectName: 'p', newVersion: '1.0.0' }) })

      const text = blocks.filter((block: any) => block.type === 'rich_text').map(richTextToPlainText).join('\n\n')
      expect(text.length).toBeLessThan(5000)
      expect(JSON.stringify(blocks).length).toBeGreaterThan(10500)
      expect(text).toMatch(/…\n… and \d+ more changes$/)
    })
  })

  describe('When a single list line exceeds the section limit', () => {
    it('Then replaces it with the omitted count', () => {
      const blocks = formatSlackMessage({ changelog: '- a', contributors: ['x'.repeat(4000)], variables: socialVariables({ projectName: 'p', newVersion: '1.0.0' }) })

      expect(blocks.find((block: any) => block.text?.text?.startsWith('*❤️ Contributors*')).text.text).toBe('*❤️ Contributors*\n\n_… and 1 more contributors_')
    })
  })

  describe('When the full changelog is truncated', () => {
    it('Then announces the omitted changes', () => {
      const blocks = formatSlackMessage({ changelog: hugeChangelog(), changelogFormat: 'full', variables: socialVariables({ projectName: 'p', newVersion: '1.0.0' }) })

      expect(JSON.stringify(blocks)).toMatch(/… and \d+ more changes/)
    })

    it('Then keeps the surrounding blocks', () => {
      const blocks = formatSlackMessage({
        changelog: hugeChangelog(),
        changelogFormat: 'full',
        packages: manyPackages,
        contributors: manyContributors,
        variables: socialVariables({ projectName: 'p', newVersion: '1.0.0', releaseUrl: 'https://example.com/r' }),
      })

      expect(blocks[0].type).toBe('header')
      expect(blocks.slice(-4).map((block: any) => block.type)).toEqual(['section', 'section', 'divider', 'actions'])
      expect(blocks.at(-4).text.text).toMatch(/_… and \d+ more packages_$/)
      expect(blocks.at(-3).text.text).toMatch(/_… and \d+ more contributors_$/)
    })
  })
})
