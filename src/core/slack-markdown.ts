import type { BlockContent, DefinitionContent, Heading, Image, ImageReference, List, ListItem, Nodes, PhrasingContent, Root, RootContent, Table } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'

/** Maximum number of blocks in a Slack message. */
export const SLACK_MAX_BLOCKS = 50
/** Maximum length of the text of a Slack section block. */
export const SLACK_SECTION_MAX_LENGTH = 3000
/**
 * Soft cap of the text carried by a single rich_text block. Slack documents no
 * limit for rich_text, so the section limit is reused as a conservative bound.
 */
export const SLACK_RICH_TEXT_BLOCK_MAX_LENGTH = 3000
/**
 * Budget of the JSON of all the blocks of a message containing rich_text blocks.
 * Slack rejects such messages above ~13,200 characters with `msg_blocks_too_long`
 * (https://github.com/slackapi/bolt-js/issues/2509): measuring the JSON, which is
 * larger than the text Slack counts, keeps a safe margin.
 */
export const SLACK_RICH_TEXT_MESSAGE_MAX_LENGTH = 11000
/** Maximum length of the text of a Slack header block. */
export const SLACK_HEADER_MAX_LENGTH = 150
/** Marks where a truncated text was cut. */
const ELLIPSIS = '…'
/** Maximum indent level of a rich_text_list. */
const SLACK_MAX_LIST_INDENT = 8

export interface SlackRichTextStyle {
  bold?: boolean
  italic?: boolean
  strike?: boolean
  code?: boolean
}

export interface SlackRichTextText {
  type: 'text'
  text: string
  style?: SlackRichTextStyle
}

export interface SlackRichTextLink {
  type: 'link'
  url: string
  text?: string
  style?: SlackRichTextStyle
}

export type SlackRichTextInline = SlackRichTextText | SlackRichTextLink

export interface SlackRichTextSection {
  type: 'rich_text_section'
  elements: SlackRichTextInline[]
}

export interface SlackRichTextList {
  type: 'rich_text_list'
  style: 'bullet' | 'ordered'
  indent?: number
  offset?: number
  elements: SlackRichTextSection[]
}

export interface SlackRichTextQuote {
  type: 'rich_text_quote'
  elements: SlackRichTextInline[]
}

export interface SlackRichTextPreformatted {
  type: 'rich_text_preformatted'
  elements: SlackRichTextInline[]
}

export type SlackRichTextElement = SlackRichTextSection | SlackRichTextList | SlackRichTextQuote | SlackRichTextPreformatted

export interface SlackRichTextBlock {
  type: 'rich_text'
  elements: SlackRichTextElement[]
}

/**
 * Smallest piece of a changelog that can be kept or dropped when truncating:
 * a heading, a top-level list item (one commit) or any other top-level block.
 */
type ChangelogUnit
  = | { type: 'heading', node: Heading }
    | { type: 'item', node: ListItem, list: List, index: number }
    | { type: 'block', node: RootContent }

interface RenderedUnit<T> {
  unit: ChangelogUnit
  output: T
  length: number
}

function parseMarkdown(markdown: string): Root {
  return fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  })
}

function splitIntoUnits(root: Root): ChangelogUnit[] {
  const units: ChangelogUnit[] = []
  for (const node of root.children) {
    if (node.type === 'heading') {
      units.push({ type: 'heading', node })
    }
    else if (node.type === 'list') {
      node.children.forEach((item, index) => units.push({ type: 'item', node: item, list: node, index }))
    }
    else {
      units.push({ type: 'block', node })
    }
  }
  return units
}

/** Count the changes left out by a truncation: commits first, other blocks otherwise. */
function countOmittedChanges(units: ChangelogUnit[]): number {
  const items = units.filter(unit => unit.type === 'item').length
  return items > 0 ? items : units.filter(unit => unit.type !== 'heading').length
}

function formatOmittedChanges(count: number): string {
  return count > 0 ? `… and ${count} more change${count > 1 ? 's' : ''}` : ''
}

