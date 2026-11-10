import { fileURLToPath } from 'node:url'
import { defaultExclude, defineConfig } from 'vitest/config'

export default defineConfig({
  // @relizy/core is read from its sources
  resolve: {
    alias: {
      '@relizy/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    globals: true,
    // Nx forces the colors of the tasks it runs: the tests of the output expect none
    env: { FORCE_COLOR: '0' },
    silent: process.env.CI ? 'passed-only' : false,
    setupFiles: ['./vitest.setup.ts'],
    exclude: [...defaultExclude, '.claude/**'],
  },
})
