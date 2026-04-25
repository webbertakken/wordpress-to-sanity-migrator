import { defineField, defineType } from 'sanity'

/**
 * `link` annotation — used inside `block` types to hyperlink spans.
 *
 * Supports three link kinds:
 * - `href`  — external URL
 * - `page`  — internal reference to a `page` document
 * - `post`  — internal reference to a `post` document
 */
export const link = defineType({
  name: 'link',
  title: 'Link',
  type: 'object',
  fields: [
    defineField({
      name: 'linkType',
      title: 'Link type',
      type: 'string',
      initialValue: 'href',
      options: {
        list: [
          { title: 'URL', value: 'href' },
          { title: 'Page', value: 'page' },
          { title: 'Post', value: 'post' },
        ],
        layout: 'radio',
      },
    }),
    defineField({
      name: 'href',
      title: 'URL',
      type: 'url',
      hidden: ({ parent }) => parent?.linkType !== 'href' && parent?.linkType != null,
      validation: (rule) =>
        rule.custom((value, context) => {
          const parent = context.parent as { linkType?: string } | undefined
          if (parent?.linkType === 'href' && !value) {
            return 'URL is required when link type is URL'
          }
          return true
        }),
    }),
    defineField({
      name: 'page',
      title: 'Page',
      type: 'reference',
      to: [{ type: 'page' }],
      hidden: ({ parent }) => parent?.linkType !== 'page',
      validation: (rule) =>
        rule.custom((value, context) => {
          const parent = context.parent as { linkType?: string } | undefined
          if (parent?.linkType === 'page' && !value) {
            return 'Page reference is required when link type is Page'
          }
          return true
        }),
    }),
    defineField({
      name: 'post',
      title: 'Post',
      type: 'reference',
      to: [{ type: 'post' }],
      hidden: ({ parent }) => parent?.linkType !== 'post',
      validation: (rule) =>
        rule.custom((value, context) => {
          const parent = context.parent as { linkType?: string } | undefined
          if (parent?.linkType === 'post' && !value) {
            return 'Post reference is required when link type is Post'
          }
          return true
        }),
    }),
    defineField({
      name: 'openInNewTab',
      title: 'Open in new tab',
      type: 'boolean',
      initialValue: false,
    }),
  ],
})
