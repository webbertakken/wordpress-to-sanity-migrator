import { defineType } from 'sanity'

/**
 * Plain horizontal-rule-style separator.
 *
 * Has no fields — its presence in `blockContent` is the value. Renderers
 * decide how to display it (a thin rule, extra whitespace, an ornament, etc.).
 */
export const divider = defineType({
  name: 'divider',
  title: 'Divider',
  type: 'object',
  fields: [],
  preview: {
    prepare: () => ({ title: '———' }),
  },
})
