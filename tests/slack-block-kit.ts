/**
 * Block Kit constraints a Slack message must meet to be accepted, as documented
 * by Slack and observed on chat.postMessage (invalid_blocks / msg_blocks_too_long).
 */
const INLINE_STYLE_KEYS = new Set(['bold', 'italic', 'strike', 'code'])
const RICH_TEXT_MESSAGE_MAX_LENGTH = 13200

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value]
  }
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectStrings)
  }
  return []
}

function validateInline(elements: any[], path: string, errors: string[]): void {
  if (!Array.isArray(elements) || elements.length === 0) {
    errors.push(`${path}: inline elements must be a non-empty array`)
    return
  }
  elements.forEach((element, index) => {
    const at = `${path}[${index}]`
    if (element.type === 'text') {
      if (typeof element.text !== 'string' || element.text.length === 0) {
        errors.push(`${at}: text must be more than 0 characters`)
      }
    }
    else if (element.type === 'link') {
      if (typeof element.url !== 'string' || !/^(?:https?:\/\/|mailto:)/.test(element.url)) {
        errors.push(`${at}: link url must be absolute, got ${element.url}`)
      }
      if (element.text !== undefined && element.text.length === 0) {
        errors.push(`${at}: link text must be more than 0 characters`)
      }
    }
    else {
      errors.push(`${at}: unsupported inline type ${element.type}`)
    }
    for (const key of Object.keys(element.style ?? {})) {
      if (!INLINE_STYLE_KEYS.has(key)) {
        errors.push(`${at}: invalid style ${key}`)
      }
    }
    const allowed = element.type === 'text' ? ['type', 'text', 'style'] : ['type', 'url', 'text', 'style']
    for (const key of Object.keys(element)) {
      if (!allowed.includes(key)) {
        errors.push(`${at}: invalid additional property ${key}`)
      }
    }
  })
}

function validateRichTextElement(element: any, path: string, errors: string[]): void {
  switch (element.type) {
    case 'rich_text_section':
    case 'rich_text_quote':
    case 'rich_text_preformatted':
      validateInline(element.elements, `${path}.elements`, errors)
      for (const key of Object.keys(element)) {
        if (!['type', 'elements'].includes(key)) {
          errors.push(`${path}: invalid additional property ${key}`)
        }
      }
      break
    case 'rich_text_list':
      if (!['bullet', 'ordered'].includes(element.style)) {
        errors.push(`${path}: invalid list style ${element.style}`)
      }
      if (element.indent !== undefined && (!Number.isInteger(element.indent) || element.indent < 0 || element.indent > 8)) {
        errors.push(`${path}: indent must be an integer between 0 and 8`)
      }
      if (element.offset !== undefined && (!Number.isInteger(element.offset) || element.offset < 1)) {
        errors.push(`${path}: offset must be a positive integer`)
      }
      if (!Array.isArray(element.elements) || element.elements.length === 0) {
        errors.push(`${path}: list elements must be a non-empty array`)
      }
      element.elements?.forEach((section: any, index: number) => {
        if (section.type !== 'rich_text_section') {
          errors.push(`${path}.elements[${index}]: list items must be rich_text_section`)
        }
        validateInline(section.elements, `${path}.elements[${index}].elements`, errors)
      })
      break
    default:
      errors.push(`${path}: unsupported rich text element ${element.type}`)
  }
}

export function validateSlackBlocks(blocks: any[]): string[] {
  const errors: string[] = []
  if (blocks.length > 50) {
    errors.push(`too many blocks: ${blocks.length}`)
  }
  blocks.forEach((block, index) => {
    const path = `blocks[${index}]`
    switch (block.type) {
      case 'header':
        if (!block.text.text || block.text.text.length > 150) {
          errors.push(`${path}: header text must be 1 to 150 characters (${block.text.text.length})`)
        }
        break
      case 'section':
        if (!block.text.text || block.text.text.length > 3000) {
          errors.push(`${path}: section text must be 1 to 3000 characters (${block.text.text.length})`)
        }
        break
      case 'rich_text':
        if (!Array.isArray(block.elements) || block.elements.length === 0) {
          errors.push(`${path}: rich_text elements must be a non-empty array`)
        }
        block.elements.forEach((element: any, elementIndex: number) => validateRichTextElement(element, `${path}.elements[${elementIndex}]`, errors))
        break
      case 'divider':
      case 'actions':
        break
      default:
        errors.push(`${path}: unexpected block ${block.type}`)
    }
  })
  collectStrings(blocks).filter(text => !(text as any).isWellFormed()).forEach((text) => {
    errors.push(`malformed unicode (lone surrogate) in: ${JSON.stringify(text.slice(-20))}`)
  })
  if (blocks.some(block => block.type === 'rich_text') && JSON.stringify(blocks).length > RICH_TEXT_MESSAGE_MAX_LENGTH) {
    errors.push(`rich text message too long: ${JSON.stringify(blocks).length}`)
  }
  return errors
}
