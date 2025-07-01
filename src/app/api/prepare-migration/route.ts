import { runMigrationPreparation } from './migration-service'

export async function POST() {
  // Create streaming response
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      
      try {
        // Send initial status
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'status',
          message: 'Starting migration preparation...'
        })}\n\n`))

        // Execute migration with streaming callback
        const result = await runMigrationPreparation((update) => {
          const message = `data: ${JSON.stringify({
            type: 'progress',
            ...update,
            timestamp: new Date().toISOString()
          })}\n\n`
          console.log('Sending progress update:', update.message)
          controller.enqueue(encoder.encode(message))
        })

        // Send final result
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'result',
          result
        })}\n\n`))

      } catch (error) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'error',
          error: {
            success: false,
            error: 'Internal server error',
            details: {
              stack: error instanceof Error ? error.stack || String(error) : String(error),
            },
          }
        })}\n\n`))
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
