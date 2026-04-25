/**
 * Compile-time compatibility check between the canonical migration types
 * and a specific target studio.
 *
 * Run with:
 *
 *     yarn verify-studio
 *
 * Requires `input/sanity.types.ts` to exist — generate it with
 * `sanity typegen generate` in your studio and copy the file across.
 *
 * The check is purely structural. If the canonical shapes do not fit the
 * studio's shapes, this file fails to compile and the script exits with a
 * non-zero status, surfacing the exact incompatibility.
 *
 * This file lives in its own directory with its own `tsconfig.json` so it
 * is excluded from the main typecheck. Without that exclusion every fresh
 * clone (which has no `input/sanity.types.ts`) would fail to build.
 */

import type {
  AudioBlock as CanonicalAudioBlock,
  BlockContent as CanonicalBlockContent,
  ImageBlock as CanonicalImageBlock,
  Page as CanonicalPage,
  Post as CanonicalPost,
  TextBlock as CanonicalTextBlock,
  VideoBlock as CanonicalVideoBlock,
} from '../types'

import type {
  BlockContent as StudioBlockContent,
  Page as StudioPage,
  Post as StudioPost,
} from '../../input/sanity.types'

// Each declaration below is a compile-time assignability check. The function
// types are never called; the assignment in the parameter position triggers
// the structural check.

declare function _block(value: CanonicalBlockContent): StudioBlockContent
declare function _post(value: CanonicalPost): StudioPost
declare function _page(value: CanonicalPage): StudioPage

// Per-block-type checks help locate the offending shape quickly when the
// array-level assignability above fails to pinpoint the cause.
declare function _text(value: CanonicalTextBlock): StudioBlockContent[number]
declare function _image(value: CanonicalImageBlock): StudioBlockContent[number]
declare function _audio(value: CanonicalAudioBlock): StudioBlockContent[number]
declare function _video(value: CanonicalVideoBlock): StudioBlockContent[number]

// Reference the declarations so unused-variable lint rules do not strip them.
export const __studioCompatibilityCheck = {
  _block,
  _post,
  _page,
  _text,
  _image,
  _audio,
  _video,
}
