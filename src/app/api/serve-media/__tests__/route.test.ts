import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'stream'
import path from 'path'
import { NextRequest } from 'next/server'

const { existsSyncMock, statSyncMock, createReadStreamMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  statSyncMock: vi.fn(),
  createReadStreamMock: vi.fn(),
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: existsSyncMock,
      statSync: statSyncMock,
      createReadStream: createReadStreamMock,
    },
    existsSync: existsSyncMock,
    statSync: statSyncMock,
    createReadStream: createReadStreamMock,
  }
})

import { GET } from '../route'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function makeRequest(query: string, headers: Record<string, string> = {}): NextRequest {
  const url = `http://localhost/api/serve-media${query}`
  return new NextRequest(url, { headers })
}

function fakeStream(buffer: Buffer): Readable {
  return Readable.from([buffer])
}

async function readResponseBody(response: Response): Promise<Buffer> {
  const reader = response.body!.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)))
}

describe('GET /api/serve-media', () => {
  it('returns 400 when no path query is provided', async () => {
    const response = await GET(makeRequest(''))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Missing file path parameter' })
  })

  it('returns 403 when the requested path is outside the input directory', async () => {
    const response = await GET(makeRequest('?path=../etc/passwd'))
    expect(response.status).toBe(403)
  })

  it('returns 404 when the file does not exist', async () => {
    existsSyncMock.mockReturnValue(false)
    const response = await GET(makeRequest('?path=input/uploads/missing.jpg'))
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error).toBe('Media file not found')
    expect(body.details.requestedFile).toBe('missing.jpg')
  })

  it('streams the file with Content-Type derived from extension', async () => {
    existsSyncMock.mockReturnValue(true)
    statSyncMock.mockReturnValue({ size: 4 })
    createReadStreamMock.mockReturnValue(fakeStream(Buffer.from('data')))

    const response = await GET(makeRequest('?path=input/uploads/photo.jpg'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    expect(response.headers.get('Content-Length')).toBe('4')
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    const body = await readResponseBody(response)
    expect(body.toString()).toBe('data')
  })

  it('falls back to application/octet-stream for unrecognised extensions', async () => {
    existsSyncMock.mockReturnValue(true)
    statSyncMock.mockReturnValue({ size: 1 })
    createReadStreamMock.mockReturnValue(fakeStream(Buffer.from('x')))
    const response = await GET(makeRequest('?path=input/uploads/file.xyz'))
    expect(response.headers.get('Content-Type')).toBe('application/octet-stream')
  })

  it('serves a 206 partial content response for valid range requests', async () => {
    existsSyncMock.mockReturnValue(true)
    statSyncMock.mockReturnValue({ size: 100 })
    createReadStreamMock.mockReturnValue(fakeStream(Buffer.from('partial')))

    const response = await GET(makeRequest('?path=input/uploads/clip.mp3', { range: 'bytes=0-9' }))
    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe('bytes 0-9/100')
    expect(response.headers.get('Content-Length')).toBe('10')
  })

  it('handles open-ended ranges (bytes=N-)', async () => {
    existsSyncMock.mockReturnValue(true)
    statSyncMock.mockReturnValue({ size: 100 })
    createReadStreamMock.mockReturnValue(fakeStream(Buffer.from('rest')))
    const response = await GET(makeRequest('?path=input/uploads/clip.mp3', { range: 'bytes=50-' }))
    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe('bytes 50-99/100')
  })

  it('handles suffix ranges (bytes=-N)', async () => {
    existsSyncMock.mockReturnValue(true)
    statSyncMock.mockReturnValue({ size: 100 })
    createReadStreamMock.mockReturnValue(fakeStream(Buffer.from('tail')))
    const response = await GET(makeRequest('?path=input/uploads/clip.mp3', { range: 'bytes=-10' }))
    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe('bytes 90-99/100')
  })

  it('falls back to a full-content response for malformed range headers', async () => {
    existsSyncMock.mockReturnValue(true)
    statSyncMock.mockReturnValue({ size: 100 })
    createReadStreamMock.mockReturnValue(fakeStream(Buffer.from('x')))
    const response = await GET(
      makeRequest('?path=input/uploads/clip.mp3', { range: 'bytes=foo-bar' }),
    )
    expect(response.status).toBe(200)
  })

  it('clamps the end of a range that exceeds the file size', async () => {
    existsSyncMock.mockReturnValue(true)
    statSyncMock.mockReturnValue({ size: 50 })
    createReadStreamMock.mockReturnValue(fakeStream(Buffer.from('x')))
    const response = await GET(
      makeRequest('?path=input/uploads/clip.mp3', { range: 'bytes=10-200' }),
    )
    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe('bytes 10-49/50')
  })

  it('falls back to a full response when the range start is past the end of the file', async () => {
    existsSyncMock.mockReturnValue(true)
    statSyncMock.mockReturnValue({ size: 50 })
    createReadStreamMock.mockReturnValue(fakeStream(Buffer.from('x')))
    const response = await GET(
      makeRequest('?path=input/uploads/clip.mp3', { range: 'bytes=100-200' }),
    )
    expect(response.status).toBe(200)
  })

  it('returns 500 when statSync throws unexpectedly', async () => {
    existsSyncMock.mockReturnValue(true)
    statSyncMock.mockImplementation(() => {
      throw new Error('disk failure')
    })
    const response = await GET(makeRequest('?path=input/uploads/photo.jpg'))
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error).toBe('Failed to serve media file')
    expect(body.message).toMatch(/disk failure/)
  })

  it('falls back to "Unknown error" when the rejection is not an Error', async () => {
    existsSyncMock.mockReturnValue(true)
    statSyncMock.mockImplementation(() => {
      throw 'weird-string' // eslint-disable-line @typescript-eslint/no-throw-literal
    })
    const response = await GET(makeRequest('?path=input/uploads/photo.jpg'))
    const body = await response.json()
    expect(body.message).toBe('Unknown error')
  })

  it('accepts an absolute path inside the input directory', async () => {
    existsSyncMock.mockReturnValue(true)
    statSyncMock.mockReturnValue({ size: 1 })
    createReadStreamMock.mockReturnValue(fakeStream(Buffer.from('x')))
    const absolute = path.join(process.cwd(), 'input', 'uploads', 'a.png')
    const response = await GET(makeRequest(`?path=${encodeURIComponent(absolute)}`))
    expect(response.status).toBe(200)
  })

  it('forwards a stream error to the response stream consumer', async () => {
    existsSyncMock.mockReturnValue(true)
    statSyncMock.mockReturnValue({ size: 1 })
    const broken = new Readable({
      read() {
        this.emit('error', new Error('stream-error'))
      },
    })
    createReadStreamMock.mockReturnValue(broken)
    const response = await GET(makeRequest('?path=input/uploads/photo.jpg'))
    await expect(readResponseBody(response)).rejects.toThrow('stream-error')
  })

  it('cancelling the response stream destroys the underlying node stream', async () => {
    existsSyncMock.mockReturnValue(true)
    statSyncMock.mockReturnValue({ size: 1 })
    let destroyed = false
    const node = new Readable({
      read() {
        // never end; we cancel from the outside
      },
    })
    const originalDestroy = node.destroy.bind(node)
    node.destroy = ((...args: Parameters<typeof originalDestroy>) => {
      destroyed = true
      return originalDestroy(...args)
    }) as typeof node.destroy
    createReadStreamMock.mockReturnValue(node)
    const response = await GET(makeRequest('?path=input/uploads/photo.jpg'))
    await response.body!.cancel()
    expect(destroyed).toBe(true)
  })
})
