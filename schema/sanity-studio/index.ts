/**
 * Canonical schema entry point — register this in your studio.
 *
 * Spread `schemaTypes` into your studio's own schema array:
 *
 *     export const schemaTypes = [
 *       ...canonicalSchemaTypes,
 *       // your own types here
 *     ]
 */

import { blockContent } from './blockContent'
import { divider } from './divider'
import { embed } from './embed'
import { link } from './link'
import { page } from './page'
import { post } from './post'

export const schemaTypes = [
  // Documents
  post,
  page,
  // Reusable objects
  blockContent,
  link,
  divider,
  embed,
]

export { blockContent, divider, embed, link, page, post }
