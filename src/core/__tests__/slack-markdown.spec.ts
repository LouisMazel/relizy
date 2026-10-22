import { markdownToSlackMrkdwn, markdownToSlackRichText, richTextToPlainText, sliceSlackText } from '../slack-markdown'

function bulletList(count: number, label: string): string {
  return Array.from({ length: count }, (_, i) => `- ${label} ${i}`).join('\n')
}

const CHANGELOG = `### 🚀 Features

- **slack:** Add the full format ([#12](https://github.com/o/r/pull/12))

  Commit bodies are hard-wrapped
  at 72 columns.
  - first point with \`code\`
  - second _point_
  \`\`\`ts
  const a = 1
  \`\`\`
- Second feature

### 🩹 Fixes

- ⚠️  Fix a bug`

describe('Given markdownToSlackRichText function', () => {
  describe('When the changelog is empty', () => {
    it('Then returns no block', () => {
      expect(markdownToSlackRichText('  \n ')).toEqual([])
    })
  })

  describe('When rendering a changelog with commit bodies', () => {
    const blocks = markdownToSlackRichText(CHANGELOG)

    it('Then renders one block per section', () => {
      expect(blocks).toHaveLength(2)
      expect(blocks.every(block => block.type === 'rich_text')).toBe(true)
    })

    it('Then renders the section title in bold', () => {
      expect(blocks[0]?.elements[0]).toEqual({
        type: 'rich_text_section',
        elements: [{ type: 'text', text: '🚀 Features', style: { bold: true } }],
      })
    })

    it('Then renders the commit as a bullet with its scope and PR link', () => {
      expect(blocks[0]?.elements[1]).toEqual({
        type: 'rich_text_list',
        style: 'bullet',
        elements: [{
          type: 'rich_text_section',
          elements: [
            { type: 'text', text: 'slack:', style: { bold: true } },
            { type: 'text', text: ' Add the full format (' },
            { type: 'link', url: 'https://github.com/o/r/pull/12', text: '#12' },
            { type: 'text', text: ')' },
          ],
        }],
      })
    })

    it('Then renders body paragraphs as a quote with soft breaks joined', () => {
      expect(blocks[0]?.elements[2]).toEqual({
        type: 'rich_text_quote',
        elements: [{ type: 'text', text: 'Commit bodies are hard-wrapped at 72 columns.' }],
      })
    })

    it('Then renders body lists as an indented list with inline styles', () => {
      expect(blocks[0]?.elements[3]).toEqual({
        type: 'rich_text_list',
        style: 'bullet',
        indent: 1,
        elements: [
          { type: 'rich_text_section', elements: [{ type: 'text', text: 'first point with ' }, { type: 'text', text: 'code', style: { code: true } }] },
          { type: 'rich_text_section', elements: [{ type: 'text', text: 'second ' }, { type: 'text', text: 'point', style: { italic: true } }] },
        ],
      })
    })

    it('Then renders body code as a preformatted block without forwarding its language', () => {
      expect(blocks[0]?.elements[4]).toEqual({
        type: 'rich_text_preformatted',
        elements: [{ type: 'text', text: 'const a = 1' }],
      })
    })

    it('Then resumes the commit list after a body', () => {
      expect(blocks[0]?.elements[5]).toEqual({
        type: 'rich_text_list',
        style: 'bullet',
        elements: [{ type: 'rich_text_section', elements: [{ type: 'text', text: 'Second feature' }] }],
      })
    })

    it('Then keeps reserved characters unescaped', () => {
      const [block] = markdownToSlackRichText('- Support <T> & friends')
      expect(block?.elements[0]).toEqual({
        type: 'rich_text_list',
        style: 'bullet',
        elements: [{ type: 'rich_text_section', elements: [{ type: 'text', text: 'Support <T> & friends' }] }],
      })
    })
  })

  describe('When rendering other markdown constructs', () => {
    it('Then continues the numbering of an ordered list after a body', () => {
      const [block] = markdownToSlackRichText('1. first\n\n   body\n2. second')

      expect(block?.elements).toEqual([
        { type: 'rich_text_list', style: 'ordered', elements: [{ type: 'rich_text_section', elements: [{ type: 'text', text: 'first' }] }] },
        { type: 'rich_text_quote', elements: [{ type: 'text', text: 'body' }] },
        { type: 'rich_text_list', style: 'ordered', offset: 1, elements: [{ type: 'rich_text_section', elements: [{ type: 'text', text: 'second' }] }] },
      ])
    })

    it('Then merges consecutive body paragraphs into one quote', () => {
      const [block] = markdownToSlackRichText('- item\n\n  first paragraph\n\n  second paragraph')

      expect(block?.elements[1]).toEqual({
        type: 'rich_text_quote',
        elements: [{ type: 'text', text: 'first paragraph\n\nsecond paragraph' }],
      })
    })

    it('Then renders strikethrough, task items and bare links', () => {
      const [block] = markdownToSlackRichText('- [x] ~~old~~ see https://example.com')

      expect(block?.elements[0]).toEqual({
        type: 'rich_text_list',
        style: 'bullet',
        elements: [{
          type: 'rich_text_section',
          elements: [
            { type: 'text', text: '☑ ' },
            { type: 'text', text: 'old', style: { strike: true } },
            { type: 'text', text: ' see ' },
            { type: 'link', url: 'https://example.com' },
          ],
        }],
      })
    })

    it('Then groups package headings with their first section', () => {
      const blocks = markdownToSlackRichText('## pkg-a@1.0.0\n\n### Features\n\n- a\n\n## pkg-b@2.0.0\n\n### Fixes\n\n- b')

      expect(blocks).toHaveLength(2)
      expect(blocks[0]?.elements[0]).toEqual({
        type: 'rich_text_section',
        elements: [{ type: 'text', text: 'pkg-a@1.0.0\nFeatures', style: { bold: true } }],
      })
    })
  })

  describe('When a section exceeds the block length', () => {
    it('Then splits it into several blocks between commits', () => {
      const changelog = `### Features\n\n${bulletList(10, 'Feature number')}`

      const blocks = markdownToSlackRichText(changelog, { blockMaxLength: 60 })

      expect(blocks.length).toBeGreaterThan(1)
      expect(blocks.map(richTextToPlainText).join('\n')).toContain('Feature number 9')
    })
  })

  describe('When the changelog exceeds the limits', () => {
    const changelog = `### Features\n\n${bulletList(10, 'Feature number')}\n\n### Fixes\n\n- Fix a bug`

    it('Then drops the last commits to fit maxLength and announces them', () => {
      const blocks = markdownToSlackRichText(changelog, { maxLength: 60 })
      const text = blocks.map(richTextToPlainText).join('\n')

      expect(text).toContain('Feature number 0')
      expect(text).not.toContain('Fixes')
      expect(text).toMatch(/… and \d+ more changes$/)
      expect(blocks.at(-1)?.elements.at(-1)).toEqual({
        type: 'rich_text_section',
        elements: [{ type: 'text', text: expect.stringMatching(/^… and \d+ more changes$/), style: { italic: true } }],
      })
    })

    it('Then drops whole sections to fit maxBlocks', () => {
      const blocks = markdownToSlackRichText(changelog, { maxBlocks: 1 })
      const text = richTextToPlainText(blocks[0]!)

      expect(blocks).toHaveLength(1)
      expect(text).toContain('Feature number 9')
      expect(text).not.toContain('Fixes')
      expect(text.endsWith('… and 1 more change')).toBe(true)
    })
  })
})

