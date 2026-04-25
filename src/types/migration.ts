import type { Post, Page, BlockContent } from '../../schema/types'

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

// Intermediate types used during migration that include temporary properties
// These are used during the conversion process but stripped before final import
export interface MigrationImageBlock {
  _type: 'image'
  _key: string
  alt?: string
  url: string // Temporary: original URL from WordPress
  localPath?: string // Temporary: local file path after download
  caption?: string
  alignment?: 'left' | 'center' | 'right'
  // These will be added during import:
  // asset?: { _ref: string; _type: 'reference' }
  // hotspot?: SanityImageHotspot
  // crop?: SanityImageCrop
}

/**
 * Plain horizontal-rule-style separator. Has no fields — its presence in the
 * block content is the value. Renderers decide how to display it.
 */
export interface MigrationDividerBlock {
  _type: 'divider'
  _key: string
}

/**
 * Generic third-party embed (URL + optional caption). Used for iframes that
 * are not covered by the more specific video block (YouTube/Vimeo).
 */
export interface MigrationEmbedBlock {
  _type: 'embed'
  _key: string
  url: string
  caption?: string
}

export interface MigrationAudioBlock {
  _type: 'audio'
  _key: string
  url: string // Temporary: original URL from WordPress
  localPath?: string // Temporary: local file path after download
  audioFile: {
    _type: 'file'
    // asset will be added during import
  }
  title?: string
  description?: string
  duration?: string
  showControls?: boolean
  autoplay?: boolean
}

export interface MigrationVideoBlock {
  _type: 'video'
  _key: string
  videoType: 'youtube' | 'vimeo' | 'url'
  url?: string // For YouTube/Vimeo: the embed URL. For self-hosted: original WP URL (stripped on import)
  localPath?: string // Temporary: local file path for self-hosted files (videoType === 'url')
  // For self-hosted files (videoType === 'url'), `videoFile.asset` is filled
  // in during import-to-sanity once the file has been uploaded.
  videoFile?: {
    _type: 'file'
  }
  title?: string
  description?: string
  aspectRatio?: '16:9' | '4:3' | '1:1' | '9:16'
}

// Block type from Sanity schema
export interface MigrationTextBlock {
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
    _type: 'link'
    href?: string
    linkType?: 'href' | 'page' | 'post'
    openInNewTab?: boolean
  }>
  listItem?: 'bullet' | 'number'
  level?: number
}

// Migration-specific block content that includes temporary properties
export type MigrationBlockContent = Array<
  | MigrationTextBlock
  | MigrationImageBlock
  | MigrationAudioBlock
  | MigrationVideoBlock
  | MigrationDividerBlock
  | MigrationEmbedBlock
>

// Types for migration that extend the actual Sanity schema types
// We omit the system fields that are added by Sanity at creation time
export interface SanityPostContent
  extends Omit<Post, '_id' | '_createdAt' | '_updatedAt' | '_rev' | 'content' | 'author'> {
  content?: MigrationBlockContent // Use migration-specific type during transformation
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
