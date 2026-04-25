import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportToSanityUI } from '../ImportToSanityUI'

interface SseFrame {
  type: 'progress' | 'success' | 'error' | 'info'
  message: string
  details?: unknown
  current?: number
  total?: number
}

function sseResponse(frames: SseFrame[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`))
      }
      controller.close()
    },
  })
  return new Response(body, { status: 200 })
}

function mockMigrationData(records: unknown[]): Response {
  return new Response(JSON.stringify({ success: true, data: records }), { status: 200 })
}

const samplePost = (id: number, mediaTypes: string[] = []) => ({
  original: { ID: id },
  transformed: {
    _type: 'post',
    title: `Post ${id}`,
    media: mediaTypes.map((t, i) => ({
      type: t,
      url: `http://e/${id}-${i}`,
      localPath: `/abs/${id}-${i}`,
      found: true,
    })),
  },
})

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('ImportToSanityUI — initial loading', () => {
  it('renders the prerequisites checking state and post selection skeleton', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('check-sanity-prerequisites')) {
        return Promise.resolve(
          new Response(JSON.stringify({ checks: [], allOk: true }), { status: 200 }),
        )
      }
      return Promise.resolve(mockMigrationData([]))
    })
    render(<ImportToSanityUI />)
    expect(screen.getByText(/Loading posts/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/All prerequisites met/)).toBeInTheDocument())
  })

  it('renders failed prerequisites with detail messages', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('check-sanity-prerequisites')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              checks: [
                { id: 'projectId', label: 'Project ID set', ok: false, detail: 'env not set' },
                { id: 'writeToken', label: 'Write token', ok: true, detail: 'ok' },
              ],
              allOk: false,
            }),
            { status: 200 },
          ),
        )
      }
      return Promise.resolve(mockMigrationData([]))
    })
    render(<ImportToSanityUI />)
    await waitFor(() => expect(screen.getByText('Project ID set')).toBeInTheDocument())
    expect(screen.getByText('env not set')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Re-check' })).toBeInTheDocument()
  })

  it('renders a fetch failure on the prerequisites endpoint as a single failed check', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('check-sanity-prerequisites')) {
        return Promise.reject(new Error('upstream offline'))
      }
      return Promise.resolve(mockMigrationData([]))
    })
    render(<ImportToSanityUI />)
    await waitFor(() =>
      expect(screen.getByText(/Failed to reach prerequisite check endpoint/)).toBeInTheDocument(),
    )
    expect(screen.getByText(/upstream offline/)).toBeInTheDocument()
  })

  it('renders a non-Error rejection on the prerequisites endpoint with String(error) detail', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('check-sanity-prerequisites')) {
        return Promise.reject('weird-string')
      }
      return Promise.resolve(mockMigrationData([]))
    })
    render(<ImportToSanityUI />)
    await waitFor(() =>
      expect(screen.getByText(/Failed to reach prerequisite check endpoint/)).toBeInTheDocument(),
    )
    expect(screen.getByText(/weird-string/)).toBeInTheDocument()
  })

  it('renders a non-OK response from the migration data endpoint as a load error', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('check-sanity-prerequisites')) {
        return Promise.resolve(
          new Response(JSON.stringify({ checks: [], allOk: true }), { status: 200 }),
        )
      }
      return Promise.resolve(new Response('{}', { status: 500, statusText: 'Server Error' }))
    })
    render(<ImportToSanityUI />)
    await waitFor(() => expect(screen.getByText(/HTTP 500/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('renders an explicit failure result from the migration data endpoint', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('check-sanity-prerequisites')) {
        return Promise.resolve(
          new Response(JSON.stringify({ checks: [], allOk: true }), { status: 200 }),
        )
      }
      return Promise.resolve(
        new Response(JSON.stringify({ success: false, error: 'inner-fail' }), { status: 200 }),
      )
    })
    render(<ImportToSanityUI />)
    await waitFor(() => expect(screen.getByText(/inner-fail/)).toBeInTheDocument())
  })

  it('falls back to the generic load-failure message when result.error is missing', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('check-sanity-prerequisites')) {
        return Promise.resolve(
          new Response(JSON.stringify({ checks: [], allOk: true }), { status: 200 }),
        )
      }
      return Promise.resolve(new Response(JSON.stringify({ success: false }), { status: 200 }))
    })
    render(<ImportToSanityUI />)
    await waitFor(() =>
      expect(screen.getByText(/Failed to load migration data/)).toBeInTheDocument(),
    )
  })

  it('handles records whose transformed.media is undefined (treats as no media via || [])', async () => {
    const record: {
      original: { ID: number }
      transformed: { _type: string; title: string; media?: never }
    } = {
      original: { ID: 99 },
      transformed: { _type: 'post', title: 'No-media post' },
    }
    setupSuccessfulLoad([record as never])
    render(<ImportToSanityUI />)
    await waitFor(() => expect(screen.getByLabelText(/Select Post to Test/)).toBeInTheDocument())
    expect(screen.getByText(/Found 0 posts with media/)).toBeInTheDocument()
  })

  it('falls back to "Unknown error" when the load failure is not an Error instance', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('check-sanity-prerequisites')) {
        return Promise.resolve(
          new Response(JSON.stringify({ checks: [], allOk: true }), { status: 200 }),
        )
      }
      return Promise.reject('weird-string')
    })
    render(<ImportToSanityUI />)
    await waitFor(() => expect(screen.getByText(/Unknown error/)).toBeInTheDocument())
  })

  it('renders an error when the data field is not an array', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('check-sanity-prerequisites')) {
        return Promise.resolve(
          new Response(JSON.stringify({ checks: [], allOk: true }), { status: 200 }),
        )
      }
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, data: { not: 'an-array' } }), { status: 200 }),
      )
    })
    render(<ImportToSanityUI />)
    await waitFor(() =>
      expect(screen.getByText(/Migration data is not an array/)).toBeInTheDocument(),
    )
  })
})

