import { describe, it, expect } from 'vitest'
import { htmlToBlockContent } from '../html-to-portable-text'
import { parseInlineHTML } from '../parse-inline-html'

describe('Formatting Preservation', () => {
  describe('parseInlineHTML', () => {
    it('should preserve bold formatting', () => {
      const html = 'This is <strong>bold text</strong> in a sentence.'
      const result = parseInlineHTML(html)

      expect(result.children).toHaveLength(3)
      expect(result.children[0].text).toBe('This is ')
      expect(result.children[0].marks).toBeUndefined()

      expect(result.children[1].text).toBe('bold text')
      expect(result.children[1].marks).toEqual(['strong'])

      expect(result.children[2].text).toBe(' in a sentence.')
      expect(result.children[2].marks).toBeUndefined()
    })

    it('should preserve italic formatting', () => {
      const html = 'This is <em>italic text</em> here.'
      const result = parseInlineHTML(html)

      expect(result.children[1].text).toBe('italic text')
      expect(result.children[1].marks).toEqual(['em'])
    })

    it('should preserve underline formatting', () => {
      const html = 'This is <u>underlined</u> text.'
      const result = parseInlineHTML(html)

      expect(result.children[1].text).toBe('underlined')
      expect(result.children[1].marks).toEqual(['underline'])
    })

    it('should preserve strikethrough formatting', () => {
      const html = 'This is <s>strikethrough</s> text.'
      const result = parseInlineHTML(html)

      expect(result.children[1].text).toBe('strikethrough')
      expect(result.children[1].marks).toEqual(['strike-through'])
    })

    it('should handle multiple nested formatting', () => {
      const html = 'This is <strong><em>bold and italic</em></strong> text.'
      const result = parseInlineHTML(html)

      expect(result.children[1].text).toBe('bold and italic')
      expect(result.children[1].marks).toContain('strong')
      expect(result.children[1].marks).toContain('em')
    })

    it('should preserve links', () => {
      const html = 'Visit <a href="https://example.com">our website</a> for more.'
      const result = parseInlineHTML(html)

      expect(result.children[1].text).toBe('our website')
      expect(result.children[1].marks).toHaveLength(1)

      expect(result.markDefs).toHaveLength(1)
      expect(result.markDefs[0]._type).toBe('link')
      expect(result.markDefs[0].href).toBe('https://example.com')
    })

    it('should handle line breaks', () => {
      const html = 'Line one<br />Line two<br/>Line three'
      const result = parseInlineHTML(html)

      expect(result.children[0].text).toBe('Line one\nLine two\nLine three')
    })

    it('should handle HTML entities', () => {
      const html = 'Quotes: &quot;Hello&quot; &amp; dashes: &mdash; &ndash;'
      const result = parseInlineHTML(html)

      expect(result.children[0].text).toBe('Quotes: "Hello" & dashes: — –')
    })
  })

  describe('htmlToBlockContent with formatting', () => {
    it('should preserve formatting in paragraphs', async () => {
      const html =
        '<p>This has <strong>bold</strong>, <em>italic</em>, and <u>underline</u> text.</p>'
      const result = await htmlToBlockContent(html)

      expect(result.content).toHaveLength(1)
      const block = result.content[0]

      expect(block._type).toBe('block')
      expect(block.children).toHaveLength(7) // Multiple spans for different formatting

      // Check that marks are preserved
      const boldSpan = block.children?.find((child) => child.text === 'bold')
      expect(boldSpan?.marks).toEqual(['strong'])

      const italicSpan = block.children?.find((child) => child.text === 'italic')
      expect(italicSpan?.marks).toEqual(['em'])

      const underlineSpan = block.children?.find((child) => child.text === 'underline')
      expect(underlineSpan?.marks).toEqual(['underline'])
    })

    it('should handle blockquotes', async () => {
      const html = '<blockquote><p>This is a quote with <strong>emphasis</strong>.</p></blockquote>'
      const result = await htmlToBlockContent(html)

      expect(result.content).toHaveLength(1)
      expect(result.content[0]._type).toBe('block')
      expect(result.content[0].style).toBe('blockquote')

      // Check that formatting is preserved within blockquote
      const children = result.content[0].children
      expect(children).toBeDefined()
      const emphasisSpan = children?.find((child) => child.text === 'emphasis')
      expect(emphasisSpan?.marks).toEqual(['strong'])
    })

    it('should handle lists with formatting', async () => {
      const html = `
        <ul>
          <li>First item with <strong>bold</strong></li>
          <li>Second item with <em>italic</em></li>
        </ul>
      `
      const result = await htmlToBlockContent(html)

      expect(result.content).toHaveLength(2)

      // Check first list item
      expect(result.content[0]._type).toBe('block')
      expect(result.content[0].listItem).toBe('bullet')
      const firstItemBold = result.content[0].children?.find((child) => child.text === 'bold')
      expect(firstItemBold?.marks).toEqual(['strong'])

      // Check second list item
      expect(result.content[1].listItem).toBe('bullet')
      const secondItemItalic = result.content[1].children?.find((child) => child.text === 'italic')
      expect(secondItemItalic?.marks).toEqual(['em'])
    })

    it('should handle ordered lists', async () => {
      const html = `
        <ol>
          <li>First numbered item</li>
          <li>Second numbered item</li>
        </ol>
      `
      const result = await htmlToBlockContent(html)

      expect(result.content).toHaveLength(2)
      expect(result.content[0].listItem).toBe('number')
      expect(result.content[1].listItem).toBe('number')
    })

    it('should preserve formatting in headings', async () => {
      const html = '<h2>This is a <strong>bold</strong> heading</h2>'
      const result = await htmlToBlockContent(html)

      expect(result.content).toHaveLength(1)
      expect(result.content[0].style).toBe('h2')

      const boldSpan = result.content[0].children?.find((child) => child.text === 'bold')
      expect(boldSpan?.marks).toEqual(['strong'])
    })

    it('should handle complex mixed content', async () => {
      const html = `
        <p>Regular paragraph with <strong>bold</strong>.</p>
        <blockquote><p>A quote with <em>emphasis</em>.</p></blockquote>
        <ul>
          <li>List item with <a href="https://example.com">link</a></li>
        </ul>
        <p>Final paragraph with <code>code</code>.</p>
      `
      const result = await htmlToBlockContent(html)

      expect(result.content).toHaveLength(4)

      // Check different block types
      expect(result.content[0].style).toBe('normal')
      expect(result.content[1].style).toBe('blockquote')
      expect(result.content[2].listItem).toBe('bullet')
      expect(result.content[3].style).toBe('normal')

      // Check code formatting in last paragraph
      const codeSpan = result.content[3].children?.find((child) => child.text === 'code')
      expect(codeSpan?.marks).toEqual(['code'])
    })
  })
})
