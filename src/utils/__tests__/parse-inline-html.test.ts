import { describe, it, expect } from 'vitest'
import { parseInlineHTML, createBlockWithInlineContent } from '../parse-inline-html'

describe('parseInlineHTML', () => {
  it('returns no children when given an empty string', () => {
    const result = parseInlineHTML('')
    expect(result.children).toEqual([])
    expect(result.markDefs).toEqual([])
  })

  it('decodes the standard set of HTML entities (joined plain-text path)', () => {
    const { children } = parseInlineHTML('a &amp; b &quot;d&quot; &#39;e&#39; &nbsp;f')
    expect(children).toHaveLength(1)
    expect(children[0].text).toBe('a & b "d" \'e\'  f')
  })

  it('decodes mdash, ndash and hellip entities', () => {
    const { children } = parseInlineHTML('hi &mdash; there &ndash; etc &hellip;')
    expect(children).toHaveLength(1)
    expect(children[0].text).toBe('hi — there – etc …')
  })

  it('converts <br> tags into newlines', () => {
    const { children } = parseInlineHTML('line one<br />line two<br>line three')
    expect(children).toHaveLength(1)
    expect(children[0].text).toBe('line one\nline two\nline three')
  })

  it('captures bold and italic via <strong>/<b> and <em>/<i>', () => {
    // Whitespace-only spans between tags are dropped by the trim guard, so
    // the children sequence reads: leading text + each marked run.
    const { children } = parseInlineHTML(
      'plain <b>bold</b> <strong>strong</strong> <i>italic</i> <em>em</em>',
    )
    expect(children.map((c) => c.text)).toEqual(['plain ', 'bold', 'strong', 'italic', 'em'])
    expect(children.map((c) => c.marks)).toEqual([
      undefined,
      ['strong'],
      ['strong'],
      ['em'],
      ['em'],
    ])
  })

  it('captures underline, strike-through and code marks', () => {
    const { children } = parseInlineHTML(
      '<u>u</u> <s>s</s> <del>d</del> <strike>x</strike> <code>c</code>',
    )
    const marks = children.filter((c) => c.text.trim()).map((c) => c.marks)
    expect(marks).toEqual([
      ['underline'],
      ['strike-through'],
      ['strike-through'],
      ['strike-through'],
      ['code'],
    ])
  })

  it('records link mark defs and applies the link mark to the inner text', () => {
    const { children, markDefs } = parseInlineHTML('see <a href="https://example.com">here</a>')
    expect(markDefs).toHaveLength(1)
    expect(markDefs[0]).toMatchObject({ _type: 'link', href: 'https://example.com' })
    const linkChild = children.find((c) => c.text === 'here')!
    expect(linkChild.marks).toEqual([markDefs[0]._key])
  })

  it('does not create a mark def for an <a> without an href', () => {
    const { children, markDefs } = parseInlineHTML('see <a>here</a>')
    expect(markDefs).toEqual([])
    const linkChild = children.find((c) => c.text === 'here')!
    expect(linkChild.marks).toBeUndefined()
  })

  it('strips inline-style attributes on bold/italic tags but still applies the mark', () => {
    const { children } = parseInlineHTML('<b style="color:red">bold</b>')
    expect(children[0].marks).toEqual(['strong'])
  })

  it('falls back to a single span with the stripped text when no inline tokens emit a child', () => {
    const { children } = parseInlineHTML('<span>only space tokens</span>')
    expect(children).toHaveLength(1)
    expect(children[0].text).toBe('only space tokens')
    expect(children[0].marks).toBeUndefined()
  })

  it('returns no children when stripped text is empty', () => {
    const { children } = parseInlineHTML('<br /><br />')
    // The newline-only "text" is whitespace and is dropped by the trim guard.
    expect(children).toEqual([])
  })

  it('emits a single fallback span when the loop produced no children but stripped text is non-empty', () => {
    // A bare "<" (no matching ">") slips through both regex alternations:
    // it cannot match a tag, and the text alternation excludes "<". The
    // loop therefore emits no children and the post-loop fallback path
    // takes over.
    const { children } = parseInlineHTML('<')
    expect(children).toHaveLength(1)
    expect(children[0].text).toBe('<')
    expect(children[0].marks).toBeUndefined()
  })

  it('ignores tags it does not understand', () => {
    const { children } = parseInlineHTML('<div>hello</div>')
    expect(children).toHaveLength(1)
    expect(children[0].text).toBe('hello')
  })
})

describe('createBlockWithInlineContent', () => {
  it('returns a default normal-style text block with parsed inline content', () => {
    const block = createBlockWithInlineContent('hello <strong>world</strong>')
    expect(block._type).toBe('block')
    expect(block.style).toBe('normal')
    expect(block.children).toHaveLength(2)
    expect(block.children?.[0].text).toBe('hello ')
    expect(block.children?.[1].text).toBe('world')
    expect(block.children?.[1].marks).toEqual(['strong'])
  })

  it('threads the requested style through', () => {
    const block = createBlockWithInlineContent('hi', 'h2')
    expect(block.style).toBe('h2')
  })

  it('returns a single empty span when the input has no usable text', () => {
    const block = createBlockWithInlineContent('')
    expect(block.children).toHaveLength(1)
    expect(block.children?.[0].text).toBe('')
    expect(block.markDefs).toEqual([])
  })

  it('exposes the link mark defs collected from the inline parse', () => {
    const block = createBlockWithInlineContent('see <a href="https://example.com">here</a>')
    expect(block.markDefs).toHaveLength(1)
    expect(block.markDefs?.[0]).toMatchObject({ _type: 'link', href: 'https://example.com' })
  })
})
