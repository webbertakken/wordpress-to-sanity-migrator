// Lightweight HTML to Portable Text converter without JSDOM
import { nanoid } from 'nanoid'
import type {
  MediaReference,
  MigrationBlockContent,
  MigrationImageBlock,
  MigrationAudioBlock,
  MigrationVideoBlock,
  MigrationDividerBlock,
  MigrationEmbedBlock,
} from '../types/migration'
import { extractMediaFromContent, mapMediaToLocalPaths } from './media-processor'
import { parseInlineHTML, createBlockWithInlineContent } from './parse-inline-html'
import { splitIntoParagraphs } from './split-into-paragraphs'
import { expandWordPressShortcodes } from './wordpress-shortcodes'

// BlockChild interface is part of MigrationTextBlock's children property

// interface Block is defined in MigrationTextBlock

// Strip HTML tags and decode the common named entities. Mirrors the entity
// list in parse-inline-html.ts so plain-text extraction (e.g. figcaption)
// matches the rich-text path.
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '') // Remove all tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .trim()
}

// Extract audio blocks using regex
function extractAudioBlocks(
  html: string,
  mediaMap: Map<string, MediaReference>,
): MigrationAudioBlock[] {
  const blocks: MigrationAudioBlock[] = []

  // First try to match figure with audio (WordPress block pattern)
  const figureAudioPattern =
    /<figure[^>]*class="[^"]*wp-block-audio[^"]*"[^>]*>([\s\S]*?)<\/figure>/gi

  let match
  while ((match = figureAudioPattern.exec(html)) !== null) {
    const figureContent = match[1]

    // Extract audio tag from figure content
    const audioMatch = /<audio([^>]*)>/.exec(figureContent)
    if (!audioMatch) continue

    const audioAttrs = audioMatch[1]

    // Extract caption if present
    const captionMatch = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/.exec(figureContent)
    const caption = captionMatch ? stripHtml(captionMatch[1]) : undefined

    // Extract attributes from audio tag
    const srcMatch = /src="([^"]+)"/.exec(audioAttrs)
    const hasControls = /controls/.test(audioAttrs)
    const hasAutoplay = /autoplay/.test(audioAttrs)

    if (srcMatch && srcMatch[1]) {
      const src = srcMatch[1]
      const mediaRef = mediaMap.get(src)
      const audioBlock: MigrationAudioBlock = {
        _type: 'audio',
        _key: nanoid(),
        // Store the URL and localPath temporarily for migration processing
        // These will be removed when the block is processed in import-to-sanity
        url: src,
        localPath: mediaRef?.localPath,
        // These will be populated during the import-to-sanity process
        audioFile: {
          _type: 'file',
          // asset will be created during upload
        },
        showControls: hasControls,
        autoplay: hasAutoplay,
      }
      // Only add title if caption exists
      if (caption) {
        audioBlock.title = caption
      }
      blocks.push(audioBlock)
    }
  }

  // Also match standalone audio tags (not inside figures)
  const standaloneAudioPattern = /<audio([^>]*)>[\s\S]*?<\/audio>/gi

  // Reset regex to start from beginning
  standaloneAudioPattern.lastIndex = 0

  while ((match = standaloneAudioPattern.exec(html)) !== null) {
    // Skip if this audio is inside a figure we already processed
    const beforeMatch = html.substring(0, match.index)
    // const afterMatch = html.substring(match.index + match[0].length) // Not needed

    // Check if we're inside a figure tag
    const openFigures = (beforeMatch.match(/<figure[^>]*>/g) || []).length
    const closedFigures = (beforeMatch.match(/<\/figure>/g) || []).length
    const insideFigure = openFigures > closedFigures

    // Skip if inside a figure
    if (insideFigure) {
      continue
    }

    const audioAttrs = match[1]

    // Extract attributes
    const srcMatch = /src="([^"]+)"/.exec(audioAttrs)
    const hasControls = /controls/.test(audioAttrs)
    const hasAutoplay = /autoplay/.test(audioAttrs)

    if (srcMatch && srcMatch[1]) {
      const src = srcMatch[1]
      const mediaRef = mediaMap.get(src)
      const audioBlock: MigrationAudioBlock = {
        _type: 'audio',
        _key: nanoid(),
        // Store the URL temporarily for migration processing
        url: src,
        localPath: mediaRef?.localPath,
        // These will be populated during the import-to-sanity process
        audioFile: {
          _type: 'file',
          // asset will be created during upload
        },
        showControls: hasControls,
        autoplay: hasAutoplay,
      }
      blocks.push(audioBlock)
    }
  }

  return blocks
}

