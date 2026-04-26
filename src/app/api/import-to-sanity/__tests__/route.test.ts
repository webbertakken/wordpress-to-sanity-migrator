import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const { uploadMock, fetchClientMock, createMock, readFileMock, createClientMock } = vi.hoisted(
  () => ({
    uploadMock: vi.fn(),
    fetchClientMock: vi.fn(),
    createMock: vi.fn(),
    readFileMock: vi.fn(),
    createClientMock: vi.fn(),
  }),
)

vi.mock('@sanity/client', () => ({
  createClient: createClientMock.mockImplementation(() => ({
    assets: { upload: uploadMock },
    fetch: fetchClientMock,
    create: createMock,
  })),
}))

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises')
  return {
    ...actual,
    default: { ...actual, readFile: readFileMock },
    readFile: readFileMock,
  }
})

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'proj1'
  process.env.SANITY_API_WRITE_TOKEN = 'tok'
  process.env.NEXT_PUBLIC_SANITY_DATASET = 'production'
  process.env.SANITY_API_VERSION = '2024-01-01'
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  fetchClientMock.mockReset()
  createMock.mockReset()
  uploadMock.mockReset()
  readFileMock.mockReset()
  createClientMock.mockImplementation(() => ({
    assets: { upload: uploadMock },
    fetch: fetchClientMock,
    create: createMock,
  }))
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

import { POST } from '../route'

async function readSse(response: Response): Promise<string> {
  const reader = response.body!.getReader()
  const chunks: string[] = []
  const decoder = new TextDecoder()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    chunks.push(decoder.decode(value))
  }
  return chunks.join('')
}

function postRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/import-to-sanity', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function postContent(records: unknown[]): void {
  readFileMock.mockResolvedValue(JSON.stringify(records))
}

const sampleRecord = (
  overrides: Partial<{ id: number; type: 'post' | 'page'; media: unknown[] }> = {},
) => {
  const id = overrides.id ?? 1
  const type = overrides.type ?? 'post'
  const media = overrides.media ?? []
  if (type === 'post') {
    return {
      original: {
        ID: id,
        post_title: `Title ${id}`,
        post_content: '',
        post_excerpt: '',
        post_date: '2024-01-01',
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
        title: `Title ${id}`,
        slug: { _type: 'slug', current: `slug-${id}`, source: 'title' },
        content: [],
        excerpt: 'Excerpt',
        coverImage: { _type: 'image', alt: 'cover' },
        date: '2024-01-01',
        media,
      },
    }
  }
  return {
    original: {
      ID: id,
      post_title: `Page ${id}`,
      post_content: '',
      post_excerpt: '',
      post_date: '2024-01-01',
      post_modified: '2024-01-01',
      post_status: 'publish',
      post_name: `page-${id}`,
      post_type: 'page',
      post_parent: 0,
      menu_order: 0,
      guid: '',
    },
    transformed: {
      _type: 'page',
      name: `Page ${id}`,
      slug: { _type: 'slug', current: `page-${id}`, source: 'name' },
      heading: `Page ${id}`,
      subheading: 'Sub',
      media,
    },
  }
}

describe('POST /api/import-to-sanity — configuration errors', () => {
  it('emits an error when the Sanity project ID is missing', async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = ''
    const response = await POST(postRequest({ testRun: true }))
    const body = await readSse(response)
    expect(body).toContain('Missing Sanity configuration')
  })

  it('emits an error when the Sanity write token is missing', async () => {
    process.env.SANITY_API_WRITE_TOKEN = ''
    const response = await POST(postRequest({ testRun: true }))
    const body = await readSse(response)
    expect(body).toContain('Missing Sanity configuration')
  })

  it('emits an error when the connection probe fails (Error)', async () => {
    fetchClientMock.mockRejectedValue(new Error('connection refused'))
    const response = await POST(postRequest({ testRun: true }))
    const body = await readSse(response)
    expect(body).toContain('Failed to connect to Sanity')
    expect(body).toContain('connection refused')
  })

  it('emits an error when the connection probe rejects with a non-Error value', async () => {
    fetchClientMock.mockRejectedValue('weird-string')
    const response = await POST(postRequest({ testRun: true }))
    const body = await readSse(response)
    expect(body).toContain('Failed to connect to Sanity')
  })
})

