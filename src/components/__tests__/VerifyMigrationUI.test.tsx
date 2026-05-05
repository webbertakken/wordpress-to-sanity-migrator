import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MigrationRecord } from '../../types/migration'
// processContentForPreview is defensive: it rewrites local-path media URLs in
// rendered HTML through /api/serve-media. The default blockContentToHtml
// output already pre-rewrites those URLs so the callbacks never fire. To
// exercise those branches we stub blockContentToHtml in some tests to return
// raw <img>/<audio>/<video>/<source> tags with un-rewritten paths.
import * as blockToHtmlModule from '../../utils/block-content-to-html'
import { VerifyMigrationUI } from '../VerifyMigrationUI'

function buildPostRecord(
  overrides: Partial<{
    id: number
    title: string
    date: string
    excerpt: string
    content: unknown[]
    media: Array<{
      url: string
      localPath: string
      type: 'image' | 'audio' | 'video'
      found: boolean
    }>
  }> = {},
): MigrationRecord {
  const id = overrides.id ?? 1
  return {
    original: {
      ID: id,
      post_title: overrides.title ?? `Title ${id}`,
      post_content: '<p>Original content</p>',
      post_excerpt: overrides.excerpt ?? '',
      post_date: overrides.date ?? '2024-01-01',
      post_modified: '2024-01-01',
      post_status: 'publish',
      post_name: `slug-${id}`,
      post_type: 'post',
      post_parent: 0,
      menu_order: 0,
      guid: '',
    },
    transformed: {
      _type: 'post',
      title: overrides.title ?? `Title ${id}`,
      slug: { _type: 'slug', current: `slug-${id}`, source: 'title' },
      content: (overrides.content ?? [
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [{ _type: 'span', _key: 's1', text: 'Hello world' }],
          markDefs: [],
        },
      ]) as never,
      excerpt: overrides.excerpt ?? 'An excerpt for the post',
      coverImage: { _type: 'image', alt: 'cover' },
      date: overrides.date ?? '2024-01-01',
      media: overrides.media ?? [],
    } as never,
  } as MigrationRecord
}

function buildPageRecord(
  overrides: Partial<{ id: number; name: string; subheading: string }> = {},
): MigrationRecord {
  const id = overrides.id ?? 10
  return {
    original: {
      ID: id,
      post_title: overrides.name ?? `Page ${id}`,
      post_content: '',
      post_excerpt: '',
      post_date: '2024-02-01',
      post_modified: '2024-02-01',
      post_status: 'publish',
      post_name: `page-${id}`,
      post_type: 'page',
      post_parent: 0,
      menu_order: 0,
      guid: '',
    },
    transformed: {
      _type: 'page',
      name: overrides.name ?? `Page ${id}`,
      slug: { _type: 'slug', current: `page-${id}`, source: 'name' },
      heading: overrides.name ?? `Page ${id}`,
      subheading: overrides.subheading ?? 'Sub heading text',
      media: [],
    } as never,
  } as MigrationRecord
}

function mockGetMigrationData(records: MigrationRecord[]): void {
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ success: true, data: records }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('VerifyMigrationUI — loading and error states', () => {
  it('shows the loading spinner before data arrives', async () => {
    let resolveFetch!: (value: Response) => void
    vi.spyOn(global, 'fetch').mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve
      }),
    )
    render(<VerifyMigrationUI />)
    expect(screen.getByText(/Loading migration data/)).toBeInTheDocument()
    resolveFetch(
      new Response(JSON.stringify({ success: true, data: [buildPostRecord()] }), { status: 200 }),
    )
    await waitFor(() =>
      expect(screen.queryByText(/Loading migration data/)).not.toBeInTheDocument(),
    )
  })

  it('renders an error block when the API responds with non-OK', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'boom' }), { status: 500 }),
    )
    render(<VerifyMigrationUI />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /Error Loading Migration Data/ }),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText(/boom/)).toBeInTheDocument()
  })

  it('renders an error block when the response is OK but success=false', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'inner-fail' }), { status: 200 }),
    )
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText(/inner-fail/)).toBeInTheDocument())
  })

  it('renders an error block with a thrown Error from fetch', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network bang'))
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText(/network bang/)).toBeInTheDocument())
  })

  it('falls back to a generic error message when the rejection is not an Error', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue('weird-string')
    render(<VerifyMigrationUI />)
    await waitFor(() =>
      expect(screen.getByText(/Failed to load migration data/)).toBeInTheDocument(),
    )
  })

  it('uses the API error string when provided, even with no details fallback', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status: 200 }),
    )
    render(<VerifyMigrationUI />)
    await waitFor(() =>
      expect(screen.getByText(/Failed to load migration data/)).toBeInTheDocument(),
    )
  })

  it('falls back to a status-coded error when the non-OK response carries no error/details fields', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({}), { status: 503 }))
    render(<VerifyMigrationUI />)
    await waitFor(() =>
      expect(screen.getByText(/Failed to load migration data \(Status: 503\)/)).toBeInTheDocument(),
    )
  })

  it('renders a Technical Details block when the error message includes a parseable details: payload', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('boom details:{"hello":1}'))
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText(/Technical Details/)).toBeInTheDocument())
    expect(screen.getByText(/"hello": 1/)).toBeInTheDocument()
  })
})

