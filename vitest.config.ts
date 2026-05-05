import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
    globals: true,
    css: true,
    exclude: ['**/e2e/**', '**/node_modules/**'],
    silent: false,
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      // `lcov` is what Codecov consumes; the rest are for local viewing.
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.d.ts',
        '**/__tests__/**',
        'src/vitest.setup.ts',
        'src/types/**',
        'src/app/layout.tsx',
        'next.config.ts',
        'next-env.d.ts',
        'postcss.config.mjs',
        'input/**',
        'schema/sanity-studio/**',
        'scripts/**',
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
