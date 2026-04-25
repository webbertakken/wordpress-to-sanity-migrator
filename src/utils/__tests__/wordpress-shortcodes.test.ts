import { describe, it, expect } from 'vitest'
import { expandWordPressShortcodes } from '../wordpress-shortcodes'
import { htmlToBlockContent } from '../html-to-portable-text'
import type {
  MigrationAudioBlock,
  MigrationBlockContent,
  MigrationImageBlock,
  MigrationTextBlock,
  MigrationVideoBlock,
} from '../../types/migration'

const asImageBlock = (block: MigrationBlockContent[number]): MigrationImageBlock => {
  if (block._type !== 'image') {
    throw new Error(`expected image block, got '${block._type}'`)
  }
  return block
}

const asAudioBlock = (block: MigrationBlockContent[number]): MigrationAudioBlock => {
  if (block._type !== 'audio') {
    throw new Error(`expected audio block, got '${block._type}'`)
  }
  return block
}

const asVideoBlock = (block: MigrationBlockContent[number]): MigrationVideoBlock => {
  if (block._type !== 'video') {
    throw new Error(`expected video block, got '${block._type}'`)
  }
  return block
}

const asTextBlock = (block: MigrationBlockContent[number]): MigrationTextBlock => {
  if (block._type !== 'block') {
    throw new Error(`expected text block, got '${block._type}'`)
  }
  return block
}

describe('expandWordPressShortcodes', () => {
  it('returns an empty string for empty input', () => {
    expect(expandWordPressShortcodes('')).toBe('')
  })

  it('passes through HTML that contains no shortcodes', () => {
    const html = '<p>Hello <strong>world</strong></p>'
    expect(expandWordPressShortcodes(html)).toBe(html)
  })

  describe('[caption]', () => {
    it('expands a [caption] wrapping a plain <img> into a <figure> with a <figcaption>', () => {
      const html =
        '[caption id="attachment_1" align="aligncenter" width="600"]' +
        '<img src="http://example.com/x.jpg" alt="Alt text" /> The caption text' +
        '[/caption]'

      const out = expandWordPressShortcodes(html)

      expect(out).toBe(
        '<figure class="aligncenter">' +
          '<img src="http://example.com/x.jpg" alt="Alt text" />' +
          '<figcaption>The caption text</figcaption>' +
          '</figure>',
      )
    })

    it('preserves the wrapping <a> when the image is link-wrapped', () => {
      const html =
        '[caption align="alignnone" width="100"]' +
        '<a href="http://example.com/x.jpg"><img src="http://example.com/x.jpg" alt="" /></a> ' +
        'Caption' +
        '[/caption]'

      const out = expandWordPressShortcodes(html)

      expect(out).toContain('<a href="http://example.com/x.jpg">')
      expect(out).toContain('</a>')
      expect(out).toContain('<figcaption>Caption</figcaption>')
      expect(out.startsWith('<figure class="alignnone">')).toBe(true)
    })

    it('omits <figcaption> when no caption text follows the inner element', () => {
      const html =
        '[caption align="alignright"]' +
        '<img src="http://example.com/x.jpg" alt="" />' +
        '[/caption]'

      const out = expandWordPressShortcodes(html)

      expect(out).toBe(
        '<figure class="alignright"><img src="http://example.com/x.jpg" alt="" /></figure>',
      )
    })

    it('end-to-end: produces an image block with caption + alignment', async () => {
      const html =
        '[caption align="aligncenter" width="600"]' +
        '<img src="http://example.com/x.jpg" alt="Alt text" /> Sunset over the harbour' +
        '[/caption]'

      const { content } = await htmlToBlockContent(html)

      expect(content).toHaveLength(1)
      const image = asImageBlock(content[0])
      expect(image.url).toBe('http://example.com/x.jpg')
      expect(image.alt).toBe('Alt text')
      expect(image.caption).toBe('Sunset over the harbour')
      expect(image.alignment).toBe('center')
    })
  })

  describe('[audio]', () => {
    it('expands the mp3 form to an <audio> element', () => {
      const html = '[audio mp3="http://example.com/clip.mp3"]'
      expect(expandWordPressShortcodes(html)).toBe(
        '<audio src="http://example.com/clip.mp3" controls></audio>',
      )
    })

    it('expands the wav form', () => {
      const html = '[audio wav="http://example.com/clip.wav"]'
      expect(expandWordPressShortcodes(html)).toBe(
        '<audio src="http://example.com/clip.wav" controls></audio>',
      )
    })

    it('honours the explicit src attribute over format-specific attributes', () => {
      const html = '[audio src="http://example.com/main.mp3" mp3="http://example.com/other.mp3"]'
      expect(expandWordPressShortcodes(html)).toBe(
        '<audio src="http://example.com/main.mp3" controls></audio>',
      )
    })

    it('passes autoplay and loop through to the <audio> tag', () => {
      const html = '[audio mp3="http://example.com/clip.mp3" autoplay loop]'
      expect(expandWordPressShortcodes(html)).toBe(
        '<audio src="http://example.com/clip.mp3" controls autoplay loop></audio>',
      )
    })

    it('end-to-end: produces an audio block', async () => {
      const html = '[audio mp3="http://example.com/clip.mp3"]'

      const { content } = await htmlToBlockContent(html)

      expect(content).toHaveLength(1)
      const audio = asAudioBlock(content[0])
      expect(audio.url).toBe('http://example.com/clip.mp3')
      expect(audio.showControls).toBe(true)
    })
  })

  describe('[video]', () => {
    it('expands the mp4 form to a <video> element', () => {
      const html = '[video mp4="http://example.com/clip.mp4"]'
      expect(expandWordPressShortcodes(html)).toBe(
        '<video src="http://example.com/clip.mp4" controls></video>',
      )
    })

    it('passes width and height through to the <video> tag', () => {
      const html = '[video width="640" height="360" mp4="http://example.com/clip.mp4"]'
      expect(expandWordPressShortcodes(html)).toBe(
        '<video src="http://example.com/clip.mp4" controls width="640" height="360"></video>',
      )
    })

    it('end-to-end: produces a video block with videoType=url', async () => {
      const html = '[video mp4="http://example.com/clip.mp4"]'

      const { content } = await htmlToBlockContent(html)

      expect(content).toHaveLength(1)
      const video = asVideoBlock(content[0])
      expect(video.url).toBe('http://example.com/clip.mp4')
      expect(video.videoType).toBe('url')
    })
  })

  describe('[ddownload]', () => {
    it('replaces [ddownload id="N"] with a [Download #N] text placeholder', () => {
      const html = 'See [ddownload id="3012"] for the score.'
      expect(expandWordPressShortcodes(html)).toBe('See [Download #3012] for the score.')
    })

    it('end-to-end: surfaces as plain text in a paragraph block', async () => {
      const html = 'See [ddownload id="3012"] for the score.'

      const { content } = await htmlToBlockContent(html)

      expect(content).toHaveLength(1)
      const block = asTextBlock(content[0])
      expect(block.children?.[0].text).toBe('See [Download #3012] for the score.')
    })
  })

  describe('unknown shortcodes', () => {
    it('passes unknown shortcodes through unchanged', () => {
      const html = '[gallery ids="1,2,3"]'
      expect(expandWordPressShortcodes(html)).toBe(html)
    })
  })
})