// Extract video blocks using regex
function extractVideoBlocks(
  html: string,
  mediaMap: Map<string, MediaReference>,
): MigrationVideoBlock[] {
  const blocks: MigrationVideoBlock[] = []

  // First try to match figure with video (WordPress block pattern)
  const figureVideoPattern =
    /<figure[^>]*class="[^"]*wp-block-video[^"]*"[^>]*>([\s\S]*?)<\/figure>/gi

  let match
  while ((match = figureVideoPattern.exec(html)) !== null) {
    const figureContent = match[1]

    // Extract video tag from figure content
    const videoMatch = /<video([^>]*)>/.exec(figureContent)
    if (!videoMatch) continue

    const videoAttrs = videoMatch[1]

    // Extract caption if present
    const captionMatch = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/.exec(figureContent)
    const caption = captionMatch ? stripHtml(captionMatch[1]) : undefined

    // Extract attributes from video tag
    const srcMatch = /src="([^"]+)"/.exec(videoAttrs)

    if (srcMatch && srcMatch[1]) {
      const src = srcMatch[1]
      const mediaRef = mediaMap.get(src)

      // Determine video type based on URL
      let videoType: 'youtube' | 'vimeo' | 'url' = 'url'
      if (src.includes('youtube.com') || src.includes('youtu.be')) {
        videoType = 'youtube'
      } else if (src.includes('vimeo.com')) {
        videoType = 'vimeo'
      }

      const videoBlock: MigrationVideoBlock = {
        _type: 'video',
        _key: nanoid(),
        videoType,
        url: src,
        localPath: mediaRef?.localPath,
      }
      // For self-hosted files, mark the videoFile placeholder so the
      // import step knows to upload the local file and attach the asset
      // reference (mirrors how audio blocks carry an empty `audioFile`).
      if (videoType === 'url' && mediaRef?.localPath) {
        videoBlock.videoFile = { _type: 'file' }
      }

      // Only add title if caption exists
      if (caption) {
        videoBlock.title = caption
      }

      blocks.push(videoBlock)
    }
  }

  // Also match standalone <video> elements (e.g. from the [video] shortcode
  // or hand-written HTML). These are direct file URLs (videoType = 'url').
  // Skip ones that already live inside a wp-block-video figure (handled above).
  const standaloneVideoPattern = /<video([^>]*)>[\s\S]*?<\/video>/gi
  while ((match = standaloneVideoPattern.exec(html)) !== null) {
    const beforeMatch = html.substring(0, match.index)
    const openFigures = (beforeMatch.match(/<figure[^>]*>/g) || []).length
    const closedFigures = (beforeMatch.match(/<\/figure>/g) || []).length
    if (openFigures > closedFigures) continue

    const videoAttrs = match[1]
    const srcMatch = /src="([^"]+)"/.exec(videoAttrs)
    if (!srcMatch) continue
    const src = srcMatch[1]
    const mediaRef = mediaMap.get(src)

    const videoBlock: MigrationVideoBlock = {
      _type: 'video',
      _key: nanoid(),
      videoType: 'url',
      url: src,
      localPath: mediaRef?.localPath,
    }
    if (mediaRef?.localPath) {
      videoBlock.videoFile = { _type: 'file' }
    }
    blocks.push(videoBlock)
  }

  // Also match WordPress embed blocks for YouTube/Vimeo
  const embedPattern = /<!-- wp:embed\s+({[^}]+})[\s\S]*?-->[\s\S]*?<!-- \/wp:embed -->/gi

  while ((match = embedPattern.exec(html)) !== null) {
    try {
      // Parse the JSON attributes
      const attrs = JSON.parse(match[1])
      const url = attrs.url

      if (url) {
        // Determine video type
        let videoType: 'youtube' | 'vimeo' | 'url' = 'url'
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
          videoType = 'youtube'
        } else if (url.includes('vimeo.com')) {
          videoType = 'vimeo'
        }

        const videoBlock: MigrationVideoBlock = {
          _type: 'video',
          _key: nanoid(),
          videoType,
          url,
        }
        blocks.push(videoBlock)
      }
    } catch (e) {
      // If JSON parsing fails, skip this embed
      console.warn('Failed to parse embed attributes:', e)
    }
  }

  // Also match iframe embeds (common for YouTube/Vimeo). The capture group
  // guarantees a non-empty src; the YouTube/Vimeo check filters out other
  // hosts (which the caller routes to the generic embed extractor).
  const iframePattern = /<iframe[^>]*src="([^"]+)"[^>]*>/gi
  while ((match = iframePattern.exec(html)) !== null) {
    const url = match[1]
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be')
    const isVimeo = url.includes('vimeo.com')
    if (!isYouTube && !isVimeo) continue
    blocks.push({
      _type: 'video',
      _key: nanoid(),
      videoType: isVimeo ? 'vimeo' : 'youtube',
      url,
    })
  }

  return blocks
}

