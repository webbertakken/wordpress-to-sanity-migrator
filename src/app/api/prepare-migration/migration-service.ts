import { prepareMigration } from './prepare-migration'
import { readMigrationFile, getMigrationFilePreview, MIGRATION_FILE_PATH } from './file-operations'
import { handleMigrationError } from './error-handling'

export interface MigrationResult {
  success: boolean
  message?: string
  error?: string
  details?: Record<string, unknown>
  data?: {
    postCount: number
    pageCount: number
    totalCount: number
    preview: string
    outputPath: string
    missingMedia?: { url: string; foundIn: string; type: string }[]
  }
}

export interface ProgressUpdate {
  step: string
  message: string
  progress?: number
}

export async function runMigrationPreparation(
  onProgress?: (update: ProgressUpdate) => void,
): Promise<MigrationResult> {
  try {
    onProgress?.({
      step: 'starting',
      message: 'Starting migration preparation...',
      progress: 5,
    })

    // Run the migration preparation - it will handle all progress updates
    const migrationResult = await prepareMigration(false, onProgress)

    onProgress?.({
      step: 'finalizing',
      message: 'Finalizing migration results...',
      progress: 98,
    })

    // Read and parse the output file
    const { data, rawContent } = await readMigrationFile()
    const content = data as { transformed: { _type: 'post' | 'page' } }[]

    const posts = content.filter((item) => item.transformed._type === 'post')
    const pages = content.filter((item) => item.transformed._type === 'page')

    onProgress?.({
      step: 'completed',
      message: `Migration completed: ${posts.length} posts, ${pages.length} pages`,
      progress: 100,
    })

    return {
      success: true,
      message: 'Migration preparation completed successfully',
      data: {
        postCount: posts.length,
        pageCount: pages.length,
        totalCount: content.length,
        preview: getMigrationFilePreview(rawContent),
        outputPath: MIGRATION_FILE_PATH,
        missingMedia: migrationResult.missingMedia,
      },
    }
  } catch (error) {
    const migrationError = handleMigrationError(error)
    return {
      success: false,
      error: migrationError.message,
      details: migrationError.details,
    }
  }
}
