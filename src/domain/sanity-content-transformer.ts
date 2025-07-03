import type {
  WordPressPost,
  SanityPostContent,
  SanityPageContent,
  SanityContent,
  ExtendedBlockContent,
  MediaReference,
  MigrationBlockContent,
} from '../types/migration'
import { htmlToBlockContent } from '../utils/html-to-portable-text'
import { extractMediaFromContent, mapMediaToLocalPaths } from '../utils/media-processor'
import { nanoid } from 'nanoid'

// Simple HTML stripping helper
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

/**
 * Static utility class for transforming WordPress content to Sanity format.
 * This class encapsulates the transformation logic from WordPress content
 * to Sanity's content model, including media processing and content conversion.
 */
export class SanityContentTransformer {
  /**
   * Transforms any WordPress content into a Sanity post content value object.
   * This unified method handles both posts and pages when treating them as posts.
   */
  static async toSanityPost(wordpressContent: WordPressPost): Promise<SanityPostContent> {
    let content: MigrationBlockContent
    let media: MediaReference[]

    try {
      // Convert HTML to BlockContent and extract media
      const result = await htmlToBlockContent(wordpressContent.post_content)
      content = result.content
      media = result.media
    } catch (error) {
      console.error(
        `Failed to convert HTML for post "${wordpressContent.post_title}" (ID: ${wordpressContent.ID}):`,
        error,
      )
      // Return minimal content on error
      content = [
        {
          _type: 'block',
          _key: nanoid(),
          style: 'normal',
          children: [
            {
              _type: 'span',
              _key: nanoid(),
              text: wordpressContent.post_content
                ? stripHtml(wordpressContent.post_content).substring(0, 500) + '...'
                : 'Content conversion failed',
            },
          ],
          markDefs: [],
        },
      ]
      media = []
    }

    // Create a plain text version of the content for the body field
    const bodyText = this.extractPlainTextFromContent(content)

    // Generate excerpt if not provided
    let excerpt = wordpressContent.post_excerpt
    if (!excerpt && bodyText) {
      // Take first 150 characters of body text as excerpt
      const maxLength = 150
      excerpt =
        bodyText.length > maxLength ? bodyText.substring(0, maxLength).trim() + '...' : bodyText
    }

    return {
      _type: 'post',
      title: wordpressContent.post_title,
      slug: {
        _type: 'slug',
        current: wordpressContent.post_name,
        source: 'title',
      },
      content,
      excerpt: excerpt || undefined,
      coverImage: {
        _type: 'image',
        alt: `Cover image for ${wordpressContent.post_title}`,
        // Asset will be set later if a featured image is found
        asset: undefined,
      },
      date: wordpressContent.post_date,
      media,
      body: bodyText,
    }
  }

  /**
   * Transforms a WordPress page into a Sanity page content value object.
   * This method preserves the page structure without converting content.
   */
  static toSanityPage(wordpressPage: WordPressPost): SanityPageContent {
    // For pages, we only extract media references without converting content
    const mediaRefs = extractMediaFromContent(wordpressPage.post_content)
    const mappedMedia = mapMediaToLocalPaths(mediaRefs)

    return {
      _type: 'page',
      name: wordpressPage.post_title,
      slug: {
        _type: 'slug',
        current: wordpressPage.post_name,
        source: 'name',
      },
      heading: wordpressPage.post_title,
      subheading: wordpressPage.post_excerpt || undefined,
      media: mappedMedia,
    }
  }

  /**
   * Transforms WordPress content to either post or page format based on options.
   * This is the main entry point for content transformation.
   */
  static async transform(
    wordpressContent: WordPressPost,
    options?: { treatAsPost?: boolean },
  ): Promise<SanityContent> {
    const shouldTreatAsPost = wordpressContent.post_type === 'post' || options?.treatAsPost

    if (shouldTreatAsPost) {
      return this.toSanityPost(wordpressContent)
    } else {
      return this.toSanityPage(wordpressContent)
    }
  }

  /**
   * Creates a Sanity post content value object from raw data.
   * Useful for testing or when you already have processed data.
   */
  static fromData(data: {
    title: string
    slug: string
    content?: MigrationBlockContent
    excerpt?: string
    date?: string
    media?: MediaReference[]
    body?: string
  }): SanityPostContent {
    return {
      _type: 'post',
      title: data.title,
      slug: {
        _type: 'slug',
        current: data.slug,
        source: 'title',
      },
      content: data.content,
      excerpt: data.excerpt,
      coverImage: {
        _type: 'image',
        alt: `Cover image for ${data.title}`,
        asset: undefined,
      },
      date: data.date,
      media: data.media || [],
      body: data.body,
    }
  }

  /**
   * Extracts plain text from block content for the body field.
   * This is useful for search indexing and previews.
   */
  private static extractPlainTextFromContent(
    blocks?: MigrationBlockContent | ExtendedBlockContent,
  ): string {
    if (!blocks || blocks.length === 0) return ''

    return blocks
      .map((block) => {
        if (block._type === 'block' && block.children) {
          const text = block.children.map((child) => child.text || '').join('')
          // Add double line break after paragraphs and single after headings
          if (text) {
            return block.style === 'normal' || block.style === 'blockquote'
              ? text + '\n\n'
              : text + '\n'
          }
        }
        return ''
      })
      .join('')
      .trim()
  }

  /**
   * Gets a summary of media files in any content type.
   */
  static getMediaSummary(content: SanityContent): {
    total: number
    byType: Record<string, number>
    found: number
    missing: number
  } {
    const summary = {
      total: content.media.length,
      byType: {} as Record<string, number>,
      found: 0,
      missing: 0,
    }

    content.media.forEach((item) => {
      summary.byType[item.type] = (summary.byType[item.type] || 0) + 1
      if (item.found) {
        summary.found++
      } else {
        summary.missing++
      }
    })

    return summary
  }

  /**
   * Gets all media URLs that are missing (not found locally).
   */
  static getMissingMediaUrls(content: SanityContent): string[] {
    return content.media.filter((item) => !item.found).map((item) => item.url)
  }

  /**
   * Checks if content has any media references.
   */
  static hasMedia(content: SanityContent): boolean {
    return content.media.length > 0
  }

  /**
   * Gets the word count of the content.
   */
  static getWordCount(content: SanityContent): number {
    if (content._type === 'post') {
      const text =
        content.body || SanityContentTransformer.extractPlainTextFromContent(content.content)
      return text.split(/\s+/).filter((word: string) => word.length > 0).length
    }
    // Pages don't have body or content fields in our schema
    return 0
  }
}
