# Studio compatibility check

An opt-in **compile-time** check that the canonical migration types fit the schema of a specific
target studio.

The migrator ships canonical types in [`schema/types.ts`](../types.ts). Any target studio defines
its own schema (and generates its own `sanity.types.ts` via `sanity typegen generate`). This check
verifies the two are structurally compatible — if they are not, importing migrator output into that
studio would fail at run-time on schema validation.

## How to use

1. In your target studio, run:

   ```sh
   sanity typegen generate
   ```

2. Copy the resulting `sanity.types.ts` to `input/sanity.types.ts` in this repository (the path is
   gitignored — it is per-developer).

3. Run:

   ```sh
   yarn verify-studio
   ```

   - If `input/sanity.types.ts` does not exist, the script prints a "skipping" notice and exits
     successfully.
   - Otherwise it runs `tsc --noEmit` against `check.ts` here, which declares assignments from each
     canonical type to its studio counterpart. Any mismatch surfaces as a TypeScript error pointing
     at the exact field that differs.

## Why it lives in its own directory

This file imports from `input/sanity.types.ts`, which only exists when the developer has opted in.
If it lived under the main TypeScript include path the build would break for everyone else. A
separate [`tsconfig.json`](./tsconfig.json) scopes the typecheck to just this sub-directory, and the
main `tsconfig.json` excludes `schema/studio-compatibility/`.
