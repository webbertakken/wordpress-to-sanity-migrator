// Server-side only utility for converting HTML to Portable Text
import { nanoid } from 'nanoid'
import type { JSDOM as JSDOMType } from 'jsdom'
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

  // Dynamic import for server-side only
  const jsdomModule = await import('jsdom')
  const JSDOM = jsdomModule.JSDOM as typeof JSDOMType
  const dom = new JSDOM(html)
  const doc = dom.window.document
  const body = doc.body

  const blocks: ExtendedBlockContent = []
  let currentListLevel = 0
  let currentListType: 'bullet' | 'number' | null = null

  function processNode(node: Node): void {
    if (node.nodeType === dom.window.Node.TEXT_NODE) {
      const text = node.textContent?.trim()
      if (text) {
        // Check if we have a current block to add to
        const lastBlock = blocks.length > 0 ? blocks[blocks.length - 1] : null

        if (lastBlock && lastBlock._type === 'block' && lastBlock.children) {
          // Add to existing block
          lastBlock.children.push({
            _type: 'span',
            _key: nanoid(),
            text,
          })
        } else {
          // Create a new paragraph block for loose text
          const newBlock: Block = {
            _type: 'block',
            _key: nanoid(),
            style: 'normal',
            children: [
              {
                _type: 'span',
                _key: nanoid(),
                text,
              },
            ],
            markDefs: [],
          }
          blocks.push(newBlock)
        }
      }
      return
    }

    if (node.nodeType === dom.window.Node.ELEMENT_NODE) {
      const element = node as Element
      const tagName = element.tagName.toLowerCase()

      switch (tagName) {
        case 'p':
          const block: Block = {
            _type: 'block',
            _key: nanoid(),
            style: 'normal',
            children: [],
            markDefs: [],
          }
          blocks.push(block)
          processChildren(element, block)

          // If paragraph is empty or only contains &nbsp;, treat as spacing
          if (
            block.children &&
            (block.children.length === 0 ||
              (block.children.length === 1 &&
                (!block.children[0]?.text ||
                  block.children[0].text.trim() === '' ||
                  block.children[0].text === '\u00A0')))
          ) {
            // Ensure empty paragraph has at least one empty span for spacing
            block.children = [
              {
                _type: 'span',
                _key: nanoid(),
                text: '',
              },
            ]
          }
          break

        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
          const headerBlock: Block = {
            _type: 'block',
            _key: nanoid(),
            style: tagName as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6',
            children: [],
            markDefs: [],
          }
          blocks.push(headerBlock)
          processChildren(element, headerBlock)
          break

        case 'blockquote':
          const quoteBlock: Block = {
            _type: 'block',
            _key: nanoid(),
            style: 'blockquote',
            children: [],
            markDefs: [],
          }
          blocks.push(quoteBlock)
          processChildren(element, quoteBlock)
          break

        case 'ul':
        case 'ol':
          currentListType = tagName === 'ul' ? 'bullet' : 'number'
          currentListLevel++
          Array.from(element.children).forEach((child) => processNode(child))
          currentListLevel--
          if (currentListLevel === 0) {
            currentListType = null
          }
          break

        case 'li':
          if (currentListType) {
            const listBlock: Block = {
              _type: 'block',
              _key: nanoid(),
              style: 'normal',
              children: [],
              markDefs: [],
              listItem: currentListType,
              level: currentListLevel,
            }
            blocks.push(listBlock)
            processChildren(element, listBlock)
          }
          break

        case 'br':
          // Handle line breaks - create empty paragraph for spacing
          const brBlock: Block = {
            _type: 'block',
            _key: nanoid(),
            style: 'normal',
            children: [
              {
                _type: 'span',
                _key: nanoid(),
                text: '',
              },
            ],
            markDefs: [],
          }
          blocks.push(brBlock)
          break

        case 'div':
          // Handle div elements - check if they contain block content or should be treated as paragraphs
          const hasBlockChildren = Array.from(element.children).some((child) => {
            const tag = child.tagName?.toLowerCase()
            return [
              'p',
              'h1',
              'h2',
              'h3',
              'h4',
              'h5',
              'h6',
              'blockquote',
              'ul',
              'ol',
              'li',
              'div',
            ].includes(tag)
          })

          if (hasBlockChildren) {
            // Contains block elements, process children as separate blocks
            Array.from(element.childNodes).forEach((child) => processNode(child))
          } else {
            // Treat as a paragraph
            const divBlock: Block = {
              _type: 'block',
              _key: nanoid(),
              style: 'normal',
              children: [],
              markDefs: [],
            }
            blocks.push(divBlock)
            processChildren(element, divBlock)
          }
          break

        case 'img':
          // Handle images as separate blocks
          const src = element.getAttribute('src')
          const alt = element.getAttribute('alt')

          if (src) {
            const mediaRef = mediaMap.get(src)

            // Create image block
            const imageBlock = {
              _type: 'image' as const,
              _key: nanoid(),
              alt: alt || '',
              // Store both URL and local path for later processing
              url: src,
              localPath: mediaRef?.localPath,
            }

            blocks.push(imageBlock)
          }
          break

        case 'figure':
          // Handle figure elements (often contain images with captions)
          const img = element.querySelector('img')
          if (img) {
            const imgSrc = img.getAttribute('src')
            const imgAlt = img.getAttribute('alt')

            if (imgSrc) {
              const mediaRef = mediaMap.get(imgSrc)

              // Create image block
              const imageBlock = {
                _type: 'image' as const,
                _key: nanoid(),
                alt: imgAlt || '',
                url: imgSrc,
                localPath: mediaRef?.localPath,
              }

              blocks.push(imageBlock)
            }

            // Handle figcaption if present
            const figcaption = element.querySelector('figcaption')
            if (figcaption && figcaption.textContent?.trim()) {
              const captionBlock: Block = {
                _type: 'block',
                _key: nanoid(),
                style: 'normal',
                children: [
                  {
                    _type: 'span',
                    _key: nanoid(),
                    text: figcaption.textContent.trim(),
                    marks: ['em'], // Make captions italic
                  },
                ],
                markDefs: [],
              }
              blocks.push(captionBlock)
            }
          } else {
            // Process other content in figure
            Array.from(element.childNodes).forEach((child) => processNode(child))
          }
          break

        default:
          // For other inline/unknown elements, create a block if we don't have one
          // and process their content
          const hasTextContent = element.textContent?.trim()
          if (hasTextContent) {
            // Check if this is likely an inline element (contains text but no block children)
            const hasBlockChildren = Array.from(element.children).some((child) => {
              const tag = child.tagName?.toLowerCase()
              return [
                'div',
                'p',
                'h1',
                'h2',
                'h3',
                'h4',
                'h5',
                'h6',
                'blockquote',
                'ul',
                'ol',
                'li',
              ].includes(tag)
            })

            if (!hasBlockChildren) {
              // This seems to be inline content, create a paragraph block
              const inlineBlock: Block = {
                _type: 'block',
                _key: nanoid(),
                style: 'normal',
                children: [],
                markDefs: [],
              }
              blocks.push(inlineBlock)
              processChildren(element, inlineBlock)
            } else {
              // Has block children, process them normally
              Array.from(element.childNodes).forEach((child) => processNode(child))
            }
          } else {
            // No text content, just process children
            Array.from(element.childNodes).forEach((child) => processNode(child))
          }
      }
    }
  }

  function processChildren(element: Element, block: Block): void {
    Array.from(element.childNodes).forEach((child) => {
      if (child.nodeType === dom.window.Node.TEXT_NODE) {
        const text = child.textContent || ''
        if (text) {
          block.children?.push({
            _type: 'span',
            _key: nanoid(),
            text,
          })
        }
      } else if (child.nodeType === dom.window.Node.ELEMENT_NODE) {
        const childElement = child as Element
        const tagName = childElement.tagName.toLowerCase()

        switch (tagName) {
          case 'strong':
          case 'b':
            const strongSpan: BlockChild = {
              _type: 'span',
              _key: nanoid(),
              text: childElement.textContent || '',
              marks: ['strong'],
            }
            block.children?.push(strongSpan)
            break

          case 'em':
          case 'i':
            const emSpan: BlockChild = {
              _type: 'span',
              _key: nanoid(),
              text: childElement.textContent || '',
              marks: ['em'],
            }
            block.children?.push(emSpan)
            break

          case 'u':
            const underlineSpan: BlockChild = {
              _type: 'span',
              _key: nanoid(),
              text: childElement.textContent || '',
              marks: ['underline'],
            }
            block.children?.push(underlineSpan)
            break

          case 'code':
            const codeSpan: BlockChild = {
              _type: 'span',
              _key: nanoid(),
              text: childElement.textContent || '',
              marks: ['code'],
            }
            block.children?.push(codeSpan)
            break

          case 'a':
            const href = childElement.getAttribute('href')
            const linkKey = nanoid()
            const linkSpan: BlockChild = {
              _type: 'span',
              _key: nanoid(),
              text: childElement.textContent || '',
              marks: [linkKey],
            }
            block.children?.push(linkSpan)

            if (href && block.markDefs) {
              block.markDefs.push({
                _key: linkKey,
                _type: 'link',
                href,
                linkType: 'href',
                openInNewTab: childElement.getAttribute('target') === '_blank',
              })
            }
            break

          default:
            // For other inline elements, just get their text
            const text = childElement.textContent || ''
            if (text) {
              block.children?.push({
                _type: 'span',
                _key: nanoid(),
                text,
              })
            }
        }
      }
    })
  }

  // Process all child nodes of the body
  Array.from(body.childNodes).forEach((node) => processNode(node))

  // If no blocks were created, create at least one with the text content
  if (blocks.length === 0 && body.textContent?.trim()) {
    blocks.push({
      _type: 'block',
      _key: nanoid(),
      style: 'normal',
      children: [
        {
          _type: 'span',
          _key: nanoid(),
          text: body.textContent.trim(),
        },
      ],
      markDefs: [],
    })
  }

  // Clean up only truly empty blocks (no children at all)
  // Keep blocks with empty text as they represent intentional spacing
  const cleanedBlocks = blocks.filter((block) => {
    if (block._type === 'image') {
      return true // Keep all image blocks
    }
    if (block._type === 'block') {
      // Keep blocks that have children, even if the text is empty (for spacing)
      return block.children && block.children.length > 0
    }
    return true
  })

  return { content: cleanedBlocks, media: mappedMedia }
}
