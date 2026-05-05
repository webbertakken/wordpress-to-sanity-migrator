#!/usr/bin/env node
/**
 * Run the studio compatibility check.
 *
 * - If `input/sanity.types.ts` is absent, print a notice and exit 0.
 * - Otherwise invoke `tsc --noEmit` against
 *   `schema/studio-compatibility/tsconfig.json`. Exits with the tsc status.
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const studioTypesPath = path.join(repoRoot, 'input/sanity.types.ts')
const projectPath = path.join(repoRoot, 'schema/studio-compatibility/tsconfig.json')

if (!existsSync(studioTypesPath)) {
  console.log(
    [
      'No input/sanity.types.ts found — skipping studio compatibility check.',
      '',
      'To enable, run `sanity typegen generate` in your target studio and',
      'copy the resulting sanity.types.ts to input/sanity.types.ts here.',
      '',
      'See schema/studio-compatibility/README.md for details.',
    ].join('\n'),
  )
  process.exit(0)
}

console.log('Checking canonical schema against input/sanity.types.ts...')

const result = spawnSync('yarn', ['tsc', '--noEmit', '-p', projectPath], {
  stdio: 'inherit',
  cwd: repoRoot,
})

if ((result.status ?? 1) === 0) {
  console.log('OK — canonical types are structurally accepted by the studio.')
  process.exit(0)
}

console.error(
  '\nIncompatibility — see TypeScript errors above. The canonical migration\n' +
    'output cannot be imported into this studio as-is. Either update the\n' +
    'studio schema (see schema/sanity-studio/) or open an issue.',
)
process.exit(result.status ?? 1)
