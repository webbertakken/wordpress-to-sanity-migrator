import '@testing-library/jest-dom/vitest'

// Pre-load jsdom to speed up tests that use htmlToBlockContent.
import('jsdom').then(() => {
  console.log('JSDOM pre-loaded for tests')
})

// Force prefers-color-scheme: dark for any UI-driven test paths.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('dark'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}
