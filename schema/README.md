# Canonical migration schema

This directory is the **source of truth for the shape this migrator produces**.

The migrator transforms WordPress content into a sequence of Portable Text blocks plus a small set
of well-known custom types. Any target Sanity studio that wants to import that content must define a
schema compatible with these types.

The directory contains two parallel things:

| Path                                | Purpose                                                                                    | Audience                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| [`types.ts`](./types.ts)            | Hand-written TypeScript types describing the shapes the migrator emits.                    | Imported by the migrator's own source code.                        |
| [`sanity-studio/`](./sanity-studio) | Drop-in Sanity schema definition files (`defineType`, `defineField`, `defineArrayMember`). | Copy or symlink into your target studio's `schemaTypes` directory. |

The two are **kept in sync by hand**. Changing one requires changing the other in the same commit.

## Block content

The canonical `blockContent` array supports the following members:

| `_type`   | Use for                                                                                                                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `block`   | Text — paragraphs, headings (`h1`–`h6`), `blockquote`, bullet/number lists. Standard inline marks (`strong`, `em`, `code`, `underline`, `strike-through`) plus a `link` annotation that can point at a URL or to another `page` / `post` document. |
| `image`   | Image asset with `alt`, `caption` and `alignment` (`left` / `center` / `right`).                                                                                                                                                                   |
| `audio`   | Audio asset with title, description, duration, controls and autoplay flags.                                                                                                                                                                        |
| `video`   | Embedded or hosted video (YouTube, Vimeo or direct URL) with title, description and aspect ratio.                                                                                                                                                  |
| `divider` | Plain horizontal rule. No fields — its presence is the value.                                                                                                                                                                                      |
| `embed`   | Generic third-party embed (URL + optional caption). Use for iframes that aren't covered by `video`.                                                                                                                                                |

## Documents

The migrator emits two document types:

| `_type` | Required fields               | Optional fields                        |
| ------- | ----------------------------- | -------------------------------------- |
| `post`  | `title`, `slug`, `coverImage` | `content`, `excerpt`, `date`, `author` |
| `page`  | `name`, `slug`, `heading`     | `subheading`                           |

Studio-specific fields (page builders, callouts, custom layouts, references to `person` etc.) are
not part of the canonical schema. Studios are free to add them on top — the migrator simply will not
populate them.

## Adopting in a target studio

1. Copy [`sanity-studio/`](./sanity-studio) (or its individual files) into your studio's schema
   directory.
2. Make sure the types are exported from your studio's schema entry point.
3. Run `sanity typegen generate` in your studio.
4. Optionally place the resulting `sanity.types.ts` at `input/sanity.types.ts` in this repo to opt
   in to per-studio compatibility checks (see `src/__tests__/studio-compatibility.test.ts`).

## Versioning policy

The canonical schema is **additive**: new block types and new optional fields may be introduced
freely. Breaking changes (renamed fields, removed types, changed validation) require a major version
bump and a documented migration path.
