/// <reference types="vitest" />

import { coverageConfigDefaults, defaultExclude, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [],
  test: {
    globals: true,
    silent: process.env.CI ? 'passed-only' : false,
    // The tests of the packages run together, so the coverage thresholds cover all of them
    projects: ['./packages/*'],
    coverage: {
      provider: 'v8',
      reporter: process.env.CI
        ? ['lcov']
        : ['html', 'lcov', 'text', 'text-summary'],
      include: ['packages/*/src/**/*'],
      exclude: [
        ...coverageConfigDefaults.exclude,
        '.claude/**',
        'packages/relizy/src/cli.ts',
        'packages/core/src/types.ts',
        '**/*/index.ts',
        'packages/relizy/src/types.ts',
        'packages/relizy/src/commands/__tests__/*',
        'packages/*/src/**/*.md',
      ],
      thresholds: {
        statements: 95,
        functions: 95,
        branches: 90,
        lines: 95,
      },
    },
    exclude: [...defaultExclude, '.claude/**'],
  },
})
