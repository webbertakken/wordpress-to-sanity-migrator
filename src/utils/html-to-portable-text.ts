// Lightweight HTML to Portable Text converter without JSDOM
import { nanoid } from 'nanoid'
import { extractMediaFromContent, mapMediaToLocalPaths } from './media-processor'
import type { MediaReference, ExtendedBlockContent } from '../types/migration'

interface BlockChild {
  _type: 'span'
  _key: string
  text?: string
  marks?: string[]
}

interface Block {
  _type: 'block'
  _key: string
  style?: 'normal' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'blockquote'
  children?: BlockChild[]
  markDefs?: Array<{
    _key: string
    _type: 'link'
    href?: string
    linkType?: 'href' | 'page' | 'post'
    openInNewTab?: boolean
  }>
  listItem?: 'bullet' | 'number'
  level?: number
}

// Strip HTML tags and decode entities
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '') // Remove all tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

// Extract audio blocks using regex
function extractAudioBlocks(html: string, mediaMap: Map<string, MediaReference>): ExtendedBlockContent {
  const blocks: ExtendedBlockContent = []
  
  // First try to match figure with audio (WordPress block pattern)
  const figureAudioPattern = /<figure[^>]*class="[^"]*wp-block-audio[^"]*"[^>]*>([\s\S]*?)<\/figure>/gi
  
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
      const audioBlock: any = {
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
    const afterMatch = html.substring(match.index + match[0].length)
    
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
      blocks.push({
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
      })
    }
  }
  
  return blocks
}

// Extract video blocks using regex
function extractVideoBlocks(html: string, mediaMap: Map<string, MediaReference>): ExtendedBlockContent {
  const blocks: ExtendedBlockContent = []
  
  // First try to match figure with video (WordPress block pattern)
  const figureVideoPattern = /<figure[^>]*class="[^"]*wp-block-video[^"]*"[^>]*>([\s\S]*?)<\/figure>/gi
  
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
      
      const videoBlock: any = {
        _type: 'video',
        _key: nanoid(),
        videoType,
        url: src,
        localPath: mediaRef?.localPath,
      }
      
      // Only add title if caption exists
      if (caption) {
        videoBlock.title = caption
      }
      
      blocks.push(videoBlock)
    }
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
        
        blocks.push({
          _type: 'video',
          _key: nanoid(),
          videoType,
          url,
        })
      }
    } catch (e) {
      // If JSON parsing fails, skip this embed
      console.warn('Failed to parse embed attributes:', e)
    }
  }
  
  // Also match iframe embeds (common for YouTube/Vimeo)
  const iframePattern = /<iframe[^>]*src="([^"]+)"[^>]*>/gi
  
  while ((match = iframePattern.exec(html)) !== null) {
    const src = match[0]
    const urlMatch = /src="([^"]+)"/.exec(src)
    
    if (urlMatch && urlMatch[1]) {
      const url = urlMatch[1]
      
      // Only process if it's a video embed
      if (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('vimeo.com')) {
        let videoType: 'youtube' | 'vimeo' = 'youtube'
        if (url.includes('vimeo.com')) {
          videoType = 'vimeo'
        }
        
        blocks.push({
          _type: 'video',
          _key: nanoid(),
          videoType,
          url,
        })
      }
    }
  }
  
  return blocks
}

// Extract image blocks using regex
function extractImageBlocks(html: string, mediaMap: Map<string, MediaReference>): ExtendedBlockContent {
  const blocks: ExtendedBlockContent = []
  
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
    
    if (src) {
      const mediaRef = mediaMap.get(src)
      blocks.push({
        _type: 'image',
        _key: nanoid(),
        alt,
        url: src,
        localPath: mediaRef?.localPath,
      })
    }
  }
  
  return blocks
}

