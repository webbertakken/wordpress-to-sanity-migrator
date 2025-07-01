import { readMigrationFile } from '../prepare-migration/file-operations'
import { handleMigrationDataError } from './error-handling'

export interface MigrationDataResult {
  success: boolean
  error?: string
  details?: Record<string, unknown>
  data?: unknown
}

export async function getMigrationData(): Promise<MigrationDataResult> {
  try {
    const { data } = await readMigrationFile()
    return {
      success: true,
      data,
    }
  } catch (error) {
    const migrationError = handleMigrationDataError(error)
    return {
      success: false,
      error: migrationError.message,
      details: migrationError.details,
    }
  }
}