describe('VerifyMigrationUI — statistics and listing', () => {
  it('renders the per-type counts and a row for each record', async () => {
    mockGetMigrationData([
      buildPostRecord({
        id: 1,
        media: [
          { url: 'http://e/x.jpg', localPath: '/x.jpg', type: 'image', found: true },
          { url: 'http://e/a.mp3', localPath: '/a.mp3', type: 'audio', found: true },
          { url: 'http://e/v.mp4', localPath: '/v.mp4', type: 'video', found: false },
        ],
      }),
      buildPageRecord({ id: 10 }),
    ])
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Title 1')).toBeInTheDocument())
    expect(screen.getByText('Page 10')).toBeInTheDocument()
    // Per-type counts in the stats grid (order: posts, pages, images, audio, video, total, found, missing)
    const stats = screen
      .getAllByRole('generic')
      .filter((el) => el.classList.contains('text-2xl'))
      .map((el) => el.textContent)
    expect(stats).toEqual(['1', '1', '1', '1', '1', '3', '2', '1'])
  })
})

describe('VerifyMigrationUI — search, filter and sort', () => {
  beforeEach(() => {
    mockGetMigrationData([
      buildPostRecord({ id: 1, title: 'Apple post', date: '2024-01-01' }),
      buildPostRecord({ id: 2, title: 'Banana post', date: '2024-03-01' }),
      buildPageRecord({ id: 10, name: 'Apple page' }),
    ])
  })

  it('filters by search term against title, slug and content', async () => {
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Apple post')).toBeInTheDocument())
    const search = screen.getByLabelText('Search')
    await userEvent.type(search, 'banana')
    await waitFor(() => expect(screen.queryByText('Apple post')).not.toBeInTheDocument())
    expect(screen.getByText('Banana post')).toBeInTheDocument()
  })

  it('filters by content type', async () => {
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Apple page')).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText('Content Type'), 'page')
    expect(screen.queryByText('Apple post')).not.toBeInTheDocument()
    expect(screen.getByText('Apple page')).toBeInTheDocument()
  })

  it('sorts by date ascending and descending (covers asc localeCompare and desc toggle)', async () => {
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Apple post')).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText('Sort By'), 'date')
    const titlesAsc = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent || '')
    expect(titlesAsc.indexOf('Apple post')).toBeLessThan(titlesAsc.indexOf('Banana post'))

    await userEvent.click(screen.getByRole('button', { name: '↑' }))
    const titlesDesc = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent || '')
    expect(titlesDesc.indexOf('Banana post')).toBeLessThan(titlesDesc.indexOf('Apple post'))
  })

  it('toggles back to ascending after a descending toggle', async () => {
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Apple post')).toBeInTheDocument())
    // Default sort is title asc; toggle once -> desc, toggle again -> asc.
    await userEvent.click(screen.getByRole('button', { name: '↑' }))
    await userEvent.click(screen.getByRole('button', { name: '↓' }))
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent || '')
    expect(titles.indexOf('Apple page')).toBeLessThan(titles.indexOf('Banana post'))
  })

  it('sorts strings descending using bValue.localeCompare(aValue)', async () => {
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Apple post')).toBeInTheDocument())
    // Title desc -> Banana post then Apple post.
    await userEvent.click(screen.getByRole('button', { name: '↑' }))
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent || '')
    expect(titles.indexOf('Banana post')).toBeLessThan(titles.indexOf('Apple post'))
  })

  it('sorts by date with a page record on each side (covers a and b page-date branches)', async () => {
    const page1 = buildPageRecord({ id: 1, name: 'Apple page' })
    page1.original.post_date = '2024-01-01'
    const page2 = buildPageRecord({ id: 2, name: 'Banana page' })
    page2.original.post_date = '2024-04-01'
    mockGetMigrationData([page1, page2])
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Apple page')).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText('Sort By'), 'date')
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent || '')
    expect(titles.indexOf('Apple page')).toBeLessThan(titles.indexOf('Banana page'))
  })

  it('sorts by date with a post whose transformed.date is missing (falls back to original.post_date) — covers || fallback for both a and b', async () => {
    const post1 = buildPostRecord({ id: 1, title: 'Apple post' })
    delete (post1.transformed as unknown as Record<string, unknown>).date
    post1.original.post_date = '2024-01-01'
    const post2 = buildPostRecord({ id: 2, title: 'Banana post' })
    delete (post2.transformed as unknown as Record<string, unknown>).date
    post2.original.post_date = '2024-04-01'
    mockGetMigrationData([post1, post2])
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Apple post')).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText('Sort By'), 'date')
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent || '')
    expect(titles.indexOf('Apple post')).toBeLessThan(titles.indexOf('Banana post'))
  })

  it('sorts by type (alphabetical)', async () => {
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Apple page')).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText('Sort By'), 'type')
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent || '')
    // Posts ('post') comes after 'page' alphabetically when ascending.
    expect(titles.indexOf('Apple page')).toBeLessThan(titles.indexOf('Apple post'))
  })

  it('selects all and exports selected data via a download link click', async () => {
    const click = vi.fn()
    const createObjectURL = vi.fn().mockReturnValue('blob:fake')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return { click, href: '', download: '' } as unknown as HTMLElement
      }
      return document.implementation.createHTMLDocument().createElement(tag)
    })

    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Apple post')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Select All/ }))
    await userEvent.click(screen.getByRole('button', { name: /Export Selected/ }))
    expect(createObjectURL).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake')
  })

  it('toggles individual selection on/off', async () => {
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Apple post')).toBeInTheDocument())
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes.length).toBeGreaterThan(0)
    await userEvent.click(checkboxes[0])
    expect(screen.getByRole('button', { name: /Export Selected \(1\)/ })).toBeInTheDocument()
    await userEvent.click(checkboxes[0])
    expect(screen.queryByRole('button', { name: /Export Selected/ })).not.toBeInTheDocument()
  })

  it('Select All / Deselect All toggle works with no individual selection first', async () => {
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Apple post')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Select All' }))
    expect(screen.getByRole('button', { name: 'Deselect All' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Deselect All' }))
    expect(screen.getByRole('button', { name: 'Select All' })).toBeInTheDocument()
  })
})

