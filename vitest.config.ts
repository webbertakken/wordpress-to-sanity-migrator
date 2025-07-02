/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    reporters: ['verbose'],
    testTimeout: 20000, // Increase timeout for tests with dynamic imports
    hookTimeout: 20000,
  },
})