describe('Given markdownToSlackMrkdwn function', () => {
  it('Then renders sections, commits and quoted bodies', () => {
    expect(markdownToSlackMrkdwn(CHANGELOG)).toBe([
      '*🚀 Features*',
      '• *slack:* Add the full format (<https://github.com/o/r/pull/12|#12>)',
      '> Commit bodies are hard-wrapped at 72 columns.',
      '    ◦ first point with `code`',
      '    ◦ second _point_',
      '> ```',
      '> const a = 1',
      '> ```',
      '• Second feature',
      '',
      '*🩹 Fixes*',
      '• ⚠️  Fix a bug',
    ].join('\n'))
  })

  it('Then keeps formatting markers off surrounding whitespace', () => {
    expect(markdownToSlackMrkdwn('a ** b ** c')).toBe('a ** b ** c')
    expect(markdownToSlackMrkdwn('**bold _and italic_**')).toBe('*bold _and italic_*')
  })

  it('Then numbers ordered lists from their start', () => {
    expect(markdownToSlackMrkdwn('3. third\n4. fourth')).toBe('3. third\n4. fourth')
  })

  it('Then escapes reserved characters in link labels and code', () => {
    expect(markdownToSlackMrkdwn('[a <b>](https://x.dev/?a=1&b=2) `x > y`')).toBe('<https://x.dev/?a=1&b=2|a &lt;b&gt;> `x &gt; y`')
  })
})

describe('Given richTextToPlainText function', () => {
  it('Then renders lists, quotes and code as readable text', () => {
    const [block] = markdownToSlackRichText('### Title\n\n1. one\n\n   body\n2. two\n   - nested\n\n```\ncode\n```')

    expect(richTextToPlainText(block!)).toBe([
      'Title',
      '1. one',
      '> body',
      '2. two',
      '    • nested',
      '```',
      'code',
      '```',
    ].join('\n'))
  })
})

describe('Given sliceSlackText function', () => {
  it('Then never splits an emoji', () => {
    expect(sliceSlackText('ab🎉', 3)).toBe('ab')
    expect(sliceSlackText('ab🎉', 4)).toBe('ab🎉')
    expect(sliceSlackText('abc', 2)).toBe('ab')
  })
})