/** Cut a text without splitting a UTF-16 surrogate pair (emoji), which Slack would render broken. */
export function sliceSlackText(text: string, length: number): string {
  const end = Math.max(0, length)
  const lastCode = text.charCodeAt(end - 1)
  return text.slice(0, lastCode >= 0xD800 && lastCode <= 0xDBFF ? end - 1 : end)
}

/** A truncated changelog must not end on a heading whose content was dropped. */
function dropTrailingHeadings<T>(rendered: RenderedUnit<T>[]): RenderedUnit<T>[] {
  let end = rendered.length
  while (end > 0 && rendered[end - 1]?.unit.type === 'heading') {
    end--
  }
  return rendered.slice(0, end)
}

function getListItemParts(item: ListItem): { head: PhrasingContent[], body: (BlockContent | DefinitionContent)[] } {
  const [first, ...rest] = item.children
  if (first?.type === 'paragraph') {
    return { head: first.children, body: rest }
  }
  return { head: [], body: item.children }
}

function getCheckboxPrefix(item: ListItem): string {
  if (item.checked === true) {
    return '☑ '
  }
  if (item.checked === false) {
    return '☐ '
  }
  return ''
}

function getListItemNumber(list: List, index: number): number {
  return (list.start ?? 1) + index
}

/** The parser always sets `alt`, mdast types it as nullable. */
function getAltText(node: Image | ImageReference): string {
  return node.alt ?? ''
}

function toPlainText(node: Nodes): string {
  if ('value' in node && typeof node.value === 'string') {
    return node.value
  }
  if (node.type === 'image' || node.type === 'imageReference') {
    return getAltText(node)
  }
  if (node.type === 'break') {
    return ' '
  }
  if ('children' in node) {
    return (node.children as Nodes[]).map(toPlainText).join('')
  }
  return ''
}

/**
 * Only absolute links are rendered as links: relative ones (e.g. `./README.md`
 * in a commit body) cannot resolve in Slack and their validation is undocumented.
 */
function isAbsoluteUrl(url: string): boolean {
  return /^(?:https?:\/\/|mailto:)/i.test(url)
}

/** Soft line breaks are spaces in markdown: commit bodies are often hard-wrapped. */
function collapseSoftBreaks(text: string): string {
  const lines = text.split('\n')
  return lines
    .map((line, index) => {
      const withoutLeading = index > 0 ? line.trimStart() : line
      return index < lines.length - 1 ? withoutLeading.trimEnd() : withoutLeading
    })
    .join(' ')
}

function tableToPlainText(table: Table): string {
  return table.children
    .map(row => row.children.map(cell => toPlainText(cell).trim()).join(' | '))
    .join('\n')
}

// ---------------------------------------------------------------------------
// mrkdwn renderer
// ---------------------------------------------------------------------------

