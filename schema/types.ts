/**
 * Canonical Sanity TypeScript types that the migrator targets.
 *
 * These are the shapes this migrator produces. Target studios should define
 * their schema to be compatible with these types — copy the schema source
 * files from `schema/sanity-studio/` into your studio's `schemaTypes`
 * directory to get a guaranteed-compatible setup.
 *
 * Keep this file in sync with `schema/sanity-studio/`. Any addition or
 * change here must be mirrored in the corresponding `defineType` /
 * `defineField` / `defineArrayMember` definitions and vice versa.
 */

// ---------------------------------------------------------------------------
// Common building blocks
// ---------------------------------------------------------------------------

export interface SanityReference {
  _ref: string
  _type: 'reference'
  _weak?: boolean
}

export interface Slug {
  _type: 'slug'
  current: string
  /**
   * Some Sanity TypeGen outputs include a `source` property on slug values
   * (carried over from the schema's `options.source`). Kept optional here
   * so migrator code that constructs slug values with a `source` continues
   * to type-check.
   */
  source?: string
}

/**
 * Subset of `@sanity/types`' `ImageHotspot` — sufficient for what the
 * migrator emits. Inlined to avoid coupling the canonical type surface to
 * the full `@sanity/types` API.
 */
export interface SanityImageHotspot {
  _type?: 'sanity.imageHotspot'
  x: number
  y: number
  height: number
  width: number
}

/**
 * Subset of `@sanity/types`' `ImageCrop`. Inlined for the same reason as
 * `SanityImageHotspot` above.
 */
export interface SanityImageCrop {
  _type?: 'sanity.imageCrop'
  top: number
  bottom: number
  left: number
  right: number
}

// ---------------------------------------------------------------------------
// Block content
// ---------------------------------------------------------------------------

/**
 * `link` annotation referenced from a span's `marks` by `_key`.
 */
export interface LinkMarkDef {
  _key: string
  _type: 'link'
  linkType?: 'href' | 'page' | 'post'
  href?: string
  page?: SanityReference
  post?: SanityReference
  openInNewTab?: boolean
}

export interface SpanChild {
  _key: string
  _type: 'span'
  text?: string
  marks?: string[]
}

/**
 * A text block — paragraph, heading, blockquote or list item.
 *
 * Default decorators (`strong`, `em`, `code`, `underline`, `strike-through`)
 * are produced by the migrator and expected to be valid in the target schema.
 */
export interface TextBlock {
  _key: string
  _type: 'block'
  style?: 'normal' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'blockquote'
  listItem?: 'bullet' | 'number'
  level?: number
  children?: SpanChild[]
  markDefs?: LinkMarkDef[]
}

/**
 * Inline image with optional caption and alignment.
 */
export interface ImageBlock {
  _key: string
  _type: 'image'
  asset?: SanityReference
  hotspot?: SanityImageHotspot
  crop?: SanityImageCrop
  alt?: string
  caption?: string
  alignment?: 'left' | 'center' | 'right'
  media?: unknown
}

/**
 * Inline audio asset with playback controls.
 */
export interface AudioBlock {
  _key: string
  _type: 'audio'
  audioFile: {
    _type: 'file'
    asset?: SanityReference
    media?: unknown
  }
  title?: string
  description?: string
  duration?: string
  showControls?: boolean
  autoplay?: boolean
}

/**
 * Inline video — either hosted on YouTube/Vimeo, or a direct URL.
 */
export interface VideoBlock {
  _key: string
  _type: 'video'
  videoType?: 'youtube' | 'vimeo' | 'url'
  url: string
  title?: string
  description?: string
  aspectRatio?: '16:9' | '4:3' | '1:1' | '9:16'
}

/**
 * A horizontal-rule-style separator. Has no fields — its presence is the
 * value. The renderer decides how to display it.
 */
export interface DividerBlock {
  _key: string
  _type: 'divider'
}

/**
 * Generic third-party embed — for iframes that are not covered by the more
 * specific `video` block (YouTube/Vimeo).
 */
export interface EmbedBlock {
  _key: string
  _type: 'embed'
  url: string
  caption?: string
}

export type BlockContent = Array<
  TextBlock | ImageBlock | AudioBlock | VideoBlock | DividerBlock | EmbedBlock
>

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

interface SystemFields {
  _id: string
  _createdAt: string
  _updatedAt: string
  _rev: string
}

export interface PostCoverImage {
  _type: 'image'
  asset?: SanityReference
  hotspot?: SanityImageHotspot
  crop?: SanityImageCrop
  alt?: string
  media?: unknown
}

export interface Post extends SystemFields {
  _type: 'post'
  title: string
  slug: Slug
  content?: BlockContent
  excerpt?: string
  coverImage: PostCoverImage
  date?: string
  author?: SanityReference
}

export interface Page extends SystemFields {
  _type: 'page'
  name: string
  slug: Slug
  heading: string
  subheading?: string
}
