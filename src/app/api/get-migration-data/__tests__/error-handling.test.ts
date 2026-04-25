import { describe, it, expect } from 'vitest'
import { handleMigrationDataError, MigrationError, MigrationFileError } from '../error-handling'

describe('handleMigrationDataError', () => {
  it('returns the same MigrationError when one is supplied', () => {
    const original = new MigrationError('keep me')
    expect(handleMigrationDataError(original)).toBe(original)
  })

  it('wraps an ENOENT error in a MigrationFileError', () => {
    const err = Object.assign(new Error('nope'), { code: 'ENOENT' })
    const result = handleMigrationDataError(err)
    expect(result).toBeInstanceOf(MigrationFileError)
    expect(result.message).toBe('Migration file not found')
  })

  it('wraps a SyntaxError in a MigrationFileError', () => {
    const result = handleMigrationDataError(new SyntaxError('bad json'))
    expect(result).toBeInstanceOf(MigrationFileError)
    expect(result.message).toBe('Invalid JSON in migration file')
  })

  it('wraps any other Error in a generic MigrationError with the original message', () => {
    const result = handleMigrationDataError(new Error('disk full'))
    expect(result.name).toBe('MigrationError')
    expect(result.message).toBe('disk full')
  })

  it('falls back to String(error) for non-Error throwables', () => {
    const result = handleMigrationDataError('weird')
    expect(result.message).toBe('weird')
  })
})
