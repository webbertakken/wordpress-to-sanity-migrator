import { describe, it, expect } from 'vitest'
import { htmlToBlockContent } from '../html-to-portable-text'
import type { MigrationImageBlock, MigrationTextBlock } from '../../types/migration'

/**
 * Regression tests for raw WordPress `post_content` that arrives without
 * `<p>` tags around plain text. This shape is common in legacy WordPress
 * exports where every line is separated by `\r\n` and every paragraph by
 * `\r\n\r\n`. Every line break in the source is expected to become its own
 * paragraph block, with media (such as a trailing `<a><img></a>` link)
 * extracted as a sibling block.
 */
describe('htmlToBlockContent with raw WordPress post_content', () => {
  it('treats every newline as a paragraph break', async () => {
    const html = 'First paragraph here.\r\nWith a separate line.\r\n\r\nSecond paragraph here.'

    const { content } = await htmlToBlockContent(html)

    expect(content).toHaveLength(3)
    expect((content[0] as MigrationTextBlock).children?.[0].text).toBe('First paragraph here.')
    expect((content[1] as MigrationTextBlock).children?.[0].text).toBe('With a separate line.')
    expect((content[2] as MigrationTextBlock).children?.[0].text).toBe('Second paragraph here.')
  })

  it('extracts a trailing image and splits the preceding text into paragraphs', async () => {
    const html =
      'Closing remarks line one,\r\nClosing remarks line two<a href="http://example.com/img.jpg"><img src="http://example.com/img.jpg" alt="" /></a>'

    const { content } = await htmlToBlockContent(html)

    expect(content).toHaveLength(3)
    expect((content[0] as MigrationTextBlock).children?.[0].text).toBe('Closing remarks line one,')
    expect((content[1] as MigrationTextBlock).children?.[0].text).toBe('Closing remarks line two')
    expect((content[2] as MigrationImageBlock).url).toBe('http://example.com/img.jpg')
  })

  it('splits a long raw post with implicit paragraphs and a trailing image into one paragraph per line', async () => {
    const html =
      'Opening line announcing a milestone has been reached.\r\n' +
      'A second line of additional context that wraps to the next sentence.\r\n' +
      'A third line acknowledging contributors and explaining future plans.\r\n' +
      'A fourth line thanking visitors and inviting feedback.\r\n\r\n' +
      'Sign-off line one,\r\n' +
      'Sign-off line two<a href="http://example.com/wp-content/uploads/2013/07/sample.jpg"><img class="alignnone size-full wp-image-1842" src="http://example.com/wp-content/uploads/2013/07/sample.jpg" alt="" width="1123" height="1685" /></a>'

    const { content } = await htmlToBlockContent(html)

    // Six text paragraphs followed by one image block.
    expect(content).toHaveLength(7)

    const expectedParagraphs = [
      'Opening line announcing a milestone has been reached.',
      'A second line of additional context that wraps to the next sentence.',
      'A third line acknowledging contributors and explaining future plans.',
      'A fourth line thanking visitors and inviting feedback.',
      'Sign-off line one,',
      'Sign-off line two',
    ]

    expectedParagraphs.forEach((text, index) => {
      const block = content[index] as MigrationTextBlock
      expect(block._type).toBe('block')
      expect(block.children?.[0].text).toBe(text)
    })

    const image = content[6] as MigrationImageBlock
    expect(image._type).toBe('image')
    expect(image.url).toBe('http://example.com/wp-content/uploads/2013/07/sample.jpg')
  })
})
