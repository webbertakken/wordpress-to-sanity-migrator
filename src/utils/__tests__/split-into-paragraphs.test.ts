import { describe, it, expect } from 'vitest'
import { splitIntoParagraphs } from '../split-into-paragraphs'

describe('splitIntoParagraphs', () => {
  it('returns an empty string for empty or whitespace-only input', () => {
    expect(splitIntoParagraphs('')).toBe('')
    expect(splitIntoParagraphs('   \r\n\r\n  ')).toBe('')
  })

  it('wraps a single line of plain text in a paragraph', () => {
    expect(splitIntoParagraphs('Hello world')).toBe('<p>Hello world</p>')
  })

  it('treats every newline as a paragraph break', () => {
    expect(splitIntoParagraphs('First\nSecond\nThird')).toBe(
      '<p>First</p>\n<p>Second</p>\n<p>Third</p>',
    )
  })

  it('treats double newlines the same as single newlines', () => {
    expect(splitIntoParagraphs('First\n\nSecond')).toBe('<p>First</p>\n<p>Second</p>')
  })

  it('normalises CRLF line endings before splitting', () => {
    expect(splitIntoParagraphs('First\r\nSecond')).toBe('<p>First</p>\n<p>Second</p>')
  })

  it('treats <br /> as a paragraph break', () => {
    expect(splitIntoParagraphs('Line one<br />Line two<br />Line three')).toBe(
      '<p>Line one</p>\n<p>Line two</p>\n<p>Line three</p>',
    )
  })

  it('unwraps existing <p> tags and re-emits each chunk as its own paragraph', () => {
    expect(splitIntoParagraphs('<p>Already wrapped</p>')).toBe('<p>Already wrapped</p>')
    expect(splitIntoParagraphs('<p>Foo</p><p>Bar</p>')).toBe('<p>Foo</p>\n<p>Bar</p>')
  })

  it('splits a <p> that contains <br /> or newlines into separate paragraphs', () => {
    expect(splitIntoParagraphs('<p>One<br />Two</p>')).toBe('<p>One</p>\n<p>Two</p>')
    expect(splitIntoParagraphs('<p>One\nTwo</p>')).toBe('<p>One</p>\n<p>Two</p>')
  })

  it('preserves block-level elements that are not <p>', () => {
    expect(splitIntoParagraphs('<h2>Heading</h2>')).toBe('<h2>Heading</h2>')
    expect(splitIntoParagraphs('Intro\n<h2>Heading</h2>\nOutro')).toBe(
      '<p>Intro</p>\n<h2>Heading</h2>\n<p>Outro</p>',
    )
  })

  it('preserves blockquotes verbatim, including any inner <p> tags', () => {
    // Block-level wrappers like <blockquote> are kept intact so that
    // downstream parsers can handle their internal structure.
    const html = '<blockquote><p>Quote</p></blockquote>'
    expect(splitIntoParagraphs(html)).toBe('<blockquote><p>Quote</p></blockquote>')
  })

  it('treats <a> wrapping only an <img> as a block boundary', () => {
    const html = 'Some intro text\n\nMore text<a href="http://x"><img src="http://y" /></a>'
    expect(splitIntoParagraphs(html)).toBe(
      '<p>Some intro text</p>\n<p>More text</p>\n<a href="http://x"><img src="http://y" /></a>',
    )
  })

  it('treats a standalone <img> as a block boundary', () => {
    const html = 'Before image<img src="http://x" />After image'
    expect(splitIntoParagraphs(html)).toBe(
      '<p>Before image</p>\n<img src="http://x" />\n<p>After image</p>',
    )
  })

  it('preserves figures and the text around them', () => {
    const html = 'Intro\n<figure class="wp-block-image"><img src="http://x" /></figure>\nOutro'
    expect(splitIntoParagraphs(html)).toBe(
      '<p>Intro</p>\n<figure class="wp-block-image"><img src="http://x" /></figure>\n<p>Outro</p>',
    )
  })

  it('handles WordPress-style raw post content with implicit paragraphs', () => {
    const html =
      'First sentence.\r\nSecond sentence.\r\nThird sentence.\r\n\r\nNew paragraph here.\r\nAuthor name<a href="http://example.com/img.jpg"><img src="http://example.com/img.jpg" alt="" /></a>'

    expect(splitIntoParagraphs(html)).toBe(
      [
        '<p>First sentence.</p>',
        '<p>Second sentence.</p>',
        '<p>Third sentence.</p>',
        '<p>New paragraph here.</p>',
        '<p>Author name</p>',
        '<a href="http://example.com/img.jpg"><img src="http://example.com/img.jpg" alt="" /></a>',
      ].join('\n'),
    )
  })
})
