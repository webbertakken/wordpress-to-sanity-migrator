import { defineArrayMember, defineField, defineType } from 'sanity'

/**
 * Canonical rich-text array used for `post.content` and similar fields.
 *
 * Members:
 * - `block`   — text (paragraphs, headings, blockquote, lists) with
 *               default decorators and a `link` annotation.
 * - `image`   — inline image with alt, caption and alignment.
 * - `audio`   — inline audio asset with playback controls.
 * - `video`   — embedded or hosted video with optional caption + aspect ratio.
 * - `divider` — horizontal-rule-style separator (no fields).
 * - `embed`   — generic third-party embed (URL + caption).
 */
export const blockContent = defineType({
  name: 'blockContent',
  title: 'Block content',
  type: 'array',
  of: [
    // Text — paragraphs, headings, blockquote, lists. Default decorators
    // (strong, em, code, underline, strike-through) are produced by the
    // migrator and expected to be valid in the target schema.
    defineArrayMember({
      type: 'block',
      marks: {
        annotations: [{ type: 'link' }],
      },
    }),

    // Inline image with alt, caption and alignment.
    defineArrayMember({
      type: 'image',
      options: { hotspot: true },
      fields: [
        defineField({
          name: 'alt',
          title: 'Alternative text',
          type: 'string',
          description: 'Important for SEO and accessibility.',
        }),
        defineField({
          name: 'caption',
          title: 'Caption',
          type: 'string',
          description: 'Optional caption rendered with the image.',
        }),
        defineField({
          name: 'alignment',
          title: 'Alignment',
          type: 'string',
          description: 'How the image is laid out within the surrounding flow.',
          options: {
            list: [
              { title: 'Left', value: 'left' },
              { title: 'Center', value: 'center' },
              { title: 'Right', value: 'right' },
            ],
            layout: 'radio',
          },
        }),
      ],
    }),

    // Inline audio asset.
    defineArrayMember({
      type: 'object',
      name: 'audio',
      title: 'Audio',
      fields: [
        defineField({
          name: 'audioFile',
          title: 'Audio file',
          type: 'file',
          options: { accept: 'audio/*' },
        }),
        defineField({
          name: 'title',
          title: 'Title',
          type: 'string',
          description: 'Title for the audio clip.',
        }),
        defineField({
          name: 'description',
          title: 'Description',
          type: 'text',
          description: 'Optional description for the audio clip.',
        }),
        defineField({
          name: 'duration',
          title: 'Duration',
          type: 'string',
          description: 'Duration of the audio (e.g. "3:45").',
        }),
        defineField({
          name: 'showControls',
          title: 'Show audio controls',
          type: 'boolean',
          description: 'Whether to show play/pause controls.',
          initialValue: true,
        }),
        defineField({
          name: 'autoplay',
          title: 'Autoplay',
          type: 'boolean',
          description: 'Whether to autoplay the audio (not recommended for accessibility).',
          initialValue: false,
        }),
      ],
      preview: {
        select: { title: 'title', audioFile: 'audioFile', duration: 'duration' },
        prepare: ({ title, audioFile, duration }) => ({
          title: title || 'Audio',
          subtitle: `${audioFile?.originalFilename || 'No file'}${
            duration ? ` (${duration})` : ''
          }`,
        }),
      },
    }),

    // Inline video — YouTube, Vimeo or direct URL.
    defineArrayMember({
      type: 'object',
      name: 'video',
      title: 'Video',
      fields: [
        defineField({
          name: 'videoType',
          title: 'Video type',
          type: 'string',
          options: {
            list: [
              { title: 'YouTube', value: 'youtube' },
              { title: 'Vimeo', value: 'vimeo' },
              { title: 'Direct URL', value: 'url' },
            ],
            layout: 'radio',
          },
          initialValue: 'youtube',
        }),
        defineField({
          name: 'url',
          title: 'Video URL',
          type: 'url',
          description: 'Full URL to the video (YouTube, Vimeo, or direct video URL).',
          validation: (rule) => rule.required(),
        }),
        defineField({
          name: 'title',
          title: 'Title',
          type: 'string',
          description: 'Title for the video.',
        }),
        defineField({
          name: 'description',
          title: 'Description',
          type: 'text',
          description: 'Optional description for the video.',
        }),
        defineField({
          name: 'aspectRatio',
          title: 'Aspect ratio',
          type: 'string',
          options: {
            list: [
              { title: '16:9 (Widescreen)', value: '16:9' },
              { title: '4:3 (Standard)', value: '4:3' },
              { title: '1:1 (Square)', value: '1:1' },
              { title: '9:16 (Vertical)', value: '9:16' },
            ],
          },
          initialValue: '16:9',
        }),
      ],
      preview: {
        select: { title: 'title', url: 'url', videoType: 'videoType' },
        prepare: ({ title, url, videoType }) => ({
          title: title || 'Video',
          subtitle: `${videoType?.toUpperCase() || 'VIDEO'}: ${url || 'No URL'}`,
        }),
      },
    }),

    // Divider and embed are registered as standalone object types
    // (see ./divider.ts and ./embed.ts) and referenced by name here.
    defineArrayMember({ type: 'divider' }),
    defineArrayMember({ type: 'embed' }),
  ],
})
