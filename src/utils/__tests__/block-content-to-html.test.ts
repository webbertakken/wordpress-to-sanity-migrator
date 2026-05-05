import { describe, it, expect } from 'vitest'
import type { MigrationBlockContent } from '../../types/migration'
import { blockContentToHtml, getTextFromBlockContent } from '../block-content-to-html'

describe('blockContentToHtml — empty / invalid inputs', () => {
  it('returns the empty string for undefined input', () => {
    expect(blockContentToHtml(undefined)).toBe('')
  })

  it('returns the empty string for non-array input', () => {
    expect(blockContentToHtml('nonsense' as never)).toBe('')
  })

  it('returns the empty string for an unknown block type', () => {
    expect(blockContentToHtml([{ _type: 'unknown', _key: 'k' } as never])).toBe('')
  })
})

describe('blockContentToHtml — image blocks', () => {
  it('renders a remote image block as a <figure><img></figure>', () => {
    const html = blockContentToHtml([
      {
        _type: 'image',
        _key: 'k1',
        url: 'http://example.com/x.jpg',
        alt: 'Alt text',
      },
    ])
    expect(html).toContain('<img src="http://example.com/x.jpg"')
    expect(html).toContain('alt="Alt text"')
    expect(html).toContain('<figure>')
  })

  it('rewrites local input/ paths through the serve-media API', () => {
    const html = blockContentToHtml([
      { _type: 'image', _key: 'k1', url: '', localPath: 'input/uploads/2024/x.jpg', alt: '' },
    ])
    expect(html).toContain('/api/serve-media?path=')
    expect(html).toContain(encodeURIComponent('input/uploads/2024/x.jpg'))
  })

  it('emits the data-align attribute when an alignment is set', () => {
    const html = blockContentToHtml([
      { _type: 'image', _key: 'k1', url: 'http://example.com/x.jpg', alignment: 'center' },
    ])
    expect(html).toContain('data-align="center"')
  })

  it('emits a <figcaption> when a caption is provided', () => {
    const html = blockContentToHtml([
      {
        _type: 'image',
        _key: 'k1',
        url: 'http://example.com/x.jpg',
        caption: 'Caption text',
      },
    ])
    expect(html).toContain('<figcaption>Caption text</figcaption>')
  })

  it('renders the empty string when an image block has no usable src', () => {
    const html = blockContentToHtml([{ _type: 'image', _key: 'k1', url: '' }])
    expect(html).toBe('')
  })
})

describe('blockContentToHtml — divider, embed and audio blocks', () => {
  it('renders a divider block as a self-closing <hr />', () => {
    expect(blockContentToHtml([{ _type: 'divider', _key: 'k1' }])).toBe('<hr />')
  })

  it('renders an embed block as a figure-wrapped iframe', () => {
    const html = blockContentToHtml([
      { _type: 'embed', _key: 'k1', url: 'https://twitter.com/x/status/1', caption: 'Tweet' },
    ])
    expect(html).toContain('<figure class="embed-block">')
    expect(html).toContain('<iframe src="https://twitter.com/x/status/1"')
    expect(html).toContain('<figcaption>Tweet</figcaption>')
  })

  it('renders the empty string for an embed block without a url', () => {
    expect(blockContentToHtml([{ _type: 'embed', _key: 'k1', url: '' }])).toBe('')
  })

  it('renders an audio block with optional autoplay and title', () => {
    const html = blockContentToHtml([
      {
        _type: 'audio',
        _key: 'k1',
        url: 'http://example.com/clip.mp3',
        title: 'Clip',
        autoplay: true,
      } as never,
    ])
    expect(html).toContain('<figure class="audio-block">')
    expect(html).toContain('autoplay')
    expect(html).toContain('<figcaption>Clip</figcaption>')
  })

  it('rewrites local audio paths through the serve-media API', () => {
    const html = blockContentToHtml([
      { _type: 'audio', _key: 'k1', url: '', localPath: 'input/uploads/clip.mp3' } as never,
    ])
    expect(html).toContain('/api/serve-media?path=')
  })

  it('renders the empty string when an audio block has no usable src', () => {
    expect(blockContentToHtml([{ _type: 'audio', _key: 'k1', url: '' } as never])).toBe('')
  })
})

