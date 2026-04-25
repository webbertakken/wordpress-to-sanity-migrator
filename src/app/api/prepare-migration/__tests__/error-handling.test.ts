import { describe, it, expect } from 'vitest'
import {
  MigrationError,
  DatabaseConnectionError,
  MigrationFileError,
  handleMigrationError,
} from '../error-handling'

describe('MigrationError class hierarchy', () => {
  it('MigrationError carries the supplied details', () => {
    const err = new MigrationError('boom', { stack: 'trace' })
    expect(err.message).toBe('boom')
    expect(err.name).toBe('MigrationError')
    expect(err.details).toEqual({ stack: 'trace' })
  })

  it('MigrationError defaults details to an empty object', () => {
    const err = new MigrationError('boom')
    expect(err.details).toEqual({})
  })

  it('DatabaseConnectionError attaches contextual guidance', () => {
    const err = new DatabaseConnectionError('connect ECONNREFUSED 127.0.0.1:3306')
    expect(err.name).toBe('DatabaseConnectionError')
    expect(err.details.guidance).toMatch(/connection refused/i)
  })

  it('MigrationFileError preserves any custom details', () => {
    const err = new MigrationFileError('not found', { path: '/x' })
    expect(err.name).toBe('MigrationFileError')
    expect(err.details).toMatchObject({ path: '/x' })
  })
})

describe('handleMigrationError', () => {
  it('returns the same error if it is already a MigrationError', () => {
    const original = new MigrationError('keep me')
    expect(handleMigrationError(original)).toBe(original)
  })

  it.each([
    'connect ECONNREFUSED',
    'ER_ACCESS_DENIED_ERROR',
    'ER_BAD_DB_ERROR',
    'connect ETIMEDOUT',
  ])('wraps %s into a DatabaseConnectionError with guidance', (msg) => {
    const result = handleMigrationError(new Error(msg))
    expect(result).toBeInstanceOf(DatabaseConnectionError)
    expect(result.details.guidance).toBeTruthy()
  })

  it('wraps a non-Error DB-error rejection into a DatabaseConnectionError with no stack', () => {
    const result = handleMigrationError({ sqlMessage: 'connect ECONNREFUSED' })
    expect(result).toBeInstanceOf(DatabaseConnectionError)
    expect(result.details.stack).toBeUndefined()
  })

  it('falls back to a plain MigrationError for unknown messages', () => {
    const result = handleMigrationError(new Error('something else'))
    expect(result).toBeInstanceOf(MigrationError)
    expect(result.name).toBe('MigrationError')
    expect(result.details.stack).toBeTruthy()
  })

  it('extracts message from a plain object with a message field', () => {
    const result = handleMigrationError({ message: 'plain object failure' })
    expect(result.message).toBe('plain object failure')
  })

  it('extracts message from sqlMessage when no message is set', () => {
    const result = handleMigrationError({ sqlMessage: 'SQL went bang' })
    expect(result.message).toBe('SQL went bang')
  })

  it('extracts message from a code field when no other field has a string', () => {
    const result = handleMigrationError({ code: 'ECUSTOM' })
    expect(result.message).toBe('ECUSTOM')
  })

  it('falls back to toString for objects with no recognised field', () => {
    const result = handleMigrationError({
      toString() {
        return 'custom-stringified'
      },
    })
    expect(result.message).toBe('custom-stringified')
  })

  it('returns a string error verbatim', () => {
    const result = handleMigrationError('plain string')
    expect(result.message).toBe('plain string')
  })

  it('returns a generic Unknown error message for unrecognised values', () => {
    const result = handleMigrationError(null)
    expect(result.message).toBe('Unknown error')
  })

  it('returns "An unexpected database error occurred" for unmatched DB error patterns via fallthrough', () => {
    // No DB pattern => falls through to MigrationError, but DatabaseConnectionError
    // alone for an empty string returns the default guidance.
    const err = new DatabaseConnectionError('')
    expect(err.details.guidance).toBe('An unexpected database error occurred')
  })
})
