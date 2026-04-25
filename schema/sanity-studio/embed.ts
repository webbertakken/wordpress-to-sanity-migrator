import { defineField, defineType } from 'sanity'

/**
 * Generic third-party embed.
 *
 * Use this for iframes that are not covered by the more specific `video`
 * type — Spotify, Twitter, CodePen, custom embeds, etc. The renderer decides
 * how to handle the URL (e.g. by sniffing the host or using oEmbed).
 */
export const embed = defineType({
  name: 'embed',
  title: 'Embed',
  type: 'object',
  fields: [
    defineField({
      name: 'url',
      title: 'URL',
      type: 'url',
      description: 'Full URL of the resource to embed.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'caption',
      title: 'Caption',
      type: 'string',
      description: 'Optional caption rendered alongside the embed.',
    }),
  ],
  preview: {
    select: { title: 'caption', subtitle: 'url' },
    prepare: ({ title, subtitle }) => ({
      title: title || 'Embed',
      subtitle: subtitle || 'No URL',
    }),
  },
})