describe('POST /api/import-to-sanity — record selection', () => {
  beforeEach(() => {
    fetchClientMock.mockResolvedValue(null)
  })

  it('selects a record by ID when selectedRecordId is provided', async () => {
    postContent([sampleRecord({ id: 1 }), sampleRecord({ id: 2 })])
    const response = await POST(postRequest({ testRun: true, selectedRecordId: '2' }))
    const body = await readSse(response)
    expect(body).toContain('Title 2')
    expect(body).not.toContain('Title 1')
  })

  it('emits an error when the selected record is not found', async () => {
    postContent([sampleRecord({ id: 1 })])
    const response = await POST(postRequest({ testRun: true, selectedRecordId: '999' }))
    const body = await readSse(response)
    expect(body).toContain('Record with ID 999 not found')
  })

  it('test-run picks a record with mixed image+audio media when one is available', async () => {
    postContent([
      sampleRecord({ id: 1 }),
      sampleRecord({
        id: 2,
        media: [
          { type: 'image', url: 'a', localPath: '/a', found: true },
          { type: 'audio', url: 'b', localPath: '/b', found: true },
        ],
      }),
    ])
    const response = await POST(postRequest({ testRun: true }))
    const body = await readSse(response)
    expect(body).toContain('mixed media')
    expect(body).toContain('Title 2')
  })

  it('test-run falls back to a record with any media when no mixed-media record exists', async () => {
    postContent([
      sampleRecord({ id: 1 }),
      sampleRecord({
        id: 2,
        media: [{ type: 'image', url: 'a', localPath: '/a', found: true }],
      }),
    ])
    const response = await POST(postRequest({ testRun: true }))
    const body = await readSse(response)
    expect(body).toContain('record with media')
    expect(body).toContain('Title 2')
  })

  it('test-run falls back to the very first record when no record has any media', async () => {
    postContent([sampleRecord({ id: 1 }), sampleRecord({ id: 2 })])
    const response = await POST(postRequest({ testRun: true }))
    const body = await readSse(response)
    expect(body).toContain('first record')
    expect(body).toContain('Title 1')
  })
})

describe('POST /api/import-to-sanity — test-run media simulation', () => {
  beforeEach(() => {
    fetchClientMock.mockResolvedValue(null)
  })

  it('handles a test-run document summary when content is undefined', async () => {
    const record = sampleRecord({ id: 1 })
    delete (record.transformed as Record<string, unknown>).content
    postContent([record])
    const response = await POST(postRequest({ testRun: true, selectedRecordId: '1' }))
    const body = await readSse(response)
    expect(body).toContain('document summary')
  })

  it('logs simulated upload assets and full document body', async () => {
    postContent([
      sampleRecord({
        id: 1,
        media: [
          { type: 'image', url: 'http://e/img.jpg', localPath: '/abs/img.jpg', found: true },
          { type: 'audio', url: 'http://e/audio.mp3', localPath: '/abs/audio.mp3', found: true },
        ],
      }),
    ])
    const response = await POST(postRequest({ testRun: true, selectedRecordId: '1' }))
    const body = await readSse(response)
    expect(body).toContain('Would upload')
    expect(body).toContain('mock-asset-')
    expect(body).toContain('document summary')
    expect(body).toContain('full Sanity document body')
    expect(body).toContain('Test run completed successfully')
  })

  it('reports missing media files', async () => {
    postContent([
      sampleRecord({
        id: 1,
        media: [{ type: 'image', url: 'http://e/x.jpg', localPath: '/x.jpg', found: false }],
      }),
    ])
    const response = await POST(postRequest({ testRun: true, selectedRecordId: '1' }))
    const body = await readSse(response)
    expect(body).toContain('Missing file')
  })
})

