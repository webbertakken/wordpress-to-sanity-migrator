import { describe, it, expect } from 'vitest'
import { htmlToBlockContent } from '../html-to-portable-text'
import { blockContentToHtml } from '../block-content-to-html'

describe('Audio Block Conversion', () => {
  describe('WordPress audio block to Sanity audio block', () => {
    it('should convert WordPress audio block pattern correctly', async () => {
      const wordpressHtml = `
        <!-- wp:audio {"id":3344} -->
        <figure class="wp-block-audio">
          <audio controls src="http://bert.webbink.eu/wp-content/uploads/2023/03/08-Rolde-Jacobuskerk-Ab.wav"></audio>
        </figure>
        <!-- /wp:audio -->
      `

      const result = await htmlToBlockContent(wordpressHtml)

      // Check that content was extracted
      expect(result.content).toBeDefined()
      expect(result.content.length).toBeGreaterThan(0)

      // Find the audio block
      const audioBlock = result.content.find(block => block._type === 'audio')
      expect(audioBlock).toBeDefined()
      
      if (audioBlock && audioBlock._type === 'audio') {
        expect(audioBlock.url).toBe('http://bert.webbink.eu/wp-content/uploads/2023/03/08-Rolde-Jacobuskerk-Ab.wav')
        expect(audioBlock.showControls).toBe(true)
        expect(audioBlock.autoplay).toBe(false)
      }

      // Check media extraction
      expect(result.media).toBeDefined()
      expect(result.media.length).toBeGreaterThan(0)
      
      const audioMedia = result.media.find(m => m.type === 'audio')
      expect(audioMedia).toBeDefined()
      expect(audioMedia?.url).toBe('http://bert.webbink.eu/wp-content/uploads/2023/03/08-Rolde-Jacobuskerk-Ab.wav')
    })

    it('should handle audio with figcaption', async () => {
      const wordpressHtml = `
        <figure class="wp-block-audio">
          <audio controls src="http://example.com/audio.mp3"></audio>
          <figcaption>My Audio Title</figcaption>
        </figure>
      `

      const result = await htmlToBlockContent(wordpressHtml)
      const audioBlock = result.content.find(block => block._type === 'audio')
      
      expect(audioBlock).toBeDefined()
      if (audioBlock && audioBlock._type === 'audio') {
        expect(audioBlock.title).toBe('My Audio Title')
      }
    })

    it('should handle standalone audio elements', async () => {
      const wordpressHtml = `
        <p>Some text before</p>
        <audio controls autoplay src="http://example.com/music.wav"></audio>
        <p>Some text after</p>
      `

      const result = await htmlToBlockContent(wordpressHtml)
      
      // Should have 3 blocks: paragraph, audio, paragraph
      expect(result.content.length).toBe(3)
      
      const audioBlock = result.content[1]
      expect(audioBlock._type).toBe('audio')
      
      if (audioBlock._type === 'audio') {
        expect(audioBlock.url).toBe('http://example.com/music.wav')
        expect(audioBlock.showControls).toBe(true)
        expect(audioBlock.autoplay).toBe(true)
      }
    })
  })

  describe('Audio block to HTML conversion', () => {
    it('should convert audio block back to HTML for preview', () => {
      const audioBlock = {
        _type: 'audio' as const,
        _key: 'audio1',
        url: 'http://example.com/audio.mp3',
        title: 'Test Audio',
        showControls: true,
        autoplay: false
      }

      const html = blockContentToHtml([audioBlock])
      
      expect(html).toContain('<audio controls>')
      expect(html).toContain('src="http://example.com/audio.mp3"')
      expect(html).toContain('<figcaption>Test Audio</figcaption>')
      expect(html).not.toContain('autoplay')
    })

    it('should handle local audio paths', () => {
      const audioBlock = {
        _type: 'audio' as const,
        _key: 'audio2',
        localPath: 'input/uploads/2023/03/audio.wav',
        showControls: true
      }

      const html = blockContentToHtml([audioBlock])
      
      expect(html).toContain('/api/serve-media?path=')
      expect(html).toContain(encodeURIComponent('input/uploads/2023/03/audio.wav'))
    })
  })

  describe('Mixed content with audio', () => {
    it('should handle content with text, images, and audio', async () => {
      const mixedHtml = `
        <p>Introduction paragraph</p>
        <figure class="wp-block-image">
          <img src="http://example.com/image.jpg" alt="Test image">
        </figure>
        <p>Middle paragraph</p>
        <figure class="wp-block-audio">
          <audio controls src="http://example.com/audio.mp3"></audio>
          <figcaption>Audio description</figcaption>
        </figure>
        <p>Conclusion paragraph</p>
      `

      const result = await htmlToBlockContent(mixedHtml)
      
      // Debug: log what blocks we got
      console.log('Blocks:', result.content.map(b => ({ type: b._type, text: b._type === 'block' ? b.children?.[0]?.text : undefined })))
      
      // Should have 5 blocks total
      expect(result.content.length).toBe(5)
      
      // Check block types in order
      expect(result.content[0]._type).toBe('block') // p
      expect(result.content[1]._type).toBe('image')
      expect(result.content[2]._type).toBe('block') // p
      expect(result.content[3]._type).toBe('audio')
      expect(result.content[4]._type).toBe('block') // p
      
      // Verify audio block details
      const audioBlock = result.content[3]
      if (audioBlock._type === 'audio') {
        expect(audioBlock.title).toBe('Audio description')
        expect(audioBlock.url).toBe('http://example.com/audio.mp3')
      }
      
      // Check media extraction includes both image and audio
      expect(result.media.length).toBe(2)
      expect(result.media.some(m => m.type === 'image')).toBe(true)
      expect(result.media.some(m => m.type === 'audio')).toBe(true)
    })
  })
})