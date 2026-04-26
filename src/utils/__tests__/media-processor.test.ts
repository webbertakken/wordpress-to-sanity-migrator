import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import path from 'path'
import {
  extractMediaFromContent,
  findLocalPath,
  mapMediaToLocalPaths,
  replaceMediaUrls,
  generateMediaStats,
} from '../media-processor'

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
  }
})

const mockedExistsSync = vi.mocked(fs.existsSync)
const mockedReaddirSync = vi.mocked(fs.readdirSync)

interface FakeDirEntry {
  name: string
  isDirectory: () => boolean
}

function buildEntry(name: string, isDir: boolean): FakeDirEntry {
  return { name, isDirectory: () => isDir }
}

describe('extractMediaFromContent', () => {
  it('returns no references for content without media', () => {
    expect(extractMediaFromContent('<p>Just a paragraph</p>')).toEqual([])
  })

  it('extracts <img> references as image type', () => {
    const result = extractMediaFromContent('<img src="http://example.com/x.jpg" />')
    expect(result).toEqual([
      { url: 'http://example.com/x.jpg', localPath: '', type: 'image', found: false },
    ])
  })

  it('extracts <audio src> references as audio type', () => {
    const result = extractMediaFromContent('<audio src="http://example.com/clip.mp3"></audio>')
    expect(result.find((r) => r.type === 'audio')).toMatchObject({
      url: 'http://example.com/clip.mp3',
    })
  })

  it('extracts <audio><source> references as audio type', () => {
    const result = extractMediaFromContent(
      '<audio><source src="http://example.com/clip.mp3" /></audio>',
    )
    const audioRefs = result.filter((r) => r.type === 'audio')
    expect(audioRefs.map((r) => r.url)).toContain('http://example.com/clip.mp3')
  })

  it('extracts <video src> references as video type', () => {
    const result = extractMediaFromContent('<video src="http://example.com/clip.mp4"></video>')
    expect(result.find((r) => r.type === 'video')).toMatchObject({
      url: 'http://example.com/clip.mp4',
    })
  })

  it('extracts <video><source> references as video type', () => {
    const result = extractMediaFromContent(
      '<video><source src="http://example.com/clip.mp4" /></video>',
    )
    const videoRefs = result.filter((r) => r.type === 'video')
    expect(videoRefs.map((r) => r.url)).toContain('http://example.com/clip.mp4')
  })

  it('skips elements without a src attribute', () => {
    const result = extractMediaFromContent('<img alt="no source" /><audio></audio><video></video>')
    expect(result).toEqual([])
  })

  it('skips <source> children without a src attribute inside audio/video', () => {
    const result = extractMediaFromContent(
      '<audio><source type="audio/mpeg" /></audio><video><source type="video/mp4" /></video>',
    )
    expect(result).toEqual([])
  })
})

describe('findLocalPath', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('walks the uploads tree to find a file matching the URL filename', () => {
    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync.mockImplementationOnce(
      () => [buildEntry('2024', true), buildEntry('readme.txt', false)] as never,
    )
    mockedReaddirSync.mockImplementationOnce(() => [buildEntry('photo.jpg', false)] as never)

    const result = findLocalPath('https://example.com/wp-content/uploads/2024/photo.jpg')
    expect(result).toBe(path.join(process.cwd(), 'input', 'uploads', '2024', 'photo.jpg'))
  })

  it('returns null when the uploads directory does not exist', () => {
    mockedExistsSync.mockReturnValue(false)
    expect(findLocalPath('http://example.com/uploads/missing.jpg')).toBeNull()
  })

  it('returns null when no entry matches the filename', () => {
    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync.mockReturnValue([buildEntry('different.jpg', false)] as never)
    expect(findLocalPath('http://example.com/uploads/photo.jpg')).toBeNull()
  })

  it('keeps walking when a sub-directory does not contain the file (covers if (found) false)', () => {
    mockedExistsSync.mockReturnValue(true)
    // First level: an empty subdirectory followed by the matching file.
    mockedReaddirSync
      .mockImplementationOnce(
        () => [buildEntry('empty-dir', true), buildEntry('photo.jpg', false)] as never,
      )
      // Second level (recursive into 'empty-dir'): no matches.
      .mockImplementationOnce(() => [] as never)

    const result = findLocalPath('https://example.com/wp-content/uploads/photo.jpg')
    expect(result).toBe(path.join(process.cwd(), 'input', 'uploads', 'photo.jpg'))
  })

  it('returns null when readdirSync throws (e.g. permission denied)', () => {
    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync.mockImplementation(() => {
      throw new Error('EACCES')
    })
    expect(findLocalPath('http://example.com/uploads/photo.jpg')).toBeNull()
  })

  it('falls back to splitting the raw input when URL parsing fails', () => {
    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync.mockReturnValueOnce([buildEntry('photo.jpg', false)] as never)

    const result = findLocalPath('not a url/photo.jpg')
    expect(result).toBe(path.join(process.cwd(), 'input', 'uploads', 'photo.jpg'))
  })

  it('returns null when URL parsing fails and the trailing segment is empty', () => {
    mockedExistsSync.mockReturnValue(true)
    expect(findLocalPath('')).toBeNull()
  })
})

