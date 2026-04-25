import { describe, it, expect, vi, beforeEach } from 'vitest'

const prepareMock = vi.fn()
const readMigrationFileMock = vi.fn()

vi.mock('../prepare-migration', () => ({
  prepareMigration: (...a: unknown[]) => prepareMock(...a),
}))

vi.mock('../file-operations', async () => {
  const actual = await vi.importActual<typeof import('../file-operations')>('../file-operations')
  return {
    ...actual,
    readMigrationFile: (...a: unknown[]) => readMigrationFileMock(...a),
  }
})

import { runMigrationPreparation } from '../migration-service'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runMigrationPreparation', () => {
  it('returns a success result with post/page counts and a preview', async () => {
    prepareMock.mockResolvedValue({ migrationRecords: [], missingMedia: [] })
    readMigrationFileMock.mockResolvedValue({
      data: [
        { transformed: { _type: 'post' } },
        { transformed: { _type: 'post' } },
        { transformed: { _type: 'page' } },
      ],
      rawContent: 'line1\nline2\nline3',
    })

    const updates: { step: string }[] = []
    const result = await runMigrationPreparation((u) => updates.push(u))

    expect(result.success).toBe(true)
    expect(result.data?.postCount).toBe(2)
    expect(result.data?.pageCount).toBe(1)
    expect(result.data?.totalCount).toBe(3)
    expect(result.data?.preview).toContain('line1')
    expect(updates.some((u) => u.step === 'starting')).toBe(true)
    expect(updates.some((u) => u.step === 'completed')).toBe(true)
  })

  it('threads parsePagesAsPosts options through to prepareMigration', async () => {
    prepareMock.mockResolvedValue({ migrationRecords: [], missingMedia: [] })
    readMigrationFileMock.mockResolvedValue({ data: [], rawContent: '' })
    await runMigrationPreparation(undefined, { parsePagesAsPosts: true })
    expect(prepareMock).toHaveBeenCalledWith(false, undefined, { parsePagesAsPosts: true })
  })

  it('returns an error result when prepareMigration throws', async () => {
    prepareMock.mockRejectedValue(new Error('connect ECONNREFUSED'))
    const result = await runMigrationPreparation()
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/ECONNREFUSED/)
    expect(result.details?.guidance).toBeTruthy()
  })

  it('returns an error result when reading the file fails', async () => {
    prepareMock.mockResolvedValue({ migrationRecords: [], missingMedia: [] })
    readMigrationFileMock.mockRejectedValue(new Error('disk full'))
    const result = await runMigrationPreparation()
    expect(result.success).toBe(false)
  })
})
