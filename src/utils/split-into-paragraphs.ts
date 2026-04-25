/**
 * Normalise raw HTML so every line break becomes its own paragraph.
 *
 * WordPress stores `post_content` without `<p>` tags around plain text.
 * Sentences are typically separated by `\r\n`, paragraphs by `\r\n\r\n`,
 * and authors sometimes use `<br />` for soft breaks. Portable Text is
 * cleaner when each visual line is its own paragraph block, so this
 * function unifies all of these into a single `<p>` per line.
 *
 * Behaviour:
 * - Block-level wrappers other than `<p>` (figure, blockquote, h1-h6,
 *   lists, tables, etc.) and media atoms (img, audio, video, iframe,
 *   embed comments, `<a>` wrapping only an `<img>`) are preserved
 *   verbatim and form block boundaries.
 * - In the loose text between block boundaries:
 *   - `<br />` tags are converted to newlines.
 *   - `<p>...</p>` wrappers are unwrapped (their content is re-emitted
 *     surrounded by paragraph breaks).
 *   - The remaining text is split on any run of newlines; each non-empty
 *     chunk becomes its own `<p>...</p>` block.
 *
 * Note: `<p>` is intentionally not in the preserved-block list — every
 * paragraph is rebuilt so that the output is uniform regardless of the
 * shape of the input.
 */

const PRESERVED_BLOCK_TAGS = [
  'address',
  'article',
  'aside',
  'audio',
  'blockquote',
  'dd',
  'details',
  'dialog',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'iframe',
  'main',
  'nav',
  'ol',
  'pre',
  'section',
  'table',
  'ul',
  'video',
].join('|')

interface BlockRange {
  start: number
  end: number
  content: string
}

// Patterns for HTML constructs that must be preserved verbatim. Order matters
// only insofar as later patterns are skipped if they overlap with an earlier
// match.
const PRESERVED_BLOCK_PATTERNS: RegExp[] = [
  // WordPress embed comment blocks
  /<!--\s*wp:embed[\s\S]*?-->[\s\S]*?<!--\s*\/wp:embed\s*-->/gi,
  // Any other HTML comment
  /<!--[\s\S]*?-->/g,
  // Block-level elements with their content
  new RegExp(`<(${PRESERVED_BLOCK_TAGS})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, 'gi'),
  // <a> wrapping nothing but a single <img> (common WP image-link pattern)
  /<a\b[^>]*>\s*<img\b[^>]*\/?>\s*<\/a>/gi,
  // Standalone media / void elements
  /<img\b[^>]*\/?>/gi,
  /<hr\b[^>]*\/?>/gi,
]

/**
 * Find non-overlapping ranges of preserved block-level / media atoms in
 * `text`, sorted by start position.
 */
function findPreservedRanges(text: string): BlockRange[] {
  const ranges: BlockRange[] = []

  for (const pattern of PRESERVED_BLOCK_PATTERNS) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index
      const end = start + match[0].length
      const overlaps = ranges.some((r) => !(end <= r.start || start >= r.end))
      if (!overlaps) {
        ranges.push({ start, end, content: match[0] })
      }
    }
  }

  ranges.sort((a, b) => a.start - b.start)
  return ranges
}

/**
 * Convert a region of loose text into one or more `<p>...</p>` blocks.
 * Every newline (single, double, or more) is treated as a paragraph break.
 */
function emitParagraphs(raw: string, out: string[]): void {
  // Treat each <br /> as a newline (paragraph break). Allow attributes
  // (e.g. `<br style="..." />`); WordPress posts often carry legacy
  // inline-style attributes on <br>.
  let text = raw.replace(/<br\b[^>]*\/?>/gi, '\n')
  // Unwrap any <p>...</p> wrappers — their content joins the loose text
  // surrounded by paragraph-break markers.
  text = text.replace(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi, '\n\n$1\n\n')
  // Drop any stray, unmatched <p> or </p> tags from broken markup.
  text = text.replace(/<\/?p\b[^>]*>/gi, '')

  for (const chunk of text.split(/\n+/)) {
    const trimmed = chunk.replace(/^\s+|\s+$/g, '')
    if (!trimmed) continue
    out.push(`<p>${trimmed}</p>`)
  }
}

/**
 * Split arbitrary HTML into a uniform sequence of `<p>` blocks and preserved
 * block-level atoms. Every line break in loose text becomes a paragraph
 * boundary.
 */
export function splitIntoParagraphs(html: string): string {
  if (!html) return ''

  // Normalise line endings so `\n` is the canonical break character.
  const text = html.replace(/\r\n?/g, '\n')
  if (!text.trim()) return ''

  const ranges = findPreservedRanges(text)

  const out: string[] = []
  let cursor = 0

  for (const range of ranges) {
    if (range.start > cursor) {
      emitParagraphs(text.substring(cursor, range.start), out)
    }
    out.push(range.content)
    cursor = range.end
  }
  if (cursor < text.length) {
    emitParagraphs(text.substring(cursor), out)
  }

  return out.join('\n')
}
