import { nanoid } from 'nanoid'
import type { MigrationTextBlock } from '../types/migration'

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

  // Handle line breaks by replacing them with newlines. The regex tolerates
  // any attributes (e.g. `<br style="..." />`) and any whitespace, since
  // WordPress posts often carry inline-style attributes on `<br>`.
  const processedHtml = html
    .replace(/<br\b[^>]*\/?>/gi, '\n')
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
      // This is an HTML tag. Pull out the tag name independent of any
      // attributes, e.g. `<b style="...">` -> 'b'. Without this the older
      // `startsWith('<b>')` check missed every short tag that carried even
      // a single attribute, so bold / italic / underline / strike-through
      // wrappers from WordPress posts (which often have inline `style`
      // attributes for legacy colour overrides) were silently dropped.
      const openMatch = /^<([a-zA-Z][a-zA-Z0-9]*)/.exec(tag)
      const closeMatch = /^<\/([a-zA-Z][a-zA-Z0-9]*)/.exec(tag)
      const tagName = (openMatch?.[1] ?? closeMatch?.[1] ?? '').toLowerCase()
      const isClosing = closeMatch !== null

      if (!isClosing) {
        switch (tagName) {
          case 'strong':
          case 'b':
            markStack.push('strong')
            break
          case 'em':
          case 'i':
            markStack.push('em')
            break
          case 'u':
            markStack.push('underline')
            break
          case 'strike':
          case 's':
          case 'del':
            markStack.push('strike-through')
            break
          case 'code':
            markStack.push('code')
            break
          case 'a': {
            const hrefMatch = /href=["']([^"']+)["']/i.exec(tag)
            if (hrefMatch) {
              const markDefKey = nanoid()
              linkStack.push({ key: markDefKey, href: hrefMatch[1] })
              markDefs.push({
                _key: markDefKey,
                _type: 'link',
                href: hrefMatch[1],
              })
            }
            break
          }
        }
      } else {
        const popLast = (mark: string) => {
          const index = markStack.lastIndexOf(mark)
          if (index >= 0) markStack.splice(index, 1)
        }
        switch (tagName) {
          case 'strong':
          case 'b':
            popLast('strong')
            break
          case 'em':
          case 'i':
            popLast('em')
            break
          case 'u':
            popLast('underline')
            break
          case 'strike':
          case 's':
          case 'del':
            popLast('strike-through')
            break
          case 'code':
            popLast('code')
            break
          case 'a':
            linkStack.pop()
            break
        }
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
): MigrationTextBlock {
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
