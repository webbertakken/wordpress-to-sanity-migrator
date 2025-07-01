import type { Post, Page } from '../../input/sanity.types'

export interface MediaReference {
  url: string
  localPath: string
  type: 'image' | 'audio' | 'video'
  found: boolean
}

export interface WordPressPost {
  ID: number
  post_title: string
  post_content: string
  post_excerpt: string
  post_date: string
  post_modified: string
  post_status: string
  post_name: string
  post_type: 'post' | 'page'
  post_parent: number
  menu_order: number
  guid: string
}

export interface SanityImage {
  _type: 'image'
  asset?: {
    _ref: string
    _type: 'reference'
  }
  alt?: string
}

// Extended BlockContent that includes image blocks
export type ExtendedBlockContent = Array<
  | {
      children?: Array<{
        marks?: Array<string>
        text?: string
        _type: 'span'
        _key: string
      }>
      style?: 'normal' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'blockquote'
      listItem?: 'bullet' | 'number'
      markDefs?: Array<{
        linkType?: 'href' | 'page' | 'post'
        href?: string
        page?: {
          _ref: string
          _type: 'reference'
          _weak?: boolean
        }
        post?: {
          _ref: string
          _type: 'reference'
          _weak?: boolean
        }
        openInNewTab?: boolean
        _type: 'link'
        _key: string
      }>
      level?: number
      _type: 'block'
      _key: string
    }
  | {
      _type: 'image'
      _key: string
      asset?: {
        _ref: string
        _type: 'reference'
      }
      alt?: string
      url?: string
      localPath?: string
    }
>

export interface SanityPostContent
  extends Omit<Post, '_id' | '_type' | '_createdAt' | '_updatedAt' | '_rev' | 'content'> {
  _type: 'post'
  content?: ExtendedBlockContent
  media: MediaReference[]
}

export interface SanityPageContent
  extends Omit<Page, '_id' | '_type' | '_createdAt' | '_updatedAt' | '_rev'> {
  _type: 'page'
  media: MediaReference[]
}

export type SanityContent = SanityPostContent | SanityPageContent

export interface MigrationRecord {
  original: WordPressPost
  transformed: SanityContent
}

export interface MigrationStep {
  title: string
  description: string
  link?: string
}
