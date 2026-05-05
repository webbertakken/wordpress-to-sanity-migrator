import { describe, it, expect } from 'vitest'
import type { MigrationVideoBlock } from '../../types/migration'
import { blockContentToHtml } from '../block-content-to-html'

/**
 * Renderer behaviour for video blocks. Three shapes are exercised:
 *
 * - YouTube / Vimeo: rendered as a `<figure class="video-block">` with an
 *   `<iframe>` embed; the URL is preserved as-is.
 * - Self-hosted file with a local path: rendered as `<figure>` with a
 *   `<video>` element pointing at the local file. The
 *   `processContentForPreview` helper in VerifyMigrationUI rewrites
 *   absolute paths to `/api/serve-media` URLs before display.
 * - Self-hosted file without a local path (rare): falls back to the
 *   external URL if any.
 */
describe('blockContentToHtml — video blocks', () => {
  it('renders a YouTube video as a figure with an iframe embed', () => {
    const block: MigrationVideoBlock = {
      _type: 'video',
      _key: 'v1',
      videoType: 'youtube',
      url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    }
    const html = blockContentToHtml([block])
    expect(html).toContain('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"')
    expect(html).toContain('class="video-block"')
    expect(html).toContain('allowfullscreen')
  })

  it('renders a Vimeo video as a figure with an iframe embed', () => {
    const block: MigrationVideoBlock = {
      _type: 'video',
      _key: 'v2',
      videoType: 'vimeo',
      url: 'https://player.vimeo.com/video/123456',
    }
    const html = blockContentToHtml([block])
    expect(html).toContain('<iframe src="https://player.vimeo.com/video/123456"')
  })

  it('renders a self-hosted video file with a <video> element', () => {
    const block: MigrationVideoBlock = {
      _type: 'video',
      _key: 'v3',
      videoType: 'url',
      url: 'http://example.com/clip.mp4',
      localPath: 'input/uploads/2014/07/clip.mp4',
      videoFile: { _type: 'file' },
    }
    const html = blockContentToHtml([block])
    expect(html).toContain('<video controls preload="metadata" playsinline>')
    expect(html).toContain(
      '<source src="/api/serve-media?path=input%2Fuploads%2F2014%2F07%2Fclip.mp4"',
    )
    expect(html).toContain('type="video/mp4"')
    expect(html).toContain('class="video-block"')
  })

  it('renders a video title as a figcaption when provided', () => {
    const block: MigrationVideoBlock = {
      _type: 'video',
      _key: 'v4',
      videoType: 'youtube',
      url: 'https://www.youtube.com/embed/abc',
      title: 'My demo video',
    }
    const html = blockContentToHtml([block])
    expect(html).toContain('<figcaption>My demo video</figcaption>')
  })

  it('omits the figcaption when no title is set', () => {
    const block: MigrationVideoBlock = {
      _type: 'video',
      _key: 'v5',
      videoType: 'youtube',
      url: 'https://www.youtube.com/embed/abc',
    }
    const html = blockContentToHtml([block])
    expect(html).not.toContain('<figcaption>')
  })

  it('emits nothing when a self-hosted video has no source at all', () => {
    const block: MigrationVideoBlock = {
      _type: 'video',
      _key: 'v6',
      videoType: 'url',
    }
    const html = blockContentToHtml([block])
    expect(html).toBe('')
  })
})
