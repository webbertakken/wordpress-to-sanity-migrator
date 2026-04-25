import { describe, it, expect, vi, beforeEach } from 'vitest'

const writeFileSyncMock = vi.fn()
const existsSyncMock = vi.fn()
const readdirSyncMock = vi.fn()

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    default: {
      ...actual,
      writeFileSync: (...a: unknown[]) => writeFileSyncMock(...a),
      existsSync: (...a: unknown[]) => existsSyncMock(...a),
      readdirSync: (...a: unknown[]) => readdirSyncMock(...a),
    },
    writeFileSync: (...a: unknown[]) => writeFileSyncMock(...a),
    existsSync: (...a: unknown[]) => existsSyncMock(...a),
    readdirSync: (...a: unknown[]) => readdirSyncMock(...a),
  }
})

const executeMock = vi.fn()
const endMock = vi.fn()
const createConnectionMock = vi.fn()

vi.mock('mysql2/promise', () => {
  return {
    createConnection: (...a: unknown[]) => createConnectionMock(...a),
    default: { createConnection: (...a: unknown[]) => createConnectionMock(...a) },
  }
})

import { prepareMigration } from '../prepare-migration'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  existsSyncMock.mockReturnValue(false) // no media files found by default
  createConnectionMock.mockResolvedValue({ execute: executeMock, end: endMock })
})

describe('prepareMigration', () => {
  it('builds migration records for posts and pages and writes the JSON file', async () => {
    executeMock.mockResolvedValueOnce([
      [
        {
          ID: 1,
          post_title: 'Hello',
          post_content: '<p>Body text</p>',
          post_excerpt: '',
          post_date: '2024-01-01',
          post_modified: '2024-01-01',
          post_status: 'publish',
          post_name: 'hello',
          post_type: 'post',
          post_parent: 0,
          menu_order: 0,
          guid: '',
        },
        {
          ID: 2,
          post_title: 'About',
          post_content: '<p>Page</p>',
          post_excerpt: '',
          post_date: '2024-01-01',
          post_modified: '2024-01-01',
          post_status: 'publish',
          post_name: 'about',
          post_type: 'page',
          post_parent: 0,
          menu_order: 0,
          guid: '',
        },
      ],
    ])

    const updates: { step: string; message: string }[] = []
    const result = await prepareMigration(false, (u) => {
      updates.push({ step: u.step, message: u.message })
    })

    expect(result.migrationRecords).toHaveLength(2)
    expect(result.migrationRecords[0].transformed._type).toBe('post')
    expect(result.migrationRecords[1].transformed._type).toBe('page')
    expect(writeFileSyncMock).toHaveBeenCalled()
    expect(endMock).toHaveBeenCalled()
    expect(updates.some((u) => u.step === 'connecting')).toBe(true)
    expect(updates.some((u) => u.step === 'completed')).toBe(true)
  })

  it('honours the dryRun flag and emits a dry-run progress message', async () => {
    executeMock.mockResolvedValueOnce([[]])
    const messages: string[] = []
    await prepareMigration(true, (u) => messages.push(u.message))
    expect(writeFileSyncMock).not.toHaveBeenCalled()
    expect(messages).toContain('Dry run completed. No files written.')
  })

  it('treats pages as posts when parsePagesAsPosts is set', async () => {
    executeMock.mockResolvedValueOnce([
      [
        {
          ID: 9,
          post_title: 'About',
          post_content: '<p>Page-as-post</p>',
          post_excerpt: '',
          post_date: '2024-01-01',
          post_modified: '2024-01-01',
          post_status: 'publish',
          post_name: 'about',
          post_type: 'page',
          post_parent: 0,
          menu_order: 0,
          guid: '',
        },
      ],
    ])
    const result = await prepareMigration(false, undefined, { parsePagesAsPosts: true })
    expect(result.migrationRecords[0].transformed._type).toBe('post')
  })

  it('logs page-hierarchy info when there are child pages', async () => {
    executeMock.mockResolvedValueOnce([
      [
        {
          ID: 1,
          post_title: 'Parent',
          post_content: '<p>x</p>',
          post_excerpt: '',
          post_date: '2024-01-01',
          post_modified: '2024-01-01',
          post_status: 'publish',
          post_name: 'parent',
          post_type: 'page',
          post_parent: 0,
          menu_order: 0,
          guid: '',
        },
        {
          ID: 2,
          post_title: 'Child of parent',
          post_content: '<p>x</p>',
          post_excerpt: '',
          post_date: '2024-01-01',
          post_modified: '2024-01-01',
          post_status: 'publish',
          post_name: 'child',
          post_type: 'page',
          post_parent: 1,
          menu_order: 0,
          guid: '',
        },
        {
          ID: 3,
          post_title: 'Orphan',
          post_content: '<p>x</p>',
          post_excerpt: '',
          post_date: '2024-01-01',
          post_modified: '2024-01-01',
          post_status: 'publish',
          post_name: 'orphan',
          post_type: 'page',
          post_parent: 999,
          menu_order: 0,
          guid: '',
        },
      ],
    ])

    const messages: string[] = []
    await prepareMigration(false, (u) => messages.push(u.message))

    expect(messages.some((m) => m.includes('Top-level pages'))).toBe(true)
    expect(messages.some((m) => m.includes('child of "Parent"'))).toBe(true)
    expect(messages.some((m) => m.includes('missing parent ID'))).toBe(true)
  })

  it('skips invalid records (missing title or slug) and emits a warning', async () => {
    executeMock.mockResolvedValueOnce([
      [
        {
          ID: 1,
          post_title: '',
          post_content: '<p>x</p>',
          post_excerpt: '',
          post_date: '2024-01-01',
          post_modified: '2024-01-01',
          post_status: 'publish',
          post_name: 'no-title',
          post_type: 'post',
          post_parent: 0,
          menu_order: 0,
          guid: '',
        },
      ],
    ])
    const messages: string[] = []
    const result = await prepareMigration(false, (u) => messages.push(u.message))
    expect(result.migrationRecords).toHaveLength(0)
    expect(messages.some((m) => m.includes('Skipping invalid'))).toBe(true)
  })

  it('records found and missing media references in the missingMedia summary, and emits a media-processing progress message', async () => {
    executeMock.mockResolvedValueOnce([
      [
        {
          ID: 1,
          post_title: 'With image',
          post_content: '<p><img src="http://e/x.jpg" /></p>',
          post_excerpt: '',
          post_date: '2024-01-01',
          post_modified: '2024-01-01',
          post_status: 'publish',
          post_name: 'with-image',
          post_type: 'post',
          post_parent: 0,
          menu_order: 0,
          guid: '',
        },
      ],
    ])
    const messages: string[] = []
    const result = await prepareMigration(false, (u) => messages.push(u.message))
    expect(result.missingMedia.length).toBeGreaterThan(0)
    expect(result.missingMedia[0]).toMatchObject({
      url: 'http://e/x.jpg',
      type: 'image',
      foundIn: 'post: With image',
    })
    expect(messages.some((m) => m.startsWith('  - Found'))).toBe(true)
  })

  it('rethrows database errors and logs them', async () => {
    createConnectionMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
    await expect(prepareMigration(false)).rejects.toThrow('ECONNREFUSED')
  })
})
