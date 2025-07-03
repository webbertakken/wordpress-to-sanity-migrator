import { vi } from 'vitest'

// Add any global test setup here
vi.mock('child_process', () => ({
  exec: vi.fn(),
}))

// Pre-load jsdom to speed up tests that use htmlToBlockContent
// This avoids the dynamic import delay in each test
import('jsdom').then(() => {
  console.log('JSDOM pre-loaded for tests')
})
