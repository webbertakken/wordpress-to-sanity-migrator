import { vi } from 'vitest'

// Add any global test setup here
vi.mock('child_process', () => ({
  exec: vi.fn(),
}))
