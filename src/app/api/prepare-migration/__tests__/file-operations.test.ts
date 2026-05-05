import { describe, it, expect, vi } from 'vitest'

const accessMock = vi.fn()
const readFileMock = vi.fn()

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  const promises = {
    ...actual.promises,
    access: (...args: unknown[]) => accessMock(...args),
    readFile: (...args: unknown[]) => readFileMock(...args),
  }
  return { ...actual, promises, default: { ...actual, promises } }
})

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises')
  return {
    ...actual,
    access: (...args: unknown[]) => accessMock(...args),
    readFile: (...args: unknown[]) => readFileMock(...args),
    default: {
      ...actual,
      access: (...args: unknown[]) => accessMock(...args),
      readFile: (...args: unknown[]) => readFileMock(...args),
    },
  }
})

import { MigrationFileError } from '../error-handling'
import { readMigrationFile, getMigrationFilePreview, MIGRATION_FILE_PATH } from '../file-operations'

describe('readMigrationFile', () => {
  it('parses the file when it exists and contains valid JSON', async () => {
    accessMock.mockResolvedValueOnce(undefined)
    readFileMock.mockResolvedValueOnce('{"hello":1}')

    const result = await readMigrationFile()

    expect(result.data).toEqual({ hello: 1 })
    expect(result.rawContent).toBe('{"hello":1}')
  })

  it('wraps a missing-file error in a MigrationFileError', async () => {
    accessMock.mockRejectedValue(Object.assign(new Error('nope'), { code: 'ENOENT' }))
    const promise = readMigrationFile()
    await expect(promise).rejects.toBeInstanceOf(MigrationFileError)
    await expect(promise.catch((e) => e.message)).resolves.toBe('Migration file not found')
  })

  it('wraps a JSON syntax error in a MigrationFileError', async () => {
    accessMock.mockResolvedValue(undefined)
    readFileMock.mockResolvedValue('not json')

    await expect(readMigrationFile()).rejects.toMatchObject({
      message: 'Invalid JSON in migration file',
      name: 'MigrationFileError',
    })
  })

  it('wraps any other error in a MigrationFileError', async () => {
    accessMock.mockResolvedValue(undefined)
    readFileMock.mockRejectedValueOnce(new Error('disk full'))

    await expect(readMigrationFile()).rejects.toMatchObject({
      message: 'Failed to read migration file',
      name: 'MigrationFileError',
    })
  })

  it('handles non-Error rejections by stringifying them', async () => {
    accessMock.mockResolvedValue(undefined)
    readFileMock.mockRejectedValueOnce('weird')

    await expect(readMigrationFile()).rejects.toMatchObject({
      message: 'Failed to read migration file',
    })
  })
})

describe('getMigrationFilePreview', () => {
  it('returns at most the requested number of leading lines', () => {
    const text = 'a\nb\nc\nd\ne'
    expect(getMigrationFilePreview(text, 3)).toBe('a\nb\nc')
  })

  it('defaults to 20 lines when no count is given', () => {
    const text = Array.from({ length: 30 }, (_, i) => `line${i}`).join('\n')
    expect(getMigrationFilePreview(text).split('\n')).toHaveLength(20)
  })

  it('returns the whole content when fewer lines than requested', () => {
    expect(getMigrationFilePreview('only one')).toBe('only one')
  })
})

describe('MIGRATION_FILE_PATH', () => {
  it('points at input/sanity-migration.json under the cwd', () => {
    expect(MIGRATION_FILE_PATH).toMatch(/input.*sanity-migration\.json$/)
  })
})
