import { describe, it, expect } from 'vitest'
import { SanityContentTransformer } from '../sanity-content-transformer'
import type { WordPressPost } from '../../types/migration'

describe('Excerpt Generation', () => {
  const createWordPressPost = (overrides: Partial<WordPressPost> = {}): WordPressPost => ({
    ID: 1,
    post_title: 'Test Post',
    post_content: 'Default content',
    post_excerpt: '',
    post_date: '2024-01-01',
    post_modified: '2024-01-01',
    post_status: 'publish',
    post_name: 'test-post',
    post_type: 'post',
    post_parent: 0,
    menu_order: 0,
    guid: 'http://example.com/?p=1',
    ...overrides,
  })

  it('should use existing excerpt when provided', async () => {
    const post = createWordPressPost({
      post_excerpt: 'This is a custom excerpt',
      post_content: '<p>This is the full post content that is much longer than the excerpt.</p>',
    })

    const result = await SanityContentTransformer.toSanityPost(post)

    expect(result.excerpt).toBe('This is a custom excerpt')
  })

  it('should generate excerpt from content when not provided', async () => {
    const post = createWordPressPost({
      post_excerpt: '',
      post_content:
        '<p>This is a long post content that needs to be truncated to create an excerpt. It contains multiple sentences and should be cut off at a reasonable length to provide a good preview of the content without being too long.</p>',
    })

    const result = await SanityContentTransformer.toSanityPost(post)

    expect(result.excerpt).toBeDefined()
    expect(result.excerpt).toContain('This is a long post content')
    expect(result.excerpt).toContain('...')
    expect(result.excerpt!.length).toBeLessThanOrEqual(153) // 150 + '...'
  })

  it('should handle short content without truncation', async () => {
    const post = createWordPressPost({
      post_excerpt: '',
      post_content: '<p>Short content.</p>',
    })

    const result = await SanityContentTransformer.toSanityPost(post)

    expect(result.excerpt).toBe('Short content.')
    expect(result.excerpt).not.toContain('...')
  })

  it('should strip HTML tags when generating excerpt', async () => {
    const post = createWordPressPost({
      post_excerpt: '',
      post_content: '<p>Content with <strong>bold</strong> and <em>italic</em> text.</p>',
    })

    const result = await SanityContentTransformer.toSanityPost(post)

    expect(result.excerpt).toBe('Content with bold and italic text.')
    expect(result.excerpt).not.toContain('<strong>')
    expect(result.excerpt).not.toContain('<em>')
  })

  it('should handle multiple paragraphs in excerpt generation', async () => {
    const post = createWordPressPost({
      post_excerpt: '',
      post_content: `
        <p>First paragraph of content.</p>
        <p>Second paragraph with more text.</p>
        <p>Third paragraph that should not be included in the excerpt because it would make the excerpt too long for the character limit.</p>
      `,
    })

    const result = await SanityContentTransformer.toSanityPost(post)

    expect(result.excerpt).toBeDefined()
    expect(result.excerpt).toContain('First paragraph')
    expect(result.excerpt).toContain('Second paragraph')
    expect(result.excerpt).toContain('...')
  })

  it('should handle content with line breaks', async () => {
    const post = createWordPressPost({
      post_excerpt: '',
      post_content: '<p>Line one<br />Line two<br />Line three</p>',
    })

    const result = await SanityContentTransformer.toSanityPost(post)

    expect(result.excerpt).toBeDefined()
    // Line breaks should be preserved as newlines in the plain text
    expect(result.excerpt).toContain('Line one')
    expect(result.excerpt).toContain('Line two')
  })

  it('should handle empty content gracefully', async () => {
    const post = createWordPressPost({
      post_excerpt: '',
      post_content: '',
    })

    const result = await SanityContentTransformer.toSanityPost(post)

    expect(result.excerpt).toBeUndefined()
  })

  it('should handle content with only whitespace', async () => {
    const post = createWordPressPost({
      post_excerpt: '',
      post_content: '<p>   </p><p>  </p>',
    })

    const result = await SanityContentTransformer.toSanityPost(post)

    expect(result.excerpt).toBeUndefined()
  })

  it('should preserve excerpt even with malformed HTML', async () => {
    const post = createWordPressPost({
      post_excerpt: '',
      post_content: '<p>Content with unclosed tag <strong>bold text</p>',
    })

    const result = await SanityContentTransformer.toSanityPost(post)

    expect(result.excerpt).toBeDefined()
    expect(result.excerpt).toContain('Content with unclosed tag')
  })

  it('should handle special characters in excerpt', async () => {
    const post = createWordPressPost({
      post_excerpt: '',
      post_content: '<p>Content with special chars: &amp; &quot; &lt; &gt; &mdash; &hellip;</p>',
    })

    const result = await SanityContentTransformer.toSanityPost(post)

    expect(result.excerpt).toBeDefined()
    expect(result.excerpt).toContain('&')
    expect(result.excerpt).toContain('"')
    expect(result.excerpt).toContain('—')
    expect(result.excerpt).toContain('…')
  })
})
