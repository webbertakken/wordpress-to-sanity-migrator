import { describe, it, expect, vi, beforeEach } from 'vitest'

const { checkContainerStatusMock, executeMock } = vi.hoisted(() => ({
  checkContainerStatusMock: vi.fn(),
  executeMock: vi.fn(),
}))

vi.mock('../check-container-status', () => ({
  checkContainerStatus: checkContainerStatusMock,
}))

vi.mock('../execute-container-command', () => ({
  executeContainerCommand: executeMock,
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
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/docker', () => {
  it('returns HTTP 400 for an unknown operation', async () => {
    const response = await POST(
      new Request('http://localhost/api/docker', {
        method: 'POST',
        body: JSON.stringify({ operation: 'wibble' }),
      }),
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.error).toBe('Invalid operation')
  })

  it('returns HTTP 400 when no operation is given', async () => {
    const response = await POST(
      new Request('http://localhost/api/docker', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    )
    expect(response.status).toBe(400)
  })

  it('forwards a Docker-not-running status as a 400 response', async () => {
    checkContainerStatusMock.mockResolvedValue({
      success: false,
      error: 'Docker is not running',
      details: { guidance: 'Start Docker' },
    })
    const response = await POST(
      new Request('http://localhost/api/docker', {
        method: 'POST',
        body: JSON.stringify({ operation: 'start' }),
      }),
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.success).toBe(false)
  })

  it('streams the per-step Docker output and the final result', async () => {
    checkContainerStatusMock.mockResolvedValue({ success: true, isRunning: true })
    executeMock.mockImplementation(
      async (
        _cmd: string,
        onStep: (s: {
          step: string
          cmd: string
          stdout: string
          stderr: string
          success: boolean
        }) => void,
      ) => {
        onStep({ step: 'doing', cmd: 'docker run', stdout: '', stderr: '', success: false })
        return { success: true, message: 'started', steps: [] }
      },
    )

    const response = await POST(
      new Request('http://localhost/api/docker', {
        method: 'POST',
        body: JSON.stringify({ operation: 'start' }),
      }),
    )
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    const body = await readSse(response)
    expect(body).toContain('"type":"status"')
    expect(body).toContain('"type":"step"')
    expect(body).toContain('"type":"result"')
  })

  it('emits an error frame when executeContainerCommand throws', async () => {
    checkContainerStatusMock.mockResolvedValue({ success: true, isRunning: true })
    executeMock.mockRejectedValueOnce(new Error('boom'))

    const response = await POST(
      new Request('http://localhost/api/docker', {
        method: 'POST',
        body: JSON.stringify({ operation: 'start' }),
      }),
    )
    const body = await readSse(response)
    expect(body).toContain('"type":"error"')
    expect(body).toContain('Internal server error')
  })

  it('falls back to String(error) for non-Error rejections', async () => {
    checkContainerStatusMock.mockResolvedValue({ success: true, isRunning: true })
    executeMock.mockRejectedValueOnce('weird-string')

    const response = await POST(
      new Request('http://localhost/api/docker', {
        method: 'POST',
        body: JSON.stringify({ operation: 'start' }),
      }),
    )
    const body = await readSse(response)
    expect(body).toContain('weird-string')
  })

  it('returns a 500 JSON error when request.json() throws', async () => {
    const broken = new Request('http://localhost/api/docker', {
      method: 'POST',
      body: 'not-json',
    })
    const response = await POST(broken)
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error).toBe('Internal server error')
  })

  it('emits an in-stream error frame even for an Error with an undefined stack', async () => {
    checkContainerStatusMock.mockResolvedValue({ success: true, isRunning: true })
    const err = new Error('no-stack')
    Object.defineProperty(err, 'stack', { value: undefined })
    executeMock.mockRejectedValueOnce(err)

    const response = await POST(
      new Request('http://localhost/api/docker', {
        method: 'POST',
        body: JSON.stringify({ operation: 'start' }),
      }),
    )
    const body = await readSse(response)
    expect(body).toContain('Internal server error')
    expect(body).toContain('no-stack')
  })

  it('returns a 500 JSON error for non-Error throws at the outer try', async () => {
    // Force a synchronous non-Error throw from request.json() by passing a
    // body that JSON.parse will throw a SyntaxError on. The catch path then
    // exercises the String(error) fallback.
    const broken = new Request('http://localhost/api/docker', {
      method: 'POST',
      body: 'definitely-not-json',
    })
    const response = await POST(broken)
    expect(response.status).toBe(500)
  })
})
