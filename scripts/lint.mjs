#!/usr/bin/env node
/**
 * Lint runner.
 *
 * Wraps `oxlint` because oxlint walks up the directory tree looking for
 * `.gitignore` files and applies them as ignore filters. When a developer
 * has a global-style `~/.gitignore` (e.g. `* / !Setup/ ...`), oxlint sees
 * the entire repo as ignored and reports "No files found to lint", even
 * with `--no-ignore` (that flag only disables ESLint-style ignore files,
 * not gitignore lookup).
 *
 * Workaround: enumerate the source files we care about with Node's native
 * `globSync` and pass them to oxlint as positional arguments. oxlint always
 * lints any file it is told to lint explicitly, regardless of gitignore.
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { globSync } from 'node:fs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Source globs lint covers. Mirrors the include/exclude intent of the main
// `tsconfig.json` (and excludes `schema/sanity-studio/` and
// `schema/studio-compatibility/`, which import from packages that are not
// dependencies of this repo).
const PATTERNS = [
  'src/**/*.{ts,tsx,js,jsx,mjs,cjs}',
  'schema/types.ts',
  'scripts/**/*.{js,mjs,cjs}',
  '*.{js,mjs,cjs,ts}',
]

const files = [...new Set(PATTERNS.flatMap((pattern) => globSync(pattern, { cwd: repoRoot })))]

if (files.length === 0) {
  console.error('No source files matched any of the lint patterns:')
  for (const pattern of PATTERNS) console.error(`  ${pattern}`)
  process.exit(1)
}

const oxlintBin = path.join(repoRoot, 'node_modules/oxlint/bin/oxlint')
const args = [oxlintBin, ...files, ...process.argv.slice(2)]

const child = spawn(process.execPath, args, { stdio: 'inherit', cwd: repoRoot })
child.on('close', (code) => process.exit(code ?? 1))
