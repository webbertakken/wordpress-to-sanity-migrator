# Drop-in Sanity studio schema

These are the canonical Sanity schema definitions that match the shape this migrator produces. Copy
them (or symlink them) into your studio's `sanity/schemaTypes/` directory and register them from
your studio's schema entry point.

The files import `defineType`, `defineField` and `defineArrayMember` from the `sanity` package. They
are intentionally **not** type-checked or built as part of this repository — the migrator does not
depend on the `sanity` package at runtime.

## Files

| File              | Type         | Purpose                                                                                                                      |
| ----------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`        | re-exports   | Single import point — register this in your studio's `schema.types`.                                                         |
| `blockContent.ts` | object array | The rich-text array used for `post.content` etc. Includes `block`, `image`, `audio`, `video`, `divider` and `embed` members. |
| `link.ts`         | object       | Annotation type used by `block` for hyperlinks. Supports URL, page reference and post reference.                             |
| `divider.ts`      | object       | Plain horizontal-rule marker — no fields.                                                                                    |
| `embed.ts`        | object       | Generic third-party embed (URL + caption).                                                                                   |
| `post.ts`         | document     | Blog post document.                                                                                                          |
| `page.ts`         | document     | Static page document.                                                                                                        |

## Register

```ts
// sanity/schemaTypes/index.ts (in your studio)
import { schemaTypes as canonical } from './canonical'

export const schemaTypes = [
  ...canonical,
  // your own types on top
]
```

## Extending vs replacing

These types are an **additive baseline**. You can:

- Add fields to `post` / `page` (e.g. `tags`, `author`) — the migrator simply won't populate them.
- Add fields to media types (e.g. `credit` on `image`) — same.
- Add new block types alongside the canonical ones.
- Add document types unrelated to migration (`person`, `settings`, etc.).

You **should not**:

- Rename or remove the existing fields — that breaks compatibility with imports the migrator
  generates.
- Tighten validation in ways that conflict with the migrator's output (e.g. marking
  `audioFile.asset` required before assets are uploaded).
