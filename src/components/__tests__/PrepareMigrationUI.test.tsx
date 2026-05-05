import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PrepareMigrationUI } from '../PrepareMigrationUI'

interface SseFrame {
  type: 'status' | 'progress' | 'result' | 'error'
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

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('PrepareMigrationUI — basic rendering', () => {
  it('renders the heading, options panel and primary action', () => {
    render(<PrepareMigrationUI />)
    expect(screen.getByRole('heading', { name: /Prepare Migration/ })).toBeInTheDocument()
    expect(screen.getByLabelText(/Parse pages as posts/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Run Prepare Migration/ })).toBeInTheDocument()
  })

  it('toggles the parsePagesAsPosts checkbox', async () => {
    render(<PrepareMigrationUI />)
    const checkbox = screen.getByLabelText(/Parse pages as posts/) as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    await userEvent.click(checkbox)
    expect(checkbox.checked).toBe(true)
  })
})

describe('PrepareMigrationUI — happy path', () => {
  it('streams progress updates, renders summary stats, and calls onComplete', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        { type: 'status', message: 'Starting...' },
        { type: 'progress', step: 'connecting', message: 'connecting...', progress: 10 },
        {
          type: 'progress',
          step: 'fetching',
          message: 'fetching content',
          progress: 50,
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          type: 'result',
          result: {
            message: 'Migration complete',
            data: {
              postCount: 5,
              pageCount: 2,
              totalCount: 7,
              missingMedia: [
                { url: 'http://e/x.jpg', foundIn: 'post: A', type: 'image' },
                { url: 'http://e/a.mp3', foundIn: 'post: B', type: 'audio' },
                { url: 'http://e/v.mp4', foundIn: 'post: C', type: 'video' },
              ],
            },
          },
        },
      ]),
    )
    const onComplete = vi.fn()
    render(<PrepareMigrationUI onComplete={onComplete} />)
    await userEvent.click(screen.getByRole('button', { name: /Run Prepare Migration/ }))

    await waitFor(() => expect(onComplete).toHaveBeenCalled())
    expect(screen.getByText('Migration complete')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText(/Missing Media Files/i)).toBeInTheDocument()
    expect(screen.getByText('http://e/x.jpg')).toBeInTheDocument()
    expect(screen.getByText('http://e/a.mp3')).toBeInTheDocument()
    expect(screen.getByText('http://e/v.mp4')).toBeInTheDocument()
  })

  it('falls back to a generic completion message when result.message is missing', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(sseResponse([{ type: 'result', result: {} }]))
    render(<PrepareMigrationUI />)
    await userEvent.click(screen.getByRole('button', { name: /Run Prepare Migration/ }))
    await waitFor(() =>
      expect(
        screen.getByText(/Migration preparation completed successfully\./),
      ).toBeInTheDocument(),
    )
  })

  it('renders the loading log header ("Live Processing Output:") while the stream is still open', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c
        c.enqueue(
          new TextEncoder().encode(
            'data: {"type":"progress","step":"a","message":"hello","progress":1}\n\n',
          ),
        )
      },
    })
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(body))
    render(<PrepareMigrationUI />)
    await userEvent.click(screen.getByRole('button', { name: /Run Prepare Migration/ }))
    await waitFor(() => expect(screen.getByText(/Live Processing Output:/)).toBeInTheDocument())
    controller.close()
  })

  it('renders the post-loading log header ("Processing Log:") once loading completes', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        { type: 'progress', step: 'a', message: 'first', progress: 5 },
        { type: 'result', result: { message: 'done' } },
      ]),
    )
    render(<PrepareMigrationUI />)
    await userEvent.click(screen.getByRole('button', { name: /Run Prepare Migration/ }))
    await waitFor(() => expect(screen.getByText(/Processing Log:/)).toBeInTheDocument())
  })

  it('handles a progress frame without a numeric progress value (covers the missing-progress branch)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        { type: 'progress', step: 'a', message: 'no-percent' },
        { type: 'result', result: { message: 'done' } },
      ]),
    )
    render(<PrepareMigrationUI />)
    await userEvent.click(screen.getByRole('button', { name: /Run Prepare Migration/ }))
    await waitFor(() => expect(screen.getByText(/no-percent/)).toBeInTheDocument())
  })

  it('clears the log when "Clear Log" is clicked', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        { type: 'progress', step: 'a', message: 'first', progress: 5 },
        { type: 'result', result: { message: 'done' } },
      ]),
    )
    render(<PrepareMigrationUI />)
    await userEvent.click(screen.getByRole('button', { name: /Run Prepare Migration/ }))
    await waitFor(() => expect(screen.getByText(/first/)).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Clear Log/i }))
    await waitFor(() => expect(screen.queryByText(/first/)).not.toBeInTheDocument())
  })

  it('sends parsePagesAsPosts to the API', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(sseResponse([{ type: 'result', result: { message: 'done' } }]))
    render(<PrepareMigrationUI />)
    await userEvent.click(screen.getByLabelText(/Parse pages as posts/))
    await userEvent.click(screen.getByRole('button', { name: /Run Prepare Migration/ }))
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const body = fetchSpy.mock.calls[0][1]?.body
    expect(JSON.parse(body as string)).toEqual({ parsePagesAsPosts: true })
  })

  it('copies a missing-media URL to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        {
          type: 'result',
          result: {
            message: 'ok',
            data: {
              postCount: 0,
              pageCount: 0,
              totalCount: 0,
              missingMedia: [{ url: 'http://e/m.mp3', foundIn: 'x', type: 'audio' }],
            },
          },
        },
      ]),
    )
    render(<PrepareMigrationUI />)
    await userEvent.click(screen.getByRole('button', { name: /Run Prepare Migration/ }))
    await waitFor(() => expect(screen.getByTitle('Copy URL')).toBeInTheDocument())
    await userEvent.click(screen.getByTitle('Copy URL'))
    expect(writeText).toHaveBeenCalledWith('http://e/m.mp3')
  })
})