/**
 * Map an `align(none|left|center|right)` class to the canonical alignment
 * value. WordPress's `alignnone` is the implicit default and is dropped.
 */
function parseAlignment(html: string): MigrationImageBlock['alignment'] | undefined {
  const match = /align(none|left|center|right)/i.exec(html)
  if (!match) return undefined
  const value = match[1].toLowerCase()
  if (value === 'left' || value === 'center' || value === 'right') {
    return value
  }
  return undefined
}

/**
 * Extract the text of the first `<figcaption>` in the given HTML, if any.
 * Returns `undefined` when no caption is present or it is empty.
 */
function parseFigcaption(html: string): string | undefined {
  const match = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(html)
  if (!match) return undefined
  const text = stripHtml(match[1])
  return text.length > 0 ? text : undefined
}

// Extract image blocks using regex. The input may be a standalone `<img>`,
// a `<figure>...</figure>` wrapper, or any HTML containing one or more
// `<img>` tags. When the input is a figure, the figcaption text becomes the
// caption and any alignment class (on the figure or the img) is captured.
function extractImageBlocks(
  html: string,
  mediaMap: Map<string, MediaReference>,
): MigrationImageBlock[] {
  const blocks: MigrationImageBlock[] = []

  // Pull figure-level attributes once — they apply to every image inside.
  const figureCaption = parseFigcaption(html)
  const figureAlignment = parseAlignment(html)

  // Pattern to match image blocks - handles attributes in any order
  const imagePattern = /<img[^>]*>/gi

  let match
  while ((match = imagePattern.exec(html)) !== null) {
    const imgTag = match[0]

    // Extract src attribute
    const srcMatch = /\s+src="([^"]+)"/.exec(imgTag)
    const src = srcMatch ? srcMatch[1] : ''

    // Extract alt attribute
    const altMatch = /\s+alt="([^"]*)"/.exec(imgTag)
    const alt = altMatch ? altMatch[1] : ''

    // Alignment may live on the <img> class or on a wrapping <figure>.
    // The img-level class wins when both are present.
    const alignment = parseAlignment(imgTag) ?? figureAlignment

    if (src) {
      const mediaRef = mediaMap.get(src)
      const imageBlock: MigrationImageBlock = {
        _type: 'image',
        _key: nanoid(),
        alt,
        url: src,
        localPath: mediaRef?.localPath,
      }
      if (figureCaption) {
        imageBlock.caption = figureCaption
      }
      if (alignment) {
        imageBlock.alignment = alignment
      }
      blocks.push(imageBlock)
    }
  }

  return blocks
}

/**
 * Build a divider block from an `<hr>` tag.
 */
function extractDividerBlock(): MigrationDividerBlock {
  return { _type: 'divider', _key: nanoid() }
}

/**
 * Build a generic embed block from an `<iframe>` whose URL is not handled
 * by the more specific video extractor (i.e. not YouTube or Vimeo).
 */
function extractEmbedBlock(html: string): MigrationEmbedBlock | null {
  const srcMatch = /<iframe[^>]*\bsrc="([^"]+)"/i.exec(html)
  if (!srcMatch) return null
  return { _type: 'embed', _key: nanoid(), url: srcMatch[1] }
}

