import { describe, it, expect, vi, beforeEach } from 'vitest'

const runMigrationMock = vi.fn()
vi.mock('../migration-service', () => ({
  runMigrationPreparation: (...a: unknown[]) => runMigrationMock(...a),
}))

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

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('POST /api/prepare-migration', () => {
  it('streams progress and a final result', async () => {
    runMigrationMock.mockImplementation(
      async (onProgress: (u: { step: string; message: string }) => void) => {
        onProgress({ step: 'go', message: 'go' })
        return { success: true, message: 'ok' }
      },
    )

    const response = await POST(
      new Request('http://localhost/api/prepare-migration', {
        method: 'POST',
        body: JSON.stringify({ parsePagesAsPosts: true }),
      }),
    )

    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    const body = await readSse(response)
    expect(body).toContain('"type":"status"')
    expect(body).toContain('"type":"progress"')
    expect(body).toContain('"type":"result"')
    expect(body).toContain('pages as posts')
    expect(runMigrationMock).toHaveBeenCalledWith(expect.any(Function), { parsePagesAsPosts: true })
  })

  it('falls back to default options when the body is not valid JSON', async () => {
    runMigrationMock.mockResolvedValue({ success: true })
    const response = await POST(
      new Request('http://localhost/api/prepare-migration', {
        method: 'POST',
        body: 'not-json',
      }),
    )
    const body = await readSse(response)
    expect(body).toContain('Starting migration preparation...')
    expect(runMigrationMock).toHaveBeenCalledWith(expect.any(Function), {})
  })

  it('emits an error frame when the migration service throws', async () => {
    runMigrationMock.mockRejectedValueOnce(new Error('boom'))
    const response = await POST(
      new Request('http://localhost/api/prepare-migration', { method: 'POST', body: '' }),
    )
    const body = await readSse(response)
    expect(body).toContain('"type":"error"')
    expect(body).toContain('Internal server error')
  })

  it('falls back to String(error) when the rejection is not an Error', async () => {
    runMigrationMock.mockRejectedValueOnce('weird-string')
    const response = await POST(
      new Request('http://localhost/api/prepare-migration', { method: 'POST', body: '' }),
    )
    const body = await readSse(response)
    expect(body).toContain('weird-string')
  })

  it('falls back to String(error) when the Error has no stack', async () => {
    const err = new Error('boom')
    Object.defineProperty(err, 'stack', { value: undefined })
    runMigrationMock.mockRejectedValueOnce(err)
    const response = await POST(
      new Request('http://localhost/api/prepare-migration', { method: 'POST', body: '' }),
    )
    const body = await readSse(response)
    expect(body).toContain('boom')
  })
})
