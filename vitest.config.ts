/// <reference types="vitest" />

import { coverageConfigDefaults, defaultExclude, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [],
  test: {
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['clover', 'html', 'lcov'],
      include: ['src/core/version.ts', 'src/core/tags.ts', 'src/core/repo.ts', 'src/commands/bump.ts'],
      exclude: [
        ...coverageConfigDefaults.exclude,
      ],
    },
    exclude: defaultExclude,
  },
})
