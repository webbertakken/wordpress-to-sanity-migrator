import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const filePath = searchParams.get('path')

    if (!filePath) {
      return NextResponse.json({ error: 'Missing file path parameter' }, { status: 400 })
    }

    console.log(`Media request for: ${filePath}`)

    // Check if the path is already absolute
    let absolutePath: string
    if (path.isAbsolute(filePath)) {
      // If it's already an absolute path, use it directly
      absolutePath = filePath
    } else {
      // If it's relative, resolve it from the project root
      absolutePath = path.join(process.cwd(), filePath)
    }

    // Normalize the path to handle Windows backslashes
    absolutePath = path.normalize(absolutePath)

    // Ensure the path is within the allowed directories
    const inputDir = path.join(process.cwd(), 'input')
    if (!absolutePath.startsWith(inputDir)) {
      console.error(`Access denied: ${absolutePath} is outside ${inputDir}`)
      return NextResponse.json(
        { error: 'Access denied: Path outside allowed directory' },
        { status: 403 },
      )
    }

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
      console.error(`File not found: ${absolutePath} (requested path: ${filePath})`)
      return NextResponse.json(
        { error: 'File not found', absolutePath, requestedPath: filePath },
        { status: 404 },
      )
    }

    // Read the file
    const fileBuffer = fs.readFileSync(absolutePath)

    // Determine content type based on file extension
    const ext = path.extname(absolutePath).toLowerCase()
    let contentType = 'application/octet-stream'

    switch (ext) {
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg'
        break
      case '.png':
        contentType = 'image/png'
        break
      case '.gif':
        contentType = 'image/gif'
        break
      case '.webp':
        contentType = 'image/webp'
        break
      case '.svg':
        contentType = 'image/svg+xml'
        break
      case '.mp3':
        contentType = 'audio/mpeg'
        break
      case '.wav':
        contentType = 'audio/wav'
        break
      case '.ogg':
        contentType = 'audio/ogg'
        break
      case '.mp4':
        contentType = 'video/mp4'
        break
      case '.webm':
        contentType = 'video/webm'
        break
    }

    // Return the file with appropriate headers
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
      },
    })
  } catch (error) {
    console.error('Error serving media:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
