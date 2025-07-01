import type { Post, Page, BlockContent, Slug } from '../../input/sanity.types'

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

export interface SanityPostContent extends Omit<Post, '_id' | '_type' | '_createdAt' | '_updatedAt' | '_rev'> {
  _type: 'post'
  media: MediaReference[]
}

export interface SanityPageContent extends Omit<Page, '_id' | '_type' | '_createdAt' | '_updatedAt' | '_rev'> {
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
