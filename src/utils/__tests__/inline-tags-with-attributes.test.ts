import { describe, it, expect } from 'vitest'
import { parseInlineHTML } from '../parse-inline-html'
import { splitIntoParagraphs } from '../split-into-paragraphs'
import { htmlToBlockContent } from '../html-to-portable-text'
import type { MigrationBlockContent, MigrationTextBlock } from '../../types/migration'

const asTextBlock = (block: MigrationBlockContent[number]): MigrationTextBlock => {
  if (block._type !== 'block') {
    throw new Error(`expected text block, got '${block._type}'`)
  }
  return block
}

/**
 * WordPress posts frequently apply inline `style` attributes to short
 * tags like `<b>`, `<i>`, `<u>` and `<br>` — usually for legacy colour
 * overrides such as `style="color: #000000;"`. The older predicates used
 * a literal `<b>` startsWith check and a strict `<br>` regex; both
 * silently dropped the formatting whenever any attribute was present.
 * These tests pin the attribute-tolerant behaviour.
 */
describe('inline tags with attributes', () => {
  describe('parseInlineHTML', () => {
    it('treats <b style="..."> the same as <b>', () => {
      const result = parseInlineHTML('Plain <b style="color:#000">bold</b> tail.')
      const bold = result.children.find((c) => c.text === 'bold')
      expect(bold?.marks).toEqual(['strong'])
    })

    it('treats <i style="..."> the same as <i>', () => {
      const result = parseInlineHTML('Plain <i style="color:#000">italic</i> tail.')
      const italic = result.children.find((c) => c.text === 'italic')
      expect(italic?.marks).toEqual(['em'])
    })

    it('treats <u style="..."> the same as <u>', () => {
      const result = parseInlineHTML('Plain <u style="color:#000">under</u> tail.')
      const under = result.children.find((c) => c.text === 'under')
      expect(under?.marks).toEqual(['underline'])
    })

    it('treats <s style="...">, <strike ...>, <del ...> as strike-through', () => {
      for (const wrap of [
        '<s style="color:#000">x</s>',
        '<strike style="color:#000">x</strike>',
        '<del style="color:#000">x</del>',
      ]) {
        const { children } = parseInlineHTML(`a ${wrap} b`)
        const x = children.find((c) => c.text === 'x')
        expect(x?.marks).toEqual(['strike-through'])
      }
    })

    it('treats <br style="..." /> as a soft line break', () => {
      const result = parseInlineHTML('Line one<br style="color:#000" />Line two')
      // <br> becomes a literal newline in the span text.
      expect(result.children[0].text).toBe('Line one\nLine two')
    })

    it('combines nested formatting on attribute-laden tags', () => {
      const result = parseInlineHTML('<b style="color:#000"><i>Hoofdwerk:</i></b>')
      const span = result.children.find((c) => c.text === 'Hoofdwerk:')
      expect(span?.marks).toEqual(expect.arrayContaining(['strong', 'em']))
    })
  })

  describe('splitIntoParagraphs', () => {
    it('splits on <br style="..." /> the same as on <br />', () => {
      const html = 'A<br style="color:#000" />B<br/>C'
      expect(splitIntoParagraphs(html)).toBe('<p>A</p>\n<p>B</p>\n<p>C</p>')
    })
  })

  describe('end-to-end (real-world example)', () => {
    it('preserves bold, italic and line breaks across an attribute-heavy organ disposition', async () => {
      const html =
        '<i style="color: #000000;">Dispositie</i>' +
        '<br style="color: #000000;" />' +
        '<b style="color: #000000;"><i>Hoofdwerk:</i></b>' +
        '<span style="color: #000000;"> Prestant 8\'.</span>' +
        '<br style="color: #000000;" />' +
        '<b style="color: #000000;"><i>Pedaal:</i></b>' +
        '<span style="color: #000000;"> Subbas 16\'.</span>'

      const { content } = await htmlToBlockContent(html)

      // Three paragraphs, separated by the <br>s.
      expect(content).toHaveLength(3)

      const para1 = asTextBlock(content[0])
      expect(para1.children?.find((c) => c.text === 'Dispositie')?.marks).toEqual(['em'])

      const para2 = asTextBlock(content[1])
      const hoofdwerk = para2.children?.find((c) => c.text === 'Hoofdwerk:')
      expect(hoofdwerk?.marks).toEqual(expect.arrayContaining(['strong', 'em']))

      const para3 = asTextBlock(content[2])
      const pedaal = para3.children?.find((c) => c.text === 'Pedaal:')
      expect(pedaal?.marks).toEqual(expect.arrayContaining(['strong', 'em']))
    })
  })
})
