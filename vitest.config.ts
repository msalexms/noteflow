import { defineConfig } from 'vitest/config'

// Tests live in tests/ (outside src/ and electron/) so they never leak into
// dist/ or dist-electron/. The covered logic is node-safe, so we run in the
// node environment with no jsdom/coverage deps.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
})
