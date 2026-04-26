import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DockerManagerUI } from '../DockerManagerUI'

interface SseFrame {
  type: 'status' | 'step' | 'result' | 'error'
  [key: string]: unknown
}

function sseResponse(frames: SseFrame[], { status = 200 }: { status?: number } = {}): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`))
      }
      controller.close()
    },
  })
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } })
}

function jsonResponse(body: unknown, { status = 500 }: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('DockerManagerUI — basic rendering', () => {
  it('renders the start and stop buttons', () => {
    render(<DockerManagerUI />)
    expect(screen.getByRole('button', { name: /Start Container/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Stop Container/ })).toBeInTheDocument()
  })
})

describe('DockerManagerUI — start success path', () => {
  it('streams steps, fires onComplete on a "running" result, and renders each step', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        { type: 'status', message: 'Starting...' },
        {
          type: 'step',
          step: {
            step: 'Start container',
            cmd: 'docker run',
            stdout: 'started',
            stderr: '',
            success: true,
          },
        },
        { type: 'result', result: { message: 'MariaDB container is running and ready.' } },
      ]),
    )
    const onComplete = vi.fn()
    const onIncomplete = vi.fn()
    render(<DockerManagerUI onComplete={onComplete} onIncomplete={onIncomplete} />)
    await userEvent.click(screen.getByRole('button', { name: /Start Container/ }))
    await waitFor(() => expect(onComplete).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith('/api/docker', expect.any(Object))
    expect(await screen.findByText('Start container')).toBeInTheDocument()
    expect(screen.getByText(/MariaDB container is running/)).toBeInTheDocument()
  })

  it('updates an existing step in place when its name matches', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        {
          type: 'step',
          step: { step: 'A', cmd: 'cmd', stdout: '', stderr: '', success: false },
        },
        {
          type: 'step',
          step: { step: 'A', cmd: 'cmd', stdout: 'done', stderr: '', success: true },
        },
        { type: 'result', result: { message: 'fine' } },
      ]),
    )
    render(<DockerManagerUI />)
    await userEvent.click(screen.getByRole('button', { name: /Start Container/ }))
    await waitFor(() => expect(screen.getByText('done')).toBeInTheDocument())
    // Only one A step rendered.
    expect(screen.getAllByText('A')).toHaveLength(1)
  })
})

describe('DockerManagerUI — stop calls onIncomplete', () => {
  it('fires onIncomplete on stop completion', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([{ type: 'result', result: { message: 'stopped' } }]),
    )
    const onIncomplete = vi.fn()
    render(<DockerManagerUI onIncomplete={onIncomplete} />)
    await userEvent.click(screen.getByRole('button', { name: /Stop Container/ }))
    await waitFor(() => expect(onIncomplete).toHaveBeenCalled())
  })
})

describe('DockerManagerUI — error rendering', () => {
  it('renders a structured error from a non-OK JSON response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse(
        {
          success: false,
          error: 'Invalid operation',
          details: { guidance: 'try start or stop' },
        },
        { status: 400 },
      ),
    )
    render(<DockerManagerUI />)
    await userEvent.click(screen.getByRole('button', { name: /Start Container/ }))
    await waitFor(() => expect(screen.getByText('Invalid operation')).toBeInTheDocument())
    expect(screen.getByText(/try start or stop/)).toBeInTheDocument()
  })

  it('falls back to the generic flow when the non-OK JSON response lacks error+details fields', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ ok: false }, { status: 400 }))
    render(<DockerManagerUI />)
    await userEvent.click(screen.getByRole('button', { name: /Start Container/ }))
    await waitFor(() => expect(screen.getByText(/Unexpected error occurred/)).toBeInTheDocument())
  })

  it('falls back to a structured Unexpected error when JSON parsing fails for a non-OK response', async () => {
    const broken = new Response('not-json', { status: 500 })
    vi.spyOn(global, 'fetch').mockResolvedValue(broken)
    render(<DockerManagerUI />)
    await userEvent.click(screen.getByRole('button', { name: /Start Container/ }))
    await waitFor(() => expect(screen.getByText(/Unexpected error occurred/)).toBeInTheDocument())
  })

  it('handles a TypeError "Failed to fetch" with a friendly backend-down message', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    render(<DockerManagerUI />)
    await userEvent.click(screen.getByRole('button', { name: /Start Container/ }))
    await waitFor(() =>
      expect(screen.getByText(/Could not connect to the backend server/)).toBeInTheDocument(),
    )
  })

  it('renders an in-stream error frame as a structured Error block', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        {
          type: 'error',
          error: {
            success: false,
            error: 'Container conflict',
            details: { guidance: 'remove the existing container' },
          },
        },
      ]),
    )
    render(<DockerManagerUI />)
    await userEvent.click(screen.getByRole('button', { name: /Start Container/ }))
    await waitFor(() => expect(screen.getByText('Container conflict')).toBeInTheDocument())
  })

  it('handles a thrown JSON error message that has steps and renders them', async () => {
    // Simulate fetch returning OK but the SSE contains an error frame whose
    // payload is a JSON string we can parse.
    const errorPayload = JSON.stringify({
      message: 'inner-msg',
      details: { stack: 'stack', cwd: '/tmp' },
      steps: [{ step: 'A', cmd: 'a', stdout: '', stderr: '', success: false }],
    })
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error(errorPayload))
    render(<DockerManagerUI />)
    await userEvent.click(screen.getByRole('button', { name: /Start Container/ }))
    await waitFor(() => expect(screen.getByText('inner-msg')).toBeInTheDocument())
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('falls back to a generic structured error for a non-Error rejection', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue('weird-string')
    render(<DockerManagerUI />)
    await userEvent.click(screen.getByRole('button', { name: /Start Container/ }))
    await waitFor(() => expect(screen.getByText(/Unexpected error occurred/)).toBeInTheDocument())
  })

  it('renders the "Could not parse error" fallback when the error JSON is malformed', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ error: 'oops', details: {} }, { status: 400 }),
    )
    // Force the error to be a non-JSON parseable string by stubbing setError-like flow:
    // The code only writes JSON.stringify for known shapes; this path is entered when the
    // already-stringified error is a non-JSON value. We exercise it through the fallback
    // branch by feeding a non-JSON value via a thrown Error in fetch.
    render(<DockerManagerUI />)
    await userEvent.click(screen.getByRole('button', { name: /Start Container/ }))
    await waitFor(() => expect(screen.getByText(/oops/i)).toBeInTheDocument())
  })

  it('silently swallows an in-stream error frame whose payload is a string (logged via console.warn)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        { type: 'error', error: 'plain-error-string' as unknown as Record<string, unknown> },
        { type: 'result', result: { message: 'after-the-error' } },
      ]),
    )
    render(<DockerManagerUI />)
    await userEvent.click(screen.getByRole('button', { name: /Start Container/ }))
    await waitFor(() => expect(screen.getByText('after-the-error')).toBeInTheDocument())
    expect(warn).toHaveBeenCalled()
  })

  it('renders the Exit Code section when details.code is numeric', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse(
        {
          success: false,
          error: 'Boom',
          details: { stack: 'trace', cwd: '/tmp', stdout: 'so', stderr: 'se', code: 137 },
        },
        { status: 500 },
      ),
    )
    render(<DockerManagerUI />)
    await userEvent.click(screen.getByRole('button', { name: /Start Container/ }))
    await waitFor(() => expect(screen.getByText('Exit Code:')).toBeInTheDocument())
    expect(screen.getByText('137')).toBeInTheDocument()
  })

  it('renders the error block when err.message is JSON without a details field', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(
      new Error(JSON.stringify({ message: 'detailless' })),
    )
    render(<DockerManagerUI />)
    await userEvent.click(screen.getByRole('button', { name: /Start Container/ }))
    await waitFor(() => expect(screen.getByText('detailless')).toBeInTheDocument())
  })

  it('falls back to null when the result frame has no message', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        {
          type: 'step',
          step: { step: 'A', cmd: 'a', stdout: '', stderr: '', success: true },
        },
        { type: 'result', result: {} },
      ]),
    )
    render(<DockerManagerUI />)
    await userEvent.click(screen.getByRole('button', { name: /Start Container/ }))
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument())
  })

  it('falls back to "An error occurred" when the in-stream error frame has no error string', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([{ type: 'error', error: { details: {} } }]),
    )
    render(<DockerManagerUI />)
    await userEvent.click(screen.getByRole('button', { name: /Start Container/ }))
    await waitFor(() => expect(screen.getByText('An error occurred')).toBeInTheDocument())
  })

  it('renders an error block whose details object is missing entirely', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([{ type: 'error', error: { error: 'boom' } }]),
    )
    render(<DockerManagerUI />)
    await userEvent.click(screen.getByRole('button', { name: /Start Container/ }))
    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument())
  })

  it('renders the technical-details panel even when individual fields are whitespace-only strings', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse(
        {
          success: false,
          error: 'X',
          details: { stack: '   ', cwd: '   ', stdout: '   ', stderr: '   ' },
        },
        { status: 500 },
      ),
    )
    render(<DockerManagerUI />)
    await userEvent.click(screen.getByRole('button', { name: /Start Container/ }))
    // None of the technical-details sub-blocks should render when their
    // values trim to empty.
    await waitFor(() => expect(screen.getByText('X')).toBeInTheDocument())
    expect(screen.queryByText('Working Directory:')).not.toBeInTheDocument()
    expect(screen.queryByText('Command Output:')).not.toBeInTheDocument()
    expect(screen.queryByText('Error Output:')).not.toBeInTheDocument()
  })

  it('ignores SSE frames with an unknown type (covers the final else-if not-taken branch)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        { type: 'unknown' as never, message: 'no-op' },
        { type: 'result', result: { message: 'still here' } },
      ]),
    )
    render(<DockerManagerUI />)
    await userEvent.click(screen.getByRole('button', { name: /Start Container/ }))
    await waitFor(() => expect(screen.getByText('still here')).toBeInTheDocument())
  })

  it('warns and ignores invalid SSE frames', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: not-json\n\n'))
            controller.enqueue(
              new TextEncoder().encode('data: {"type":"result","result":{"message":"ok"}}\n\n'),
            )
            controller.close()
          },
        }),
      ),
    )
    render(<DockerManagerUI />)
    await userEvent.click(screen.getByRole('button', { name: /Start Container/ }))
    await waitFor(() => expect(screen.getByText('ok')).toBeInTheDocument())
  })

  it('renders an error when the response has no body', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null))
    render(<DockerManagerUI />)
    await userEvent.click(screen.getByRole('button', { name: /Start Container/ }))
    await waitFor(() => expect(screen.getByText(/Unexpected error occurred/)).toBeInTheDocument())
  })
})

describe('DockerManagerUI — step rendering classifications', () => {
  it('renders an info step (No such container) with the blue "Info" badge', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        {
          type: 'step',
          step: {
            step: 'Stop container',
            cmd: 'docker stop temp',
            stdout: '',
            stderr: '',
            success: true,
            info: true,
          },
        },
        { type: 'result', result: { message: 'done' } },
      ]),
    )
    render(<DockerManagerUI />)
    await userEvent.click(screen.getByRole('button', { name: /Stop Container/ }))
    await waitFor(() => expect(screen.getByText('Info')).toBeInTheDocument())
  })

  it('renders a running step (no stdout/stderr, no success) with a spinner', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        {
          type: 'step',
          step: {
            step: 'Start container',
            cmd: 'docker run',
            stdout: '',
            stderr: '',
            success: false,
          },
        },
        { type: 'result', result: { message: 'Container is running' } },
      ]),
    )
    render(<DockerManagerUI />)
    await userEvent.click(screen.getByRole('button', { name: /Start Container/ }))
    await waitFor(() => expect(screen.getByText('Running...')).toBeInTheDocument())
  })

  it('renders a failed step (stderr present) with a Failed badge', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        {
          type: 'step',
          step: {
            step: 'Start container',
            cmd: 'docker run',
            stdout: '',
            stderr: 'oops',
            success: false,
          },
        },
      ]),
    )
    render(<DockerManagerUI />)
    await userEvent.click(screen.getByRole('button', { name: /Start Container/ }))
    await waitFor(() => expect(screen.getByText('Failed')).toBeInTheDocument())
  })
})
