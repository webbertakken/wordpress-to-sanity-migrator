import { parse } from 'node-html-parser'
import * as fs from 'fs'
import * as path from 'path'
import type { MediaReference } from '../types/migration'

export interface MediaStats {
  totalImages: number
  totalAudio: number
  totalVideo: number
  totalFound: number
  totalMissing: number
}

const UPLOADS_PATH = path.join(process.cwd(), 'input', 'uploads')

/**
 * Extract all media URLs from WordPress content
 */
export function extractMediaFromContent(content: string): MediaReference[] {
  const root = parse(content)
  const mediaRefs: MediaReference[] = []

  // Extract images from img tags
  root.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src')
    if (src) {
      mediaRefs.push({
        url: src,
        localPath: '',
        type: 'image',
        found: false,
      })
    }
  })

  // Extract audio from audio tags and source elements
  root.querySelectorAll('audio').forEach((audio) => {
    const src = audio.getAttribute('src')
    if (src) {
      mediaRefs.push({
        url: src,
        localPath: '',
        type: 'audio',
        found: false,
      })
    }
  })

  // Extract audio from source tags within audio elements
  root.querySelectorAll('audio source').forEach((source) => {
    const src = source.getAttribute('src')
    if (src) {
      mediaRefs.push({
        url: src,
        localPath: '',
        type: 'audio',
        found: false,
      })
    }
  })

  // Extract video from video tags
  root.querySelectorAll('video').forEach((video) => {
    const src = video.getAttribute('src')
    if (src) {
      mediaRefs.push({
        url: src,
        localPath: '',
        type: 'video',
        found: false,
      })
    }
  })

  // Extract video from source tags within video elements
  root.querySelectorAll('video source').forEach((source) => {
    const src = source.getAttribute('src')
    if (src) {
      mediaRefs.push({
        url: src,
        localPath: '',
        type: 'video',
        found: false,
      })
    }
  })

  return mediaRefs
}

/**
 * Find local file path for a given URL
 */
export function findLocalPath(url: string): string | null {
  try {
    // Extract filename from URL
    const urlObj = new URL(url)
    const pathname = urlObj.pathname
    const filename = path.basename(pathname)

    // Search in uploads directory recursively
    const foundPath = searchFileRecursively(UPLOADS_PATH, filename)
    return foundPath
  } catch {
    // If URL parsing fails, try extracting filename directly
    const filename = url.split('/').pop()
    if (filename) {
      return searchFileRecursively(UPLOADS_PATH, filename)
    }
    return null
  }
}

/**
 * Recursively search for a file in directory
 */
function searchFileRecursively(dir: string, filename: string): string | null {
  try {
    if (!fs.existsSync(dir)) {
      return null
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        const found = searchFileRecursively(fullPath, filename)
        if (found) return found
      } else if (entry.name === filename) {
        return fullPath
      }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Map media URLs to local file paths
 */
export function mapMediaToLocalPaths(mediaRefs: MediaReference[]): MediaReference[] {
  return mediaRefs.map((ref) => {
    const localPath = findLocalPath(ref.url)
    return {
      ...ref,
      localPath: localPath || '',
      found: localPath !== null,
    }
  })
}

/**
 * Replace URLs in content with local paths
 */
export function replaceMediaUrls(content: string, mediaRefs: MediaReference[]): string {
  let updatedContent = content

  mediaRefs.forEach((ref) => {
    if (ref.found && ref.localPath) {
      // Convert absolute path to relative path from project root
      const relativePath = path.relative(process.cwd(), ref.localPath)
      // Replace URL with local path
      updatedContent = updatedContent.replace(new RegExp(escapeRegExp(ref.url), 'g'), relativePath)
    }
  })

  return updatedContent
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Generate media statistics
 */
export function generateMediaStats(mediaRefs: MediaReference[]): MediaStats {
  const images = mediaRefs.filter((ref) => ref.type === 'image')
  const audio = mediaRefs.filter((ref) => ref.type === 'audio')
  const video = mediaRefs.filter((ref) => ref.type === 'video')
  const found = mediaRefs.filter((ref) => ref.found)
  const missing = mediaRefs.filter((ref) => !ref.found)

  return {
    totalImages: images.length,
    totalAudio: audio.length,
    totalVideo: video.length,
    totalFound: found.length,
    totalMissing: missing.length,
  }
}
