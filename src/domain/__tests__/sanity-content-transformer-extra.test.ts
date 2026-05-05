import { describe, it, expect, vi } from 'vitest'
import type { WordPressPost } from '../../types/migration'
import * as htmlModule from '../../utils/html-to-portable-text'
import { SanityContentTransformer } from '../sanity-content-transformer'

function buildPost(overrides: Partial<WordPressPost> = {}): WordPressPost {
  return {
    ID: 1,
    post_title: 'Title',
    post_content: '<p>Hello</p>',
    post_excerpt: '',
    post_date: '2024-01-01T00:00:00Z',
    post_modified: '2024-01-01T00:00:00Z',
    post_status: 'publish',
    post_name: 'title',
    post_type: 'post',
    post_parent: 0,
    menu_order: 0,
    guid: '',
    ...overrides,
  }
}

describe('SanityContentTransformer.toSanityPost', () => {
  it('produces a post with body, excerpt and content', async () => {
    const post = await SanityContentTransformer.toSanityPost(
      buildPost({ post_content: '<p>Hello world</p>' }),
    )
    expect(post._type).toBe('post')
    expect(post.title).toBe('Title')
    expect(post.body).toContain('Hello world')
    expect(post.excerpt).toBe('Hello world')
    expect(post.coverImage?.alt).toBe('Cover image for Title')
    expect(post.media).toEqual([])
  })

  it('uses the supplied excerpt when present, regardless of body content', async () => {
    const post = await SanityContentTransformer.toSanityPost(
      buildPost({ post_excerpt: 'Custom excerpt' }),
    )
    expect(post.excerpt).toBe('Custom excerpt')
  })

  it('truncates a long auto-generated excerpt to 150 characters', async () => {
    const longText = 'x'.repeat(500)
    const post = await SanityContentTransformer.toSanityPost(
      buildPost({ post_content: `<p>${longText}</p>` }),
    )
    expect(post.excerpt!.length).toBeLessThanOrEqual(154) // 150 + ' …' suffix room
    expect(post.excerpt!.endsWith('...')).toBe(true)
  })

  it('falls back to a stripped excerpt when conversion throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const spy = vi.spyOn(htmlModule, 'htmlToBlockContent').mockRejectedValueOnce(new Error('boom'))

    const post = await SanityContentTransformer.toSanityPost(
      buildPost({ post_content: '<p>fallback text</p>' }),
    )

    expect(post.content).toHaveLength(1)
    expect(post.content?.[0]).toMatchObject({
      _type: 'block',
      style: 'normal',
    })
    const first = post.content![0] as { children: { text: string }[] }
    expect(first.children[0].text).toBe('fallback text...')
    expect(post.media).toEqual([])

    spy.mockRestore()
    error.mockRestore()
  })

  it('falls back to a "Content conversion failed" placeholder when there is no source HTML', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const spy = vi.spyOn(htmlModule, 'htmlToBlockContent').mockRejectedValueOnce(new Error('boom'))

    const post = await SanityContentTransformer.toSanityPost(buildPost({ post_content: '' }))

    const first = post.content![0] as { children: { text: string }[] }
    expect(first.children[0].text).toBe('Content conversion failed')

    spy.mockRestore()
    error.mockRestore()
  })

  it('returns excerpt undefined when neither author-provided nor body text is available', async () => {
    const post = await SanityContentTransformer.toSanityPost(buildPost({ post_content: '' }))
    expect(post.excerpt).toBeUndefined()
  })
})

describe('SanityContentTransformer.toSanityPage', () => {
  it('builds a page with name, slug, heading and (optional) subheading', () => {
    const page = SanityContentTransformer.toSanityPage(
      buildPost({ post_type: 'page', post_excerpt: 'sub' }),
    )
    expect(page._type).toBe('page')
    expect(page.name).toBe('Title')
    expect(page.heading).toBe('Title')
    expect(page.subheading).toBe('sub')
    expect(page.media).toEqual([])
  })

  it('omits the subheading when post_excerpt is empty', () => {
    const page = SanityContentTransformer.toSanityPage(buildPost({ post_type: 'page' }))
    expect(page.subheading).toBeUndefined()
  })
})

describe('SanityContentTransformer.transform', () => {
  it('treats post_type=post as a post', async () => {
    const result = await SanityContentTransformer.transform(buildPost())
    expect(result._type).toBe('post')
  })

  it('treats post_type=page as a page by default', async () => {
    const result = await SanityContentTransformer.transform(buildPost({ post_type: 'page' }))
    expect(result._type).toBe('page')
  })

  it('treats a page as a post when treatAsPost is set', async () => {
    const result = await SanityContentTransformer.transform(buildPost({ post_type: 'page' }), {
      treatAsPost: true,
    })
    expect(result._type).toBe('post')
  })
})

