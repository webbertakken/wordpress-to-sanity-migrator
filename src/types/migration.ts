import type { Post, Page, BlockContent } from '../../input/sanity.types'

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

// Extended BlockContent that matches Sanity's BlockContent type exactly
// This includes all media types (image, audio, video) that are part of the Sanity schema
export type ExtendedBlockContent = BlockContent

// Types for migration that extend the actual Sanity schema types
// We omit the system fields that are added by Sanity at creation time
export interface SanityPostContent
  extends Omit<Post, '_id' | '_createdAt' | '_updatedAt' | '_rev' | 'content' | 'author'> {
  content?: ExtendedBlockContent
  media: MediaReference[]
  // Additional fields for migration purposes
  body?: string
}

export interface SanityPageContent
  extends Omit<Page, '_id' | '_createdAt' | '_updatedAt' | '_rev' | 'pageBuilder'> {
  media: MediaReference[]
}

export type SanityContent = SanityPostContent | SanityPageContent

// Helper type guards
export function isSanityPost(content: SanityContent): content is SanityPostContent {
  return content._type === 'post'
}

export function isSanityPage(content: SanityContent): content is SanityPageContent {
  return content._type === 'page'
}

// Helper to get title from either post or page
export function getContentTitle(content: SanityContent): string {
  if (isSanityPost(content)) {
    return content.title || ''
  }
  return content.name || ''
}

export interface MigrationRecord {
  original: WordPressPost
  transformed: SanityContent
}

export interface MigrationStep {
  title: string
  description: string
  link?: string
}

export interface MigrationOptions {
  parsePagesAsPosts?: boolean
}
