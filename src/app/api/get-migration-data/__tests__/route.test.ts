import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMigrationDataMock = vi.fn()
vi.mock('../migration-service', () => ({
  getMigrationData: (...a: unknown[]) => getMigrationDataMock(...a),
}))

import { GET } from '../route'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/get-migration-data', () => {
  it('responds with HTTP 200 on success', async () => {
    getMigrationDataMock.mockResolvedValue({ success: true, data: [] })
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: [] })
  })

  it('responds with HTTP 500 on failure', async () => {
    getMigrationDataMock.mockResolvedValue({ success: false, error: 'boom' })
    const response = await GET()
    expect(response.status).toBe(500)
  })
})