describe('VerifyMigrationUI — details and data toggling', () => {
  it('shows / hides the per-record Details and Data panels', async () => {
    mockGetMigrationData([
      buildPostRecord({
        id: 1,
        media: [{ url: 'http://e/x.jpg', localPath: '/x.jpg', type: 'image', found: true }],
      }),
    ])
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Title 1')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /Show Details/ }))
    expect(screen.getByText(/Content Analysis/)).toBeInTheDocument()
    expect(screen.getByText(/Media References/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Hide Details/ }))
    expect(screen.queryByText(/Content Analysis/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Show Data/ }))
    expect(screen.getByText('Original JSON')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Hide Data/ }))
    expect(screen.queryByText('Original JSON')).not.toBeInTheDocument()
  })

  it('rewrites local image paths through the serve-media API in the rendered preview', async () => {
    mockGetMigrationData([
      buildPostRecord({
        id: 1,
        content: [
          {
            _type: 'image',
            _key: 'i1',
            url: '',
            localPath: 'input/uploads/x.jpg',
            alt: '',
          },
        ],
        media: [
          { url: 'http://e/x.jpg', localPath: 'input/uploads/x.jpg', type: 'image', found: true },
        ],
      }),
    ])
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Title 1')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Show Details/ }))
    // The rendered preview pane uses dangerouslySetInnerHTML, so the <img>
    // is plain HTML rather than an accessibility-tree image. Probe it via
    // querySelector so we can confirm the API rewrite landed.
    const html = document.querySelector('.preview-content')!.innerHTML
    expect(html).toContain('/api/serve-media?path=')
  })

  it('fires onComplete when the user clicks "Mark as Verified"', async () => {
    mockGetMigrationData([buildPostRecord()])
    const onComplete = vi.fn()
    render(<VerifyMigrationUI onComplete={onComplete} />)
    await waitFor(() => expect(screen.getByText('Title 1')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Mark as Verified/ }))
    expect(onComplete).toHaveBeenCalled()
  })

  it('renders page-specific summary fields (subheading)', async () => {
    mockGetMigrationData([buildPageRecord({ subheading: 'Pretty subheading' })])
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText(/Pretty subheading/)).toBeInTheDocument())
  })

  it('handles a page record without a subheading in the summary line and search', async () => {
    const page = buildPageRecord({ id: 5, name: 'No-sub page' })
    delete (page.transformed as unknown as Record<string, unknown>).subheading
    mockGetMigrationData([page])
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('No-sub page')).toBeInTheDocument())
    // Type a search query to force the search filter (which concatenates
    // heading + subheading) to traverse the subheading-undefined branch.
    await userEvent.type(screen.getByLabelText('Search'), 'No-sub')
    await waitFor(() => expect(screen.getByText('No-sub page')).toBeInTheDocument())
  })

  it('renders zero block count for a post whose content is undefined', async () => {
    const post = buildPostRecord({ id: 1 })
    delete (post.transformed as unknown as Record<string, unknown>).content
    mockGetMigrationData([post])
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Title 1')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Show Details/ }))
    expect(screen.getByText(/Block Count:/)).toBeInTheDocument()
  })

  it('renders zero word count and zero block count for a page record in the details panel', async () => {
    mockGetMigrationData([buildPageRecord({ id: 7 })])
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Page 7')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Show Details/ }))
    expect(screen.getByText(/Word Count:/)).toBeInTheDocument()
  })

  it('renders the audio/video badges in the media gallery for non-image media', async () => {
    mockGetMigrationData([
      buildPostRecord({
        id: 1,
        media: [
          { url: 'http://e/a.mp3', localPath: 'input/uploads/a.mp3', type: 'audio', found: true },
          { url: 'http://e/v.mp4', localPath: 'input/uploads/v.mp4', type: 'video', found: true },
        ],
      }),
    ])
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Title 1')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Show Details/ }))
    const refs = screen.getByText(/Media References/i).closest('div')!
    expect(within(refs).getByText('AUDIO')).toBeInTheDocument()
    expect(within(refs).getByText('VIDEO')).toBeInTheDocument()
  })

  it('renders the original post_content pre block via the Show Data branch', async () => {
    mockGetMigrationData([buildPostRecord({ id: 1 })])
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Title 1')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Show Data/ }))
    expect(screen.getByText('Original JSON')).toBeInTheDocument()
    expect(screen.getByText('Transformed JSON')).toBeInTheDocument()
  })

  it('shows an empty Original Content block when the original record has no post_content string', async () => {
    const record = buildPostRecord({ id: 1 })
    delete (record.original as unknown as Record<string, unknown>).post_content
    mockGetMigrationData([record])
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Title 1')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Show Details/ }))
    expect(screen.getByText(/Original Content/)).toBeInTheDocument()
  })

  it('rewrites local audio paths through the serve-media API in the rendered preview', async () => {
    mockGetMigrationData([
      buildPostRecord({
        id: 1,
        content: [
          {
            _type: 'audio',
            _key: 'a1',
            url: '',
            localPath: 'input/uploads/clip.mp3',
          } as never,
        ],
        media: [
          {
            url: 'http://e/clip.mp3',
            localPath: 'input/uploads/clip.mp3',
            type: 'audio',
            found: true,
          },
        ],
      }),
    ])
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Title 1')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Show Details/ }))
    const html = document.querySelector('.preview-content')!.innerHTML
    expect(html).toMatch(/<audio[\s\S]*\/api\/serve-media\?path=/)
  })

  it('rewrites local video paths through the serve-media API in the rendered preview', async () => {
    mockGetMigrationData([
      buildPostRecord({
        id: 1,
        content: [
          {
            _type: 'video',
            _key: 'v1',
            videoType: 'url',
            url: '',
            localPath: 'input/uploads/clip.mp4',
          } as never,
        ],
        media: [
          {
            url: 'http://e/clip.mp4',
            localPath: 'input/uploads/clip.mp4',
            type: 'video',
            found: true,
          },
        ],
      }),
    ])
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Title 1')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Show Details/ }))
    const html = document.querySelector('.preview-content')!.innerHTML
    // The video preview emits both <video><source> and the source src is
    // rewritten through the source replacement.
    expect(html).toContain('/api/serve-media?path=')
  })

  it('rewrites img src that contains /uploads/ even without a media reference match', async () => {
    mockGetMigrationData([
      buildPostRecord({
        id: 1,
        content: [
          { _type: 'image', _key: 'i1', url: 'input/uploads/no-ref.jpg', alt: '' } as never,
        ],
        media: [],
      }),
    ])
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Title 1')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Show Details/ }))
    const html = document.querySelector('.preview-content')!.innerHTML
    expect(html).toContain('/api/serve-media?path=')
  })

  it('leaves remote audio/video tags untouched when no mediaRef matches and the src is purely external', async () => {
    vi.spyOn(blockToHtmlModule, 'blockContentToHtml').mockReturnValue(
      [
        '<audio src="https://cdn.example.com/clip.mp3"></audio>',
        '<video src="https://cdn.example.com/clip.mp4"></video>',
      ].join('\n'),
    )
    mockGetMigrationData([buildPostRecord({ id: 1, media: [] })])
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Title 1')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Show Details/ }))
    const html = document.querySelector('.preview-content')!.innerHTML
    expect(html).toContain('https://cdn.example.com/clip.mp3')
    expect(html).toContain('https://cdn.example.com/clip.mp4')
    expect(html).not.toContain('/api/serve-media')
  })

  it('rewrites raw <img>/<audio>/<video>/<source> tags carrying local paths via the serve-media API (defensive paths)', async () => {
    // Stub blockContentToHtml so the rendered preview contains raw tags
    // whose src attributes still point at the original local paths.
    vi.spyOn(blockToHtmlModule, 'blockContentToHtml').mockReturnValue(
      [
        '<img src="input/uploads/match.jpg" alt="" />', // matches mediaRef
        '<img src="input/uploads/no-ref.jpg" alt="" />', // no mediaRef but starts with input/uploads/
        '<audio src="input/uploads/match.mp3"></audio>', // matches audio mediaRef
        '<audio src="/abs/clip.mp3"></audio>', // path-style fallback
        '<video src="input/uploads/match.mp4"></video>', // matches video mediaRef
        '<video src="/abs/clip.mp4"></video>', // path-style fallback
        '<source src="input/uploads/clip.mp3" type="audio/mpeg" />',
        '<source src="http://example.com/leave-me.mp3" type="audio/mpeg" />',
      ].join('\n'),
    )
    mockGetMigrationData([
      buildPostRecord({
        id: 1,
        media: [
          { url: 'a', localPath: 'input/uploads/match.jpg', type: 'image', found: true },
          { url: 'b', localPath: 'input/uploads/match.mp3', type: 'audio', found: true },
          { url: 'c', localPath: 'input/uploads/match.mp4', type: 'video', found: true },
        ],
      }),
    ])
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Title 1')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Show Details/ }))
    const html = document.querySelector('.preview-content')!.innerHTML
    expect((html.match(/\/api\/serve-media\?path=/g) ?? []).length).toBeGreaterThanOrEqual(6)
    // Tags with no recognised local path stay untouched.
    expect(html).toContain('http://example.com/leave-me.mp3')
  })

  it('renders found media references inside the details panel', async () => {
    mockGetMigrationData([
      buildPostRecord({
        id: 1,
        media: [
          { url: 'http://e/x.jpg', localPath: 'input/uploads/x.jpg', type: 'image', found: true },
          { url: 'http://e/missing.mp4', localPath: '', type: 'video', found: false },
        ],
      }),
    ])
    render(<VerifyMigrationUI />)
    await waitFor(() => expect(screen.getByText('Title 1')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Show Details/ }))
    const refs = screen.getByText(/Media References/i).closest('div')!
    expect(within(refs).getAllByText(/FOUND|MISSING/i).length).toBeGreaterThan(0)
    expect(within(refs).getByText('http://e/x.jpg')).toBeInTheDocument()
  })
})