describe('POST /api/import-to-sanity — production import', () => {
  beforeEach(() => {
    fetchClientMock.mockResolvedValue(null)
    createMock.mockResolvedValue({ _id: 'doc-123' })
    readFileMock.mockResolvedValue('upload-bytes')
  })

  it('uploads media and creates the post document', async () => {
    postContent([
      sampleRecord({
        id: 1,
        media: [{ type: 'image', url: 'http://e/x.jpg', localPath: '/x.jpg', found: true }],
      }),
    ])
    uploadMock.mockResolvedValue({ _id: 'asset-1' })

    const response = await POST(postRequest({ selectedRecordId: '1' }))
    const body = await readSse(response)
    expect(uploadMock).toHaveBeenCalledWith('image', expect.anything(), expect.anything())
    expect(createMock).toHaveBeenCalled()
    expect(body).toContain('Created document: Title 1')
    expect(body).toContain('Import completed successfully')
  })

  it('uploads audio and video as file assets, not image', async () => {
    postContent([
      sampleRecord({
        id: 1,
        media: [
          { type: 'audio', url: 'http://e/a.mp3', localPath: '/a.mp3', found: true },
          { type: 'video', url: 'http://e/v.mp4', localPath: '/v.mp4', found: true },
        ],
      }),
    ])
    uploadMock.mockResolvedValueOnce({ _id: 'asset-a' }).mockResolvedValueOnce({ _id: 'asset-v' })
    await readSse(await POST(postRequest({ selectedRecordId: '1' })))
    expect(uploadMock).toHaveBeenNthCalledWith(1, 'file', expect.anything(), expect.anything())
    expect(uploadMock).toHaveBeenNthCalledWith(2, 'file', expect.anything(), expect.anything())
  })

  it('reports failed uploads as errors', async () => {
    postContent([
      sampleRecord({
        id: 1,
        media: [{ type: 'image', url: 'http://e/x.jpg', localPath: '/x.jpg', found: true }],
      }),
    ])
    uploadMock.mockRejectedValue(new Error('Some upload error'))

    const response = await POST(postRequest({ selectedRecordId: '1' }))
    const body = await readSse(response)
    expect(body).toContain('Failed to upload')
  })

  it('aborts retries on non-retryable upload errors (File too large)', async () => {
    postContent([
      sampleRecord({
        id: 1,
        media: [{ type: 'image', url: 'http://e/x.jpg', localPath: '/x.jpg', found: true }],
      }),
    ])
    uploadMock.mockRejectedValue(new Error('File too large'))

    await readSse(await POST(postRequest({ selectedRecordId: '1' })))
    // Single attempt only.
    expect(uploadMock).toHaveBeenCalledTimes(1)
  })

  it('aborts retries on non-retryable upload errors (ENOENT)', async () => {
    postContent([
      sampleRecord({
        id: 1,
        media: [{ type: 'image', url: 'http://e/x.jpg', localPath: '/x.jpg', found: true }],
      }),
    ])
    readFileMock.mockRejectedValue(
      Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' }),
    )

    await readSse(await POST(postRequest({ selectedRecordId: '1' })))
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('retries with exponential backoff on retryable upload errors', async () => {
    postContent([
      sampleRecord({
        id: 1,
        media: [{ type: 'image', url: 'http://e/x.jpg', localPath: '/x.jpg', found: true }],
      }),
    ])
    uploadMock
      .mockRejectedValueOnce(new Error('transient'))
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce({ _id: 'asset-1' })

    vi.useFakeTimers()
    const responsePromise = POST(postRequest({ selectedRecordId: '1' }))
    await vi.runAllTimersAsync()
    vi.useRealTimers()
    const response = await responsePromise
    const body = await readSse(response)

    expect(uploadMock).toHaveBeenCalledTimes(3)
    expect(body).toContain('asset-1')
  })

  it('imports a page with no content/excerpt', async () => {
    postContent([sampleRecord({ id: 1, type: 'page' })])

    const response = await POST(postRequest({ selectedRecordId: '1' }))
    await readSse(response)
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ _type: 'page' }))
  })

  it('imports all records when no selectedRecordId is provided in production', async () => {
    postContent([sampleRecord({ id: 1 }), sampleRecord({ id: 2 })])
    await readSse(await POST(postRequest({})))
    expect(createMock).toHaveBeenCalledTimes(2)
  })

  it('translates content image/audio/video blocks into Sanity asset references', async () => {
    const record = sampleRecord({
      id: 1,
      media: [
        { type: 'image', url: 'http://e/x.jpg', localPath: '/x.jpg', found: true },
        { type: 'audio', url: 'http://e/a.mp3', localPath: '/a.mp3', found: true },
        { type: 'video', url: 'http://e/v.mp4', localPath: '/v.mp4', found: true },
      ],
    })
    record.transformed.content = [
      { _type: 'image', _key: 'i1', url: 'http://e/x.jpg', localPath: '/x.jpg' },
      {
        _type: 'audio',
        _key: 'a1',
        url: 'http://e/a.mp3',
        localPath: '/a.mp3',
        audioFile: { _type: 'file' },
      },
      {
        _type: 'video',
        _key: 'v1',
        videoType: 'url',
        url: 'http://e/v.mp4',
        localPath: '/v.mp4',
      },
      {
        _type: 'video',
        _key: 'v2',
        videoType: 'youtube',
        url: 'https://yt/abc',
        localPath: undefined,
      },
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        children: [{ _type: 'span', _key: 's', text: 'x' }],
        markDefs: [],
      },
    ] as never
    postContent([record])
    uploadMock
      .mockResolvedValueOnce({ _id: 'asset-img' })
      .mockResolvedValueOnce({ _id: 'asset-aud' })
      .mockResolvedValueOnce({ _id: 'asset-vid' })

    const response = await POST(postRequest({ selectedRecordId: '1' }))
    await readSse(response)

    const arg = createMock.mock.calls[0][0] as { content: Array<Record<string, unknown>> }
    expect((arg.content[0] as { asset?: { _ref: string } }).asset).toMatchObject({
      _ref: 'asset-img',
    })
    expect(
      (arg.content[1] as unknown as { audioFile: { asset: { _ref: string } } }).audioFile.asset
        ._ref,
    ).toBe('asset-aud')
    expect(
      (arg.content[2] as unknown as { videoFile: { asset: { _ref: string } } }).videoFile.asset
        ._ref,
    ).toBe('asset-vid')
    // YouTube videos: localPath dropped, but URL preserved.
    expect((arg.content[3] as unknown as { url: string }).url).toBe('https://yt/abc')
  })

  it('handles content image/audio blocks whose localPath is empty (covers the false branch of the ternary)', async () => {
    // The migration prep can produce blocks with a present-but-empty localPath
    // when the source media is missing. JSON.parse preserves '' but drops
    // undefined, so '' is the only way to exercise the falsy branch via the
    // file-read pipeline.
    const record = sampleRecord({ id: 1, media: [] })
    record.transformed.content = [
      { _type: 'image', _key: 'i1', url: 'http://e/x.jpg', localPath: '' },
      {
        _type: 'audio',
        _key: 'a1',
        url: 'http://e/a.mp3',
        localPath: '',
        audioFile: { _type: 'file' },
      },
    ] as never
    postContent([record])
    await readSse(await POST(postRequest({ selectedRecordId: '1' })))
    const arg = createMock.mock.calls[0][0] as { content: Array<Record<string, unknown>> }
    expect(arg.content[0]).not.toHaveProperty('asset')
    expect((arg.content[1] as { audioFile: Record<string, unknown> }).audioFile).not.toHaveProperty(
      'asset',
    )
  })

  it('strips temporary fields from media blocks even when no asset is uploaded', async () => {
    const record = sampleRecord({ id: 1, media: [] })
    record.transformed.content = [
      { _type: 'image', _key: 'i1', url: 'http://e/x.jpg', localPath: '/x.jpg' },
      {
        _type: 'audio',
        _key: 'a1',
        url: 'http://e/a.mp3',
        localPath: '/a.mp3',
        audioFile: { _type: 'file' },
      },
      { _type: 'video', _key: 'v1', videoType: 'url', url: 'http://e/v.mp4', localPath: '/v.mp4' },
    ] as never
    postContent([record])
    await readSse(await POST(postRequest({ selectedRecordId: '1' })))
    const arg = createMock.mock.calls[0][0] as { content: Array<Record<string, unknown>> }
    expect(arg.content[0]).not.toHaveProperty('url')
    expect(arg.content[0]).not.toHaveProperty('localPath')
    expect(arg.content[1]).not.toHaveProperty('url')
    expect(arg.content[2]).not.toHaveProperty('url')
  })

  it('uses the first found image as the cover image asset reference', async () => {
    const record = sampleRecord({
      id: 1,
      media: [{ type: 'image', url: 'http://e/img.jpg', localPath: '/img.jpg', found: true }],
    })
    postContent([record])
    uploadMock.mockResolvedValueOnce({ _id: 'asset-cover' })
    await readSse(await POST(postRequest({ selectedRecordId: '1' })))
    const arg = createMock.mock.calls[0][0] as { coverImage: { asset?: { _ref: string } } }
    expect(arg.coverImage.asset?._ref).toBe('asset-cover')
  })

  it('omits the cover image asset when no image is found', async () => {
    const record = sampleRecord({
      id: 1,
      media: [{ type: 'audio', url: 'http://e/a.mp3', localPath: '/a.mp3', found: true }],
    })
    postContent([record])
    uploadMock.mockResolvedValueOnce({ _id: 'asset-aud' })
    await readSse(await POST(postRequest({ selectedRecordId: '1' })))
    const arg = createMock.mock.calls[0][0] as { coverImage: { asset?: unknown } }
    expect(arg.coverImage.asset).toBeUndefined()
  })

  it('renders a test-run summary for a page record (covers page branches in document summary)', async () => {
    const page = sampleRecord({ id: 5, type: 'page' })
    postContent([page])
    const response = await POST(postRequest({ testRun: true, selectedRecordId: '5' }))
    const body = await readSse(response)
    expect(body).toContain('document summary')
    expect(body).toContain('Page 5')
  })

  it('skips re-uploading media that is already in mediaAssets (covers the !mediaRef.found else branch)', async () => {
    // Two records share the same media file; the second iteration finds the
    // mediaRef already in mediaAssets, so the `if (mediaRef.found && !has)`
    // branch is skipped and the `else if (!mediaRef.found)` is also skipped
    // — covering the latter's else path.
    const shared = {
      type: 'image' as const,
      url: 'http://e/shared.jpg',
      localPath: '/shared.jpg',
      found: true,
    }
    postContent([
      sampleRecord({ id: 1, media: [shared] }),
      sampleRecord({ id: 2, media: [shared] }),
    ])
    uploadMock.mockResolvedValue({ _id: 'asset-shared' })
    await readSse(await POST(postRequest({})))
    // Only one upload despite two records referring to the file.
    expect(uploadMock).toHaveBeenCalledTimes(1)
  })

  it('handles a self-hosted video block without a localPath (no asset attached)', async () => {
    const record = sampleRecord({ id: 1 })
    record.transformed.content = [
      { _type: 'video', _key: 'v1', videoType: 'url', url: 'http://e/v.mp4' },
    ] as never
    postContent([record])
    await readSse(await POST(postRequest({ selectedRecordId: '1' })))
    const arg = createMock.mock.calls[0][0] as { content: Array<Record<string, unknown>> }
    expect(arg.content[0]).not.toHaveProperty('videoFile')
    expect(arg.content[0]).not.toHaveProperty('localPath')
    expect(arg.content[0]).not.toHaveProperty('url')
  })

  it('handles a post without a content field (processMediaInContent skipped)', async () => {
    const record = sampleRecord({ id: 1 })
    delete (record.transformed as Record<string, unknown>).content
    postContent([record])
    await readSse(await POST(postRequest({ selectedRecordId: '1' })))
    expect(createMock).toHaveBeenCalled()
    const arg = createMock.mock.calls[0][0] as { content?: unknown }
    expect(arg.content).toBeUndefined()
  })

  it('handles non-Error rejections by emitting an error frame', async () => {
    postContent([sampleRecord({ id: 1 })])
    createMock.mockRejectedValue('weird-string')
    const response = await POST(postRequest({ selectedRecordId: '1' }))
    const body = await readSse(response)
    expect(body).toContain('Import failed')
  })
})
