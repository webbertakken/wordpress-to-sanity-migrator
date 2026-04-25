import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { transactionMock, fetchSpy, createClientMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  fetchSpy: vi.fn(),
  createClientMock: vi.fn(),
}))

vi.mock('@sanity/client', () => ({
  createClient: createClientMock,
}))

import { GET } from '../route'

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = fetchSpy as unknown as typeof fetch
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = ''
  process.env.NEXT_PUBLIC_SANITY_DATASET = ''
  process.env.SANITY_API_WRITE_TOKEN = ''
  process.env.SANITY_API_VERSION = ''
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('GET /api/check-sanity-prerequisites', () => {
  it('reports every check as failing when project ID and token are missing', async () => {
    const response = await GET()
    const body = await response.json()
    expect(body.allOk).toBe(false)
    expect(body.checks).toHaveLength(4)
    expect(body.checks.find((c: { id: string }) => c.id === 'projectId').ok).toBe(false)
    expect(body.checks.every((c: { ok: boolean }) => !c.ok)).toBe(true)
  })

  it('only marks projectId as ok when a project id is set without a write token', async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'proj1'
    const response = await GET()
    const body = await response.json()
    expect(body.checks.find((c: { id: string }) => c.id === 'projectId').ok).toBe(true)
    expect(body.checks.find((c: { id: string }) => c.id === 'datasetExists').ok).toBe(false)
    expect(body.checks.find((c: { id: string }) => c.id === 'writeToken').ok).toBe(false)
    expect(body.checks.find((c: { id: string }) => c.id === 'postSchema').ok).toBe(false)
  })

  it('reports an OK status when every check passes', async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'proj1'
    process.env.SANITY_API_WRITE_TOKEN = 'tok'
    process.env.NEXT_PUBLIC_SANITY_DATASET = 'production'

    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ name: 'production' }, { name: 'staging' }],
    })

    const fetchClientMock = vi.fn().mockResolvedValue([1, 0])
    transactionMock.mockReturnValue({
      createOrReplace: () => ({ commit: () => Promise.resolve() }),
    })
    createClientMock.mockReturnValue({
      transaction: transactionMock,
      fetch: fetchClientMock,
    })

    const response = await GET()
    const body = await response.json()
    expect(body.allOk).toBe(true)
    expect(body.checks.find((c: { id: string }) => c.id === 'postSchema').detail).toMatch(
      /existing 'post' document/,
    )
  })

  it('reports the dataset-exists check as failing when the dataset is not in the response', async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'proj1'
    process.env.SANITY_API_WRITE_TOKEN = 'tok'
    process.env.NEXT_PUBLIC_SANITY_DATASET = 'production'

    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ name: 'staging' }],
    })

    transactionMock.mockReturnValue({
      createOrReplace: () => ({ commit: () => Promise.resolve() }),
    })
    createClientMock.mockReturnValue({
      transaction: transactionMock,
      fetch: vi.fn().mockResolvedValue([0, 0]),
    })

    const body = await (await GET()).json()
    const dataset = body.checks.find((c: { id: string }) => c.id === 'datasetExists')
    expect(dataset.ok).toBe(false)
    expect(dataset.detail).toMatch(/not 'production'/)
  })

  it('reports a 401 from datasets endpoint as a token problem', async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'proj1'
    process.env.SANITY_API_WRITE_TOKEN = 'tok'

    fetchSpy.mockResolvedValue({ ok: false, status: 401, json: async () => null })
    transactionMock.mockReturnValue({
      createOrReplace: () => ({ commit: () => Promise.reject(new Error('forbidden')) }),
    })
    createClientMock.mockReturnValue({
      transaction: transactionMock,
      fetch: vi.fn(),
    })

    const body = await (await GET()).json()
    expect(body.checks.find((c: { id: string }) => c.id === 'datasetExists').detail).toMatch(
      /Token cannot list datasets/,
    )
  })

  it('reports a 404 from datasets endpoint as a missing project', async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'proj1'
    process.env.SANITY_API_WRITE_TOKEN = 'tok'

    fetchSpy.mockResolvedValue({ ok: false, status: 404, json: async () => null })
    transactionMock.mockReturnValue({
      createOrReplace: () => ({ commit: () => Promise.reject(new Error('forbidden')) }),
    })
    createClientMock.mockReturnValue({
      transaction: transactionMock,
      fetch: vi.fn(),
    })

    const body = await (await GET()).json()
    expect(body.checks.find((c: { id: string }) => c.id === 'datasetExists').detail).toMatch(
      /not found/,
    )
  })

  it('reports a 500 from datasets endpoint as a generic upstream failure', async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'proj1'
    process.env.SANITY_API_WRITE_TOKEN = 'tok'

    fetchSpy.mockResolvedValue({ ok: false, status: 500, json: async () => null })
    transactionMock.mockReturnValue({
      createOrReplace: () => ({ commit: () => Promise.resolve() }),
    })
    createClientMock.mockReturnValue({
      transaction: transactionMock,
      fetch: vi.fn(),
    })

    const body = await (await GET()).json()
    expect(body.checks.find((c: { id: string }) => c.id === 'datasetExists').detail).toMatch(
      /HTTP 500/,
    )
  })

  it('reports a fetch network error against the Sanity API', async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'proj1'
    process.env.SANITY_API_WRITE_TOKEN = 'tok'

    fetchSpy.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'))
    transactionMock.mockReturnValue({
      createOrReplace: () => ({ commit: () => Promise.reject(new Error('forbidden')) }),
    })
    createClientMock.mockReturnValue({
      transaction: transactionMock,
      fetch: vi.fn(),
    })

    const body = await (await GET()).json()
    expect(body.checks.find((c: { id: string }) => c.id === 'datasetExists').detail).toMatch(
      /Failed to reach Sanity/,
    )
  })

  it('reports the writeToken check as failing when the dry-run mutation rejects', async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'proj1'
    process.env.SANITY_API_WRITE_TOKEN = 'tok'
    process.env.NEXT_PUBLIC_SANITY_DATASET = 'production'

    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ name: 'production' }],
    })
    transactionMock.mockReturnValue({
      createOrReplace: () => ({
        commit: () => Promise.reject(new Error('insufficient permissions')),
      }),
    })
    createClientMock.mockReturnValue({
      transaction: transactionMock,
      fetch: vi.fn(),
    })

    const body = await (await GET()).json()
    expect(body.checks.find((c: { id: string }) => c.id === 'writeToken').ok).toBe(false)
  })

  it('handles non-Error rejections from the dry-run mutation', async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'proj1'
    process.env.SANITY_API_WRITE_TOKEN = 'tok'

    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ name: 'production' }],
    })
    transactionMock.mockReturnValue({
      createOrReplace: () => ({ commit: () => Promise.reject('boom-string') }),
    })
    createClientMock.mockReturnValue({
      transaction: transactionMock,
      fetch: vi.fn(),
    })

    const body = await (await GET()).json()
    expect(body.checks.find((c: { id: string }) => c.id === 'writeToken').detail).toContain(
      'boom-string',
    )
  })

  it('reports an empty dataset as schema-OK ("schema verified on first import")', async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'proj1'
    process.env.SANITY_API_WRITE_TOKEN = 'tok'

    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ name: 'production' }],
    })
    transactionMock.mockReturnValue({
      createOrReplace: () => ({ commit: () => Promise.resolve() }),
    })
    createClientMock.mockReturnValue({
      transaction: transactionMock,
      fetch: vi.fn().mockResolvedValue([0, 0]),
    })

    const body = await (await GET()).json()
    expect(body.checks.find((c: { id: string }) => c.id === 'postSchema').detail).toMatch(
      /Dataset is empty/,
    )
  })

  it('reports a non-empty dataset without post documents as schema-missing', async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'proj1'
    process.env.SANITY_API_WRITE_TOKEN = 'tok'

    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ name: 'production' }],
    })
    transactionMock.mockReturnValue({
      createOrReplace: () => ({ commit: () => Promise.resolve() }),
    })
    createClientMock.mockReturnValue({
      transaction: transactionMock,
      fetch: vi.fn().mockResolvedValue([0, 5]),
    })

    const body = await (await GET()).json()
    expect(body.checks.find((c: { id: string }) => c.id === 'postSchema').ok).toBe(false)
    expect(body.checks.find((c: { id: string }) => c.id === 'postSchema').detail).toMatch(
      /No 'post' documents/,
    )
  })

  it('reports a schema probe error when the GROQ query throws', async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'proj1'
    process.env.SANITY_API_WRITE_TOKEN = 'tok'

    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ name: 'production' }],
    })
    transactionMock.mockReturnValue({
      createOrReplace: () => ({ commit: () => Promise.resolve() }),
    })
    createClientMock.mockReturnValue({
      transaction: transactionMock,
      fetch: vi.fn().mockRejectedValue(new Error('groq down')),
    })

    const body = await (await GET()).json()
    expect(body.checks.find((c: { id: string }) => c.id === 'postSchema').detail).toMatch(
      /Schema probe failed/,
    )
  })

  it('reports a schema probe error with String(error) for non-Error rejections', async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'proj1'
    process.env.SANITY_API_WRITE_TOKEN = 'tok'

    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ name: 'production' }],
    })
    transactionMock.mockReturnValue({
      createOrReplace: () => ({ commit: () => Promise.resolve() }),
    })
    createClientMock.mockReturnValue({
      transaction: transactionMock,
      fetch: vi.fn().mockRejectedValue('groq down'),
    })

    const body = await (await GET()).json()
    expect(body.checks.find((c: { id: string }) => c.id === 'postSchema').detail).toMatch(
      /groq down/,
    )
  })

  it('reports postSchema as cannot-verify when the dataset check fails', async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'proj1'
    process.env.SANITY_API_WRITE_TOKEN = 'tok'

    // dataset endpoint returns a fail status
    fetchSpy.mockResolvedValue({ ok: false, status: 500, json: async () => null })
    transactionMock.mockReturnValue({
      createOrReplace: () => ({ commit: () => Promise.resolve() }),
    })
    createClientMock.mockReturnValue({
      transaction: transactionMock,
      fetch: vi.fn(),
    })

    const body = await (await GET()).json()
    const schema = body.checks.find((c: { id: string }) => c.id === 'postSchema')
    expect(schema.ok).toBe(false)
    expect(schema.detail).toMatch(/Cannot verify without a valid dataset/)
  })

  it('reports postSchema as cannot-verify when the write token fails', async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'proj1'
    process.env.SANITY_API_WRITE_TOKEN = 'tok'

    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ name: 'production' }],
    })
    transactionMock.mockReturnValue({
      createOrReplace: () => ({ commit: () => Promise.reject(new Error('no perms')) }),
    })
    createClientMock.mockReturnValue({
      transaction: transactionMock,
      fetch: vi.fn(),
    })

    const body = await (await GET()).json()
    const schema = body.checks.find((c: { id: string }) => c.id === 'postSchema')
    expect(schema.ok).toBe(false)
    expect(schema.detail).toMatch(/working write token/)
  })

  it('renders the writeToken detail as "Cannot verify without project ID" when only the token is set', async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = ''
    process.env.SANITY_API_WRITE_TOKEN = 'tok'
    const body = await (await GET()).json()
    expect(body.checks.find((c: { id: string }) => c.id === 'writeToken').detail).toBe(
      'Cannot verify without project ID',
    )
  })

  it('falls back to "none" when listing datasets returns an empty array', async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'proj1'
    process.env.SANITY_API_WRITE_TOKEN = 'tok'
    fetchSpy.mockResolvedValue({ ok: true, status: 200, json: async () => [] })
    transactionMock.mockReturnValue({
      createOrReplace: () => ({ commit: () => Promise.resolve() }),
    })
    createClientMock.mockReturnValue({
      transaction: transactionMock,
      fetch: vi.fn(),
    })
    const body = await (await GET()).json()
    expect(body.checks.find((c: { id: string }) => c.id === 'datasetExists').detail).toContain(
      'none',
    )
  })

  it('handles a non-Error fetch rejection by stringifying it in the detail', async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'proj1'
    process.env.SANITY_API_WRITE_TOKEN = 'tok'
    fetchSpy.mockRejectedValue('weird-string')
    transactionMock.mockReturnValue({
      createOrReplace: () => ({ commit: () => Promise.resolve() }),
    })
    createClientMock.mockReturnValue({
      transaction: transactionMock,
      fetch: vi.fn(),
    })
    const body = await (await GET()).json()
    expect(body.checks.find((c: { id: string }) => c.id === 'datasetExists').detail).toMatch(
      /weird-string/,
    )
  })

  it('reports a non-empty dataset with exactly one non-post document with singular grammar', async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'proj1'
    process.env.SANITY_API_WRITE_TOKEN = 'tok'
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ name: 'production' }],
    })
    transactionMock.mockReturnValue({
      createOrReplace: () => ({ commit: () => Promise.resolve() }),
    })
    createClientMock.mockReturnValue({
      transaction: transactionMock,
      fetch: vi.fn().mockResolvedValue([0, 1]),
    })
    const body = await (await GET()).json()
    expect(body.checks.find((c: { id: string }) => c.id === 'postSchema').detail).toMatch(
      /1 other document\)/,
    )
  })

  it('singularises "1 dataset" / pluralises ">1 datasets" copy correctly', async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'proj1'
    process.env.SANITY_API_WRITE_TOKEN = 'tok'

    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ name: 'production' }],
    })
    transactionMock.mockReturnValue({
      createOrReplace: () => ({ commit: () => Promise.resolve() }),
    })
    createClientMock.mockReturnValue({
      transaction: transactionMock,
      fetch: vi.fn().mockResolvedValue([1, 0]),
    })

    const body = await (await GET()).json()
    expect(body.checks.find((c: { id: string }) => c.id === 'datasetExists').detail).toMatch(
      /1 dataset on project/,
    )
    expect(body.checks.find((c: { id: string }) => c.id === 'postSchema').detail).toMatch(
      /1 existing 'post' document/,
    )
  })

  it('pluralises the post-document count when there are multiple post documents', async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'proj1'
    process.env.SANITY_API_WRITE_TOKEN = 'tok'

    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ name: 'production' }],
    })
    transactionMock.mockReturnValue({
      createOrReplace: () => ({ commit: () => Promise.resolve() }),
    })
    createClientMock.mockReturnValue({
      transaction: transactionMock,
      fetch: vi.fn().mockResolvedValue([5, 0]),
    })

    const body = await (await GET()).json()
    expect(body.checks.find((c: { id: string }) => c.id === 'postSchema').detail).toMatch(
      /5 existing 'post' documents/,
    )
  })
})
