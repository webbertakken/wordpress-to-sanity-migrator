import { MigrationError, MigrationFileError } from '../prepare-migration/error-handling'

export { MigrationError, MigrationFileError }

export function handleMigrationDataError(error: unknown): MigrationError {
  if (error instanceof MigrationError) {
    return error
  }

  if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
    return new MigrationFileError('Migration file not found', {
      message: 'The sanity-migration.json file does not exist in the input directory',
      cwd: process.cwd(),
    })
  }

  if (error instanceof SyntaxError) {
    return new MigrationFileError('Invalid JSON in migration file', {
      message: 'The sanity-migration.json file contains invalid JSON',
      error: error.message,
    })
  }

  return new MigrationError(error instanceof Error ? error.message : String(error), {
    stack: error instanceof Error ? error.stack : undefined,
    cwd: process.cwd(),
  })
}
