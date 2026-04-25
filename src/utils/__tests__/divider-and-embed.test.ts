import { describe, it, expect } from 'vitest'
import { htmlToBlockContent } from '../html-to-portable-text'
import { blockContentToHtml } from '../block-content-to-html'
import type {
  MigrationDividerBlock,
  MigrationEmbedBlock,
  MigrationVideoBlock,
} from '../../types/migration'

describe('htmlToBlockContent — divider and embed', () => {
  describe('<hr> -> divider block', () => {
    it('produces a divider block from a self-closing <hr/>', async () => {
      const html = '<p>Above</p><hr/><p>Below</p>'

      const { content } = await htmlToBlockContent(html)

      expect(content).toHaveLength(3)
      expect(content[0]._type).toBe('block')
      expect(content[1]._type).toBe('divider')
      expect(content[2]._type).toBe('block')
      const divider = content[1] as MigrationDividerBlock
      expect(divider._key).toBeTruthy()
    })

    it('produces a divider block from an opening <hr> tag', async () => {
      const html = 'Intro\n\n<hr>\n\nOutro'

      const { content } = await htmlToBlockContent(html)

      const dividers = content.filter((b) => b._type === 'divider')
      expect(dividers).toHaveLength(1)
    })
  })

  describe('<iframe> routing', () => {
    it('routes a YouTube iframe through the existing video extractor', async () => {
      const html =
        '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" frameborder="0"></iframe>'

      const { content } = await htmlToBlockContent(html)

      expect(content).toHaveLength(1)
      const video = content[0] as MigrationVideoBlock
      expect(video._type).toBe('video')
      expect(video.videoType).toBe('youtube')
    })

    it('routes a Vimeo iframe through the existing video extractor', async () => {
      const html = '<iframe src="https://player.vimeo.com/video/123456" frameborder="0"></iframe>'

      const { content } = await htmlToBlockContent(html)

      const video = content[0] as MigrationVideoBlock
      expect(video._type).toBe('video')
      expect(video.videoType).toBe('vimeo')
    })

    it('produces an embed block for any other iframe host', async () => {
      const html =
        '<iframe src="https://open.spotify.com/embed/track/abc" allowtransparency="true"></iframe>'

      const { content } = await htmlToBlockContent(html)

      expect(content).toHaveLength(1)
      const embed = content[0] as MigrationEmbedBlock
      expect(embed._type).toBe('embed')
      expect(embed.url).toBe('https://open.spotify.com/embed/track/abc')
    })
  })

  describe('renderer', () => {
    it('renders a divider block as a horizontal rule', () => {
      const html = blockContentToHtml([{ _type: 'divider', _key: 'd1' }])
      expect(html).toBe('<hr />')
    })

    it('renders an embed block as a figure with an iframe', () => {
      const html = blockContentToHtml([
        { _type: 'embed', _key: 'e1', url: 'https://example.com/widget' },
      ])
      expect(html).toContain('<iframe src="https://example.com/widget"')
      expect(html).toContain('class="embed-block"')
    })

    it('renders an embed block with a caption', () => {
      const html = blockContentToHtml([
        {
          _type: 'embed',
          _key: 'e2',
          url: 'https://example.com/widget',
          caption: 'Interactive widget',
        },
      ])
      expect(html).toContain('<figcaption>Interactive widget</figcaption>')
    })

    it('renders an image block with a figcaption when caption is set', () => {
      const html = blockContentToHtml([
        {
          _type: 'image',
          _key: 'i1',
          alt: 'A scene',
          url: 'http://example.com/x.jpg',
          caption: 'A descriptive caption',
        },
      ])
      expect(html).toContain('<figcaption>A descriptive caption</figcaption>')
      expect(html).toContain('alt="A scene"')
    })

    it('omits the figcaption when no caption is set', () => {
      const html = blockContentToHtml([
        {
          _type: 'image',
          _key: 'i2',
          alt: 'A scene',
          url: 'http://example.com/x.jpg',
        },
      ])
      expect(html).not.toContain('<figcaption>')
    })

    it('emits data-align on the figure when alignment is set', () => {
      const html = blockContentToHtml([
        {
          _type: 'image',
          _key: 'i3',
          alt: '',
          url: 'http://example.com/x.jpg',
          alignment: 'right',
        },
      ])
      expect(html).toContain('data-align="right"')
    })

    it('omits data-align when no alignment is set', () => {
      const html = blockContentToHtml([
        {
          _type: 'image',
          _key: 'i4',
          alt: '',
          url: 'http://example.com/x.jpg',
        },
      ])
      expect(html).not.toContain('data-align')
    })
  })
})
