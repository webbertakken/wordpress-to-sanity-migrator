// Server-side only utility for converting HTML to Portable Text
import { BlockContent } from '../../input/sanity.types'
import { nanoid } from 'nanoid'
import type { JSDOM as JSDOMType } from 'jsdom'

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

export async function htmlToBlockContent(html: string): Promise<BlockContent> {
  // Dynamic import for server-side only
  const jsdomModule = await import('jsdom')
  const JSDOM = jsdomModule.JSDOM as typeof JSDOMType
  const dom = new JSDOM(html)
  const doc = dom.window.document
  const body = doc.body
  
  const blocks: Block[] = []
  let currentListLevel = 0
  let currentListType: 'bullet' | 'number' | null = null
  
  function processNode(node: Node): void {
    if (node.nodeType === dom.window.Node.TEXT_NODE) {
      const text = node.textContent?.trim()
      if (text && blocks.length > 0) {
        const lastBlock = blocks[blocks.length - 1]
        if (lastBlock.children) {
          lastBlock.children.push({
            _type: 'span',
            _key: nanoid(),
            text
          })
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
            markDefs: []
          }
          blocks.push(block)
          processChildren(element, block)
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
            markDefs: []
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
            markDefs: []
          }
          blocks.push(quoteBlock)
          processChildren(element, quoteBlock)
          break
          
        case 'ul':
        case 'ol':
          currentListType = tagName === 'ul' ? 'bullet' : 'number'
          currentListLevel++
          Array.from(element.children).forEach(child => processNode(child))
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
              level: currentListLevel
            }
            blocks.push(listBlock)
            processChildren(element, listBlock)
          }
          break
          
        case 'br':
          // Handle line breaks by adding a new block
          if (blocks.length > 0) {
            const newBlock: Block = {
              _type: 'block',
              _key: nanoid(),
              style: 'normal',
              children: [{
                _type: 'span',
                _key: nanoid(),
                text: ''
              }],
              markDefs: []
            }
            blocks.push(newBlock)
          }
          break
          
        default:
          // For other elements, process their children
          Array.from(element.childNodes).forEach(child => processNode(child))
      }
    }
  }
  
  function processChildren(element: Element, block: Block): void {
    Array.from(element.childNodes).forEach(child => {
      if (child.nodeType === dom.window.Node.TEXT_NODE) {
        const text = child.textContent || ''
        if (text) {
          block.children?.push({
            _type: 'span',
            _key: nanoid(),
            text
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
              marks: ['strong']
            }
            block.children?.push(strongSpan)
            break
            
          case 'em':
          case 'i':
            const emSpan: BlockChild = {
              _type: 'span',
              _key: nanoid(),
              text: childElement.textContent || '',
              marks: ['em']
            }
            block.children?.push(emSpan)
            break
            
          case 'u':
            const underlineSpan: BlockChild = {
              _type: 'span',
              _key: nanoid(),
              text: childElement.textContent || '',
              marks: ['underline']
            }
            block.children?.push(underlineSpan)
            break
            
          case 'code':
            const codeSpan: BlockChild = {
              _type: 'span',
              _key: nanoid(),
              text: childElement.textContent || '',
              marks: ['code']
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
              marks: [linkKey]
            }
            block.children?.push(linkSpan)
            
            if (href && block.markDefs) {
              block.markDefs.push({
                _key: linkKey,
                _type: 'link',
                href,
                linkType: 'href',
                openInNewTab: childElement.getAttribute('target') === '_blank'
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
                text
              })
            }
        }
      }
    })
  }
  
  // Process all child nodes of the body
  Array.from(body.childNodes).forEach(node => processNode(node))
  
  // If no blocks were created, create at least one with the text content
  if (blocks.length === 0 && body.textContent?.trim()) {
    blocks.push({
      _type: 'block',
      _key: nanoid(),
      style: 'normal',
      children: [{
        _type: 'span',
        _key: nanoid(),
        text: body.textContent.trim()
      }],
      markDefs: []
    })
  }
  
  return blocks
}