// Extract text blocks using regex
function extractTextBlocks(html: string): ExtendedBlockContent {
  const blocks: ExtendedBlockContent = []
  
  // Remove audio and image elements first to avoid duplicate content
  const cleanHtml = html
    .replace(/<figure[^>]*class="[^"]*wp-block-audio[^"]*"[^>]*>[\s\S]*?<\/figure>/gi, '')
    .replace(/<audio[^>]*>[\s\S]*?<\/audio>/gi, '')
    .replace(/<img[^>]*>/gi, '')
  
  // Pattern to match paragraph tags
  const paragraphPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi
  
  let match
  while ((match = paragraphPattern.exec(cleanHtml)) !== null) {
    const text = stripHtml(match[1])
    if (text) {
      blocks.push({
        _type: 'block',
        _key: nanoid(),
        style: 'normal',
        children: [{
          _type: 'span',
          _key: nanoid(),
          text,
        }],
        markDefs: [],
      })
    }
  }
  
  // Also handle headings
  const headingPattern = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi
  const headingBlocks: ExtendedBlockContent = []
  
  while ((match = headingPattern.exec(cleanHtml)) !== null) {
    const level = match[1] as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
    const text = stripHtml(match[2])
    if (text) {
      headingBlocks.push({
        _type: 'block',
        _key: nanoid(),
        style: level,
        children: [{
          _type: 'span',
          _key: nanoid(),
          text,
        }],
        markDefs: [],
      })
    }
  }
  
  // Merge and sort blocks by their position in the original HTML
  return [...blocks, ...headingBlocks]
}

export async function htmlToBlockContent(
  html: string,
): Promise<{ content: ExtendedBlockContent; media: MediaReference[] }> {
  // First extract and map media references
  const mediaRefs = extractMediaFromContent(html)
  const mappedMedia = mapMediaToLocalPaths(mediaRefs)
  
  // Create a map of URLs to media references for quick lookup
  const mediaMap = new Map<string, MediaReference>()
  mappedMedia.forEach((ref) => {
    mediaMap.set(ref.url, ref)
  })
  
  const blocks: ExtendedBlockContent = []

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
    // Iframe embeds (for YouTube/Vimeo)
    /<iframe[^>]*>/gi,
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
      const overlaps = processedRanges.some(range => 
        (matchStart >= range.start && matchStart < range.end) ||
        (matchEnd > range.start && matchEnd <= range.end) ||
        (matchStart <= range.start && matchEnd >= range.end)
      )
      
      if (!overlaps) {
        allMatches.push({ match, pattern })
        processedRanges.push({ start: matchStart, end: matchEnd })
      }
    }
  }
  
  // Sort matches by their position in the HTML
  allMatches.sort((a, b) => a.match.index! - b.match.index!)
  
  let lastIndex = 0
  
  // Process each match in order
  for (const { match } of allMatches) {
    const element = match[0]
    const matchIndex = match.index!
    
    // Process any text content before this element
    if (matchIndex > lastIndex) {
      const textBefore = html.substring(lastIndex, matchIndex).trim()
      if (textBefore && !/<[^>]*>/.test(textBefore)) {
        blocks.push({
          _type: 'block',
          _key: nanoid(),
          style: 'normal',
          children: [{
            _type: 'span',
            _key: nanoid(),
            text: stripHtml(textBefore),
          }],
          markDefs: [],
        })
      }
    }
    
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
      const videoBlocks = extractVideoBlocks(element, mediaMap)
      blocks.push(...videoBlocks)
    } else if (element.startsWith('<img')) {
      const imageBlocks = extractImageBlocks(element, mediaMap)
      blocks.push(...imageBlocks)
    } else if (element.startsWith('<p')) {
      const textMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(element)
      if (textMatch) {
        const text = stripHtml(textMatch[1])
        if (text) {
          blocks.push({
            _type: 'block',
            _key: nanoid(),
            style: 'normal',
            children: [{
              _type: 'span',
              _key: nanoid(),
              text,
            }],
            markDefs: [],
          })
        }
      }
    } else if (element.match(/^<h[1-6]/)) {
      const headingMatch = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/i.exec(element)
      if (headingMatch) {
        const level = `h${headingMatch[1]}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
        const text = stripHtml(headingMatch[2])
        if (text) {
          blocks.push({
            _type: 'block',
            _key: nanoid(),
            style: level,
            children: [{
              _type: 'span',
              _key: nanoid(),
              text,
            }],
            markDefs: [],
          })
        }
      }
    }
    
    lastIndex = matchIndex + element.length
  }
  
  // Process any remaining text after the last element
  if (lastIndex < html.length) {
    const textAfter = html.substring(lastIndex).trim()
    if (textAfter && !/<[^>]*>/.test(textAfter)) {
      blocks.push({
        _type: 'block',
        _key: nanoid(),
        style: 'normal',
        children: [{
          _type: 'span',
          _key: nanoid(),
          text: stripHtml(textAfter),
        }],
        markDefs: [],
      })
    }
  }
  
  return { content: blocks, media: mappedMedia }
}

// Export the ordered version as well for better compatibility
export const htmlToBlockContentOrdered = htmlToBlockContent