describe('mapMediaToLocalPaths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks references as found when a local file is located, missing otherwise', () => {
    mockedExistsSync.mockReturnValue(true)
    mockedReaddirSync
      .mockReturnValueOnce([buildEntry('found.jpg', false)] as never)
      .mockReturnValueOnce([] as never)

    const refs = [
      { url: 'http://example.com/found.jpg', localPath: '', type: 'image' as const, found: false },
      {
        url: 'http://example.com/missing.jpg',
        localPath: '',
        type: 'image' as const,
        found: false,
      },
    ]
    const result = mapMediaToLocalPaths(refs)
    expect(result[0].found).toBe(true)
    expect(result[0].localPath).toBe(path.join(process.cwd(), 'input', 'uploads', 'found.jpg'))
    expect(result[1].found).toBe(false)
    expect(result[1].localPath).toBe('')
  })
})

describe('replaceMediaUrls', () => {
  it('rewrites URLs to project-relative paths for found references', () => {
    const cwd = process.cwd()
    const refs = [
      {
        url: 'http://example.com/photo.jpg',
        localPath: path.join(cwd, 'input', 'uploads', 'photo.jpg'),
        type: 'image' as const,
        found: true,
      },
    ]
    const html = '<img src="http://example.com/photo.jpg" />'
    const out = replaceMediaUrls(html, refs)
    expect(out).toBe(`<img src="${path.join('input', 'uploads', 'photo.jpg')}" />`)
  })

  it('escapes regex metacharacters in the URL', () => {
    const cwd = process.cwd()
    const refs = [
      {
        url: 'http://example.com/path?with=query&and=stuff',
        localPath: path.join(cwd, 'input', 'uploads', 'photo.jpg'),
        type: 'image' as const,
        found: true,
      },
    ]
    const html = '<img src="http://example.com/path?with=query&and=stuff" />'
    const out = replaceMediaUrls(html, refs)
    expect(out).not.toContain('http://example.com')
    expect(out).toContain(path.join('input', 'uploads', 'photo.jpg'))
  })

  it('leaves content unchanged for missing references', () => {
    const html = '<img src="http://example.com/photo.jpg" />'
    expect(
      replaceMediaUrls(html, [
        {
          url: 'http://example.com/photo.jpg',
          localPath: '',
          type: 'image',
          found: false,
        },
      ]),
    ).toBe(html)
  })
})

describe('generateMediaStats', () => {
  it('counts each media type and the found/missing split', () => {
    const stats = generateMediaStats([
      { url: 'a', localPath: '/a', type: 'image', found: true },
      { url: 'b', localPath: '/b', type: 'image', found: false },
      { url: 'c', localPath: '/c', type: 'audio', found: true },
      { url: 'd', localPath: '/d', type: 'video', found: false },
    ])
    expect(stats).toEqual({
      totalImages: 2,
      totalAudio: 1,
      totalVideo: 1,
      totalFound: 2,
      totalMissing: 2,
    })
  })

  it('returns zeros for an empty input', () => {
    expect(generateMediaStats([])).toEqual({
      totalImages: 0,
      totalAudio: 0,
      totalVideo: 0,
      totalFound: 0,
      totalMissing: 0,
    })
  })
})

afterEach(() => {
  vi.clearAllMocks()
})