describe('blockContentToHtml — video blocks', () => {
  it('renders a YouTube video as an iframe embed', () => {
    const html = blockContentToHtml([
      {
        _type: 'video',
        _key: 'k1',
        videoType: 'youtube',
        url: 'https://www.youtube.com/embed/abc',
        title: 'Talk',
      },
    ])
    expect(html).toContain('<iframe src="https://www.youtube.com/embed/abc"')
    expect(html).toContain('<figcaption>Talk</figcaption>')
  })

  it('renders the empty string for a YouTube video without a url', () => {
    expect(
      blockContentToHtml([{ _type: 'video', _key: 'k1', videoType: 'youtube', url: '' }]),
    ).toBe('')
  })

  it('renders a Vimeo video as an iframe embed', () => {
    const html = blockContentToHtml([
      { _type: 'video', _key: 'k1', videoType: 'vimeo', url: 'https://vimeo.com/x' },
    ])
    expect(html).toContain('<iframe src="https://vimeo.com/x"')
  })

  it.each([
    ['mp4', 'video/mp4'],
    ['webm', 'video/webm'],
    ['ogv', 'video/ogg'],
    ['mov', 'video/quicktime'],
    ['wmv', 'video/x-ms-wmv'],
  ])('emits the right MIME type for self-hosted .%s files', (ext, mime) => {
    const html = blockContentToHtml([
      {
        _type: 'video',
        _key: 'k1',
        videoType: 'url',
        url: `http://example.com/clip.${ext}`,
      },
    ])
    expect(html).toContain(`type="${mime}"`)
  })

  it('omits type attribute for unrecognised extensions', () => {
    const html = blockContentToHtml([
      { _type: 'video', _key: 'k1', videoType: 'url', url: 'http://example.com/clip.xyz' },
    ])
    expect(html).not.toContain('type=')
  })

  it('rewrites local video paths through the serve-media API', () => {
    const html = blockContentToHtml([
      {
        _type: 'video',
        _key: 'k1',
        videoType: 'url',
        url: '',
        localPath: 'input/uploads/clip.mp4',
      },
    ])
    expect(html).toContain('/api/serve-media?path=')
  })

  it('renders the empty string for a self-hosted video without a src', () => {
    expect(blockContentToHtml([{ _type: 'video', _key: 'k1', videoType: 'url' }])).toBe('')
  })
})

describe('blockContentToHtml — text blocks', () => {
  it('renders a normal paragraph', () => {
    const html = blockContentToHtml([
      {
        _type: 'block',
        _key: 'k1',
        style: 'normal',
        markDefs: [],
        children: [{ _type: 'span', _key: 's1', text: 'Hello' }],
      },
    ])
    expect(html).toBe('<p>Hello</p>')
  })

  it.each(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const)('renders %s headings', (style) => {
    const html = blockContentToHtml([
      {
        _type: 'block',
        _key: 'k1',
        style,
        markDefs: [],
        children: [{ _type: 'span', _key: 's1', text: 'Title' }],
      },
    ])
    expect(html).toBe(`<${style}>Title</${style}>`)
  })

  it('renders blockquotes', () => {
    const html = blockContentToHtml([
      {
        _type: 'block',
        _key: 'k1',
        style: 'blockquote',
        markDefs: [],
        children: [{ _type: 'span', _key: 's1', text: 'Quote' }],
      },
    ])
    expect(html).toBe('<blockquote>Quote</blockquote>')
  })

  it('falls back to a <p> for unknown styles', () => {
    const html = blockContentToHtml([
      {
        _type: 'block',
        _key: 'k1',
        style: 'something-strange' as never,
        markDefs: [],
        children: [{ _type: 'span', _key: 's1', text: 'Hi' }],
      },
    ])
    expect(html).toBe('<p>Hi</p>')
  })

  it('defaults the style to normal when block.style is undefined', () => {
    const html = blockContentToHtml([
      {
        _type: 'block',
        _key: 'k1',
        markDefs: [],
        children: [{ _type: 'span', _key: 's1', text: 'Plain' }],
      } as never,
    ])
    expect(html).toBe('<p>Plain</p>')
  })

  it('wraps bullet list items in <ul><li>', () => {
    const html = blockContentToHtml([
      {
        _type: 'block',
        _key: 'k1',
        style: 'normal',
        listItem: 'bullet',
        markDefs: [],
        children: [{ _type: 'span', _key: 's1', text: 'Item' }],
      },
    ])
    expect(html).toBe('<ul><li>Item</li></ul>')
  })

  it('wraps numbered list items in <ol><li>', () => {
    const html = blockContentToHtml([
      {
        _type: 'block',
        _key: 'k1',
        style: 'normal',
        listItem: 'number',
        markDefs: [],
        children: [{ _type: 'span', _key: 's1', text: 'Item' }],
      },
    ])
    expect(html).toBe('<ol><li>Item</li></ol>')
  })

  it('converts literal newlines in text into <br />', () => {
    const html = blockContentToHtml([
      {
        _type: 'block',
        _key: 'k1',
        style: 'normal',
        markDefs: [],
        children: [{ _type: 'span', _key: 's1', text: 'line one\nline two' }],
      },
    ])
    expect(html).toBe('<p>line one<br />line two</p>')
  })

  it('treats missing text as an empty string', () => {
    const html = blockContentToHtml([
      {
        _type: 'block',
        _key: 'k1',
        style: 'normal',
        markDefs: [],
        children: [{ _type: 'span', _key: 's1' }],
      },
    ] as never)
    expect(html).toBe('<p></p>')
  })

  it('skips non-span children', () => {
    const html = blockContentToHtml([
      {
        _type: 'block',
        _key: 'k1',
        style: 'normal',
        markDefs: [],
        children: [{ _type: 'somethingElse', _key: 'x', text: 'ignored' } as never],
      },
    ])
    expect(html).toBe('<p></p>')
  })

  it('returns the empty string for a text block whose children produce nothing renderable', () => {
    const html = blockContentToHtml([
      {
        _type: 'block',
        _key: 'k1',
        style: 'normal',
        markDefs: [],
      },
    ])
    expect(html).toBe('<p></p>')
  })

  it('applies basic marks (strong, em, underline, code)', () => {
    const html = blockContentToHtml([
      {
        _type: 'block',
        _key: 'k1',
        style: 'normal',
        markDefs: [],
        children: [
          { _type: 'span', _key: 's1', text: 'A', marks: ['strong'] },
          { _type: 'span', _key: 's2', text: 'B', marks: ['em'] },
          { _type: 'span', _key: 's3', text: 'C', marks: ['underline'] },
          { _type: 'span', _key: 's4', text: 'D', marks: ['code'] },
        ],
      },
    ])
    expect(html).toContain('<strong>A</strong>')
    expect(html).toContain('<em>B</em>')
    expect(html).toContain('<u>C</u>')
    expect(html).toContain('<code>D</code>')
  })

  it('looks up link mark defs and renders them as <a> tags, with optional target=_blank', () => {
    const html = blockContentToHtml([
      {
        _type: 'block',
        _key: 'k1',
        style: 'normal',
        markDefs: [
          {
            _key: 'lk1',
            _type: 'link',
            href: 'https://example.com',
            openInNewTab: true,
          } as never,
        ],
        children: [{ _type: 'span', _key: 's1', text: 'click', marks: ['lk1'] }],
      },
    ])
    expect(html).toContain('<a href="https://example.com" target="_blank">click</a>')
  })

  it('falls back to # when a link mark def has no href', () => {
    const html = blockContentToHtml([
      {
        _type: 'block',
        _key: 'k1',
        style: 'normal',
        markDefs: [{ _key: 'lk1', _type: 'link' } as never],
        children: [{ _type: 'span', _key: 's1', text: 'click', marks: ['lk1'] }],
      },
    ])
    expect(html).toContain('<a href="#">click</a>')
  })

  it('skips marks that match no markDef and no built-in mark', () => {
    const html = blockContentToHtml([
      {
        _type: 'block',
        _key: 'k1',
        style: 'normal',
        markDefs: [],
        children: [{ _type: 'span', _key: 's1', text: 'X', marks: ['bogus'] }],
      },
    ])
    expect(html).toBe('<p>X</p>')
  })
})

