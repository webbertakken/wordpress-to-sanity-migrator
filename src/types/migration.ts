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

export interface SanityContent {
  title: string
  slug: string
  publishedAt: string
  body: string
  excerpt: string
  media: MediaReference[]
  contentType: 'post' | 'page'
  parentId?: number
  menuOrder?: number
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
