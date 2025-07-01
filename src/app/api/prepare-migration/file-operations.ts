import { promises as fs } from 'fs'
import path from 'path'
import { MigrationFileError } from './error-handling'

export const MIGRATION_FILE_PATH = path.join(process.cwd(), 'input', 'sanity-migration.json')

export interface MigrationFileContent {
  data: unknown
  rawContent: string
}

export async function readMigrationFile(): Promise<MigrationFileContent> {
  try {
    // Check if file exists first
    await fs.access(MIGRATION_FILE_PATH)

    // Read the file
    const rawContent = await fs.readFile(MIGRATION_FILE_PATH, 'utf-8')

    // Parse the JSON
    const data = JSON.parse(rawContent)

    return { data, rawContent }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new MigrationFileError('Migration file not found', {
        message: 'The sanity-migration.json file does not exist in the input directory',
        path: MIGRATION_FILE_PATH,
        cwd: process.cwd(),
      })
    }

    if (error instanceof SyntaxError) {
      throw new MigrationFileError('Invalid JSON in migration file', {
        message: 'The sanity-migration.json file contains invalid JSON',
        path: MIGRATION_FILE_PATH,
        error: error.message,
      })
    }

    throw new MigrationFileError('Failed to read migration file', {
      message: 'Could not read the sanity-migration.json file',
      path: MIGRATION_FILE_PATH,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export function getMigrationFilePreview(content: string, lineCount: number = 20): string {
  return content.split('\n').slice(0, lineCount).join('\n')
}
