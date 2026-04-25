import { describe, it, expect, vi, beforeEach } from 'vitest'

const readMigrationFileMock = vi.fn()
vi.mock('../../prepare-migration/file-operations', async () => {
  const actual = await vi.importActual<typeof import('../../prepare-migration/file-operations')>(
    '../../prepare-migration/file-operations',
  )
  return {
    ...actual,
    readMigrationFile: (...a: unknown[]) => readMigrationFileMock(...a),
  }
})

import { getMigrationData } from '../migration-service'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getMigrationData', () => {
  it('returns success and the parsed data', async () => {
    readMigrationFileMock.mockResolvedValue({ data: { ok: 1 } })
    const result = await getMigrationData()
    expect(result).toEqual({ success: true, data: { ok: 1 } })
  })

  it('returns failure with details when the file read fails', async () => {
    readMigrationFileMock.mockRejectedValue(new Error('disk full'))
    const result = await getMigrationData()
    expect(result.success).toBe(false)
    expect(result.error).toBe('disk full')
  })
})
