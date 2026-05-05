import { describe, it, expect } from 'vitest'
import type { MigrationImageBlock } from '../../types/migration'
import { htmlToBlockContent } from '../html-to-portable-text'

/**
 * Image fidelity — the migrator should preserve the information WordPress
 * authors encode around an image: the figcaption text and any alignment
 * class on either the `<figure>` or the `<img>`.
 */
describe('htmlToBlockContent — image fidelity', () => {
  describe('captions', () => {
    it('captures <figcaption> text into image.caption', async () => {
      const html =
        '<figure class="wp-block-image"><img src="http://example.com/photo.jpg" alt="A photo" /><figcaption>Sunset over the harbour</figcaption></figure>'

      const { content } = await htmlToBlockContent(html)

      expect(content).toHaveLength(1)
      const image = content[0] as MigrationImageBlock
      expect(image._type).toBe('image')
      expect(image.alt).toBe('A photo')
      expect(image.caption).toBe('Sunset over the harbour')
    })

    it('omits the caption field when no figcaption is present', async () => {
      const html = '<img src="http://example.com/photo.jpg" alt="A photo" />'

      const { content } = await htmlToBlockContent(html)

      const image = content[0] as MigrationImageBlock
      expect(image.caption).toBeUndefined()
    })

    it('decodes HTML entities inside figcaption text', async () => {
      const html =
        '<figure><img src="http://example.com/x.jpg" alt="" /><figcaption>Smith &amp; Jones &mdash; portrait</figcaption></figure>'

      const { content } = await htmlToBlockContent(html)

      const image = content[0] as MigrationImageBlock
      expect(image.caption).toBe('Smith & Jones — portrait')
    })
  })

  describe('alignment', () => {
    it('captures aligncenter on the <figure>', async () => {
      const html =
        '<figure class="wp-block-image aligncenter"><img src="http://example.com/x.jpg" alt="" /></figure>'

      const { content } = await htmlToBlockContent(html)

      const image = content[0] as MigrationImageBlock
      expect(image.alignment).toBe('center')
    })

    it('captures alignleft on the <img>', async () => {
      const html = '<img class="alignleft size-full" src="http://example.com/x.jpg" alt="" />'

      const { content } = await htmlToBlockContent(html)

      const image = content[0] as MigrationImageBlock
      expect(image.alignment).toBe('left')
    })

    it('captures alignright on the <img>', async () => {
      const html = '<img class="alignright" src="http://example.com/x.jpg" alt="" />'

      const { content } = await htmlToBlockContent(html)

      const image = content[0] as MigrationImageBlock
      expect(image.alignment).toBe('right')
    })

    it('treats alignnone as the default and omits the alignment field', async () => {
      const html = '<img class="alignnone size-full" src="http://example.com/x.jpg" alt="" />'

      const { content } = await htmlToBlockContent(html)

      const image = content[0] as MigrationImageBlock
      expect(image.alignment).toBeUndefined()
    })

    it('lets the <img>-level alignment override the figure-level one', async () => {
      const html =
        '<figure class="aligncenter"><img class="alignleft" src="http://example.com/x.jpg" alt="" /></figure>'

      const { content } = await htmlToBlockContent(html)

      const image = content[0] as MigrationImageBlock
      expect(image.alignment).toBe('left')
    })
  })

  it('captures both caption and alignment together', async () => {
    const html =
      '<figure class="wp-block-image alignright"><img src="http://example.com/x.jpg" alt="A scene" /><figcaption>Caption text</figcaption></figure>'

    const { content } = await htmlToBlockContent(html)

    const image = content[0] as MigrationImageBlock
    expect(image.alignment).toBe('right')
    expect(image.caption).toBe('Caption text')
    expect(image.alt).toBe('A scene')
  })
})
