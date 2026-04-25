import { DocumentIcon } from '@sanity/icons'
import { defineField, defineType } from 'sanity'

/**
 * Static page document — produced by the migrator from WordPress pages.
 *
 * The canonical schema covers only what the migrator populates. Studios are
 * free to add their own fields (page builders, additional sections, etc.).
 */
export const page = defineType({
  name: 'page',
  title: 'Page',
  type: 'document',
  icon: DocumentIcon,
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'name',
        maxLength: 96,
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'heading',
      title: 'Heading',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'subheading',
      title: 'Subheading',
      type: 'string',
    }),
  ],
  preview: {
    select: { title: 'name', subtitle: 'heading' },
  },
})
