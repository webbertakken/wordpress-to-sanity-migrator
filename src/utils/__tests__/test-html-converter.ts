// Test-optimized version of htmlToBlockContent that reuses JSDOM instance
import { JSDOM } from 'jsdom'
import { nanoid } from 'nanoid'
import { extractMediaFromContent, mapMediaToLocalPaths } from '../media-processor'
import type { MediaReference, MigrationBlockContent, MigrationAudioBlock, MigrationImageBlock } from '../../types/migration'

// Create a single JSDOM instance to reuse across tests
let cachedJSDOM: typeof JSDOM | null = null

async function getJSDOM(): Promise<typeof JSDOM> {
  if (!cachedJSDOM) {
    const jsdomModule = await import('jsdom')
    cachedJSDOM = jsdomModule.JSDOM
  }
  return cachedJSDOM
}

export async function testHtmlToBlockContent(
  html: string,
): Promise<{ content: MigrationBlockContent; media: MediaReference[] }> {
  // First extract and map media references
  const mediaRefs = extractMediaFromContent(html)
  const mappedMedia = mapMediaToLocalPaths(mediaRefs)
  
  // Create a map of URLs to media references for quick lookup
  const mediaMap = new Map<string, MediaReference>()
  mappedMedia.forEach((ref) => {
    mediaMap.set(ref.url, ref)
  })
  
  // Use cached JSDOM
  const JSDOM = await getJSDOM()
  const dom = new JSDOM(html)
  const doc = dom.window.document
  const body = doc.body
  
  const blocks: MigrationBlockContent = []
  
  // Simplified processing for tests - just handle the main cases
  body.querySelectorAll('p, figure, audio, img').forEach((element) => {
    const tagName = element.tagName.toLowerCase()
    
    switch (tagName) {
      case 'p':
        blocks.push({
          _type: 'block',
          _key: nanoid(),
          style: 'normal',
          children: [{
            _type: 'span',
            _key: nanoid(),
            text: element.textContent || '',
          }],
          markDefs: [],
        })
        break
        
      case 'figure':
        const audio = element.querySelector('audio')
        const img = element.querySelector('img')
        const figcaption = element.querySelector('figcaption')
        
        if (audio) {
          const src = audio.getAttribute('src')
          if (src) {
            const audioBlock: MigrationAudioBlock = {
              _type: 'audio',
              _key: nanoid(),
              url: src,
              localPath: mediaMap.get(src)?.localPath,
              audioFile: {
                _type: 'file',
              },
              showControls: audio.hasAttribute('controls'),
              autoplay: audio.hasAttribute('autoplay'),
              title: figcaption?.textContent?.trim(),
            }
            blocks.push(audioBlock)
          }
        } else if (img) {
          const src = img.getAttribute('src')
          if (src) {
            const imageBlock: MigrationImageBlock = {
              _type: 'image',
              _key: nanoid(),
              alt: img.getAttribute('alt') || '',
              url: src,
              localPath: mediaMap.get(src)?.localPath,
            }
            blocks.push(imageBlock)
          }
        }
        break
        
      case 'audio':
        const src = element.getAttribute('src')
        if (src) {
          const audioBlock: MigrationAudioBlock = {
            _type: 'audio',
            _key: nanoid(),
            url: src,
            localPath: mediaMap.get(src)?.localPath,
            audioFile: {
              _type: 'file',
            },
            showControls: element.hasAttribute('controls'),
            autoplay: element.hasAttribute('autoplay'),
          }
          blocks.push(audioBlock)
        }
        break
        
      case 'img':
        const imgSrc = element.getAttribute('src')
        if (imgSrc) {
          const imageBlock: MigrationImageBlock = {
            _type: 'image',
            _key: nanoid(),
            alt: element.getAttribute('alt') || '',
            url: imgSrc,
            localPath: mediaMap.get(imgSrc)?.localPath,
          }
          blocks.push(imageBlock)
        }
        break
    }
  })
  
  return { content: blocks, media: mappedMedia }
}