// Test-specific types that allow partial media blocks for testing purposes
import type { BlockContent } from '@/../input/sanity.types'

// Allow both Sanity BlockContent and test-specific partial blocks
export type TestBlockContent =
  | BlockContent
  | Array<
      | {
          _type: 'block'
          _key: string
          style?: 'normal' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'blockquote'
          children?: Array<{
            _type: 'span'
            _key: string
            text?: string
            marks?: string[]
          }>
          markDefs?: Array<{
            _key: string
            _type: string
            [key: string]: unknown
          }>
          listItem?: 'bullet' | 'number'
          level?: number
        }
      | {
          _type: 'image'
          _key: string
          alt?: string
          url?: string
          localPath?: string
          [key: string]: unknown
        }
      | {
          _type: 'audio'
          _key: string
          url?: string
          localPath?: string
          showControls?: boolean
          autoplay?: boolean
          title?: string
          [key: string]: unknown
        }
      | {
          _type: 'video'
          _key: string
          videoType?: 'youtube' | 'vimeo' | 'url'
          url?: string
          [key: string]: unknown
        }
    >