/**
 * Detect whether an iframe URL points at a video host that is handled by
 * the dedicated video extractor (YouTube or Vimeo). Other hosts are
 * surfaced as generic embeds.
 */
function isVideoIframe(html: string): boolean {
  const srcMatch = /<iframe[^>]*\bsrc="([^"]+)"/i.exec(html)
  if (!srcMatch) return false
  const src = srcMatch[1]
  return /youtube\.com|youtu\.be|vimeo\.com/i.test(src)
}

// Removed unused extractTextBlocks function - text extraction is handled in htmlToBlockContent

export async function htmlToBlockContent(
  rawHtml: string,
): Promise<{ content: MigrationBlockContent; media: MediaReference[] }> {
  // 1. Expand WordPress shortcodes ([caption], [audio], [video] and the
  //    [ddownload] placeholder) into equivalent HTML so the rest of the
  //    pipeline can pick them up with the existing extractors.
  const expanded = expandWordPressShortcodes(rawHtml)

  // 2. WordPress stores `post_content` without `<p>` tags around plain text,
  //    and uses a mix of `\r\n`, `\n\n` and `<br />` for line breaks.
  //    Normalise the input so every line break becomes its own `<p>` block
  //    before the block-level extractor below runs.
  const html = splitIntoParagraphs(expanded)

  // First extract and map media references
  const mediaRefs = extractMediaFromContent(html)
  const mappedMedia = mapMediaToLocalPaths(mediaRefs)

  // Create a map of URLs to media references for quick lookup
  const mediaMap = new Map<string, MediaReference>()
  mappedMedia.forEach((ref) => {
    mediaMap.set(ref.url, ref)
  })

  const blocks: MigrationBlockContent = []

  // Process HTML content maintaining order
  // Create patterns for different element types
  const patterns = [
    // Figure elements with closing tags (must come before audio/video/img to catch wrapped media)
    /<figure[^>]*>[\s\S]*?<\/figure>/gi,
    // WordPress embed blocks
    /<!-- wp:embed[^>]*-->[\s\S]*?<!-- \/wp:embed -->/gi,
    // Self-closing img tags
    /<img[^>]*>/gi,
    // Standalone audio elements (with closing tag)
    /<audio[^>]*>[\s\S]*?<\/audio>/gi,
    // Standalone video elements (with closing tag)
    /<video[^>]*>[\s\S]*?<\/video>/gi,
    // Iframe embeds (YouTube/Vimeo become video blocks; other hosts become embed blocks)
    /<iframe[^>]*>/gi,
    // Horizontal rule (becomes a divider block)
    /<hr\b[^>]*\/?>/gi,
    // Blockquote elements
    /<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi,
    // List elements (ul and ol)
    /<(ul|ol)[^>]*>[\s\S]*?<\/\1>/gi,
    // Paragraph elements
    /<p[^>]*>[\s\S]*?<\/p>/gi,
    // Heading elements
    /<h([1-6])[^>]*>[\s\S]*?<\/h\1>/gi,
  ]

  // Collect all matches with their positions
  const allMatches: Array<{ match: RegExpMatchArray; pattern: RegExp }> = []
  const processedRanges: Array<{ start: number; end: number }> = []

  for (const pattern of patterns) {
    pattern.lastIndex = 0 // Reset regex
    let match
    while ((match = pattern.exec(html)) !== null) {
      const matchStart = match.index!
      const matchEnd = matchStart + match[0].length

      // Check if this match overlaps with any previously processed range
      const overlaps = processedRanges.some(
        (range) =>
          (matchStart >= range.start && matchStart < range.end) ||
          (matchEnd > range.start && matchEnd <= range.end) ||
          (matchStart <= range.start && matchEnd >= range.end),
      )

      if (!overlaps) {
        allMatches.push({ match, pattern })
        processedRanges.push({ start: matchStart, end: matchEnd })
      }
    }
  }

  // Sort matches by their position in the HTML
  allMatches.sort((a, b) => a.match.index! - b.match.index!)

  // Process each match in order. Loose text between/around elements is
  // impossible: splitIntoParagraphs above wraps every bare text run in <p>,
  // so the gap between two consecutive matches is at most a newline plus
  // tag-bearing markup that does not pass the inner conditions.
  for (const { match } of allMatches) {
    const element = match[0]

    // Determine element type and process accordingly
    if (element.startsWith('<figure')) {
      // Check if it's an audio figure
      if (/class="[^"]*wp-block-audio/.test(element)) {
        const audioBlocks = extractAudioBlocks(element, mediaMap)
        blocks.push(...audioBlocks)
      }
      // Check if it's a video figure
      else if (/class="[^"]*wp-block-video/.test(element)) {
        const videoBlocks = extractVideoBlocks(element, mediaMap)
        blocks.push(...videoBlocks)
      }
      // Check if it's an image figure
      else if (/class="[^"]*wp-block-image/.test(element) || /<img/.test(element)) {
        const imageBlocks = extractImageBlocks(element, mediaMap)
        blocks.push(...imageBlocks)
      }
    } else if (element.startsWith('<audio')) {
      const audioBlocks = extractAudioBlocks(element, mediaMap)
      blocks.push(...audioBlocks)
    } else if (element.startsWith('<video')) {
      const videoBlocks = extractVideoBlocks(element, mediaMap)
      blocks.push(...videoBlocks)
    } else if (element.startsWith('<!-- wp:embed')) {
      const videoBlocks = extractVideoBlocks(element, mediaMap)
      blocks.push(...videoBlocks)
    } else if (element.startsWith('<iframe')) {
      // YouTube and Vimeo go through the video extractor; everything else
      // is surfaced as a generic embed block.
      if (isVideoIframe(element)) {
        const videoBlocks = extractVideoBlocks(element, mediaMap)
        blocks.push(...videoBlocks)
      } else {
        const embedBlock = extractEmbedBlock(element)
        if (embedBlock) blocks.push(embedBlock)
      }
    } else if (element.startsWith('<hr')) {
      blocks.push(extractDividerBlock())
    } else if (element.startsWith('<img')) {
      const imageBlocks = extractImageBlocks(element, mediaMap)
      blocks.push(...imageBlocks)
    } else if (element.startsWith('<p')) {
      // splitIntoParagraphs above filters out empty <p>, so the inner is
      // always non-empty; the `.exec` is guaranteed to match by the pattern
      // routing.
      const textMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(element)!
      blocks.push(createBlockWithInlineContent(textMatch[1], 'normal'))
    } else if (element.startsWith('<h')) {
      const headingMatch = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/i.exec(element)!
      if (headingMatch[2].trim()) {
        const level = `h${headingMatch[1]}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
        blocks.push(createBlockWithInlineContent(headingMatch[2], level))
      }
    } else if (element.startsWith('<blockquote')) {
      const blockquoteMatch = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i.exec(element)!
      const innerHtml = blockquoteMatch[1]
      // A blockquote with paragraphs becomes one block per <p>; otherwise the
      // raw inner is used as a single block.
      const paragraphs = innerHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) ?? [innerHtml]
      paragraphs.forEach((p) => {
        const pMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(p)
        const content = pMatch ? pMatch[1] : p
        if (content.trim()) {
          blocks.push(createBlockWithInlineContent(content, 'blockquote'))
        }
      })
    } else {
      // Last branch in the cascade: <ul>/<ol>. The pattern routing guarantees
      // we are looking at one of those.
      const listMatch = /<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/i.exec(element)!
      const listType = listMatch[1] === 'ul' ? 'bullet' : 'number'
      const items = listMatch[2].match(/<li[^>]*>([\s\S]*?)<\/li>/gi) ?? []
      items.forEach((item) => {
        const itemMatch = /<li[^>]*>([\s\S]*?)<\/li>/i.exec(item)!
        if (!itemMatch[1].trim()) return
        const { children, markDefs } = parseInlineHTML(itemMatch[1])
        blocks.push({
          _type: 'block',
          _key: nanoid(),
          style: 'normal',
          listItem: listType,
          level: 1,
          children: children.length > 0 ? children : [{ _type: 'span', _key: nanoid(), text: '' }],
          markDefs,
        })
      })
    }
  }

  return { content: blocks, media: mappedMedia }
}

// Export the ordered version as well for better compatibility
export const htmlToBlockContentOrdered = htmlToBlockContent
