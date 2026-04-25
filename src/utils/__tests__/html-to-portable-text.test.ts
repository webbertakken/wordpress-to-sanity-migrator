import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import { htmlToBlockContent } from '../html-to-portable-text'

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
  }
})

const mockedExistsSync = vi.mocked(fs.existsSync)
const mockedReaddirSync = vi.mocked(fs.readdirSync)

function stubLocalFile(name: string): void {
  mockedExistsSync.mockReturnValue(true)
  mockedReaddirSync.mockReturnValue([{ name, isDirectory: () => false }] as never)
}

describe('htmlToBlockContent — lists', () => {
  it('renders a <ul> as a sequence of bullet list items', async () => {
    const { content } = await htmlToBlockContent('<ul><li>One</li><li>Two</li></ul>')
    const items = content.filter((b) => b._type === 'block')
    expect(items.length).toBeGreaterThanOrEqual(2)
    items.forEach((b) => {
      const block = b as { listItem?: string; level?: number }
      expect(block.listItem).toBe('bullet')
      expect(block.level).toBe(1)
    })
  })

  it('renders an <ol> as a sequence of numbered list items', async () => {
    const { content } = await htmlToBlockContent('<ol><li>First</li></ol>')
    const item = content[0] as { listItem?: string }
    expect(item.listItem).toBe('number')
  })

  it('substitutes an empty span when an <li> contains only whitespace markup', async () => {
    const { content } = await htmlToBlockContent('<ul><li><br /></li><li>real</li></ul>')
    const items = content.filter((b) => b._type === 'block') as Array<{
      children?: Array<{ text?: string }>
    }>
    expect(items.length).toBeGreaterThanOrEqual(1)
    expect(items.some((b) => b.children?.[0].text === 'real')).toBe(true)
  })

  it('emits no items for a list with no <li> elements', async () => {
    const { content } = await htmlToBlockContent('<ul></ul>')
    expect(content).toEqual([])
  })
})

