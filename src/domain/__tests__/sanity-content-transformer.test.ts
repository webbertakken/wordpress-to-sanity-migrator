import { describe, it, expect } from 'vitest'
import { SanityContentTransformer } from '../sanity-content-transformer'
import type { WordPressPost } from '../../types/migration'

describe('SanityContentTransformer', () => {
  const mockWordPressPost: WordPressPost = {
    ID: 123,
    post_title: 'Test Post Title',
    post_content:
      '<p>This is a <strong>test</strong> post with <em>formatted</em> content.</p><p>Second paragraph.</p>',
    post_excerpt: 'This is the excerpt',
    post_date: '2024-01-15 10:30:00',
    post_modified: '2024-01-16 11:30:00',
    post_status: 'publish',
    post_name: 'test-post-title',
    post_type: 'post',
    post_parent: 0,
    menu_order: 0,
    guid: 'https://example.com/?p=123',
  }

  const mockWordPressPage: WordPressPost = {
    ...mockWordPressPost,
    ID: 456,
    post_title: 'Test Page Title',
    post_name: 'test-page-title',
    post_type: 'page',
    post_content: '<h1>Page Heading</h1><p>Page content goes here.</p>',
  }

  describe('toSanityPost', () => {
    it('should transform a WordPress post correctly', async () => {
      const sanityPost = await SanityContentTransformer.toSanityPost(mockWordPressPost)

      expect(sanityPost._type).toBe('post')
      expect(sanityPost.title).toBe('Test Post Title')
      expect(sanityPost.slug.current).toBe('test-post-title')
      expect(sanityPost.slug.source).toBe('title')
      expect(sanityPost.excerpt).toBe('This is the excerpt')
      expect(sanityPost.date).toBe('2024-01-15 10:30:00')
      expect(sanityPost.coverImage._type).toBe('image')
      expect(sanityPost.coverImage.alt).toBe('Cover image for Test Post Title')
    })

    it('should convert HTML content to block content', async () => {
      const sanityPost = await SanityContentTransformer.toSanityPost(mockWordPressPost)

      expect(sanityPost.content).toBeDefined()
      expect(sanityPost.content?.length).toBeGreaterThan(0)

      // Check first block
      const firstBlock = sanityPost.content?.[0]
      expect(firstBlock?._type).toBe('block')
      if (firstBlock?._type === 'block') {
        expect(firstBlock.style).toBe('normal')
      }

      // Verify text content is preserved
      const plainText = sanityPost.body
      expect(plainText).toContain('This is a test post with formatted content.')
      expect(plainText).toContain('Second paragraph.')
    }, 10000)
  })

  describe('toSanityPage', () => {
    it('should transform a WordPress page correctly', () => {
      const sanityPage = SanityContentTransformer.toSanityPage(mockWordPressPage)

      expect(sanityPage._type).toBe('page')
      expect(sanityPage.name).toBe('Test Page Title')
      expect(sanityPage.heading).toBe('Test Page Title')
      expect(sanityPage.slug.current).toBe('test-page-title')
      expect(sanityPage.slug.source).toBe('name')
      expect(sanityPage.subheading).toBe('This is the excerpt')
      expect(sanityPage.media).toBeDefined()
    })
  })

  describe('transform', () => {
    it('should transform posts to SanityPostContent by default', async () => {
      const result = await SanityContentTransformer.transform(mockWordPressPost)
      expect(result._type).toBe('post')
    }, 10000)

    it('should transform pages to SanityPageContent by default', async () => {
      const result = await SanityContentTransformer.transform(mockWordPressPage)
      expect(result._type).toBe('page')
    })

    it('should transform pages as posts when treatAsPost is true', async () => {
      const result = await SanityContentTransformer.transform(mockWordPressPage, {
        treatAsPost: true,
      })
      expect(result._type).toBe('post')
      if (result._type === 'post') {
        expect(result.title).toBe('Test Page Title')
      }
    }, 10000)
  })

  describe('fromData', () => {
    it('should create value object from raw data', () => {
      const sanityPost = SanityContentTransformer.fromData({
        title: 'Manual Post',
        slug: 'manual-post',
        excerpt: 'Manual excerpt',
        date: '2024-01-20',
        body: 'Manual body text',
      })

      expect(sanityPost.title).toBe('Manual Post')
      expect(sanityPost.slug.current).toBe('manual-post')
      expect(sanityPost.excerpt).toBe('Manual excerpt')
      expect(sanityPost.body).toBe('Manual body text')
      expect(sanityPost.media).toEqual([])
    })
  })

  describe('utility methods', () => {
    it('should calculate word count correctly', async () => {
      const sanityPost = await SanityContentTransformer.toSanityPost(mockWordPressPost)
      const wordCount = SanityContentTransformer.getWordCount(sanityPost)

      expect(wordCount).toBeGreaterThan(0)
      expect(wordCount).toBeLessThan(20) // The test content has fewer than 20 words
    }, 10000)

    it('should detect media presence', async () => {
      const postWithoutMedia = await SanityContentTransformer.toSanityPost(mockWordPressPost)
      expect(SanityContentTransformer.hasMedia(postWithoutMedia)).toBe(false)

      const postWithMedia = await SanityContentTransformer.toSanityPost({
        ...mockWordPressPost,
        post_content: '<p>Text with image</p><img src="https://example.com/image.jpg" alt="Test">',
      })
      expect(SanityContentTransformer.hasMedia(postWithMedia)).toBe(true)
    }, 10000)

    it('should provide media summary', async () => {
      const postWithMedia = await SanityContentTransformer.toSanityPost({
        ...mockWordPressPost,
        post_content:
          '<p>Content</p><img src="https://example.com/image.jpg"><audio src="https://example.com/audio.mp3"></audio>',
      })

      const summary = SanityContentTransformer.getMediaSummary(postWithMedia)
      expect(summary.total).toBe(2)
      expect(summary.byType.image).toBe(1)
      expect(summary.byType.audio).toBe(1)
    }, 10000)

    it('should return value object with correct structure', async () => {
      const sanityPost = await SanityContentTransformer.toSanityPost(mockWordPressPost)

      expect(sanityPost._type).toBe('post')
      expect(sanityPost.title).toBe('Test Post Title')
      expect(sanityPost.slug).toEqual({
        _type: 'slug',
        current: 'test-post-title',
        source: 'title',
      })
      expect(sanityPost.media).toBeDefined()
    }, 10000)

    it('should handle word count for pages', async () => {
      const sanityPage = SanityContentTransformer.toSanityPage(mockWordPressPage)
      const wordCount = SanityContentTransformer.getWordCount(sanityPage)

      expect(wordCount).toBe(0) // Pages don't have content field
    })
  })
})
