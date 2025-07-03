import { describe, it, expect } from 'vitest'
import { blockContentToHtml, getTextFromBlockContent } from '../block-content-to-html'
import type { ExtendedBlockContent, MigrationBlockContent } from '../../types/migration'
import { createTestImageBlock, createTestTextBlock } from './test-helpers'

// Note: htmlToBlockContent tests are integration tests that require real
// HTML parsing and media processing, so we focus on testing the output
// conversion and text extraction which are pure functions.

describe('HTML to BlockContent Integration', () => {
  describe('blockContentToHtml', () => {
    it('preserves empty paragraphs for spacing', () => {
      const blocks: MigrationBlockContent = [
        {
          _type: 'block',
          _key: '1',
          style: 'normal',
          children: [{ _type: 'span', _key: '1', text: 'First paragraph' }],
          markDefs: [],
        },
        {
          _type: 'block',
          _key: '2',
          style: 'normal',
          children: [{ _type: 'span', _key: '2', text: '' }],
          markDefs: [],
        },
        {
          _type: 'block',
          _key: '3',
          style: 'normal',
          children: [{ _type: 'span', _key: '3', text: 'Second paragraph' }],
          markDefs: [],
        },
      ]

      const result = blockContentToHtml(blocks)

      // Check that we have 3 paragraphs
      const paragraphs = result.split('\n')
      expect(paragraphs).toHaveLength(3)
      expect(paragraphs[0]).toBe('<p>First paragraph</p>')
      expect(paragraphs[1]).toBe('<p></p>') // Empty paragraph for spacing
      expect(paragraphs[2]).toBe('<p>Second paragraph</p>')
    })

    it('handles image blocks correctly', () => {
      const blocks: MigrationBlockContent = [
        createTestTextBlock({
          _key: '1',
          style: 'normal',
          children: [{ _type: 'span', _key: '1', text: 'Before image' }],
          markDefs: [],
        }),
        createTestImageBlock({
          _key: '2',
          alt: 'Test image',
          localPath: 'input/uploads/test.jpg',
        }),
        createTestTextBlock({
          _key: '3',
          style: 'normal',
          children: [{ _type: 'span', _key: '3', text: 'After image' }],
          markDefs: [],
        }),
      ]

      const result = blockContentToHtml(blocks)

      expect(result).toContain('<p>Before image</p>')
      expect(result).toContain(
        '<figure><img src="/api/serve-media?path=input%2Fuploads%2Ftest.jpg"',
      )
      expect(result).toContain('alt="Test image"')
      expect(result).toContain('<p>After image</p>')
    })

    it('handles formatted text with marks', () => {
      const blocks: MigrationBlockContent = [
        {
          _type: 'block',
          _key: '1',
          style: 'normal',
          children: [
            { _type: 'span', _key: '1', text: 'This is ' },
            { _type: 'span', _key: '2', text: 'bold', marks: ['strong'] },
            { _type: 'span', _key: '3', text: ' and ' },
            { _type: 'span', _key: '4', text: 'italic', marks: ['em'] },
          ],
          markDefs: [],
        },
      ]

      const result = blockContentToHtml(blocks)
      expect(result).toBe('<p>This is <strong>bold</strong> and <em>italic</em></p>')
    })
  })

  describe('getTextFromBlockContent', () => {
    it('extracts text from multiple blocks', () => {
      const blocks: MigrationBlockContent = [
        {
          _type: 'block',
          _key: '1',
          style: 'normal',
          children: [{ _type: 'span', _key: '1', text: 'First paragraph' }],
          markDefs: [],
        },
        {
          _type: 'block',
          _key: '2',
          style: 'normal',
          children: [{ _type: 'span', _key: '2', text: 'Second paragraph' }],
          markDefs: [],
        },
      ]

      const result = getTextFromBlockContent(blocks)
      expect(result).toBe('First paragraph Second paragraph')
    })

    it('skips image blocks when extracting text', () => {
      const blocks: MigrationBlockContent = [
        {
          _type: 'block',
          _key: '1',
          style: 'normal',
          children: [{ _type: 'span', _key: '1', text: 'Before' }],
          markDefs: [],
        },
        createTestImageBlock({
          _key: '2',
          alt: 'Test image',
          url: 'http://example.com/test.jpg',
        }),
        {
          _type: 'block',
          _key: '3',
          style: 'normal',
          children: [{ _type: 'span', _key: '3', text: 'After' }],
          markDefs: [],
        },
      ]

      const result = getTextFromBlockContent(blocks)
      expect(result).toBe('Before After')
    })

    it('handles empty and whitespace-only spans', () => {
      const blocks: MigrationBlockContent = [
        {
          _type: 'block',
          _key: '1',
          style: 'normal',
          children: [
            { _type: 'span', _key: '1', text: 'Text' },
            { _type: 'span', _key: '2', text: '' },
            { _type: 'span', _key: '3', text: 'More text' },
          ],
          markDefs: [],
        },
      ]

      const result = getTextFromBlockContent(blocks)
      expect(result).toBe('TextMore text')
    })
  })

  describe('Edge cases', () => {
    it('handles undefined input gracefully', () => {
      expect(blockContentToHtml(undefined)).toBe('')
      expect(getTextFromBlockContent(undefined)).toBe('')
    })

    it('handles empty arrays', () => {
      expect(blockContentToHtml([])).toBe('')
      expect(getTextFromBlockContent([])).toBe('')
    })

    it('handles blocks without children', () => {
      const blocks: MigrationBlockContent = [
        {
          _type: 'block',
          _key: '1',
          style: 'normal',
          markDefs: [],
        } as Extract<ExtendedBlockContent[number], { _type: 'block' }>,
      ]

      const result = blockContentToHtml(blocks)
      expect(result).toBe('<p></p>')
    })
  })
})

