import { describe, it, expect } from 'vitest'
import { expandWordPressShortcodes } from '../wordpress-shortcodes'

describe('expandWordPressShortcodes — additional edge cases', () => {
  describe('[audio] alternative source attributes', () => {
    it.each([
      ['m4a', '<audio src="http://example.com/clip.m4a" controls></audio>'],
      ['ogg', '<audio src="http://example.com/clip.ogg" controls></audio>'],
      ['wma', '<audio src="http://example.com/clip.wma" controls></audio>'],
      ['flac', '<audio src="http://example.com/clip.flac" controls></audio>'],
    ])('expands [audio %s="..."] form', (key, expected) => {
      const html = `[audio ${key}="http://example.com/clip.${key}"]`
      expect(expandWordPressShortcodes(html)).toBe(expected)
    })

    it('passes [audio] through untouched when no src/format attribute is present', () => {
      const html = '[audio]'
      expect(expandWordPressShortcodes(html)).toBe('[audio]')
    })

    it('handles bare-value attributes', () => {
      const html = '[audio src=http://example.com/clip.mp3]'
      expect(expandWordPressShortcodes(html)).toBe(
        '<audio src="http://example.com/clip.mp3" controls></audio>',
      )
    })

    it('handles single-quoted values', () => {
      const html = "[audio src='http://example.com/clip.mp3']"
      expect(expandWordPressShortcodes(html)).toBe(
        '<audio src="http://example.com/clip.mp3" controls></audio>',
      )
    })
  })

  describe('[video] alternative source attributes', () => {
    it.each([
      ['webm', '<video src="http://example.com/clip.webm" controls></video>'],
      ['ogv', '<video src="http://example.com/clip.ogv" controls></video>'],
      ['m4v', '<video src="http://example.com/clip.m4v" controls></video>'],
      ['flv', '<video src="http://example.com/clip.flv" controls></video>'],
      ['wmv', '<video src="http://example.com/clip.wmv" controls></video>'],
    ])('expands [video %s="..."] form', (key, expected) => {
      const html = `[video ${key}="http://example.com/clip.${key}"]`
      expect(expandWordPressShortcodes(html)).toBe(expected)
    })

    it('passes [video] through untouched when no src/format attribute is present', () => {
      const html = '[video]'
      expect(expandWordPressShortcodes(html)).toBe('[video]')
    })

    it('emits only the dimensions that are provided', () => {
      const html = '[video width="640" mp4="http://example.com/clip.mp4"]'
      expect(expandWordPressShortcodes(html)).toBe(
        '<video src="http://example.com/clip.mp4" controls width="640"></video>',
      )
    })
  })

  describe('[ddownload]', () => {
    it('passes the shortcode through unchanged when no id attribute is present', () => {
      const html = 'See [ddownload] for the score.'
      expect(expandWordPressShortcodes(html)).toBe('See [ddownload] for the score.')
    })
  })

  describe('[caption] without an embedded element', () => {
    it('emits the inner content verbatim with no figcaption when no </a> or /> is found', () => {
      const html = '[caption align="alignleft"]Just a stray caption[/caption]'
      const out = expandWordPressShortcodes(html)
      expect(out).toBe('<figure class="alignleft">Just a stray caption</figure>')
    })

    it('defaults align to alignnone when no align attribute is provided', () => {
      const html =
        '[caption width="100"]<img src="http://example.com/x.jpg" /> Caption text[/caption]'
      const out = expandWordPressShortcodes(html)
      expect(out.startsWith('<figure class="alignnone">')).toBe(true)
    })
  })
})
