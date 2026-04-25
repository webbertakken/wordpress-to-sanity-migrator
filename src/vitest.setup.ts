import { vi } from 'vitest'

// Add any global test setup here
vi.mock('child_process', () => ({
  exec: vi.fn<typeof import('child_process').exec>(),
}))

// Pre-load jsdom to speed up tests that use htmlToBlockContent
// This avoids the dynamic import delay in each test
import('jsdom').then(() => {
  console.log('JSDOM pre-loaded for tests')
})