describe('PrepareMigrationUI — error rendering', () => {
  it('renders a generic error when the HTTP response is non-OK', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }))
    render(<PrepareMigrationUI />)
    await userEvent.click(screen.getByRole('button', { name: /Run Prepare Migration/ }))
    await waitFor(() => expect(screen.getByText(/HTTP error/)).toBeInTheDocument())
  })

  it('renders a friendly error when fetch rejects', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))
    render(<PrepareMigrationUI />)
    await userEvent.click(screen.getByRole('button', { name: /Run Prepare Migration/ }))
    await waitFor(() => expect(screen.getByText(/network down/)).toBeInTheDocument())
  })

  it('renders a structured error block from a JSON error message with guidance and details', async () => {
    // The structured error rendering activates when setError receives a
    // JSON-stringified payload. The component calls setError(err.message)
    // after attempting JSON.parse(err.message), so make fetch reject with
    // an Error whose message is a JSON object string.
    const errorPayload = JSON.stringify({
      message: 'DB connection refused',
      details: { guidance: 'start mysql', stack: 'stack trace', cwd: '/tmp' },
    })
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error(errorPayload))
    render(<PrepareMigrationUI />)
    await userEvent.click(screen.getByRole('button', { name: /Run Prepare Migration/ }))
    await waitFor(() => expect(screen.getByText('DB connection refused')).toBeInTheDocument())
    expect(screen.getByText(/start mysql/)).toBeInTheDocument()
    expect(screen.getByText(/Working Directory/)).toBeInTheDocument()
  })

  it('renders the raw error message when JSON.parse on the error fails', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('bare error message'))
    render(<PrepareMigrationUI />)
    await userEvent.click(screen.getByRole('button', { name: /Run Prepare Migration/ }))
    await waitFor(() => expect(screen.getByText('bare error message')).toBeInTheDocument())
  })

  it('falls back to "Failed to run migration" when the rejection is not an Error', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue('weird-string')
    render(<PrepareMigrationUI />)
    await userEvent.click(screen.getByRole('button', { name: /Run Prepare Migration/ }))
    await waitFor(() => expect(screen.getByText('Failed to run migration')).toBeInTheDocument())
  })

  it('falls back to a generic error when the response has no body', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null))
    render(<PrepareMigrationUI />)
    await userEvent.click(screen.getByRole('button', { name: /Run Prepare Migration/ }))
    await waitFor(() => expect(screen.getByText(/No response body/)).toBeInTheDocument())
  })

  it('ignores SSE frames with an unknown type (covers the final else-if not-taken branch)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        { type: 'unknown' as never, message: 'no-op' },
        { type: 'result', result: { message: 'still here' } },
      ]),
    )
    render(<PrepareMigrationUI />)
    await userEvent.click(screen.getByRole('button', { name: /Run Prepare Migration/ }))
    await waitFor(() => expect(screen.getByText('still here')).toBeInTheDocument())
  })

  it('warns and ignores invalid SSE data lines while still processing the result', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: not-json\n\n'))
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"type":"result","result":{"message":"finished"}}\n\n',
              ),
            )
            controller.close()
          },
        }),
      ),
    )
    render(<PrepareMigrationUI />)
    await userEvent.click(screen.getByRole('button', { name: /Run Prepare Migration/ }))
    await waitFor(() => expect(screen.getByText('finished')).toBeInTheDocument())
    expect(warn).toHaveBeenCalled()
  })

  it('swallows an in-stream error frame via the inner SSE catch (logs warning)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        { type: 'error', error: { message: 'inner-fail' } },
        { type: 'result', result: { message: 'finished-after-error' } },
      ]),
    )
    render(<PrepareMigrationUI />)
    await userEvent.click(screen.getByRole('button', { name: /Run Prepare Migration/ }))
    await waitFor(() => expect(screen.getByText('finished-after-error')).toBeInTheDocument())
    expect(warn).toHaveBeenCalled()
  })
})