describe('getTextFromBlockContent', () => {
  it('returns the empty string for undefined input', () => {
    expect(getTextFromBlockContent(undefined)).toBe('')
  })

  it('returns the empty string for non-array input', () => {
    expect(getTextFromBlockContent('nonsense' as never)).toBe('')
  })

  it('joins the text of each text block, skipping image blocks', () => {
    const blocks = [
      {
        _type: 'block',
        _key: 'k1',
        style: 'normal',
        markDefs: [],
        children: [
          { _type: 'span', _key: 's1', text: 'Hello ' },
          { _type: 'span', _key: 's2', text: 'world' },
        ],
      },
      { _type: 'image', _key: 'i1', url: 'http://example.com/x.jpg' },
      {
        _type: 'block',
        _key: 'k2',
        style: 'normal',
        markDefs: [],
        children: [{ _type: 'span', _key: 's1', text: 'Second' }],
      },
    ] as MigrationBlockContent
    expect(getTextFromBlockContent(blocks)).toBe('Hello world Second')
  })

  it('skips non-block, non-image entries and blocks without children', () => {
    const blocks = [
      { _type: 'audio', _key: 'a1' } as never,
      { _type: 'block', _key: 'b1' } as never,
    ]
    expect(getTextFromBlockContent(blocks)).toBe('')
  })

  it('treats non-span children as empty strings', () => {
    expect(
      getTextFromBlockContent([
        {
          _type: 'block',
          _key: 'k1',
          style: 'normal',
          markDefs: [],
          children: [{ _type: 'other', _key: 'x', text: 'ignored' } as never],
        },
      ]),
    ).toBe('')
  })

  it('treats missing span text as empty', () => {
    expect(
      getTextFromBlockContent([
        {
          _type: 'block',
          _key: 'k1',
          style: 'normal',
          markDefs: [],
          children: [{ _type: 'span', _key: 'x' } as never],
        },
      ]),
    ).toBe('')
  })
})
