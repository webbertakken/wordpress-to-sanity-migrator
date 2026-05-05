import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MigrationRecord } from '../../types/migration'
import { analyzeHtmlTags, generateTagReport, type TagAnalysis } from '../tag-analyzer'

const existsSyncMock = vi.fn()
const readFileSyncMock = vi.fn()

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  const stub = {
    ...actual,
    existsSync: (...args: Parameters<typeof actual.existsSync>) => existsSyncMock(...args),
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) => readFileSyncMock(...args),
  }
  return { ...stub, default: stub }
})

function buildRecord(html: string): MigrationRecord {
  return {
    original: {
      ID: 1,
      post_title: 't',
      post_content: html,
      post_excerpt: '',
      post_date: '2024-01-01',
      post_modified: '2024-01-01',
      post_status: 'publish',
      post_name: 'slug',
      post_type: 'post',
      post_parent: 0,
      menu_order: 0,
      guid: '',
    },
    transformed: {
      _type: 'post',
      title: 't',
      slug: { _type: 'slug', current: 'slug', source: 'title' },
      coverImage: { _type: 'image', alt: '', asset: undefined },
      media: [],
    },
  }
}

describe('analyzeHtmlTags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws when the migration file does not exist', async () => {
    existsSyncMock.mockReturnValue(false)
    await expect(analyzeHtmlTags()).rejects.toThrow('Migration file not found')
  })

  it('counts tags, identifies covered/uncovered media tags, and collects src URLs', async () => {
    existsSyncMock.mockReturnValue(true)
    const data: MigrationRecord[] = [
      // First record: introduces img+iframe (covers the !has=true branches), a
      // second img-with-src (covers the !has=false branch), and an img with an
      // empty src="" (covers the `if (src)` else branch — [src] selector still
      // matches but the value is falsy).
      buildRecord(
        '<p>Hello</p>' +
          '<img src="http://e/x.jpg" />' +
          '<img src="http://e/x2.jpg" />' +
          '<img src="" />' +
          '<iframe src="https://yt/embed"></iframe>',
      ),
      // Second record: re-emits img and iframe so the analyzer hits both
      // `tagsWithSrc.has(tagName)` AND `allMediaWithSrc.has(tagName)` true
      // branches when merging.
      buildRecord(
        '<embed src="http://e/y.swf" /><object>test</object><img src="http://e/x2.jpg" /><iframe src="https://yt/embed2"></iframe>',
      ),
    ]
    readFileSyncMock.mockReturnValue(JSON.stringify(data) as never)

    const result = await analyzeHtmlTags()

    expect(result.allTags.has('img')).toBe(true)
    expect(result.allTags.has('p')).toBe(true)
    expect(result.allTags.has('iframe')).toBe(true)
    expect(result.mediaTags.has('img')).toBe(true)
    expect(result.mediaTags.has('iframe')).toBe(true)
    expect(result.uncoveredMediaTags.has('iframe')).toBe(true)
    expect(result.uncoveredMediaTags.has('img')).toBe(false) // covered
    expect(result.tagFrequency.get('img')).toBeGreaterThan(0)
    expect(result.mediaWithSrc.has('img')).toBe(true)
    expect(result.mediaWithSrc.get('img')).toEqual(
      expect.arrayContaining(['http://e/x.jpg', 'http://e/x2.jpg']),
    )
    expect(result.mediaWithSrc.get('iframe')).toEqual(
      expect.arrayContaining(['https://yt/embed', 'https://yt/embed2']),
    )
  })
})

function fakeAnalysis(overrides: Partial<TagAnalysis> = {}): TagAnalysis {
  return {
    allTags: new Set(['p', 'img', 'iframe']),
    mediaTags: new Set(['img', 'iframe']),
    uncoveredMediaTags: new Set(['iframe']),
    tagFrequency: new Map([
      ['p', 5],
      ['img', 3],
      ['iframe', 1],
    ]),
    mediaWithSrc: new Map([
      ['img', ['http://e/x.jpg', 'http://e/y.jpg']],
      ['iframe', ['https://yt/a', 'https://yt/b', 'https://yt/c', 'https://yt/d']],
    ]),
    ...overrides,
  }
}

describe('generateTagReport', () => {
  it('lists covered tags, non-media tags and uncovered media tags', () => {
    const report = generateTagReport(fakeAnalysis())
    expect(report).toContain('Total unique tags found: 3')
    expect(report).toContain('COVERED TAGS')
    expect(report).toContain('img (3 occurrences)')
    expect(report).toContain('NON-MEDIA TAGS')
    expect(report).toContain('p (5 occurrences)')
    expect(report).toContain('UNCOVERED MEDIA TAGS')
    expect(report).toContain('iframe (1 occurrences)')
  })

  it('reports the all-covered success message when there are no uncovered media tags', () => {
    const report = generateTagReport(fakeAnalysis({ uncoveredMediaTags: new Set() }))
    expect(report).toContain('All media-related tags are covered')
  })

  it('lists every src URL for media tags with three or fewer URLs', () => {
    const report = generateTagReport(fakeAnalysis())
    expect(report).toContain('http://e/x.jpg')
    expect(report).toContain('http://e/y.jpg')
  })

  it('truncates very long src lists with an ellipsis', () => {
    const report = generateTagReport(fakeAnalysis())
    expect(report).toContain('... and 2 more')
  })

  it('falls back to a frequency of 0 for tags missing from the frequency map', () => {
    const report = generateTagReport(
      fakeAnalysis({
        allTags: new Set(['p', 'img', 'iframe', 'audio']),
        uncoveredMediaTags: new Set(['iframe']),
        tagFrequency: new Map(), // every tag missing -> always falls back to 0
      }),
    )
    expect(report).toContain('img (0 occurrences)') // covered tag fallback
    expect(report).toContain('p (0 occurrences)') // non-media tag fallback
    expect(report).toContain('iframe (0 occurrences)') // uncovered media tag fallback
  })
})
