/**
 * Convert known WordPress shortcodes into equivalent HTML.
 *
 * WordPress posts often contain inline shortcodes like `[caption]`, `[audio]`
 * and `[video]` that the WordPress renderer expands to HTML at render time.
 * The migrator's HTML pipeline does not understand shortcodes, so this
 * preprocessor expands them up-front to the equivalent HTML the rest of
 * the pipeline already knows how to extract.
 *
 * Supported:
 * - `[caption ...]inner-html caption-text[/caption]`  -> `<figure>…<figcaption>…</figcaption></figure>`
 * - `[audio src=… mp3=… wav=… …]`                    -> `<audio src="…" controls></audio>`
 * - `[video src=… mp4=… width=… height=… …]`         -> `<video src="…" controls></video>`
 * - `[ddownload id="N"]`                              -> `[Download #N]` text placeholder
 *
 * Unknown shortcodes are passed through unchanged so they remain visible
 * in the migration output for manual triage.
 */

interface ShortcodeAttributes {
  [key: string]: string
}

/**
 * Parse the attribute string of a shortcode (everything after the name and
 * before the closing `]`). Supports `key="value"`, `key='value'` and bare
 * `key=value` forms. Boolean attributes (`autoplay`) come back as empty
 * strings.
 */
function parseAttributes(raw: string): ShortcodeAttributes {
  const result: ShortcodeAttributes = {}
  const pattern = /([a-zA-Z_][\w-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+)))?/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(raw)) !== null) {
    const [, name, dq, sq, bare] = match
    result[name.toLowerCase()] = dq ?? sq ?? bare ?? ''
  }
  return result
}

/**
 * Convert `[caption ...]inner[/caption]` into a `<figure>` that the
 * existing image extractor handles, including the alignment class and a
 * `<figcaption>` containing the caption text.
 *
 * The caption text is whatever follows the inner element (typically an
 * `<img>` or `<a><img></a>`), trimmed of surrounding whitespace.
 */
function expandCaptionShortcodes(html: string): string {
  return html.replace(
    /\[caption([^\]]*)\]([\s\S]*?)\[\/caption\]/gi,
    (_match, attrString: string, inner: string) => {
      const attrs = parseAttributes(attrString)
      const align = attrs.align ?? 'alignnone'

      // Split the inner into the leading element(s) and the trailing caption
      // text. The trailing element of inner HTML is typically `</a>` or `/>`,
      // and everything after that is the caption text.
      const lastTagEnd = Math.max(inner.lastIndexOf('</a>'), inner.lastIndexOf('/>'))
      let element = inner
      let captionText = ''
      if (lastTagEnd !== -1) {
        const cut = lastTagEnd + (inner.lastIndexOf('</a>') === lastTagEnd ? '</a>'.length : 2)
        element = inner.slice(0, cut)
        captionText = inner.slice(cut).trim()
      }

      const figcaption = captionText ? `<figcaption>${captionText}</figcaption>` : ''
      return `<figure class="${align}">${element}${figcaption}</figure>`
    },
  )
}

/**
 * Convert `[audio attrs]` (or `[audio attrs]…[/audio]`) into a `<audio>`
 * element. WordPress's audio shortcode accepts `src`, `mp3`, `wav`,
 * `m4a`, `ogg`, `wma` and `flac` source attributes; the first one
 * present wins. The closing `[/audio]` tag, when present, is consumed
 * so it does not leak into the output as literal text.
 */
function expandAudioShortcodes(html: string): string {
  return html.replace(
    /\[audio([^\]]*)\](?:[\s\S]*?\[\/audio\])?/gi,
    (match, attrString: string) => {
      const attrs = parseAttributes(attrString)
      const src =
        attrs.src ?? attrs.mp3 ?? attrs.wav ?? attrs.m4a ?? attrs.ogg ?? attrs.wma ?? attrs.flac
      if (!src) return match
      const autoplay = 'autoplay' in attrs ? ' autoplay' : ''
      const loop = 'loop' in attrs ? ' loop' : ''
      return `<audio src="${src}" controls${autoplay}${loop}></audio>`
    },
  )
}

/**
 * Convert `[video attrs]` (or `[video attrs]…[/video]`) into a `<video>`
 * element. The closing `[/video]` tag, when present, is consumed so it
 * does not leak into the output as literal text.
 */
function expandVideoShortcodes(html: string): string {
  return html.replace(
    /\[video([^\]]*)\](?:[\s\S]*?\[\/video\])?/gi,
    (match, attrString: string) => {
      const attrs = parseAttributes(attrString)
      const src =
        attrs.src ?? attrs.mp4 ?? attrs.webm ?? attrs.ogv ?? attrs.m4v ?? attrs.flv ?? attrs.wmv
      if (!src) return match
      const dimensions = [
        attrs.width ? `width="${attrs.width}"` : '',
        attrs.height ? `height="${attrs.height}"` : '',
      ]
        .filter(Boolean)
        .join(' ')
      const dimensionsAttr = dimensions ? ` ${dimensions}` : ''
      return `<video src="${src}" controls${dimensionsAttr}></video>`
    },
  )
}

/**
 * Convert `[ddownload id="N"]` into a plain-text placeholder. Resolving
 * the actual download requires a WordPress database lookup that is out of
 * scope for the migrator; the placeholder is human-readable and easy to
 * grep for during manual cleanup in the target studio.
 */
function expandDownloadShortcodes(html: string): string {
  return html.replace(/\[ddownload([^\]]*)\]/gi, (match, attrString: string) => {
    const attrs = parseAttributes(attrString)
    if (!attrs.id) return match
    return `[Download #${attrs.id}]`
  })
}

/**
 * Expand every supported WordPress shortcode in the given HTML.
 */
export function expandWordPressShortcodes(html: string): string {
  if (!html) return ''
  let out = html
  // Order matters when shortcodes nest: [caption] wraps an img + text, so
  // expand it first; the others are leaf shortcodes and the order between
  // them is irrelevant.
  out = expandCaptionShortcodes(out)
  out = expandAudioShortcodes(out)
  out = expandVideoShortcodes(out)
  out = expandDownloadShortcodes(out)
  return out
}
