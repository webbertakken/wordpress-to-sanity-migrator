import { NextRequest, NextResponse } from 'next/server'
import { existsSync, statSync, createReadStream } from 'fs'
import path from 'path'
import type { Readable } from 'stream'

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.wmv': 'video/x-ms-wmv',
}

function getContentType(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * Parse a single-range `Range: bytes=start-end` header. Returns null when
 * absent or unparseable; the caller falls back to a full-content response.
 */
function parseRange(
  header: string | null,
  fileSize: number,
): { start: number; end: number } | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null

  const [, startStr, endStr] = match
  let start = startStr === '' ? NaN : Number.parseInt(startStr, 10)
  let end = endStr === '' ? NaN : Number.parseInt(endStr, 10)

  // Suffix range: `bytes=-N` -> last N bytes.
  if (Number.isNaN(start) && !Number.isNaN(end)) {
    start = Math.max(0, fileSize - end)
    end = fileSize - 1
  }
  // Open-ended range: `bytes=N-` -> from N to end.
  if (!Number.isNaN(start) && Number.isNaN(end)) {
    end = fileSize - 1
  }

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileSize) {
    return null
  }
  return { start, end: Math.min(end, fileSize - 1) }
}

/**
 * Wrap a Node readable stream as a Web ReadableStream so Next.js can pipe
 * it back to the browser without buffering the entire file in memory.
 */
function nodeStreamToWebStream(node: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      node.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
      node.on('end', () => controller.close())
      node.on('error', (err) => controller.error(err))
    },
    cancel() {
      node.destroy()
    },
  })
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const filePath = searchParams.get('path')

    if (!filePath) {
      return NextResponse.json({ error: 'Missing file path parameter' }, { status: 400 })
    }

    const absolutePath = path.normalize(
      path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath),
    )

    // Restrict access to the input directory.
    const inputDir = path.join(process.cwd(), 'input')
    if (!absolutePath.startsWith(inputDir)) {
      return NextResponse.json(
        { error: 'Access denied: Path outside allowed directory' },
        { status: 403 },
      )
    }

    if (!existsSync(absolutePath)) {
      return NextResponse.json(
        {
          error: 'Media file not found',
          details: {
            requestedFile: path.basename(filePath),
            searchedIn: inputDir,
            suggestion:
              'Please ensure your WordPress uploads directory is copied to input/uploads/',
          },
        },
        { status: 404 },
      )
    }

    const stats = statSync(absolutePath)
    const contentType = getContentType(absolutePath)

    const baseHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000',
      'Accept-Ranges': 'bytes',
    }

    // Range requests — browsers use these to seek through audio/video,
    // and many <audio> elements need them to determine duration up-front.
    const range = parseRange(request.headers.get('range'), stats.size)
    if (range) {
      const { start, end } = range
      const stream = nodeStreamToWebStream(createReadStream(absolutePath, { start, end }))
      return new NextResponse(stream, {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes ${start}-${end}/${stats.size}`,
          'Content-Length': String(end - start + 1),
        },
      })
    }

    // Full-content response. Stream from disk so large files do not buffer
    // into memory. Always send Content-Length so the browser can determine
    // total size (and audio/video duration).
    const stream = nodeStreamToWebStream(createReadStream(absolutePath))
    return new NextResponse(stream, {
      headers: {
        ...baseHeaders,
        'Content-Length': String(stats.size),
      },
    })
  } catch (error) {
    console.error('Error serving media:', error)
    return NextResponse.json(
      {
        error: 'Failed to serve media file',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