describe('SanityContentTransformer.fromData', () => {
  it('constructs a Sanity post from raw fields, defaulting media to an empty array', () => {
    const post = SanityContentTransformer.fromData({
      title: 'X',
      slug: 'x',
    })
    expect(post.title).toBe('X')
    expect(post.slug.current).toBe('x')
    expect(post.media).toEqual([])
    expect(post.coverImage?.alt).toBe('Cover image for X')
  })

  it('threads through optional fields when provided', () => {
    const post = SanityContentTransformer.fromData({
      title: 'X',
      slug: 'x',
      excerpt: 'e',
      date: '2024-01-01',
      body: 'body',
      content: [],
      media: [{ url: 'u', localPath: '/u', type: 'image', found: true }],
    })
    expect(post.excerpt).toBe('e')
    expect(post.body).toBe('body')
    expect(post.media).toHaveLength(1)
  })
})

describe('SanityContentTransformer aggregate helpers', () => {
  it('summarises media counts by type and found/missing', () => {
    const post = SanityContentTransformer.fromData({
      title: 'X',
      slug: 'x',
      media: [
        { url: 'a', localPath: '/a', type: 'image', found: true },
        { url: 'b', localPath: '/b', type: 'image', found: false },
        { url: 'c', localPath: '/c', type: 'audio', found: true },
      ],
    })
    expect(SanityContentTransformer.getMediaSummary(post)).toEqual({
      total: 3,
      byType: { image: 2, audio: 1 },
      found: 2,
      missing: 1,
    })
  })

  it('lists missing media URLs', () => {
    const post = SanityContentTransformer.fromData({
      title: 'X',
      slug: 'x',
      media: [
        { url: 'a', localPath: '/a', type: 'image', found: false },
        { url: 'b', localPath: '/b', type: 'image', found: true },
      ],
    })
    expect(SanityContentTransformer.getMissingMediaUrls(post)).toEqual(['a'])
  })

  it('reports whether any media is present', () => {
    const empty = SanityContentTransformer.fromData({ title: 'X', slug: 'x' })
    const withMedia = SanityContentTransformer.fromData({
      title: 'X',
      slug: 'x',
      media: [{ url: 'a', localPath: '/a', type: 'image', found: true }],
    })
    expect(SanityContentTransformer.hasMedia(empty)).toBe(false)
    expect(SanityContentTransformer.hasMedia(withMedia)).toBe(true)
  })

  it('counts words from the body string when available', () => {
    const post = SanityContentTransformer.fromData({
      title: 'X',
      slug: 'x',
      body: 'one two three',
    })
    expect(SanityContentTransformer.getWordCount(post)).toBe(3)
  })

  it('counts words from block content when no body is set', () => {
    const post = SanityContentTransformer.fromData({
      title: 'X',
      slug: 'x',
      content: [
        {
          _type: 'block',
          _key: 'k1',
          style: 'normal',
          markDefs: [],
          children: [{ _type: 'span', _key: 's1', text: 'one two three four' }],
        },
      ],
    })
    expect(SanityContentTransformer.getWordCount(post)).toBe(4)
  })

  it('returns zero word count for pages', () => {
    const page = SanityContentTransformer.toSanityPage(buildPost({ post_type: 'page' }))
    expect(SanityContentTransformer.getWordCount(page)).toBe(0)
  })

  it('treats span children with undefined text as empty strings during plain-text extraction', () => {
    const post = SanityContentTransformer.fromData({
      title: 'X',
      slug: 'x',
      content: [
        {
          _type: 'block',
          _key: 'k1',
          style: 'normal',
          markDefs: [],
          children: [
            { _type: 'span', _key: 's1' } as never,
            { _type: 'span', _key: 's2', text: 'hello' },
          ],
        },
      ],
    })
    expect(SanityContentTransformer.getWordCount(post)).toBe(1)
  })

  it('treats a block whose children all have empty text as zero text (covers the falsy text branch)', () => {
    const post = SanityContentTransformer.fromData({
      title: 'X',
      slug: 'x',
      content: [
        {
          _type: 'block',
          _key: 'k1',
          style: 'normal',
          markDefs: [],
          children: [
            { _type: 'span', _key: 's1', text: '' },
            { _type: 'span', _key: 's2' } as never,
          ],
        },
      ],
    })
    expect(SanityContentTransformer.getWordCount(post)).toBe(0)
  })

  it('treats blocks with no children as zero text', () => {
    const post = SanityContentTransformer.fromData({
      title: 'X',
      slug: 'x',
      content: [
        { _type: 'block', _key: 'k1', style: 'normal', markDefs: [] },
        {
          _type: 'block',
          _key: 'k2',
          style: 'h1',
          markDefs: [],
          children: [{ _type: 'span', _key: 's1', text: 'Heading' }],
        },
      ],
    })
    // body is undefined so word count comes from content.
    expect(SanityContentTransformer.getWordCount(post)).toBe(1)
  })
})
