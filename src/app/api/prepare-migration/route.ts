import { runMigrationPreparation } from './migration-service'
import type { MigrationOptions } from '../../../types/migration'

export async function POST(request: Request) {
  // Parse request body for options
  let options: MigrationOptions = {}
  try {
    const body = await request.text()
    if (body) {
      options = JSON.parse(body)
    }
  } catch (error) {
    console.warn('Failed to parse request body, using default options:', error)
  }

  // Create streaming response
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      try {
        // Send initial status
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'status',
              message: `Starting migration preparation${options.parsePagesAsPosts ? ' (pages as posts)' : ''}...`,
            })}\n\n`,
          ),
        )

        // Execute migration with streaming callback
        const result = await runMigrationPreparation((update) => {
          const message = `data: ${JSON.stringify({
            type: 'progress',
            ...update,
            timestamp: new Date().toISOString(),
          })}\n\n`
          console.log('Sending progress update:', update.message)
          controller.enqueue(encoder.encode(message))
        }, options)

        // Send final result
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'result',
              result,
            })}\n\n`,
          ),
        )
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'error',
              error: {
                success: false,
                error: 'Internal server error',
                details: {
                  stack: error instanceof Error ? error.stack || String(error) : String(error),
                },
              },
            })}\n\n`,
          ),
        )
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