/** Slack requires `&`, `<` and `>` to be escaped in mrkdwn text. */
function escapeMrkdwn(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeMrkdwnUrl(url: string): string {
  return url
    .replaceAll('<', '%3C')
    .replaceAll('>', '%3E')
    .replaceAll('|', '%7C')
}

function formatMrkdwnLink(url: string, label: string): string {
  if (!isAbsoluteUrl(url)) {
    return escapeMrkdwn(label)
  }
  const safeUrl = escapeMrkdwnUrl(url)
  return label && label !== url ? `<${safeUrl}|${escapeMrkdwn(label)}>` : `<${safeUrl}>`
}

/**
 * Wrap with a mrkdwn marker. Slack ignores markers touching whitespace, so the
 * surrounding whitespace is moved outside, and a marker already active is not repeated.
 */
function wrapMrkdwn(marker: string, children: PhrasingContent[], active: ReadonlySet<string>): string {
  const inner = renderInlineMrkdwn(children, new Set([...active, marker]))
  if (active.has(marker)) {
    return inner
  }
  const content = inner.trim()
  if (!content) {
    return inner
  }
  const start = inner.indexOf(content)
  return `${inner.slice(0, start)}${marker}${content}${marker}${inner.slice(start + content.length)}`
}

function renderInlineNodeMrkdwn(node: PhrasingContent, active: ReadonlySet<string>): string {
  switch (node.type) {
    case 'text':
      return escapeMrkdwn(collapseSoftBreaks(node.value))
    case 'strong':
      return wrapMrkdwn('*', node.children, active)
    case 'emphasis':
      return wrapMrkdwn('_', node.children, active)
    case 'delete':
      return wrapMrkdwn('~', node.children, active)
    case 'inlineCode':
      return `\`${escapeMrkdwn(node.value)}\``
    case 'break':
      return '\n'
    case 'link':
      return formatMrkdwnLink(node.url, toPlainText(node))
    case 'image':
      return formatMrkdwnLink(node.url, getAltText(node))
    case 'linkReference':
      return renderInlineMrkdwn(node.children, active)
    case 'imageReference':
      return escapeMrkdwn(getAltText(node))
    case 'html':
      return escapeMrkdwn(node.value)
    case 'footnoteReference':
      return `[^${escapeMrkdwn(node.identifier)}]`
  }
}

function renderInlineMrkdwn(nodes: PhrasingContent[], active: ReadonlySet<string> = new Set()): string {
  return nodes.map(node => renderInlineNodeMrkdwn(node, active)).join('')
}

function quoteMrkdwn(text: string): string {
  return text
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n')
}

function renderListItemMrkdwn(item: ListItem, list: List, index: number, depth: number): string {
  const indent = '    '.repeat(depth)
  const bullet = depth === 0 ? '•' : '◦'
  const marker = list.ordered ? `${getListItemNumber(list, index)}.` : bullet
  const { head, body } = getListItemParts(item)

  const lines = [`${indent}${marker} ${getCheckboxPrefix(item)}${renderInlineMrkdwn(head)}`.trimEnd()]
  for (const child of body) {
    if (child.type === 'list') {
      child.children.forEach((subItem, subIndex) => lines.push(renderListItemMrkdwn(subItem, child, subIndex, depth + 1)))
      continue
    }
    const rendered = renderBlockMrkdwn(child)
    if (rendered) {
      // Slack only renders a quote when `>` starts the line, so bodies are never indented.
      lines.push(quoteMrkdwn(rendered))
    }
  }
  return lines.join('\n')
}

function renderBlockMrkdwn(node: RootContent | BlockContent | DefinitionContent): string {
  switch (node.type) {
    case 'heading': {
      const text = renderInlineMrkdwn(node.children, new Set(['*'])).trim()
      return text ? `*${text}*` : ''
    }
    case 'paragraph':
      return renderInlineMrkdwn(node.children)
    case 'list':
      return node.children.map((item, index) => renderListItemMrkdwn(item, node, index, 0)).join('\n')
    case 'blockquote':
      return quoteMrkdwn(node.children.map(renderBlockMrkdwn).filter(Boolean).join('\n'))
    case 'code':
      return `\`\`\`\n${escapeMrkdwn(node.value)}\n\`\`\``
    case 'html':
      return escapeMrkdwn(node.value)
    case 'table':
      return escapeMrkdwn(tableToPlainText(node))
    default:
      return ''
  }
}

function renderUnitMrkdwn(unit: ChangelogUnit): string {
  if (unit.type === 'item') {
    return renderListItemMrkdwn(unit.node, unit.list, unit.index, 0)
  }
  return renderBlockMrkdwn(unit.node)
}

function joinMrkdwnUnits(rendered: RenderedUnit<string>[]): string {
  let text = ''
  rendered.forEach((current, index) => {
    const previous = rendered[index - 1]
    if (previous) {
      const sameList = previous.unit.type === 'item' && current.unit.type === 'item' && previous.unit.list === current.unit.list
      text += previous.unit.type === 'heading' || sameList ? '\n' : '\n\n'
    }
    text += current.output
  })
  return text
}

/**
 * Render a markdown changelog as Slack mrkdwn.
 * When `maxLength` is exceeded, whole commits are dropped from the end and
 * replaced with an "… and N more changes" line; a single block longer than
 * the budget is cut instead.
 */
export function markdownToSlackMrkdwn(markdown: string, { maxLength, cutCommits = false }: {
  maxLength?: number
  /** Cut the first commit that does not fit where the limit is reached, instead of dropping it whole */
  cutCommits?: boolean
} = {}): string {
  if (!markdown.trim()) {
    return ''
  }

  const rendered = splitIntoUnits(parseMarkdown(markdown))
    .map(unit => ({ unit, output: renderUnitMrkdwn(unit), length: 0 }))
    .filter(({ output }) => output !== '')

  const full = joinMrkdwnUnits(rendered)
  if (maxLength === undefined || full.length <= maxLength) {
    return full
  }

  for (let count = rendered.length - 1; count >= 0; count--) {
    const next = rendered[count]!
    if (cutCommits && next.unit.type !== 'heading') {
      const note = formatOmittedChanges(countOmittedChanges(rendered.slice(count + 1).map(({ unit }) => unit)))
      const suffix = note ? `\n\n_${note}_` : ''
      // The units kept whole, followed by the separator of the cut one
      const prefix = joinMrkdwnUnits([...rendered.slice(0, count), { ...next, output: '' }])
      const cut = cutMrkdwn(next.output, maxLength - prefix.length - suffix.length - ELLIPSIS.length)
      if (cut) {
        return `${prefix}${cut}${ELLIPSIS}${suffix}`
      }
    }

    const kept = dropTrailingHeadings(rendered.slice(0, count))
    if (kept.length === 0) {
      continue
    }
    const note = formatOmittedChanges(countOmittedChanges(rendered.slice(kept.length).map(({ unit }) => unit)))
    const candidate = note ? `${joinMrkdwnUnits(kept)}\n\n_${note}_` : joinMrkdwnUnits(kept)
    if (candidate.length <= maxLength) {
      return candidate
    }
  }

  return `${sliceSlackText(full, maxLength - 3)}...`
}

/**
 * Keep the first `budget` characters of a mrkdwn text, without ending inside
 * a `<url|label>` link or an `&amp;` entity.
 */
function cutMrkdwn(text: string, budget: number): string {
  if (budget <= 0) {
    return ''
  }
  let cut = sliceSlackText(text, budget)
  const linkStart = cut.lastIndexOf('<')
  if (linkStart > cut.lastIndexOf('>')) {
    cut = cut.slice(0, linkStart)
  }
  const entityStart = cut.lastIndexOf('&')
  if (entityStart > cut.lastIndexOf(';')) {
    cut = cut.slice(0, entityStart)
  }
  cut = cut.trimEnd()
  // A bare bullet or quote marker is not worth showing
  return /[^\s•◦>]/.test(cut) ? cut : ''
}

// ---------------------------------------------------------------------------
// rich_text renderer
// ---------------------------------------------------------------------------

function hasStyle(style: SlackRichTextStyle): boolean {
  return Object.values(style).some(Boolean)
}

function pushText(elements: SlackRichTextInline[], text: string, style: SlackRichTextStyle): void {
  if (!text) {
    return
  }
  const previous = elements.at(-1)
  if (previous?.type === 'text' && JSON.stringify(previous.style ?? {}) === JSON.stringify(style)) {
    previous.text += text
    return
  }
  elements.push(hasStyle(style) ? { type: 'text', text, style: { ...style } } : { type: 'text', text })
}

function pushLink(elements: SlackRichTextInline[], url: string, text: string, style: SlackRichTextStyle): void {
  if (!isAbsoluteUrl(url)) {
    pushText(elements, text, style)
    return
  }
  const link: SlackRichTextLink = { type: 'link', url }
  if (text && text !== url) {
    link.text = text
  }
  if (hasStyle(style)) {
    link.style = { ...style }
  }
  elements.push(link)
}

function appendInlineRichText(elements: SlackRichTextInline[], node: PhrasingContent, style: SlackRichTextStyle): void {
  switch (node.type) {
    case 'text':
      pushText(elements, collapseSoftBreaks(node.value), style)
      break
    case 'strong':
      node.children.forEach(child => appendInlineRichText(elements, child, { ...style, bold: true }))
      break
    case 'emphasis':
      node.children.forEach(child => appendInlineRichText(elements, child, { ...style, italic: true }))
      break
    case 'delete':
      node.children.forEach(child => appendInlineRichText(elements, child, { ...style, strike: true }))
      break
    case 'inlineCode':
      pushText(elements, node.value, { ...style, code: true })
      break
    case 'break':
      pushText(elements, '\n', style)
      break
    case 'link':
      pushLink(elements, node.url, toPlainText(node), style)
      break
    case 'image':
      pushLink(elements, node.url, getAltText(node), style)
      break
    case 'linkReference':
      node.children.forEach(child => appendInlineRichText(elements, child, style))
      break
    case 'imageReference':
      pushText(elements, getAltText(node), style)
      break
    case 'html':
      pushText(elements, node.value, style)
      break
    case 'footnoteReference':
      pushText(elements, `[^${node.identifier}]`, style)
      break
  }
}

function renderInlineRichText(nodes: PhrasingContent[], style: SlackRichTextStyle = {}, prefix = ''): SlackRichTextInline[] {
  const elements: SlackRichTextInline[] = []
  pushText(elements, prefix, style)
  nodes.forEach(node => appendInlineRichText(elements, node, style))
  return elements
}

/** Slack rejects empty rich text containers. */
function ensureNotEmpty(elements: SlackRichTextInline[]): SlackRichTextInline[] {
  return elements.length > 0 ? elements : [{ type: 'text', text: ' ' }]
}

/**
 * The code language is not forwarded: Slack documents no list of accepted values
 * and an unknown one could get the whole message rejected.
 */
function preformatted(value: string): SlackRichTextPreformatted[] {
  return value ? [{ type: 'rich_text_preformatted', elements: [{ type: 'text', text: value }] }] : []
}

function quote(elements: SlackRichTextInline[]): SlackRichTextQuote[] {
  return elements.length > 0 ? [{ type: 'rich_text_quote', elements }] : []
}

function blockquoteInline(nodes: (BlockContent | DefinitionContent)[]): SlackRichTextInline[] {
  const elements: SlackRichTextInline[] = []
  nodes.forEach((node, index) => {
    if (index > 0) {
      pushText(elements, '\n', {})
    }
    if (node.type === 'paragraph' || node.type === 'heading') {
      node.children.forEach(child => appendInlineRichText(elements, child, node.type === 'heading' ? { bold: true } : {}))
    }
    else {
      pushText(elements, toPlainText(node), {})
    }
  })
  return elements
}

/** Content of a commit body: paragraphs become quotes under the bullet. */
function renderBodyBlockRichText(node: BlockContent | DefinitionContent): SlackRichTextElement[] {
  switch (node.type) {
    case 'paragraph':
      return quote(renderInlineRichText(node.children))
    case 'heading':
      return [{ type: 'rich_text_section', elements: ensureNotEmpty(renderInlineRichText(node.children, { bold: true })) }]
    case 'blockquote':
      return quote(blockquoteInline(node.children))
    case 'code':
      return preformatted(node.value)
    case 'html':
      return quote(renderInlineRichText([], {}, node.value))
    case 'table':
      return preformatted(tableToPlainText(node))
    default:
      return []
  }
}

function renderListItemRichText(item: ListItem, list: List, index: number, indent: number): SlackRichTextElement[] {
  const { head, body } = getListItemParts(item)
  const listElement: SlackRichTextList = {
    type: 'rich_text_list',
    style: list.ordered ? 'ordered' : 'bullet',
    elements: [{ type: 'rich_text_section', elements: ensureNotEmpty(renderInlineRichText(head, {}, getCheckboxPrefix(item))) }],
  }
  if (indent > 0) {
    listElement.indent = Math.min(indent, SLACK_MAX_LIST_INDENT)
  }
  const offset = list.ordered ? getListItemNumber(list, index) - 1 : 0
  if (offset > 0) {
    listElement.offset = offset
  }

  const elements: SlackRichTextElement[] = [listElement]
  for (const child of body) {
    if (child.type === 'list') {
      child.children.forEach((subItem, subIndex) => elements.push(...renderListItemRichText(subItem, child, subIndex, indent + 1)))
    }
    else {
      elements.push(...renderBodyBlockRichText(child))
    }
  }
  return elements
}

function renderUnitRichText(unit: ChangelogUnit): SlackRichTextElement[] {
  if (unit.type === 'heading') {
    const elements = renderInlineRichText(unit.node.children, { bold: true })
    return elements.length > 0 ? [{ type: 'rich_text_section', elements }] : []
  }
  if (unit.type === 'item') {
    return renderListItemRichText(unit.node, unit.list, unit.index, 0)
  }

  const node = unit.node
  switch (node.type) {
    case 'paragraph':
      return [{ type: 'rich_text_section', elements: ensureNotEmpty(renderInlineRichText(node.children)) }]
    case 'blockquote':
      return quote(blockquoteInline(node.children))
    case 'code':
      return preformatted(node.value)
    case 'html':
      return [{ type: 'rich_text_section', elements: ensureNotEmpty(renderInlineRichText([], {}, node.value)) }]
    case 'table':
      return preformatted(tableToPlainText(node))
    default:
      return []
  }
}

function inlineLength(elements: SlackRichTextInline[]): number {
  return elements.reduce((total, element) => total + (element.type === 'text' ? element.text.length : (element.text ?? element.url).length), 0)
}

/** Length of an element in the plain-text preview (bullets and quote markers included), plus its line break. */
function elementLength(element: SlackRichTextElement): number {
  return richTextToPlainText({ type: 'rich_text', elements: [element] }).length + 1
}

/** Length of blocks as shown by the plain-text preview, which `maxLength` bounds. */
function blocksLength(blocks: SlackRichTextBlock[]): number {
  return blocks.map(richTextToPlainText).join('\n\n').length
}

/**
 * Merge consecutive elements Slack would otherwise render apart: list items
 * of the same list level, sections (joined by a line break) and quotes.
 */
function isSameListLevel(previous: SlackRichTextElement | undefined, element: SlackRichTextElement): previous is SlackRichTextList {
  return previous?.type === 'rich_text_list'
    && element.type === 'rich_text_list'
    && previous.style === element.style
    && (previous.indent ?? 0) === (element.indent ?? 0)
}

function isSameInlineContainer(previous: SlackRichTextElement | undefined, element: SlackRichTextElement): previous is SlackRichTextSection | SlackRichTextQuote {
  return (element.type === 'rich_text_section' || element.type === 'rich_text_quote') && previous?.type === element.type
}

function appendElement(elements: SlackRichTextElement[], element: SlackRichTextElement): void {
  const previous = elements.at(-1)
  if (isSameListLevel(previous, element) && element.type === 'rich_text_list') {
    previous.elements.push(...structuredClone(element.elements))
    return
  }
  if (isSameInlineContainer(previous, element) && element.type !== 'rich_text_list') {
    // The separator takes the style of the text it follows, so same-styled texts merge.
    const last = previous.elements.at(-1)
    const separatorStyle = last?.type === 'text' ? last.style ?? {} : {}
    pushText(previous.elements, element.type === 'rich_text_quote' ? '\n\n' : '\n', separatorStyle)
    for (const inline of structuredClone(element.elements)) {
      if (inline.type === 'text') {
        pushText(previous.elements, inline.text, inline.style ?? {})
      }
      else {
        previous.elements.push(inline)
      }
    }
    return
  }
  elements.push(structuredClone(element))
}

/**
 * Group units into rich_text blocks: a block per changelog section (a heading
 * and its commits), split further when a section exceeds `blockMaxLength`.
 */
function assembleRichTextBlocks(rendered: RenderedUnit<SlackRichTextElement[]>[], blockMaxLength: number): SlackRichTextBlock[] {
  const blocks: SlackRichTextBlock[] = []
  let current: SlackRichTextBlock | undefined
  let currentLength = 0
  let currentHasContent = false

  for (const { unit, output, length } of rendered) {
    const startsSection = unit.type === 'heading' && currentHasContent
    const overflows = currentHasContent && currentLength + length > blockMaxLength
    if (!current || startsSection || overflows) {
      current = { type: 'rich_text', elements: [] }
      blocks.push(current)
      currentLength = 0
      currentHasContent = false
    }
    output.forEach(element => appendElement(current!.elements, element))
    currentLength += length
    currentHasContent ||= unit.type !== 'heading'
  }

  return blocks
}

/** Keep the first `count` characters of inline elements; links are kept whole or dropped. */
function takeInlineCharacters(elements: SlackRichTextInline[], count: number): SlackRichTextInline[] {
  const kept: SlackRichTextInline[] = []
  let remaining = count
  for (const element of elements) {
    const length = inlineLength([element])
    if (length <= remaining) {
      kept.push(structuredClone(element))
      remaining -= length
      continue
    }
    if (element.type === 'text') {
      pushText(kept, sliceSlackText(element.text, remaining), element.style ?? {})
    }
    break
  }
  return kept
}

/** Keep the first `count` characters of the text of an element. */
function takeElementCharacters(element: SlackRichTextElement, count: number): SlackRichTextElement | undefined {
  // A rendered list item holds a single section
  const inlines = element.type === 'rich_text_list' ? element.elements[0]!.elements : element.elements
  const elements = takeInlineCharacters(inlines, count)
  if (elements.length === 0) {
    return undefined
  }
  return element.type === 'rich_text_list'
    ? { ...element, elements: [{ type: 'rich_text_section', elements }] }
    : { ...element, elements }
}

/** End an element with an ellipsis, right after its last visible character. */
function withEllipsis(element: SlackRichTextElement): SlackRichTextElement {
  const result = structuredClone(element)
  const inlines = result.type === 'rich_text_list' ? result.elements.at(-1)!.elements : result.elements
  const last = inlines.at(-1)
  if (last?.type === 'text') {
    last.text = last.text.trimEnd()
    if (!last.text) {
      inlines.pop()
    }
  }
  pushText(inlines, ELLIPSIS, {})
  return result
}

/** The longest beginning of an element that fits `budget` with its ellipsis. */
function cutRichTextElement(element: SlackRichTextElement, budget: number): SlackRichTextElement | undefined {
  const characters = element.type === 'rich_text_list'
    ? element.elements.reduce((total, section) => total + inlineLength(section.elements), 0)
    : inlineLength(element.elements)

  let best: SlackRichTextElement | undefined
  let low = 1
  let high = characters - 1
  while (low <= high) {
    const count = Math.floor((low + high) / 2)
    const taken = takeElementCharacters(element, count)
    const candidate = taken && withEllipsis(taken)
    if (candidate && elementLength(candidate) <= budget) {
      best = candidate
      low = count + 1
    }
    else {
      high = count - 1
    }
  }
  return best
}

/**
 * Keep the beginning of a unit (a commit and its body) that fits `budget`,
 * ending with an ellipsis. Returns no element when nothing fits.
 */
function cutRichTextElements(elements: SlackRichTextElement[], budget: number): SlackRichTextElement[] {
  const kept: SlackRichTextElement[] = []
  let remaining = budget
  for (const element of elements) {
    const length = elementLength(element)
    // One character stays available for the ellipsis of the last kept element
    if (length + ELLIPSIS.length <= remaining) {
      kept.push(structuredClone(element))
      remaining -= length
      continue
    }
    const cut = cutRichTextElement(element, remaining)
    if (cut) {
      return [...kept, cut]
    }
    break
  }

  const last = kept.pop()
  return last ? [...kept, withEllipsis(last)] : []
}

/**
 * Render a markdown changelog as Slack rich_text blocks.
 * Commit bodies are rendered under their bullet: paragraphs as quotes, nested
 * lists as indented lists, code as preformatted blocks.
 * When `maxLength`, `maxBlocks` or `maxPayloadLength` is exceeded, the changelog
 * is cut where the limit is reached, even inside a commit body, with an ellipsis,
 * and the commits left out entirely are announced with an "… and N more changes" line.
 */
export function markdownToSlackRichText(markdown: string, {
  maxLength,
  maxBlocks = SLACK_MAX_BLOCKS,
  maxPayloadLength,
  blockMaxLength = SLACK_RICH_TEXT_BLOCK_MAX_LENGTH,
}: {
  /** Maximum number of text characters of the changelog */
  maxLength?: number
  /** Maximum number of returned blocks */
  maxBlocks?: number
  /** Maximum length of the JSON of the returned blocks */
  maxPayloadLength?: number
  /** Soft cap of the text characters of a single block */
  blockMaxLength?: number
} = {}): SlackRichTextBlock[] {
  if (!markdown.trim() || maxBlocks < 1) {
    return []
  }

  const rendered = splitIntoUnits(parseMarkdown(markdown))
    .map((unit) => {
      const output = renderUnitRichText(unit)
      return { unit, output, length: output.reduce((total, element) => total + elementLength(element), 0) }
    })
    .filter(({ output }) => output.length > 0)

  const totalLength = (units: RenderedUnit<unknown>[]) => units.reduce((total, { length }) => total + length, 0)
  const fits = (candidate: SlackRichTextBlock[]) => candidate.length <= maxBlocks
    && (maxLength === undefined || blocksLength(candidate) <= maxLength)
    && (maxPayloadLength === undefined || JSON.stringify(candidate).length <= maxPayloadLength)

  const blocks = assembleRichTextBlocks(rendered, blockMaxLength)
  if (fits(blocks)) {
    return blocks
  }

  // Keep `chars` characters of the changelog: the units that fit whole, then the
  // beginning of the next one, cut with an ellipsis, then the omitted changes.
  const truncate = (chars: number) => {
    let remaining = chars
    let index = 0
    const kept: RenderedUnit<SlackRichTextElement[]>[] = []
    for (; index < rendered.length && rendered[index]!.length <= remaining; index++) {
      kept.push(rendered[index]!)
      remaining -= rendered[index]!.length
    }

    const next = rendered[index]
    const cut = next && next.unit.type !== 'heading' ? cutRichTextElements(next.output, remaining) : []
    const visible = cut.length > 0
      ? [...kept, { unit: next!.unit, output: cut, length: cut.reduce((total, element) => total + elementLength(element), 0) }]
      : dropTrailingHeadings(kept)
    const note = formatOmittedChanges(countOmittedChanges(rendered.slice(cut.length > 0 ? index + 1 : visible.length).map(({ unit }) => unit)))

    const truncated = assembleRichTextBlocks(visible, blockMaxLength)
    if (note) {
      const noteSection: SlackRichTextSection = { type: 'rich_text_section', elements: [{ type: 'text', text: note, style: { italic: true } }] }
      const last = truncated.at(-1)
      if (last) {
        last.elements.push(noteSection)
      }
      else {
        truncated.push({ type: 'rich_text', elements: [noteSection] })
      }
    }
    return truncated
  }

  // Every limit grows with the number of kept characters: binary search the largest count that fits.
  let best = truncate(0)
  let low = 1
  let high = totalLength(rendered) - 1
  while (low <= high) {
    const chars = Math.floor((low + high) / 2)
    const candidate = truncate(chars)
    if (fits(candidate)) {
      best = candidate
      low = chars + 1
    }
    else {
      high = chars - 1
    }
  }

  return best
}

function inlineToPlainText(elements: SlackRichTextInline[]): string {
  return elements.map(element => element.type === 'text' ? element.text : (element.text ?? element.url)).join('')
}

/** Plain-text rendering of a rich_text block, used for dry-run previews. */
export function richTextToPlainText(block: SlackRichTextBlock): string {
  return block.elements
    .map((element) => {
      switch (element.type) {
        case 'rich_text_list':
          return element.elements
            .map((section, index) => {
              const indent = '    '.repeat(element.indent ?? 0)
              const marker = element.style === 'ordered' ? `${(element.offset ?? 0) + index + 1}.` : '•'
              return `${indent}${marker} ${inlineToPlainText(section.elements)}`
            })
            .join('\n')
        case 'rich_text_quote':
          return quoteMrkdwn(inlineToPlainText(element.elements))
        case 'rich_text_preformatted':
          return `\`\`\`\n${inlineToPlainText(element.elements)}\n\`\`\``
        default:
          return inlineToPlainText(element.elements)
      }
    })
    .join('\n')
}