function setupSuccessfulLoad(records: unknown[]): void {
  vi.spyOn(global, 'fetch').mockImplementation((url) => {
    if (typeof url === 'string' && url.includes('check-sanity-prerequisites')) {
      return Promise.resolve(
        new Response(JSON.stringify({ checks: [], allOk: true }), { status: 200 }),
      )
    }
    if (typeof url === 'string' && url.includes('get-migration-data')) {
      return Promise.resolve(mockMigrationData(records))
    }
    return Promise.resolve(new Response('{}', { status: 200 }))
  })
}

describe('ImportToSanityUI — post selection and import flow', () => {
  it('auto-selects a post with mixed media when one exists', async () => {
    setupSuccessfulLoad([samplePost(1, ['image']), samplePost(2, ['image', 'audio'])])
    render(<ImportToSanityUI />)
    await waitFor(() => {
      expect((screen.getByLabelText(/Select Post to Test/) as HTMLSelectElement).value).toBe('2')
    })
  })

  it('auto-selects the first post with media when no mixed-media post exists', async () => {
    setupSuccessfulLoad([samplePost(1), samplePost(2, ['image'])])
    render(<ImportToSanityUI />)
    await waitFor(() => {
      expect((screen.getByLabelText(/Select Post to Test/) as HTMLSelectElement).value).toBe('2')
    })
  })

  it('runs a successful test import and renders a summary', async () => {
    let importCalled = false
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('check-sanity-prerequisites')) {
        return Promise.resolve(
          new Response(JSON.stringify({ checks: [], allOk: true }), { status: 200 }),
        )
      }
      if (typeof url === 'string' && url.includes('get-migration-data')) {
        return Promise.resolve(mockMigrationData([samplePost(1, ['image'])]))
      }
      if (typeof url === 'string' && url.includes('import-to-sanity')) {
        importCalled = true
        return Promise.resolve(
          sseResponse([
            { type: 'info', message: 'Starting...' },
            { type: 'progress', message: 'Processing record', current: 1, total: 1 },
            {
              type: 'info',
              message: 'with details',
              details: { hello: 'world', long: 'a\nb\nc' },
            },
            {
              type: 'success',
              message: 'Test run completed successfully!',
              details: 'plain string detail',
            },
          ]),
        )
      }
      return Promise.resolve(new Response('{}', { status: 200 }))
    })

    const onComplete = vi.fn()
    render(<ImportToSanityUI onComplete={onComplete} />)
    await waitFor(() => expect(screen.getByLabelText(/Select Post to Test/)).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Run Test Import/ }))

    await waitFor(() => expect(importCalled).toBe(true))
    await waitFor(() => expect(onComplete).toHaveBeenCalled())
    expect(screen.getByText(/Test Run Progress/)).toBeInTheDocument()
    expect(screen.getByText(/Test run completed successfully/)).toBeInTheDocument()
    // Summary
    expect(screen.getByText(/Total messages:/)).toBeInTheDocument()
  })

  it('renders a collapsible details block for very long detail payloads', async () => {
    const longDetails = JSON.stringify(
      { lines: Array.from({ length: 20 }, (_, i) => `line ${i}`) },
      null,
      2,
    )
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('check-sanity-prerequisites')) {
        return Promise.resolve(
          new Response(JSON.stringify({ checks: [], allOk: true }), { status: 200 }),
        )
      }
      if (typeof url === 'string' && url.includes('get-migration-data')) {
        return Promise.resolve(mockMigrationData([samplePost(1, ['image'])]))
      }
      return Promise.resolve(
        sseResponse([
          { type: 'info', message: 'large details', details: JSON.parse(longDetails) },
          { type: 'success', message: 'completed successfully' },
        ]),
      )
    })
    render(<ImportToSanityUI />)
    await waitFor(() => expect(screen.getByLabelText(/Select Post to Test/)).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Run Test Import/ }))
    await waitFor(() => expect(screen.getByText(/Show details \(\d+ lines\)/)).toBeInTheDocument())
  })

  it('asks for confirmation before a non-test-mode import and aborts on cancel', async () => {
    setupSuccessfulLoad([samplePost(1, ['image'])])
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<ImportToSanityUI />)
    await waitFor(() => expect(screen.getByLabelText(/Select Post to Test/)).toBeInTheDocument())
    await userEvent.click(screen.getByLabelText(/Test Run/i))
    await userEvent.click(screen.getByRole('button', { name: /Start Full Import/ }))
    expect(screen.queryByText(/Import Progress/)).not.toBeInTheDocument()
  })

  it('starts a full production import when the user confirms and selects "all"', async () => {
    let calledWith: { selectedRecordId: string | null; testRun: boolean } | null = null
    vi.spyOn(global, 'fetch').mockImplementation((url, init) => {
      if (typeof url === 'string' && url.includes('check-sanity-prerequisites')) {
        return Promise.resolve(
          new Response(JSON.stringify({ checks: [], allOk: true }), { status: 200 }),
        )
      }
      if (typeof url === 'string' && url.includes('get-migration-data')) {
        return Promise.resolve(mockMigrationData([samplePost(1, ['image'])]))
      }
      if (typeof url === 'string' && url.includes('import-to-sanity')) {
        calledWith = JSON.parse((init?.body as string) ?? '{}')
        return Promise.resolve(
          sseResponse([{ type: 'success', message: 'Import completed successfully' }]),
        )
      }
      return Promise.resolve(new Response('{}', { status: 200 }))
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<ImportToSanityUI />)
    await waitFor(() => expect(screen.getByLabelText(/Select Post to Test/)).toBeInTheDocument())
    await userEvent.click(screen.getByLabelText(/Test Run/i))
    await userEvent.click(screen.getByLabelText(/Import ALL posts/))
    await userEvent.click(screen.getByRole('button', { name: /Start Full Import/ }))
    await waitFor(() => expect(calledWith).not.toBeNull())
    expect(calledWith).toEqual({ testRun: false, selectedRecordId: null })
  })

  it('renders a fetch error in the progress log when the import endpoint rejects', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('check-sanity-prerequisites')) {
        return Promise.resolve(
          new Response(JSON.stringify({ checks: [], allOk: true }), { status: 200 }),
        )
      }
      if (typeof url === 'string' && url.includes('get-migration-data')) {
        return Promise.resolve(mockMigrationData([samplePost(1, ['image'])]))
      }
      return Promise.reject(new Error('network down'))
    })
    render(<ImportToSanityUI />)
    await waitFor(() => expect(screen.getByLabelText(/Select Post to Test/)).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Run Test Import/ }))
    await waitFor(() =>
      expect(screen.getByText(/Connection failed: network down/)).toBeInTheDocument(),
    )
  })

  it('renders a generic Connection failed message for non-Error rejections', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('check-sanity-prerequisites')) {
        return Promise.resolve(
          new Response(JSON.stringify({ checks: [], allOk: true }), { status: 200 }),
        )
      }
      if (typeof url === 'string' && url.includes('get-migration-data')) {
        return Promise.resolve(mockMigrationData([samplePost(1, ['image'])]))
      }
      return Promise.reject('weird')
    })
    render(<ImportToSanityUI />)
    await waitFor(() => expect(screen.getByLabelText(/Select Post to Test/)).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Run Test Import/ }))
    await waitFor(() =>
      expect(screen.getByText(/Connection failed: Unknown error/)).toBeInTheDocument(),
    )
  })

  it('renders an error when the import response has no body', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('check-sanity-prerequisites')) {
        return Promise.resolve(
          new Response(JSON.stringify({ checks: [], allOk: true }), { status: 200 }),
        )
      }
      if (typeof url === 'string' && url.includes('get-migration-data')) {
        return Promise.resolve(mockMigrationData([samplePost(1, ['image'])]))
      }
      return Promise.resolve(new Response(null))
    })
    render(<ImportToSanityUI />)
    await waitFor(() => expect(screen.getByLabelText(/Select Post to Test/)).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Run Test Import/ }))
    await waitFor(() => expect(screen.getByText(/No response body/)).toBeInTheDocument())
  })

  it('renders the Retry button on a load error and triggers a re-fetch', async () => {
    let attempt = 0
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('check-sanity-prerequisites')) {
        return Promise.resolve(
          new Response(JSON.stringify({ checks: [], allOk: true }), { status: 200 }),
        )
      }
      attempt += 1
      if (attempt === 1) return Promise.resolve(new Response('{}', { status: 500 }))
      return Promise.resolve(mockMigrationData([samplePost(1, ['image'])]))
    })
    render(<ImportToSanityUI />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByLabelText(/Select Post to Test/)).toBeInTheDocument())
  })

  it('shows the "Please select a post" prompt for production single-import with no selection', async () => {
    // No record has any media — availablePosts ends up empty and no auto-
    // selection happens.
    setupSuccessfulLoad([samplePost(1)])
    render(<ImportToSanityUI />)
    await waitFor(() => expect(screen.getByLabelText(/Select Post to Test/)).toBeInTheDocument())
    await userEvent.click(screen.getByLabelText(/Test Run/i))
    expect(screen.getByText('Please select a post to import')).toBeInTheDocument()
  })

  it('sends selectedRecordId=null in the body when no post is selected (covers the || null branch)', async () => {
    let body: Record<string, unknown> | null = null
    vi.spyOn(global, 'fetch').mockImplementation((url, init) => {
      if (typeof url === 'string' && url.includes('check-sanity-prerequisites')) {
        return Promise.resolve(
          new Response(JSON.stringify({ checks: [], allOk: true }), { status: 200 }),
        )
      }
      if (typeof url === 'string' && url.includes('get-migration-data')) {
        return Promise.resolve(mockMigrationData([samplePost(1)]))
      }
      if (typeof url === 'string' && url.includes('import-to-sanity')) {
        body = JSON.parse((init?.body as string) ?? '{}')
        return Promise.resolve(
          sseResponse([{ type: 'success', message: 'completed successfully' }]),
        )
      }
      return Promise.resolve(new Response('{}', { status: 200 }))
    })
    render(<ImportToSanityUI />)
    await waitFor(() => expect(screen.getByLabelText(/Select Post to Test/)).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Run Test Import/ }))
    await waitFor(() => expect(body).not.toBeNull())
    expect(body).toEqual({ testRun: true, selectedRecordId: null })
  })

  it('updates importMode when the radio buttons are toggled (covers radio onChange)', async () => {
    setupSuccessfulLoad([samplePost(1, ['image']), samplePost(2, ['image'])])
    render(<ImportToSanityUI />)
    await waitFor(() => expect(screen.getByLabelText(/Select Post to Test/)).toBeInTheDocument())
    await userEvent.click(screen.getByLabelText(/Test Run/i)) // disable test mode
    const all = screen.getByLabelText(/Import ALL posts/) as HTMLInputElement
    const single = screen.getByLabelText(/Import selected post only/) as HTMLInputElement
    await userEvent.click(all)
    expect(all.checked).toBe(true)
    await userEvent.click(single)
    expect(single.checked).toBe(true)
  })

  it('updates the selected post when the user picks a different option (covers select onChange)', async () => {
    setupSuccessfulLoad([samplePost(1, ['image']), samplePost(2, ['image'])])
    render(<ImportToSanityUI />)
    await waitFor(() => expect(screen.getByLabelText(/Select Post to Test/)).toBeInTheDocument())
    const select = screen.getByLabelText(/Select Post to Test/) as HTMLSelectElement
    await userEvent.selectOptions(select, '2')
    expect(select.value).toBe('2')
  })

  it('disables the import button when prerequisites are not satisfied', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('check-sanity-prerequisites')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              checks: [{ id: 'projectId', label: 'Project ID', ok: false, detail: 'fail' }],
              allOk: false,
            }),
            { status: 200 },
          ),
        )
      }
      return Promise.resolve(mockMigrationData([samplePost(1, ['image'])]))
    })
    render(<ImportToSanityUI />)
    await waitFor(() => expect(screen.getByText('Project ID')).toBeInTheDocument())
    const button = screen.getByRole('button', { name: /Run Test Import/ })
    expect(button).toBeDisabled()
  })

  it('coerces a numeric details payload via String() before rendering', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('check-sanity-prerequisites')) {
        return Promise.resolve(
          new Response(JSON.stringify({ checks: [], allOk: true }), { status: 200 }),
        )
      }
      if (typeof url === 'string' && url.includes('get-migration-data')) {
        return Promise.resolve(mockMigrationData([samplePost(1, ['image'])]))
      }
      return Promise.resolve(
        sseResponse([
          { type: 'info', message: 'numeric details', details: 42 as never },
          { type: 'success', message: 'completed successfully' },
        ]),
      )
    })
    render(<ImportToSanityUI />)
    await waitFor(() => expect(screen.getByLabelText(/Select Post to Test/)).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Run Test Import/ }))
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument())
  })

  it('falls back to "Error displaying details" when JSON.stringify throws on the details payload', async () => {
    const originalStringify = JSON.stringify.bind(JSON)
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('check-sanity-prerequisites')) {
        return Promise.resolve(
          new Response(originalStringify({ checks: [], allOk: true }), { status: 200 }),
        )
      }
      if (typeof url === 'string' && url.includes('get-migration-data')) {
        return Promise.resolve(mockMigrationData([samplePost(1, ['image'])]))
      }
      const encoder = new TextEncoder()
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${originalStringify({
                type: 'info',
                message: 'with-details',
                details: { __throwOnStringify: true },
              })}\n\n`,
            ),
          )
          controller.enqueue(
            encoder.encode(
              `data: ${originalStringify({ type: 'success', message: 'completed successfully' })}\n\n`,
            ),
          )
          controller.close()
        },
      })
      return Promise.resolve(new Response(body))
    })
    const stringifySpy = vi.spyOn(JSON, 'stringify').mockImplementation(((
      value: unknown,
      ...rest: [unknown?, unknown?]
    ) => {
      if (
        value &&
        typeof value === 'object' &&
        (value as Record<string, unknown>).__throwOnStringify === true
      ) {
        throw new Error('Converting circular structure to JSON')
      }
      return originalStringify(value, rest[0] as never, rest[1] as never)
    }) as typeof JSON.stringify)
    render(<ImportToSanityUI />)
    await waitFor(() => expect(screen.getByLabelText(/Select Post to Test/)).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Run Test Import/ }))
    await waitFor(() => expect(screen.getByText('Error displaying details')).toBeInTheDocument())
    stringifySpy.mockRestore()
  })

  it('warns and ignores invalid SSE frames', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('check-sanity-prerequisites')) {
        return Promise.resolve(
          new Response(JSON.stringify({ checks: [], allOk: true }), { status: 200 }),
        )
      }
      if (typeof url === 'string' && url.includes('get-migration-data')) {
        return Promise.resolve(mockMigrationData([samplePost(1, ['image'])]))
      }
      return Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('data: not-json\n\n'))
              controller.enqueue(
                new TextEncoder().encode(
                  'data: {"type":"success","message":"completed successfully"}\n\n',
                ),
              )
              controller.close()
            },
          }),
        ),
      )
    })
    render(<ImportToSanityUI />)
    await waitFor(() => expect(screen.getByLabelText(/Select Post to Test/)).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Run Test Import/ }))
    await waitFor(() => expect(screen.getByText(/completed successfully/)).toBeInTheDocument())
    expect(warn).toHaveBeenCalled()
  })
})