describe('htmlToBlockContent — embeds and iframes', () => {
  it('extracts a YouTube wp:embed comment as a video block', async () => {
    const html =
      '<!-- wp:embed {"url":"https://youtu.be/abc","type":"video"} -->placeholder<!-- /wp:embed -->'
    const { content } = await htmlToBlockContent(html)
    const video = content.find((b) => b._type === 'video') as { videoType: string; url: string }
    expect(video.videoType).toBe('youtube')
    expect(video.url).toBe('https://youtu.be/abc')
  })

  it('extracts a Vimeo wp:embed comment as a video block', async () => {
    const html =
      '<!-- wp:embed {"url":"https://vimeo.com/123","type":"video"} -->placeholder<!-- /wp:embed -->'
    const { content } = await htmlToBlockContent(html)
    const video = content.find((b) => b._type === 'video') as { videoType: string }
    expect(video.videoType).toBe('vimeo')
  })

  it('treats a non-YouTube/Vimeo wp:embed comment as a generic url video block', async () => {
    const html =
      '<!-- wp:embed {"url":"https://example.com/clip.mp4","type":"video"} -->placeholder<!-- /wp:embed -->'
    const { content } = await htmlToBlockContent(html)
    const video = content.find((b) => b._type === 'video') as { videoType: string }
    expect(video.videoType).toBe('url')
  })

  it('warns and produces no video block when wp:embed JSON is malformed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const html = '<!-- wp:embed {bad json} -->placeholder<!-- /wp:embed -->'
    const { content } = await htmlToBlockContent(html)
    expect(content.find((b) => b._type === 'video')).toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('routes a YouTube iframe through the video extractor', async () => {
    const { content } = await htmlToBlockContent(
      '<iframe src="https://www.youtube.com/embed/x"></iframe>',
    )
    expect(content[0]._type).toBe('video')
    expect((content[0] as { videoType: string }).videoType).toBe('youtube')
  })

  it('routes a Vimeo iframe through the video extractor', async () => {
    const { content } = await htmlToBlockContent(
      '<iframe src="https://player.vimeo.com/video/1"></iframe>',
    )
    expect(content[0]._type).toBe('video')
    expect((content[0] as { videoType: string }).videoType).toBe('vimeo')
  })

  it('treats a non-video iframe as a generic embed block', async () => {
    const { content } = await htmlToBlockContent(
      '<iframe src="https://twitter.com/x/status/1"></iframe>',
    )
    expect(content[0]._type).toBe('embed')
    expect((content[0] as { url: string }).url).toBe('https://twitter.com/x/status/1')
  })

  it('skips an iframe with no src attribute', async () => {
    const { content } = await htmlToBlockContent('<iframe></iframe>')
    expect(content.find((b) => b._type === 'embed')).toBeUndefined()
  })
})

describe('htmlToBlockContent — dividers and stray text', () => {
  it('extracts a divider block from <hr />', async () => {
    const { content } = await htmlToBlockContent('<hr />')
    expect(content[0]._type).toBe('divider')
  })

  it('emits a paragraph block from leading text without a wrapping element', async () => {
    const { content } = await htmlToBlockContent('Hello world<hr />after')
    const text = content.find(
      (b) =>
        b._type === 'block' &&
        Array.isArray((b as { children?: unknown }).children) &&
        (b as { children: { text: string }[] }).children[0].text === 'Hello world',
    )
    expect(text).toBeDefined()
  })
})

describe('htmlToBlockContent — self-hosted video with a local file (videoFile placeholder)', () => {
  it('attaches an empty videoFile placeholder to a wp-block-video figure when the file is found locally', async () => {
    stubLocalFile('clip.mp4')
    const html =
      '<figure class="wp-block-video"><video src="http://example.com/uploads/clip.mp4"></video></figure>'
    const { content } = await htmlToBlockContent(html)
    const video = content.find((b) => b._type === 'video') as { videoFile?: { _type: string } }
    expect(video.videoFile).toEqual({ _type: 'file' })
  })

  it('attaches an empty videoFile placeholder to a standalone <video> element when the file is found locally', async () => {
    stubLocalFile('clip.mp4')
    const html = '<video src="http://example.com/uploads/clip.mp4"></video>'
    const { content } = await htmlToBlockContent(html)
    const video = content.find((b) => b._type === 'video') as { videoFile?: { _type: string } }
    expect(video.videoFile).toEqual({ _type: 'file' })
  })
})

describe('htmlToBlockContent — figures and standalone media', () => {
  it('treats a wp-block-audio figure as an audio block', async () => {
    const html =
      '<figure class="wp-block-audio"><audio src="http://example.com/clip.mp3" controls></audio><figcaption>Clip</figcaption></figure>'
    const { content } = await htmlToBlockContent(html)
    const audio = content.find((b) => b._type === 'audio') as {
      url: string
      title?: string
      showControls?: boolean
    }
    expect(audio).toBeDefined()
    expect(audio.url).toBe('http://example.com/clip.mp3')
    expect(audio.title).toBe('Clip')
    expect(audio.showControls).toBe(true)
  })

  it('skips a wp-block-audio figure with no <audio> tag', async () => {
    const html = '<figure class="wp-block-audio"><p>no audio here</p></figure>'
    const { content } = await htmlToBlockContent(html)
    expect(content.find((b) => b._type === 'audio')).toBeUndefined()
  })

  it('renders an audio with autoplay attribute as autoplay=true', async () => {
    const html = '<figure class="wp-block-audio"><audio src="x.mp3" autoplay></audio></figure>'
    const { content } = await htmlToBlockContent(html)
    const audio = content.find((b) => b._type === 'audio') as { autoplay?: boolean }
    expect(audio.autoplay).toBe(true)
  })

  it('treats a wp-block-video figure as a video block', async () => {
    const html =
      '<figure class="wp-block-video"><video src="http://example.com/clip.mp4"></video><figcaption>Clip</figcaption></figure>'
    const { content } = await htmlToBlockContent(html)
    const video = content.find((b) => b._type === 'video') as {
      url: string
      title?: string
      videoType: string
    }
    expect(video.url).toBe('http://example.com/clip.mp4')
    expect(video.videoType).toBe('url')
    expect(video.title).toBe('Clip')
  })

  it('skips a wp-block-video figure with no <video> tag', async () => {
    const html = '<figure class="wp-block-video"><p>no video here</p></figure>'
    const { content } = await htmlToBlockContent(html)
    expect(content.find((b) => b._type === 'video')).toBeUndefined()
  })

  it('treats a youtube src in a wp-block-video figure as a youtube video', async () => {
    const html =
      '<figure class="wp-block-video"><video src="https://www.youtube.com/watch?v=x"></video></figure>'
    const { content } = await htmlToBlockContent(html)
    const video = content.find((b) => b._type === 'video') as { videoType: string }
    expect(video.videoType).toBe('youtube')
  })

  it('treats a vimeo src in a wp-block-video figure as a vimeo video', async () => {
    const html = '<figure class="wp-block-video"><video src="https://vimeo.com/x"></video></figure>'
    const { content } = await htmlToBlockContent(html)
    const video = content.find((b) => b._type === 'video') as { videoType: string }
    expect(video.videoType).toBe('vimeo')
  })

  it('skips a video <source> tag without a src attribute', async () => {
    const html = '<video></video>'
    const { content } = await htmlToBlockContent(html)
    expect(content.find((b) => b._type === 'video')).toBeUndefined()
  })

  it('skips audio nested inside an unrelated figure (not wp-block-audio)', async () => {
    // The standalone-audio scan walks the whole HTML; ensure the inside-figure
    // detector keeps the inner <audio> from being double-counted.
    const html = '<figure><audio src="http://example.com/clip.mp3"></audio></figure>'
    const { content } = await htmlToBlockContent(html)
    expect(content.find((b) => b._type === 'audio')).toBeUndefined()
  })
})

describe('htmlToBlockContent — images', () => {
  it('extracts an <img> as an image block', async () => {
    const { content } = await htmlToBlockContent('<img src="http://example.com/x.jpg" alt="Alt" />')
    const image = content.find((b) => b._type === 'image') as { url: string; alt: string }
    expect(image.url).toBe('http://example.com/x.jpg')
    expect(image.alt).toBe('Alt')
  })

  it('extracts a wp-block-image figure with alt-less img', async () => {
    const html = '<figure class="wp-block-image"><img src="http://example.com/x.jpg" /></figure>'
    const { content } = await htmlToBlockContent(html)
    expect(content.find((b) => b._type === 'image')).toBeDefined()
  })

  it('extracts an image inside an unclassified figure (matches the <img/> branch)', async () => {
    const html = '<figure><img src="http://example.com/x.jpg" /></figure>'
    const { content } = await htmlToBlockContent(html)
    expect(content.find((b) => b._type === 'image')).toBeDefined()
  })

  it('skips an <img> tag with no src attribute', async () => {
    const { content } = await htmlToBlockContent('<img alt="nope" />')
    expect(content.find((b) => b._type === 'image')).toBeUndefined()
  })

  it('captures alignleft on an <img> tag', async () => {
    const { content } = await htmlToBlockContent(
      '<img class="alignleft" src="http://example.com/x.jpg" />',
    )
    const image = content.find((b) => b._type === 'image') as { alignment?: string }
    expect(image.alignment).toBe('left')
  })
})

describe('htmlToBlockContent — text content', () => {
  it('emits a paragraph block from a <p> element', async () => {
    const { content } = await htmlToBlockContent('<p>Hello</p>')
    const block = content[0] as { children: { text: string }[] }
    expect(block.children[0].text).toBe('Hello')
  })

  it('skips a <p> tag with empty content', async () => {
    const { content } = await htmlToBlockContent('<p>   </p>')
    expect(content).toEqual([])
  })

  it('emits a heading block from <h1>..<h6>', async () => {
    const { content } = await htmlToBlockContent('<h2>Title</h2>')
    const block = content[0] as { style: string }
    expect(block.style).toBe('h2')
  })

  it('skips an <h1> with empty content', async () => {
    const { content } = await htmlToBlockContent('<h1>   </h1>')
    expect(content).toEqual([])
  })

  it('emits multiple blockquote paragraphs', async () => {
    const { content } = await htmlToBlockContent('<blockquote><p>One</p><p>Two</p></blockquote>')
    const quotes = content.filter((b) => (b as { style?: string }).style === 'blockquote')
    expect(quotes.length).toBe(2)
  })

  it('falls back to the inner text when a blockquote has no <p> children', async () => {
    const { content } = await htmlToBlockContent('<blockquote>just text</blockquote>')
    const quote = content.find((b) => (b as { style?: string }).style === 'blockquote') as {
      children: { text: string }[]
    }
    expect(quote.children[0].text).toBe('just text')
  })

  it('skips a blockquote with empty content', async () => {
    const { content } = await htmlToBlockContent('<blockquote>   </blockquote>')
    expect(content).toEqual([])
  })
})

describe('htmlToBlockContent — figcaption edge cases', () => {
  it('omits the caption when the figcaption is whitespace-only', async () => {
    const html = '<figure><figcaption>   </figcaption><img src="http://e/x.jpg" /></figure>'
    const { content } = await htmlToBlockContent(html)
    const image = content.find((b) => b._type === 'image') as { caption?: string }
    expect(image.caption).toBeUndefined()
  })
})

describe('htmlToBlockContent — boundary conditions', () => {
  it('returns no blocks for an empty input', async () => {
    const { content } = await htmlToBlockContent('')
    expect(content).toEqual([])
  })

  it('passes through unknown HTML without crashing', async () => {
    const { content } = await htmlToBlockContent('<custom>x</custom>')
    expect(Array.isArray(content)).toBe(true)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
