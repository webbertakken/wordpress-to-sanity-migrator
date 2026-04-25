import type { ExtendedBlockContent, MigrationBlockContent } from '../types/migration'

export function blockContentToHtml(
  blocks: ExtendedBlockContent | MigrationBlockContent | undefined,
): string {
  if (!blocks || !Array.isArray(blocks)) {
    return ''
  }

  return blocks
    .map((block) => {
      // Handle image blocks
      if (block._type === 'image') {
        // Type assertion to handle both migration and Sanity formats
        const imageBlock = block as {
          localPath?: string
          url?: string
          alt?: string
          caption?: string
          alignment?: 'left' | 'center' | 'right'
        }
        const src = imageBlock.localPath || imageBlock.url || ''
        const alt = imageBlock.alt || ''
        const caption = imageBlock.caption || ''
        const alignment = imageBlock.alignment

        if (src) {
          // If it's a local path, convert to API URL for preview
          const imageSrc = src.startsWith('input/')
            ? `/api/serve-media?path=${encodeURIComponent(src)}`
            : src

          // `data-align` is read by the preview's typography CSS to flow the
          // figure left/right or centre it. The default (no attribute) is the
          // surrounding block flow, matching WordPress's `alignnone`.
          const alignAttr = alignment ? ` data-align="${alignment}"` : ''
          const figcaption = caption ? `<figcaption>${caption}</figcaption>` : ''

          return `<figure${alignAttr}><img src="${imageSrc}" alt="${alt}" style="max-width: 100%; height: auto;" />${figcaption}</figure>`
        }
        return ''
      }

      // Handle divider blocks (`<hr>` semantic)
      if (block._type === 'divider') {
        return '<hr />'
      }

      // Handle video blocks. YouTube / Vimeo become a generic <iframe>
      // embed; self-hosted files use a <video> element pointed at the
      // local file (the local-path -> /api/serve-media rewrite is done by
      // the preview's processContentForPreview helper).
      if (block._type === 'video') {
        const videoBlock = block as {
          videoType?: 'youtube' | 'vimeo' | 'url'
          url?: string
          localPath?: string
          title?: string
          aspectRatio?: '16:9' | '4:3' | '1:1' | '9:16'
        }
        const title = videoBlock.title || ''
        const figcaption = title ? `<figcaption>${title}</figcaption>` : ''

        if (videoBlock.videoType === 'youtube' || videoBlock.videoType === 'vimeo') {
          const url = videoBlock.url || ''
          if (!url) return ''
          return `<figure class="video-block"><iframe src="${url}" loading="lazy" referrerpolicy="no-referrer" allowfullscreen></iframe>${figcaption}</figure>`
        }

        const src = videoBlock.localPath || videoBlock.url || ''
        if (!src) return ''
        const videoSrc = src.startsWith('input/')
          ? `/api/serve-media?path=${encodeURIComponent(src)}`
          : src
        return `<figure class="video-block"><video controls preload="metadata"><source src="${videoSrc}" /></video>${figcaption}</figure>`
      }

      // Handle generic embed blocks (iframes that are not YouTube/Vimeo)
      if (block._type === 'embed') {
        const embedBlock = block as { url?: string; caption?: string }
        const url = embedBlock.url || ''
        if (!url) return ''
        const caption = embedBlock.caption ? `<figcaption>${embedBlock.caption}</figcaption>` : ''
        return `<figure class="embed-block"><iframe src="${url}" loading="lazy" referrerpolicy="no-referrer"></iframe>${caption}</figure>`
      }

      // Handle audio blocks
      if (block._type === 'audio') {
        // Type assertion to handle both migration and Sanity formats
        const audioBlock = block as {
          localPath?: string
          url?: string
          title?: string
          autoplay?: boolean
        }
        const src = audioBlock.localPath || audioBlock.url || ''
        const title = audioBlock.title || ''

        if (src) {
          // If it's a local path, convert to API URL for preview
          const audioSrc = src.startsWith('input/')
            ? `/api/serve-media?path=${encodeURIComponent(src)}`
            : src

          return `<figure class="audio-block">
            <audio controls${audioBlock.autoplay ? ' autoplay' : ''}>
              <source src="${audioSrc}" type="audio/wav">
              <source src="${audioSrc}" type="audio/mpeg">
              Your browser does not support the audio element.
            </audio>
            ${title ? `<figcaption>${title}</figcaption>` : ''}
          </figure>`
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

            // Convert any literal newlines in the span text into <br /> tags.
            // Paragraph blocks should not contain newlines (every line break
            // becomes its own block during conversion), but other styles such
            // as headings, blockquotes and list items may legitimately carry
            // soft breaks that HTML would otherwise collapse to whitespace.
            let text = (child.text || '').replace(/\n/g, '<br />')

            // Apply marks (formatting)
            if (child.marks && child.marks.length > 0) {
              child.marks.forEach((mark: string) => {
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
