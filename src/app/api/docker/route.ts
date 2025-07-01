import { NextResponse } from 'next/server'
import { checkContainerStatus } from './check-container-status'
import { executeContainerCommand, ContainerCommand } from './execute-container-command'

export async function POST(request: Request) {
  try {
    const { operation } = await request.json()
    const command = operation as ContainerCommand

    // Validate operation
    if (!command || !['start', 'stop'].includes(command)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid operation',
          details: {
            guidance: 'Operation must be either "start" or "stop"',
          },
        },
        { status: 400 },
      )
    }

    // Check container status first
    const statusResult = await checkContainerStatus()
    if (!statusResult.success) {
      return NextResponse.json(statusResult, { status: 400 })
    }

    // Create streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        
        try {
          // Send initial status
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'status',
            message: 'Starting Docker operation...',
            operation: command
          })}\n\n`))

          // Execute the command with streaming callback
          const result = await executeContainerCommand(command, (step) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'step',
              step
            })}\n\n`))
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
  } catch (error) {
    console.error('Unexpected error in Docker API route:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: {
          stack: error instanceof Error ? error.stack || String(error) : String(error),
        },
      },
      { status: 500 },
    )
  }
}
