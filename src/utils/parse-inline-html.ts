import { nanoid } from 'nanoid'

interface SpanNode {
  _type: 'span'
  _key: string
  text: string
  marks?: string[]
}

interface LinkMarkDef {
  _key: string
  _type: 'link'
  href: string
}

interface ParsedInlineContent {
  children: SpanNode[]
  markDefs: LinkMarkDef[]
}

/**
 * Parse inline HTML content and convert to Sanity block children with marks
 */
export function parseInlineHTML(html: string): ParsedInlineContent {
  const children: SpanNode[] = []
  const markDefs: LinkMarkDef[] = []

  // Handle line breaks by replacing them with newlines
  const processedHtml = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')

  // Stack to track current formatting marks
  const markStack: string[] = []
  const linkStack: { key: string; href: string }[] = []

  // Regular expression to match HTML tags and text
  const regex = /(<[^>]+>)|([^<]+)/g
  let match

  while ((match = regex.exec(processedHtml)) !== null) {
    const [, tag, text] = match

    if (text) {
      // This is text content
      if (text.trim()) {
        const currentMarks = [...markStack]

        // Add link marks if we're inside a link
        if (linkStack.length > 0) {
          currentMarks.push(linkStack[linkStack.length - 1].key)
        }

        children.push({
          _type: 'span',
          _key: nanoid(),
          text: text,
          marks: currentMarks.length > 0 ? currentMarks : undefined,
        })
      }
    } else if (tag) {
      // This is an HTML tag
      const tagLower = tag.toLowerCase()

      // Handle opening tags
      if (tagLower.startsWith('<strong') || tagLower.startsWith('<b>')) {
        markStack.push('strong')
      } else if (tagLower.startsWith('<em') || tagLower.startsWith('<i>')) {
        markStack.push('em')
      } else if (tagLower.startsWith('<u>')) {
        markStack.push('underline')
      } else if (
        tagLower.startsWith('<strike') ||
        tagLower.startsWith('<s>') ||
        tagLower.startsWith('<del>')
      ) {
        markStack.push('strike-through')
      } else if (tagLower.startsWith('<code')) {
        markStack.push('code')
      } else if (tagLower.startsWith('<a ')) {
        // Extract href from link
        const hrefMatch = /href=["']([^"']+)["']/.exec(tag)
        if (hrefMatch) {
          const markDefKey = nanoid()
          linkStack.push({ key: markDefKey, href: hrefMatch[1] })
          markDefs.push({
            _key: markDefKey,
            _type: 'link',
            href: hrefMatch[1],
          })
        }
      }

      // Handle closing tags
      else if (tagLower === '</strong>' || tagLower === '</b>') {
        const index = markStack.lastIndexOf('strong')
        if (index >= 0) markStack.splice(index, 1)
      } else if (tagLower === '</em>' || tagLower === '</i>') {
        const index = markStack.lastIndexOf('em')
        if (index >= 0) markStack.splice(index, 1)
      } else if (tagLower === '</u>') {
        const index = markStack.lastIndexOf('underline')
        if (index >= 0) markStack.splice(index, 1)
      } else if (tagLower === '</strike>' || tagLower === '</s>' || tagLower === '</del>') {
        const index = markStack.lastIndexOf('strike-through')
        if (index >= 0) markStack.splice(index, 1)
      } else if (tagLower === '</code>') {
        const index = markStack.lastIndexOf('code')
        if (index >= 0) markStack.splice(index, 1)
      } else if (tagLower === '</a>') {
        linkStack.pop()
      }
    }
  }

  // If no children were created, create a single span with the stripped text
  if (children.length === 0) {
    const strippedText = processedHtml.replace(/<[^>]*>/g, '').trim()
    if (strippedText) {
      children.push({
        _type: 'span',
        _key: nanoid(),
        text: strippedText,
      })
    }
  }

  return { children, markDefs }
}

/**
 * Create a block with properly parsed inline content
 */
export function createBlockWithInlineContent(
  html: string,
  style: 'normal' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'blockquote' = 'normal',
) {
  const { children, markDefs } = parseInlineHTML(html)

  return {
    _type: 'block',
    _key: nanoid(),
    style,
    children:
      children.length > 0
        ? children
        : [
            {
              _type: 'span',
              _key: nanoid(),
              text: '',
            },
          ],
    markDefs: markDefs.length > 0 ? markDefs : [],
  }
}