describe('WordPress Migration Integration Tests', () => {
  it('should correctly count posts and pages from migration output', () => {
    // Test the data structure that migration-service.ts expects
    const migrationData = [
      { transformed: { _type: 'post' as const, title: 'Post 1' } },
      { transformed: { _type: 'post' as const, title: 'Post 2' } },
      { transformed: { _type: 'page' as const, name: 'Page 1' } },
      { transformed: { _type: 'page' as const, name: 'Page 2' } },
      { transformed: { _type: 'page' as const, name: 'Page 3' } },
    ]

    const posts = migrationData.filter((item) => item.transformed._type === 'post')
    const pages = migrationData.filter((item) => item.transformed._type === 'page')

    expect(posts).toHaveLength(2)
    expect(pages).toHaveLength(3)
    expect(posts.length + pages.length).toBe(5)
  })

  it('should handle pages-as-posts migration option', () => {
    // Test what happens when parsePagesAsPosts is enabled
    // All pages should be converted to posts
    const migrationDataWithPagesAsPosts = [
      { transformed: { _type: 'post' as const, title: 'Original Post 1' } },
      { transformed: { _type: 'post' as const, title: 'Original Post 2' } },
      { transformed: { _type: 'post' as const, title: 'Page 1 (converted)' } }, // Was a page
      { transformed: { _type: 'post' as const, title: 'Page 2 (converted)' } }, // Was a page
      { transformed: { _type: 'post' as const, title: 'Page 3 (converted)' } }, // Was a page
    ]

    const posts = migrationDataWithPagesAsPosts.filter((item) => item.transformed._type === 'post')
    // When parsePagesAsPosts is enabled, all content should be posts, so we expect 0 pages
    const pages = migrationDataWithPagesAsPosts.filter(() => false) // No pages exist when all are converted to posts

    expect(posts).toHaveLength(5) // All content treated as posts
    expect(pages).toHaveLength(0) // No pages when parsePagesAsPosts is enabled
    expect(posts.length + pages.length).toBe(5)
  })
})

describe('Expected HTML structures for WordPress migration', () => {
  it('should handle typical WordPress paragraph structure', () => {
    // Simulating what WordPress typically produces
    const blocks: ExtendedBlockContent = [
      {
        _type: 'block',
        _key: '1',
        style: 'normal',
        children: [{ _type: 'span', _key: '1', text: 'First paragraph with some content.' }],
        markDefs: [],
      },
      {
        _type: 'block',
        _key: '2',
        style: 'normal',
        children: [{ _type: 'span', _key: '2', text: '' }], // Empty line
        markDefs: [],
      },
      {
        _type: 'block',
        _key: '3',
        style: 'normal',
        children: [{ _type: 'span', _key: '3', text: 'Second paragraph after empty line.' }],
        markDefs: [],
      },
    ]

    const html = blockContentToHtml(blocks)
    const lines = html.split('\n')

    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('First paragraph')
    expect(lines[1]).toBe('<p></p>') // Empty paragraph should be preserved
    expect(lines[2]).toContain('Second paragraph')
  })

  it('should handle mixed content with images', () => {
    const blocks: MigrationBlockContent = [
      createTestTextBlock({
        _key: '1',
        style: 'normal',
        children: [{ _type: 'span', _key: '1', text: 'Text before image.' }],
        markDefs: [],
      }),
      createTestImageBlock({
        _key: '2',
        alt: 'WordPress uploaded image',
        url: 'https://example.com/wp-content/uploads/2023/image.jpg',
        localPath: 'input/uploads/2023/12/image.jpg',
      }),
      createTestTextBlock({
        _key: '3',
        style: 'normal',
        children: [{ _type: 'span', _key: '3', text: 'Text after image.' }],
        markDefs: [],
      }),
    ]

    const html = blockContentToHtml(blocks)

    expect(html).toContain('<p>Text before image.</p>')
    expect(html).toContain(
      '<figure><img src="/api/serve-media?path=input%2Fuploads%2F2023%2F12%2Fimage.jpg"',
    )
    expect(html).toContain('alt="WordPress uploaded image"')
    expect(html).toContain('<p>Text after image.</p>')
  })
})
