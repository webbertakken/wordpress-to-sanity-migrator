import type { ExtendedBlockContent } from '../types/migration'

export function blockContentToHtml(blocks: ExtendedBlockContent | undefined): string {
  if (!blocks || !Array.isArray(blocks)) {
    return ''
  }

  return blocks
    .map((block) => {
      // Handle image blocks
      if (block._type === 'image') {
        const imageBlock = block as Extract<ExtendedBlockContent[number], { _type: 'image' }>
        const src = imageBlock.localPath || imageBlock.url || ''
        const alt = imageBlock.alt || ''

        if (src) {
          // If it's a local path, convert to API URL for preview
          const imageSrc = src.startsWith('input/')
            ? `/api/serve-media?path=${encodeURIComponent(src)}`
            : src

          return `<figure><img src="${imageSrc}" alt="${alt}" style="max-width: 100%; height: auto;" /></figure>`
        }
        return ''
      }

      if (block._type !== 'block') {
        return ''
      }

      const style = block.style || 'normal'
      const listItem = block.listItem

      // Process children to create inline content
      const inlineContent =
        block.children
          ?.map((child) => {
            if (child._type !== 'span') return ''

            let text = child.text || ''

            // Apply marks (formatting)
            if (child.marks && child.marks.length > 0) {
              child.marks.forEach((mark) => {
                // Check if it's a reference to a markDef
                const markDef = block.markDefs?.find((def) => def._key === mark)
                if (markDef && markDef._type === 'link') {
                  text = `<a href="${markDef.href || '#'}"${markDef.openInNewTab ? ' target="_blank"' : ''}>${text}</a>`
                } else {
                  // Standard marks
                  switch (mark) {
                    case 'strong':
                      text = `<strong>${text}</strong>`
                      break
                    case 'em':
                      text = `<em>${text}</em>`
                      break
                    case 'underline':
                      text = `<u>${text}</u>`
                      break
                    case 'code':
                      text = `<code>${text}</code>`
                      break
                  }
                }
              })
            }

            return text
          })
          .join('') || ''

      // Wrap in appropriate block element
      if (listItem) {
        // For list items, we'll need to handle them specially
        // This is a simplified version - in a real implementation,
        // you'd need to group consecutive list items
        const listTag = listItem === 'bullet' ? 'ul' : 'ol'
        return `<${listTag}><li>${inlineContent}</li></${listTag}>`
      }

      switch (style) {
        case 'h1':
          return `<h1>${inlineContent}</h1>`
        case 'h2':
          return `<h2>${inlineContent}</h2>`
        case 'h3':
          return `<h3>${inlineContent}</h3>`
        case 'h4':
          return `<h4>${inlineContent}</h4>`
        case 'h5':
          return `<h5>${inlineContent}</h5>`
        case 'h6':
          return `<h6>${inlineContent}</h6>`
        case 'blockquote':
          return `<blockquote>${inlineContent}</blockquote>`
        case 'normal':
        default:
          return `<p>${inlineContent}</p>`
      }
    })
    .join('\n')
}

export function getTextFromBlockContent(blocks: ExtendedBlockContent | undefined): string {
  if (!blocks || !Array.isArray(blocks)) {
    return ''
  }

  return blocks
    .map((block) => {
      // Skip image blocks for text extraction
      if (block._type === 'image') {
        return ''
      }

      if (block._type !== 'block' || !block.children) {
        return ''
      }

      return block.children
        .map((child) => {
          if (child._type === 'span') {
            return child.text || ''
          }
          return ''
        })
        .join('')
    })
    .filter((text) => text.length > 0) // Remove empty strings to avoid extra spaces
    .join(' ')
}
